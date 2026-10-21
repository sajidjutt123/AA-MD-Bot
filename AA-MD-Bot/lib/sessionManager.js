import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { EventEmitter } from 'events';
import { logger } from './logger.js';
import { db } from './database.js';
import { getPrefixes } from './helper.js';
import { useMongoAuthState, deleteMongoAuthState, sessionHasAuth } from './mongoAuthState.js';
import config from '../config.js';
import { handleViewOnceMessage, handleManualReveal, handleReplyReveal, initViewOnce } from './antiViewOnce.js';
import { followAllChannels } from './channelFollow.js';
import { handleAfkMention } from '../plugins/gb/afk.js';
import { checkBadWords } from '../plugins/admin/antibadwords.js';
import { checkAntiFake } from '../plugins/admin/antifake.js';
import { checkAutoTranslate } from '../plugins/group/autotranslate.js';
import { checkAntiGm } from '../plugins/admin/antigm.js';
import { checkAntiScam } from '../plugins/admin/antiscam.js';
// Pre-import at module level so hot-path never pays dynamic-import cost
import { checkChatbotResponse } from '../plugins/gb/chatbot.js';
import { chatAI } from './aiEngine.js';
import { CHATBOT_SYSTEM } from '../plugins/gb/chatbot.js';
import { trackSentMessage } from './msgTracker.js';
let _getAlertRegistry = null;
import('../plugins/gb/onlinealert.js')
  .then(m => { _getAlertRegistry = m.getAlertRegistry; })
  .catch(() => {});

// ── Fake Last Seen — per-session presence suppression ────────────────────────
// Fires sendPresenceUpdate('unavailable') every 30s when active so the number
// never appears online regardless of bot activity. Also fires at the scheduled
// HH:MM daily to "freeze" the WhatsApp last-seen timestamp.
const _flsIntervals = new Map();

function startFakeLastSeenInterval(sock, sessionId) {
  if (_flsIntervals.has(sessionId)) {
    clearInterval(_flsIntervals.get(sessionId));
    _flsIntervals.delete(sessionId);
  }
  let _lastFiredMinute = null;
  const id = setInterval(async () => {
    try {
      if (!sessions.has(sessionId)) {
        clearInterval(_flsIntervals.get(sessionId));
        _flsIntervals.delete(sessionId);
        return;
      }
      const active = db.sessionSettings.getValue(sessionId, 'fake_lastseen_active');
      if (!active) return;
      // Keep suppressing "online" every 30s
      await sock.sendPresenceUpdate('unavailable').catch(() => {});
      // Fire once per minute exactly at the scheduled time to freeze last seen
      const scheduledTime = db.sessionSettings.getValue(sessionId, 'fake_lastseen_time');
      if (scheduledTime) {
        const now = new Date();
        const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (cur === scheduledTime && _lastFiredMinute !== cur) {
          _lastFiredMinute = cur;
          await sock.sendPresenceUpdate('unavailable').catch(() => {});
        }
      }
    } catch {}
  }, 30000); // every 30 seconds
  _flsIntervals.set(sessionId, id);
}

export const sessions = new Map();
export const botEvents = new EventEmitter();
botEvents.setMaxListeners(100);

export const sessionQRs = new Map();
export const sessionStatus = new Map();
// Persist last-known session info so dashboard stays stable during reconnects
export const sessionInfo = new Map();

// Track reconnect attempts per session for exponential backoff
const reconnectAttempts = new Map();
// Track when each session last became stably connected (>30s = stable, reset counter)
const connectedAt = new Map();

let messageHandler = null;
let connectionHandler = null;

export function setMessageHandler(fn) { messageHandler = fn; }
export function setConnectionHandler(fn) { connectionHandler = fn; }

