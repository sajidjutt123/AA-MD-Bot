-- ═══════════════════════════════════════════════════════════════════
--  AA MD Bot — Supabase schema
--
--  Run this once in Supabase → SQL Editor → New query → Run.
--  The bot also creates these tables automatically on first boot, so this
--  file is only required if you want to create them yourself (for example
--  to enable RLS before the bot ever connects).
-- ═══════════════════════════════════════════════════════════════════

-- ── Bot state: one JSONB document per logical collection ────────────
-- Collections: settings, groups, sessionSettings, notes, birthdays,
--              sessions, reminders
create table if not exists public.bot_state (
  name        text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table public.bot_state is 'AA MD Bot key-value state (settings, groups, per-session settings, notes…)';

-- ── WhatsApp credentials (Baileys creds.json equivalent) ────────────
create table if not exists public.whatsapp_auth_creds (
  session_id  text primary key,
  creds       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ── WhatsApp signal keys (one row per session + key type) ───────────
create table if not exists public.whatsapp_auth_keys (
  session_id  text not null,
  key_type    text not null,
  keys        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (session_id, key_type)
);

create index if not exists whatsapp_auth_keys_session_idx
  on public.whatsapp_auth_keys (session_id);

-- ══════════════════════════════════════════════════════════════════
--  Row Level Security
--
--  The bot connects with the Postgres role from SUPABASE_DB_URL (the
--  "postgres" user), which bypasses RLS. These policies exist so that a
--  leaked anon key still cannot read WhatsApp session credentials.
-- ══════════════════════════════════════════════════════════════════

alter table public.bot_state             enable row level security;
alter table public.whatsapp_auth_creds   enable row level security;
alter table public.whatsapp_auth_keys    enable row level security;

-- No policies are defined on purpose: with RLS enabled and zero policies,
-- anon/authenticated roles get no access at all. Only the service role
-- (used by the bot) can read or write.
--
-- If your dashboard needs read-only stats through the Supabase JS client,
-- add a narrow policy like:
--
--   create policy "public read stats"
--     on public.bot_state for select
--     to anon
--     using (name = 'settings');
--
-- …but the recommended path is to go through the bot's own authenticated
-- HTTP API (SESSION_SECRET bearer token), which is what dashboard/app.js does.

-- ══════════════════════════════════════════════════════════════════
--  Optional: keep the JSONB documents reasonably fresh
--  (Supabase has no TTL natively; pg_cron is available on paid plans)
-- ══════════════════════════════════════════════════════════════════
-- select cron.schedule('aa-md-bot-vacuum', '0 4 * * *', $$vacuum (analyze) bot_state$$);
