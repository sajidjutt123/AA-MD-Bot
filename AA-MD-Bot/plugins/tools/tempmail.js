// AA MD Bot - Temporary Email
// Provider chain (on create failure):
//   1. Direct mail.tm API (primary — proper REST, fast)
//   2. DC mailtm      (fallback 1 — /tempmail/mailtm/*)
//   3. DC emailnator  (fallback 2 — /tempmail/emailnator/*)
import axios from 'axios';

const DC  = 'https://apis.davidcyriltech.my.id';
const UA  = { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' };

// In-memory sessions per JID:
// { provider, email, password?, token?, accountId?, createdAt }
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function randStr(len = 10) {
  return Math.random().toString(36).slice(2, 2 + len);
}

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function stripHtml(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 2500);
}

// Normalise a raw message array from any provider into:
// [{ id, from, subject, createdAt }]
function normMessages(raw, provider) {
  if (!Array.isArray(raw)) raw = [];
  return raw.map(m => ({
    id:        m.id          || m.messageId || m._id     || '',
    from:      m.from?.address || m.from?.name || m.from || m.sender || 'unknown',
    subject:   m.subject    || m.title     || '(no subject)',
    createdAt: m.createdAt  || m.date      || m.receivedAt || new Date().toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider 1: Direct mail.tm (PRIMARY)
// ─────────────────────────────────────────────────────────────────────────────
const mailtmApi = axios.create({
  baseURL: 'https://api.mail.tm',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

async function mailtmDomain() {
  const { data } = await mailtmApi.get('/domains');
  const d = data?.['hydra:member']?.[0]?.domain;
  if (!d) throw new Error('No domain available');
  return d;
}

async function mailtmCreate() {
  const domain   = await mailtmDomain();
  const address  = `${randStr(10)}@${domain}`;
  const password = randStr(14);
  const { data: acc } = await mailtmApi.post('/accounts', { address, password });
  if (!acc?.id) throw new Error('Account create failed');
  const { data: tok } = await mailtmApi.post('/token', { address, password });
  if (!tok?.token) throw new Error('Token missing');
  return { provider: 'mailtm', email: address, password, token: tok.token, accountId: acc.id, createdAt: Date.now() };
}

async function mailtmRefreshToken(sess) {
  if (Date.now() - sess.createdAt > 55 * 60 * 1000) {
    const { data } = await mailtmApi.post('/token', { address: sess.email, password: sess.password });
    sess.token = data.token;
    sess.createdAt = Date.now();
  }
  return sess.token;
}

async function mailtmInbox(sess) {
  const token = await mailtmRefreshToken(sess);
  const { data } = await mailtmApi.get('/messages', { headers: { Authorization: `Bearer ${token}` } });
  return normMessages(data?.['hydra:member'] || [], 'mailtm');
}

async function mailtmRead(sess, id) {
  const token = await mailtmRefreshToken(sess);
  const { data } = await mailtmApi.get(`/messages/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return { from: data?.from?.address || 'unknown', subject: data?.subject || '', body: data?.text ? data.text.trim().slice(0, 2500) : stripHtml(data?.html), createdAt: data?.createdAt };
}

async function mailtmDelete(sess) {
  try {
    const token = await mailtmRefreshToken(sess);
    await mailtmApi.delete(`/accounts/${sess.accountId}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider 2: DC mailtm (Fallback 1)
// ─────────────────────────────────────────────────────────────────────────────
async function dcMailtmCreate() {
  const { data } = await axios.get(`${DC}/tempmail/mailtm/create`, { headers: UA, timeout: 15000 });
  const d = data?.result || data?.data || data;
  const email = d?.email || d?.address || d?.mail;
  const token = d?.token || d?.jwt || data?.token;
  const accountId = d?.id || d?.accountId || d?.account_id || null;
  if (!email) throw new Error('DC mailtm: no email returned');
  return { provider: 'dc_mailtm', email, token, accountId, createdAt: Date.now() };
}

async function dcMailtmInbox(sess) {
  const params = { email: sess.email };
  if (sess.token) params.token = sess.token;
  const { data } = await axios.get(`${DC}/tempmail/mailtm/inbox`, { params, headers: UA, timeout: 15000 });
  const raw = Array.isArray(data) ? data
    : (data?.messages || data?.data?.messages || data?.inbox || data?.result?.messages || data?.data || []);
  return normMessages(raw, 'dc_mailtm');
}

async function dcMailtmRead(sess, id) {
  const params = { id };
  if (sess.token) params.token = sess.token;
  const { data } = await axios.get(`${DC}/tempmail/mailtm/message`, { params, headers: UA, timeout: 15000 });
  const d = data?.result || data?.data || data;
  const body = d?.text ? d.text.trim().slice(0, 2500) : stripHtml(d?.html || d?.body || '');
  return { from: d?.from?.address || d?.from || 'unknown', subject: d?.subject || '', body, createdAt: d?.createdAt || d?.date };
}

async function dcMailtmDelete(sess) {
  try {
    const params = { email: sess.email };
    if (sess.token) params.token = sess.token;
    await axios.get(`${DC}/tempmail/mailtm/delete`, { params, headers: UA, timeout: 10000 });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider 3: DC emailnator (Fallback 2)
// ─────────────────────────────────────────────────────────────────────────────
async function dcEmailnatorCreate() {
  const { data } = await axios.get(`${DC}/tempmail/emailnator/create`, { headers: UA, timeout: 15000 });
  const d = data?.result || data?.data || data;
  const email = d?.email || d?.address || d?.mail || (typeof d === 'string' ? d : null);
  if (!email) throw new Error('DC emailnator: no email returned');
  return { provider: 'dc_emailnator', email, createdAt: Date.now() };
}

async function dcEmailnatorInbox(sess) {
  const { data } = await axios.get(`${DC}/tempmail/emailnator/inbox`, {
    params: { email: sess.email }, headers: UA, timeout: 15000,
  });
  const raw = Array.isArray(data) ? data
    : (data?.messages || data?.data?.messages || data?.inbox || data?.result?.messages || data?.data || []);
  return normMessages(raw, 'dc_emailnator');
}

// emailnator doesn't expose individual message reading — return what we have
async function dcEmailnatorRead(sess, id) {
  const msgs = await dcEmailnatorInbox(sess);
  const m = msgs.find(x => x.id === id) || msgs[0];
  if (!m) throw new Error('Message not found');
  return { from: m.from, subject: m.subject, body: m.body || m.subject || '(no body available)', createdAt: m.createdAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified create — tries providers in order
// ─────────────────────────────────────────────────────────────────────────────
async function createSession() {
  const providers = [
    ['mail.tm',       mailtmCreate],
    ['DC mailtm',     dcMailtmCreate],
    ['DC emailnator', dcEmailnatorCreate],
  ];
  for (const [name, fn] of providers) {
    try {
      const sess = await fn();
      if (sess?.email) {
        console.log(`[tempmail] Created via ${name}: ${sess.email}`);
        return sess;
      }
    } catch (e) {
      console.warn(`[tempmail] ${name} failed: ${e.message}`);
    }
  }
  throw new Error('All email providers failed. Try again in a moment.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider dispatch — inbox / read / delete
// ─────────────────────────────────────────────────────────────────────────────
async function getInbox(sess) {
  switch (sess.provider) {
    case 'mailtm':        return mailtmInbox(sess);
    case 'dc_mailtm':     return dcMailtmInbox(sess);
    case 'dc_emailnator': return dcEmailnatorInbox(sess);
    default:              return mailtmInbox(sess);
  }
}

async function readMessage(sess, id) {
  switch (sess.provider) {
    case 'mailtm':        return mailtmRead(sess, id);
    case 'dc_mailtm':     return dcMailtmRead(sess, id);
    case 'dc_emailnator': return dcEmailnatorRead(sess, id);
    default:              return mailtmRead(sess, id);
  }
}

async function deleteSession(sess) {
  switch (sess.provider) {
    case 'mailtm':    return mailtmDelete(sess);
    case 'dc_mailtm': return dcMailtmDelete(sess);
    default:          return; // emailnator: no delete endpoint
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────
export default {
  command: 'tempmail',
  alias: ['tm', 'disposable', 'fakemail', 'tmpmail', 'tmail'],
  description: 'Temporary disposable email — inbox check + email read',
  category: 'tools',

  async execute({ reply, react, text, jid, prefix }) {
    const args = (text || '').trim();
    const sub  = args.toLowerCase().split(/\s+/)[0];

    // ── .tempmail new / create ───────────────────────────────────────────────
    if (sub === 'new' || sub === 'create') {
      await react('⏳');
      try {
        const old = sessions.get(jid);
        if (old) deleteSession(old).catch(() => {});

        const sess = await createSession();
        sessions.set(jid, sess);
        await react('✅');
        return reply(
          `📧 *New Temporary Email*\n\n` +
          `📬 *Email:* \`${sess.email}\`\n` +
          `🔌 *Provider:* ${sess.provider}\n\n` +
          `_Use this email on any site — messages appear here_\n\n` +
          `*Commands:*\n` +
          `• *${prefix}tempmail inbox* — check inbox\n` +
          `• *${prefix}tempmail read <id>* — read a message\n` +
          `• *${prefix}tempmail new* — get a new email\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      } catch (e) {
        await react('❌');
        return reply(`❌ Email create failed: ${e.message}\n\n> 🤖 *AA MD Bot*`);
      }
    }

    // ── .tempmail inbox / check ──────────────────────────────────────────────
    if (sub === 'inbox' || sub === 'check') {
      const sess = sessions.get(jid);
      if (!sess) return reply(
        `❌ No email yet.\n*${prefix}tempmail* — get a temporary email\n\n> 🤖 *AA MD Bot*`
      );
      await react('⏳');
      try {
        const emails = await getInbox(sess);
        if (!emails.length) {
          await react('✅');
          return reply(
            `📭 *Inbox Empty*\n\n` +
            `📬 *Email:* \`${sess.email}\`\n\n` +
            `_No messages yet. Check again in a moment._\n\n` +
            `> 🤖 *AA MD Bot*`
          );
        }
        const list = emails.slice(0, 10).map((m, i) =>
          `*${i + 1}.* 📩 *From:* ${m.from}\n` +
          `   *Subject:* ${m.subject}\n` +
          `   *Time:* ${timeAgo(m.createdAt)}\n` +
          `   _ID: \`${m.id}\`_\n` +
          `   👉 ${prefix}tempmail read ${m.id}`
        ).join('\n\n');
        await react('✅');
        return reply(
          `📬 *Inbox (${emails.length})*\n` +
          `📬 ${sess.email}\n` +
          `${'─'.repeat(28)}\n\n` +
          `${list}\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      } catch (e) {
        await react('❌');
        return reply(`❌ Inbox fetch failed: ${e.message}\n\n> 🤖 *AA MD Bot*`);
      }
    }

    // ── .tempmail read <id> ──────────────────────────────────────────────────
    if (sub === 'read') {
      const id   = args.split(/\s+/)[1];
      const sess = sessions.get(jid);
      if (!sess) return reply(`❌ No email yet.\n*${prefix}tempmail*\n\n> 🤖 *AA MD Bot*`);
      if (!id)   return reply(`❌ Provide message ID.\n*Example:* _${prefix}tempmail read <id>_\n\n> 🤖 *AA MD Bot*`);
      await react('⏳');
      try {
        const mail = await readMessage(sess, id);
        await react('✅');
        return reply(
          `📩 *Email*\n` +
          `${'─'.repeat(28)}\n` +
          `*From:* ${mail.from}\n` +
          `*To:* ${sess.email}\n` +
          `*Subject:* ${mail.subject}\n` +
          (mail.createdAt ? `*Time:* ${timeAgo(mail.createdAt)}\n` : '') +
          `${'─'.repeat(28)}\n\n` +
          `${mail.body || '(empty body)'}\n\n` +
          `> 🤖 *AA MD Bot*`
        );
      } catch (e) {
        await react('❌');
        return reply(`❌ Read failed: ${e.message}\n\n> 🤖 *AA MD Bot*`);
      }
    }

    // ── .tempmail — create or show existing ─────────────────────────────────
    await react('⏳');
    try {
      let sess = sessions.get(jid);
      const expired = !sess || Date.now() - sess.createdAt > 55 * 60 * 1000;
      if (expired) {
        if (sess) deleteSession(sess).catch(() => {});
        sess = await createSession();
        sessions.set(jid, sess);
      }
      await react('✅');
      reply(
        `📧 *Temporary Email*\n\n` +
        `📬 *Email:* \`${sess.email}\`\n` +
        `🔌 *Provider:* ${sess.provider}\n\n` +
        `_Use this email on any site — messages appear here_\n\n` +
        `*Commands:*\n` +
        `• *${prefix}tempmail inbox* — check inbox\n` +
        `• *${prefix}tempmail read <id>* — read a message\n` +
        `• *${prefix}tempmail new* — get a new email\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    } catch (e) {
      await react('❌');
      reply(`❌ *Error:* ${e.message}\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
