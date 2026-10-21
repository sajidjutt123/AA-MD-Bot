// AA MD Bot - Instagram Profile Lookup
// Primary: DavidCyrilTech (confirmed working)
// Fallback: Picuki scraper
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Method 1: DavidCyrilTech (PRIMARY — confirmed working)
// Response: { usrname, status: { post, follower, following }, pp, desk }
async function tryDavidCyril(username) {
  const { data } = await axios.get(
    `https://apis.davidcyriltech.my.id/igstalk?username=${encodeURIComponent(username)}`,
    { headers: { 'User-Agent': UA }, timeout: 12000 }
  );
  if (!data?.usrname && !data?.status) throw new Error('no data');
  return {
    username:   data.usrname || username,
    fullname:   data.fullname || data.name || data.usrname || username,
    bio:        data.desk || data.biography || '—',
    followers:  data.status?.follower  || data.followers  || 'N/A',
    following:  data.status?.following || data.following  || 'N/A',
    posts:      data.status?.post      || data.posts      || 'N/A',
    is_private: data.is_private ?? false,
    verified:   data.is_verified ?? false,
    profile_pic: data.pp || data.profile_pic_url || null,
  };
}

// Method 2: Picuki public scraper
async function tryPicuki(username) {
  const { data } = await axios.get(
    `https://www.picuki.com/profile/${encodeURIComponent(username)}`,
    { headers: { 'User-Agent': UA, 'Referer': 'https://www.picuki.com/' }, timeout: 15000 }
  );
  const html = typeof data === 'string' ? data : '';
  if (html.toLowerCase().includes('page not found') || html.length < 500) throw new Error('not found');
  const followers = html.match(/followers[^<]*<span[^>]*>([\d.,KkMm]+)<\/span>/i)?.[1]
                 || html.match(/<span[^>]*>([\d.,KkMm]+)<\/span>[^<]*followers/i)?.[1];
  const following = html.match(/following[^<]*<span[^>]*>([\d.,KkMm]+)<\/span>/i)?.[1]
                 || html.match(/<span[^>]*>([\d.,KkMm]+)<\/span>[^<]*following/i)?.[1];
  const posts     = html.match(/posts[^<]*<span[^>]*>([\d.,KkMm]+)<\/span>/i)?.[1]
                 || html.match(/<span[^>]*>([\d.,KkMm]+)<\/span>[^<]*posts/i)?.[1];
  const bio       = html.match(/<div[^>]*class="[^"]*profile-description[^"]*"[^>]*>([\s\S]{0,300}?)<\/div>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const fullname  = html.match(/<h1[^>]*class="[^"]*profile-name[^"]*"[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
                 || html.match(/<h1[^>]*>([^<]{2,50})<\/h1>/i)?.[1]?.trim();
  if (!followers && !posts) throw new Error('parse failed');
  return {
    username, fullname: fullname || username,
    followers: followers || 'N/A', following: following || 'N/A',
    posts: posts || 'N/A', bio: bio || '—', verified: false,
    is_private: html.toLowerCase().includes('private account'),
    profile_pic: null,
  };
}

export default {
  command: 'igstalk',
  alias: ['igprofile', 'iginfo'],
  description: 'Look up an Instagram profile',
  category: 'search',

  async execute({ sock, jid, msg, args, reply, react }) {
    const username = (args[0] || '').replace(/^@/, '').replace(/https?:\/\/(?:www\.)?instagram\.com\//i, '').replace(/\/$/, '').trim();

    if (!username) {
      return reply(
        `📸 *Instagram Stalker*\n\n` +
        `*Usage:* .igstalk <username>\n` +
        `*Example:* .igstalk instagram\n\n` +
        `> 📸 *AA MD Bot*`
      );
    }

    await react('🔍');

    let profile = null;
    const methods = [
      () => tryDavidCyril(username),
      () => tryPicuki(username),
    ];

    for (const method of methods) {
      try {
        profile = await method();
        if (profile) break;
      } catch {}
    }

    if (!profile) {
      await react('❌');
      return reply(
        `❌ *Could not fetch @${username}*\n\n` +
        `All lookup methods failed — Instagram is blocking this server's IP.\n\n` +
        `Try directly: 🔗 https://instagram.com/${username}\n\n` +
        `> 📸 *AA MD Bot*`
      );
    }

    const privBadge = profile.is_private ? '🔒 Private' : '🔓 Public';
    const verBadge  = profile.verified   ? ' ✅ Verified' : '';

    const text_out =
      `📸 *Instagram Profile*\n\n` +
      `👤 *Name:* ${profile.fullname || profile.username}\n` +
      `🔖 *Username:* @${profile.username}\n` +
      `${privBadge}${verBadge}\n\n` +
      `📝 *Bio:* ${profile.bio}\n\n` +
      `👥 *Followers:* ${profile.followers}\n` +
      `➕ *Following:* ${profile.following}\n` +
      `🖼️ *Posts:* ${profile.posts}\n\n` +
      `🔗 https://instagram.com/${profile.username}\n\n` +
      `> 📸 *AA MD Bot*`;

    if (profile.profile_pic) {
      try {
        await sock.sendMessage(jid, { image: { url: profile.profile_pic }, caption: text_out }, { quoted: msg });
        return await react('✅');
      } catch {}
    }

    await reply(text_out);
    await react('✅');
  },
};
