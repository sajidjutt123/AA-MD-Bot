// Load .env from the project root — works with plain `pm2 restart aa-md-bot`,
// `node index.js`, `npm start`, or any other launch method.
// Uses override:false so vars already in the environment (set by shell/PM2) take precedence.
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
try {
  const _dotenv = _require('dotenv');
  const _path   = _require('path');
  const _url    = _require('url');
  const _dir    = _path.dirname(_url.fileURLToPath(import.meta.url));
  _dotenv.config({ path: _path.join(_dir, '.env'), override: false });
} catch {}

// Ensure common binary locations are in PATH (works on Replit, Railway, VPS, etc.)
const extraPaths = ['/home/runner/.local/bin', '/usr/local/bin', '/usr/bin'];
for (const p of extraPaths) {
  if (!process.env.PATH?.includes(p)) process.env.PATH = `${p}:${process.env.PATH || ''}`;
}

import http from 'http';
import zlib from 'zlib';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import QRCode from 'qrcode';
import { logger } from './lib/logger.js';
import { db, initDatabase } from './lib/database.js';
import { loadAllPlugins, getCategories, plugins } from './lib/pluginLoader.js';
import { handleMessage } from './lib/commandHandler.js';
import {
  initAllSessions, setMessageHandler, setConnectionHandler, sessions,
  getAllSessions, botEvents, sessionQRs, sessionStatus,
  createSession, deleteSession,
} from './lib/sessionManager.js';
import config from './config.js';
import { cleanTemp, formatDuration } from './lib/helper.js';
import {
  applyCors, requireAuth, enforceRateLimit, apiTokenIsEphemeral,
} from './lib/apiAuth.js';
import { startBirthdayScheduler } from './plugins/utility/birthday.js';
import { initTelegramAdmin }    from './lib/telegramAdmin.js';
import { initTelegramFeatures } from './lib/telegramFeatures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startTime = Date.now();

// Flush pending MongoDB writes before crashing so no settings are lost.
// flushAll is imported lazily to avoid circular import at module init time.
async function _emergencyFlush(label, err) {
  logger.error({ err: String(err?.message || err) }, label);
  try {
    const { flushAll } = await import('./lib/database.js');
    await flushAll();
  } catch {}
}
process.on('uncaughtException',   err => _emergencyFlush('💥 Uncaught Exception',    err));
process.on('unhandledRejection',  err => _emergencyFlush('💥 Unhandled Rejection',   err));

// SSE clients
const sseClients = new Set();
const latestPairingCodes = new Map(); // sessionId → code

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

botEvents.on('qr', d => broadcast('qr', d));
botEvents.on('status', d => broadcast('status', d));
botEvents.on('pairingCode', d => {
  latestPairingCodes.set(d.sessionId, d.code);
  broadcast('pairingCode', d);
});
botEvents.on('pairingCodeError', d => broadcast('pairingCodeError', d));

// Helper: strip /api prefix
function stripApi(p) { return p.replace(/^\/api/, '') || '/'; }

