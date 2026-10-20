-- What every AI call really costs (Kezie, 2026-10-20: "having real-time unit economics in the
-- database instead of losing logs after 30 minutes in Vercel is crucial"). One row per call: the
-- feature, the provider and model, tokens, the estimated provider cost in USD, and the credits the
-- user paid for it (0 when it was free to them). Ask BlinkSpot's included messages are counted
-- from here for the monthly allowance (units: deeper thinking levels count as more).
-- Server only: RLS on with no policies, and no table grants to the browser roles.

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete set null,
  user_id uuid,
  brand_id uuid,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{1,40}$'),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,20}$'),
  model text check (char_length(model) <= 80),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  usd numeric(10, 5),
  credits_charged integer not null default 0,
  included boolean not null default false,
  units integer not null default 1 check (units between 0 and 100),
  ok boolean not null default true,
  meta jsonb
);

create index if not exists ai_usage_client_created on public.ai_usage (client_id, created_at desc);
create index if not exists ai_usage_feature_created on public.ai_usage (feature, created_at desc);
create index if not exists ai_usage_ask_month on public.ai_usage (user_id, created_at desc) where feature = 'ask' and included;

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;

-- Monthly roll-up for the unit-economics review (read with the service role).
create or replace view public.ai_usage_monthly with (security_invoker = true) as
select date_trunc('month', created_at)::date as month, feature, provider,
  count(*) as calls, count(*) filter (where not ok) as failed,
  round(sum(coalesce(usd, 0))::numeric, 4) as usd,
  sum(credits_charged) as credits_charged,
  round((sum(credits_charged) * 0.005)::numeric, 4) as credits_at_cost_usd,
  count(*) filter (where credits_charged = 0) as free_calls
from public.ai_usage group by 1, 2, 3;

revoke all on table public.ai_usage_monthly from anon, authenticated;
