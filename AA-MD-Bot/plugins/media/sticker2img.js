// AA MD Bot - Sticker to Image
// Converts WhatsApp sticker (WebP) → JPEG using ffmpeg or sharp
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');

// Use system ffmpeg (confirmed working) as primary, sharp as fallback
const FFMPEG = 'ffmpeg';

export default {
  command: 'sticker2img',
  alias: ['s2img', 'toimage', 'stickertoimage'],
  description: 'Convert WhatsApp sticker to image',
  category: 'media',

  async execute({ reply, react, sock, jid, msg }) {
    // Detect sticker in quoted OR direct message
    const quotedMsg  = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;

    if (!stickerMsg) {
      return reply(
        `🖼️ *Sticker to Image*\n\n` +
        `Reply to any *sticker* with *.sticker2img*\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    await react('⏳');

    try {
      // Build WAMessage for download
      const waMsg = quotedMsg
        ? {
            message: { stickerMessage: stickerMsg },
            key: {
              ...msg.key,
              id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key.id,
            },
          }
        : msg;

      const buffer = await downloadMediaMessage(
        waMsg, 'buffer', {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      if (!buffer?.length) throw new Error('Sticker download failed');

      await fs.ensureDir(TEMP);
      const id  = Date.now();
      const inp = path.join(TEMP, `s2i_${id}_in.webp`);
      const out = path.join(TEMP, `s2i_${id}_out.jpg`);

      let resultBuf = null;

      // ── Method 1: ffmpeg (handles animated stickers — extracts first frame) ──
      try {
        await fs.writeFile(inp, buffer);
        await runFfmpeg(
          ['-i', inp, '-vframes', '1', '-q:v', '2', '-y', out],
          30000
        );
        if (await fs.pathExists(out)) {
          const tmp = await fs.readFile(out);
          if (tmp.length > 100) resultBuf = tmp;
        }
      } catch (_) {
        // fall through to sharp
      } finally {
        await fs.remove(inp).catch(() => {});
        await fs.remove(out).catch(() => {});
      }

      // ── Method 2: sharp (static WebP only, but always available) ─────────
      if (!resultBuf) {
        try {
          resultBuf = await sharp(buffer)
            .jpeg({ quality: 90 })
            .toBuffer();
        } catch (_) {}
      }

      if (!resultBuf?.length) throw new Error('Conversion failed');

      await sock.sendMessage(jid, {
        image: resultBuf,
        caption: `🖼️ *Sticker → Image*\n\n> 🤖 *AA MD Bot*`,
        mimetype: 'image/jpeg',
      }, { quoted: msg });
      await react('✅');

    } catch (err) {
      await react('❌');
      reply(`❌ *Error:* ${err.message}\n\nMake sure you replied to a sticker.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
