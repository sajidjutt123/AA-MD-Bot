# AA MD Bot

<p align="center">
  <img src="banner.webp" alt="AA MD Bot" width="600"/>
</p>

<p align="center">
  <b>Multi-Device WhatsApp Bot — 226+ Plugins | Multi-Session | Oracle Cloud</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-WhatsApp-25D366?logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/DB-Supabase-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/DB-MongoDB-47A248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Deploy-Oracle_Cloud_Free-F80000?logo=oracle&logoColor=white" />
</p>

---

## ⚡ Deploy — Sirf Ek Command

Oracle Cloud VM par SSH ke baad:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ahsanaliwadani/AA-MD-Bot/main/deploy/setup.sh)
```

**Koi input nahi — sab apne aap hota hai:**

| Step | Kya hota hai |
|---|---|
| MongoDB 7 | Same VM par install + start |
| DB User | `aa_bot_user` auto-create, random password |
| Node.js 20 | Install |
| yt-dlp + Deno | Install |
| PM2 | Install + auto-restart on reboot |
| Repo | Clone + `npm install` |
| `.env` | `MONGODB_URI` + `SESSION_SECRET` auto-write |
| Firewall | SSH + port 5000 open |
| Bot | Start |

Script khatam hone par:
```
✅  Deploy Complete!
Dashboard  : http://YOUR_IP:5000
MongoDB URI: mongodb://aa_bot_user:xxxxx@127.0.0.1:27017/aa_md_bot
```

---

## 🌐 WhatsApp Pair Karna

1. Browser mein kholo: `http://YOUR_VM_IP:5000`
2. WhatsApp number enter karo (country code ke saath, e.g. `923316041183`)
3. **Get Pairing Code** click karo
4. WhatsApp → **Settings → Linked Devices → Link a Device → Link with phone number**
5. 8-digit code enter karo — ho gaya ✅

---

## 🖥 Dashboard (control panel)

The bot serves a full web panel from `dashboard/` — same files run on Vercel.

```
http://YOUR_IP:5000/          # panel, served by the bot
http://YOUR_IP:5000/?demo=1   # UI preview with sample data, no bot needed
```

| View | What it does |
|---|---|
| **Overview** | Live status, uptime, sessions, command count, RAM, storage health, live event log |
| **Sessions** | Every WhatsApp session with status + disconnect button |
| **Connect** | Start a session, QR (auto-refreshing) or pairing code, copy code |
| **Commands** | All commands with category chips, search by name/alias/description, flags |
| **Settings** | API base + token, backend info, connection diagnostics |

It talks to the same token-guarded API you would `curl` (`/stats`, `/commands`,
`/events`, `/session/create`, …), so the panel never needs shell access to the bot.

**Login:** token = `SESSION_SECRET` from `.env`. If `SESSION_SECRET` is missing or
shorter than 16 characters, the bot prints an ephemeral token at boot.

**Deploy the panel to Vercel:** root directory `AA-MD-Bot/dashboard`, no build step —
then enter the bot's URL and token on the login screen. Full walkthrough (Supabase +
always-on bot + Vercel): [`deploy/SUPABASE-VERCEL.md`](deploy/SUPABASE-VERCEL.md).

---

## ☁️ 24/7 Uptime — Supabase + Vercel

Vercel is serverless: it cannot hold the WhatsApp WebSocket, so **run the bot on an
always-on host and put the dashboard on Vercel**:

```
Vercel (dashboard, static) ──HTTPS + token──▶ Bot process (PM2 / Railway / Fly / VM)
                                                   │
                                                   ▼
                                          Supabase Postgres
                                    (settings + WhatsApp auth keys)
```

1. **Supabase** — run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor,
   copy the *Session pooler* connection string into `SUPABASE_DB_URL`.
2. **Bot** — start it on the VM (`deploy/setup.sh`) or any always-on host; pair once.
   Session keys land in Supabase, so restarts never re-ask for a QR.
3. **Dashboard** — deploy `dashboard/` to Vercel, add that domain to
   `DASHBOARD_ORIGINS` on the bot, log in with `SESSION_SECRET`.

