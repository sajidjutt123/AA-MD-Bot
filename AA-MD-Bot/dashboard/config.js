// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot dashboard — runtime configuration
//
//  Served by the bot at /config.js, so the panel works with zero setup
//  when you open http://your-bot:5000.
//
//  Deploying this folder to Vercel? Edit the two values below (they are
//  baked into the static build) or simply use the login screen — the
//  panel stores whatever you type in localStorage.
// ═══════════════════════════════════════════════════════════════════

window.AA_CONFIG = {
  // Base URL of your bot, e.g. "https://aa-md-bot.fly.dev".
  // Leave empty ('') when the panel is served BY the bot itself.
  apiBase: '',

  // Optional: pre-fill the token so you don't see the login screen.
  // Never commit a real SESSION_SECRET to a public repo.
  token: '',

  // Set to true only for a trusted, private deployment where you want
  // read-only views to load without a token (mutations still 401).
  allowAnonymous: false,

  // Render the panel with sample data instead of calling a bot.
  // Great for screenshotting the UI; never enable it in production.
  // You can also just add ?demo=1 to the URL.
  demo: false,
};
