// AA MD Bot — Pinterest Profile Lookup
// Uses: DavidCyrilTech /stalk/pinterest
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

export default {
  command: 'pinstalk',
  alias: ['pinterestalk', 'pinterestinfo', 'pininfo'],
  description: 'Look up a Pinterest profile — boards, description',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const username = (text || '').replace(/^@/, '').trim().split(/\s+/)[0];
    if (!username) return reply(
      `📌 *Pinterest Profile Lookup*\n\n` +
      `*Usage:* ${prefix}pinstalk <username>\n` +
      `*Example:* ${prefix}pinstalk nasa\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    try {
      const { data } = await axios.get(`${DC}/stalk/pinterest`, {
        params: { username },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (!data?.success) throw new Error(data?.error || 'Profile not found');

      const d = data;
      let text_ =
        `📌 *Pinterest Profile*\n` +
        `${'─'.repeat(28)}\n\n` +
        `👤 *Name:* ${d.name || d.username}\n` +
        `🔖 *Username:* ${d.username}\n`;

      if (d.description) text_ += `📝 *About:* ${d.description.slice(0, 200)}${d.description.length > 200 ? '…' : ''}\n`;

      if (d.url) text_ += `\n🔗 ${d.url}\n`;
      text_ += `\n> 📌 *AA MD Bot*`;

      // Pinterest image is usually a generic placeholder — only send if it looks like a real avatar
      const hasRealImg = d.image && !d.image.includes('default_open_graph');
      if (hasRealImg) {
        await sock.sendMessage(jid, {
          image: { url: d.image },
          caption: text_,
        }, { quoted: msg }).catch(() => reply(text_));
      } else {
        await reply(text_);
      }

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Pinterest Lookup Failed*\n\nCouldn't find *${username}*.\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
