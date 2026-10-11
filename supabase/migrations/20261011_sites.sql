-- Landing pages built from a brand (2026-10-11). One site per brand for v1.
-- Read and written only by server code (service role); RLS on with no policies.
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid not null references public.brand_profiles(id) on delete cascade,
  slug text unique,
  spec jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_slug_format check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$')
);
create unique index if not exists sites_brand_id_key on public.sites (brand_id);
create index if not exists sites_client_id_idx on public.sites (client_id);
alter table public.sites enable row level security;
