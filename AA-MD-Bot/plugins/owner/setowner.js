export default {
  command: 'setowner',
  description: 'Add a permanent bot owner',
  category: 'owner',
  ownerOnly: true,
  superOwnerOnly: true,
  async execute({ reply, args, msg, db }) {
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const targets = mentions.length ? mentions.map(j => j.split('@')[0]) : args;
    if (!targets.length) return reply('❌ Usage: .setowner @user or .setowner number');
    const settings = db.settings.get();
    const owners = settings.owners || [];
    const added = [];
    for (const t of targets) {
      const num = t.replace(/[^0-9]/g, '');
      if (!owners.includes(num)) { owners.push(num); added.push(num); }
    }
    db.settings.setValue('owners', owners);
    reply(`✅ *Owners Updated*\n\n👑 Added: ${added.map(n => `+${n}`).join(', ') || 'Already owner'}\n👑 Total Owners: ${owners.length}`);
  },
};
