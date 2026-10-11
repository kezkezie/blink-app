-- Published pages keep their own copy (2026-10-11). The public page used to read `spec`, the copy the
-- builder autosaves to, so every edit went live a second later although the Publish dialog says
-- changes go live when you press Publish again. Publish now copies spec -> published_spec.
alter table public.sites add column if not exists published_spec jsonb;
update public.sites set published_spec = spec where published and published_spec is null;
