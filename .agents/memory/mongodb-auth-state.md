---
name: MongoDB Auth State
description: Baileys WhatsApp auth (creds + signal keys) persisted in MongoDB via lib/mongoAuthState.js — replaces firebaseAuthState.js and on-disk session files.
---

# MongoDB Auth State

`lib/mongoAuthState.js` is a custom Baileys `AuthenticationState` provider.

## Shape

- `useMongoAuthState(sessionId)` → `{ state, saveCreds }`
- `deleteMongoAuthState(sessionId)` → wipes both collections for that session
- `sessionHasAuth(sessionId)` → used by `initAllSessions()` to decide whether a
  session can restore silently or needs pairing

Collections: `auth_creds` (`_id: sessionId`) and `auth_keys`
(`_id: sessionId|type|id`). Both live in the same MongoDB database as the rest
of the bot.

## Behaviour

- No `session/` files are written; `sessionDir` in `config.js` is vestigial.
  The zero-disk note still holds: auth never touches the volume.
- Key writes are cached per type in memory and flushed on demand by Baileys'
  `keys.set`, so a reconnect does not re-read every key.
- Deleting a session (dashboard `DELETE /session/:id`, Telegram `/disconnect`,
  or `.deldevice`) must call `deleteMongoAuthState()` **and** `deleteSession()`
  — otherwise the creds remain and the next pairing attempt restores the old
  link instead of issuing a fresh code.

## Reconnect notes

- `Bad MAC` errors in the PM2 log are a libsignal symptom, not a Mongo issue;
  they typically mean a stale key bundle for one contact and are harmless
  unless they repeat for every message.
- If a session loop-crashes after a phone-side unlink, delete its auth state
  and re-pair rather than restarting PM2 repeatedly.
