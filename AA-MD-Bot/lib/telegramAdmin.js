// ╔══════════════════════════════════════════════════════════════════╗
// ║   AA MD Bot — Telegram Pairing Bot (@aa_md_2bot)               ║
// ║   Token  : TELEGRAM_BOT_TOKEN                                   ║
// ║   Pairing : Open to all                                         ║
// ║   Admin   : OWNER_ID only (6001083166)                          ║
// ╚══════════════════════════════════════════════════════════════════╝

import TelegramBot from 'node-telegram-bot-api';
import os          from 'os';
import { logger }  from './logger.js';

const TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const HTML     = { parse_mode: 'HTML' };

// ── Admin-only Telegram user ──────────────────────────────────────────────────
// Override with TELEGRAM_OWNER_ID in .env instead of editing this file.
const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID || 6001083166);

const DIV    = '━━━━━━━━━━━━━━━━━━━━━━';
const FOOTER = `\n${DIV}\n🤖 <b>AA MD Bot</b> | <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a>`;
const esc    = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Injected context ─────────────────────────────────────────────────────────
let _createSession  = null;
let _deleteSession  = null;
let _latestCodes    = null;
let _botEvents      = null;
let _getAllSessions  = null;
let _sockets        = null;   // sessionId → Baileys socket (live instances)

// sessionId → Map<chatId, msgId>  (stores the "Waiting..." message to edit in-place)
const _pairingWaiters = new Map();
const _pairingChats   = new Map(); // sessionId → chatId (for connection confirm)
const _awaitingPhone  = new Map(); // chatId → { msgId }

// ── Keyboards ────────────────────────────────────────────────────────────────
const KB_HOME = {
  inline_keyboard: [
    [{ text: '📱 Get Pairing Code', callback_data: 'do_pair' }],
    [{ text: '❓ How to Connect',   callback_data: 'how_connect' },
     { text: '🤖 Bot Features',     callback_data: 'bot_features' }],
  ],
};

const KB_BACK = {
  inline_keyboard: [[{ text: '« Back', callback_data: 'home' }]],
};

const KB_ADMIN = {
  inline_keyboard: [
    [{ text: '📊 Sessions',   callback_data: 'admin_sessions' },
     { text: '📢 Broadcast',  callback_data: 'admin_broadcast' }],
    [{ text: '« Back',        callback_data: 'home' }],
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sendText = (bot, id, text, extra = {}) =>
  bot.sendMessage(id, text, { parse_mode: 'HTML', ...extra }).catch(() => {});

async function editOrSend(bot, chatId, msgId, text, extra = {}) {
  try {
    return await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...extra });
  } catch {
    return bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra }).catch(() => {});
  }
}

// ── Code message helper ───────────────────────────────────────────────────────
function codeMessage(phone, code) {
  return {
    text:
      `✅ <b>Pairing Code Ready!</b>\n${DIV}\n\n` +
      `📱 <b>Number:</b> <code>+${esc(phone)}</code>\n\n` +
      `🔑 <b>Your Code:</b>\n<code>${esc(code)}</code>\n\n` +
      `<b>How to connect:</b>\n` +
      `1️⃣ Open WhatsApp → <b>Settings → Linked Devices</b>\n` +
      `2️⃣ Tap <b>Link a Device</b> → <b>Link with phone number</b>\n` +
      `3️⃣ Enter the 8-digit code above\n\n` +
      `⏰ <i>Expires in ~60 seconds — enter it quickly!\n` +
      `You will get a confirmation message here when connected.</i>` + FOOTER,
    reply_markup: {
      inline_keyboard: [
        [{ text: `📋 Copy Code: ${code}`, callback_data: `copy_code_${code}` }],
        [{ text: '🔄 Request New Code', callback_data: `repair_${phone}` },
         { text: '« Back',              callback_data: 'home'              }],
      ],
    },
  };
}