function printBanner() {
  console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║       AA MD BOT  v${config.version}           ║
║   Developer: Ahsan Ali Wadani       ║
║        Brand: AA Mods               ║
║   Multi-Device WhatsApp Bot         ║
╚══════════════════════════════════════╝`));
}

// ── Dashboard static files ───────────────────────────────────────────────────
// Small allowlist (not a directory server) so a crafted path can never escape
// ./dashboard. Text assets are gzipped when the client accepts it.
async function serveDashboardFile(req, res, fileName, contentType = 'text/html; charset=utf-8') {
  const safe = path.basename(fileName);
  const filePath = path.join(__dirname, 'dashboard', safe);
  try {
    const body = await fs.readFile(filePath);
    const isText = /text\/|javascript|json/.test(contentType);
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    };

    if (isText && (req.headers['accept-encoding'] || '').includes('gzip')) {
      const compressed = await new Promise((resolve, reject) =>
        zlib.gzip(body, (err, buf) => (err ? reject(err) : resolve(buf)))
      );
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
      res.end(compressed);
      return;
    }

    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `dashboard asset not found: ${safe}` }));
  }
}

async function startServer() {
  const port = parseInt(process.env.PORT || '5000', 10);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);

    // ── CORS — allowlist only (was `*`: any page could drive the API) ──
    applyCors(req, res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Bare /api → health (for deployment healthcheck) ────
    if (url.pathname === '/api' || url.pathname === '/api/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', bot: config.botName, version: config.version,
        uptime: formatDuration(Date.now() - startTime),
        sessions: getAllSessions().length, plugins: plugins.size,
      }));
      return;
    }

    const p = stripApi(url.pathname);

    // ── Dashboard (static panel in ./dashboard) ────────────
    if (p === '/' || p === '' || p === '/dashboard') {
      return serveDashboardFile(req, res, 'index.html');
    }

    const DASHBOARD_ASSETS = {
      '/styles.css': 'text/css; charset=utf-8',
      '/app.js': 'text/javascript; charset=utf-8',
      '/config.js': 'text/javascript; charset=utf-8',
    };
    if (DASHBOARD_ASSETS[p]) {
      return serveDashboardFile(req, res, p.slice(1), DASHBOARD_ASSETS[p]);
    }

    // ── SSE ────────────────────────────────────────────────
    if (p === '/events') {
      if (enforceRateLimit(req, res, 'events', 30, 60_000)) return;
      if (requireAuth(req, res, url, '/events')) return;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      sseClients.add(res);

      // Send current QR immediately if available
      for (const [sessionId, qr] of sessionQRs) {
        res.write(`event: qr\ndata: ${JSON.stringify({ sessionId, qr })}\n\n`);
      }
      // Send current session statuses
      for (const [sessionId, status] of sessionStatus) {
        res.write(`event: status\ndata: ${JSON.stringify({ sessionId, status })}\n\n`);
      }
      // Send any cached pairing codes
      for (const [sessionId, code] of latestPairingCodes) {
        res.write(`event: pairingCode\ndata: ${JSON.stringify({ sessionId, code })}\n\n`);
      }

      const keepAlive = setInterval(() => {
        try { res.write(':ping\n\n'); } catch { clearInterval(keepAlive); }
      }, 20000);

      req.on('close', () => { sseClients.delete(res); clearInterval(keepAlive); });
      return;
    }

    // ── QR Image ───────────────────────────────────────────
    if (p === '/qr-image') {
      // QR codes are login credentials — never serve them unauthenticated.
      if (enforceRateLimit(req, res, 'qr-image', 60, 60_000)) return;
      if (requireAuth(req, res, url, '/qr-image')) return;
      const sessionId = url.searchParams.get('session') || 'default';
      const qr = sessionQRs.get(sessionId);
      if (!qr) { res.writeHead(404); res.end('No QR'); return; }
      try {
        const png = await QRCode.toBuffer(qr, { width: 280, margin: 2, color: { dark: '#000', light: '#fff' } });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
        res.end(png);
      } catch { res.writeHead(500); res.end('QR error'); }
      return;
    }

    // ── Health ─────────────────────────────────────────────
    if (p === '/healthz' || p === '/health') {
      let storage = { backend: 'unknown' };
      try { storage = await db.health(); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', bot: config.botName, version: config.version,
        uptime: formatDuration(Date.now() - startTime),
        sessions: getAllSessions().length, plugins: plugins.size,
        storage,
      }));
      return;
    }

    // ── Command registry (dashboard → Commands tab) ────────
    if (p === '/commands') {
      if (requireAuth(req, res, url, '/commands')) return;
      const byCategory = {};
      const list = [];
      for (const [name, plugin] of plugins) {
        const cat = plugin.category || 'misc';
        const alias = Array.isArray(plugin.alias) ? plugin.alias : plugin.alias ? [plugin.alias] : [];
        list.push({
          name,
          category: cat,
          description: plugin.description || '',
          usage: plugin.usage || '',
          alias,
          flags: {
            ownerOnly: !!plugin.ownerOnly,
            superOwnerOnly: !!plugin.superOwnerOnly,
            adminOnly: !!plugin.adminOnly,
            botAdminOnly: !!plugin.botAdminOnly,
            groupOnly: !!plugin.groupOnly,
            privateOnly: !!plugin.privateOnly,
          },
        });
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: list.length, categories: byCategory, commands: list }));
      return;
    }

    // ── Stats ──────────────────────────────────────────────
    if (p === '/stats') {
      // Session ids can embed phone numbers (e.g. tg_923316041183).
      if (requireAuth(req, res, url, '/stats')) return;
      const cats = getCategories();
      const sessList = getAllSessions();
      const catCounts = {};
      for (const [cat, cmds] of Object.entries(cats)) catCounts[cat] = cmds.length;
      // Strip phone/jid from session data before sending to dashboard
      const safeSessions = sessList.map(s => ({
        id: s.id,
        name: s.name || null,
        status: s.status,
        connectedAt: s.connectedAt || null,
      }));
      const ramMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      let storage = { backend: 'unknown' };
      try { storage = await db.health(); } catch {}
      res.end(JSON.stringify({
        bot: config.botName,
        version: config.version,
        mode: db.settings.getValue('botMode') || config.botMode,
        prefix: (arr => (Array.isArray(arr) ? arr : [arr || '.'])[0])(db.settings.getValue('prefix') || config.prefix),
        uptime: formatDuration(Date.now() - startTime),
        startedAt: startTime,
        plugins: plugins.size,
        groups: Object.keys(db.groups.all()).length,
        sessions: safeSessions,
        connectedSessions: safeSessions.filter(s => s.status === 'connected').length,
        categories: catCounts,
        ram: ramMB,
        storage,
      }));
      return;
    }

    // ── Status — for external frontends (Vercel etc) ──────
    if (p === '/status') {
      // No secrets here (counts only) — rate limited but public.
      if (enforceRateLimit(req, res, 'status', 120, 60_000)) return;
      const connected = getAllSessions().filter(s => s.status === 'connected').length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        bot: config.botName,
        version: config.version,
        sessions: connected,
        maxSessions: null,
        uptime: formatDuration(Date.now() - startTime),
      }));
      return;
    }

    // ── Latest pairing code per session (for polling) ─────
    if (p === '/pairing-code') {
      // A pairing code is a login credential — must be authenticated.
      if (enforceRateLimit(req, res, 'pairing-code', 60, 60_000)) return;
      if (requireAuth(req, res, url, '/pairing-code')) return;
      const sid = url.searchParams.get('session') || 'default';
      const code = latestPairingCodes.get(sid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: code || null }));
      return;
    }

    // ── Create Session ─────────────────────────────────────
    if (p === '/session/create' && req.method === 'POST') {
      // Starting a WhatsApp pairing is an admin action.
      if (enforceRateLimit(req, res, 'session-create', 5, 5 * 60_000)) return;
      if (requireAuth(req, res, url, '/session/create')) return;
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { sessionId = 'default', method = 'qr', phoneNumber } = JSON.parse(body || '{}');
          const cleanId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'default';

          if (method === 'pairing' && !phoneNumber) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Phone number required' }));
            return;
          }

          // If session already exists and connected, return early; otherwise close it
          if (sessions.has(cleanId)) {
            const sock = sessions.get(cleanId);
            if (sock.ws?.readyState === 1) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, sessionId: cleanId, info: 'Already connected' }));
              return;
            }
            // Close stale session cleanly before recreating
            sessions.delete(cleanId);
            try { sock.end(new Error('restart')); } catch {}
          }

          latestPairingCodes.delete(cleanId);
          await createSession(cleanId, method === 'pairing', phoneNumber);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, sessionId: cleanId, method }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // ── Delete Session ─────────────────────────────────────
    const delMatch = p.match(/^\/session\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') {
      if (enforceRateLimit(req, res, 'session-delete', 10, 60_000)) return;
      if (requireAuth(req, res, url, '/session/:id')) return;
      try {
        await deleteSession(delMatch[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // ── Static images ──────────────────────────────────────
    const STATIC_IMAGES = {
      '/banner.webp': 'image/webp',
      '/logo.webp': 'image/webp',
      '/favicon.webp': 'image/webp',
      '/banner.jpeg': 'image/jpeg',
      '/logo.jpeg': 'image/jpeg',
      '/favicon.svg': 'image/svg+xml',
    };
    if (STATIC_IMAGES[p]) {
      const imgPath = path.join(__dirname, p.slice(1));
      try {
        const data = await fs.readFile(imgPath);
        res.writeHead(200, { 'Content-Type': STATIC_IMAGES[p], 'Cache-Control': 'public, max-age=31536000, immutable', 'Vary': 'Accept' });
        res.end(data);
      } catch { res.writeHead(404); res.end('Not found'); }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error({ port }, `❌ Port ${port} already in use — another bot instance is running. Exiting so workflow can restart cleanly.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, '🌐 Dashboard server listening');
    console.log(chalk.green(`\n🌐 Dashboard: http://localhost:${port}/\n`));
    if (apiTokenIsEphemeral) {
      console.log(chalk.yellow(
        '🔑 API is protected by an ephemeral token (SESSION_SECRET is not set).\n' +
        '   Copy the token from the log line above, or set SESSION_SECRET in .env.\n'
      ));
    }
  });

  return server;
}

