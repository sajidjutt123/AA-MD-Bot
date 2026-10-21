// Owner identity comes from the environment (see .env.example) so that a
// fork does not inherit someone else's numbers. The literals below are only
// bootstrap defaults for a fresh checkout.
function envList(name, fallback) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const OWNER_NUMBERS = envList('OWNER_NUMBER', ['923316041183']);
const SUPER_OWNER    = (process.env.SUPER_OWNER || '923346741532').replace(/\D/g, '');

const config = {
  botName: 'AA MD Bot',
  developer: 'Ahsan Ali Wadani',
  ownerName: 'Ahsan Ali',
  brand: 'AA Mods',
  version: '3.0.0',
  ownerNumber: OWNER_NUMBERS,
  superOwner: SUPER_OWNER,
  channelLink: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029Vb8Yk2LL2AU78HliE617',
  newsletterJid: process.env.NEWSLETTER_JID || '120363428609538858@newsletter',
  newsletterName: 'AA MD Bot',
  prefix: ['.'],
  altPrefixes: [],
  owners: [],
  botMode: 'public',
  sessionDir: './session',
  databaseDir: './database',
  logsDir: './logs',
  tempDir: './temp',
  mediaDir: './media',
  maxFileSize: 50 * 1024 * 1024,
  autoRead: true,
  autoTyping: true,
  antiSpam: true,
  spamInterval: 5,
  spamMax: 5,
  cooldown: 3,
  xpPerMessage: 5,
  xpPerCommand: 10,
  startingBalance: 1000,
  dailyAmount: 500,
  maxDailyStreak: 7,
  maintenanceMode: false,
  maintenanceMsg: '🔧 Bot is under maintenance. Please wait...',
  welcomeMessage: true,
  timezone: 'Asia/Karachi',
  language: 'en',
  autoStatusView: true,
  autoStatusReact: true,
  autoStatus: false,
  statusEmoji: '❤️',
  apiKeys: {
    openweather: process.env.OPENWEATHER_API_KEY || '',
    omdb: process.env.OMDB_API_KEY || '',
  },
};

export default config;
