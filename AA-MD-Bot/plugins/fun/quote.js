import axios from 'axios';

export default {
  command: 'quote',
  alias: ['motivation'],
  description: 'Get an inspirational quote',
  category: 'fun',
  async execute({ reply }) {
    try {
      const res = await axios.get('https://zenquotes.io/api/random');
      const { q, a } = res.data[0];
      reply(`💡 *Quote of the Moment*\n\n"${q}"\n\n— *${a}*`);
    } catch {
      const quotes = [
        { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
        { q: 'It does not matter how slowly you go as long as you do not stop.', a: 'Confucius' },
        { q: 'Success is not final, failure is not fatal.', a: 'Winston Churchill' },
        { q: 'In the middle of every difficulty lies opportunity.', a: 'Albert Einstein' },
        { q: 'Believe you can and you\'re halfway there.', a: 'Theodore Roosevelt' },
      ];
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      reply(`💡 *Inspirational Quote*\n\n"${q.q}"\n\n— *${q.a}*`);
    }
  },
};
