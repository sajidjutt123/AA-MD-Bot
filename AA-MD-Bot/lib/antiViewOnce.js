// ============================================
// AA MD Bot - Anti View Once
// Developer: Ahsan Ali | AA Mods
// Captures view-once media, stores for manual reveal
// via !reveal <msgId>, and auto-reveals to owner's
// private "You" chat when antiviewonce is ON or the
// view-once caption contains the configured keyword.
// ============================================

import moment from "moment-timezone";
import { logger } from "./logger.js";
import { db } from "./database.js";
import config from "../config.js";
import { getPrefixes } from "./helper.js";

// ── Direct-download helper (mirrors reveal.js Step 1) ────────────────────────
async function dlBufDirect(mediaMsg, type) {
  const { downloadContentFromMessage } = await import(
    "@whiskeysockets/baileys"
  );
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Extract media from a quotedMessage object ─────────────────────────────────
function extractQuotedMediaForReveal(quotedMsg) {
  if (!quotedMsg) return null;
  const inner =
    quotedMsg?.viewOnceMessageV2?.message ||
    quotedMsg?.viewOnceMessageV2Extension?.message ||
    quotedMsg?.viewOnceMessage?.message ||
    quotedMsg?.ephemeralMessage?.message ||
    quotedMsg;
  if (inner?.imageMessage)
    return {
      mediaMsg: inner.imageMessage,
      isVid: false,
      isAudio: false,
      mime: inner.imageMessage.mimetype || "image/jpeg",
    };
  if (inner?.videoMessage)
    return {
      mediaMsg: inner.videoMessage,
      isVid: true,
      isAudio: false,
      mime: inner.videoMessage.mimetype || "video/mp4",
    };
  if (inner?.audioMessage)
    return {
      mediaMsg: inner.audioMessage,
      isVid: false,
      isAudio: true,
      mime: inner.audioMessage.mimetype || "audio/mp4",
    };
  if (quotedMsg?.imageMessage)
    return {
      mediaMsg: quotedMsg.imageMessage,
      isVid: false,
      isAudio: false,
      mime: quotedMsg.imageMessage.mimetype || "image/jpeg",
    };
  if (quotedMsg?.videoMessage)
    return {
      mediaMsg: quotedMsg.videoMessage,
      isVid: true,
      isAudio: false,
      mime: quotedMsg.videoMessage.mimetype || "video/mp4",
    };
  if (quotedMsg?.audioMessage)
    return {
      mediaMsg: quotedMsg.audioMessage,
      isVid: false,
      isAudio: true,
      mime: quotedMsg.audioMessage.mimetype || "audio/mp4",
    };
  return null;
}

// ── Storage ───────────────────────────────────────────────────────────────────
// All view-once media is kept in memory only — zero disk writes.
// Map keyed by message ID — stores buffer + metadata for manual/keyword reveal
export const viewOnceStore = new Map();
const _MAX_STORE = 200;

// Dedup guard — WhatsApp often delivers view-once twice
// (empty placeholder via messages.upsert, real content via messages.update)
const _processed = new Set();
const _PROCESSED_MAX = 200;

// ── Periodic cleanup (60-minute in-memory TTL) ────────────────────────────────
export function cleanViewOnceStore() {
  const now = Date.now();
  const MEM_TTL = 60 * 60 * 1000; // 60 min — extended since no disk fallback
  for (const [key, val] of viewOnceStore.entries()) {
    if (now - val.timestamp > MEM_TTL) viewOnceStore.delete(key);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPhoneNum(jid) {
  if (!jid) return null;
  return jid.split("@")[0].split(":")[0];
}

function formatPhone(num) {
  if (!num) return "Unknown";
  return num.startsWith("+") ? num : `+${num}`;
}

function normalizeMsg(message) {
  let m = message;
  for (let i = 0; i < 5; i++) {
    if (m?.ephemeralMessage) {
      m = m.ephemeralMessage.message;
      continue;
    }
    if (m?.documentWithCaptionMessage) {
      m = m.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return m;
}

function extractViewOnceMedia(normalized) {
  const voMsg =
    normalized?.viewOnceMessage ||
    normalized?.viewOnceMessageV2 ||
    normalized?.viewOnceMessageV2Extension;

  if (voMsg?.message?.imageMessage)
    return { mediaMsg: voMsg.message.imageMessage, isVid: false, isAudio: false };
  if (voMsg?.message?.videoMessage)
    return { mediaMsg: voMsg.message.videoMessage, isVid: true,  isAudio: false };
  if (voMsg?.message?.audioMessage)
    return { mediaMsg: voMsg.message.audioMessage, isVid: false, isAudio: true  };
  if (normalized?.imageMessage?.viewOnce)
    return { mediaMsg: normalized.imageMessage, isVid: false, isAudio: false };
  if (normalized?.videoMessage?.viewOnce)
    return { mediaMsg: normalized.videoMessage, isVid: true,  isAudio: false };
  if (normalized?.audioMessage?.viewOnce)
    return { mediaMsg: normalized.audioMessage, isVid: false, isAudio: true  };
  return null;
}

async function downloadBuffer(mediaMsg, isVid, isAudio = false) {
  const { downloadContentFromMessage } = await import(
    "@whiskeysockets/baileys"
  );
  const stream = await downloadContentFromMessage(
    mediaMsg,
    isAudio ? "audio" : isVid ? "video" : "image",
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Main handler ──────────────────────────────────────────────────────────────
// Call this from both messages.upsert and messages.update in sessionManager.
export async function handleViewOnceMessage(msg, sock, sessionId) {
  if (!msg?.message || !msg?.key?.id) return;

  try {
    const msgId = msg.key.id;

    // Dedup: skip if already successfully downloaded
    // NOTE: we do NOT mark _processed here yet — we only mark it after the
    // buffer download succeeds, so that a messages.update retry (which fires
    // when WhatsApp delivers the real content after an empty placeholder) can
    // still succeed if the first messages.upsert attempt had no media yet.
    if (_processed.has(msgId)) return;

    const normalized = normalizeMsg(msg.message);
    const extracted = extractViewOnceMedia(normalized);
    if (!extracted) return;

    const { mediaMsg, isVid, isAudio } = extracted;
    const mime = mediaMsg.mimetype || (isAudio ? "audio/mp4" : isVid ? "video/mp4" : "image/jpeg");
    const caption = mediaMsg.caption || "";
    const chatJid = msg.key.remoteJid;
    const inGroup = chatJid?.endsWith("@g.us");
    const senderJid = msg.key.participant || chatJid || "";
    const num = getPhoneNum(senderJid);
    const tz = config.timezone || "Asia/Karachi";
    const time = new Date().toLocaleString("en-PK", {
      timeZone: tz,
      hour12: true,
    });

    logger.info(
      { sessionId, msgId, chat: chatJid, isVid },
      "👁️ ViewOnce detected — downloading",
    );

    // Download
    let buf = null;
    try {
      buf = await downloadBuffer(mediaMsg, isVid, isAudio);
    } catch (e) {
      logger.warn({ err: e.message }, "ViewOnce download failed");
    }
    if (!buf?.length) return; // leave _processed clear so messages.update can retry

    // Mark as successfully handled — prevents double-processing on retry events
    _processed.add(msgId);
    if (_processed.size > _PROCESSED_MAX)
      _processed.delete(_processed.values().next().value);

    // Store in memory only — no disk writes
    const senderName =
      sock.contacts?.[senderJid]?.name ||
      sock.contacts?.[senderJid]?.notify ||
      formatPhone(num);
    const entry = {
      buf,
      mime,
      isVid,
      isAudio,
      num,
      time,
      inGroup,
      caption,
      chatJid,
      senderJid,
      senderName,
      timestamp: Date.now(),
    };
    viewOnceStore.set(msgId, entry);
    if (viewOnceStore.size > _MAX_STORE)
      viewOnceStore.delete(viewOnceStore.keys().next().value);

    logger.info(
      { sessionId, msgId, bytes: buf.length },
      "✅ ViewOnce cached (memory only)",
    );

    // ── Auto-reply to sender ──────────────────────────────────────────────────
    const autoReply = db.settings.getValue("voAutoReply");
    if (autoReply && !msg.key.fromMe) {
      await sock.sendMessage(chatJid, { text: autoReply }).catch(() => {});
    }

    // ── Auto-forward to owner's "You" chat — ONLY when .antiviewonce is ON ────
    // Check group-level first, then global settings, then per-session settings
    // (belt-and-suspenders: some callers may persist in sessionSettings instead)
    // ── Auto-forward to owner's "You" chat — ONLY when .antiviewonce is ON ────
    // Applies to BOTH groups and DMs — global flag covers all chats.
    const groupAntiVO = inGroup
      ? db.groups.get(sessionId, chatJid)?.antiviewonce
      : undefined;
    const globalAntiVO = db.settings.getValue("antiViewOnce");
    const sessAntiVO   = db.sessionSettings.getValue(sessionId, "antiViewOnce");
    const antiVOActive = !!(groupAntiVO || globalAntiVO === true || sessAntiVO);

    logger.info(
      { sessionId, antiVOActive, globalAntiVO, globalAntiVO_type: typeof globalAntiVO, sessAntiVO, groupAntiVO, fromMe: msg.key.fromMe },
      "👁️ ViewOnce antiVO check",
    );

    if (antiVOActive && !msg.key.fromMe) {
      const selfNum = sock.user?.id?.split("@")[0]?.split(":")[0];
      // FIX: fallback to the botJid saved in settings at connect time —
      // sock.user can be momentarily null/undefined right after a reconnect,
      // which silently killed auto-reveal even when antiVOActive was true.
      const savedBotJid = db.settings.getValue("botJid");
      const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : (savedBotJid || null);

      logger.info({ sessionId, selfJid, usedFallback: !selfNum && !!savedBotJid }, "👁️ ViewOnce auto-reveal: sending to self-chat");

      if (selfJid) {
        const date = moment().tz(tz).format("DD/MM/YYYY");
        const timeStr = moment().tz(tz).format("HH:mm:ss");
        const cap =
          `🔓 *View-Once Auto-Saved*\n\n` +
          `👤 *From:* ${formatPhone(num)}\n` +
          `🕐 *Time:* ${timeStr}\n` +
          `📅 *Date:* ${date}\n` +
          `📍 *Chat:* ${inGroup ? "Group" : "DM"}\n` +
          `\n> 👁️ *AA MD Bot*`;
        try {
          if (isAudio) {
            await sock.sendMessage(selfJid, {
              audio: buf,
              mimetype: mime,
              ptt: mediaMsg?.ptt || false,
            });
            await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
          } else {
            await sock.sendMessage(
              selfJid,
              isVid
                ? { video: buf, caption: cap, mimetype: mime }
                : { image: buf, caption: cap, mimetype: mime },
            );
          }
          logger.info({ sessionId, selfJid }, "✅ ViewOnce auto-reveal sent");
        } catch (sendErr) {
          logger.warn({ err: sendErr.message, selfJid }, "❌ ViewOnce auto-reveal send FAILED");
        }
      } else {
        logger.warn({ sessionId }, "👁️ ViewOnce auto-reveal: selfJid is null — sock.user AND botJid setting both unavailable");
      }
    }
  } catch (e) {
    logger.warn({ err: e.message, stack: e.stack }, "ViewOnce handler threw");
  }
}

// ── Helpers for reply reveal ──────────────────────────────────────────────────
// Extract plain text from any message type
function extractText(m) {
  if (!m) return "";
  const norm = normalizeMsg(m);
  return (
    norm?.conversation ||
    norm?.extendedTextMessage?.text ||
    norm?.imageMessage?.caption ||
    norm?.videoMessage?.caption ||
    norm?.documentMessage?.caption ||
    norm?.audioMessage?.caption ||
    norm?.buttonsResponseMessage?.selectedDisplayText ||
    norm?.listResponseMessage?.title ||
    ""
  );
}

// Extract contextInfo from any message wrapper.
// Handles ephemeral, documentWithCaption, viewOnce, and all standard message types.
// Walks the full wrapper chain to find a contextInfo that contains a stanzaId.
function extractContextInfo(m) {
  if (!m) return null;

  // Walk the message tree: unwrap each known envelope type and collect contextInfo candidates
  // We do a more thorough walk than normalizeMsg (which only handles 2 types).
  function* walk(obj, depth = 0) {
    if (!obj || depth > 8) return;
    // Yield contextInfo from any known message type at this level
    for (const key of [
      "extendedTextMessage",
      "imageMessage",
      "videoMessage",
      "documentMessage",
      "audioMessage",
      "buttonsResponseMessage",
      "listResponseMessage",
      "stickerMessage",
      "contactMessage",
      "locationMessage",
      "templateButtonReplyMessage",
    ]) {
      if (obj[key]?.contextInfo) yield obj[key].contextInfo;
    }
    // Walk into known envelope/wrapper types
    for (const wrapper of [
      "ephemeralMessage",
      "documentWithCaptionMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
    ]) {
      if (obj[wrapper]?.message) yield* walk(obj[wrapper].message, depth + 1);
      if (obj[wrapper]) yield* walk(obj[wrapper], depth + 1); // some wrap without .message
    }
  }

  // Return first contextInfo that has a stanzaId (the one that identifies the quoted message)
  for (const ctx of walk(m)) {
    if (ctx?.stanzaId) return ctx;
  }
  // Fall back to first contextInfo found (even without stanzaId — caller checks)
  for (const ctx of walk(m)) {
    return ctx;
  }
  return null;
}

// ── Emoji trigger detection ───────────────────────────────────────────────────
// Returns true if the text contains 4+ of the same emoji grapheme cluster.
// Uses Intl.Segmenter for correct handling of ZWJ sequences, skin-tone
// variants, flags, keycaps, and all multi-codepoint emoji combinations.
function hasFourSameEmoji(text) {
  if (!text) return false;
  try {
    // Segment the text into grapheme clusters (the correct "visual character" unit)
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    const segments = [...segmenter.segment(text)];

    // Keep only segments that look like emoji:
    //  - Contains a codepoint with Emoji_Presentation or Extended_Pictographic property
    //  - OR is a keycap sequence (digit + \uFE0F + \u20E3)
    const emojiSegments = segments
      .map((s) => s.segment)
      .filter((s) => {
        if (!s) return false;
        const cp = s.codePointAt(0);
        // Keycap sequences: #*0-9 + VS16 + combining enclosing keycap
        if (s.length >= 2 && s.includes("\u20E3")) return true;
        // Regional indicators (flags): U+1F1E0-U+1F1FF (appear in pairs)
        if (cp >= 0x1f1e0 && cp <= 0x1f1ff) return true;
        // Standard emoji ranges
        if (cp >= 0x1f300) return true; // Misc Symbols and Pictographs+
        if (cp >= 0x2600 && cp <= 0x27bf) return true; // Misc Symbols, Dingbats
        if (cp >= 0x2300 && cp <= 0x23ff) return true; // Misc Technical
        if (cp >= 0xfe00) return true; // Variation selectors + specials
        return false;
      });

    const counts = {};
    for (const e of emojiSegments) {
      counts[e] = (counts[e] || 0) + 1;
      if (counts[e] >= 4) return true;
    }
    return false;
  } catch {
    // Intl.Segmenter fallback for old Node: simple codepoint count
    const counts = {};
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1f300 || (cp >= 0x2600 && cp <= 0x27bf)) {
        counts[ch] = (counts[ch] || 0) + 1;
        if (counts[ch] >= 4) return true;
      }
    }
    return false;
  }
}

// ── Reply-based reveal: voword keyword OR prefix+4-same-emoji ────────────────
// Called for every fromMe message (sessionManager checks fromMe before calling).
// Returns early with no side-effects when neither trigger matches.
export async function handleReplyReveal(msg, sock, sessionId) {
  try {
    if (!msg?.key?.fromMe) return;

    const msgText = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    if (!msgText) return;

    // ── Trigger check — must pass at least one ────────────────────────────────
    const voKeyword = db.settings.getValue("voKeyword");
    const prefixes = getPrefixes();
    const emojiEnabled = db.settings.getValue("emojiRevealEnabled") !== false; // default ON

    // Trigger 1: voword keyword present anywhere in the text
    const hasKeyword = !!(
      voKeyword && msgText.toLowerCase().includes(voKeyword.toLowerCase())
    );

    // Trigger 2: 4 same emojis — works with OR without prefix
    // e.g. 🔥🔥🔥🔥 OR .🔥🔥🔥🔥 both trigger reveal
    const matchedPrefix = prefixes.find((p) => msgText.startsWith(p)) || "";
    const textBody = msgText.slice(matchedPrefix.length);
    const isEmojiTrigger =
      emojiEnabled && textBody.length > 0 && hasFourSameEmoji(textBody);

    if (!hasKeyword && !isEmojiTrigger) return; // not a reveal trigger — ignore

    const triggerLabel = isEmojiTrigger
      ? "emoji-trigger"
      : `keyword(${voKeyword})`;

    // ── Exact stanzaId lookup (works when owner used WhatsApp Reply) ──────────
    const ctxInfo = extractContextInfo(msg.message);
    const stanzaId = ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId || null;

    let stored = stanzaId ? viewOnceStore.get(stanzaId) : null;

    if (!stored && stanzaId) {
      // Retry up to 3 s — handles race where messages.update hasn't arrived yet
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        stored = viewOnceStore.get(stanzaId);
        if (stored) break;
      }
    }

    // ── chatJid fallback scan ─────────────────────────────────────────────────
    // Used when:
    //  (a) stanzaId didn't match (ID format mismatch between devices), OR
    //  (b) no stanzaId (owner typed keyword/emoji without using WhatsApp Reply)
    if (!stored) {
      const chatJid = msg.key.remoteJid;
      const hadStanzaId = !!(ctxInfo?.stanzaId || ctxInfo?.quotedStanzaId);
      const TTL = 60 * 60 * 1000; // 60-min in-memory TTL

      if (viewOnceStore.size > 0) {
        let newest = null;

        // Pass 1: prefer entries from same chat
        for (const [, entry] of viewOnceStore) {
          if (entry.chatJid === chatJid) {
            if (!newest || entry.timestamp > newest.timestamp) newest = entry;
          }
        }

        // Pass 2: global scan — when no stanzaId or same-chat scan found nothing
        if (!newest || !hadStanzaId) {
          for (const [, entry] of viewOnceStore) {
            if (!newest || entry.timestamp > newest.timestamp) newest = entry;
          }
        }

        if (newest && Date.now() - newest.timestamp < TTL) stored = newest;
      }
    }

    const selfNum = sock.user?.id?.split("@")[0]?.split(":")[0];
    const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : null;
    if (!selfJid) return;

    const tz = config.timezone || "Asia/Karachi";
    const date = moment().tz(tz).format("DD/MM/YYYY");
    const timeStr = moment().tz(tz).format("HH:mm:ss");

    // ── Step 0: Direct download from quotedMessage media keys ────────────────
    // Works for fresh view-once media (before the key expires).
    // This is the PRIMARY path and doesn't require the in-memory store.
    try {
      const ctxInfoDirect =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo ||
        null;
      const quotedMsg = ctxInfoDirect?.quotedMessage;
      if (quotedMsg) {
        const extracted = extractQuotedMediaForReveal(quotedMsg);
        if (extracted) {
          const type = extracted.isAudio
            ? "audio"
            : extracted.isVid
              ? "video"
              : "image";
          const buf = await dlBufDirect(extracted.mediaMsg, type);
          if (buf?.length > 0) {
            const cap =
              `🔓 *View-Once Revealed*\n\n` +
              `📅 *Date:* ${date}\n` +
              `⏰ *Time:* ${timeStr}\n` +
              `🔑 *Trigger:* ${triggerLabel}\n\n` +
              `> 👁️ *AA MD Bot*`;
            if (extracted.isAudio) {
              await sock
                .sendMessage(selfJid, {
                  audio: buf,
                  mimetype: extracted.mime,
                  ptt: extracted.mediaMsg?.ptt || false,
                })
                .catch(() => {});
            } else if (extracted.isVid) {
              await sock
                .sendMessage(selfJid, {
                  video: buf,
                  caption: cap,
                  mimetype: extracted.mime,
                })
                .catch(() => {});
            } else {
              await sock
                .sendMessage(selfJid, {
                  image: buf,
                  caption: cap,
                  mimetype: extracted.mime,
                })
                .catch(() => {});
            }
            logger.info(
              { sessionId, trigger: triggerLabel },
              "🔑 ViewOnce revealed via emoji trigger (direct)",
            );
            return;
          }
        }
      }
    } catch (_) {
      /* direct download failed — fall through to store */
    }

    // ── Step 1+2: In-memory store lookup (fallback) ───────────────────────────
    if (!stored) return; // no cached view-once found

    const cap =
      `🔓 *View-Once Revealed*\n\n` +
      `👤 *From:* ${formatPhone(stored.num)}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${timeStr}\n` +
      `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
      `🔑 *Trigger:* ${triggerLabel}\n` +
      `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
      `> 👁️ *AA MD Bot*`;

    if (stored.isAudio) {
      await sock
        .sendMessage(selfJid, {
          audio: stored.buf,
          mimetype: stored.mime,
          ptt: false,
        })
        .catch(() => {});
      await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
    } else {
      await sock
        .sendMessage(
          selfJid,
          stored.isVid
            ? { video: stored.buf, caption: cap, mimetype: stored.mime }
            : { image: stored.buf, caption: cap, mimetype: stored.mime },
        )
        .catch(() => {});
    }

    logger.info(
      { sessionId, stanzaId, trigger: triggerLabel },
      "🔑 ViewOnce revealed via emoji trigger (store)",
    );
  } catch (e) {
    logger.warn({ err: e.message }, "handleReplyReveal threw");
  }
}

// ── Manual reveal: by msgId (from !reveal, .reveal, or the reveal plugin) ─────
export async function handleManualReveal(msgId, sock, replyJid) {
  const selfNum = sock.user?.id?.split("@")[0]?.split(":")[0];
  const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : null;
  if (!selfJid) return;

  const id = msgId?.trim();

  // Check in-memory store (only source — no disk fallback)
  const stored = viewOnceStore.get(id);

  if (!stored) {
    await sock
      .sendMessage(replyJid, {
        text:
          `❌ *View-Once not found*\n\n` +
          `Message ID not in cache.\n` +
          `Make sure the bot was running when the view-once arrived,\n` +
          `and that you're replying to the original message.\n\n` +
          `> 👁️ *AA MD Bot*`,
      })
      .catch(() => {});
    return;
  }

  const cap =
    `🔓 *View-Once Revealed (Manual)*\n\n` +
    `👤 *From:* ${formatPhone(stored.num)}\n` +
    `🕐 *Time:* ${stored.time}\n` +
    `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
    `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
    `> 👁️ *AA MD Bot*`;

  if (stored.isAudio) {
    await sock
      .sendMessage(selfJid, {
        audio: stored.buf,
        mimetype: stored.mime,
        ptt: false,
      })
      .catch(() => {});
    await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
  } else {
    await sock
      .sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime },
      )
      .catch(() => {});
  }
}

// ── Reveal by quoted/replied message — used by .reveal plugin ─────────────────
// Pass the full `msg` of the owner's command message. Extracts the quoted msgId
// and reveals that view-once. Returns true if found, false if not in cache.
export async function handleRevealByReply(msg, sock) {
  const selfNum = sock.user?.id?.split("@")[0]?.split(":")[0];
  const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : null;
  if (!selfJid) return false;

  // Extract the quoted message ID from contextInfo
  const ctxInfo = extractContextInfo(msg.message);
  const stanzaId = ctxInfo?.stanzaId;
  if (!stanzaId) return false;

  // Check in-memory store (only source — no disk fallback)
  const stored = viewOnceStore.get(stanzaId);
  if (!stored) return false;

  const tz = config.timezone || "Asia/Karachi";
  const date = moment().tz(tz).format("DD/MM/YYYY");
  const timeStr = moment().tz(tz).format("HH:mm:ss");

  const cap =
    `🔓 *View-Once Revealed*\n\n` +
    `👤 *From:* ${formatPhone(stored.num)}\n` +
    `📅 *Date:* ${date}\n` +
    `⏰ *Time:* ${timeStr}\n` +
    `📍 *Chat:* ${stored.inGroup ? "Group" : "DM"}\n` +
    `💬 *Caption:* "${stored.caption || "None"}"\n\n` +
    `> 👁️ *AA MD Bot*`;

  if (stored.isAudio) {
    await sock
      .sendMessage(selfJid, {
        audio: stored.buf,
        mimetype: stored.mime,
        ptt: false,
      })
      .catch(() => {});
    await sock.sendMessage(selfJid, { text: cap }).catch(() => {});
  } else {
    await sock
      .sendMessage(
        selfJid,
        stored.isVid
          ? { video: stored.buf, caption: cap, mimetype: stored.mime }
          : { image: stored.buf, caption: cap, mimetype: stored.mime },
      )
      .catch(() => {});
  }

  return true;
}

// ── Init: call once at startup ────────────────────────────────────────────────
export function initViewOnce() {
  setInterval(cleanViewOnceStore, 60_000);
  logger.info("👁️ ViewOnce feature initialized");
  logger.info("👁️ Auto-reveal: .antiviewonce on/off");
  logger.info(
    "👁️ Emoji reveal: reply to a view-once with 4 same emojis (e.g. 🔥🔥🔥🔥) to reveal",
  );
  logger.info("👁️ Manual reveal: .avv in reply to a view-once message");
}
