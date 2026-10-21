# AA MD Bot — Full Repository Review

**Repository:** `sajidjutt123/AA-MD-Bot` · branch `arena/cbf31bf9-aa-md-bot` · base commit `36dc600`
**Reviewed:** every tracked file (346 tracked files, 32,129 lines of JS/ESM source)
**Review date:** 2026-10-21

---

## 1. Executive summary

AA MD Bot is a **multi-session Baileys (WhatsApp Web / multi-device) bot** with:

| Metric | Value |
|---|---|
| Tracked files | 346 |
| JavaScript LOC (all) | 32,129 |
| Core (`index.js`, `config.js`, `lib/*`) | 6,901 LOC |
| Plugins | 280 files, **24,837 LOC**, ~982 KB |
| Commands declared | 284 entries → **269 unique command names**, ~749 aliases |
| Plugin categories | 11 |
| Distinct third-party API hosts | **158** |
| Syntax check (`node --check`) | **346/346 pass, 0 errors** |
| Import/export resolution | **0 unresolved** (multi-line-aware resolver) |
| Undeclared npm dependencies | **0** |

**Verdict:** This is a large, genuinely working, feature-dense codebase with a clean plugin architecture and unusually careful fallback logic inside individual commands. It is *not* a toy. However it is **structurally uneven**: a well-designed event/command core is surrounded by 280 independently written plugins that duplicate each other (~45 command/alias collisions), advertise commands that don't exist, and share almost no abstraction. The most serious problems are not "does it work" but **(a) the HTTP control surface is unauthenticated**, **(b) several features are permanently inert due to unwritten settings keys**, and **(c) a handful of permission flags are never enforced**.

Nothing in the repo is broken at load time: the bot boots, loads 280 plugins, and every `import` resolves.

---

## 2. Repository layout

```
AA-MD-Bot/                      ← git root
├── .replit, replit.md          ← Replit workspace metadata
├── package.json                ← ROOT: only `play-dl` (stray/legacy)
├── package-lock.json           ← tracked, but .gitignore says it shouldn't be
├── scripts/post-merge.sh       ← cd AA-MD-Bot && npm install
├── attached_assets/            ← a pasted PM2 log dump (not code)
└── AA-MD-Bot/                  ← THE ACTUAL APP (nested one level down)
    ├── index.js                ← HTTP server + boot orchestrator
    ├── config.js               ← static identity/config
    ├── ecosystem.config.cjs    ← PM2
    ├── .env.example, .npmrc, cookies.txt.example
    ├── dashboard.html           ← static landing page (no JS)
    ├── banner.jpeg / banner.webp / logo.jpeg / logo.webp / favicon.webp
    ├── deploy/  setup.sh (68 KB), redeploy.sh (28 KB), ORACLE-DEPLOY.md
    ├── scripts/ probe_dc.mjs, scrape_dc_endpoints.mjs  ← one-off API discovery tools
    ├── lib/     19 modules (6,901 LOC with index+config)
    └── plugins/ 11 categories, 280 files
```

**Nesting caveat:** every npm command, PM2 `cwd`, and deploy path must target `AA-MD-Bot/AA-MD-Bot`. The root `package.json` (`play-dl` only) and root lockfile are dead weight and invite "wrong directory" installs.

---

## 3. Boot sequence (`index.js`)

1. `.env` loaded manually via `createRequire` + dotenv (ESM hoisting workaround — deliberately documented in `lib/database.js`).
2. HTTP server on `PORT` (default **5000**), bound `0.0.0.0`.
3. Routes: `GET /` (dashboard.html), `GET /api`, `GET /events` (SSE), `GET /qr-image`, `GET /healthz`, `/stats`, `/status`, `/pairing-code`, `POST /session/create`, `DELETE /session/:id`.
4. `initDatabase()` → `loadAllPlugins()` → `initAllSessions()`.
5. Background: birthday scheduler, 60 s "fake last seen" loop, 30 min `cleanTemp`, plus Telegram bots (`initTelegramAdmin()`, `initTelegramFeatures()`).

Restart resilience is handled rather than assumed: MongoDB failures degrade to in-memory, and Telegram is skipped with a warning if tokens are absent.

---

## 4. Core library (`lib/`) — module by module

