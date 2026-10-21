// AA MD Bot - GeoIP Lookup
// Free: ip-api.com — no key needed
import axios from 'axios';

export default {
  command: 'geoip',
  alias: ['iplocation', 'ipdekho'],
  description: 'Look up the exact location and map for an IP address',
  category: 'tools',

  async execute({ reply, react, text, prefix }) {
    if (!text) return reply(
      `🌍 *GeoIP Lookup*\n\n*Usage:* ${prefix}geoip <ip address>\n*Example:* ${prefix}geoip 8.8.8.8\n\n> 🤖 *AA MD Bot*`
    );

    const ip = text.trim().split(/\s+/)[0];
    // Basic IP validation
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[a-fA-F0-9:]+$/.test(ip)) {
      return reply(`❌ Please enter a valid IP address.\n*Example:* _8.8.8.8_\n\n> 🤖 *AA MD Bot*`);
    }

    await react('⏳');
    try {
      const { data } = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,mobile,proxy,hosting,query`, {
        timeout: 10000,
      });

      if (data.status !== 'success') {
        await react('❌');
        return reply(`❌ Could not find IP: *${ip}*\n\n_Private/reserved IP addresses cannot be looked up._\n\n> 🤖 *AA MD Bot*`);
      }

      const mapLink = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
      const flagUrl = `https://flagcdn.com/32x24/${data.countryCode.toLowerCase()}.png`;

      const flags = [];
      if (data.proxy)   flags.push('🔴 Proxy/VPN');
      if (data.hosting) flags.push('🟡 Hosting/DC');
      if (data.mobile)  flags.push('📱 Mobile');
      if (!data.proxy && !data.hosting && !data.mobile) flags.push('🟢 Residential');

      const out =
        `🌍 *GeoIP — ${data.query}*\n` +
        `${'─'.repeat(28)}\n` +
        `🏳️ *Country:* ${data.country} (${data.countryCode})\n` +
        `🏙️ *City:* ${data.city}\n` +
        `📍 *Region:* ${data.regionName}\n` +
        `📮 *ZIP:* ${data.zip || 'N/A'}\n` +
        `🕐 *Timezone:* ${data.timezone}\n` +
        `📡 *ISP:* ${data.isp}\n` +
        `🏢 *Org:* ${data.org || 'N/A'}\n` +
        `🔢 *AS:* ${data.as || 'N/A'}\n` +
        `🔄 *Reverse DNS:* ${data.reverse || 'N/A'}\n` +
        `🛡️ *Type:* ${flags.join(' | ')}\n` +
        `📌 *Coordinates:* ${data.lat}, ${data.lon}\n\n` +
        `🗺️ *Map:* ${mapLink}\n\n` +
        `> 🤖 *AA MD Bot*`;

      await react('✅');
      reply(out);
    } catch (e) {
      await react('❌');
      reply(`❌ *Error:* ${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
