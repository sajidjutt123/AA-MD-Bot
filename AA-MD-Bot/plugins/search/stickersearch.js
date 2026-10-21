import axios from 'axios';

export default {
  command: 'stickersearch',
  alias: ['findsticker', 'gifsticker', 'searchsticker'],
  description: 'Search and send a sticker via Tenor',
  category: 'search',
  async execute({ sock, msg, jid, text, react, reply, prefix, config }) {
    if (!text) {
      await react('❔');
      return reply(`Please provide a sticker Search Term !\n\n*${prefix}stickersearch Cheems bonk*`);
    }
    await react('🧧');
    try {
      // The published key that used to live here was public — set your own
      // TENOR_API_KEY (free at https://developers.google.com/tenor).
      const tenorApiKey = process.env.TENOR_API_KEY || config?.apiKeys?.tenor;
      if (!tenorApiKey) {
        await react('❔');
        return reply(
          `🔑 *Sticker search needs an API key.*\n\n` +
          `Add this line to *.env* and restart:\n` +
          `TENOR_API_KEY=your_key_here\n\n` +
          `Get a free key at https://developers.google.com/tenor`
        );
      }
      const gif = await axios.get(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(text)}&key=${tenorApiKey}&client_key=aa_md_bot&limit=8&media_filter=gif`,
        { timeout: 10000 }
      );
      const results = gif.data.results;
      if (!results || results.length === 0) {
        await react('❌');
        return reply(`No stickers found for: *${text}*`);
      }
      const resultst = Math.floor(Math.random() * results.length);
      const gifUrl = results[resultst].media_formats?.gif?.url || results[resultst].media_formats?.tinygif?.url;
      if (!gifUrl) {
        await react('❌');
        return reply(`No stickers found for: *${text}*`);
      }
      await sock.sendMessage(jid, {
        video: { url: gifUrl },
        gifPlayback: true,
        caption: `🧧 *${text}*`,
      }, { quoted: msg });
    } catch (err) {
      console.error('Sticker search error:', err.message);
      await react('❌');
      return reply('❌ Sticker search failed. Please try again in a few seconds.');
    }
  },
};
