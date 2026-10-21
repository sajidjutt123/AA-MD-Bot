// AA MD Bot — YouTube Channel Stalk
// Uses: DavidCyrilTech /stalk/youtube
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

export default {
  command: 'ytstalk',
  alias: ['ytchannel', 'youtubestalk', 'youtubeinfo', 'ytprofile'],
  description: 'Look up a YouTube channel — subscribers, videos, description',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const username = (text || '').replace(/^@/, '').trim().split(/\s+/)[0];
    if (!username) return reply(
      `📺 *YouTube Channel Lookup*\n\n` +
      `*Usage:* ${prefix}ytstalk <channel name or @handle>\n` +
      `*Examples:*\n` +
      `• ${prefix}ytstalk MrBeast\n` +
      `• ${prefix}ytstalk @pewdiepie\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    try {
      const { data } = await axios.get(`${DC}/stalk/youtube`, {
        params: { username },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (!data?.success) throw new Error(data?.error || 'Channel not found');

      const d = data;
      let text_ =
        `📺 *YouTube Channel*\n` +
        `${'─'.repeat(28)}\n\n` +
        `📌 *Name:* ${d.name || 'N/A'}\n` +
        `🔖 *Handle:* ${d.username || '@' + username}\n`;

      if (d.description && d.description !== 'N/A') {
        text_ += `📝 *About:* ${d.description.slice(0, 150)}${d.description.length > 150 ? '…' : ''}\n`;
      }

      text_ += `\n📊 *Stats*\n`;
      text_ += `• Subscribers: *${d.subscribers || 'Hidden'}*\n`;
      if (d.channelId) text_ += `• Channel ID: \`${d.channelId}\`\n`;
      if (d.url)       text_ += `\n🔗 ${d.url}\n`;
      text_ += `\n> 🤖 *AA MD Bot*`;

      if (d.image) {
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
      reply(`❌ *YouTube Lookup Failed*\n\nCouldn't find channel *${username}*.\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
