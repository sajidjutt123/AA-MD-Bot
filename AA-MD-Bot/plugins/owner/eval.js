export default {
  command: 'eval',
  alias: ['>'],
  description: 'Evaluate JavaScript code (owner only)',
  category: 'owner',
  ownerOnly: true,
  superOwnerOnly: true,
  async execute({ reply, text, sock, db, config }) {
    if (!text) return reply('❌ Usage: .eval [code]');
    try {
      let result = await eval(`(async () => { ${text} })()`);
      if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
      reply(`✅ *Eval Result*\n\n\`\`\`${result?.substring(0, 3000) || 'undefined'}\`\`\``);
    } catch (err) {
      reply(`❌ *Error*\n\n\`\`\`${err.message}\`\`\``);
    }
  },
};
