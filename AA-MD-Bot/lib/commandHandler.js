import { parseCommand, isGroup } from "./helper.js";
import { getPlugin } from "./pluginLoader.js";
import { db } from "./database.js";
import { checkAnonRelay } from "./anonRelay.js";
import { logger } from "./logger.js";
import config from "../config.js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isConnectedSessionOwner } from "./sessionManager.js";
import { handleViewOnceMessage } from "./antiViewOnce.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const cooldowns = new Map();
const spamTracker = new Map();

// ── groupMetadata cache (stale-while-revalidate, 90s TTL) ────────────────────
// Returns stale data instantly and refreshes in background — never blocks command.
const _groupMetaCache = new Map();
const _GROUP_META_TTL = 90_000;
async function getCachedGroupMeta(sock, jid) {
  const cached = _groupMetaCache.get(jid);
  const now = Date.now();
  if (cached) {
    if (now - cached.ts < _GROUP_META_TTL) return cached.data; // fresh
    // Stale: return immediately, refresh in background
    sock
      .groupMetadata(jid)
      .then((meta) => _groupMetaCache.set(jid, { data: meta, ts: Date.now() }))
      .catch(() => {});
    return cached.data;
  }
  // No cache yet — must fetch (first time only)
  const meta = await sock.groupMetadata(jid);
  _groupMetaCache.set(jid, { data: meta, ts: now });
  return meta;
}

const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb8Yk2LL2AU78HliE617";
const CHANNEL_NAME = "AA MD Bot";
const WATERMARK = `\n\n> 🤖 *Powered by AA MD Bot*  👨‍💻 *Ahsan Ali Wadani*`;

// Load banner thumbnail once for channel button
let _bannerThumb = null;
function getBannerThumb() {
  if (_bannerThumb) return _bannerThumb;
  const paths = [
    join(__dirname, "../banner.jpeg"),
    join(__dirname, "../banner.jpg"),
    join(__dirname, "../assets/banner.jpg"),
    join(__dirname, "../../artifacts/aa-md-bot/public/banner.jpeg"),
  ];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        _bannerThumb = readFileSync(p);
        break;
      }
    } catch (_) {}
  }
  return _bannerThumb;
}

// Build contextInfo — always includes newsletter "View Channel" button.
// Uses global (set at startup / .setnewsletter) with config as hard fallback.
function buildChannelCtx() {
  const newsletterJid = global._AA_NEWSLETTER_JID || config.newsletterJid;
  const newsletterName =
    global._AA_NEWSLETTER_NAME || config.newsletterName || CHANNEL_NAME;
  if (!newsletterJid) return null;
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid,
      newsletterName,
      serverMessageId: Math.floor(Math.random() * 99999) + 1,
    },
  };
}

export function isOwner(jid) {
  const num = jid?.split("@")[0]?.split(":")[0];
  if (num === config.superOwner) return true;
  if (isConnectedSessionOwner(jid)) return true;
  const owners = db.settings.getValue("owners") || config.owners || [];
  return owners.includes(num) || owners.includes(jid);
}

// SuperOwner is stored in Firebase db.settings so it applies across all servers.
// Falls back to config.js if DB not yet set.
function getSuperOwner() {
  return String(db.settings.getValue("superOwner") || config.superOwner || "");
}

export function isSuperOwner(jid) {
  const num = jid?.split("@")[0]?.split(":")[0];
  return num === getSuperOwner();
}

// Banned users stored in db.settings.bannedUsers (Firebase) — persists & syncs across servers
function isBanned(jid) {
  const banned = db.settings.getValue("bannedUsers") || [];
  return (
    banned.includes(jid) || banned.includes(jid.split("@")[0]?.split(":")[0])
  );
}

function checkSpam(jid) {
  const now = Date.now();
  const win = config.spamInterval * 1000;
  const e = spamTracker.get(jid) || { count: 0, first: now };
  if (now - e.first > win) {
    spamTracker.set(jid, { count: 1, first: now });
    return false;
  }
  e.count++;
  spamTracker.set(jid, e);
  return e.count > config.spamMax;
}

function checkCooldown(jid, command) {
  const key = `${jid}:${command}`;
  const now = Date.now();
  const last = cooldowns.get(key);
  if (last && now - last < config.cooldown * 1000)
    return config.cooldown - Math.floor((now - last) / 1000);
  cooldowns.set(key, now);
  return 0;
}

