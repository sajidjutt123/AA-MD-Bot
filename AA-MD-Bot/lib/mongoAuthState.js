// ============================================
// AA MD Bot — MongoDB Auth State
// Replaces useFirebaseAuthState (no disk I/O)
// Stores WhatsApp credentials + signal keys
// in MongoDB — zero local file writes.
// ============================================

import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { getDb } from './database.js';
import {
  supabaseConfigured,
  getAuthCreds, setAuthCreds, getAuthKeys, setAuthKeys, deleteAuth,
} from './postgresStore.js';

// Storage backend: Supabase/Postgres when SUPABASE_DB_URL is set, otherwise
// MongoDB. Both paths expose the same three operations used below.
const useSupabase = () => supabaseConfigured();

// ── BufferJSON helpers ────────────────────────────────────────────────────────
function encodeVal(v) {
  try { return JSON.parse(JSON.stringify(v, BufferJSON.replacer)); } catch { return v; }
}
function decodeVal(v) {
  try { return JSON.parse(JSON.stringify(v), BufferJSON.reviver); } catch { return v; }
}

// ── Per-session in-memory key cache ──────────────────────────────────────────
// Prevents repeated MongoDB reads for the same key type within a session.
// Structure: { [sessionId]: { [type]: { [id]: value } } }
const _keyCache = {};

// Debounced save timers: { ["{sessionId}:{type}"]: timerHandle }
const _keySaveTimers = {};
const KEY_SAVE_DELAY_MS = 2500;

function scheduleKeySave(sessionId, type) {
  const timerKey = `${sessionId}:${type}`;
  clearTimeout(_keySaveTimers[timerKey]);
  _keySaveTimers[timerKey] = setTimeout(async () => {
    const typeData = _keyCache[sessionId]?.[type];
    if (!typeData) return;
    try {
      // Encode values (Buffer → base64 etc.)
      const encoded = {};
      for (const [id, val] of Object.entries(typeData)) {
        if (val !== undefined && val !== null) {
          encoded[id.replace(/\./g, '\uFF0E')] = encodeVal(val); // replace . (invalid MongoDB key)
        }
      }

      if (useSupabase()) {
        await setAuthKeys(sessionId, type, encoded);
        return;
      }

      const mdb = await getDb();
      if (!mdb) return;
      const docId = `${sessionId}:${type}`;
      await mdb.collection('auth_keys').replaceOne(
        { _id: docId },
        { _id: docId, sessionId, type, keys: encoded },
        { upsert: true }
      );
    } catch (e) {
      console.error(`[AuthState] key save failed (${sessionId}/${type}):`, e.message);
    }
  }, KEY_SAVE_DELAY_MS);
}

// ── Public: check if a session has valid auth in MongoDB ──────────────────────
export async function sessionHasAuth(sessionId) {
  try {
    if (useSupabase()) {
      const creds = await getAuthCreds(sessionId);
      return !!(creds && typeof creds === 'object' && (creds.noiseKey || creds.me));
    }
    const mdb = await getDb();
    if (!mdb) return false;
    const doc = await mdb.collection('auth_creds').findOne({ _id: sessionId });
    // Valid creds have at minimum 'noiseKey' or 'me' written by Baileys
    return !!(doc && typeof doc === 'object' && (doc.noiseKey || doc.me));
  } catch {
    return false;
  }
}

