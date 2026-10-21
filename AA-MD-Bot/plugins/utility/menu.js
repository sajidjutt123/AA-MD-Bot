// ============================================
// AA MD Bot - Main Menu
// Clean, role-aware, duplicate-free
// SuperOwner commands → .smenu only
// Owner commands → visible to owner only
// ============================================

import { plugins } from "../../lib/pluginLoader.js";
import config from "../../config.js";
import { db } from "../../lib/database.js";
import { getPrefixes } from "../../lib/helper.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Banner ────────────────────────────────────────────────────────────────────
function getBanner() {
  for (const p of [
    path.join(__dirname, "../../banner.jpeg"),
    path.join(__dirname, "../../banner.jpg"),
  ]) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}

// ── Newsletter context ────────────────────────────────────────────────────────
function getCtx() {
  const jid = global._AA_NEWSLETTER_JID;
  if (!jid) return null;
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: jid,
      newsletterName: global._AA_NEWSLETTER_NAME || "AA MD Bot",
      serverMessageId: Math.floor(Math.random() * 99999) + 1,
    },
  };
}

const FOOTER = `\n> 🤖 *AA MD Bot*  •  👨‍💻 *Ahsan Ali Wadani*`;

// ── Category display config ───────────────────────────────────────────────────
const CAT_CFG = {
  download: { e: "⬇️", n: "DOWNLOADS", max: 20 },
  search: { e: "🔍", n: "SEARCH & AI", max: 30 },
  media: { e: "🎨", n: "MEDIA TOOLS", max: 30 },
  fun: { e: "🎮", n: "FUN & GAMES", max: 25 },
  group: { e: "👥", n: "GROUP", max: 18 },
  admin: { e: "🛡️", n: "GROUP ADMIN", max: 20 },
  tools: { e: "🔧", n: "TOOLS", max: 35 },
  utility: { e: "🛠️", n: "UTILITY", max: 20 },
  gb: { e: "📱", n: "GB FEATURES", max: 8 },
  islamic: { e: "☪️", n: "ISLAMIC", max: 0 },
};
const CAT_ORDER = [
  "download",
  "search",
  "media",
  "fun",
  "group",
  "admin",
  "tools",
  "utility",
  "gb",
  "islamic",
];

// Owner-control commands shown only to owners (in Owner Quick-Access section)
const OWNER_GB_CMDS = new Set([
  "afk",
  "alwaysonline",
  "autoread",
  "autoreply",
  "flood",
  "ghost",
  "onlinealert",
  "typing",
  "autoreact",
  "anticall",
  "antispam",
]);
const OWNER_TOOLS_CMDS = new Set([
  "backup",
  "dbstats",
  "logs",
  "reload",
  "speedtest",
  "system",
  "memory",
]);
// SuperOwner-only commands — never in .menu (only in .smenu)
const SUPER_CMDS = new Set([
  "eval",
  "shell",
  "broadcast",
  "maintenance",
  "setnewsletter",
  "followchannel",
  "adddevice",
  "deldevice",
  "devices",
  "addowner",
  "delowner",
  "setowner",
  "banuser",
  "smenu",
  "supermenu",
  "devmenu",
  "adminpanel",
  "backup",
  "database",
  "logs",
  "reload",
  "system",
]);

// Greeting helper
function greet() {
  const h = new Date().getUTCHours() + 5;
  if (h < 6 || h >= 20) return "🌙 Assalamualaikum";
  if (h < 12) return "🌅 Assalamualaikum";
  if (h < 17) return "☀️ Assalamualaikum";
  return "🌆 Assalamualaikum";
}

// ── Build deduplicated, role-filtered plugin map ──────────────────────────────
function buildCategoryMap(isOwner) {
  const seen = new Set();
  const catMap = {};

  for (const plugin of plugins.values()) {
    const mainCmd = Array.isArray(plugin.command)
      ? plugin.command[0]
      : plugin.command;
    if (!mainCmd || seen.has(mainCmd)) continue;
    seen.add(mainCmd);

    const cat = (plugin.category || "general").toLowerCase();

    // Always skip owner category from public menus
    if (cat === "owner") continue;

    // Never show superOwner-only commands in .menu
    if (plugin.superOwnerOnly) continue;
    if (SUPER_CMDS.has(mainCmd)) continue;

    // Non-owners: skip ownerOnly commands and owner-specific GB/tools commands
    if (!isOwner) {
      if (plugin.ownerOnly) continue;
      if (cat === "gb" && OWNER_GB_CMDS.has(mainCmd)) continue;
      if (cat === "tools" && OWNER_TOOLS_CMDS.has(mainCmd)) continue;
    }

    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push({
      cmd: mainCmd,
      desc: (plugin.description || "").slice(0, 42),
      ownerOnly: !!plugin.ownerOnly,
    });
  }

  return catMap;
}