| Module | Size | What it does | Assessment |
|---|---|---|---|
| `sessionManager.js` | 951 L | One Baileys socket per session; auth state in MongoDB; reconnect/backoff; all `messages.upsert` / `group-participants.update` / `call` event wiring; passive feature checks; antidelete, flood, fake-last-seen | The heart of the bot. Well-structured but very large; a God-object |
| `commandHandler.js` | ~520 L | Prefix parse, owner/sudo resolution, ban list, mode gating, cooldowns, anti-spam, session-scoped `db` proxy, context injection, anon relay | Clean. The scoped-`db` proxy is the best design decision in the repo |
| `pluginLoader.js` | ~120 L | Recursive load of `plugins/**/*.js`, normalises single/array exports, index by command + alias | Simple and correct; last-loaded wins on collisions (silent) |
| `database.js` | ~600 L | MongoDB with an in-memory cache + debounced `scheduleSave`; collections: groups, users, settings, sessionSettings, birthdays, notes, warns | Solid. The `groups` key is `sessionId|groupId`, which is what keeps multi-session data separate |
| `mongoAuthState.js` | — | Baileys `AuthenticationState` persisted to Mongo (`useMongoAuthState`, `deleteMongoAuthState`, `sessionHasAuth`) | Correct; means no `session/` disk state in production |
| `antiViewOnce.js` | 743 L | View-once reveal: v1/v2/extension/ephemeral wrappers, in-memory store (200 entries / 60 min TTL), auto-reveal to self-chat, reply-trigger reveal | Best-engineered module in the project. Bounded memory, dedup, real fallbacks |
| `aiEngine.js` | ~300 L | `chatAI` / `chatAIFast` with 4–6 providers raced (`raceSuccess`), LRU-evicted per-JID history (300 JIDs × 20 turns) | Good resilience design; the "Ayla, never admit you are an AI" persona in `chatAIFast` is a deliberate but deceptive prompt |
| `telegramAdmin.js` | 525 L | Pairing bot: `/start /pair /help /ping /status /disconnect /broadcast /sessions`, inline keyboards, in-place message editing | Works; minor logic bugs (see §8) |
| `telegramFeatures.js` | 2,198 L | A second Telegram bot with **39 handlers**: media downloaders, AI, weather, translate, wiki, movie, anime, lyrics, news, crypto, github, urban, short, ss, joke/quote/fact, qr, meme, calc, currency, time, password, sticker, ocr | The single largest file. ~90% of it duplicates WhatsApp plugins |
| `ytdlp.js` | — | `YTDLP` binary path, `YTDLP_FLAGS`, `getCookiesFlag()`, `COOKIES_PATH` | Central, but the flags are *string-split* by every consumer |
| `channelFollow.js` | — | Auto-follow of `db.settings.followChannels`; invite → newsletter JID cache | Fine |
| `anonRelay.js` | — | Two-way anonymous relay, 24 h TTL sessions | Small and correct |
| `fakeQuoted.js`, `msgTracker.js`, `imgUpload`, `invidious.js`, `helper.js`, `logger.js` | — | Quoted-message spoofing, sent-message tracking, 4-host upload fallback, 6 Invidious instances, formatting helpers, pino logger | All small, focused, no issues found |

**Architectural note (important, and easy to misread):** there are two *intentional* database access styles:
* passive checkers (`checkBadWords`, `checkAntiFake`, `checkAutoTranslate`, `checkAntiScam`, `checkAntiGm`, `checkChatbotResponse`) are called by `sessionManager` with the **raw** `db` and use `db.groups.get(sessionId, jid)`;
* command bodies receive the **scoped proxy** and use `db.groups.get(jid)`.

Both are correct *today* — I verified all six checker call sites and the proxy definition in `commandHandler.js:441-450`. But the identical method name with two different arities is a landmine: any new plugin that imports `db` directly and calls `get(jid)` silently reads a phantom record keyed `jid|undefined`, which fails silently rather than throwing.

---

## 5. Plugin inventory

280 files, 269 unique commands. Every file passes syntax check and exports a valid plugin object.

