// ============================================
// AA MD Bot - Report & Support Plugin
// Developer: Ahsan Ali | AA Mods
// ============================================

import config from '../../config.js';
import { getPrefixes } from '../../lib/helper.js';

const LINK = config.channelLink || 'https://whatsapp.com/channel/0029Vb8Yk2LL2AU78HliE617';

function getOwnerJid() {
  const num = (config.ownerNumber?.[0] || '').replace(/\D/g, '');
  return num ? `${num}@s.whatsapp.net` : null;
}

export default {
  command: 'support',
  alias: ['bug', 'contact', 'feedback'],
  description: 'Report an issue or contact the owner',
  category: 'utility',
  usage: '.report <message> | .contact | .support',

  async execute({ sock, jid, msg, senderJid, args, command }) {
    const cmd       = command.toLowerCase();
    const ownerJid  = getOwnerJid();
    const pref      = getPrefixes()[0];
    const pushName  = msg.pushName || 'Unknown';
    const senderNum = senderJid.split('@')[0];

    // .contact / .support — show owner contact info
    if (cmd === 'contact' || cmd === 'support') {
      const ownerNum = config.ownerNumber?.[0] || 'Not set';
      return sock.sendMessage(jid, {
        text:
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `   📞  *CONTACT / SUPPORT*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👨‍💻 *Owner:* ${config.ownerName || config.developer}\n` +
          `📱 *WhatsApp:* +${ownerNum.replace(/\D/g, '')}\n` +
          `🤖 *Bot:* ${config.botName}\n` +
          `🏢 *Brand:* ${config.brand}\n\n` +
          `💬 *Commands:*\n` +
          `  • *${pref}report <message>* — Report an issue\n` +
          `  • *${pref}bug <description>* — Report a bug\n` +
          `  • *${pref}feedback <message>* — Send feedback\n\n` +
          `📌 *To include your contact number:*\n` +
          `  ${pref}report .play not working | 03001234567\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🌐 ${LINK}`,
      }, { quoted: msg });
    }

    // .report / .bug / .feedback — forward to owner
    const rawInput = args.join(' ').trim();

    if (!rawInput) {
      const examples = {
        report:   `${pref}report .play is not working | 03001234567`,
        bug:      `${pref}bug Sticker command crashes`,
        feedback: `${pref}feedback Love the bot!`,
      };
      return sock.sendMessage(jid, {
        text:
          `⚠️ *Please include your message.*\n\n` +
          `📌 *Usage:*\n` +
          `  *${examples[cmd] || `${pref}${cmd} <message>`}*\n\n` +
          `💡 Add your phone number after *|* so the owner can reach you:\n` +
          `  *${pref}report .removebg gave broken image | 03001234567*`,
      }, { quoted: msg });
    }

    // Parse message and optional contact number (separated by |)
    const pipeIdx  = rawInput.indexOf('|');
    let userMsg    = rawInput;
    let contactNum = '';

    if (pipeIdx !== -1) {
      userMsg    = rawInput.slice(0, pipeIdx).trim();
      contactNum = rawInput.slice(pipeIdx + 1).trim().replace(/\D/g, '');
    }

    if (!userMsg) {
      return sock.sendMessage(jid, {
        text: `⚠️ Please include a message before the | symbol.`,
      }, { quoted: msg });
    }

    const typeMap = {
      report:   { emoji: '🚨', label: 'Report'   },
      bug:      { emoji: '🐛', label: 'Bug Report'},
      feedback: { emoji: '💬', label: 'Feedback'  },
    };
    const { emoji, label } = typeMap[cmd] || { emoji: '📩', label: 'Message' };
    const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    const displayContact = contactNum || senderNum;

    // Confirm to sender
    await sock.sendMessage(jid, {
      text:
        `✅ *${label} Sent!*\n\n` +
        `${emoji} Your message has been forwarded to the owner.\n\n` +
        `📝 *Your message:*\n_"${userMsg}"_\n` +
        (contactNum ? `📱 *Contact shared:* +${contactNum}\n` : '') +
        `\n⏳ The owner will get back to you soon.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 ${LINK}`,
    }, { quoted: msg });

    // Forward to owner
    if (ownerJid) {
      try {
        await sock.sendMessage(ownerJid, {
          text:
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `  ${emoji}  *${label.toUpperCase()} RECEIVED*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *Name:* ${pushName}\n` +
            `📱 *WA Number:* +${senderNum}\n` +
            (contactNum ? `☎️ *Contact Number:* +${contactNum} ⬅️\n` : '') +
            `🕐 *Time:* ${now}\n\n` +
            `💬 *Message:*\n_"${userMsg}"_\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 Reply to this to contact them directly.`,
        });
      } catch (_) {}
    }
  },
};