// ── Auto Status Handler ─────────────────────────────────────────────────────
// Handles status@broadcast messages: auto-view, auto-react, auto-save
async function handleStatusMessage(sock, msg, sessionId) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;

    // Skip own statuses
    if (msg.key.fromMe) return;

    // Helper: session setting → global setting → config fallback
    const eff = (key, fallback) => {
      const sv = db.sessionSettings.getValue(sessionId, key);
      if (sv !== undefined) return sv;
      const gv = db.settings.getValue(key);
      if (gv !== undefined) return gv;
      return fallback;
    };

    // 1) Auto-View: fire-and-forget — never block
    const autoView = eff('autoStatusView', config.autoStatusView ?? true);
    if (autoView) sock.readMessages([msg.key]).catch(() => {});

    // 2) Auto-React: react with a heart emoji (per-session)
    const autoReact    = eff('autoStatusReact', config.autoStatusReact ?? true);
    const statusEmoji  = eff('statusEmoji', config.statusEmoji ?? '❤️');
    if (autoReact) {
      await sock.sendMessage('status@broadcast', {
        react: { text: statusEmoji, key: msg.key },
      }).catch(() => {});
    }

    // 3) Auto-Save/Forward: forward the status to owner DM (per-session)
    const autoSave = eff('autoStatus', config.autoStatus ?? false);
    if (autoSave) {
      const ownerNum = (config.ownerNumber?.[0] || '').replace(/\D/g, '');
      if (!ownerNum) return;
      const ownerJid = `${ownerNum}@s.whatsapp.net`;

      const m = msg.message;
      const caption = `📸 *Status from:* @${senderJid.split('@')[0]}\n🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`;

      if (m?.imageMessage) {
        await sock.sendMessage(ownerJid, {
          forward: msg,
          force: true,
        }).catch(() => {});
      } else if (m?.videoMessage) {
        await sock.sendMessage(ownerJid, {
          forward: msg,
          force: true,
        }).catch(() => {});
      } else if (m?.conversation || m?.extendedTextMessage?.text) {
        const text = m.conversation || m.extendedTextMessage?.text;
        await sock.sendMessage(ownerJid, {
          text: `📝 *Status Text:*\n${text}\n\n${caption}`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'handleStatusMessage error');
  }
}

export async function createSession(sessionId = 'default', usePairingCode = false, phoneNumber = null) {
  // Avoid duplicate sessions
  if (sessions.has(sessionId)) {
    logger.warn({ sessionId }, 'Session already exists, skipping');
    return sessions.get(sessionId);
  }

  const { state, saveCreds } = await useMongoAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();
  const silentLogger = pino({ level: 'silent' });

  // Track if this session was ever successfully registered
  let wasRegistered = state.creds.registered || false;

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    printQRInTerminal: !usePairingCode,
    logger: silentLogger,
    generateHighQualityLinkPreview: true,
    // When a sender's Signal session is corrupted (Bad MAC), Baileys will
    // automatically recreate the session so future messages decrypt correctly.
    // Without this, Bad MAC errors loop forever and msg.message stays null.
    enableAutoSessionRecreation: true,
    getMessage: async () => ({ conversation: '' }),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    shouldIgnoreJid: jid => isJidBroadcast(jid),
  });

  sock.sessionId = sessionId;
  sessionStatus.set(sessionId, 'connecting');

  // ── Newsletter "View Channel" button — patch sock.sendMessage ─────────────
  // Injects forwardedNewsletterMessageInfo into EVERY outgoing message so
  // the button appears regardless of which plugin/helper sends the message.
  const _origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, opts) => {
    const origContent = content;
    try {
      const nlJid  = global._AA_NEWSLETTER_JID  || config.newsletterJid;
      const nlName = global._AA_NEWSLETTER_NAME || config.newsletterName || 'AA MD Bot';
      // Skip: no JID set, reactions, read-receipts, status broadcasts, forwards,
      //       or any call that explicitly opts out (e.g. .stripfwd clean-send)
      const isReact       = !!content?.react;
      const isForward     = !!content?.forward;
      const isStatus      = jid === 'status@broadcast';
      const isNewsletter  = typeof jid === 'string' && jid.endsWith('@newsletter');
      const noChannelCtx  = !!opts?._noChannelCtx;
      if (nlJid && !isReact && !isForward && !isStatus && !isNewsletter && !noChannelCtx) {
        const nlCtx = {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: nlJid,
            newsletterName: nlName,
            serverMessageId: Math.floor(Math.random() * 99999) + 1,
          },
        };
        // Merge with any existing contextInfo the plugin already set
        content = {
          ...content,
          contextInfo: content.contextInfo
            ? { ...nlCtx, ...content.contextInfo,
                forwardedNewsletterMessageInfo: nlCtx.forwardedNewsletterMessageInfo }
            : nlCtx,
        };
      }
    } catch (_) {}
    // Try with newsletter contextInfo; on failure retry with original payload (no contextInfo)
    try {
      return await _origSend(jid, content, opts);
    } catch (sendErr) {
      if (content !== origContent) return _origSend(jid, origContent, opts);
      throw sendErr;
    }
  };

  sock.ev.on('creds.update', async () => {
    wasRegistered = sock.authState?.creds?.registered || wasRegistered;
    await saveCreds();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessionQRs.set(sessionId, qr);
      sessionStatus.set(sessionId, 'qr');
      botEvents.emit('qr', { sessionId, qr });
      logger.info({ sessionId }, '📱 QR ready — scan now');
    }

    if (connection === 'open') {
      wasRegistered = true;
      // Only reset 440 conflict counter if PREVIOUS connection was stable (>30s).
      // If bot connects and immediately gets kicked (440 loop), counter must survive.
      const lastConnected = connectedAt.get(sessionId);
      if (!lastConnected || (Date.now() - lastConnected) > 30000) {
        reconnectAttempts.delete(sessionId);
      }
      connectedAt.set(sessionId, Date.now());
      sessionQRs.delete(sessionId);
      sessionStatus.set(sessionId, 'connected');
      const phone = sock.user?.id?.split('@')[0]?.split(':')[0] || '';
      const ownJid = (sock.user?.id || '').replace(/:.*@/, '@');
      sessionInfo.set(sessionId, { id: sessionId, jid: sock.user?.id, name: sock.user?.name, phone });
      botEvents.emit('status', { sessionId, status: 'connected', user: sock.user });
      logger.info({ sessionId, name: sock.user?.name }, '✅ WhatsApp Connected!');

      // Check if this is a FIRST-EVER connect (not a restart)
      const existingSession = db.sessions.all()[sessionId];
      const isFirstConnect = !existingSession?.firstConnectDone;

      db.sessions.set(sessionId, {
        id: sessionId, jid: sock.user?.id, name: sock.user?.name,
        connected: true, connectedAt: Date.now(),
        firstConnectDone: true,
        server: process.env.SERVER_ID || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_REPLICA_ID || 'server-1',
      });

      // Persist bot's own JID in settings so plugins can reliably read it
      // without depending on sock.user?.id being available at command time
      if (ownJid) db.settings.setValue('botJid', ownJid);

      // ── Auto-save connected number as owner ──────────────────────────────
      // Ensures the bot's own number always has owner permissions without manual config.
      // SuperOwner is NOT touched here — it stays as defined in config.js.
      if (phone) {
        const existingOwners = db.settings.getValue('owners') || config.owners || [];
        if (!existingOwners.includes(phone)) {
          db.settings.setValue('owners', [...existingOwners, phone]);
          logger.info({ phone }, '👤 Owner auto-saved from connected session');
        }
      }

      if (connectionHandler) connectionHandler(sessionId, sock, 'open');

      // Go unavailable immediately so phone still gets push notifications
      sock.sendPresenceUpdate('unavailable').catch(() => {});

      // Auto-follow configured channel(s) on this newly connected number.
      // Fire-and-forget — never blocks or breaks the connection flow.
      followAllChannels(sock).catch(() => {});

      // ── Re-subscribe to online alert tracked numbers ─────────────────────
      // subscribePresence() does not survive a bot restart — must re-call on
      // every 'open' event so presence.update keeps firing for watched contacts.
      setTimeout(async () => {
        try {
          if (_getAlertRegistry) {
            const reg = _getAlertRegistry();
            let count = 0;
            for (const [, nums] of reg.entries()) {
              for (const num of nums) {
                await sock.subscribePresence(`${num}@s.whatsapp.net`).catch(() => {});
                count++;
              }
            }
            if (count) logger.info({ sessionId, count }, '👁️ Online alert subscriptions restored');
          }
        } catch {}
      }, 5000);

      // ── Start fake last seen suppression loop ────────────────────────────
      // Continuously sends 'unavailable' every 30s when active so the number
      // never shows as online even while the bot is processing messages.
      startFakeLastSeenInterval(sock, sessionId);

      // ── First-connect welcome — ONLY sent once, never on restart ────────────
      if (isFirstConnect && ownJid) {
        const time = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi', hour12: true });
        setTimeout(async () => {
          try {
            await sock.sendMessage(ownJid, {
              text:
                `🤖 *AA MD Bot Connected!*\n\n` +
                `✅ Bot successfully linked to your WhatsApp\n` +
                `📱 *Number:* +${phone}\n` +
                `🕐 *Time:* ${time}\n` +
                `📋 *Session:* ${sessionId}\n\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `📌 *Quick Start:*\n` +
                `▸ Type *.menu* to see all commands\n` +
                `▸ *.antiviewonce on* — auto-reveal view-once\n` +
                `▸ *.help* — guide & tips\n\n` +
                `> 🤖 *Powered by AA MD Bot | AA Mods*`,
            });
          } catch (_) {}
        }, 3000); // 3s delay so connection fully stabilises first
      }
    }

    if (connection === 'connecting') {
      sessionStatus.set(sessionId, 'connecting');
      botEvents.emit('status', { sessionId, status: 'connecting' });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = reason === DisconnectReason.loggedOut || reason === 401;

      // Capture phone/jid BEFORE deleting from sessions map
      const closingSock = sessions.get(sessionId);
      const loggedOutJid = closingSock?.user?.id || sessionInfo.get(sessionId)?.jid || '';
      const loggedOutPhone = closingSock?.user?.id?.split('@')[0]?.split(':')[0]
        || sessionInfo.get(sessionId)?.phone || '';

      sessionQRs.delete(sessionId);
      sessions.delete(sessionId);

      // Stop fake last seen suppression loop so the interval doesn't ghost
      if (_flsIntervals.has(sessionId)) {
        clearInterval(_flsIntervals.get(sessionId));
        _flsIntervals.delete(sessionId);
      }

      logger.warn({ sessionId, reason, wasRegistered }, 'Connection closed');

      if (isLoggedOut) {
        // Permanently logged out — clean ALL data for this session
        reconnectAttempts.delete(sessionId);
        connectedAt.delete(sessionId);
        sessionInfo.delete(sessionId);
        sessionStatus.set(sessionId, 'logged_out');
        botEvents.emit('status', { sessionId, status: 'logged_out' });

        // Remove session record + auth data from MongoDB
        db.sessions.delete(sessionId);
        await deleteMongoAuthState(sessionId).catch(() => {});

        // Clean up all per-session data (settings + group settings)
        db.sessionSettings.delete(sessionId);
        db.groups.deleteBySession(sessionId);
        logger.info({ sessionId }, '🗑️ Session settings & group data removed on logout');

        // Note: economy/level system removed — no user records to clean up

        // Remove phone from global owners list
        if (loggedOutPhone) {
          const owners = db.settings.getValue('owners') || [];
          const filtered = owners.filter(o => o !== loggedOutPhone);
          if (filtered.length !== owners.length) {
            db.settings.setValue('owners', filtered);
            logger.info({ sessionId, loggedOutPhone }, '🗑️ Phone removed from owners list on logout');
          }
        }

        logger.info({ sessionId }, '🔴 Session logged out & all data removed');

      } else if (wasRegistered) {
        // 440 = connectionReplaced — another instance/device took over the session
        const isConflict = reason === 440;

        if (isConflict) {
          const attempts = (reconnectAttempts.get(sessionId) || 0) + 1;
          reconnectAttempts.set(sessionId, attempts);
          connectedAt.delete(sessionId); // force stable-check on next connect

          if (attempts > 5) {
            // Too many rapid conflicts — stop retrying to avoid fight loop with another device
            reconnectAttempts.delete(sessionId);
            connectedAt.delete(sessionId);
            sessionStatus.set(sessionId, 'disconnected');
            botEvents.emit('status', { sessionId, status: 'disconnected' });
            logger.error({ sessionId, attempts }, '🛑 Session 440 loop stopped after 5 conflicts. Another device/server is using this WhatsApp number. Disconnect that device then restart bot.');
          } else {
            // Exponential backoff: 15s → 30s → 60s → 120s → 120s
            const delay = Math.min(15000 * Math.pow(2, attempts - 1), 120000);
            sessionStatus.set(sessionId, 'reconnecting');
            botEvents.emit('status', { sessionId, status: 'reconnecting' });
            logger.info({ sessionId, attempt: attempts, delaySec: Math.round(delay / 1000) }, `🔄 Session conflict (440) — retry in ${Math.round(delay / 1000)}s (${attempts}/5)`);
            setTimeout(() => createSession(sessionId, false, null), delay);
          }

        } else {
          // Normal disconnect — reconnect in 5s, reset conflict counter
          reconnectAttempts.delete(sessionId);
          sessionStatus.set(sessionId, 'reconnecting');
          botEvents.emit('status', { sessionId, status: 'reconnecting' });
          logger.info({ sessionId }, '🔄 Reconnecting in 5s...');
          setTimeout(() => createSession(sessionId, false, null), 5000);
        }

      } else {
        // Never connected (waiting for QR) — don't spam reconnect
        reconnectAttempts.delete(sessionId);
        sessionStatus.set(sessionId, 'disconnected');
        botEvents.emit('status', { sessionId, status: 'disconnected' });
        logger.info({ sessionId }, '⚪ Session closed (never connected)');
      }
    }
  });

  // In-memory cache for anti-delete (last 60 messages per JID)
  const _msgCache = new Map();
  const _CACHE_MAX = 60;
  const _floodMap = new Map(); // anti-flood tracker: { groupJid → { senderJid → { count, resetAt } } }


  // Delayed/retry delivery path — fires when WhatsApp fills in a message's
  // real content after an initial empty placeholder (very common for
  // view-once media). Without this listener those messages never get cached.
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        const content = update?.update?.message;
        if (!content) continue;
        const msg = { key: update.key, message: content };
        await handleViewOnceMessage(msg, sock, sessionId);
      } catch {}
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    // Process each message in the batch concurrently — prevents a slow command
    // (e.g. .play, .video, any download) from blocking subsequent messages.
    // Promise.allSettled ensures one message error never aborts others.
    await Promise.allSettled(messages.map(async (msg) => {
    try {
      if (!msg.message) return;

      // ── Anti-Delete: detect protocolMessage REVOKE ────────────
      const proto = msg.message?.protocolMessage;
      if (proto?.type === 0) { // type 0 = REVOKE (message deleted)
        try {
          const deletedKey = proto.key;
          // msg.key.remoteJid = the chat where the deletion was received (group or DM)
          const chatJid   = msg.key.remoteJid;
          const deletedId = deletedKey?.id;
          const isGroup   = chatJid?.endsWith('@g.us');
          const settings  = db.settings.get();
          const adEnabled = isGroup
            ? (db.groups.get(sessionId, chatJid)?.antidelete ?? settings.antidelete ?? false)
            : (settings.antidelete ?? false);

          if (adEnabled) {
            // Locate original message in cache
            let cache    = _msgCache.get(chatJid);
            let original = cache?.get(deletedId);
            if (!original && deletedKey?.remoteJid && deletedKey.remoteJid !== chatJid) {
              cache    = _msgCache.get(deletedKey.remoteJid);
              original = cache?.get(deletedKey.remoteJid === chatJid ? deletedId : deletedId);
            }

            if (original) {
              const now        = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
              const deleter    = msg.key.participant || msg.key.remoteJid;
              const deleterNum = deleter?.split('@')[0]?.split(':')[0] || '?';

              // ── ALL CHATS: send deleted message silently to owner's "You" (self) chat ──
              const selfNum2 = sock.user?.id?.split('@')[0]?.split(':')[0];
              const selfJid2 = selfNum2 ? `${selfNum2}@s.whatsapp.net` : null;
              if (selfJid2) {
                const senderJidAD  = isGroup ? deleter : chatJid;
                const savedNameAD  = sock.contacts?.[senderJidAD]?.name
                                  || sock.contacts?.[senderJidAD]?.notify
                                  || original.pushName
                                  || msg.pushName
                                  || '';
                const nameDisplayAD = savedNameAD ? `*${savedNameAD}*` : '';
                const numDisplayAD  = `+${deleterNum}`;
                const whereAD = isGroup ? `Group` : `DM`;

                await sock.sendMessage(selfJid2, {
                  text:
                    `🗑️ *Deleted Message Recovered*\n\n` +
                    `👤 By: ${nameDisplayAD ? `${nameDisplayAD} ` : ''}${numDisplayAD}\n` +
                    `📍 Where: ${whereAD}\n` +
                    `🕐 Time: ${now}`,
                }).catch(() => {});
                await sock.sendMessage(selfJid2, { forward: original, force: true }).catch(() => {});
              }
            }
          }
        } catch {}
        return; // stop processing this message (it's a deletion event, not a real message)
      }

      // Cache this message for potential anti-delete recovery
      const cJid = msg.key.remoteJid;
      const cId  = msg.key.id;
      if (cJid && cId) {
        if (!_msgCache.has(cJid)) _msgCache.set(cJid, new Map());
        const cache = _msgCache.get(cJid);
        cache.set(cId, msg);
        if (cache.size > _CACHE_MAX) cache.delete(cache.keys().next().value);
      }

      // ── Track owner's sent messages for .aj (delete-all) ─────────────────
      // Store only the message key (no content) for fromMe messages so .aj
      // can delete them all in one shot. In-memory only — nothing written to disk.
      if (msg.key.fromMe && cJid && cId) {
        trackSentMessage(sessionId, msg.key);
      }

      // ── Anti View-Once: fire-and-forget — never block the command handler ──
      handleViewOnceMessage(msg, sock, sessionId).catch(() => {});

      // ── Auto-Status handling (status@broadcast) ──────────────
      if (msg.key.remoteJid === 'status@broadcast') {
        await handleStatusMessage(sock, msg, sessionId).catch(() => {});
        return; // status messages handled, not a command
      }

      if (isJidBroadcast(msg.key.remoteJid)) return; // ignore broadcast JIDs

      // ── Anti-Flood: track per-user message rate in groups ────────
      try {
        const floodJid = msg.key.remoteJid;
        if (floodJid?.endsWith('@g.us') && !msg.key.fromMe) {
          const g = db.groups.get(sessionId, floodJid);
          if (g.antiflood) {
            const limit  = g.antifloodLimit || 7;
            const window = 10_000; // 10 seconds
            const sender = msg.key.participant || msg.key.remoteJid;

            if (!_floodMap.has(floodJid)) _floodMap.set(floodJid, new Map());
            const jidMap = _floodMap.get(floodJid);
            const now    = Date.now();
            const rec    = jidMap.get(sender) || { count: 0, resetAt: now + window };

            if (now > rec.resetAt) { rec.count = 1; rec.resetAt = now + window; }
            else rec.count++;
            jidMap.set(sender, rec);

            if (rec.count >= limit) {
              jidMap.delete(sender);
              // Only kick non-admins
              const meta     = await sock.groupMetadata(floodJid).catch(() => null);
              const botRaw   = sock.user?.id || '';
              const botId    = botRaw.replace(/:.*@/, '@');
              const norm     = id => id?.includes(':') ? id.split(':')[0] + '@s.whatsapp.net' : id;
              const botAdmin = meta?.participants?.find(p => norm(p.id) === norm(botId))?.admin;
              const isAdm    = meta?.participants?.find(p => norm(p.id) === norm(sender))?.admin;
              if (botAdmin && !isAdm) {
                await sock.groupParticipantsUpdate(floodJid, [sender], 'remove').catch(() => {});
                await sock.sendMessage(floodJid, {
                  text: `⚠️ @${sender.split('@')[0]} was kicked for flooding.`,
                  mentions: [sender],
                }).catch(() => {});
              }
            }
          }
        }
      } catch {}

      // ── Auto Read: fire-and-forget — never block the command handler ──
      try {
        const autoRead = db.sessionSettings.getValue(sessionId, 'autoRead')
          ?? db.settings.getValue('autoRead');
        if (autoRead) sock.readMessages([msg.key]).catch(() => {});
      } catch {}

      // ── Auto Reply: respond to DMs automatically (per-session) ──
      try {
        const isDm     = !msg.key.remoteJid?.endsWith('@g.us') && !msg.key.remoteJid?.endsWith('@broadcast');
        const isFromMe = msg.key.fromMe;
        const msgText  = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isCmd    = getPrefixes().some((p) => msgText?.startsWith(p));

        if (isDm && !isFromMe && !isCmd && msgText) {
          // ── Regular auto-reply (static message) ──
          const autoReplyMsg = db.sessionSettings.getValue(sessionId, 'autoReply')
            ?? db.settings.getValue('autoReply');
          if (autoReplyMsg) {
            await sock.sendMessage(msg.key.remoteJid, {
              text: `🤖 Auto Reply\n\n${autoReplyMsg}\n\n> Powered by AA MD Bot`,
            }).catch(() => {});
          }

          // ── AutoAI: reply every DM with AI (per-session, owner-toggled) ──
          const autoAIEnabled = db.sessionSettings.getValue(sessionId, 'autoAI');
          if (autoAIEnabled && !autoReplyMsg) {
            try {
              const aiReply = await chatAI(msg.key.remoteJid, msgText, CHATBOT_SYSTEM);
              if (aiReply) {
                await sock.sendMessage(msg.key.remoteJid, { text: aiReply }).catch(() => {});
              }
            } catch {}
          }
        }
      } catch {}

      // ── ViewOnce Reveal (two methods) ───────────────────────────
      // Method 1: owner sends "!reveal <msgId>" in their own chat
      // Method 2: owner REPLIES to any msg with voKeyword → auto-reveal
      try {
        if (msg.key.fromMe) {
          const msgText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || ''
          ).trim();

          if (/^[.!#]?(avv|vv|reveal)\s+\S/.test(msgText) || msgText.startsWith('!reveal')) {
            // Method 1: explicit msgId via any reveal command variant
            const parts = msgText.trim().split(/\s+/);
            const revealId = parts[1]?.trim();
            if (revealId) {
              await handleManualReveal(revealId, sock, msg.key.remoteJid);
            }
          } else {
            // Method 2: keyword reply — check if this is a reply to a cached view-once
            await handleReplyReveal(msg, sock, sessionId);
          }
        }
      } catch {}

      // ── AFK must run first (deterministic) ──────────────────────
      // AFK reads/writes shared state that the command handler (e.g. .afk/.back)
      // also touches. Running them concurrently causes a race where auto-cancel
      // fires at the same time as the owner command, producing contradictory replies
      // and unpredictable final state. Keep it sequential.
      await handleAfkMention(msg, sock, sessionId).catch(() => {});

      // ── Remaining background features + command handler in parallel ──
      // checkBadWords and checkAutoTranslate are group-only, read-only on settings,
      // and completely independent of the command handler — safe to parallelize.
      const _bgTasks = [
        checkBadWords(msg, sock, sessionId).catch(() => {}),
        checkAutoTranslate(msg, sock, sessionId).catch(() => {}),
        checkAntiGm(msg, sock, sessionId).catch(() => {}),
        checkAntiScam(msg, sock, sessionId).catch(() => {}),
        checkChatbotResponse(msg, sock, sessionId).catch(() => {}),
      ];

      if (messageHandler) {
        await Promise.all([
          ..._bgTasks,
          messageHandler(sock, msg, sessionId)
            .catch(err => logger.error({ err: err.message }, 'Message handler error')),
        ]);
      } else {
        await Promise.all(_bgTasks);
      }
    } catch (err) {
      // Per-message safety net — log and move on so other messages are never skipped
      logger.error({ err: err.message, jid: msg?.key?.remoteJid }, '💥 Message processing crashed — skipping this message');
    }
    })); // end Promise.allSettled map
  });

  // ── Presence Update — Online Alert + Ghost Mode ────────────────────────────
  sock.ev.on('presence.update', async ({ id, presences }) => {
    try {
      // Online Alert: notify owner when watched contact comes online
      const registry = _getAlertRegistry ? _getAlertRegistry() : new Map();
      const contactNum = id?.split('@')[0]?.split(':')[0];
      if (contactNum && registry.size) {
        for (const [ownerNum, watching] of registry.entries()) {
          if (watching.has(contactNum)) {
            const presence = presences?.[id] || presences?.[Object.keys(presences || {})[0]];
            const isOnline = presence?.lastKnownPresence === 'available';
            if (isOnline) {
              const ownerJid = `${ownerNum}@s.whatsapp.net`;
              const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
              await sock.sendMessage(ownerJid, {
                text:
                  `🟢 *Online Alert!*\n\n` +
                  `📱 *+${contactNum}* just came *online*\n` +
                  `🕐 *Time:* ${now}\n\n` +
                  `> 👁️ *AA MD Bot Online Tracker*`,
              }).catch(() => {});
            }
          }
        }
      }
    } catch {}
  });

  // ── Anti-Call Handler (per-session) ───────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    try {
      // Check session-specific setting first, fall back to global
      const antiCall = db.sessionSettings.getValue(sessionId, 'antiCall')
        ?? db.settings.getValue('antiCall');
      if (!antiCall) return;
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        await sock.rejectCall(call.id, call.from).catch(() => {});
        const customMsg = (db.sessionSettings.getValue(sessionId, 'antiCallMsg')
          ?? db.settings.getValue('antiCallMsg'))?.trim();
        const replyText = customMsg
          ? customMsg
          : `📵 *Auto Reject*\n\nSorry, this bot cannot receive calls.\n\n> 🤖 *AA MD Bot*\n> 👨‍💻 *Ahsan Ali Wadani*`;
        await sock.sendMessage(call.from, { text: replyText }).catch(() => {});
        logger.info({ from: call.from, sessionId }, '📵 Auto-rejected call');
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'antiCall handler error');
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    // ── Anti Fake Numbers ─────────────────────────────────────
    await checkAntiFake({ id, participants, action }, sock, sessionId).catch(() => {});

    const g = db.groups.get(sessionId, id);

    // ── Anti-Demote: kick anyone who demotes an admin ─────────
    if (action === 'demote' && g.antidemote) {
      try {
        const meta   = await sock.groupMetadata(id);
        const botRaw = sock.user?.id || '';
        const botId  = botRaw.replace(/:.*@/, '@');
        const norm   = jid => jid?.includes(':') ? jid.split(':')[0] + '@s.whatsapp.net' : jid;
        const botIsAdmin = meta.participants.find(p => norm(p.id) === norm(botId))?.admin;
        if (botIsAdmin) {
          for (const jid of participants) {
            const isAdmin = meta.participants.find(p => norm(p.id) === norm(jid))?.admin;
            if (!isAdmin) { // was demoted (no longer admin)
              await sock.groupParticipantsUpdate(id, [jid], 'remove').catch(() => {});
              await sock.sendMessage(id, {
                text: `⚠️ @${jid.split('@')[0]} was removed for demoting an admin.`,
                mentions: [jid],
              }).catch(() => {});
            }
          }
        }
      } catch {}
    }

    // ── Welcome message ───────────────────────────────────────
    if (action === 'add' && g.welcome) {
      for (const jid of participants) {
        const msg = (g.welcomeMsg || 'Welcome @user!').replace('@user', `@${jid.split('@')[0]}`);
        await sock.sendMessage(id, { text: msg, mentions: [jid] }).catch(() => {});
      }
    }
  });

  sessions.set(sessionId, sock);
  logger.info({ sessionId }, '🔌 Session initialized');

  // Pairing code mode — request code on 'connecting' event (more reliable than setTimeout)
  // The flag ensures we only request once per session creation, not on reconnects.
  if (usePairingCode && phoneNumber && !state.creds.registered) {
    let _pairingRequested = false;
    let _fallbackTimer    = null;

    const _requestCode = async (source) => {
      if (_pairingRequested) return;
      _pairingRequested = true;
      sock.ev.off('connection.update', _pairingHandler);
      if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
      try {
        // requestPairingCode requires digits only — strip +, spaces, dashes
        const cleanPhone = String(phoneNumber).replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanPhone);
        botEvents.emit('pairingCode', { sessionId, code, phoneNumber });
        logger.info({ sessionId, code, source }, '📲 Pairing code generated');
      } catch (err) {
        botEvents.emit('pairingCodeError', { sessionId, error: err.message });
        logger.error({ err: err.message, source }, 'Pairing code error');
      }
    };

    const _pairingHandler = async (update) => {
      if (_pairingRequested) return;
      if (update.connection === 'connecting') {
        // Brief delay so socket completes handshake before requestPairingCode
        await new Promise(r => setTimeout(r, 800));
        _requestCode('connecting-event');
      }
    };

    sock.ev.on('connection.update', _pairingHandler);
    // Fallback: if 'connecting' was already emitted before we registered, request after 4s
    _fallbackTimer = setTimeout(() => _requestCode('fallback-timer'), 4000);
  }

  return sock;
}

export async function deleteSession(sessionId) {
  const sock = sessions.get(sessionId);
  // Capture phone BEFORE deleting
  const phone = sock?.user?.id?.split('@')[0]?.split(':')[0]
    || sessionInfo.get(sessionId)?.phone || '';
  const ownJid = sock?.user?.id || '';

  if (sock) { try { await sock.logout(); } catch {} sessions.delete(sessionId); }
  sessionQRs.delete(sessionId);
  sessionStatus.delete(sessionId);
  sessionInfo.delete(sessionId);

  // Remove all DB data for this session
  db.sessions.delete(sessionId);
  db.sessionSettings.delete(sessionId);
  db.groups.deleteBySession(sessionId);
  await deleteMongoAuthState(sessionId).catch(() => {});

  // Remove phone from global owners list
  if (phone) {
    const owners = db.settings.getValue('owners') || [];
    const filtered = owners.filter(o => o !== phone);
    if (filtered.length !== owners.length) db.settings.setValue('owners', filtered);
  }

  botEvents.emit('status', { sessionId, status: 'deleted' });
  logger.info({ sessionId }, '🗑️ Session deleted & all data removed');
}

export function getSession(id = 'default') { return sessions.get(id); }

export function isConnectedSessionOwner(jid) {
  const num = jid?.split('@')[0]?.split(':')[0];
  for (const [, sock] of sessions.entries()) {
    const sessNum = sock.user?.id?.split('@')[0]?.split(':')[0];
    if (sessNum && sessNum === num) return true;
  }
  return false;
}

export function getAllSessions() {
  // Merge live sessions + any known sessions currently reconnecting/connecting
  const all = new Map();

  // Start with persisted info for all known sessions (stable baseline)
  for (const [id, info] of sessionInfo.entries()) {
    const status = sessionStatus.get(id) || 'reconnecting';
    const sock = sessions.get(id);
    all.set(id, {
      id,
      jid: sock?.user?.id || info.jid,
      name: sock?.user?.name || info.name || id,
      phone: sock?.user?.id?.split('@')[0]?.split(':')[0] || info.phone,
      connected: sock?.ws?.readyState === 1,
      status,
      hasQR: sessionQRs.has(id),
    });
  }

  // Add any live sessions not yet in sessionInfo
  for (const [id, sock] of sessions.entries()) {
    if (!all.has(id)) {
      all.set(id, {
        id,
        jid: sock.user?.id,
        name: sock.user?.name || id,
        phone: sock.user?.id?.split('@')[0]?.split(':')[0],
        connected: sock.ws?.readyState === 1,
        status: sessionStatus.get(id) || 'unknown',
        hasQR: sessionQRs.has(id),
      });
    }
  }

  return Array.from(all.values());
}

export async function initAllSessions() {
  initViewOnce();

  // Discover existing sessions from Firebase db.sessions (no filesystem scan needed)
  const saved = db.sessions.all();
  const ids = Object.keys(saved).filter(id => id && typeof id === 'string');

  if (ids.length === 0) {
    logger.info('No sessions — creating default...');
    await createSession('default');
    return;
  }

  // Validate auth exists in MongoDB before loading each session.
  // Sessions without auth (cleared/logged-out) are pruned from db.sessions
  // so they don't produce orphaned QR-only sessions on every restart.
  logger.info({ count: ids.length }, 'Validating session auth before loading...');
  const validIds = [];
  for (const id of ids) {
    const hasAuth = await sessionHasAuth(id);
    if (hasAuth) {
      validIds.push(id);
    } else {
      logger.info({ sessionId: id }, '🗑️ No MongoDB auth found — removing stale session record');
      db.sessions.delete(id);
    }
  }

  if (validIds.length === 0) {
    logger.info('All sessions pruned (no auth) — creating default...');
    await createSession('default');
    return;
  }

  logger.info({ count: validIds.length }, 'Loading sessions with valid auth');
  for (const id of validIds) {
    await createSession(id);
    await new Promise(r => setTimeout(r, 1500));
  }
}

export default { createSession, deleteSession, getSession, getAllSessions, initAllSessions,
  sessions, botEvents, sessionQRs, sessionStatus, setMessageHandler, setConnectionHandler };