| Category | Files | LOC | Notable content |
|---|---|---|---|
| **search** | 52 | 3,643 | `ai`, `imagine`, `weather`, `news`, `movie`, `anime`, `wiki`, `lyrics`, `shazam`, `crypto`, `stock`, 13 "stalk" commands, `dns`/`whois`/`ip`, `carbon`, `bible`, `recipe`, `npm`, 11 AI-model re-export shims, `aimodels.js` factory, `animagine.js` |
| **media** | 42 | 4,360 | `sticker`/`take`/`steal`/`toimg`/`togif`/`tovid`, ffmpeg filters (blur, flip, grayscale, resize), `attp`, `brat`, `fakechat` (402 L canvas renderer), `logo` (ephoto360 styles), `aiedit`, `aivideo` (415 L, 4 models), `rembg`, `remini`, `ocr`, hate-template cards (`hitler`, `rip`, `trash`, `trigger`, `shit`) |
| **fun** | 31 | 2,634 | `gf` (532 L) / `bf` (428 L) AI-companion simulators, games (ttt, hangman, wordscramble, trivia), 8ball/truth/dare/wyr, `xvideos`, `asiansearch`, `waifu`, `emojimix`, `ppcouple`, `hack` (fake animation) |
| **owner** | 30 | 2,112 | `sh` (spawn bash), `eval`, `restart`, `botzip`, `cookies`, `broadcast`, `mode`, `maintenance`, `antispam`, `autoreact`, `banuser`, `devices`/`adddevice`/`deldevice`, `reveal`, `setowner`, `followchannel`, `stripfwd` |
| **tools** | 27 | 2,470 | `backup`, `dbstats`, `reload`, `status`, `system`, `memory`, `logs`, `speedtest`, `hash`, `password`, `base64`, `morse`, `readmore`, `tourl`/`catbox`, `vcard`, `currency`, `geoip`, `livescore`, `tempmail`, `tempnumber`, `health`, `productivity`, `igboost`/`tiktokboost` |
| **admin** | 26 | 1,119 | Group enforcement: antilink, antispam, antibot, antifake, antiflood, antigm, antiscam, antibadwords, antidemote, antidelete, antitag, antiviewonce, warn, tagall, promote/demote, mute/lock, welcome/goodbye, setwelcome, termategc, report |
| **utility** | 20 | 1,951 | `menu` (23 KB), `anon`, `bday`, `calc`, `hash`, `id`, `info`, `notes`, `password`, `ping`, `qr`, `shorten`, `time`, `uptime`, `support`, `settings`, `tempmail`, `translate`, `preview`, `base64` |
| **download** | 17 | 3,090 | `youtube` (play/song/yt/mp3/mp4, 21 KB), `downloader` (`dl` multi-platform), `instagram`, `pinterest`, `twitter`, `threads`, `facebook`, `soundcloud`, `spotify`, `tiktok`, `capcut`, `apk`, `moviedl`, `ringtone`, `ydesc`, `tts`, `tts` (ffmpeg opus) |
| **group** | 16 | 617 | `lock`/`unlock`, `mute`, `pin`, `link`/`revoke`, `members`, `poll`, `rules`, `disap`, `welcome`, `autostatus`, `autotranslate` |
| **gb** ("ghost features" — per-session stealth) | 16 | 1,580 | alwaysonline, ghost, autoread, autoreply, privacy, fakelastseen, onlinealert, typing, flood, schedule, statussave, afk, chatbot, autoai, profilepic, gbmenu |
| **islamic** | 3 | 1,261 | `islamic.js` is a **multi-plugin module** (37.9 KB, array export): duas, zikr, hadith, 99 names, kalimas, Jafari content; plus `quran.js` (alquran.cloud + audio) and `islamic_menu.js` |

### Plugin architecture assessment

**Strengths**
* Uniform contract (`command`, `alias`, `category`, `execute({...})`) with flags (`ownerOnly`, `superOwnerOnly`, `groupOnly`, `adminOnly`, `cooldown`, `usage`).
* Consistent UX: reaction lifecycle (`⏳` → `✅`/`❌`), branded footers, reply-on-error.
* Real multi-provider fallback chains almost everywhere — e.g. `youtube.js` (3 mirror APIs per format, parallel first-success with 90/120 s timeouts, 10 KB/50 KB size guards), `downloader.js` (TikTok tikwm → yt-dlp), `plugins/media/rembg.js` (3 upload hosts × 2 APIs).
* Defensive cleanup: temp files removed on both success and failure paths (verified in `instagram`, `pinterest`, `twitter`, `threads`, `tts`, `attp`).

**Structural weaknesses**
* **~45 duplicate command/alias groups.** The loader silently lets the last-loaded file win. Body-confirmed: `antifake`↔`antiflood` (alias `antiflood`), `unmute`↔`unlock` (alias `unlock`), `lock`/`mute`, `pin`, `instagram`, `pinterest`, `twitter`, `ytinfo`, `ask`, `love`/`ship`, `dmai`, `repeat`, `pfp`/`getpp`, `ss`, `addowner`, `exec`, `dict`, `iplookup`, `base64`/`b64`, `tourl`/`geturl`/`upload`, `hash`/`md5`/`sha256`, `calc`, `password`/`genpass`, `tempmail`.
* **Near-identical twin plugins**: `utility/hash.js` vs `tools/hash.js` (aliases disagree), `utility/password.js` vs `tools/password.js`, `utility/calc.js` vs `tools/mathtools.js`, `utility/tempmail.js` vs `tools/tempmail.js`, `search/define.js` vs `search/dictionary.js`, `fun/love.js` vs `fun/ship.js`.
* **Copy-paste instead of shared helpers**: 32 plugins each build their own temp path; ~40 re-implement "download buffer from quoted message"; Telegram (`telegramFeatures.js`) re-implements ~30 commands that already exist as WhatsApp plugins.
* **No tests, no linter, no CI.** No `test/`, no `eslint` config, no workflow files.

---

## 6. Security findings (ordered by severity)

### 🔴 S1 — The HTTP control surface is unauthenticated
```js
res.setHeader('Access-Control-Allow-Origin', '*');
...
if (p === '/session/create' && req.method === 'POST') { ... }
if (delMatch && req.method === 'DELETE') { await deleteSession(...) }
```
* `POST /session/create` accepts a caller-supplied id + phone number and starts a WhatsApp pairing.
* `DELETE /session/:id` deletes any session, unauthenticated.
* `GET /events` streams QR codes and pairing codes for **all** sessions to any client.
* CORS is `*`, `Access-Control-Allow-Headers` includes `Authorization`, and **there is no rate limiting anywhere in `index.js`**.

