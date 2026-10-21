import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://translate.google.com/' };

const SE_VOICES = { en:'Brian', ar:'Zeina', de:'Marlene', fr:'Celine', es:'Conchita', pt:'Ines', it:'Carla', ru:'Tatyana', ja:'Mizuki', ko:'Seoyeon', zh:'Zhiyu', nl:'Lotte' };
const TT_VOICES = { en:'en_us_001', ar:'ar_001', de:'de_001', fr:'fr_001', es:'es_002', pt:'pt_br_001', it:'it_001', ja:'jp_001', ko:'kr_001', tr:'tr_001' };

async function toOpus(rawBuf) {
  const tmpDir  = path.join(__dirname, '../../temp');
  await fs.ensureDir(tmpDir);
  const id     = generateId();
  const tmpIn  = path.join(tmpDir, `${id}.mp3`);
  const tmpOut = path.join(tmpDir, `${id}.ogg`);
  await fs.writeFile(tmpIn, rawBuf);
  try {
    await runFfmpeg(['-y', '-i', tmpIn, '-c:a', 'libopus', '-ar', '48000', '-ac', '1', '-b:a', '64k', tmpOut], 20000);
    const buf = await fs.readFile(tmpOut);
    return buf;
  } finally {
    fs.remove(tmpIn).catch(() => {});
    fs.remove(tmpOut).catch(() => {});
  }
}

export default {
  command: 'tts',
  alias: ['texttospeech', 'speak', 'voice'],
  description: 'Convert text to speech (voice note)',
  category: 'download',
  usage: '.tts [lang] <text>  |  .tts ur Assalamu Alaikum',
  cooldown: 5,

  execute: async ({ reply, sock, jid, msg, args }) => {
    if (!args.length) {
      return reply(
        `🔊 *Text to Speech*\n\n` +
        `Usage: *.tts [lang] <text>*\n\n` +
        `Examples:\n` +
        `• *.tts en* Hello World\n` +
        `• *.tts ur* آپ کیسے ہیں\n` +
        `• *.tts hi* नमस्ते दुनिया\n` +
        `• *.tts ar* مرحبا بالعالم\n` +
        `• *.tts de* Hallo Welt\n` +
        `• *.tts fr* Bonjour le monde\n\n` +
        `🌍 Langs: en ur hi ar de fr es pt it ja ko tr zh ru`
      );
    }

    let lang = 'en', text;
    if (/^[a-z]{2,5}$/i.test(args[0]) && args.length > 1) {
      lang = args[0].toLowerCase();
      text = args.slice(1).join(' ');
    } else {
      text = args.join(' ');
    }

    if (text.length > 200) return reply('❌ Text too long — max 200 characters.');

    await sock.sendMessage(jid, { text: '🔊 _Generating speech..._' }, { quoted: msg });

    let rawBuf = null;

    // Try 0: DavidCyrilTech speechma (PRIMARY — supports voice/pitch/rate)
    if (!rawBuf) {
      try {
        const res = await axios.get(
          `https://apis.davidcyriltech.my.id/tools/speechma`,
          {
            params: { text, voice: 'Andrew', pitch: 2, rate: 1 },
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }
        );
        const buf = Buffer.from(res.data);
        if (buf.length > 500) rawBuf = buf;
      } catch {}
    }

    // Try 1: Google Translate TTS
    if (!rawBuf) {
      try {
        const res = await axios.get(
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&ttsspeed=1`,
          { responseType: 'arraybuffer', timeout: 12000, headers: UA }
        );
        if (res.data?.byteLength > 500) rawBuf = Buffer.from(res.data);
      } catch {}
    }

    // Try 2: Google at-client
    if (!rawBuf) {
      try {
        const res = await axios.get(
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=at&ttsspeed=1`,
          { responseType: 'arraybuffer', timeout: 12000, headers: UA }
        );
        if (res.data?.byteLength > 500) rawBuf = Buffer.from(res.data);
      } catch {}
    }

    // Try 3: TikTok TTS worker
    if (!rawBuf) {
      try {
        const voice = TT_VOICES[lang] || 'en_us_001';
        const res = await axios.post(
          'https://tiktok-tts.weilnet.workers.dev/api/generation',
          { text, voice },
          { headers: { 'Content-Type': 'application/json' }, timeout: 12000 }
        );
        if (res.data?.success && res.data?.data) {
          const buf = Buffer.from(res.data.data, 'base64');
          if (buf.byteLength > 500) rawBuf = buf;
        }
      } catch {}
    }

    // Try 4: StreamElements
    if (!rawBuf && SE_VOICES[lang]) {
      try {
        const res = await axios.get(
          `https://api.streamelements.com/kappa/v2/speech?voice=${SE_VOICES[lang]}&text=${encodeURIComponent(text)}`,
          { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (res.data?.byteLength > 500) rawBuf = Buffer.from(res.data);
      } catch {}
    }

    if (!rawBuf) {
      return reply('❌ TTS unavailable right now. Try again shortly.\n_Supported: en ur hi ar de fr es ja ko_');
    }

    // Convert to OGG Opus (WhatsApp voice note)
    try {
      const opusBuf = await toOpus(rawBuf);
      await sock.sendMessage(jid, {
        audio: opusBuf,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      }, { quoted: msg });
    } catch {
      // Fallback: send as MP3
      await sock.sendMessage(jid, {
        audio: rawBuf,
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: msg });
    }
  },
};
