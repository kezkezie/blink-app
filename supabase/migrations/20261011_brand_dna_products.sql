-- Brand DNA v2 (2026-10-11). Additive only.
-- 1. brand_profiles.dna: the structured answers the new Brand page and onboarding ask
--    (tagline, audience, location, languages, offer, reasons to choose, contact, CTA, emoji...).
-- 2. products and faqs belong to a brand (they were per account, which mixes clients' products).
-- 3. products and faqs had RLS off: lock them (the app reads/writes them through server actions
--    with the service role, which bypasses RLS). Both tables were empty and unused.
alter table public.brand_profiles add column if not exists dna jsonb not null default '{}'::jsonb;

alter table public.products add column if not exists brand_id uuid references public.brand_profiles(id) on delete cascade;
create index if not exists products_brand_id_idx on public.products (brand_id);
alter table public.products enable row level security;

alter table public.faqs add column if not exists brand_id uuid references public.brand_profiles(id) on delete cascade;
create index if not exists faqs_brand_id_idx on public.faqs (brand_id);
alter table public.faqs enable row level security;