`SESSION_SECRET` is generated by `deploy/setup.sh`, written to `.env`, and documented in `.env.example` — but **no code ever reads it**. It is a security knob wired to nothing.

**Impact:** anyone who discovers `http://host:5000` can hijack onboarding (pair their own number), delete live sessions, or harvest QR/pairing codes. The deploy guide explicitly publishes port 5000 to `0.0.0.0/0`.

**Fix:** bearer-token middleware on every mutating route and on `/events`, explicit origin allowlist, per-IP rate limit, and either bind the dashboard to a private interface or put it behind nginx basic auth.

### 🟠 S2 — Real personal data committed in source
* `config.js`: real owner `923316041183`, super-owner `923346741532`.
* `lib/database.js`: hardcoded Atlas host `aa-md-bot.i1j26yw.mongodb.net` and username `a67515346_db_user` (password from env — acceptable, the rest is not).
* `lib/telegramAdmin.js`: hardcoded Telegram owner ID `6001083166`.
* `plugins/search/stickersearch.js`: **live Google/Tenor API key** `AIzaSy…` as a fallback default. This one is an actual leaked credential and should be rotated and removed.
* Public demo keys used as defaults (`ocr.space` `helloworld`, OMDb `trilogy`) — tolerable but brittle.

### 🟠 S3 — `POST /session/create` + `/qr-image` enable account-linking abuse
Combined with S1, the pairing endpoints let anyone drive the bot's WhatsApp linking flow. Telegram pairing (`telegramAdmin.js`) is *intentionally* open to all users, which is defensible for a public service but should be rate-limited (`doPair` calls `_deleteSession` then `_createSession` on every tap).

### 🟡 S4 — Owner shell is correctly gated, but shell-out hygiene is inconsistent
* `plugins/owner/shell.js` uses `spawn('bash', ['-c', cmd])` with a 3-minute kill — **but it is `ownerOnly` + `superOwnerOnly`**, so this is by design.
* Downloader/media plugins use `execFile` with argument arrays → no injection.
* **However** ~10 plugins (`media/blur|flip|grayscale|resize|sticker|toaudio|togif`, `download/tts`) build **shell strings** for ffmpeg. Their interpolations are bot-generated paths/numbers today, so I found no exploitable path — but it is one careless `text` interpolation away from RCE, and `resize`'s `width`/`height` come straight from user args (`scale=${width}:${height}`) with only numeric validation in the command body.

**Recommendation:** convert all of these to `execFile('ffmpeg', [...])`. This is a 30-minute change with zero behavioural risk.

### 🟡 S5 — Forced channel watermarking on every message
Every reply carries `forwardedNewsletterMessageInfo` / `externalAdReply` branding, and `channelFollow.js` auto-follows configured channels. Functionally a growth feature; worth knowing it is deliberate and centralized.

### 🟡 S6 — Content & policy exposure
Adult-content commands ship enabled: `fun/xvideos.js`, `fun/asiansearch.js` (both `🔞`), plus `fun/gf.js` / `fun/bf.js` with NSFW moods, and `tools/boost.js` (`igboost` / `tiktokboost`) which automates engagement inflation. These are terms-of-service and app-store risks, not technical bugs, but they should be gated behind an owner setting if the bot is distributed.

---

## 7. Confirmed functional bugs

