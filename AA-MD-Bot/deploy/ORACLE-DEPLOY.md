# 🚀 AA MD Bot — Oracle Cloud Free Tier Deploy Guide

> **Total cost: $0** — Oracle Always Free limits ke andar

---

## Architecture

```
Oracle Cloud Free Tier (Always Free)
│
├── VM1 — Bot + MongoDB  (ARM, 2 OCPU, 12 GB RAM)   ← sab kuch ek VM par
├── VM2 — Bot            (ARM, 1 OCPU, 6 GB RAM)    ← VM1 ke MongoDB se connect
└── VM3 — Bot            (ARM, 1 OCPU, 6 GB RAM)    ← VM1 ke MongoDB se connect
```

**Strategy:**
- **VM1** par MongoDB install hoga — woh shared database server hai
- **VM2 aur VM3** same MongoDB se connect karte hain (private IP se)
- Sab bots ka data share hota hai (groups, settings, sessions)

**Oracle Always Free resources:**

| Resource | Free Limit | Used |
|---|---|---|
| ARM OCPUs | 4 total | 4 (2 VM1 + 1 VM2 + 1 VM3) |
| ARM RAM | 24 GB total | 24 GB (12+6+6) |
| Block Storage | 200 GB | ~15 GB |

---

## ⚡ Ek Command — Poora Deploy

### VM1 (MongoDB + Bot)

SSH ke baad sirf yeh ek command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ahsanaliwadani/AA-MD-Bot/main/deploy/setup.sh)
```

**Yeh script apne aap karta hai:**
- ✅ System update
- ✅ ffmpeg, git, curl install
- ✅ MongoDB 7 install, start, auth enable
- ✅ MongoDB user + database auto-create (random password)
- ✅ Node.js 20 install
- ✅ yt-dlp + Deno install
- ✅ PM2 install
- ✅ Bot code clone
- ✅ npm install
- ✅ `.env` auto-write (MONGODB_URI + SESSION_SECRET sab auto)
- ✅ Firewall set
- ✅ Bot start + auto-restart on reboot

**Koi bhi input nahi dena — sab apne aap hota hai.**

Script khatam hone par yeh dikhai dega:
```
✅  Deploy Complete!
Dashboard  : http://YOUR_IP:5000
MongoDB URI: mongodb://aa_bot_user:xxxxx@127.0.0.1:27017/aa_md_bot
```

---

### VM2 aur VM3 (Sirf Bot — VM1 ka MongoDB use karte hain)

VM1 ka setup complete hone ke baad VM2/VM3 par:

**Step 1 — VM1 par MongoDB ko network access do (sirf private subnet):**

> ⚠️ **`0.0.0.0` ka matlab public internet bhi ho sakta hai.** Port 27017 ko
> Oracle Security List mein *kabhi* `0.0.0.0/0` se open mat karo. Neeche diya
> firewall rule MongoDB ko sirf VCN ke private range tak seemit karta hai —
> ise **pehle** chalao, phir bindIp badlo.

```bash
# VM1 par chalao — pehle host firewall, sirf private subnet ko allow:
# (apna VCN CIDR daalo, default Oracle VCN = 10.0.0.0/16)
VCN_CIDR=10.0.0.0/16
sudo iptables -I INPUT 1 -p tcp --dport 27017 -s "$VCN_CIDR" -j ACCEPT
sudo iptables -I INPUT 2 -p tcp --dport 27017 -j DROP
sudo netfilter-persistent save

# phir bindIp update karo:
sudo sed -i 's/bindIp: 127.0.0.1/bindIp: 127.0.0.1,0.0.0.0/' /etc/mongod.conf
sudo systemctl restart mongod

# verify: bahar se 27017 band hona chahiye
# (kisi doosre machine se) nc -vz VM1_PUBLIC_IP 27017   → timeout/refused
```

MongoDB user ke paas password-auth pehle se hai (`setup.sh` set karta hai), lekin
network-level block hi asli suraksha hai — MongoDB ka auth alone internet par
expose karne ke liye kaafi nahi hai.

**Step 2 — VM1 ki `.env` se MONGODB_URI copy karo:**
```bash
# VM1 par chalao:
grep MONGODB_URI /home/ubuntu/AA-MD-Bot-repo/AA-MD-Bot/.env
```

URI mein `127.0.0.1` ko VM1 ka **private IP** se replace karo:
```
mongodb://aa_bot_user:PASSWORD@10.0.0.X:27017/aa_md_bot?authSource=aa_md_bot
```

**Step 3 — VM2/VM3 par setup chalao:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ahsanaliwadani/AA-MD-Bot/main/deploy/setup.sh)
```

Setup ke baad VM1 ka MongoDB URI set karo:
```bash
nano /home/ubuntu/AA-MD-Bot-repo/AA-MD-Bot/.env
# MONGODB_URI=mongodb://aa_bot_user:PASSWORD@10.0.0.X:27017/aa_md_bot?authSource=aa_md_bot
pm2 restart aa-md-bot
```

