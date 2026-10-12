-- QA-017 (2026-10-12): every Storyboard scene failed before reaching n8n. The durable job routes
-- (video-jobs, image-jobs) upsert ON CONFLICT (client_id, generation_idempotency_key), but the
-- unique index from 20260717 was PARTIAL (WHERE key IS NOT NULL), and Postgres can't match a plain
-- ON CONFLICT to a partial index ("no unique or exclusion constraint matching", 42P10), so the
-- insert failed with a 500. A full unique index behaves the same for rows without a key (NULLs never
-- clash in a unique index) and ON CONFLICT can use it.
create unique index if not exists content_client_idempotency_key_full_uidx
  on public.content (client_id, generation_idempotency_key);
drop index if exists public.content_client_idempotency_key_uidx;