| # | Bug | Evidence | Effect |
|---|---|---|---|
| **B1** | **`.setprefix` is a complete no-op** | `owner/setprefix.js` writes `db.settings.setValue('prefix', [newPrefix])`, but `helper.js getPrefix()` iterates the **static** `config.prefix` array from `config.js` and every command is parsed through it | Changing the prefix has **no effect on command dispatch**. `menu.js` echoes `config.prefix[0]` (old value) while `sessionManager.js:616` and `antiViewOnce.js:447` read the DB value and treat the stored array as a string (works only by accident for one element) |
| **B2** | **`voword` / keyword view-once reveal is dead** | `voKeyword` is only *read* (`antiViewOnce.js:446`); nothing in 280 plugins ever writes it | The documented keyword trigger (and the 4-emoji trigger's config) can never be enabled from chat |
| **B3** | **`autostatus` emoji setting is dead** | `statusEmoji` is read-only (no writer) | Autostatus always uses its built-in default |
| **B4** | **`isAdmin` is never injected** | `group/grouprules.js` destructures `isAdmin`; `commandHandler.js` context has no `isAdmin` key | `isAdmin` is always `undefined` → `.grouprules` writes are denied for everyone, including real admins |
| **B5** | **`botAdminOnly` is never enforced** | Declared by `group/disap.js`; `commandHandler.js:363-380` checks `ownerOnly`, `superOwnerOnly`, `groupOnly`, `adminOnly`, `privateOnly` — not `botAdminOnly` | `disap` runs without verifying the bot can actually change disappearing settings. (`privateOnly` *is* checked but declared by no plugin, so it is dead in the other direction) |
| **B6** | **Dead menu entries** | `gbmenu` advertises `autostatusseen`; `settings_menu` advertises `ban`, `unban`, `block`, `unblock` | 5 advertised commands did not exist (`grep` for `command: 'ban'` etc. returns zero). Real names are `banuser` / `botban`. *(Correction: `supermenu` advertises `eval`, which does exist — my earlier note about `js` was a regex artifact.)* |
| **B7** | **Field drift on bad words** | `admin/antibadwords.js` writes `grp.badWords`; the default record is created with `badwordsList: []`, and the checker reads `badWordsList \|\| badWords` | Works via the fallback, but the two writers/readers disagree; a future read of `badWordsList` alone will see stale data |
| **B8** | **Dead post-strip replace in antifake** | `replace(/\D/g,'').replace(/@.*/,'')` — after `\D` removal no `@` can remain | Harmless, but signals an unreviewed edit |
| **B9** | **`/disconnect` phone prefix is unreachable** | `const phone = match[1].replace(/[^0-9]/g,'')` then `phone.startsWith('tg_')` | The `tg_` branch can never be true (cosmetic) |
| **B10** | **`/broadcast` reports success without delivering** | `_botEvents.emit('broadcastRequest', ...)` then `ok = active.length` | Telegram reports "sent to N sessions" regardless of whether any handler exists or delivery succeeded |
| **B11** | **Telegram `/broadcast` will throw if `_botEvents` is null** | `_botEvents.emit(...)` inside `try` | Caught and reported as "Broadcast failed"; the feature silently no-ops when the bot was initialised without the event bus |

---

## 8. Correctness & maintainability risks (not yet bugs)

1. **Plugin category drift:** `download/github.js` declares `category: "search"`; `group/autostatus.js` declares `category: "owner"`. The menu builds from category, so placement and menu grouping disagree.
2. **`utility/menu.js` hard caps per category** (`max: 20/25/30`). *(Correction: `max: 0` means "show all", and `islamic` is handled by a dedicated summary box before the cap is applied — the islamic section is NOT hidden. The only real effect is that `media` (42 files) is truncated to 30 with an explicit `…+12 more → .menu media` hint, which is by design.)*
3. **`setInterval` in plugins:** `gb/alwaysonline.js` (10 s presence), `media/aivideo.js`, `owner/shell.js`. Only `alwaysonline` has a clear teardown (`stopAlwaysOnline`); plugin-level timers survive reloads and multiply.
4. **`gb/schedule.js` keeps schedules in an in-memory `Map`** — lost on every restart, silently.
5. **`gb/ghost.js` and `alwaysonline` are mutually exclusive** (one clears the other) but nothing in the UI says so.
6. **`channelFollow` caches invite→newsletter mapping in `db.settings`** — correct, but stale-invite handling is untested.
7. **`aiEngine` history is keyed by JID only** — in a group, all members share one conversation memory.
8. **Two Telegram bots, two tokens, two codebases** (`telegramAdmin.js` + `telegramFeatures.js`) with different owner checks (`chat.id !== OWNER_ID` vs callback-only). Consolidating would remove ~2,000 duplicated lines.
9. **`chatAIFast` prompt instructs the model to never admit being an AI** ("Ayla, … NEVER say you are an AI"). Deliberate product choice, but it is deceptive-by-design and worth an explicit decision.
10. **158 external hosts** and a heavy dependency on one free API (`apis.davidcyriltech.my.id`, 35 call sites in one form or another). If that host disappears, a large fraction of commands degrade at once. `lib/aiEngine.js` and the downloaders mitigate this with races/fallbacks; the "stalk" plugins mostly do not.
11. **`isSudo` is literally `isOwner`** (`commandHandler.js`: `isOwner: owner, isSudo: owner`). Every sudo user therefore passes `plugin.ownerOnly` checks. Probably intentional, but it means `.addsudo` is an owner-level grant, not a limited one.
12. **The context object is not documented anywhere.** 26 keys are injected (`sock, msg, jid, senderJid, fromMe, isGroupMsg, command, args, text, prefix, sessionId, isOwner, isSudo, reply, react, send, sendMedia, db, config, sessionSettings, quoted, ownJid, getQuoted, logger`), yet plugins destructure them ad hoc — which is exactly how `isAdmin` (never injected) slipped through.

---

## 9. Code quality

**Positives**
* Consistent ESM, consistent plugin contract, no `require` mixed into ESM, no circular-import breakage.
* Defensive error handling nearly everywhere (`try/catch` with graceful user messaging) rather than crashes.
* Bounded in-memory structures (view-once store 200/TTL, AI history 300 JIDs, online alerts max 10).
* `logger.js` (pino) is used in `lib/`, with structured fields.

**Negatives**
* **Mixed logging:** 25 `console.*` calls in `lib/`, 44 across `plugins/`, 5 in `index.js` alongside pino. Logs are therefore split across two formats.
* **Very long functions** in `telegramFeatures.js` (single handlers of 100+ lines) and `sessionManager.js` (socket setup + 8 event handlers in one function).
* **Duplicate formatting logic:** every plugin hand-rolls its own footer/banner string; a `lib/ui.js` would remove thousands of repeated lines.
* **Dead code:** the 11 `plugins/search/*.js` re-export shims are deliberate, but the leftover `category: "search"` in `download/github.js`, unreachable Telegram branches, and unused `privateOnly` flag are not.
* **Comment/artifact leakage:** a stray `// …`-stripped `https:` in `group/link.js` and `revoke.js` is a *reading artifact of my review tooling*, not a code bug — the URLs are intact.
* **No JSDoc/typing anywhere.** 32 K LOC with zero type hints means every contract (`execute({...})` destructuring, db shapes) is implicit. Adding `// @ts-check` + JSDoc on `lib/` would catch the `isAdmin`-style bugs automatically.

---

## 10. Operations & deployment

`deploy/setup.sh` (1,400+ lines) is a genuinely impressive idempotent installer: architecture guard, MongoDB 7 with auth bootstrap (temporarily disabling auth via `sed`, creating user + DB, re-enabling), Node 20, yt-dlp + Deno, PM2, nginx reverse proxy, certbot with renewal timer, firewall, `.env` generation with a random password, and a generated `redeploy.sh`.

`deploy/redeploy.sh` is equally careful: stash-on-dirty, `git pull --ff-only` with `reset --hard` fallback, npm-10-on-ARM64 downgrade to npm 9 (a real bug fix), `npm install` only when `package.json` hash changes, PM2 restart + save, step-by-step status summary.

`deploy/ORACLE-DEPLOY.md` (Urdu/English) documents a 3-VM topology sharing one MongoDB. Two issues:
* **The architecture contradicts the guide's own warning.** The doc says port 27017 should not be public, then instructs `bindIp: 127.0.0.1,0.0.0.0` so VM2/VM3 can reach it — with no firewall rule restricting 27017 to the private subnet. Follow the guide literally and MongoDB is exposed on the public IP.
* **The guide's "no input needed" claim is false for VM2/VM3** — you must copy the URI and edit `.env` by hand.

PM2 config is sane: `kill_timeout 15000`, `max_memory_restart 1500M`, `--experimental-vm-modules`.

---

## 11. Repository hygiene

| Finding | Detail |
|---|---|
| Nested app dir | Root `package.json` + lockfile are legacy; all real work happens in `AA-MD-Bot/` |
| Lockfile contradiction | `.gitignore` says `package-lock.json` must not be committed ("Replit-internal proxy URLs"), yet **both** lockfiles are tracked |
| Bloated asset | `AA-MD-Bot/logo.jpeg` is **2.0 MB** (a logo); `banner.jpeg` 105 KB + `banner.webp` 50 KB are duplicates of each other |
| Stale memory index | `.agents/memory/MEMORY.md` links to two files that don't exist (`mongodb-auth-state.md`, `mongodb-database.md`); the real files are `firebase-auth-state.md` and `firebase-database.md` |
| Log dump in repo | `attached_assets/` contains a pasted PM2 log (repeated `Bad MAC` decryption errors) — should be a gist, not tracked content |
| Docs vs reality | `dashboard.html` claims "Privacy & Security — Your Data is 100% Safe" and "200+ Commands"; reality is ~269 commands, MongoDB-stored settings, and an open HTTP API |
| Dashboard dead-end | `dashboard.html` is static with **no JS**; its only action links to `https://aa-md-bot.vercel.app/`. The local `/api`, `/events`, `/pairing-code` endpoints have no local UI |
| Dev artifacts | `scripts/probe_dc.mjs` and `scripts/scrape_dc_endpoints.mjs` are one-off API-discovery scripts kept in-tree |

---

## 12. Prioritized fix list

**P0 — do first (security)**
1. Add bearer-token auth + origin allowlist + rate limiting to `/session/create`, `DELETE /session/:id`, `/events`, `/pairing-code`, `/qr-image`; wire them to the already-generated `SESSION_SECRET`.
2. Rotate and remove the hardcoded Tenor/Google key in `plugins/search/stickersearch.js`.
3. Move owner numbers, super-owner, Telegram owner ID, and the Atlas host/user out of source into `.env`.

**P1 — silent functional failures**
4. Inject `isAdmin` (and `isBotAdmin`) into the command context; enforce `botAdminOnly`.
5. Make the prefix single-sourced: parse from `db.settings.prefix` (array) with `config.prefix` only as the default, and stop storing/reading it in two shapes.
6. Add writers/commands for `voKeyword` and `statusEmoji`, or delete the dead branches.
7. Remove the 6 phantom menu entries; make `menu.js` caps derive from the actual file counts (and drop `islamic: 0`).

**P2 — correctness & structure**
8. De-duplicate colliding commands/aliases; make `pluginLoader` **warn on collision** instead of silently overwriting.
9. Convert all ffmpeg shell strings to `execFile` with argument arrays.
10. Normalize bad-word storage on `badWordsList` and migrate existing `badWords`.
11. Consolidate the two Telegram modules; reuse WhatsApp plugin logic instead of duplicating 2,000 lines.
12. Extract shared `lib/ui.js` (footer), `lib/media.js` (quoted-media buffer), `lib/temp.js` (temp paths) — removes thousands of duplicated lines.

**P3 — hygiene**
13. Drop the root `package.json`/lockfile or make the root the real app; resolve the lockfile-ignore contradiction.
14. Compress `logo.jpeg` (2 MB → <100 KB) and delete the redundant banner pair.
15. Fix the two broken `.agents/memory/MEMORY.md` links; move `attached_assets/` log out of the repo.
16. Add ESLint + `// @ts-check` on `lib/` + a smoke test that boots the plugin loader and asserts zero collisions.
17. Fix the Oracle guide's MongoDB network exposure (firewall rule scoped to the VCN subnet).

---

## 13. How this review was performed (and its limits)

* **Read in full:** `index.js`, `config.js`, `ecosystem.config.cjs`, all of `lib/` (every module, including the full 743-line `antiViewOnce.js`, 951-line `sessionManager.js`, 525-line `telegramAdmin.js`, and 2,198-line `telegramFeatures.js` including its final handlers), all 26 `plugins/admin/*`, all 16 `plugins/group/*`, all 16 `plugins/gb/*`, `plugins/download/{youtube,downloader,instagram,pinterest,twitter,threads,soundcloud,spotify,tiktok,capcut,apk,moviesdl,ringtone,ydesc,tts}`, `plugins/utility/*`, `plugins/owner/*`, `plugins/tools/*`, `plugins/islamic/*`, ~20 `plugins/search/*` in body + the 11 shims, and all 42 `plugins/media/*` + 31 `plugins/fun/*` via full signature sweeps plus body reads of the complex ones (`fakechat`, `aivideo`, `aiedit`, `attp`, `logo`, `rembg`, `remini`, `ocr`, `jail`, `gf`, `bf`, `waifu`, `xvideos`, `ppcouple`).
* **Read structurally (signatures, aliases, API hosts, flags, error paths):** remaining `plugins/search/*` and simple card/game plugins.
* **Read fully:** `deploy/setup.sh`, `deploy/redeploy.sh`, `deploy/ORACLE-DEPLOY.md`, `scripts/*.mjs`, `.agents/memory/*` (18 notes), `replit.md`, `.replit`, `.env.example`, `.gitignore`, `.npmrc`, `dashboard.html`.
* **Executed checks:** `node --check` on all 346 JS/ESM/CJS files (0 errors); a multi-line-aware import/export resolver (0 unresolved, 0 missing bindings); an npm-dependency census (0 undeclared); a command/alias collision census; a settings-key read/write census (3,000+ reads — found 4 read-only keys); a menu-vs-commands cross-check; shell-injection greps; secret greps; per-category LOC/byte census.
* **Not executed:** the bot was never started (no WhatsApp pairing, no MongoDB, no network egress to the 158 third-party APIs), so runtime behaviour is inferred from code paths, not observed. Rate limits, quota behaviour, and the *current* liveness of third-party endpoints were not verified — several may already be dead, which is exactly why the fallback chains matter.

---

## 14. Fix log — what was actually changed (2026-10-21)

Everything below is applied and verified on `arena/cbf31bf9-aa-md-bot`.
Final state: `node --check` on 356 JS files → **0 errors**; import/export
resolver → **0 unresolved**; command/alias collisions → **0** (was 50);
`node scripts/smoke-test.mjs` → **pass**.

### Security

| # | Change | Files |
|---|---|---|
| S1 | New auth module: bearer header / `?token=` / `X-API-Token`, SHA-256 + `timingSafeEqual` comparison, `SESSION_SECRET` with a logged ephemeral fallback | `lib/apiAuth.js` (new) |
| S2 | `Access-Control-Allow-Origin: *` → origin allowlist (`localhost:5000`, the Vercel app, plus `DASHBOARD_ORIGINS`) | `index.js`, `lib/apiAuth.js` |
| S3 | Auth required on `/events`, `/qr-image`, `/pairing-code`, `/stats`, `POST /session/create`, `DELETE /session/:id` | `index.js` |
| S4 | Per-IP fixed-window rate limits: create 5/5 min, delete 10/min, events 30/min, QR 60/min, status 120/min | `index.js`, `lib/apiAuth.js` |
| S5 | Hardcoded Tenor/Google API key removed — env only, with an in-chat setup hint | `plugins/search/stickersearch.js` |
| S6 | Owner numbers, super owner, channel link, newsletter JID, Telegram owner id, Atlas user/host moved to env with the old values as bootstrap defaults | `config.js`, `lib/telegramAdmin.js`, `lib/database.js`, `.env.example` |

### Confirmed bugs

| # | Change |
|---|---|
| B1 | **`.setprefix` now works.** `helper.getPrefixes()` reads `db.settings.prefix` (array *or* string, longest-first), falls back to `config.prefix`; `commandHandler`, `menu`, `settings_menu`, `support`, `islamic_menu`, `antiViewOnce`, `sessionManager` and `gb/chatbot` all use it. `.setprefix` validates the arg, rejects letters/numbers/spaces, persists with `saveNow`, and supports `.setprefix reset`. |
| B2 | **View-once keyword is reachable**: `.voword <word>` / `.voword off` writes `voKeyword`; `.voreply <text>` writes the previously write-less `voAutoReply`. |
| B3 | **Status emoji is writable**: `.statusreact 🔥` sets `statusEmoji`; `.statusreact on/off` unchanged. |
| B4 | **`isAdmin` / `isBotAdmin` injected** into every plugin context, computed from the existing 90 s group-metadata cache; `adminOnly` now uses it instead of recomputing. |
| B5 | **`botAdminOnly` is enforced** — `group/disap.js` now refuses with "promote me first" when the bot is not a group admin. |
| B6 | Dead menu entries fixed: `gbmenu` `autostatusseen` → `statusview`; `settings_menu` `ban`/`unban`/`block` → `banuser`/`botban`/`broadcast`. |
| B7 | Bad words unified on the canonical `badWordsList` (legacy `badWords` read *and* migrated on write), added `.antibadwords reset`, and **escaped the regex** — a custom word like `c++` used to throw and kill the check. |
| B9 | `Telegram /disconnect` no longer has an unreachable `tg_` branch. |
| B10/B11 | `Telegram /broadcast` now actually sends to every connected session and reports real sent/failed counts (previously it emitted an event nobody listened to and reported success). `index.js` passes the live socket map. |

### Structure & safety

| Change | Detail |
|---|---|
| **Alias de-duplication** | 50 collisions → **0**. 10 redundant plugin files deleted (`utility/{base64,hash,password,tempmail,calc}`, `search/dictionary`, `fun/ship`, `group/getpp`, `admin/{lock,unlock}`); their unique aliases were merged into the keepers (`pass`→`tools/password`, `tmail`→`tools/tempmail`, `math`/`calculate`→`mathtools`, `close`/`lockgroup`→`mute`, `open`/`unlockgroup`→`unmute`, `spp`/`profile`→`pp`). |
| **Alias conflicts** | Each token now has exactly one owner; the loser keeps its own command. `catbox` became its own command instead of a `tourl` clone. |
| **Loader collision reporting** | `pluginLoader` tracks file provenance, warns per collision, exposes `collisions`, loads files in sorted order. |
| **No more shell-built ffmpeg** | New `lib/ffmpeg.js` (`runFfmpeg(args)`) and 12 call sites converted from `exec("<string>")` to `execFile('ffmpeg', [...])` — no shell, no quoting, `maxBuffer` raised. |
| **Smoke test** | `scripts/smoke-test.mjs` — runs without `node_modules`; fails on duplicate commands, duplicate aliases, alias-shadows-command, missing `execute()`, broken re-export shims. |

### Hygiene

- Both `package-lock.json` files untracked (`.gitignore` already said they must not be committed).
- `logo.jpeg` (2.0 MB, unused — dashboard uses `logo.webp`) removed.
- `.agents/memory/MEMORY.md` broken links fixed by writing the two missing notes: `mongodb-database.md`, `mongodb-auth-state.md`.
- `deploy/ORACLE-DEPLOY.md` now tells you to firewall 27017 to the VCN CIDR *before* changing `bindIp`, instead of exposing MongoDB to `0.0.0.0`.

### Behaviour changes you will notice

1. **The dashboard API now needs a token.** `?token=$SESSION_SECRET` for `EventSource`/`<img>`, or `Authorization: Bearer $SESSION_SECRET` for `fetch`. `/`, `/api`, `/healthz` and `/status` stay public. If `SESSION_SECRET` is unset, the token is printed once at boot.
2. `.catbox` is a real command now; `.tourl` still uploads to uguu.
3. `.antiflood` no longer doubles as an alias for `.antifake`.
4. Both menus and `.settings` show the *live* prefix.
5. `.instagram` / `.pinterest` / `.twitter` / `.ytinfo` now resolve to the downloaders; profile lookups are `.igstalk` / `.pinstalk` / `.twstalk` / `.ytstalk`.
6. `.log` is the logarithm helper in `.calc`; bot logs are `.logs` / `.viewlogs`.
7. `.islamicmenu` is the dynamic menu; the static duas/zikr/hadith index is `.duas` / `.dmenu`.

### Still open (not fixed, by design or by scope)

- Mixed `console.*` (25 in `lib/`, 44 in `plugins/`) alongside pino — left alone because replacing them changes log output formats.
- The two Telegram modules are still separate (`telegramAdmin` + `telegramFeatures`, ~2,700 lines with heavy overlap with WhatsApp plugins). Merging them is a design change, not a bug fix.
- `isSudo` is still an alias of `isOwner` in the command context.
- `gb/schedule.js` still keeps timers in memory only (lost on restart).
- No automated tests beyond the static smoke test; third-party endpoint liveness still unverified (the bot was never run — no MongoDB, no WhatsApp pairing in this environment).