// ── Core pairing logic ────────────────────────────────────────────────────────
async function doPair(bot, chatId, phone, editMsgId = null) {
  const waiting =
    `⏳ <b>Requesting pairing code...</b>\n\n` +
    `📱 Number: <code>+${esc(phone)}</code>\n\n` +
    `<i>Please wait a moment...</i>` + FOOTER;

  const sent = editMsgId
    ? await editOrSend(bot, chatId, editMsgId, waiting).catch(() => null)
    : await bot.sendMessage(chatId, waiting, HTML).catch(() => null);
  if (!sent) return;

  const sentId = sent.message_id ?? editMsgId;

  try {
    if (!_createSession) throw new Error('Bot session manager not ready — try again in a moment.');

    const sessionId = `tg_${phone}`;
    _pairingChats.set(sessionId, chatId);

    // Delete any existing stuck/old session for this number so we get a fresh code
    if (_deleteSession) {
      try { await _deleteSession(sessionId); } catch {}
    }
    _latestCodes?.delete(sessionId);

    // Register waiter: sessionId → Map<chatId, msgId>
    if (!_pairingWaiters.has(sessionId)) _pairingWaiters.set(sessionId, new Map());
    _pairingWaiters.get(sessionId).set(chatId, sentId);

    // *** FIX: correct arg order — createSession(sessionId, usePairingCode, phoneNumber) ***
    await _createSession(sessionId, true, phone);

    // Show "waiting" status while session connects (code arrives via pairingCode event)
    await editOrSend(bot, chatId, sentId,
      `⏳ <b>Waiting for code...</b>\n\n` +
      `📱 <b>Number:</b> <code>+${esc(phone)}</code>\n\n` +
      `<i>The code will appear here automatically.\nDo not close this chat.</i>` + FOOTER,
      { reply_markup: KB_BACK }
    );

  } catch (e) {
    const sid = `tg_${phone}`;
    _pairingWaiters.get(sid)?.delete(chatId);
    _pairingChats.delete(sid);
    editOrSend(bot, chatId, sentId,
      `❌ <b>Pairing Failed</b>\n\n<i>${esc(e.message)}</i>\n\n` +
      `💡 Make sure the number format is correct (country code + number, no +).` + FOOTER,
      { reply_markup: KB_BACK }
    );
  }
}

// ── Help text ─────────────────────────────────────────────────────────────────
const HOW_CONNECT_TEXT =
  `📖 <b>How to Connect WhatsApp</b>\n${DIV}\n\n` +
  `<b>Step 1 —</b> Get your pairing code\n` +
  `Tap "📱 Get Pairing Code" and enter your WhatsApp number (with country code, no + sign).\n\n` +
  `<b>Step 2 —</b> Open WhatsApp\n` +
  `Go to <b>Settings → Linked Devices → Link a Device</b>\n` +
  `Select <b>"Link with phone number"</b>\n\n` +
  `<b>Step 3 —</b> Enter the code\n` +
  `Type the 8-digit code shown here. Done — your bot is now live!\n\n` +
  `<b>📌 Tips:</b>\n` +
  `• Use a separate number (not your main WhatsApp)\n` +
  `• Code expires in 60 seconds — enter it fast\n` +
  `• Bot stays connected even if this Telegram chat is closed\n\n` +
  `<b>🤖 Use Bot Features on Telegram:</b>\n` +
  `Once connected, use <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a> on Telegram for:\n` +
  `🎵 YouTube & TikTok downloads\n` +
  `🤖 AI chat, image generation\n` +
  `🔍 Search, weather, movies & more`;

const BOT_FEATURES_TEXT =
  `🤖 <b>AA MD Bot — Features</b>\n${DIV}\n\n` +
  `<b>On WhatsApp:</b>\n` +
  `🎵 Music & video downloads (.play .video)\n` +
  `👁️ View-once reveal (.vv .avv)\n` +
  `🗑️ Anti-delete (recover deleted msgs)\n` +
  `📵 Anti-call (auto-reject calls)\n` +
  `🤖 AI auto-reply (.autoai)\n` +
  `🌐 Search, translate, weather & 190+ commands\n\n` +
  `<b>On Telegram:</b>\n` +
  `Use <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a> for the full feature bot:\n` +
  `🎵 /play — YouTube MP3\n` +
  `🎬 /video — YouTube MP4\n` +
  `🤖 /ai — Chat with AI\n` +
  `🖼️ /imagine — AI image generation\n` +
  `🔍 /wiki /movie /anime /weather & more\n\n` +
  `<i>Connect your number using this bot, then enjoy all features on WhatsApp and Telegram!</i>`;