// ── Render a category box ─────────────────────────────────────────────────────
// catKey = the actual category key (e.g. 'admin', 'download') for deep-link accuracy
function renderCat(emoji, label, cmds, pref, max, catKey) {
  const shown = max > 0 ? cmds.slice(0, max) : cmds;
  const more = cmds.length - shown.length;

  let box = `\n╭── ${emoji}  *${label}*  (${cmds.length})\n│\n`;
  for (const { cmd, desc } of shown) {
    const d = desc ? `\n│     _${desc}_` : "";
    box += `│  ▸ *${pref}${cmd}*${d}\n│\n`;
  }
  if (more > 0) {
    box += `│  _…+${more} more → *${pref}menu ${catKey}*_\n│\n`;
  }
  box += `╰${"─".repeat(32)}\n`;
  return box;
}

// ── Single-category detail view ───────────────────────────────────────────────
function renderCatDetail(cat, cmds, pref) {
  const cfg = CAT_CFG[cat] || { e: "📌", n: cat.toUpperCase() };
  let text = `╔══════════════════════════════════╗\n`;
  text += `║  ${cfg.e}  *${cfg.n} COMMANDS*\n`;
  text += `╚══════════════════════════════════╝\n`;
  for (const { cmd, desc } of cmds) {
    text += `\n▸ *${pref}${cmd}*`;
    if (desc) text += `\n  ╰ _${desc}_`;
    text += `\n`;
  }
  text += `\n> 💡 *${pref}menu* — back to main menu`;
  return text;
}