async function getMessageText(msg) {
  const m = msg.message;
  if (!m) return "";
  // Unwrap disappearing-message (ephemeral) and other wrapper containers
  const inner = m.ephemeralMessage?.message || m;
  // Unwrap document-with-caption wrapper
  const docInner = inner.documentWithCaptionMessage?.message || inner;
  // Unwrap viewOnce containers (reveal commands can be sent as viewOnce)
  const voInner =
    inner.viewOnceMessage?.message || inner.viewOnceMessageV2?.message || inner;

  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    docInner.documentMessage?.caption ||
    inner.documentMessage?.caption ||
    // Ephemeral wrappers with media captions (disappearing messages)
    inner.ephemeralMessage?.message?.imageMessage?.caption ||
    inner.ephemeralMessage?.message?.videoMessage?.caption ||
    inner.ephemeralMessage?.message?.documentMessage?.caption ||
    // ViewOnce messages can carry commands as captions
    voInner.imageMessage?.caption ||
    voInner.videoMessage?.caption ||
    // Edited messages — extract the edited body
    inner.editedMessage?.message?.protocolMessage?.editedMessage
      ?.conversation ||
    inner.editedMessage?.message?.protocolMessage?.editedMessage
      ?.extendedTextMessage?.text ||
    // Button / list / template responses
    inner.buttonsResponseMessage?.selectedButtonId ||
    inner.listResponseMessage?.singleSelectReply?.selectedRowId ||
    inner.templateButtonReplyMessage?.selectedId ||
    inner.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    inner.interactiveMessage?.body?.text ||
    ""
  );
}

async function react(sock, msg, emoji) {
  await sock
    .sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } })
    .catch(() => {});
}

// All text replies automatically get the watermark. Newsletter "lid" button only
// appears when owner has run .setnewsletter — no fallback channel ad.
async function reply(sock, msg, text, options = {}) {
  const fullText = typeof text === "string" ? text + WATERMARK : text;
  const ctx = buildChannelCtx();
  const payload = ctx
    ? { text: fullText, contextInfo: ctx, ...options }
    : { text: fullText, ...options };
  return sock.sendMessage(msg.key.remoteJid, payload, { quoted: msg });
}

async function sendMsg(sock, jid, content, options = {}) {
  const ctx = buildChannelCtx();
  if (typeof content === "string") {
    const fullText = content + WATERMARK;
    const payload = ctx
      ? { text: fullText, contextInfo: ctx, ...options }
      : { text: fullText, ...options };
    return sock.sendMessage(jid, payload);
  }
  // Non-text messages (image/audio/video/sticker): append watermark to caption if present
  if (content.caption && !content.caption.includes("AA MD Bot"))
    content.caption += WATERMARK;
  const payload = ctx
    ? { contextInfo: ctx, ...content, ...options }
    : { ...content, ...options };
  return sock.sendMessage(jid, payload);
}

// sendMedia — for plugins that send audio/image/video directly
// Newsletter button always wins — plugin contextInfo preserved alongside it
async function sendMedia(sock, jid, msg, content) {
  const ctx = buildChannelCtx();
  let finalCtx;
  if (ctx && content.contextInfo) {
    // Plugin contextInfo first, then newsletter button overwrites forwardedNewsletterMessageInfo
    finalCtx = {
      ...content.contextInfo,
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: ctx.forwardedNewsletterMessageInfo,
    };
  } else if (ctx) {
    finalCtx = ctx;
  } else {
    finalCtx = content.contextInfo;
  }
  const payload = { ...content };
  if (finalCtx) payload.contextInfo = finalCtx;
  else delete payload.contextInfo;
  return sock.sendMessage(jid, payload, { quoted: msg });
}

