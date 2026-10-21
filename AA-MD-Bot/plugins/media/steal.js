import config from '../../config.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export default {
  command: 'steal',
  alias: ['takesticker', 'getsticker'],
  description: 'Steal a sticker and add bot pack info',
  category: 'media',
  usage: '.steal [pack name] (reply to sticker)',

  async execute({ reply, sock, jid, msg, args }) {
    const packName = args.join(' ') || config.botName;

    const quoted  = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const msgContent = quoted || msg.message;
    const hasSticker = msgContent?.stickerMessage;

    if (!hasSticker) {
      return reply('⚠️ Reply to a *sticker* with .steal\n\nOptional: .steal [pack name]');
    }

    try {
      const buffer = await downloadMediaMessage({
        message: quoted ? { stickerMessage: hasSticker } : msg.message,
        key: msg.key,
      }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

      await sock.sendMessage(jid, {
        sticker: buffer,
        mimetype: 'image/webp',
      }, { quoted: msg });

    } catch (err) {
      reply('❌ Failed to steal sticker: ' + err.message);
    }
  },
};