setMessageHandler(handleMessage);
setConnectionHandler((sessionId, sock) => {
  console.log(chalk.green(`✅ Session [${sessionId}] connected as ${sock.user?.name || sock.user?.id}`));
});

async function main() {
  printBanner();
  logger.info('🚀 Starting AA MD Bot...');

  // Ensure all required directories exist (created on every startup — safe to repeat)
  for (const dir of ['temp', 'logs', 'session', 'downloads', 'database', 'cache']) {
    fs.ensureDirSync(path.join(__dirname, dir));
  }

  // Load persistent database state before anything reads from db
  await initDatabase();

  // Restore newsletter JID — db first (set via .setnewsletter), then config fallback
  try {
    const savedJid  = db.settings.getValue('newsletterJid') || config.newsletterJid;
    const savedName = db.settings.getValue('newsletterName') || config.newsletterName || 'AA MD Bot';
    if (savedJid) {
      global._AA_NEWSLETTER_JID  = savedJid;
      global._AA_NEWSLETTER_NAME = savedName;
      if (!db.settings.getValue('newsletterJid')) {
        db.settings.setValue('newsletterJid', savedJid);
        db.settings.setValue('newsletterName', savedName);
      }
      logger.info({ jid: savedJid }, '📢 Newsletter JID restored from db');
    }
  } catch {}

  await startServer();

  logger.info('📦 Loading plugins...');
  const count = await loadAllPlugins();
  const cats = getCategories();
  const catList = Object.entries(cats).map(([k, v]) => `${k}(${v.length})`).join(', ');
  console.log(chalk.blue(`📦 Loaded ${count} plugins: ${catList}`));

  logger.info('📡 Initializing WhatsApp sessions...');
  await initAllSessions();

  // ── Birthday scheduler — runs at exactly midnight every day ───────────────
  startBirthdayScheduler(() => sessions);

  // ── Fake Last Seen scheduler — checks every minute ────────────────────────
  // For each session that has fake_lastseen_active=true, fires sendPresenceUpdate('unavailable')
  // at the exact HH:MM the user configured, so WA records that moment as last seen.
  setInterval(() => {
    const now   = new Date();
    const hh    = String(now.getHours()).padStart(2, '0');
    const mm    = String(now.getMinutes()).padStart(2, '0');
    const curHHMM = `${hh}:${mm}`;

    for (const [sessionId, sock] of sessions.entries()) {
      try {
        const active = db.sessionSettings.getValue(sessionId, 'fake_lastseen_active');
        if (!active) continue;
        const target = db.sessionSettings.getValue(sessionId, 'fake_lastseen_time');
        if (!target || target !== curHHMM) continue;
        // Exact minute match — fire unavailable
        sock.sendPresenceUpdate('unavailable').catch(() => {});
        logger.info({ sessionId, time: curHHMM }, '🕐 Fake last seen fired');
      } catch {}
    }
  }, 60_000);

  // ── Telegram bots ─────────────────────────────────────────────────────────
  try {
    initTelegramAdmin({
      createSession,
      deleteSession,
      getAllSessions: () => getAllSessions(),
      latestPairingCodes,
      botEvents,
      sockets: sessions,          // live sockets — needed for a real /broadcast
    });
  } catch (e) {
    logger.warn({ err: e.message }, '📱 Telegram admin bot failed to start');
  }
  try {
    initTelegramFeatures();
  } catch (e) {
    logger.warn({ err: e.message }, '🤖 Telegram features bot failed to start');
  }

  setInterval(cleanTemp, 30 * 60 * 1000);

  console.log(chalk.cyan.bold('\n✨ AA MD Bot is ready!\n'));
}

main().catch(err => {
  logger.error({ err: err.message }, '💥 Fatal startup error');
  process.exit(1);
});
