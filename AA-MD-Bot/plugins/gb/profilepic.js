// ============================================
// AA MD Bot - Profile Pic Viewer (GB Feature)
// View & download anyone's full profile picture
// ============================================

export default {
  command: 'pp',
  alias: ['profilepic', 'pfp', 'dpview', 'getpp', 'viewdp', 'spp', 'profile'],
  category: 'gb',
  description: 'View & download full profile picture of any contact',
  usage: '.pp <number> | .pp (reply to a message)',

  async execute({ reply, react, sock, jid, msg, args, quoted, senderJid }) {
    let targetJid = null;

    // If replying to a message — get that person's JID
    if (quoted?.key?.participant || quoted?.key?.remoteJid) {
      const p = quoted.key.participant || quoted.key.remoteJid;
      const num = p?.split('@')[0]?.split(':')[0];
      if (num) targetJid = `${num}@s.whatsapp.net`;
    }

    // If number given as argument
    if (!targetJid && args[0]) {
      const num = args[0].replace(/\D/g, '');
      if (num.length >= 7) targetJid = `${num}@s.whatsapp.net`;
    }

    // Default: sender's own profile pic
    if (!targetJid) {
      targetJid = senderJid;
    }

    await react('⏳');

    try {
      const ppUrl = await sock.profilePictureUrl(targetJid, 'image').catch(() => null);

      if (!ppUrl) {
        await react('❌');
        return reply(
          `❌ *Profile picture not available.*\n\n` +
          `Either the contact has hidden their DP or has no profile picture.`
        );
      }

      const { getBuffer } = await import('../../lib/helper.js');
      const buf = await getBuffer(ppUrl);

      const num = targetJid.split('@')[0];
      await sock.sendMessage(jid, {
        image  : buf,
        caption: `🖼️ *Profile Picture*\n\n📱 +${num}\n\n> 📲 *AA MD Bot*`,
      }, { quoted: msg });

      await react('✅');

    } catch (err) {
      await react('❌');
      reply(`❌ Could not fetch profile picture.\n_${err.message?.slice(0, 60)}_`);
    }
  },
};