---

## Oracle Cloud VMs Banana

### Step 1 — Sign Up
[cloud.oracle.com](https://cloud.oracle.com) → Free Tier account banao

### Step 2 — VCN (Network)
Console → **Networking → Virtual Cloud Networks**
→ **Start VCN Wizard** → Create VCN with Internet Connectivity
→ Name: `aa-bot-vcn` → Create

### Step 3 — Ports Open Karo
VCN → **Security Lists → Default Security List → Add Ingress Rules:**

| Source CIDR | Protocol | Port | Use |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `22` | SSH |
| `0.0.0.0/0` | TCP | `5000` | Bot Dashboard |

> Port 27017 (MongoDB) public nahi kholna — VMs private IP se connect karte hain

### Step 4 — VMs Banao

**Compute → Instances → Create Instance** (3 baar):

| Field | VM1 | VM2 | VM3 |
|---|---|---|---|
| Name | `aa-bot-server-1` | `aa-bot-server-2` | `aa-bot-server-3` |
| Image | Ubuntu 22.04 | Ubuntu 22.04 | Ubuntu 22.04 |
| Shape | VM.Standard.A1.Flex | VM.Standard.A1.Flex | VM.Standard.A1.Flex |
| OCPU | **2** | **1** | **1** |
| RAM | **12 GB** | **6 GB** | **6 GB** |
| SSH Key | Generate → Save |

> VM1 ko zyada resources do — woh MongoDB bhi chala raha hai

### Step 5 — SSH Connect
```bash
# Mac/Linux
chmod 400 aa-bot-server-1.key
ssh -i aa-bot-server-1.key ubuntu@VM1_PUBLIC_IP
```

```powershell
# Windows PowerShell
icacls "aa-bot-server-1.key" /inheritance:r /grant:r "$env:USERNAME:(R)"
ssh -i aa-bot-server-1.key ubuntu@VM1_PUBLIC_IP
```

---

## WhatsApp Pair Karna

VM setup ke baad browser mein:
- VM1: `http://VM1_PUBLIC_IP:5000`
- VM2: `http://VM2_PUBLIC_IP:5000`
- VM3: `http://VM3_PUBLIC_IP:5000`

Har VM par:
1. WhatsApp number enter karo (country code ke saath, e.g. `923316041183`)
2. **Get Pairing Code** click karo
3. WhatsApp: **Settings → Linked Devices → Link a Device → Link with phone number**
4. 8-digit code enter karo

---

## Useful Commands

```bash
# Bot
pm2 status                        # status dekho
pm2 logs aa-md-bot                # live logs
pm2 logs aa-md-bot --err          # sirf errors
pm2 restart aa-md-bot             # restart
pm2 stop aa-md-bot                # stop

# Update (naya code deploy)
cd /home/ubuntu/AA-MD-Bot-repo
git pull
cd AA-MD-Bot
npm install --omit=dev
pm2 restart aa-md-bot

# MongoDB
sudo systemctl status mongod      # MongoDB status
sudo systemctl restart mongod     # MongoDB restart
mongosh -u aa_bot_user -p --authenticationDatabase aa_md_bot   # DB console

# Config edit (Telegram tokens etc.)
nano /home/ubuntu/AA-MD-Bot-repo/AA-MD-Bot/.env
pm2 restart aa-md-bot
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard load nahi ho raha | `pm2 logs aa-md-bot --err` dekho |
| `MongoDB connection failed` | `sudo systemctl status mongod` — start karo |
| Port 5000 reachable nahi | Oracle Console → VCN → Security List → port 5000 add karo |
| VM2/VM3 DB connect nahi | VM1 par `bindIp` check karo (`0.0.0.0`), aur iptables rule sirf VCN CIDR ke liye ho — port 27017 public internet par kabhi open na karo |
| `pm2 not found` | `source ~/.bashrc` chalao phir dobara try karo |
| yt-dlp outdated | `sudo yt-dlp -U` |
| Bot crash on start | `.env` mein `MONGODB_URI` check karo — sahi hai? |

---

## Deploy Checklist ✅

**Oracle VMs:**
- [ ] VCN banaya
- [ ] Ports 22 + 5000 open
- [ ] VM1 (2 OCPU, 12 GB) + VM2 + VM3 banaye
- [ ] SSH keys saved

**VM1 (MongoDB + Bot):**
- [ ] `bash <(curl ...)` chalaya — koi input nahi diya
- [ ] Script ne `✅ Deploy Complete!` dikhaya
- [ ] Dashboard: `http://VM1_IP:5000` open hota hai
- [ ] WhatsApp paired

**VM2 + VM3:**
- [ ] VM1 par MongoDB `bindIp` update kiya
- [ ] Setup script chalaya
- [ ] VM1 ka MONGODB_URI `.env` mein set kiya
- [ ] WhatsApp paired
