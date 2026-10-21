// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot — control panel
//  Vanilla ES module. No build step: works when served by the bot and
//  when deployed as a static site on Vercel.
// ═══════════════════════════════════════════════════════════════════

const LS = {
  base: 'aa.base',
  token: 'aa.token',
  view: 'aa.view',
  method: 'aa.method',
};

const cfg = window.AA_CONFIG || {};

// `?demo=1` (or `demo: true` in config.js) renders the panel with sample data
// so the UI can be previewed without a running bot — handy for design review.
const DEMO = new URLSearchParams(location.search).has('demo') || cfg.demo === true;

const state = {
  base: localStorage.getItem(LS.base) ?? cfg.apiBase ?? '',
  token: localStorage.getItem(LS.token) ?? cfg.token ?? '',
  view: localStorage.getItem(LS.view) || 'overview',
  method: localStorage.getItem(LS.method) || 'qr',
  sessions: [],
  stats: null,
  sse: null,
  sseTimer: null,
  pollTimer: null,
  pairingSession: null,
  commands: null,
  commandCat: 'all',
  commandQuery: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── Helpers ──────────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const apiBase = () => (state.base || '').replace(/\/+$/, '');

function url(path, extra = {}) {
  const u = new URL(`${apiBase()}${path}`, window.location.origin);
  if (state.token) u.searchParams.set('token', state.token);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

const DEMO_STATS = {
  bot: 'AA MD Bot', version: '3.0.0', mode: 'public', prefix: '.',
  uptime: '4d 7h 22m', startedAt: Date.now() - 4 * 864e5,
  plugins: 274, groups: 38,
  sessions: [
    { id: '923316041183', name: 'AA Mods', status: 'connected', connectedAt: Date.now() - 3 * 864e5 },
    { id: 'tg_923001234567', name: null, status: 'connecting', connectedAt: null },
  ],
  connectedSessions: 1,
  categories: { search: 41, media: 42, fun: 30, tools: 27, admin: 24, download: 16, gb: 16, group: 14, owner: 31, utility: 15, islamic: 3 },
  ram: 212,
  storage: { backend: 'postgres', enabled: true, ok: true, latencyMs: 24, sessions: 2, collections: 7 },
};

const DEMO_COMMANDS = [
  ['ai', 'search', 'Powerful AI chat — multi-model, memory', ['gpt', 'aichat', 'chat'], { ownerOnly: false }],
  ['sticker', 'media', 'Convert image/video to WhatsApp sticker', ['s', 'stiker'], { ownerOnly: false }],
  ['play', 'download', 'Download audio from YouTube', ['song', 'yt', 'mp3'], { ownerOnly: false }],
  ['menu', 'utility', 'Show all available commands', ['help', 'commands'], {}],
  ['antilink', 'admin', 'Block links in the group', ['antilink'], { adminOnly: true, groupOnly: true }],
  ['setprefix', 'owner', 'Change the bot command prefix', ['prefix'], { ownerOnly: true }],
  ['sh', 'owner', 'Run a shell command on the host', ['terminal', 'exec'], { superOwnerOnly: true }],
  ['islamicmenu', 'islamic', 'Show all Islamic commands', ['imenu', 'islamic'], {}],
];

function demoResponse(path) {
  if (path.startsWith('/stats')) return DEMO_STATS;
  if (path.startsWith('/commands')) {
    return {
      count: 274,
      categories: DEMO_STATS.categories,
      commands: DEMO_COMMANDS.map(([name, category, description, alias, flags]) => ({
        name, category, description, alias, usage: '', flags,
      })),
    };
  }
  if (path.startsWith('/commands')) return { count: 0, categories: {}, commands: [] };
  if (path.startsWith('/pairing-code')) return { code: '4821-9930' };
  if (path.startsWith('/session/create')) return { ok: true };
  return {};
}

async function api(path, { method = 'GET', body } = {}) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 120));
    return demoResponse(path);
  }
  const res = await fetch(url(path), {
    method,
    headers: {
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    showGate('Invalid or missing API token.');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setConn(mode, text) {
  const pill = $('#conn-pill');
  pill.classList.toggle('is-live', mode === 'live');
  pill.classList.toggle('is-down', mode === 'down');
  $('#conn-text').textContent = text;
}

function toast(title, msg = '', kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<strong>${esc(title)}</strong>${msg ? `<span class="muted">${esc(msg)}</span>` : ''}`;
  $('#toasts').append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'all .2s';
    setTimeout(() => el.remove(), 220);
  }, 4200);
}

function logEvent(name, detail) {
  const log = $('#event-log');
  const placeholder = log.querySelector('.muted');
  if (placeholder) placeholder.remove();

  const li = document.createElement('li');
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `<time>${t}</time><span><span class="ev-name">${esc(name)}</span> ${esc(detail)}</span>`;
  log.prepend(li);
  while (log.children.length > 40) log.lastElementChild.remove();
}

// ── Gate ─────────────────────────────────────────────────────────────
function showGate(error) {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gate-base').value = state.base;
  $('#gate-token').value = state.token;
  const err = $('#gate-error');
  err.hidden = !error;
  err.textContent = error || '';
  stopLive();
}

async function connect() {
  const btn = $('#gate-connect');
  const base = $('#gate-base').value.trim();
  const token = $('#gate-token').value.trim();

  btn.disabled = true;
  btn.textContent = 'Connecting…';

  try {
    const probe = new URL(`${base.replace(/\/+$/, '')}/healthz`, window.location.origin);
    const res = await fetch(probe.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Bot answered HTTP ${res.status} — is the URL correct?`);

    // Verify the token against a protected route (healthz is public on purpose).
    const authProbe = new URL(`${base.replace(/\/+$/, '')}/stats`, window.location.origin);
    if (token) authProbe.searchParams.set('token', token);
    const authRes = await fetch(authProbe.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (authRes.status === 401) throw new Error('Token rejected. Use the SESSION_SECRET from the bot .env.');

    state.base = base;
    state.token = token;
    localStorage.setItem(LS.base, base);
    localStorage.setItem(LS.token, token);
    await boot();
  } catch (e) {
    showGate(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}

// ── Routing ──────────────────────────────────────────────────────────
const VIEW_META = {
  overview: ['Overview', 'Everything happening on your bot, at a glance.'],
  sessions: ['Sessions', 'Every linked WhatsApp number and its live status.'],
  connect: ['Connect', 'Link a new WhatsApp number by QR code or pairing code.'],
  commands: ['Commands', 'The full command registry, straight from the running bot.'],
  settings: ['Settings', 'API endpoint, token and storage backend.'],
};

function go(view) {
  if (!VIEW_META[view]) view = 'overview';
  state.view = view;
  localStorage.setItem(LS.view, view);

  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));

  const [title, sub] = VIEW_META[view];
  $('#view-title').textContent = title;
  $('#view-sub').textContent = sub;

  if (view === 'commands' && !state.commands) loadCommands();
  if (view === 'settings') renderSettings();
}

// ── Data ─────────────────────────────────────────────────────────────
async function loadStats() {
  const s = await api('/stats');
  state.stats = s;
  state.sessions = s.sessions || [];
  renderStats(s);
  renderSessions();
  renderStorage(s.storage);
  return s;
}

function renderStats(s) {
  $('#brand-version').textContent = `v${s.version || '3.0.0'}`;
  $('#s-status').textContent = s.connectedSessions > 0 ? 'Online' : 'Idle';
  $('#s-status').style.color = s.connectedSessions > 0 ? 'var(--accent)' : 'var(--text)';
  $('#s-mode').textContent = `mode: ${s.mode || 'public'}`;
  $('#s-uptime').textContent = s.uptime || '—';
  $('#s-sessions').textContent = `${s.connectedSessions}/${s.sessions.length}`;
  $('#s-sessions-sub').textContent = s.sessions.length ? 'connected / total' : 'no sessions yet';
  $('#s-plugins').textContent = s.plugins ?? '—';
  $('#s-cats').textContent = `${Object.keys(s.categories || {}).length} categories`;
  $('#s-groups').textContent = s.groups ?? '—';
  $('#s-ram').textContent = `${s.ram ?? '—'} MB`;
  $('#nav-session-count').textContent = s.sessions.length;

  $('#config-grid').innerHTML = [
    ['Name', s.bot || 'AA MD Bot'],
    ['Version', s.version || '—'],
    ['Prefix', s.prefix || '.'],
    ['Mode', s.mode || 'public'],
  ]
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join('');
}

function renderStorage(storage = {}) {
  const chip = $('#storage-chip');
  const body = $('#storage-body');
  const backend = storage.backend || 'unknown';

  const labels = {
    postgres: 'Supabase / Postgres',
    mongo: 'MongoDB',
    memory: 'In-memory only',
  };

  if (backend === 'memory') {
    chip.className = 'chip chip-warn';
    chip.textContent = 'not persistent';
    body.innerHTML = `
      <p class="muted">No database is configured — every setting is lost on restart.</p>
      <p class="hint">Set <code>SUPABASE_DB_URL</code> (Supabase → Database → Connection string)<br/>or <code>MONGODB_URI</code> in <code>.env</code>.</p>`;
    return;
  }

  const ok = storage.ok !== false;
  chip.className = `chip ${ok ? 'chip-ok' : 'chip-bad'}`;
  chip.textContent = ok ? 'healthy' : 'error';

  const rows = [
    ['Backend', labels[backend] || backend],
    ok ? ['Latency', storage.latencyMs != null ? `${storage.latencyMs} ms` : '—'] : ['Error', storage.error || 'unknown'],
    storage.sessions != null ? ['Stored sessions', storage.sessions] : null,
    storage.collections != null ? ['Collections', storage.collections] : null,
  ].filter(Boolean);

  const fallbackNote = ok
    ? ''
    : `<p class="hint">The bot could not reach this database, so it is running on in-memory storage right now — settings and sessions will not survive a restart. Fix the credentials, then restart the bot.</p>`;

  body.innerHTML = `<div class="kv">${rows
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join('')}</div>${fallbackNote}`;
}

function statusChip(status) {
  const map = {
    connected: ['chip-ok', 'connected'],
    connecting: ['chip-warn', 'connecting'],
    qr: ['chip-warn', 'awaiting QR'],
    pairing: ['chip-warn', 'pairing'],
    disconnected: ['chip-bad', 'disconnected'],
    error: ['chip-bad', 'error'],
  };
  const [cls, label] = map[status] || ['chip-muted', status || 'unknown'];
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

function renderSessions() {
  const body = $('#sessions-body');
  $('#sessions-chip').textContent = String(state.sessions.length);

  if (!state.sessions.length) {
    body.innerHTML = `<tr><td colspan="4" class="center muted" style="padding:32px">
      No sessions yet — open <strong>Connect</strong> to link your first number.</td></tr>`;
    return;
  }

  body.innerHTML = state.sessions
    .map((s) => {
      const when = s.connectedAt ? new Date(s.connectedAt).toLocaleString() : '—';
      return `<tr>
        <td><span class="mono">${esc(s.id)}</span>${s.name ? `<br/><small class="muted">${esc(s.name)}</small>` : ''}</td>
        <td>${statusChip(s.status)}</td>
        <td class="muted">${esc(when)}</td>
        <td class="right">
          <button class="btn btn-danger btn-sm" data-del="${esc(s.id)}">Disconnect</button>
        </td>
      </tr>`;
    })
    .join('');
}

async function deleteSession(id) {
  if (!window.confirm(`Disconnect session "${id}"? This removes its WhatsApp credentials.`)) return;
  try {
    await api(`/session/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Session removed', id);
    await loadStats();
  } catch (e) {
    toast('Could not remove session', e.message, 'bad');
  }
}

// ── Connect view ─────────────────────────────────────────────────────
function setMethod(method) {
  state.method = method;
  localStorage.setItem(LS.method, method);
  $$('.seg').forEach((b) => b.classList.toggle('is-active', b.dataset.method === method));
  $('#phone-field').hidden = method !== 'pairing';
}

async function createSession() {
  const sessionId = ($('#new-session-id').value.trim() || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  const phone = $('#new-session-phone').value.replace(/\D/g, '');
  const btn = $('#create-session');

  if (state.method === 'pairing' && (!phone || phone.length < 7)) {
    toast('Phone number required', 'Enter country code + number.', 'bad');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Starting…';

  try {
    await api('/session/create', {
      method: 'POST',
      body: {
        sessionId,
        method: state.method,
        ...(state.method === 'pairing' ? { phoneNumber: phone } : {}),
      },
    });

    state.pairingSession = sessionId;
    $('#pair-title').textContent = `Session: ${sessionId}`;
    $('#pair-chip').className = 'chip chip-warn';
    $('#pair-chip').textContent = state.method === 'pairing' ? 'requesting code' : 'waiting for QR';
    $('#pair-hint').textContent =
      state.method === 'pairing'
        ? 'Enter the code on your phone: WhatsApp → Linked devices → Link with phone number.'
        : 'Scan the QR with WhatsApp → Linked devices → Link a device.';

    toast('Session starting', sessionId);
    startPairingPoll(sessionId);
    await loadStats();
  } catch (e) {
    toast('Could not start session', e.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start session';
  }
}

function showQr(sessionId) {
  const img = $('#qr-img');
  img.src = url('/qr-image', { session: sessionId, t: Date.now() });
  img.hidden = false;
  $('#qr-placeholder').hidden = true;
  $('#pair-chip').className = 'chip chip-warn';
  $('#pair-chip').textContent = 'scan now';
}

function showCode(sessionId, code) {
  $('#code-box').hidden = false;
  $('#pair-code').textContent = code.replace(/(\d{4})(\d{4})/, '$1-$2');
  $('#qr-placeholder').hidden = true;
  $('#qr-img').hidden = true;
  $('#pair-chip').className = 'chip chip-ok';
  $('#pair-chip').textContent = 'code ready';
  logEvent('pairingCode', `${sessionId}: ${code}`);
}

function startPairingPoll(sessionId) {
  clearInterval(state.pollTimer);
  let ticks = 0;

  state.pollTimer = setInterval(async () => {
    if (state.view !== 'connect' || !state.pairingSession) return;
    if (++ticks > 100) return clearInterval(state.pollTimer);

    // QR codes rotate every ~20 s; refresh the <img> periodically.
    if (state.method === 'qr' && !$('#qr-img').hidden) {
      showQr(sessionId);
    }

    try {
      const { code } = await api('/pairing-code', { session: sessionId });
      if (code) showCode(sessionId, code);
    } catch {
      /* transient — the SSE stream is the primary channel */
    }
  }, 3000);
}

// ── Commands ─────────────────────────────────────────────────────────
async function loadCommands() {
  try {
    const data = await api('/commands');
    state.commands = data;
    $('#cmd-count').textContent = `${data.count} commands`;
    renderCats(data.categories);
    renderCommands();
  } catch (e) {
    $('#cmd-body').innerHTML = `<tr><td colspan="4" class="center muted">${esc(e.message)}</td></tr>`;
  }
}

function renderCats(categories) {
  const cats = Object.entries(categories || {}).sort((a, b) => b[1] - a[1]);
  $('#cmd-cats').innerHTML =
    `<button class="cat is-active" data-cat="all">all ${state.commands.count}</button>` +
    cats.map(([c, n]) => `<button class="cat" data-cat="${esc(c)}">${esc(c)} ${n}</button>`).join('');
}

function renderCommands() {
  if (!state.commands) return;
  const { commands } = state.commands;
  const q = state.commandQuery.toLowerCase();

  const rows = commands.filter((c) => {
    if (state.commandCat !== 'all' && c.category !== state.commandCat) return false;
    if (!q) return true;
    return (
      c.name.includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      c.alias.some((a) => a.includes(q))
    );
  });

  if (!rows.length) {
    $('#cmd-body').innerHTML = `<tr><td colspan="4" class="center muted" style="padding:26px">No commands match.</td></tr>`;
    return;
  }

  const shown = rows.slice(0, 400);
  const flags = (f) => {
    const out = [];
    if (f.superOwnerOnly) out.push('<span class="flag flag-super">super</span>');
    else if (f.ownerOnly) out.push('<span class="flag flag-owner">owner</span>');
    if (f.adminOnly) out.push('<span class="flag flag-admin">admin</span>');
    if (f.groupOnly) out.push('<span class="flag flag-group">group</span>');
    return out.join(' ') || '<span class="muted">everyone</span>';
  };

  $('#cmd-body').innerHTML =
    shown
      .map(
        (c) => `<tr>
          <td><span class="mono">.${esc(c.name)}</span></td>
          <td>${esc(c.description || '')}${c.usage ? `<br/><small class="muted">${esc(c.usage)}</small>` : ''}</td>
          <td>${c.alias.length ? `<div class="pill-list">${c.alias.slice(0, 4).map((a) => `<span class="pill">${esc(a)}</span>`).join('')}${c.alias.length > 4 ? `<span class="pill">+${c.alias.length - 4}</span>` : ''}</div>` : '<span class="muted">—</span>'}</td>
          <td>${flags(c.flags || {})}</td>
        </tr>`
      )
      .join('') +
    (rows.length > shown.length
      ? `<tr><td colspan="4" class="center muted">Showing ${shown.length} of ${rows.length} — refine your search.</td></tr>`
      : '');
}

// ── Settings ─────────────────────────────────────────────────────────
function renderSettings() {
  $('#set-base').value = state.base;
  $('#set-token').value = state.token;
  $('#api-base-echo').textContent = state.base || 'same origin';
  const s = state.stats?.storage || {};
  $('#settings-backend').innerHTML = [
    ['Backend', s.backend || 'unknown'],
    ['Health', s.ok === false ? s.error || 'error' : s.enabled === false ? 'not configured' : 'ok'],
    ['API base', state.base || 'same origin'],
  ]
    .map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join('');
}

async function saveSettings() {
  state.base = $('#set-base').value.trim();
  state.token = $('#set-token').value.trim();
  localStorage.setItem(LS.base, state.base);
  localStorage.setItem(LS.token, state.token);
  await boot();
  toast('Saved', 'Reconnected with the new settings.');
}

// ── Live stream ──────────────────────────────────────────────────────
function startLive() {
  stopLive();
  if (!state.token) return;

  try {
    state.sse = new EventSource(url('/events'));
  } catch {
    return;
  }

  state.sse.onopen = () => {
    setConn('live', 'live');
    $('#sse-chip').className = 'chip chip-ok';
    $('#sse-chip').textContent = 'streaming';
  };

  state.sse.onerror = () => {
    setConn('down', 'reconnecting…');
    $('#sse-chip').className = 'chip chip-warn';
    $('#sse-chip').textContent = 'reconnecting';
    // EventSource retries on its own; if it stays closed, recreate it.
    if (state.sse && state.sse.readyState === EventSource.CLOSED) {
      clearTimeout(state.sseTimer);
      state.sseTimer = setTimeout(startLive, 5000);
    }
  };

  const on = (name, fn) => state.sse.addEventListener(name, (ev) => {
    let data = {};
    try { data = JSON.parse(ev.data); } catch {}
    fn(data);
  });

  on('qr', (d) => {
    if (!d?.sessionId) return;
    $('#pair-title').textContent = `Session: ${d.sessionId}`;
    if (state.view === 'connect') showQr(d.sessionId);
  });

  on('status', (d) => {
    logEvent('status', `${d.sessionId} → ${d.status}`);
    if (d.status === 'connected') {
      toast('Connected', d.sessionId);
      $('#pair-chip').className = 'chip chip-ok';
      $('#pair-chip').textContent = 'connected';
      clearInterval(state.pollTimer);
      loadStats().catch(() => {});
    } else if (d.sessionId) {
      loadStats().catch(() => {});
    }
  });

  on('pairingCode', (d) => {
    if (!d?.code) return;
    state.pairingSession = d.sessionId || state.pairingSession;
    if (state.view === 'connect') showCode(d.sessionId, d.code);
    else logEvent('pairingCode', `${d.sessionId}: ${d.code}`);
  });

  on('pairingCodeError', (d) =>
    toast('Pairing failed', d?.error || d?.message || '', 'bad')
  );
}

function stopLive() {
  clearTimeout(state.sseTimer);
  if (state.sse) {
    state.sse.close();
    state.sse = null;
  }
  setConn('', 'offline');
  $('#sse-chip').className = 'chip chip-muted';
  $('#sse-chip').textContent = 'idle';
}

// ── Boot ─────────────────────────────────────────────────────────────
async function boot() {
  if (DEMO) {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    setConn('live', 'demo data');
    await loadStats();
    renderSessions();
    go(state.view);
    logEvent('demo', 'sample data — append ?demo=1 to preview without a bot');
    return;
  }

  if (!state.token && !cfg.allowAnonymous) {
    showGate();
    return;
  }

  try {
    await loadStats();
  } catch (e) {
    if (!state.token) showGate();
    else showGate(e.message);
    return;
  }

  $('#gate').hidden = true;
  $('#app').hidden = false;
  setConn('live', 'online');
  startLive();
  go(state.view);
}

function wire() {
  // Gate
  $('#gate-connect').addEventListener('click', connect);
  $('#gate-token').addEventListener('keydown', (e) => e.key === 'Enter' && connect());
  $('#gate-base').addEventListener('keydown', (e) => e.key === 'Enter' && connect());

  // Nav
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

  // Overview
  $('#refresh').addEventListener('click', async () => {
    try {
      await loadStats();
      toast('Refreshed');
    } catch (e) {
      toast('Refresh failed', e.message, 'bad');
    }
  });

  // Sessions
  $('#sessions-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (btn) deleteSession(btn.dataset.del);
  });

  // Connect
  $$('.seg').forEach((b) => b.addEventListener('click', () => setMethod(b.dataset.method)));
  $('#create-session').addEventListener('click', createSession);
  $('#copy-code').addEventListener('click', async () => {
    const code = $('#pair-code').textContent.replace('-', '');
    try {
      await navigator.clipboard.writeText(code);
      toast('Copied', 'Pairing code copied to clipboard.');
    } catch {
      toast('Copy failed', 'Select the code manually.', 'bad');
    }
  });

  // Commands
  $('#cmd-search').addEventListener('input', (e) => {
    state.commandQuery = e.target.value.trim();
    renderCommands();
  });
  $('#cmd-cats').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.commandCat = btn.dataset.cat;
    $$('.cat').forEach((c) => c.classList.toggle('is-active', c === btn));
    renderCommands();
  });

  // Settings
  $('#save-settings').addEventListener('click', saveSettings);
  $('#logout').addEventListener('click', () => {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.base);
    state.token = '';
    state.base = '';
    stopLive();
    showGate('Token cleared.');
  });

  // Global health poll (10 s) — keeps the UI honest if SSE drops
  setInterval(() => {
    if (!state.token || $('#app').hidden) return;
    loadStats().catch(() => setConn('down', 'offline'));
  }, 10_000);
}

wire();
setMethod(state.method);
boot();