// ── Init ──────────────────────────────────────────────────────────────────────
export function initTelegramAdmin({ createSession, deleteSession, getAllSessions, latestPairingCodes, botEvents, sockets }) {
  if (!TOKEN) {
    logger.warn('⚡ TELEGRAM_BOT_TOKEN not set — Telegram admin bot disabled');
    return;
  }

  _createSession = createSession;
  _deleteSession = deleteSession;
  _latestCodes   = latestPairingCodes;
  _botEvents     = botEvents;
  _sockets       = sockets || null;
  _getAllSessions = getAllSessions;

  const bot = new TelegramBot(TOKEN, { polling: true });

  // ── Forward pairing codes from bot events — edit the "Waiting..." msg in-place ──
  botEvents.on('pairingCode', ({ sessionId, code }) => {
    const phone   = sessionId.replace('tg_', '');
    const waiters = _pairingWaiters.get(sessionId); // Map<chatId, msgId>
    if (!waiters?.size) return;
    const cm = codeMessage(phone, code);
    for (const [chatId, msgId] of waiters) {
      // Edit the existing "Waiting..." message so the code appears in the same place
      bot.editMessageText(cm.text, {
        chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: cm.reply_markup,
      }).catch(() => {
        // Fallback: send new message if edit fails
        bot.sendMessage(chatId, cm.text, { parse_mode: 'HTML', reply_markup: cm.reply_markup }).catch(() => {});
      });
    }
    _pairingWaiters.delete(sessionId);
  });

  // ── Connection confirmed ──────────────────────────────────────────────────
  botEvents.on('status', ({ sessionId, status, user }) => {
    if (status !== 'connected') return;
    const chatId = _pairingChats.get(sessionId);
    if (!chatId) return;
    _pairingChats.delete(sessionId);

    const phone = sessionId.replace('tg_', '');
    const name  = user?.name || user?.notify || user?.verifiedName || '';
    bot.sendMessage(chatId,
      `🎉 <b>WhatsApp Connected!</b>\n${DIV}\n\n` +
      `📱 Number: <code>+${esc(phone)}</code>\n` +
      (name ? `👤 Name: <b>${esc(name)}</b>\n` : '') +
      `🟢 Status: <b>Active &amp; Running</b>\n\n` +
      `Your bot is now live on WhatsApp!\n\n` +
      `💡 <i>Use <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a> to access bot features on Telegram.</i>` + FOOTER,
      HTML
    ).catch(() => {});
  });

  // ── /start — open to everyone ─────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name   = esc(msg.from?.first_name || 'there');
    const isAdm  = chatId === OWNER_ID;

    const kb = isAdm
      ? {
          inline_keyboard: [
            [{ text: '📱 Get Pairing Code', callback_data: 'do_pair'       }],
            [{ text: '❓ How to Connect',   callback_data: 'how_connect'    },
             { text: '🤖 Bot Features',     callback_data: 'bot_features'   }],
            [{ text: '⚙️ Admin Panel',      callback_data: 'admin_panel'    }],
          ],
        }
      : KB_HOME;

    sendText(bot, chatId,
      `👋 <b>Hello, ${name}!</b>\n\n` +
      `🤖 <b>AA MD Bot — WhatsApp Pairing</b>\n${DIV}\n\n` +
      `Connect your WhatsApp number to the bot and get access to 190+ features!\n\n` +
      `📱 <b>Get your pairing code</b> — link any WhatsApp number\n` +
      `❓ <b>How to Connect</b> — step-by-step guide\n` +
      `🤖 <b>Bot Features</b> — see what the bot can do\n\n` +
      `<i>After connecting, use <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a> for Telegram features.</i>` + FOOTER,
      { reply_markup: kb }
    );
  });

  // ── /pair [phone] — open to everyone ─────────────────────────────────────
  bot.onText(/\/pair(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw    = (match[1] || '').replace(/[^0-9]/g, '');

    if (raw && raw.length >= 7 && raw.length <= 15) {
      _awaitingPhone.delete(chatId);
      return doPair(bot, chatId, raw);
    }

    const sent = await bot.sendMessage(chatId,
      `📱 <b>Enter Your WhatsApp Number</b>\n${DIV}\n\n` +
      `Send your number with country code (digits only, no + sign):\n\n` +
      `• 🇵🇰 Pakistan: <code>923001234567</code>\n` +
      `• 🇸🇦 Saudi: <code>9665XXXXXXXX</code>\n` +
      `• 🇦🇪 UAE: <code>971XXXXXXXXX</code>\n` +
      `• 🇬🇧 UK: <code>447XXXXXXXXX</code>\n` +
      `• 🇺🇸 USA: <code>1XXXXXXXXXX</code>\n\n` +
      `<i>No + sign, no spaces, no dashes.</i>` + FOOTER,
      { ...HTML, reply_markup: { force_reply: true, selective: true } }
    ).catch(() => null);

    if (sent) _awaitingPhone.set(chatId, { msgId: sent.message_id });
  });

  // ── /help — open to everyone ──────────────────────────────────────────────
  bot.onText(/\/help/, (msg) => {
    sendText(bot, msg.chat.id, HOW_CONNECT_TEXT + FOOTER, { reply_markup: KB_BACK, disable_web_page_preview: true });
  });

  // ── Inline callback handler ───────────────────────────────────────────────
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId  = query.message.message_id;
    const isAdm  = chatId === OWNER_ID;
    await bot.answerCallbackQuery(query.id).catch(() => {});

    switch (query.data) {

      case 'home': {
        const kb = isAdm
          ? { inline_keyboard: [
                [{ text: '📱 Get Pairing Code', callback_data: 'do_pair'    }],
                [{ text: '❓ How to Connect',   callback_data: 'how_connect' },
                 { text: '🤖 Bot Features',     callback_data: 'bot_features'}],
                [{ text: '⚙️ Admin Panel',      callback_data: 'admin_panel' }],
              ] }
          : KB_HOME;
        editOrSend(bot, chatId, msgId,
          `🤖 <b>AA MD Bot — WhatsApp Pairing</b>\n${DIV}\n\n` +
          `<i>Use <a href="https://t.me/aa_md_2bot">@aa_md_2bot</a> for Telegram bot features.</i>` + FOOTER,
          { reply_markup: kb }
        );
        break;
      }

      case 'do_pair':
        editOrSend(bot, chatId, msgId,
          `📱 <b>Enter Your WhatsApp Number</b>\n${DIV}\n\n` +
          `Reply with your number (country code + digits, no + sign):\n\n` +
          `• 🇵🇰 Pakistan: <code>923001234567</code>\n` +
          `• 🇸🇦 Saudi: <code>9665XXXXXXXX</code>\n` +
          `• 🇦🇪 UAE: <code>971XXXXXXXXX</code>` + FOOTER,
          { reply_markup: KB_BACK }
        );
        _awaitingPhone.set(chatId, { msgId });
        break;

      case 'how_connect':
        editOrSend(bot, chatId, msgId, HOW_CONNECT_TEXT + FOOTER,
          { reply_markup: KB_BACK, disable_web_page_preview: true });
        break;

      case 'bot_features':
        editOrSend(bot, chatId, msgId, BOT_FEATURES_TEXT + FOOTER,
          { reply_markup: KB_BACK, disable_web_page_preview: true });
        break;

      // ── Admin-only callbacks ────────────────────────────────────────────
      case 'admin_panel':
        if (!isAdm) return bot.answerCallbackQuery(query.id, { text: '🔒 Admin only', show_alert: true }).catch(() => {});
        editOrSend(bot, chatId, msgId,
          `⚙️ <b>Admin Panel</b>\n${DIV}\n\n` +
          `Manage bot sessions and broadcasts.` + FOOTER,
          { reply_markup: KB_ADMIN }
        );
        break;

      case 'admin_sessions':
        if (!isAdm) return bot.answerCallbackQuery(query.id, { text: '🔒 Admin only', show_alert: true }).catch(() => {});
        try {
          const sessions = _getAllSessions ? await _getAllSessions() : [];
          const list = sessions.length
            ? sessions.map((s, i) => `${i + 1}. <code>${esc(s.sessionId)}</code> — ${s.status || 'unknown'}`).join('\n')
            : '<i>No active sessions</i>';
          editOrSend(bot, chatId, msgId,
            `📊 <b>Active Sessions (${sessions.length})</b>\n${DIV}\n\n${list}` + FOOTER,
            { reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'admin_panel' }]] } }
          );
        } catch {
          editOrSend(bot, chatId, msgId, `❌ Could not fetch sessions.` + FOOTER, { reply_markup: KB_BACK });
        }
        break;

      case 'admin_broadcast':
        if (!isAdm) return bot.answerCallbackQuery(query.id, { text: '🔒 Admin only', show_alert: true }).catch(() => {});
        editOrSend(bot, chatId, msgId,
          `📢 <b>Broadcast</b>\n${DIV}\n\n` +
          `Send a message to broadcast to all connected WhatsApp sessions:\n\n` +
          `Reply with: <code>/broadcast Your message here</code>` + FOOTER,
          { reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'admin_panel' }]] } }
        );
        break;

      default: {
        // "Copy Code" button — send code as separate copyable message
        if (query.data.startsWith('copy_code_')) {
          const code = query.data.slice('copy_code_'.length);
          await bot.answerCallbackQuery(query.id, { text: '✅ Code sent — tap it to copy!' }).catch(() => {});
          await bot.sendMessage(chatId,
            `🔑 <b>Your Pairing Code</b>\n\n<code>${esc(code)}</code>\n\n<i>👆 Tap the code above to copy it automatically</i>`,
            HTML
          ).catch(() => {});
          return;
        }

        // "Request New Code" button — restart pairing for same number
        if (query.data.startsWith('repair_')) {
          const phone = query.data.slice('repair_'.length);
          await bot.answerCallbackQuery(query.id).catch(() => {});
          return doPair(bot, chatId, phone, msgId);
        }
      }
    }
  });

  // ── /ping — open to everyone ─────────────────────────────────────────────
  bot.onText(/\/ping/, async (msg) => {
    const t0   = Date.now();
    const sent = await bot.sendMessage(msg.chat.id, '🏓 <i>Pinging...</i>', HTML).catch(() => null);
    if (!sent) return;
    const ms   = Date.now() - t0;
    const upSec = Math.floor(process.uptime());
    const up = upSec > 3600
      ? `${Math.floor(upSec/3600)}h ${Math.floor((upSec%3600)/60)}m`
      : `${Math.floor(upSec/60)}m ${upSec%60}s`;
    bot.editMessageText(
      `🏓 <b>Pong!</b>  <code>${ms}ms</code>\n${DIV}\n\n` +
      `⏱ <b>Uptime:</b> ${esc(up)}\n` +
      `💾 <b>RAM:</b> ${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB\n` +
      `📦 <b>Node:</b> ${esc(process.version)}` + FOOTER,
      { chat_id: msg.chat.id, message_id: sent.message_id, parse_mode: 'HTML' }
    ).catch(() => {});
  });

  // ── /status — open to everyone ────────────────────────────────────────────
  bot.onText(/\/status/, async (msg) => {
    try {
      const sessions = _getAllSessions ? await _getAllSessions() : [];
      const connected = sessions.filter(s => s.status === 'connected' || s.connected).length;
      const upSec = Math.floor(process.uptime());
      const up = upSec > 3600
        ? `${Math.floor(upSec/3600)}h ${Math.floor((upSec%3600)/60)}m`
        : `${Math.floor(upSec/60)}m ${upSec%60}s`;
      sendText(bot, msg.chat.id,
        `📊 <b>Bot Status</b>\n${DIV}\n\n` +
        `🟢 <b>Online</b> — Bot is running\n` +
        `⏱ <b>Uptime:</b> ${esc(up)}\n` +
        `💾 <b>RAM:</b> ${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB / ${Math.round(os.totalmem()/1024/1024)}MB\n` +
        `📱 <b>Sessions:</b> ${sessions.length} total, ${connected} connected\n` +
        `📦 <b>Node.js:</b> ${esc(process.version)}` + FOOTER
      );
    } catch {
      sendText(bot, msg.chat.id, `📊 Bot is online.\n\nUptime: ${Math.floor(process.uptime())}s` + FOOTER);
    }
  });

  // ── /disconnect — admin only ──────────────────────────────────────────────
  bot.onText(/\/disconnect(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.chat.id !== OWNER_ID) return;
    const phone = (match[1] || '').replace(/[^0-9]/g, '');
    if (!phone) return sendText(bot, msg.chat.id,
      `📵 <b>Disconnect Session</b>\n${DIV}\n\nUsage: <code>/disconnect 923001234567</code>\n\nUse /sessions to see active sessions.` + FOOTER
    );
    try {
      // Pairing sessions are always named tg_<phone> (see doPair()).
      const sessionId = `tg_${phone}`;
      if (!_deleteSession) throw new Error('Session manager not ready');
      await _deleteSession(sessionId);
      sendText(bot, msg.chat.id,
        `✅ <b>Session Disconnected</b>\n\n📱 Number: <code>+${esc(phone)}</code>\n\nThe session has been removed.` + FOOTER
      );
    } catch (e) {
      sendText(bot, msg.chat.id, `❌ Failed: ${esc(e.message)}` + FOOTER);
    }
  });

  // ── /broadcast — admin only ───────────────────────────────────────────────
  bot.onText(/\/broadcast(?:\s+(.+))?/s, async (msg, match) => {
    if (msg.chat.id !== OWNER_ID) return;
    const text = (match[1] || '').trim();
    if (!text) return sendText(bot, msg.chat.id, `❌ Provide a message.\nUsage: /broadcast Your message`);

    try {
      // Actually deliver — previously this emitted an event nobody listened to
      // and reported success anyway.
      if (!_sockets || !_sockets.size) throw new Error('No sessions are connected');

      let sent = 0, failed = 0;
      for (const [, sock] of _sockets) {
        const selfJid = sock?.user?.id;
        if (!selfJid) { failed++; continue; }
        try {
          await sock.sendMessage(selfJid, { text: `📢 *Broadcast*\n\n${text}\n\n> 🤖 *AA MD Bot*` });
          sent++;
          await new Promise(r => setTimeout(r, 800)); // avoid WA rate limits
        } catch {
          failed++;
        }
      }

      sendText(bot, msg.chat.id,
        `📢 <b>Broadcast Complete</b>\n${DIV}\n\n` +
        `✅ Sent: <b>${sent}</b>\n` +
        `❌ Failed: <b>${failed}</b>\n\n` +
        `<i>${esc(text.slice(0, 100))}</i>` + FOOTER
      );
    } catch (e) {
      sendText(bot, msg.chat.id, `❌ Broadcast failed: ${esc(e.message)}` + FOOTER);
    }
  });

  // ── /sessions — admin only ────────────────────────────────────────────────
  bot.onText(/\/sessions/, async (msg) => {
    if (msg.chat.id !== OWNER_ID) return;
    try {
      const sessions = _getAllSessions ? await _getAllSessions() : [];
      const list = sessions.length
        ? sessions.map((s, i) => `${i + 1}. <code>${esc(s.sessionId)}</code> — ${s.status || 'unknown'}`).join('\n')
        : '<i>No active sessions</i>';
      sendText(bot, msg.chat.id,
        `📊 <b>Sessions (${sessions.length})</b>\n${DIV}\n\n${list}` + FOOTER
      );
    } catch {
      sendText(bot, msg.chat.id, `❌ Could not fetch sessions.`);
    }
  });

  // ── Catch-all: handle phone number replies + unknown commands ─────────────
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text   = (msg.text || '').trim();
    if (!text || text.startsWith('/')) return;

    // Handle phone number from interactive flow (everyone can pair)
    if (_awaitingPhone.has(chatId)) {
      const { msgId } = _awaitingPhone.get(chatId);
      _awaitingPhone.delete(chatId);

      const phone = text.replace(/[^0-9]/g, '');
      if (!phone || phone.length < 7 || phone.length > 15) {
        return sendText(bot, chatId,
          `❌ Invalid number format.\n\nSend digits only with country code.\nExample: <code>923001234567</code>`,
          HTML
        );
      }
      return doPair(bot, chatId, phone, msgId);
    }
  });

  bot.on('polling_error', (err) => {
    logger.warn({ code: err.code, msg: err.message }, '🤖 Telegram admin polling error');
  });

  logger.info('🤖 Telegram pairing bot started (open pairing / admin-restricted controls)');
  return bot;
}
