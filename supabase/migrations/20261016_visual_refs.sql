-- Visual references for a brand (Kezie, 2026-10-16: "go over to Pinterest, Behance... find designs
-- in the same category with the brand, then the best way to create an image"). Reference pages and
-- their pictures, plus Claude's art direction per look, kept 30 days. Written by the server only.
alter table public.brand_profiles add column if not exists visual_refs jsonb;
alter table public.brand_profiles add column if not exists visual_refs_at timestamptz;
