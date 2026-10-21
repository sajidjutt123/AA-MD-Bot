const responses = [
  '✅ It is certain', '✅ It is decidedly so', '✅ Without a doubt',
  '✅ Yes definitely', '✅ You may rely on it', '✅ As I see it, yes',
  '✅ Most likely', '✅ Outlook good', '✅ Yes', '✅ Signs point to yes',
  '🤔 Reply hazy, try again', '🤔 Ask again later', '🤔 Better not tell you now',
  '🤔 Cannot predict now', '🤔 Concentrate and ask again',
  '❌ Don\'t count on it', '❌ My reply is no', '❌ My sources say no',
  '❌ Outlook not so good', '❌ Very doubtful',
];

export default {
  command: '8ball',
  alias: ['magic8'],
  description: 'Ask the magic 8-ball a question',
  category: 'fun',
  async execute({ reply, text }) {
    if (!text) return reply('❌ Ask me a yes/no question!\nExample: .8ball Will I be rich?');
    const answer = responses[Math.floor(Math.random() * responses.length)];
    reply(`🎱 *Magic 8-Ball*\n\n❓ ${text}\n\n${answer}`);
  },
};
