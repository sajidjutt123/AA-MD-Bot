# 24/7 Deployment — Supabase + Vercel dashboard + always-on bot

This is the recommended production layout for AA MD Bot.

```
┌──────────────────────────┐        HTTPS + Bearer token        ┌────────────────────────┐
│  Dashboard (static)      │ ─────────────────────────────────▶ │  Bot process (24/7)    │
│  Vercel / any CDN        │ ◀─────  /stats  /commands  ─────── │  Node.js + Baileys     │
│  dashboard/              │ ◀─────  SSE /events (live QR) ──── │  PM2 / systemd / Docker│
└──────────────────────────┘                                    └───────────┬────────────┘
                                                                             │ pg (SQL)
                                                                             ▼
                                                                 ┌────────────────────────┐
                                                                 │  Supabase (Postgres)   │
                                                                 │  bot_state             │
                                                                 │  whatsapp_auth_creds   │
                                                                 │  whatsapp_auth_keys    │
                                                                 └────────────────────────┘
```

## ⚠️ Read this first: Vercel cannot host the bot itself

Vercel runs **serverless functions**: short-lived, request-triggered, no persistent
disk, no long-lived outbound WebSocket, ~10 s default timeout (60 s max on Pro).

A WhatsApp connection needs the opposite: a **process that stays alive indefinitely**,
keeping a WebSocket open and holding the Baileys signal keys in memory. Deployed on
Vercel it would:

* drop the socket every time the function freezes,
* re-run the pairing handshake from a cold start (WhatsApp invalidates the old
  device, so you would re-scan the QR in a loop),
* lose `/events` SSE streams after the timeout,
* have no `ffmpeg`/`yt-dlp` binaries for media commands.

**So the split is:**

| Piece | Where | Why |
|---|---|---|
| WhatsApp bot process | Always-on host (Oracle VM, Railway, Fly.io, VPS, home server) | Needs a permanent socket + local binaries |
| Database | **Supabase** | Managed Postgres, free tier, survives restarts and redeploys |
| Dashboard UI | **Vercel** (or the bot itself) | Pure static files, talks to the bot's HTTP API |

You can also skip Vercel entirely: the bot serves the same dashboard at
`http://your-bot:5000/`. Vercel is only useful for a nicer URL, a private domain,
or keeping the panel reachable while the bot is restarting.

---

## Step 1 — Supabase (5 minutes)

1. Create a project at <https://supabase.com> (free tier is enough).
2. Open **SQL Editor** → paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
   That creates the three tables, the index, and enables RLS with **no policies**
   (only the service connection string can read or write — the public anon key cannot).
3. Copy the connection string: **Project Settings → Database → Connection string →
   Session pooler**. It looks like:

   ```
   postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

   Use **Session pooler**, not the direct `db.<ref>.supabase.co` host — direct
   connections are IPv6-only on newer projects and fail on most VPS/free hosts.

4. Put it in `.env` on the bot host:

   ```bash
   SUPABASE_DB_URL=postgresql://postgres.abcdefgh:...pooler.supabase.com:5432/postgres
   SUPABASE_POOL_MAX=5          # optional, default 5
   ```

Nothing else changes: `lib/database.js` picks Postgres when `SUPABASE_DB_URL` is set,
falls back to `MONGODB_URI`, and finally to in-memory storage. The dashboard shows
which one is live (**Overview → Storage**).

### What gets stored

| Table | Contents |
|---|---|
| `bot_state` | Every settings collection (antilink, welcome, autoread, …) as JSONB |
| `whatsapp_auth_creds` | Baileys `creds.json` per session |
| `whatsapp_auth_keys` | Signal keys per session, sharded by key type |

Because the session keys live in Supabase, **you scan the QR once**. Restarting the
bot, redeploying it, or moving it to another host reconnects without re-pairing.

> Backend is optional at runtime: if the connection fails the bot logs a clear error
> and keeps running on in-memory storage instead of crashing. `/healthz` and the
> dashboard both report `"ok": false` with the reason, so you always know.

---

## Step 2 — the bot on an always-on host

### Option A — Oracle Cloud Always Free VM (the `deploy/setup.sh` path)

```bash
ssh ubuntu@<vm-ip>
bash <(curl -fsSL https://raw.githubusercontent.com/ahsanaliwadani/AA-MD-Bot/main/deploy/setup.sh)
```

Then add `SUPABASE_DB_URL` to `~/.aa-md-bot/.env` (or the repo `.env`) and restart:

```bash
pm2 restart aa-md-bot && pm2 save
```

PM2 already restarts the bot on crash and on reboot. See [`ORACLE-DEPLOY.md`](./ORACLE-DEPLOY.md).

### Option B — Railway / Render / Fly.io / any VPS

```bash
git clone https://github.com/ahsanaliwadani/AA-MD-Bot && cd AA-MD-Bot/AA-MD-Bot
npm install                      # installs pg, baileys, ffmpeg-static, …
cp .env.example .env && nano .env  # SUPABASE_DB_URL + SESSION_SECRET + OWNER_NUMBER
npm start
```

Keep it alive with whatever the platform offers (`restart: always`, systemd unit,
`pm2 start index.js --name aa-md-bot`). The process exposes `PORT` (default 5000) —
that is the API the dashboard talks to.

**Check it:**

```bash
curl https://your-bot-host/healthz
# {"status":"ok", ..., "storage":{"backend":"postgres","ok":true,"latencyMs":12,...}}
```

### Exposing the bot to the internet

The dashboard is a browser app, so the bot's HTTP API must be reachable over HTTPS:

* **VPS/Oracle** — put Nginx or Caddy in front of port 5000, or open the port and use
  `http://<ip>:5000` (browsers will warn about mixed content if the dashboard is on
  Vercel/HTTPS — use HTTPS).
