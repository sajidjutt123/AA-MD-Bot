// AA MD Bot - Upload media to Catbox.moe and get a shareable URL
import axios from 'axios';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

async function uploadToCatbox(buffer, filename) {
  // Use native FormData (Node 18+)
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer]), filename);

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!text || text.toLowerCase().includes('error') || !text.startsWith('https')) {
    throw new Error('Catbox error: ' + text);
  }
  return text.trim();
}

function getMediaInfo(msgContent) {
  if (!msgContent) return null;

  const types = [
    { key: 'imageMessage',    type: 'image',    ext: (m) => m.mimetype?.includes('png') ? '.png' : m.mimetype?.includes('webp') ? '.webp' : '.jpg' },
    { key: 'videoMessage',    type: 'video',    ext: () => '.mp4' },
    { key: 'audioMessage',    type: 'audio',    ext: (m) => m.mimetype?.includes('ogg') ? '.ogg' : '.mp3' },
    { key: 'documentMessage', type: 'document', ext: (m) => { const fn = m.fileName || ''; return fn.includes('.') ? '.' + fn.split('.').pop() : '.bin'; } },
    { key: 'stickerMessage',  type: 'sticker',  ext: () => '.webp' },
  ];

  for (const { key, type, ext } of types) {
    if (msgContent[key]) return { msg: msgContent[key], type, ext: ext(msgContent[key]) };
  }
  return null;
}

export default {
  command: 'catbox',
  alias: ['catbox', 'imgtourl', 'imgurl', 'uploadfile'],
  description: 'Upload a media file to Catbox.moe and get a shareable URL',
  category: 'tools',

  async execute({ sock, msg, jid, reply, react }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const source = quoted || msg.message;
    const info   = getMediaInfo(source);

    if (!info) {
      return reply(
        `☁️ *Catbox Uploader*\n\n` +
        `Reply to (or send with) an *image, video, audio, or document*.\n\n` +
        `Uploaded files get a permanent https://files.catbox.moe/xxx link.\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    await react('⏳');

    try {
      const stream = await downloadContentFromMessage(info.msg, info.type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const filename = `aamdbot_${Date.now()}${info.ext}`;
      const url = await uploadToCatbox(buffer, filename);

      const sizeStr = buffer.length < 1_048_576
        ? `${(buffer.length / 1024).toFixed(1)} KB`
        : `${(buffer.length / 1_048_576).toFixed(2)} MB`;

      const label = info.type === 'image' ? '🖼️ Image'
        : info.type === 'video'    ? '🎬 Video'
        : info.type === 'audio'    ? '🎵 Audio'
        : info.type === 'sticker'  ? '🎭 Sticker'
        : '📄 File';

      await react('✅');
      await reply(
        `☁️ *Upload Complete*\n\n` +
        `${label} • *${sizeStr}*\n` +
        `🔗 ${url}\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (err) {
      await react('❌');
      await reply(`❌ Upload failed: ${err.message}`);
    }
  },
};
