// ============================================
// AA MD Bot - Islamic Menu Plugin
// Developer: Ahsan Ali | AA Mods
// ============================================

import { plugins } from '../../lib/pluginLoader.js';
import config from '../../config.js';
import { db } from '../../lib/database.js';
import { getPrefixes } from '../../lib/helper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNER_PATHS = [
  path.join(__dirname, '../../banner.jpeg'),
  path.join(__dirname, '../../banner.jpg'),
  path.join(__dirname, '../../assets/banner.jpg'),
];

function getBanner() {
  for (const p of BANNER_PATHS) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p); } catch {}
  }
  return null;
}

const CHANNEL_URL  = 'https://whatsapp.com/channel/0029Vb8Yk2LL2AU78HliE617';
const CHANNEL_NAME = 'AA MD Bot';

function getCtx() {
  const newsletterJid = global._AA_NEWSLETTER_JID;
  if (newsletterJid) {
    return {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid,
        newsletterName: global._AA_NEWSLETTER_NAME || CHANNEL_NAME,
        serverMessageId: Math.floor(Math.random() * 99999) + 1,
      },
    };
  }
  const thumb = getBanner();
  return {
    forwardingScore: 999,
    isForwarded: true,
    externalAdReply: {
      title: CHANNEL_NAME,
      body: 'AA Mods • Tap to join our channel',
      mediaType: 1,
      renderLargerThumbnail: false,
      showAdAttribution: true,
      sourceUrl: CHANNEL_URL,
      ...(thumb ? { thumbnail: thumb } : {}),
    },
  };
}

// Sub-category groupings for Islamic commands
const GROUPS = {
  '🤲 Duas': ['dua_', 'dua'],
  '📿 Zikr & Tasbeeh': ['zikr', 'tasbeeh', 'subhanallah', 'alhamdulillah', 'allahu', 'astaghfar'],
  '📖 Quran & Hadith': ['quran', 'hadith', 'surah', 'ayat', 'verse'],
  '🕌 Salah & Ibadah': ['salah', 'prayer', 'namaz', 'wudu', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
  '☪️ Kalimas & Adhkar': ['kalima', 'adhkar', 'adhkaar', 'shahada', 'tahlil'],
  '🌙 Islamic Info': ['islamic', 'islam', 'hijri', 'ramadan', 'hajj', 'zakat', 'qibla'],
};

function getGroup(name) {
  const lower = name.toLowerCase();
  for (const [label, keywords] of Object.entries(GROUPS)) {
    if (keywords.some(k => lower.includes(k))) return label;
  }
  return '☪️ Other Islamic';
}

export default {
  command: 'islamicmenu',
  alias: ['imenu', 'islamic_menu', 'islamiccmds', 'islamic'],
  description: 'Show all Islamic commands',
  category: 'islamic',
  usage: '.islamicmenu',

  async execute({ sock, jid, msg }) {
    const settings = db.settings.get();
    const pref = getPrefixes()[0];
    const contextInfo = getCtx();

    // Collect all Islamic commands
    const seen = new Set();
    const grouped = {};

    for (const plugin of plugins.values()) {
      const fileKey = plugin.file || plugin.command;
      if (seen.has(fileKey)) continue;
      seen.add(fileKey);

      const cat = (plugin.category || '').toLowerCase();
      if (cat !== 'islamic') continue;

      const cmds = [].concat(plugin.command);
      const aliases = [].concat(plugin.alias || []);
      const main = cmds[0];
      if (main === 'islamicmenu' || main === 'islamic_menu') continue;

      const short = aliases.find(a => a.length <= 5) || aliases[0] || null;
      const desc  = (plugin.description || '').slice(0, 30);
      const group = getGroup(main);

      if (!grouped[group]) grouped[group] = [];
      grouped[group].push({ main, short, desc });
    }

    const total = Object.values(grouped).reduce((a, b) => a + b.length, 0);

    let menu = `╔══════════════════════════════╗\n`;
    menu    += `║  ☪️  *ISLAMIC COMMANDS*  🤲    ║\n`;
    menu    += `║    *AA MD Bot — AA Mods*      ║\n`;
    menu    += `╚══════════════════════════════╝\n\n`;
    menu    += `بِسْمِ اللَّهِ الرَّحْمٰنِ الرَّحِيمِ\n\n`;
    menu    += `📦 *Total Islamic Commands:* ${total}\n`;
    menu    += `🔑 *Prefix:* ${pref}\n\n`;

    const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
      const order = ['🤲 Duas','📿 Zikr & Tasbeeh','📖 Quran & Hadith','🕌 Salah & Ibadah','☪️ Kalimas & Adhkar','🌙 Islamic Info','☪️ Other Islamic'];
      return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99);
    });

    for (const [group, cmds] of sortedGroups) {
      menu += `╔═══ ${group} ═══\n`;
      for (const { main, short, desc } of cmds) {
        const label = short
          ? `*${pref}${main}* / *${pref}${short}*`
          : `*${pref}${main}*`;
        menu += `│ ▸ ${label}${desc ? ` — ${desc}` : ''}\n`;
      }
    }

    menu += `\n╔══════════════════════════════╗\n`;
    menu += `║  🌙 *JazakAllah Khair* 🤲     ║\n`;
    menu += `╚══════════════════════════════╝\n`;
    menu += `📢 ${CHANNEL_URL}`;

    const banner = getBanner();
    try {
      if (banner) {
        await sock.sendMessage(jid, {
          image: banner,
          caption: menu,
          mimetype: 'image/jpeg',
          contextInfo,
        }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: menu, contextInfo }, { quoted: msg });
      }
    } catch {
      await sock.sendMessage(jid, { text: menu, contextInfo }, { quoted: msg });
    }
  },
};
