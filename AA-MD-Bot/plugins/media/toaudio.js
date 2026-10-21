import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId } from '../../lib/helper.js';
import { runFfmpeg } from '../../lib/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../../temp');

export default {
  command: 'toaudio',
  alias: ['tovn', 'tomp3', 'extractaudio'],
  description: 'Convert video to audio/voice note',
  category: 'media',
  async execute({ reply, sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasVideo = quoted?.videoMessage || msg.message?.videoMessage;
    if (!hasVideo) return reply('❌ Reply to a *video* with .toaudio\n\nFlags: --voice (send as voice note)');

    await reply('⏳ Converting to audio...');
    fs.ensureDirSync(tmpDir);
    const id = generateId();
    const isVoice = args.includes('--voice');

    try {
      const buffer = await downloadMediaMessage({
        message: quoted ? { videoMessage: hasVideo } : msg.message,
        key: msg.key,
      }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

      const inputPath = path.join(tmpDir, `${id}.mp4`);
      const outputPath = path.join(tmpDir, `${id}.mp3`);

      await fs.writeFile(inputPath, buffer);
      await runFfmpeg(['-y', '-i', inputPath, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k', outputPath], 30000);

      const audioBuffer = await fs.readFile(outputPath);

      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: isVoice ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
        ptt: isVoice,
        fileName: `audio_${id}.mp3`,
      }, { quoted: msg });

      await fs.remove(inputPath).catch(() => {});
      await fs.remove(outputPath).catch(() => {});
    } catch (err) {
      reply('❌ Conversion failed. Please try again in a few seconds.');
    }
  },
};
