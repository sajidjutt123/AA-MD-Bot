// AA MD Bot - Pinterest Downloader
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { YTDLP, YTDLP_FLAGS, getCookiesFlag } from '../../lib/ytdlp.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP = path.join(__dirname, '../../temp');
const PIN_RX = /https?:\/\/(www\.)?(pinterest\.(com|fr|de|co\.uk|jp|ca|it|es|com\.au|com\.mx|com\.br|pl)|pin\.it)\/[^\s]+/i;
const api = axios.create({ timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });

async function pindl(url) {
  // Method 1: pinterestdownloader.com API
  try {
    const { data } = await api.get(`https://pinterestdownloader.com/?url=${encodeURIComponent(url)}`);
    const m = data?.match(/"url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|jpg|jpeg|png|webp)[^"]*)"/);
    if (m?.[1]) return { type: m[1].includes('.mp4') ? 'video' : 'image', url: m[1] };
  } catch {}

  // Method 2: pindown API
  try {
    const { data } = await api.get(`https://api.pindl.com/api/pindl?url=${encodeURIComponent(url)}`);
    if (data?.data?.video_url) return { type: 'video', url: data.data.video_url };
    if (data?.data?.image_url) return { type: 'image', url: data.data.image_url };
  } catch {}

  return null;
}

async function ytdlpVideo(url) {
  await fs.ensureDir(TEMP);
  const out = path.join(TEMP, `pin_${Date.now()}.mp4`);
  const flags = YTDLP_FLAGS.split(/\s+/).filter(Boolean);
  const ck = getCookiesFlag(); const ckParts = ck ? ck.trim().split(/\s+/) : [];
  try {
    await execFileAsync(YTDLP, [
      ...flags, url, ...ckParts,
      '-f', 'best', '--no-playlist', '-o', out, '--quiet', '--no-warnings',
    ], { timeout: 60000 });
    if (await fs.pathExists(out)) {
      const buf = await fs.readFile(out);
      await fs.remove(out).catch(() => {});
      if (buf?.length > 10000) return buf;
    }
  } catch {}
  await fs.remove(out).catch(() => {});
  return null;
}

async function downloadBuf(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 100 * 1024 * 1024 });
  return Buffer.from(res.data);
}

export default {
  command: 'pinterest',
  alias: ['pindl', 'pindown'],
  description: 'Download Pinterest image or video',
  category: 'download',

  async execute({ sock, msg, jid, text, react, reply, prefix }) {
    let url = text?.trim();
    if (!url) {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (q) url = (q.conversation || q.extendedTextMessage?.text || '').trim();
    }
    if (!PIN_RX.test(url || '')) return reply(
      `📌 *Pinterest Downloader*\n\n*Usage:* ${prefix}pinterest <link>\n*Example:* ${prefix}pinterest https://pin.it/xxx\n\n> 🤖 *AA MD Bot*`
    );

    await react('⏳');
    url = url.match(PIN_RX)[0].replace(/[.,!?;]$/, '');

    try {
      // Try API methods first
      const r = await pindl(url);
      if (r) {
        const buf = await downloadBuf(r.url);
        if (r.type === 'video') {
          await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { image: buf, caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
        }
        return await react('✅');
      }

      // Fallback: yt-dlp (handles video pins)
      const buf = await ytdlpVideo(url);
      if (buf?.length) {
        await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: '📌 *Pinterest via AA MD Bot*' }, { quoted: msg });
        return await react('✅');
      }

      throw new Error('No downloadable media found');
    } catch (e) {
      await react('❌');
      reply(`❌ *Pinterest download failed*\n\nMake sure the link is a valid pin with image or video.\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
