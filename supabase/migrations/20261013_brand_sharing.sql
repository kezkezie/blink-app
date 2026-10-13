-- Shared brands (Kezie, 2026-10-13: "two people working on one brand at the same time").
-- A brand's owner invites people by link or email. Editors can make, edit and schedule for that
-- brand, using the owner's workspace (its credits, its brand slot); viewers can only look. A member
-- sees that brand and its posts and nothing else of the owner's account. All writes to these tables
-- go through the server; the browser only reads.

create table if not exists public.brand_members (
  brand_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
create index if not exists brand_members_user on public.brand_members (user_id);

create table if not exists public.brand_invites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand_profiles(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  email text,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists brand_invites_brand on public.brand_invites (brand_id);

-- Only ever about the caller's own memberships, so they're safe to call from policies.
create or replace function public.my_shared_brand_ids(p_editor boolean default false)
returns setof uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select m.brand_id from public.brand_members m
  where m.user_id = auth.uid() and (not p_editor or m.role = 'editor')
$$;

create or replace function public.my_shared_client_ids(p_editor boolean default false)
returns setof uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select distinct b.client_id from public.brand_members m join public.brand_profiles b on b.id = m.brand_id
  where m.user_id = auth.uid() and (not p_editor or m.role = 'editor')
$$;

-- The owner's workspace of a brand the caller owns or is an editor of (null otherwise).
create or replace function public.shared_brand_client(p_brand uuid)
returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select b.client_id from public.brand_profiles b
  where b.id = p_brand and (
    exists (select 1 from public.clients c where c.id = b.client_id and c.user_id = auth.uid())
    or exists (select 1 from public.brand_members m where m.brand_id = b.id and m.user_id = auth.uid() and m.role = 'editor')
  )
$$;

revoke execute on function public.my_shared_brand_ids(boolean) from public, anon;
revoke execute on function public.my_shared_client_ids(boolean) from public, anon;
revoke execute on function public.shared_brand_client(uuid) from public, anon;
grant execute on function public.my_shared_brand_ids(boolean) to authenticated;
grant execute on function public.my_shared_client_ids(boolean) to authenticated;
grant execute on function public.shared_brand_client(uuid) to authenticated;

alter table public.brand_members enable row level security;
alter table public.brand_invites enable row level security;
-- Members see their own membership; owners see who is on their brands. Invites: server only.
drop policy if exists brand_members_read on public.brand_members;
create policy brand_members_read on public.brand_members for select to authenticated using (
  user_id = (select auth.uid())
  or brand_id in (select bp.id from public.brand_profiles bp join public.clients c on c.id = bp.client_id where c.user_id = (select auth.uid()))
);

-- Shared brands: members can read the brand.
drop policy if exists brand_profiles_member_read on public.brand_profiles;
create policy brand_profiles_member_read on public.brand_profiles for select to authenticated
  using (id in (select public.my_shared_brand_ids()));

-- Posts of a shared brand: members read; editors write, always inside the owner's workspace.
drop policy if exists content_member_read on public.content;
create policy content_member_read on public.content for select to authenticated
  using (brand_id in (select public.my_shared_brand_ids()) and client_id in (select public.my_shared_client_ids()));
drop policy if exists content_editor_insert on public.content;
create policy content_editor_insert on public.content for insert to authenticated
  with check (brand_id in (select public.my_shared_brand_ids(true)) and client_id = public.shared_brand_client(brand_id));
drop policy if exists content_editor_update on public.content;
create policy content_editor_update on public.content for update to authenticated
  using (brand_id in (select public.my_shared_brand_ids(true)) and client_id = public.shared_brand_client(brand_id))
  with check (brand_id in (select public.my_shared_brand_ids(true)) and client_id = public.shared_brand_client(brand_id));
drop policy if exists content_editor_delete on public.content;
create policy content_editor_delete on public.content for delete to authenticated
  using (brand_id in (select public.my_shared_brand_ids(true)) and client_id = public.shared_brand_client(brand_id));

-- social_accounts stays owner-only (it holds page tokens). Owners and members get the brand's connected
-- platforms, without tokens, from this.
drop policy if exists social_accounts_member_read on public.social_accounts;
create or replace function public.brand_platforms(p_brand uuid)
returns table (platform text, account_name text) language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select s.platform, s.account_name from public.social_accounts s join public.brand_profiles b on b.id = s.brand_id
  where s.brand_id = p_brand and s.client_id = b.client_id and s.is_active and (
    exists (select 1 from public.clients c where c.id = b.client_id and c.user_id = auth.uid())
    or exists (select 1 from public.brand_members m where m.brand_id = b.id and m.user_id = auth.uid())
  )
  order by s.connected_at
$$;
revoke execute on function public.brand_platforms(uuid) from public, anon;
grant execute on function public.brand_platforms(uuid) to authenticated;

-- Editors spend the workspace's credits, so they can see its balance (not its transactions).
drop policy if exists credit_balances_editor_read on public.credit_balances;
create policy credit_balances_editor_read on public.credit_balances for select to authenticated
  using (client_id in (select public.my_shared_client_ids(true)));

-- Uploads: editors may also use the shared brand's folders and the owner workspace's folders.
drop policy if exists "Users upload into their own folders" on storage.objects;
create policy "Users upload into their own folders" on storage.objects for insert to authenticated with check (
  bucket_id = 'assets'
  and (storage.foldername(name))[1] = any (array['images', 'videos', 'brands', 'edits', 'uploads', 'references'])
  and (
    (storage.foldername(name))[2] = (auth.uid())::text
    or (storage.foldername(name))[2] in (select (clients.id)::text from public.clients where clients.user_id = auth.uid())
    or (storage.foldername(name))[2] in (select (bp.id)::text from public.brand_profiles bp join public.clients c on c.id = bp.client_id where c.user_id = auth.uid())
    or (storage.foldername(name))[2] in (select id::text from public.my_shared_brand_ids(true) as id)
    or (storage.foldername(name))[2] in (select id::text from public.my_shared_client_ids(true) as id)
  )
);

-- The brands shared with the caller, for the brand switcher (with the owner's display name only).
create or replace function public.my_shared_brands()
returns table (id uuid, brand_name text, logo_url text, client_id uuid, role text, owner_name text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select b.id, b.brand_name, b.logo_url, b.client_id, m.role,
         coalesce(nullif(trim(c.contact_name), ''), nullif(trim(c.company_name), ''), 'the owner')
  from public.brand_members m
  join public.brand_profiles b on b.id = m.brand_id and b.is_active
  join public.clients c on c.id = b.client_id
  where m.user_id = auth.uid()
  order by m.created_at
$$;
revoke execute on function public.my_shared_brands() from public, anon;
grant execute on function public.my_shared_brands() to authenticated;