* **Fly.io** — `fly launch` exposes the port automatically.
* **Railway/Render** — set the public port to your `PORT`, then copy the generated
  domain into the dashboard's *API base* field.

---

## Step 3 — the dashboard on Vercel

The dashboard is plain static files — no build step, no framework.

1. In Vercel: **Add New → Project → import the repo**.
2. **Root Directory:** `AA-MD-Bot/dashboard`
   **Framework Preset:** Other
   **Build Command:** *(empty)*
   **Output Directory:** `.` (or leave empty — the folder is already static)
3. Deploy, then open the URL. You will see the login screen:
   * **API base** — `https://your-bot-host` (blank = same origin, used when the bot
     serves the panel itself)
   * **Token** — the `SESSION_SECRET` from the bot's `.env`
4. Both values are saved in `localStorage`, so you log in once per browser.

Optional: bake the values in before deploying by editing
[`dashboard/config.js`](../dashboard/config.js) →

```js
window.AA_CONFIG = {
  apiBase: 'https://your-bot-host',
  token: '',            // leave empty; type it on the login screen
  allowAnonymous: false,
};
```

### Allow the Vercel origin on the bot (CORS)

The API only answers cross-origin calls from allowed origins. Add your Vercel domain
on the **bot** host and restart:

```bash
DASHBOARD_ORIGINS=https://aa-md-bot.vercel.app,https://aa-md-bot-git-main-you.vercel.app
```

`localhost:5000` and `https://aa-md-bot.vercel.app` are allowed by default; anything
else must be listed. Preview deployments get a new URL each time — either add the
preview domain or test against production.

---

## Step 4 — pair WhatsApp (once)

1. Open the dashboard → **Connect**.
2. Session id `default` (or your own) → **Start session**.
3. Choose **QR** (scan with WhatsApp → Linked devices) or **Pairing code**
   (enter your phone number, then type the 8-digit code on the phone).
4. The QR refreshes live over SSE (`/events`), so the panel does not need a reload.
5. Once it says **connected**, the creds are already in Supabase — every future
   restart reconnects silently.

---

## Keeping it up 24/7 — checklist

- [ ] `SESSION_SECRET` is a long random string (≥ 16 chars) and identical on every
      restart — otherwise the dashboard token changes on each boot.
- [ ] `SUPABASE_DB_URL` set, `/healthz` shows `"backend":"postgres","ok":true`.
- [ ] Process manager with auto-restart (`pm2 save` / `restart: always` / systemd).
- [ ] Host reboots are handled: `pm2 startup` or a systemd `WantedBy=multi-user.target`.
- [ ] Disk hygiene: `downloads/`, `temp/`, `logs/` grow with media commands —
      a weekly `pm2 flush` + `find temp -mtime +1 -delete` keeps the VM healthy.
- [ ] Uptime monitor (UptimeRobot / Better Stack) on `https://your-bot-host/healthz`.
- [ ] WhatsApp stays linked: don't log out from the phone, and keep the phone's
      WhatsApp updated. If it unlinks, the dashboard shows `disconnected` — start a
      new session from **Connect**.
- [ ] One bot instance per session id. Running two processes with the same Supabase
      rows will fight over the same device and disconnect each other.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Dashboard shows **not persistent** | No `SUPABASE_DB_URL`/`MONGODB_URI` — the bot is in memory mode |
| Storage chip shows **error** + `ENOTFOUND` | Wrong host in `SUPABASE_DB_URL`, or you used the direct (IPv6) host instead of the session pooler |
| `password authentication failed` | Password not URL-encoded (`@` → `%40`), or you used the anon key instead of the DB password |
| `run: npm install pg` in the log | `pg` was removed from `node_modules` — run `npm install` on the bot host |
| Dashboard says **Invalid or missing API token** | Token ≠ `SESSION_SECRET`; if the secret is missing/short the bot prints an ephemeral token at boot |
| CORS error in the browser console | Add the dashboard origin to `DASHBOARD_ORIGINS` and restart the bot |
| QR appears in the dashboard but the phone says "couldn't link" | Old QR — it rotates every ~20 s; scan the current one, or use the pairing code |
| SSE panel shows `reconnecting…` | Reverse proxy buffering: disable buffering for `/events` (Nginx: `proxy_buffering off;`) or just rely on the 10 s `/stats` poll |
| Bot restarts and asks for QR again | Supabase not configured, or `whatsapp_auth_*` rows can't be written (RLS/service role) |

---

## What is where

| File | Purpose |
|---|---|
| `supabase/schema.sql` | Tables + RLS to run once in the Supabase SQL editor |
| `lib/postgresStore.js` | Postgres/Supabase driver (pool, collections, auth creds/keys, health) |
| `lib/database.js` | Backend dispatch: Supabase → MongoDB → memory |
| `lib/mongoAuthState.js` | Baileys auth state persisted to Supabase or Mongo |
| `dashboard/` | Static control panel (deploy this folder to Vercel) |
| `index.js` | HTTP API the dashboard consumes |
