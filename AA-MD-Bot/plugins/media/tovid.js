// AA MD Bot — Sticker to MP4 Video
// Converts a replied WebP sticker to MP4 using ffmpeg

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

export default {
  command: 'tomp4',
  alias: ['tovideo', 'stickertomp4', 'sticker2video', 'tovid'],
  description: 'Convert a replied sticker to MP4 video',
  category: 'media',

  async execute({ sock, msg, jid, react, reply, quoted }) {
    const stickerMsg = quoted?.message?.stickerMessage;
    if (!stickerMsg) {
      await react('❌');
      return reply(
        `🎬 *Sticker to Video*\n\n` +
        `Reply to a *sticker* and send *.tomp4*\n` +
        `to convert it to MP4 video.\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }
    await react('⌛');
    const id = Date.now();
    const inp = path.join(TEMP, `stk_${id}.webp`);
    const out = path.join(TEMP, `stk_${id}.mp4`);
    try {
      await fs.ensureDir(TEMP);
      const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const stickerBuffer = Buffer.concat(chunks);
      await fs.writeFile(inp, stickerBuffer);

      await runFfmpeg(
        ['-i', inp,
         '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2',
         '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p',
         '-an', '-movflags', '+faststart', '-y', out],
        60000
      );

      if (!await fs.pathExists(out)) throw new Error('Conversion failed — output not created');
      const videoBuffer = await fs.readFile(out);
      if (videoBuffer.length < 1000) throw new Error('Output video too small');

      await sock.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: `🎬 *Sticker → Video*\n\n> 🤖 *AA MD Bot*`,
      }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await react('❌');
      reply(`❌ *Conversion failed:* ${e.message}\n\n> 🤖 *AA MD Bot*`);
    } finally {
      fs.remove(inp).catch(() => {});
      fs.remove(out).catch(() => {});
    }
  },
};
