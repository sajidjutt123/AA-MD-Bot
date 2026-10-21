---
name: MongoDB database
description: Persistence layer — MongoDB with an in-memory write-through cache; URI resolution, collections, and the sessionId|groupId key scheme.
---

# MongoDB database

`lib/database.js` replaces the old Firebase RTDB layer. The public API is a
`db` object with in-memory collections that are flushed to MongoDB on a
debounced schedule, so plugins never await I/O.

## Connection

- `MONGODB_URI` wins when it is set and does not match `PASSWORD` / `change_this`.
- Otherwise `MONGODB_PASSWORD` (legacy Atlas shorthand) builds an SRV URI from
  `MONGODB_USER` (default `a67515346_db_user`) and `MONGODB_HOST` (default
  `aa-md-bot.i1j26yw.mongodb.net`).
- The URI is resolved **lazily** inside `getDb()`, never at module load —
  ESM hoists static imports above `dotenv.config()`, so resolving early would
  see an empty environment.
- Self-hosted `mongodb://` URIs get `directConnection: true`; Oracle ADB
  (`oraclecloud.com` or `authMethod=PLAIN`) gets `retryWrites:false` +
  `loadBalanced:true`.
- No URI configured ⇒ the bot runs purely in memory and loses state on restart.

## Collections / access patterns

| Namespace | Key | Notes |
|---|---|---|
| `db.settings` | flat | global: `owners`, `superOwner`, `prefix`, `bannedUsers`, `antiViewOnce`, newsletter, status react |
| `db.sessionSettings` | `sessionId` → object | per connected number (`fake_lastseen_*`, `autoReply`, …) |
| `db.groups` | `sessionId\|groupId` | group features: antilink, welcome, `badWordsList`, warnings |
| `db.users`, `db.notes`, `db.birthdays`, `db.warns` | mixed | per-feature blobs |

## Two ways to reach `db.groups` (intentional, easy to get wrong)

- **Passive checkers** (`checkBadWords`, `checkAntiFake`, `checkAutoTranslate`,
  `checkAntiScam`, `checkAntiGm`, `checkChatbotResponse`) are called by
  `sessionManager` with the **raw** `db` and must use the 2-arg form:
  `db.groups.get(sessionId, jid)`.
- **Command bodies** receive a **session-scoped proxy** from `commandHandler`
  and use the 1-arg form: `db.groups.get(jid)`.

Both are correct today. The trap: a plugin that imports `database.js` directly
and calls `get(jid)` reads a phantom record keyed `jid|undefined` and fails
silently. Prefer the injected `db` from the plugin context.

## Flush semantics

`scheduleSave(collection)` debounces; `saveNow(collection)` forces a write and
is what owner commands (`.setprefix`, `.antiviewonce`, …) call so the change
survives an immediate restart. `flushAll()` runs from the uncaught-exception
handler in `index.js`.
