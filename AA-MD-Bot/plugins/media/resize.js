import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../../temp');

export default {
  command: 'resize',
  alias: ['scale', 'resizeimg'],
  description: 'Resize an image to custom dimensions',
  category: 'media',
  async execute({ reply, sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasImage = quoted?.imageMessage || msg.message?.imageMessage;
    if (!hasImage) return reply('❌ Reply to an *image* with .resize [width] [height]\nExample: .resize 512 512');

    const width = parseInt(args[0]) || 512;
    const height = parseInt(args[1]) || width;
    if (width > 4096 || height > 4096) return reply('❌ Max size: 4096x4096');

    fs.ensureDirSync(tmpDir);
    const id = generateId();

    try {
      const buffer = await downloadMediaMessage({ message: quoted ? { imageMessage: hasImage } : msg.message, key: msg.key }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      const inputPath = path.join(tmpDir, `${id}_in.jpg`);
      const outputPath = path.join(tmpDir, `${id}_resized.jpg`);
      await fs.writeFile(inputPath, buffer);
      await runFfmpeg(['-y', '-i', inputPath, '-vf', `scale=${width}:${height}`, outputPath], 15000);
      const resultBuffer = await fs.readFile(outputPath);
      await sock.sendMessage(jid, { image: resultBuffer, caption: `📐 Resized to ${width}x${height}` }, { quoted: msg });
      await fs.remove(inputPath).catch(() => {});
      await fs.remove(outputPath).catch(() => {});
    } catch (err) {
      reply('❌ Resize failed. Please try again in a few seconds.');
    }
  },
};
