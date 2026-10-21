import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { db } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Prefix resolution ────────────────────────────────────────────────────────
// Single source of truth: db.settings.prefix (written by `.setprefix`), with
// config.prefix as the bootstrap default. Accepts both shapes that exist in
// the wild: an array `['.', '!']` and a bare string `'.'`.
function normalizePrefixes(value) {
  if (Array.isArray(value)) {
    return value.filter(p => typeof p === 'string' && p.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) return [value];
  return null;
}

export function getPrefixes() {
  let stored = null;
  try {
    stored = db.settings.getValue('prefix');
  } catch {
    // Database not ready yet (very early boot) — fall back to config.
  }
  const list =
    normalizePrefixes(stored) ||
    normalizePrefixes(config.prefix) ||
    ['.'];
  // Longest first so a multi-char prefix wins over a 1-char one.
  return [...new Set(list)].sort((a, b) => b.length - a.length);
}

export function getPrefix(text) {
  if (typeof text !== 'string') return null;
  for (const p of getPrefixes()) {
    if (text.startsWith(p)) return p;
  }
  return null;
}

export function parseCommand(text) {
  const prefix = getPrefix(text);
  if (!prefix) return null;
  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return null;
  const [cmd, ...args] = withoutPrefix.split(/\s+/);
  return { prefix, command: cmd.toLowerCase(), args, text: args.join(' ') };
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function getTime(tz = config.timezone) { return moment().tz(tz).format('HH:mm:ss'); }
export function getDate(tz = config.timezone) { return moment().tz(tz).format('DD/MM/YYYY'); }
export function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export function isGroup(jid) { return jid?.endsWith('@g.us'); }
export function generateId() { return crypto.randomBytes(8).toString('hex'); }

export function tempFile(ext = 'tmp') {
  const dir = path.join(__dirname, '../temp');
  fs.ensureDirSync(dir);
  return path.join(dir, `${generateId()}.${ext}`);
}

export async function cleanTemp() {
  const dir = path.join(__dirname, '../temp');
  const files = await fs.readdir(dir).catch(() => []);
  const now = Date.now();
  for (const file of files) {
    const fp = path.join(dir, file);
    const stat = await fs.stat(fp).catch(() => null);
    if (stat && now - stat.mtimeMs > 30 * 60 * 1000) await fs.remove(fp).catch(() => {});
  }
}

export async function getBuffer(url, options = {}) {
  const { default: axios } = await import('axios');
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    },
    ...options,
  });
  return Buffer.from(res.data);
}

export function getBestThumb(info) {
  const videoId = info.id || (info.webpage_url || '').match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  if (info.thumbnail) return info.thumbnail;
  if (Array.isArray(info.thumbnails) && info.thumbnails.length) {
    const sorted = [...info.thumbnails].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
    return sorted[0]?.url || null;
  }
  return null;
}

export default { getPrefix, getPrefixes, parseCommand, formatDuration, formatBytes, getTime, getDate,
  randomChoice, randomInt, sleep, isGroup, generateId, tempFile, cleanTemp, getBuffer, getBestThumb };
