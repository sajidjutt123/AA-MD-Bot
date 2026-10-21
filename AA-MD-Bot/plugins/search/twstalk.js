// AA MD Bot — Twitter / X Profile Stalk
// Uses: DavidCyrilTech /stalk/twitter
import axios from 'axios';

const DC = 'https://apis.davidcyriltech.my.id';

function fmt(n) {
  if (!n && n !== 0) return 'N/A';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default {
  command: 'twstalk',
  alias: ['twitterstalk', 'twitterinfo', 'xstalk', 'xinfo'],
  description: 'Look up a Twitter / X profile — followers, tweets, bio',
  category: 'search',

  async execute({ text, reply, react, sock, jid, msg, prefix }) {
    const username = (text || '').replace(/^@/, '').trim().split(/\s+/)[0];
    if (!username) return reply(
      `🐦 *Twitter / X Profile Lookup*\n\n` +
      `*Usage:* ${prefix}twstalk <username>\n` +
      `*Example:* ${prefix}twstalk elonmusk\n\n` +
      `> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    try {
      const { data } = await axios.get(`${DC}/stalk/twitter`, {
        params: { username },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      if (!data?.success) throw new Error(data?.error || 'Profile not found');

      const d = data;
      let text_ =
        `🐦 *Twitter / X Profile*\n` +
        `${'─'.repeat(28)}\n\n` +
        `👤 *Name:* ${d.name || 'N/A'}\n` +
        `🔖 *Username:* @${d.username || username}\n`;

      if (d.bio)       text_ += `📝 *Bio:* ${d.bio}\n`;

      text_ +=
        `\n📊 *Stats*\n` +
        `• Followers: *${fmt(d.followers)}*\n` +
        `• Following: *${fmt(d.following)}*\n` +
        `• Tweets: *${fmt(d.tweets)}*\n` +
        `• Likes: *${fmt(d.likes)}*\n`;

      if (d.url) text_ += `\n🔗 ${d.url}\n`;
      text_ += `\n> 🤖 *AA MD Bot*`;

      // Send profile picture if available
      if (d.avatar) {
        await sock.sendMessage(jid, {
          image: { url: d.avatar },
          caption: text_,
        }, { quoted: msg }).catch(() => reply(text_));
      } else {
        await reply(text_);
      }

      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Twitter Lookup Failed*\n\nCouldn't find *@${username}*.\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
