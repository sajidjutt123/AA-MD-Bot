// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot — Supabase (PostgreSQL) storage backend
//
//  Optional alternative to MongoDB. Enable it by setting:
//      SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
//
//  (Supabase → Project Settings → Database → Connection string → "Session pooler")
//
//  When this is set, ALL bot state lives in Postgres:
//    • bot_state              — one JSONB row per logical collection
//                               (settings, groups, sessionSettings, notes, …)
//    • whatsapp_auth_creds    — Baileys creds per session
//    • whatsapp_auth_keys     — Baileys signal keys per session/type
//
//  The tables are created automatically on first boot (idempotent), so the
//  only manual step is running `supabase/schema.sql` if you prefer to create
//  them yourself or add Row Level Security.
//
//  `pg` is imported lazily so the bot still runs (MongoDB or in-memory) when
//  the package is not installed and Supabase is not configured.
// ═══════════════════════════════════════════════════════════════════

import { logger } from './logger.js';

let _pool = null;
let _initPromise = null;
let _schemaReady = false;

export function supabaseConfigured() {
  return !!(process.env.SUPABASE_DB_URL || '').trim();
}

function connectionString() {
  return (process.env.SUPABASE_DB_URL || '').trim();
}

export async function getPool() {
  if (_pool) return _pool;
  const url = connectionString();
  if (!url) return null;

  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch (e) {
    logger.error(
      '❌ SUPABASE_DB_URL is set but the `pg` package is missing — run: npm install pg'
    );
    throw e;
  }

  _pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.SUPABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase's pooler requires TLS; self-hosted/local instances usually don't.
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });

  _pool.on('error', (err) => logger.warn({ err: err.message }, 'Supabase pool error'));
  return _pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bot_state (
  name        text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_auth_creds (
  session_id  text PRIMARY KEY,
  creds       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
  session_id  text NOT NULL,
  key_type    text NOT NULL,
  keys        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, key_type)
);

CREATE INDEX IF NOT EXISTS whatsapp_auth_keys_session_idx ON whatsapp_auth_keys (session_id);
`;

/** Create the tables once per process. Safe to call repeatedly. */
export async function initSupabase() {
  if (_schemaReady) return true;
  if (!supabaseConfigured()) return false;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const pool = await getPool();
    await pool.query(SCHEMA_SQL);
    _schemaReady = true;
    logger.info('🗄️  Supabase/Postgres schema ready');
    return true;
  })().catch((err) => {
    _initPromise = null; // allow a retry on the next call
    throw err;
  });

  return _initPromise;
}

// ── Generic JSONB collections ───────────────────────────────────────────────

export async function loadCollection(name) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return {};
  const { rows } = await pool.query('SELECT data FROM bot_state WHERE name = $1', [name]);
  const data = rows[0]?.data;
  return data && typeof data === 'object' ? data : {};
}

export async function saveCollection(name, data) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO bot_state (name, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [name, JSON.stringify(data ?? {})]
  );
}

// ── WhatsApp auth state ─────────────────────────────────────────────────────

export async function getAuthCreds(sessionId) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    'SELECT creds FROM whatsapp_auth_creds WHERE session_id = $1',
    [sessionId]
  );
  return rows[0]?.creds || null;
}

export async function setAuthCreds(sessionId, creds) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO whatsapp_auth_creds (session_id, creds, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (session_id) DO UPDATE SET creds = EXCLUDED.creds, updated_at = now()`,
    [sessionId, JSON.stringify(creds)]
  );
}

export async function getAuthKeys(sessionId, type) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    'SELECT keys FROM whatsapp_auth_keys WHERE session_id = $1 AND key_type = $2',
    [sessionId, type]
  );
  return rows[0]?.keys || null;
}

export async function setAuthKeys(sessionId, type, keys) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO whatsapp_auth_keys (session_id, key_type, keys, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (session_id, key_type) DO UPDATE SET keys = EXCLUDED.keys, updated_at = now()`,
    [sessionId, type, JSON.stringify(keys ?? {})]
  );
}

export async function deleteAuth(sessionId) {
  await initSupabase();
  const pool = await getPool();
  if (!pool) return;
  await pool.query('DELETE FROM whatsapp_auth_creds WHERE session_id = $1', [sessionId]);
  await pool.query('DELETE FROM whatsapp_auth_keys  WHERE session_id = $1', [sessionId]);
}

// ── Diagnostics (used by /healthz and the dashboard) ────────────────────────

export async function supabaseHealth() {
  if (!supabaseConfigured()) return { enabled: false };
  try {
    const pool = await getPool();
    const t0 = Date.now();
    await pool.query('SELECT 1');
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM whatsapp_auth_creds) AS sessions,
         (SELECT count(*) FROM bot_state)           AS collections`
    );
    return {
      enabled: true,
      ok: true,
      latencyMs: Date.now() - t0,
      sessions: Number(rows[0]?.sessions || 0),
      collections: Number(rows[0]?.collections || 0),
    };
  } catch (e) {
    return { enabled: true, ok: false, error: e.message };
  }
}

export async function closePool() {
  if (_pool) {
    await _pool.end().catch(() => {});
    _pool = null;
    _schemaReady = false;
    _initPromise = null;
  }
}

export default {
  supabaseConfigured, initSupabase, loadCollection, saveCollection,
  getAuthCreds, setAuthCreds, getAuthKeys, setAuthKeys, deleteAuth,
  supabaseHealth, closePool, getPool,
};