Without `SUPABASE_DB_URL` the bot still runs, but falls back to MongoDB, and then to
in-memory storage (data lost on restart) — the panel warns you when that happens.

**Full guide:** [`deploy/SUPABASE-VERCEL.md`](deploy/SUPABASE-VERCEL.md)

---

## 🏗 3 VM Architecture (Oracle Always Free)

```
VM1 (2 OCPU, 12 GB) — Bot + MongoDB server
VM2 (1 OCPU,  6 GB) — Bot  ──┐
VM3 (1 OCPU,  6 GB) — Bot  ──┴── VM1 ke MongoDB se connect
```

VM1 par setup ke baad VM2/VM3 par bhi same command chalao — sirf `.env` mein `MONGODB_URI` ka IP change karo VM1 ka private IP daal kar.

**Full 3-VM guide:** [`deploy/ORACLE-DEPLOY.md`](deploy/ORACLE-DEPLOY.md)

---

## ✨ Features

| Category | Plugins |
|---|---|
| 📥 Downloads | YouTube, Instagram, TikTok, Twitter, Spotify, Reddit, Pinterest, Threads |
| 🔍 Search | Google, YouTube, Wikipedia, News, Anime, Lyrics, Stickers |
| 🎵 Media | Audio convert, video convert, compress, watermark, sticker maker |
| 👥 Groups | Anti-spam, anti-call, anti-delete, welcome/goodbye, poll, tagall |
| 🛠 Tools | Calculator, currency, weather, OCR, AI chat, translator |
| 🕌 Islamic | Prayer times, Quran, Hadith, Dua, Hijri calendar |
| ⚙️ Admin | Ban, mute, kick, promote, broadcast, session manage |
| 🤖 Telegram | Mirror bot — download & search commands via Telegram |

---

## ⚙️ Optional Settings

Deploy ke baad Telegram tokens ya API keys add karne hon to:

```bash
nano /home/ubuntu/AA-MD-Bot-repo/AA-MD-Bot/.env
# uncomment karo jo chahiye
pm2 restart aa-md-bot
```

| Variable | Kya karta hai |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Admin/pairing Telegram bot |
| `TELEGRAM_FEATURES_BOT_TOKEN` | Features mirror bot |
| `OPENWEATHER_API_KEY` | `.weather` command |
| `OMDB_API_KEY` | `.movie` command |
| `OCR_SPACE_KEY` | `.ocr` command |
| `HF_TOKEN` | AI commands |

---

## 🔧 PM2 Commands

```bash
pm2 status                    # bot status
pm2 logs aa-md-bot            # live logs
pm2 logs aa-md-bot --err      # sirf errors
pm2 restart aa-md-bot         # restart
pm2 monit                     # CPU/RAM monitor
```

## 🔄 Update Karna

```bash
cd /home/ubuntu/AA-MD-Bot-repo
git pull
cd AA-MD-Bot
npm install --omit=dev
pm2 restart aa-md-bot
```

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard nahi khulta | `pm2 logs aa-md-bot --err` |
| "not persistent" warning | `.env` mein `SUPABASE_DB_URL` ya `MONGODB_URI` set karo |
| Dashboard: invalid token | Token = `SESSION_SECRET` (logs mein ephemeral token bhi milta hai) |
| `MongoDB connection failed` | `sudo systemctl restart mongod` |
| Port 5000 reachable nahi | Oracle Console → VCN → Security List → port 5000 add karo |
| YouTube bot-check error | `cookies.txt` file banao — `cookies.txt.example` dekho |
| Bot disconnect hota hai | Normal — PM2 auto-reconnect karta hai |

---

## Stack

[Baileys](https://github.com/WhiskeySockets/Baileys) · [Supabase](https://supabase.com/) · [MongoDB](https://www.mongodb.com/) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [ffmpeg](https://ffmpeg.org/) · [PM2](https://pm2.keymetrics.io/)

**Developer:** Ahsan Ali Wadani — AA Mods