// ── Public: create auth state backed by MongoDB ───────────────────────────────
export async function useMongoAuthState(sessionId) {
  if (!_keyCache[sessionId]) _keyCache[sessionId] = {};

  const mdb = useSupabase() ? null : await getDb();

  // ── Load credentials ─────────────────────────────────────────────────────
  let creds;
  if (useSupabase()) {
    try {
      const rawCreds = await getAuthCreds(sessionId);
      creds = rawCreds ? decodeVal(rawCreds) : initAuthCreds();
    } catch {
      creds = initAuthCreds();
    }
  } else if (mdb) {
    try {
      const rawDoc = await mdb.collection('auth_creds').findOne({ _id: sessionId });
      if (rawDoc) {
        const { _id, ...rawCreds } = rawDoc;
        creds = decodeVal(rawCreds);
      } else {
        creds = initAuthCreds();
      }
    } catch {
      creds = initAuthCreds();
    }
  } else {
    // No MongoDB — in-memory only
    creds = initAuthCreds();
  }

  // ── Signal key store ──────────────────────────────────────────────────────
  const keys = {
    get: async (type, ids) => {
      // Lazy-load entire key type from MongoDB on first access
      if (!_keyCache[sessionId][type]) {
        _keyCache[sessionId][type] = {};
        if (useSupabase()) {
          try {
            const stored = await getAuthKeys(sessionId, type);
            if (stored && typeof stored === 'object') {
              for (const [encodedId, val] of Object.entries(stored)) {
                const id = encodedId.replace(/\uFF0E/g, '.');
                let decoded = decodeVal(val);
                if (type === 'app-state-sync-key' && decoded) {
                  try { decoded = proto.Message.AppStateSyncKeyData.fromObject(decoded); } catch {}
                }
                _keyCache[sessionId][type][id] = decoded;
              }
            }
          } catch (e) {
            console.error(`[AuthState] key load failed (${sessionId}/${type}):`, e.message);
          }
        } else if (mdb) {
          try {
            const docId = `${sessionId}:${type}`;
            const doc = await mdb.collection('auth_keys').findOne({ _id: docId });
            if (doc?.keys && typeof doc.keys === 'object') {
              for (const [encodedId, val] of Object.entries(doc.keys)) {
                const id = encodedId.replace(/\uFF0E/g, '.'); // restore dots
                let decoded = decodeVal(val);
                if (type === 'app-state-sync-key' && decoded) {
                  try { decoded = proto.Message.AppStateSyncKeyData.fromObject(decoded); } catch {}
                }
                _keyCache[sessionId][type][id] = decoded;
              }
            }
          } catch (e) {
            console.error(`[AuthState] key load failed (${sessionId}/${type}):`, e.message);
          }
        }
      }

      const result = {};
      for (const id of ids) {
        const val = _keyCache[sessionId][type][id];
        if (val !== undefined && val !== null) result[id] = val;
      }
      return result;
    },

    set: async (data) => {
      for (const [type, ids] of Object.entries(data)) {
        if (!_keyCache[sessionId][type]) _keyCache[sessionId][type] = {};
        for (const [id, value] of Object.entries(ids || {})) {
          if (value !== null && value !== undefined) {
            _keyCache[sessionId][type][id] = value;
          } else {
            delete _keyCache[sessionId][type][id];
          }
        }
        scheduleKeySave(sessionId, type);
      }
    },
  };

  // ── saveCreds — called by Baileys on creds.update ─────────────────────────
  const saveCreds = async () => {
    if (!mdb && !useSupabase()) return;
    try {
      const encoded = encodeVal(creds);
      if (useSupabase()) {
        await setAuthCreds(sessionId, encoded);
        return;
      }
      await mdb.collection('auth_creds').replaceOne(
        { _id: sessionId },
        { _id: sessionId, ...encoded },
        { upsert: true }
      );
    } catch (e) {
      console.error(`[AuthState] creds save failed (${sessionId}):`, e.message);
    }
  };

  return { state: { creds, keys }, saveCreds };
}

// ── Delete all auth data for a session (logout / delete) ─────────────────────
export async function deleteMongoAuthState(sessionId) {
  // Clear in-memory cache
  delete _keyCache[sessionId];

  // Cancel any pending debounced saves
  for (const tk of Object.keys(_keySaveTimers)) {
    if (tk.startsWith(`${sessionId}:`)) {
      clearTimeout(_keySaveTimers[tk]);
      delete _keySaveTimers[tk];
    }
  }

  // Delete from the active backend
  try {
    if (useSupabase()) {
      await deleteAuth(sessionId);
      return;
    }
    const mdb = await getDb();
    if (!mdb) return;
    await mdb.collection('auth_creds').deleteOne({ _id: sessionId });
    await mdb.collection('auth_keys').deleteMany({ sessionId });
  } catch (e) {
    console.error(`[AuthState] delete failed (${sessionId}):`, e.message);
  }
}
