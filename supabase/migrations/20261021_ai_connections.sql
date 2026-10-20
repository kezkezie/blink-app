-- Connect your AI, stage 1 (Kezie, 2026-10-20): keys a customer creates in Settings so Claude Code,
-- Hermes, OpenClaw or any MCP client can use their BlinkSpot brands through /api/mcp. Only the
-- SHA-256 of a key is stored; the key itself is shown once. Each key is scoped to some or all of the
-- workspace's brands, a permission set (stage 1: read) and a monthly credit budget (default 200,
-- enforced from stage 2, when keys can spend). Every tool call is logged in mcp_activity.
-- Server only: RLS on with no policies, no table grants to the browser roles.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  prefix text not null check (char_length(prefix) <= 16),
  brand_ids uuid[],
  permissions text[] not null default array['read'],
  monthly_credit_budget integer not null default 200 check (monthly_credit_budget between 0 and 100000),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_client on public.api_keys (client_id, created_at desc);

create table if not exists public.mcp_activity (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  key_id uuid references public.api_keys(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  tool text not null check (tool ~ '^[a-z][a-z0-9_]{1,40}$'),
  brand_id uuid,
  ok boolean not null default true,
  credits integer not null default 0,
  meta jsonb
);
create index if not exists mcp_activity_key on public.mcp_activity (key_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.mcp_activity enable row level security;
revoke all on table public.api_keys from anon, authenticated;
revoke all on table public.mcp_activity from anon, authenticated;
