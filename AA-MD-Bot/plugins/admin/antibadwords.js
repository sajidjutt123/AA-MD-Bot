// ============================================
// AA MD Bot - Anti Bad Words (Group)
// Developer: Ahsan Ali | AA Mods
// ============================================

import { db } from '../../lib/database.js';

const DEFAULT_BAD_WORDS = [
  'fuck','shit','bitch','asshole','bastard','cunt','dick','pussy',
  'faggot','retard','whore','slut','motherfucker','bullshit','cock','rape',
];

// The canonical field is `badWordsList`. `badWords` is the legacy name that
// older groups still carry — read both, write only the canonical one.
function getCustomWords(grp) {
  const list = grp?.badWordsList;
  if (Array.isArray(list) && list.length) return list;
  return Array.isArray(grp?.badWords) ? grp.badWords : [];
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsBadWord(text, badWords) {
  const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  for (const word of badWords) {
    if (!word) continue;
    // Escape the term — a custom word like "c++" used to throw a SyntaxError.
    if (new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(lower)) return word;
  }
  return null;
}

// Called passively from sessionManager for every group message
export async function checkBadWords(msg, sock, sessionId) {
  if (!msg?.message || !msg?.key?.remoteJid?.endsWith('@g.us')) return;
  if (msg.key.fromMe) return;

  const chatJid = msg.key.remoteJid;
  const grp = db.groups.get(sessionId, chatJid) || {};
  if (!grp.antibadwords) return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || ''
  ).trim();

  if (!text) return;

  const custom = getCustomWords(grp);
  const badWords = new Set([...DEFAULT_BAD_WORDS, ...custom]);
  const found = containsBadWord(text, badWords);
  if (!found) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;

  try {
    // Delete the message
    await sock.sendMessage(chatJid, { delete: msg.key });
    // Warn the user
    await sock.sendMessage(chatJid, {
      text: `⚠️ @${senderJid.split('@')[0]} Bad language is not allowed here. Please be respectful!\n\n> 🤖 *AA MD Bot*`,
      mentions: [senderJid],
    });
  } catch {}
}

export default {
  command: 'antibadwords',
  alias: ['abw', 'antiswear', 'badwords'],
  description: 'Toggle bad word filter in groups. Add/remove custom words.',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ jid, args, reply, react, db }) {
    const sub = (args[0] || '').toLowerCase().trim();
    const grp = db.groups.get(jid) || {};
    const words = getCustomWords(grp);

    if (!sub || sub === 'status') {
      const status = grp.antibadwords ? '✅ ON' : '❌ OFF';
      return reply(
        `🚫 *Anti Bad Words*\n\n` +
        `Status: *${status}*\n` +
        `Custom words: ${words.length ? words.join(', ') : 'none'}\n` +
        `Built-in list: ${DEFAULT_BAD_WORDS.length} words\n\n` +
        `📋 *Commands:*\n` +
        `• *.antibadwords on* — enable\n` +
        `• *.antibadwords off* — disable\n` +
        `• *.antibadwords add <word>* — add custom word\n` +
        `• *.antibadwords remove <word>* — remove custom word\n` +
        `• *.antibadwords reset* — clear all custom words\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    if (sub === 'on' || sub === 'off') {
      const enable = sub === 'on';
      db.groups.set(jid, { antibadwords: enable });
      await react(enable ? '✅' : '❌');
      return reply(
        enable
          ? `✅ *Anti Bad Words enabled!*\n\nBad language will be auto-deleted.\n\n> 🤖 *AA MD Bot*`
          : `❌ *Anti Bad Words disabled.*\n\n> 🤖 *AA MD Bot*`
      );
    }

    if (sub === 'add') {
      const word = (args[1] || '').toLowerCase().trim();
      if (!word) return reply(`⚠️ Usage: *.antibadwords add <word>*\n\n> 🤖 *AA MD Bot*`);
      const next = [...new Set([...words, word])];
      db.groups.set(jid, { badWordsList: next, badWords: next });
      await react('✅');
      return reply(`✅ *Word "${word}" added to filter.*\n\nTotal custom: ${next.length}\n\n> 🤖 *AA MD Bot*`);
    }

    if (sub === 'remove' || sub === 'rm' || sub === 'del') {
      const word = (args[1] || '').toLowerCase().trim();
      if (!word) return reply(`⚠️ Usage: *.antibadwords remove <word>*\n\n> 🤖 *AA MD Bot*`);
      const next = words.filter(w => w !== word);
      db.groups.set(jid, { badWordsList: next, badWords: next });
      await react('✅');
      return reply(`✅ *Word "${word}" removed from filter.*\n\n> 🤖 *AA MD Bot*`);
    }

    if (sub === 'reset' || sub === 'clear') {
      db.groups.set(jid, { badWordsList: [], badWords: [] });
      await react('✅');
      return reply(`✅ *Custom bad words cleared.*\n\nThe built-in filter is still active.\n\n> 🤖 *AA MD Bot*`);
    }

    return reply(`❓ Unknown option *${sub}*.\n\nTry *.antibadwords* for the list of options.`);
  },
};
