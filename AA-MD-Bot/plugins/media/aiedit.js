// AA MD Bot — AI Image Editor
// API: DavidCyrilTech /nanobanana?url=<image>&prompt=<instruction>
// Usage: reply to an image OR provide URL + prompt
//   .aiedit make her hair blue
//   .aiedit https://example.com/img.jpg make the background red
import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const DC = 'https://apis.davidcyriltech.my.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ---------------------------------------------------------------------------
// Upload helpers — tried in order: uguu -> catbox -> tmpfiles
// ---------------------------------------------------------------------------

async function uploadToUguu(buf) {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('file', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
  const res = await axios.post(`${DC}/uploader/uguu`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const url =
    res.data?.url ||
    res.data?.result?.url ||
    res.data?.data?.url ||
    (typeof res.data?.result === 'string' ? res.data.result : null);
  if (!url || !String(url).startsWith('http')) {
    throw new Error('Uguu upload returned invalid response: ' + JSON.stringify(res.data));
  }
  return url;
}

async function uploadToCatbox(buf) {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const url = res.data?.trim?.();
  if (!url || !url.startsWith('http')) throw new Error('Catbox upload returned invalid URL');
  return url;
}

async function uploadToTmpfiles(buf) {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('file', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error('tmpfiles upload returned no URL');
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

// Try every uploader in order, return first that succeeds.
async function uploadWithFallbackChain(buf) {
  const uploaders = [
    ['uguu', uploadToUguu],
    ['catbox', uploadToCatbox],
    ['tmpfiles', uploadToTmpfiles],
  ];
  let lastErr;
  for (const [name, fn] of uploaders) {
    try {
      const url = await fn(buf);
      return url;
    } catch (err) {
      lastErr = err;
      console.error(`[aiedit] ${name} upload failed:`, err.message);
    }
  }
  throw lastErr || new Error('All uploaders failed');
}

// Soft reachability check — NEVER blocks the flow, only logs a warning.
// Many hosts (WhatsApp CDN, some image hosts) reject HEAD requests even
// though a normal GET works fine, so treating a failed HEAD as fatal was
// causing false "not reachable" errors on perfectly valid URLs/prompts.
async function checkReachableSoft(url) {
  try {
    const res = await axios.head(url, { timeout: 8000, headers: { 'User-Agent': UA } });
    const ctype = res.headers['content-type'] || '';
    if (!ctype.startsWith('image/')) {
      console.warn(`[aiedit] HEAD ok but content-type not image/*: ${ctype}`);
    }
    return true;
  } catch (err) {
    console.warn('[aiedit] HEAD check failed (continuing anyway):', err.message);
    return false; // informational only — caller does NOT abort on this
  }
}

// ---------------------------------------------------------------------------
// Robust quoted-image extraction.
// The previous version assumed `quoted.key` existed, which many bot
// frameworks don't guarantee — `quoted` is often just the extracted
// quotedMessage content with no `key` at all, so downloadMediaMessage()
// silently failed and the plugin fell through to the "Usage" screen even
// when the user replied correctly. We now rebuild `key` from the current
// message's own contextInfo (stanzaId / participant), which is the
// reliable source in Baileys-based bots.
// ---------------------------------------------------------------------------
function extractQuotedImage(msg, quoted) {
  const ctx =
    msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo ||
    msg?.message?.conversation?.contextInfo;

  // Preferred path: rebuild from contextInfo on the incoming message itself
  if (ctx?.quotedMessage?.imageMessage) {
    return {
      imageMessage: ctx.quotedMessage.imageMessage,
      key: {
        remoteJid: msg.key.remoteJid,
        id: ctx.stanzaId,
        participant: ctx.participant || msg.key.participant,
        fromMe: false,
      },
    };
  }

  // Fallback path: whatever the framework's `quoted` helper gives us
  const qImg = quoted?.message?.imageMessage || quoted?.imageMessage;
  if (qImg) {
    return {
      imageMessage: qImg,
      key:
        quoted.key ||
        {
          remoteJid: msg.key.remoteJid,
          id: quoted.id || quoted.stanzaId,
          participant: quoted.participant,
          fromMe: false,
        },
    };
  }

  return null;
}

export default {
  command: 'aiedit',
  alias: ['editimage', 'imageedit', 'imgai', 'nanobanana'],
  description: 'Edit any image with an AI prompt (reply + describe the change)',
  category: 'media',
  async execute({ sock, msg, jid, react, reply, quoted, args, text, prefix }) {
    await react('⌛');
    try {
      let imageUrl = null;
      let prompt   = (text || '').trim();
      let mediaBuf = null;

      // 1. Quoted image (robust extraction)
      const q = extractQuotedImage(msg, quoted);
      if (q) {
        mediaBuf = await downloadMediaMessage(
          { key: q.key, message: { imageMessage: q.imageMessage } },
          'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
        ).catch((err) => {
          console.error('[aiedit] downloadMediaMessage failed:', err?.message);
          return null;
        });

        if (mediaBuf) {
          try {
            imageUrl = await uploadWithFallbackChain(mediaBuf);
          } catch (err) {
            console.error('[aiedit] all uploaders failed for quoted image:', err.message);
            imageUrl = null;
          }
        } else {
          console.error('[aiedit] quoted image detected but buffer download returned null');
        }
      }

      // 2. First arg is a URL — extract URL then rest is prompt
      if (!imageUrl && args[0]?.startsWith('http')) {
        imageUrl = args[0];
        prompt   = args.slice(1).join(' ').trim();
      }

      if (!imageUrl || !prompt) {
        await react('❌');
        return reply(
          `🎨 *AI Image Editor*\n\n` +
          `*Usage:*\n` +
          `• Reply to an image with a description:\n` +
          `  _${prefix}aiedit make her hair blue_\n\n` +
          `• Or provide URL + prompt:\n` +
          `  _${prefix}aiedit <image-url> make background red_\n\n` +
          (q && !mediaBuf ? `⚠️ _Couldn't download the replied image — try again or send the image URL directly._\n\n` : '') +
          `> 🤖 *AA MD Bot*`
        );
      }

      // 3. Soft reachability check — informational only, never blocks
      await checkReachableSoft(imageUrl);

      await reply(`🎨 _Editing image with AI… (takes 1–2 min, please wait)_`);

      let data;
      try {
        const res = await axios.get(`${DC}/nanobanana`, {
          params: { url: imageUrl, prompt },
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          timeout: 120000,
          validateStatus: () => true,
        });

        if (res.status === 412) {
          const apiMsg = res.data?.message || res.data?.error || JSON.stringify(res.data);
          if (mediaBuf) {
            console.warn('[aiedit] 412 from API, retrying with re-hosted image...');
            const retryUrl = await uploadWithFallbackChain(mediaBuf).catch((err) => {
              console.error('[aiedit] retry re-upload failed:', err.message);
              return null;
            });
            if (retryUrl && retryUrl !== imageUrl) {
              const retryRes = await axios.get(`${DC}/nanobanana`, {
                params: { url: retryUrl, prompt },
                headers: { 'User-Agent': UA, Accept: 'application/json' },
                timeout: 60000,
                validateStatus: () => true,
              });
              if (retryRes.status >= 200 && retryRes.status < 300) {
                data = retryRes.data;
              } else {
                throw new Error(`API rejected image (412): ${apiMsg}`);
              }
            } else {
              throw new Error(`API rejected image (412): ${apiMsg}`);
            }
          } else {
            throw new Error(`API rejected image (412): ${apiMsg}`);
          }
        } else if (res.status < 200 || res.status >= 300) {
          const apiMsg = res.data?.message || res.data?.error || `HTTP ${res.status}`;
          throw new Error(apiMsg);
        } else {
          data = res.data;
        }
      } catch (err) {
        const apiMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        throw new Error(apiMsg);
      }

      if (!data?.success && !data?.result && !data?.image && !data?.url) {
        throw new Error(data?.error || data?.message || 'No result from API');
      }

      const d = data?.result || data;
      const resultUrl = d?.image || d?.url || d?.output || d?.result;
      if (!resultUrl) throw new Error('API returned no image URL');

      await sock.sendMessage(jid, {
        image: { url: resultUrl },
        caption: `🎨 *AI Edited*\n📝 _${prompt}_\n\n> 🤖 *AA MD Bot*`,
      }, { quoted: msg });
      await react('✅');
    } catch (e) {
      await react('❌');
      console.error('[aiedit] fatal error:', e);
      reply(`❌ *AI Edit Failed*\n\n${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
