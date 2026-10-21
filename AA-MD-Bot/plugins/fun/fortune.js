const fortunes = [
  '🌟 A great opportunity awaits you today.',
  '💰 Wealth is coming your way — stay patient.',
  '❤️ Love is just around the corner.',
  '🎯 Your hard work will pay off soon.',
  '🚀 Take the leap — this is your moment.',
  '🍀 Lucky numbers today: 7, 14, 21, 42, 77',
  '⚠️ Be cautious with your words today.',
  '🌈 After the storm comes a rainbow.',
  '📚 A wise decision will change your life.',
  '🤝 Trust your closest friend today.',
  '⚡ Expect the unexpected — in a good way!',
  '🎁 A surprise gift is on its way to you.',
];

export default {
  command: 'fortune',
  alias: ['lucky'],
  description: 'Get your fortune for today',
  category: 'fun',
  async execute({ reply }) {
    const f = fortunes[Math.floor(Math.random() * fortunes.length)];
    reply(`🔮 *Fortune Teller*\n\n${f}\n\n🌙 May the stars guide you!`);
  },
};
