import { saveNow } from '../../lib/database.js';

const RESERVED = /^[a-zA-Z0-9]$/; // a letter/number would clash with plain words

export default {
  command: 'setprefix',
  alias: ['prefix'],
  description: 'Change the bot command prefix',
  category: 'owner',
  ownerOnly: true,
  usage: '.setprefix <symbol> | .setprefix reset',
  async execute({ reply, args, db }) {
    const stored = db.settings.getValue('prefix');
    const current = Array.isArray(stored) ? stored : stored ? [stored] : ['.'];

    if (!args[0]) {
      return reply(
        `🔧 *Current Prefix:* ${current.join(', ')}\n\n` +
        `*Usage:*\n` +
        `• .setprefix !      — use ! as the prefix\n` +
        `• .setprefix reset  — back to "."\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    if (args[0].toLowerCase() === 'reset') {
      db.settings.setValue('prefix', ['.']);
      await saveNow('settings');
      return reply(`✅ Prefix reset to: *.*\n\nTry *.menu*`);
    }

    const newPrefix = args[0].slice(0, 3);

    if (/\s/.test(newPrefix)) {
      return reply('❌ The prefix cannot contain spaces.');
    }
    if (RESERVED.test(newPrefix)) {
      return reply(
        `❌ *${newPrefix}* is a letter/number — using it would eat normal words.\n` +
        `Pick a symbol, e.g. *!*  *#*  */*  *$*`
      );
    }

    // Stored as an array (that is the shape `.menu`/`getPrefixes()` expect).
    db.settings.setValue('prefix', [newPrefix]);
    await saveNow('settings');

    return reply(
      `✅ *Prefix changed* to: *${newPrefix}*\n\n` +
      `Try it: *${newPrefix}menu*\n\n` +
      `> 🤖 *AA MD Bot*`
    );
  },
};
