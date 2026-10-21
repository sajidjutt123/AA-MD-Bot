import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../../temp');

export default {
  command: 'flip',
  alias: ['mirror', 'flop'],
  description: 'Flip/mirror an image (horizontal or vertical)',
  category: 'media',
  async execute({ reply, sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasImage = quoted?.imageMessage || msg.message?.imageMessage;
    if (!hasImage) return reply('❌ Reply to an *image* with .flip [h/v]\nh = horizontal, v = vertical');

    const direction = args[0]?.toLowerCase() === 'v' ? 'vflip' : 'hflip';
    fs.ensureDirSync(tmpDir);
    const id = generateId();

    try {
      const buffer = await downloadMediaMessage({ message: quoted ? { imageMessage: hasImage } : msg.message, key: msg.key }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      const inputPath = path.join(tmpDir, `${id}_in.jpg`);
      const outputPath = path.join(tmpDir, `${id}_flip.jpg`);
      await fs.writeFile(inputPath, buffer);
      await runFfmpeg(['-y', '-i', inputPath, '-vf', direction, outputPath], 15000);
      const resultBuffer = await fs.readFile(outputPath);
      await sock.sendMessage(jid, { image: resultBuffer, caption: `🔄 Flipped ${direction === 'hflip' ? 'horizontally' : 'vertically'}` }, { quoted: msg });
      await fs.remove(inputPath).catch(() => {});
      await fs.remove(outputPath).catch(() => {});
    } catch (err) {
      reply('❌ Flip failed. Please try again in a few seconds.');
    }
  },
};