export async function handleMessage(sock, msg, sessionId) {
  try {
    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const fromMe = msg.key.fromMe;
    const isGroupMsg = isGroup(jid);
    const settings = db.settings.get();

    // Bot's own JID — computed early so the auto-viewonce handler can use it
    // too. Read from settings (saved at connect time, most reliable),
    // fallback to sock.user?.id in case settings not yet written.
    const ownJid =
      db.settings.getValue("botJid") ||
      (sock.user?.id || "").replace(/:.*@/, "@") ||
      null;

    // Fire off the anti-viewonce check immediately, before the text/caption
    // gate below — view-once media frequently has no caption, so it would
    // otherwise get dropped by `if (!text) return;` and never processed.
    // Not awaited so it never delays normal command handling.
    // Delegates to viewOnce.js's handleViewOnceMessage — same retry-safe
    // handler that's also wired to messages.update in sessionManager.js,
    // so this doesn't duplicate/clash with it (dedup guard inside it).
    if (!fromMe) {
      handleViewOnceMessage(msg, sock, sessionId).catch((err) =>
        logger.error({ err: err?.message }, "handleViewOnceMessage failed"),
      );
    }

    // Per-session settings override global — session-specific features go here
    const sessSets = db.sessionSettings.get(sessionId);
    // Merge: session settings take priority over global for per-number features
    const eff = (key, fallback) =>
      sessSets[key] !== undefined
        ? sessSets[key]
        : settings[key] !== undefined
          ? settings[key]
          : fallback;

    // fromMe = self-chat ("You" tab) — always treated as owner
    const owner = isOwner(senderJid) || fromMe;

    const botMode = eff("botMode", "public");
    if (botMode === "private" && !owner && !fromMe) return;

    // NOTE: auto-read is handled in sessionManager before commandHandler is called — no duplicate here.

    // Auto-react to every incoming message (not own messages, not view-once)
    if (eff("autoReact", false) && !fromMe) {
      const msgContent = msg.message || {};
      const innerContent = msgContent?.ephemeralMessage?.message || msgContent;
      const isViewOnce = !!(
        innerContent?.viewOnceMessage ||
        innerContent?.viewOnceMessageV2 ||
        innerContent?.viewOnceMessageV2Extension ||
        innerContent?.imageMessage?.viewOnce ||
        innerContent?.videoMessage?.viewOnce
      );
      if (!isViewOnce) {
        const emoji = eff("autoReactEmoji", config.autoReactEmoji ?? "❤️");
        sock
          .sendMessage(jid, { react: { text: emoji, key: msg.key } })
          .catch(() => {});
      }
    }

    const text = await getMessageText(msg);
    if (!text) return;

    // ── Anon relay — intercept plain DM replies before command parsing ────────
    // If the sender received an anon message and replies, forward it back to
    // the original sender without revealing either party's identity.
    if (!isGroupMsg && !fromMe) {
      if (await checkAnonRelay(sock, jid, text)) return;
    }

    const parsed = parseCommand(text);
    if (!parsed) {
      return;
    }

    const { command, args, text: argText, prefix } = parsed;

    // Maintenance mode — only block commands, never plain messages.
    // Owner can always use commands even during maintenance.
    if (settings.maintenanceMode && !owner) {
      await reply(sock, msg, config.maintenanceMsg).catch(() => {});
      return;
    }

    if (isBanned(senderJid) && !owner) {
      await reply(sock, msg, "❌ You are banned from using this bot.").catch(
        () => {},
      );
      return;
    }

    if (!owner && settings.antiSpam && checkSpam(senderJid)) {
      await reply(sock, msg, "⚠️ Too fast! Wait a moment.").catch(() => {});
      return;
    }

    const plugin = getPlugin(command);
    if (!plugin) return;

    const cooldownLeft = checkCooldown(senderJid, command);
    if (cooldownLeft > 0 && !owner) {
      await reply(
        sock,
        msg,
        `⏳ Wait *${cooldownLeft}s* before using this again.`,
      ).catch(() => {});
      return;
    }

    // superOwnerOnly: allow if senderJid matches superOwner OR if fromMe on superOwner's own session
    const sessionPhone = sock.user?.id?.split("@")[0]?.split(":")[0];
    const isSuperOwnerSelf = fromMe && sessionPhone === getSuperOwner();
    if (
      plugin.superOwnerOnly &&
      !isSuperOwner(senderJid) &&
      !isSuperOwnerSelf
    ) {
      await reply(
        sock,
        msg,
        "👑 This command is reserved for the main developer only.",
      ).catch(() => {});
      return;
    }

    if (plugin.ownerOnly && !owner) {
      await reply(sock, msg, "🔒 This command is for bot owners only.").catch(
        () => {},
      );
      return;
    }

    if (plugin.groupOnly && !isGroupMsg) {
      await reply(sock, msg, "👥 Groups only.").catch(() => {});
      return;
    }

    if (plugin.privateOnly && isGroupMsg) {
      await reply(sock, msg, "💬 Private chat only.").catch(() => {});
      return;
    }

    // ── Group role resolution ────────────────────────────────────────────
    // `isAdmin` / `isBotAdmin` are injected into every plugin context. The
    // metadata is cached (90 s), so this is cheap after the first call.
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroupMsg) {
      try {
        const meta = await getCachedGroupMeta(sock, jid);
        const normJid = (id) =>
          id?.includes(":") ? id.split(":")[0] + "@s.whatsapp.net" : id;
        const admins = (meta.participants || [])
          .filter((p) => p.admin)
          .map((p) => normJid(p.id));
        const botId = normJid(sock.user?.id);
        isAdmin = admins.includes(normJid(senderJid));
        isBotAdmin = !!botId && admins.includes(botId);
      } catch {
        // Metadata unavailable — treat as non-admin rather than throwing.
      }
    }

    if (plugin.adminOnly && isGroupMsg) {
      if (!isAdmin && !owner) {
        await reply(sock, msg, "👮 Group admins only.").catch(() => {});
        return;
      }
    }

    if (plugin.botAdminOnly && isGroupMsg) {
      if (!isBotAdmin) {
        await reply(
          sock,
          msg,
          "🤖 I need to be a *group admin* to do that. Please promote me first.",
        ).catch(() => {});
        return;
      }
    }

    // Skip composing presence when fake last seen is active — firing "composing"
    // implicitly marks the number as online and resets the scheduled last-seen time.
    const fakeLsActive = db.sessionSettings.getValue(
      sessionId,
      "fake_lastseen_active",
    );
    if (eff("autoTyping", false) && !fromMe && !fakeLsActive) {
      sock.sendPresenceUpdate("composing", jid).catch(() => {});
    }

    // Build quoted object with message + key so plugins can download media
    const _ctxInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo;
    const _quotedMsg = _ctxInfo?.quotedMessage;
    const quoted = _quotedMsg
      ? {
          message: _quotedMsg,
          key: {
            id: _ctxInfo?.stanzaId,
            remoteJid: _ctxInfo?.remoteJid || jid,
            participant: _ctxInfo?.participant || undefined,
            fromMe: false,
          },
        }
      : null;

    // Per-session settings accessor — bound to this session's sessionId
    // Plugins use sessionSettings.get/set instead of db.settings for per-number features
    const sessionSettings = {
      get: (key) => db.sessionSettings.getValue(sessionId, key),
      set: (key, val) => db.sessionSettings.setValue(sessionId, key, val),
      getAll: () => db.sessionSettings.get(sessionId),
      setAll: (data) => db.sessionSettings.set(sessionId, data),
      // Convenience: reads session first, falls back to global setting
      eff: (key, fallback) => {
        const sv = db.sessionSettings.getValue(sessionId, key);
        if (sv !== undefined) return sv;
        const gv = db.settings.getValue(key);
        if (gv !== undefined) return gv;
        return fallback;
      },
    };

    // Session-scoped db proxy — plugins use db.groups.get(jid) as before,
    // but internally the key is sessionId|groupJid so each bot number has
    // completely independent group settings (antilink, welcome, warn, etc.)
    const scopedDb = {
      ...db,
      groups: {
        get: (groupId) => db.groups.get(sessionId, groupId),
        set: (groupId, data) => db.groups.set(sessionId, groupId, data),
        delete: (groupId) => db.groups.delete(sessionId, groupId),
        all: () => db.groups.all(sessionId),
      },
    };

    // .rmfwd / stripfwd and any other plugin with noChannelCtx:true must NOT
    // receive forwarding/channel tags on their own replies — those commands exist
    // specifically to strip those tags, so their own responses should be tag-free.
    const _replyFn = plugin.noChannelCtx
      ? (t, opts = {}) => {
          const fullText = typeof t === "string" ? t + WATERMARK : t;
          return sock.sendMessage(
            msg.key.remoteJid,
            { text: fullText, ...opts },
            { quoted: msg },
          );
        }
      : (t, opts) => reply(sock, msg, t, opts);

    const _sendFn = plugin.noChannelCtx
      ? (t, opts = {}) => {
          if (typeof t === "string") {
            return sock.sendMessage(jid, { text: t + WATERMARK, ...opts });
          }
          if (t.caption && !t.caption.includes("AA MD Bot"))
            t.caption += WATERMARK;
          return sock.sendMessage(jid, { ...t, ...opts });
        }
      : (t, opts) => sendMsg(sock, jid, t, opts);

    const _sendMediaFn = plugin.noChannelCtx
      ? (content) => {
          const payload = { ...content };
          delete payload.contextInfo; // strip any existing ctx too
          return sock.sendMessage(jid, payload, { quoted: msg });
        }
      : (content) => sendMedia(sock, jid, msg, content);

    await plugin.execute({
      sock,
      msg,
      jid,
      senderJid,
      fromMe,
      isGroupMsg,
      command,
      args,
      text: argText,
      prefix,
      sessionId,
      isOwner: owner,
      isSudo: owner,
      isAdmin,
      isBotAdmin,
      reply: _replyFn,
      react: (e) => react(sock, msg, e),
      send: _sendFn,
      sendMedia: _sendMediaFn,
      db: scopedDb,
      config,
      sessionSettings,
      quoted,
      ownJid,
      getQuoted: () => _quotedMsg || null,
      logger,
    });

    if (eff("autoTyping", false) && !fakeLsActive) {
      sock.sendPresenceUpdate("paused", jid).catch(() => {});
    }
  } catch (err) {
    logger.error({ err: err.message }, "handleMessage error");
  }
}

export default { handleMessage, isOwner };
