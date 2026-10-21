import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';
import config from '../../config.js';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../../temp');

export default {
  command: 'sticker',
  alias: ['s', 'stiker'],
  description: 'Convert image/video to WhatsApp sticker',
  category: 'media',
  async execute({ reply, sock, jid, msg }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const msgContent = quoted || msg.message;
    const hasImage = msgContent?.imageMessage;
    const hasVideo = msgContent?.videoMessage;
    const hasSticker = msgContent?.stickerMessage;

    if (!hasImage && !hasVideo && !hasSticker) {
      return reply('❌ Reply to or send an *image/video* with .sticker\n\nFlags:\n--author [name]\n--pack [pack name]');
    }

    await reply('⏳ Creating sticker...');
    fs.ensureDirSync(tmpDir);
    const id = generateId();

    try {
      let buffer;
      let isAnimated = false;

      if (hasImage) {
        buffer = await downloadMediaMessage({ message: quoted ? { imageMessage: hasImage } : msg.message, key: msg.key }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      } else if (hasVideo) {
        buffer = await downloadMediaMessage({ message: quoted ? { videoMessage: hasVideo } : msg.message, key: msg.key }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        isAnimated = true;
      } else if (hasSticker) {
        buffer = await downloadMediaMessage({ message: quoted ? { stickerMessage: hasSticker } : msg.message, key: msg.key }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      }

      if (!buffer) throw new Error('Failed to download media');

      const inputPath = path.join(tmpDir, `${id}_input${isAnimated ? '.mp4' : '.jpg'}`);
      const outputPath = path.join(tmpDir, `${id}_output.webp`);

      await fs.writeFile(inputPath, buffer);

      if (isAnimated) {
        await runFfmpeg(['-y', '-i', inputPath, '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000', '-loop', '0', '-preset', 'default', '-an', '-vsync', '0', '-t', '5', outputPath], 30000);
      } else {
        await runFfmpeg(['-y', '-i', inputPath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000', outputPath], 15000);
      }

      const stickerBuffer = await fs.readFile(outputPath);

      await sock.sendMessage(jid, {
        sticker: stickerBuffer,
      }, { quoted: msg });

      await fs.remove(inputPath).catch(() => {});
      await fs.remove(outputPath).catch(() => {});

    } catch (err) {
      if (err.message.includes('ffmpeg')) {
        reply('❌ Sticker creation is temporarily unavailable. Please try again in a few seconds.');
      } else {
        reply('❌ Sticker creation failed. Please try again in a few seconds.');
      }
    }
  },
};