export default {
  command: "menu",
  alias: ["help", "commands", "cmds"],
  description: "Show all available commands",
  category: "utility",
  usage: ".menu | .menu <category>",

  async execute({ sock, jid, msg, isOwner, args, senderJid }) {
    const settings = db.settings.get();
    const pushName = msg.pushName || "User";
    const pref = getPrefixes()[0];
    const mode = (settings.botMode ?? config.botMode ?? "public").toUpperCase();
    const isSuperOwnerUser =
      senderJid?.split("@")[0]?.split(":")[0] === String(config.superOwner);
    const role = isSuperOwnerUser
      ? "👑 Super Owner"
      : isOwner
        ? "🔑 Owner"
        : "👤 User";

    const upSec = Math.floor(process.uptime());
    const upH = Math.floor(upSec / 3600);
    const upM = Math.floor((upSec % 3600) / 60);
    const uptime = upH > 0 ? `${upH}h ${upM}m` : `${upM}m ${upSec % 60}s`;
    const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const catMap = buildCategoryMap(isOwner);
    const totalCmds = Object.values(catMap).reduce((s, a) => s + a.length, 0);
    const ctx = getCtx();

    // ── Single-category detail view ─────────────────────────────────────────
    if (args[0]) {
      const key = args[0].toLowerCase();
      const matched = CAT_ORDER.find((c) => c.startsWith(key)) || key;
      const cmds = catMap[matched];

      if (!cmds?.length) {
        const list = CAT_ORDER.filter((c) => catMap[c]?.length)
          .map(
            (c) =>
              `  ${(CAT_CFG[c] || {}).e || "📌"} *${c}*  (${catMap[c].length})`,
          )
          .join("\n");
        const payload = {
          text: `❌ Category *"${key}"* not found.\n\n📦 *Available:*\n${list}${FOOTER}`,
        };
        if (ctx) payload.contextInfo = ctx;
        return sock.sendMessage(jid, payload, { quoted: msg });
      }

      let detail = renderCatDetail(matched, cmds, pref) + FOOTER;
      const payload = { text: detail };
      if (ctx) payload.contextInfo = ctx;
      return sock.sendMessage(jid, payload, { quoted: msg });
    }

    // ── Full menu ───────────────────────────────────────────────────────────
    const greeting = isSuperOwnerUser
      ? `👑 *${greet()}, Ahsan Bhai!*\n_Super Owner — Full Access_`
      : isOwner
        ? `🔑 *${greet()}, Owner!*\n_Bot control panel active_`
        : `✨ *${greet()}, ${pushName}!*\n_Welcome to AA MD Bot_`;

    let menu = "";

    // Header
    menu += `╭─────────────────────────────╮\n`;
    menu += `   🤖 *A A   M D   B O T*\n`;
    menu += `   👨‍💻 Ahsan Ali Wadani \n`;
    menu += `╰─────────────────────────────╯\n\n`;
    menu += `${greeting}\n`;

    // Status bar
    menu += `\n╭── 📊  *STATUS*\n`;
    menu += `│  🟢 Online  •  ⏱️ ${uptime}  •  💾 ${usedMB}MB\n`;
    menu += `│  Prefix: *${pref}*   Mode: *${mode}*   Role: ${role}\n`;
    menu += `│  📦 *${totalCmds}* commands loaded\n`;
    menu += `╰${"─".repeat(32)}\n`;

    // ── Owner Controls first (at the top) ──────────────────────────────────
    if (isOwner) {
      menu += `\n╭── ⚙️  *OWNER CONTROLS*\n`;
      menu += `│\n`;
      menu += `│  🔒 *Privacy & Stealth*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}ghost on/off*\n`;
      menu += `│     _Appear offline to everyone_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}alwaysonline on/off*\n`;
      menu += `│     _Always show online status_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}privacy*\n`;
      menu += `│     _Last seen, DP, blue ticks settings_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}fls 8:30pm / 20:30*\n`;
      menu += `│     _Set custom last seen time (daily)_\n`;
      menu += `│  ▸ *${pref}fls off* — disable fake last seen\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}anticall on/off*\n`;
      menu += `│     _Block incoming calls_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}autoreact on/off*\n`;
      menu += `│     _Auto emoji react to messages_\n`;
      menu += `│\n`;
      menu += `│  👁️ *View-Once Reveal*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}antiviewonce on/off*\n`;
      menu += `│     _Auto-reveal all view-once to (You) chat_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}vv* — reply to view-once\n`;
      menu += `│     _Silently reveal → sent to (You) chat_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}avv* — reply to view-once\n`;
      menu += `│     _Same as .vv (alternate command)_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}good* — reply to view-once\n`;
      menu += `│     _Silent reveal, no reply to sender_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}nice* — reply to view-once\n`;
      menu += `│     _Silent reveal, no reply to sender_\n`;
      menu += `│\n`;
      menu += `│  🧹 *Message Tools*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}stripfwd* — reply to any message\n`;
      menu += `│     _Re-send without "View Channel" & "Forwarded" tags_\n`;
      menu += `│\n`;
      menu += `│  🗑️ *Deleted Messages*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}antidelete on/off*\n`;
      menu += `│     _Recover deleted msgs → (You) chat_\n`;
      menu += `│\n`;
      menu += `│  🤖 *Auto Features*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}autoread on/off*\n`;
      menu += `│     _Silent read all messages_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}autoreply <msg>*\n`;
      menu += `│     _Auto reply when busy_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}afk <reason>*\n`;
      menu += `│     _Set AFK status with reason_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}onlinealert <num>*\n`;
      menu += `│     _Alert when contact comes online_\n`;
      menu += `│\n`;
      menu += `│  ⚙️ *Bot Settings*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}bs*\n`;
      menu += `│     _Full settings panel_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}mode public/private*\n`;
      menu += `│     _Change bot access mode_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}setprefix <char>*\n`;
      menu += `│     _Change command prefix_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}antispam on/off*\n`;
      menu += `│     _Anti-spam message filter_\n`;
      menu += `│\n`;
      menu += `│  🤖 *AI & Chatbot*\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}ai <question>*\n`;
      menu += `│     _Powerful AI chat — multi-model, remembers context_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}aivideo <prompt>*\n`;
      menu += `│     _Generate AI videos from text (free, no key needed)_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}chatbot on/off*\n`;
      menu += `│     _Group chatbot — reply when @mentioned (per group)_\n`;
      menu += `│\n`;
      menu += `│  ▸ *${pref}autoreply <msg>*\n`;
      menu += `│     _Static auto reply when busy_\n`;
      menu += `│\n`;
      menu += `│  📱 *Telegram*\n`;
      menu += `│\n`;
      menu += `│  ▸ Admin Bot: /start → /pair <phone>\n`;
      menu += `│     _Get WhatsApp pairing code on Telegram_\n`;
      menu += `│\n`;
      menu += `│  ▸ Features Bot: /help\n`;
      menu += `│     _YT • TikTok • FB • Weather • AI • more_\n`;
      menu += `│\n`;
      if (isSuperOwnerUser) {
        menu += `│  👑 *${pref}smenu*\n`;
        menu += `│     _Super Owner control panel_\n`;
        menu += `│\n`;
      }
      menu += `╰${"─".repeat(32)}\n`;

      // ── Islamic quick-access (after owner controls) ───────────────────────
      menu += `\n╭── ☪️  *ISLAMIC PANEL*  (${catMap["islamic"]?.length || 61})\n`;
      menu += `│  ▸ *${pref}islamicmenu* — Full Islamic command panel\n`;
      menu += `│  _Duas • Zikr • Hadith • Kalimas • Adhkar • Salah_\n`;
      menu += `╰${"─".repeat(32)}\n`;

      // ── GB features quick-access ──────────────────────────────────────────
      menu += `\n╭── 📱  *GB FEATURES*\n`;
      menu += `│  ▸ *${pref}gbmenu* — Full GB WhatsApp-like features\n`;
      menu += `│  _Ghost • Privacy • AutoRead • ViewOnce • OnlineAlert_\n`;
      menu += `╰${"─".repeat(32)}\n`;
    }

    // ── 🆕 New & Updated Commands ──────────────────────────────────────────
    menu += `\n╭── 🆕  *NEW & UPDATED COMMANDS*\n`;
    menu += `│\n`;
    menu += `│  🤖 *AI Models*\n`;
    menu += `│  ▸ *${pref}gpt55*        — GPT-5.5\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}claude*       — Claude Sonnet 4.6\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}deepseek*     — DeepSeek v4 Pro\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}gemini*       — Gemini 3 Pro\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}gpt5*         — GPT-5\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}grok*         — Grok 4.1 Fast\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}mistral*      — Mistral AI\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}llama*        — Llama AI\n`;
    menu += `│\n`;
    menu += `│  🎨 *Media / Canvas*\n`;
    menu += `│  ▸ *${pref}jail*         — Jail bars overlay on image\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}aiedit*       — AI image editor\n`;
    menu += `│\n`;
    menu += `│  🔍 *Search / Stalk*\n`;
    menu += `│  ▸ *${pref}telestalk*    — Telegram profile lookup\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}igstalk*      — Instagram profile lookup\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}wachannel*    — WhatsApp channel stalk\n`;
    menu += `│\n`;
    menu += `│  ⬇️ *Downloads*\n`;
    menu += `│  ▸ *${pref}moviedl*      — Movie download\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}apk*          — APK downloader\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}fb*           — Facebook video\n`;
    menu += `│\n`;
    menu += `│  🔧 *Tools*\n`;
    menu += `│  ▸ *${pref}igboost*      — Instagram view booster\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}tiktokboost*  — TikTok view booster\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}ytboost*      — YouTube view booster\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}boost*        — Universal view booster (auto-detect)\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}livescore*    — Live sports scores\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}translate*    — Translate text\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}aidetect*    — Detect if text is AI or human-written\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}tts*         — Text to speech\n`;
    menu += `│\n`;
    menu += `│  ▸ *${pref}ss*          — Website screenshot\n`;
    menu += `╰${"─".repeat(32)}\n`;

    // ── Public categories ───────────────────────────────────────────────────
    // Skip 'islamic' and 'gb' — already shown above for owners; summary below for users
    const SKIP_FOR_OWNER = isOwner ? new Set(["islamic", "gb"]) : new Set();

    const orderedCats = [
      ...CAT_ORDER.filter((c) => catMap[c]?.length),
      ...Object.keys(catMap).filter(
        (c) => !CAT_ORDER.includes(c) && catMap[c]?.length,
      ),
    ];

    for (const cat of orderedCats) {
      if (SKIP_FOR_OWNER.has(cat)) continue;
      const cmds = catMap[cat];
      if (!cmds?.length) continue;
      const cfg = CAT_CFG[cat] || { e: "📌", n: cat.toUpperCase(), max: 8 };

      if (cat === "islamic") {
        // For non-owners, show islamic summary at the bottom
        menu += `\n╭── ☪️  *ISLAMIC*  (${cmds.length})\n`;
        menu += `│  ▸ *${pref}islamicmenu* — Full Islamic command panel\n`;
        menu += `│  _Duas • Zikr • Hadith • Kalimas • Adhkar • Salah_\n`;
        menu += `╰${"─".repeat(32)}\n`;
        continue;
      }

      menu += renderCat(cfg.e, cfg.n, cmds, pref, cfg.max || 8, cat);

      // After fun category — show .gf, .bf and .ppcouple subcommands detail
      if (cat === "fun") {
        menu += `\n╭── 💕  *AI GIRLFRIEND — AYLA*\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}gf* <message>\n`;
        menu += `│     _Chat with Ayla — she remembers your convo_\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}gf mood* — Ayla's current mood\n`;
        menu += `│  ▸ *${pref}gf level* — your relationship level\n`;
        menu += `│  ▸ *${pref}gf gift* — send her a virtual gift 🎁\n`;
        menu += `│  ▸ *${pref}gf mode adult* — Enable Adult Mood of GF\n`;
        menu += `│  ▸ *${pref}gf mode normal* — reset to normal chat mode\n`;
        menu += `│  ▸ *${pref}gf reset* — start fresh\n`;
        menu += `│  ▸ *${pref}gf help* — full command list\n`;
        menu += `│\n`;
        menu += `│  _💡 Relationship grows with every message!_\n`;
        menu += `╰${"─".repeat(32)}\n`;

        menu += `\n╭── 💙  *AI BOYFRIEND — ZAYAN*\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}bf* <message>\n`;
        menu += `│     _Chat with Zayan_\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}bf mood* — see his current mood\n`;
        menu += `│  ▸ *${pref}bf level* — your relationship level\n`;
        menu += `│  ▸ *${pref}bf gift* — send him a virtual gift\n`;
        menu += `│  ▸ *${pref}bf lang* — change language\n`;
        menu += `│  ▸ *${pref}bf reset* — start over fresh\n`;
        menu += `│  ▸ *${pref}bf help* — this menu\n`;
        menu += `│\n`;
        menu += `╰${"─".repeat(32)}\n`;

        menu += `\n╭── 🌸  *ANIME PROFILE PICTURES*\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}ppcouple*\n`;
        menu += `│     _Random anime couple — boy + girl PP_\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}ppboy* — random anime boy PP\n`;
        menu += `│  ▸ *${pref}ppgirl* — random anime girl PP\n`;
        menu += `│\n`;
        menu += `│  _Aliases: ${pref}ppcp  ${pref}couplepp  ${pref}animepic_\n`;
        menu += `╰${"─".repeat(32)}\n`;

        menu += `\n╭── 🔞  *ADULT CONTENT  (18+)*\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}xv* <search>\n`;
        menu += `│     _Search & download XVideos video_\n`;
        menu += `│     _Aliases: ${pref}xvideos  ${pref}xvid  ${pref}xvideo_\n`;
        menu += `│\n`;
        menu += `│  ▸ *${pref}asian* <keyword>\n`;
        menu += `│     _Asian content preview clip_\n`;
        menu += `│     _Aliases: ${pref}asianvideo  ${pref}asiandl_\n`;
        menu += `│\n`;
        menu += `│  ⚠️ _Adults only. Use responsibly._\n`;
        menu += `╰${"─".repeat(32)}\n`;
      }
    }

    // Footer tips
    menu += `\n╭── 💡  *TIPS*\n`;
    menu += `│  ▸ *${pref}menu download* — all download commands\n`;
    menu += `│  ▸ *${pref}menu search*   — all AI & search commands\n`;
    menu += `│  ▸ *${pref}menu fun*      — all fun & games\n`;
    if (!isOwner) {
      menu += `│  ▸ *${pref}islamicmenu* — full Islamic panel\n`;
    }
    menu += `╰${"─".repeat(32)}\n`;
    menu += FOOTER;

    const banner = getBanner();
    const payload = banner
      ? { image: banner, caption: menu, mimetype: "image/jpeg" }
      : { text: menu };
    if (ctx) payload.contextInfo = ctx;

    try {
      await sock.sendMessage(jid, payload, { quoted: msg });
    } catch {
      const fallback = { text: menu };
      if (ctx) fallback.contextInfo = ctx;
      await sock.sendMessage(jid, fallback, { quoted: msg });
    }
  },
};
