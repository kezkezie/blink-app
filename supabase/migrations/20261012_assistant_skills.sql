-- Ask BlinkSpot skills an account adds itself (2026-10-12). Built-in skills live in code
-- (src/lib/assistant/skills.ts). Owners read their own; only the server writes (it enforces the
-- size and count limits and fetches imported files safely).
create table if not exists public.assistant_skills (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 300),
  body text not null check (char_length(body) between 1 and 20000),
  source_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug)
);
alter table public.assistant_skills enable row level security;
drop policy if exists assistant_skills_owner_read on public.assistant_skills;
create policy assistant_skills_owner_read on public.assistant_skills for select to authenticated
  using (exists (select 1 from public.clients c where c.id = assistant_skills.client_id and c.user_id = (select auth.uid())));
