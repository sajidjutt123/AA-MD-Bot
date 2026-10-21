export default {
  command: 'unmute',
  alias: ['unlock', 'open', 'unlockgroup'],
  description: 'Unmute the group (everyone can send)',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  async execute({ sock, jid, reply, db }) {
    try {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      db.groups.set(jid, { muted: false });
      reply('🔊 Group has been *unmuted*. Everyone can send messages now.');
    } catch (err) {
      reply('❌ Failed to unmute. Please try again in a few seconds.');
    }
  },
};
