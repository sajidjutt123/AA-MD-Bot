export default {
  command: 'readmore',
  alias: ['rm', 'fake'],
  description: 'Create a "Read More" message with hidden text',
  category: 'tools',
  usage: '.readmore <visible> | <hidden>',

  async execute({ reply, sock, jid, msg, text }) {
    if (!text) {
      return reply(
        `📄 *Read More / Fake Blur*\n\n` +
        `Usage: *.readmore <visible> | <hidden>*\n\n` +
        `Example:\n*.readmore Hello! | This text is hidden behind read more button*`
      );
    }

    const parts = text.split('|');
    if (parts.length < 2) {
      return reply('❌ Use | to separate visible and hidden text.\n\nExample: .readmore Hello | Hidden text here');
    }

    const visible = parts[0].trim();
    const hidden  = parts.slice(1).join('|').trim();
    const invisible = '\u200B'.repeat(1500);

    await sock.sendMessage(jid, {
      text: `${visible}${invisible}${hidden}`,
    }, { quoted: msg });
  },
};
