// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot — HTTP control-plane auth + rate limiting
//
//  The dashboard API can create and destroy WhatsApp sessions, so it
//  must never be reachable unauthenticated. Every state-changing route
//  (and every route that leaks QR / pairing codes) goes through
//  `requireAuth()`; all of them also go through `rateLimit()`.
//
//  Token source, in order:
//    1. SESSION_SECRET from the environment (deploy/setup.sh generates it)
//    2. an ephemeral random token generated at boot and logged once
//
//  Clients authenticate with:
//    Authorization: Bearer <token>          (preferred)
//    ?token=<token>                          (SSE / <img> tags, no headers)
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { logger } from './logger.js';

const MIN_SECRET_LENGTH = 16;

function resolveToken() {
  const configured = (process.env.SESSION_SECRET || '').trim();
  const placeholders = /^(change_this|changeme|secret|password|test)/i;

  if (configured.length >= MIN_SECRET_LENGTH && !placeholders.test(configured)) {
    return { token: configured, ephemeral: false };
  }

  const generated = crypto.randomBytes(24).toString('hex');
  return { token: generated, ephemeral: true };
}

const { token: API_TOKEN, ephemeral: EPHEMERAL_TOKEN } = resolveToken();

if (EPHEMERAL_TOKEN) {
  logger.warn(
    '🔑 SESSION_SECRET is missing or too short — generated an ephemeral API token for this boot.\n' +
    `   Set SESSION_SECRET in .env to make it stable.\n   Current token: ${API_TOKEN}`
  );
}

export const apiToken = API_TOKEN;
export const apiTokenIsEphemeral = EPHEMERAL_TOKEN;

// ── Timing-safe comparison ───────────────────────────────────────────────────
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Compare fixed-length digests so the comparison time does not leak length.
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/** Extract the presented credential: Bearer header first, then ?token=. */
export function extractToken(req, url) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, '').trim();
  }
  if (url?.searchParams) {
    const q = url.searchParams.get('token');
    if (q) return q.trim();
  }
  const custom = req.headers['x-api-token'];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return '';
}

/** True when the request carries a valid token. Constant-time. */
export function isAuthorized(req, url) {
  const presented = extractToken(req, url);
  if (!presented) return false;
  return safeEqual(presented, API_TOKEN);
}

/**
 * Guard a route. Returns true when the request was rejected (and the
 * response has already been written), false when it may proceed.
 */
export function requireAuth(req, res, url, routeLabel = 'route') {
  if (isAuthorized(req, url)) return false;

  logger.warn(
    { ip: clientIp(req), route: routeLabel, method: req.method },
    '🚫 Unauthorized API request rejected'
  );
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  return true;
}

// ── Rate limiting (fixed window, in-memory) ─────────────────────────────────
const buckets = new Map(); // key → { count, resetAt }

/** Best-effort client IP. Honours X-Forwarded-For (nginx reverse proxy). */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  if (typeof req.headers['x-real-ip'] === 'string') return req.headers['x-real-ip'];
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Count a request against `key`. Returns { limited, retryAfter } and
 * normalises the bucket map size so a flood of IPs cannot grow it forever.
 */
export function rateLimit(key, limit = 20, windowMs = 60_000) {
  const now = Date.now();

  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (bucket.count > limit) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { limited: false, retryAfter: 0 };
}

/**
 * Guard a route with a per-IP limit. Returns true when rejected.
 */
export function enforceRateLimit(req, res, routeLabel, limit, windowMs) {
  const { limited, retryAfter } = rateLimit(`${routeLabel}:${clientIp(req)}`, limit, windowMs);
  if (!limited) return false;

  logger.warn({ ip: clientIp(req), route: routeLabel }, '🚦 API rate limit hit');
  res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) });
  res.end(JSON.stringify({ ok: false, error: 'Too many requests', retryAfter }));
  return true;
}

// ── CORS origin allowlist ───────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'https://aa-md-bot.vercel.app',
];

export function allowedOrigins() {
  const configured = (process.env.DASHBOARD_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

/**
 * Set CORS headers only for allowed origins instead of `*`, so a random
 * page cannot script the session API with the owner's browser.
 */
export function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (!origin) return;
  const allowed = allowedOrigins();
  if (!allowed.has(origin)) return;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}
