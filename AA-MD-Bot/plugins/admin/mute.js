export default {
  command: 'mute',
  alias: ['lock', 'close', 'lockgroup'],
  description: 'Mute the group (admins only can send)',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  async execute({ sock, jid, reply, db }) {
    try {
      await sock.groupSettingUpdate(jid, 'announcement');
      db.groups.set(jid, { muted: true });
      reply('🔇 Group has been *muted*. Only admins can send messages now.');
    } catch (err) {
      reply('❌ Failed to mute. Please try again in a few seconds.');
    }
  },
};
