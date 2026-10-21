// ============================================
// AA MD Bot - Password Generator
// Commands: .password .genpass .passwd
// Generates cryptographically strong passwords
// ============================================

export default {
  command: 'password',
  alias: ['genpass', 'passwd', 'passgen', 'pass'],
  description: 'Generate a strong random password',
  category: 'tools',

  async execute({ args, reply, prefix }) {
    const len     = Math.min(Math.max(parseInt(args[0]) || 16, 6), 64);
    const noSym   = (args[1] || '').toLowerCase() === 'nosym';
    const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower   = 'abcdefghijklmnopqrstuvwxyz';
    const digits  = '0123456789';
    const syms    = '!@#$%^&*()-_=+[]{}|;:,.<>?';
    const charset = upper + lower + digits + (noSym ? '' : syms);

    // Guarantee at least one of each type
    let pwd = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      ...(noSym ? [] : [syms[Math.floor(Math.random() * syms.length)]]),
    ];
    while (pwd.length < len) pwd.push(charset[Math.floor(Math.random() * charset.length)]);
    pwd = pwd.sort(() => Math.random() - 0.5).join('');

    const strength = len >= 24 ? '🟢 *Very Strong*' : len >= 16 ? '🟡 *Strong*' : len >= 10 ? '🟠 *Moderate*' : '🔴 *Weak*';
    const entropy  = Math.floor(len * Math.log2(charset.length));

    reply(
      `🔐 *Password Generator*\n\n` +
      `\`\`\`${pwd}\`\`\`\n\n` +
      `📏 Length: *${len}*\n` +
      `💪 Strength: ${strength}\n` +
      `🔢 Entropy: ~${entropy} bits\n\n` +
      `💡 *Tips:*\n` +
      `• ${prefix}password 20 — 20-char password\n` +
      `• ${prefix}password 12 nosym — no symbols\n\n` +
      `> 🔐 *AA MD Bot*`
    );
  },
};
