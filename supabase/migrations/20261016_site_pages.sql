-- Code studio for websites (Kezie, 2026-10-16: "put HTML-like code for this thing on the site...
-- an inbuilt IDE to an extent, download that code, and see different variations like images in
-- the library"). AI-written single-file HTML pages per brand, with versions (parent_id) and an
-- optional public slug. The browser reads its own; every write goes through the server (size and
-- script checks). Published pages are served with a CSP sandbox, never as blinkspot.io itself.

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid references public.brand_profiles(id) on delete cascade,
  name text not null default 'Untitled page',
  html text not null check (char_length(html) <= 400000),
  brief text,
  notes text,
  parent_id uuid references public.site_pages(id) on delete set null,
  slug text unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_pages_brand on public.site_pages (brand_id, created_at desc);
alter table public.site_pages enable row level security;
drop policy if exists site_pages_read on public.site_pages;
create policy site_pages_read on public.site_pages for select to authenticated using (
  client_id in (select c.id from public.clients c where c.user_id = (select auth.uid()))
  or brand_id in (select public.my_shared_brand_ids())
);

-- Website research for the brand (strong sites in its category and their patterns), kept 30 days.
alter table public.brand_profiles add column if not exists site_refs jsonb;
alter table public.brand_profiles add column if not exists site_refs_at timestamptz;
