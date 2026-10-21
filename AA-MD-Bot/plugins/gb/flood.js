// ============================================
// AA MD Bot - Flood Message (GB WhatsApp Feature)
// Send a message multiple times (owner only)
// ============================================

export default {
  command: 'flood',
  alias: ['spam', 'multisend'],
  category: 'gb',
  description: 'Send a message multiple times (owner only)',
  usage: '.flood <count> <message>  e.g.  .flood 5 Hello!',
  ownerOnly: true,

  async execute({ reply, react, sock, jid, msg, args, isOwner }) {
    if (!isOwner) {
      return reply(`⛔ This command is for *bot owners only.*`);
    }

    if (args.length < 2) {
      return reply(
        `📨 *Flood Message*\n\n` +
        `*GB WhatsApp Feature* — Send a message multiple times\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `▸ *.flood 3 Hello!*        — Send 3 times\n` +
        `▸ *.flood 5 Good morning!* — Send 5 times\n\n` +
        `📌 Max: *10 messages* per command\n` +
        `📌 Interval: 1 second between each\n\n` +
        `> 🤖 *Powered by AA MD Bot*`
      );
    }

    const count = parseInt(args[0]);
    if (isNaN(count) || count < 1) {
      return reply(`❌ Invalid count. Use a number like *.flood 5 Hello!*`);
    }
    if (count > 10) {
      return reply(`❌ Max *10 messages* allowed per flood command.`);
    }

    const message = args.slice(1).join(' ').trim();
    if (!message) {
      return reply(`❌ Please include a message.\n\nExample: *.flood 3 Hello!*`);
    }

    await react('⏳');

    let sent = 0;
    for (let i = 0; i < count; i++) {
      try {
        await sock.sendMessage(jid, { text: message });
        sent++;
        // 1-second delay between messages to avoid rate limiting
        if (i < count - 1) await new Promise(r => setTimeout(r, 1000));
      } catch {
        break;
      }
    }

    await react('✅');
    // Small confirmation (won't flood the counter)
    setTimeout(() => {
      reply(`✅ Sent *${sent}/${count}* messages.`).catch(() => {});
    }, 500);
  },
};
