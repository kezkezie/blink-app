-- How long a shared brand stays shared (Kezie, 2026-10-16: "a timeline that we can manually put,
-- from fourteen days, a year, or whatever custom dates"). The owner picks it per person; null is no
-- end. Expired access counts as no access everywhere access is decided: these functions (used by
-- the RLS policies on brands, posts, credits and storage) and the server's brandAccess.

alter table public.brand_members add column if not exists access_until timestamptz;
alter table public.brand_invites add column if not exists access_until timestamptz;

create or replace function public.my_shared_brand_ids(p_editor boolean default false)
returns setof uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select m.brand_id from public.brand_members m
  where m.user_id = auth.uid() and (not p_editor or m.role = 'editor')
    and (m.access_until is null or m.access_until > now())
$$;

create or replace function public.my_shared_client_ids(p_editor boolean default false)
returns setof uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select distinct b.client_id from public.brand_members m join public.brand_profiles b on b.id = m.brand_id
  where m.user_id = auth.uid() and (not p_editor or m.role = 'editor')
    and (m.access_until is null or m.access_until > now())
$$;

create or replace function public.shared_brand_client(p_brand uuid)
returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select b.client_id from public.brand_profiles b
  where b.id = p_brand and (
    exists (select 1 from public.clients c where c.id = b.client_id and c.user_id = auth.uid())
    or exists (select 1 from public.brand_members m where m.brand_id = b.id and m.user_id = auth.uid() and m.role = 'editor'
               and (m.access_until is null or m.access_until > now()))
  )
$$;

create or replace function public.brand_platforms(p_brand uuid)
returns table (platform text, account_name text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select s.platform, s.account_name from public.social_accounts s join public.brand_profiles b on b.id = s.brand_id
  where s.brand_id = p_brand and s.client_id = b.client_id and s.is_active and (
    exists (select 1 from public.clients c where c.id = b.client_id and c.user_id = auth.uid())
    or exists (select 1 from public.brand_members m where m.brand_id = b.id and m.user_id = auth.uid()
               and (m.access_until is null or m.access_until > now()))
  )
  order by s.connected_at
$$;

-- The switcher's list, now with when access ends (the return type changes, so it is recreated).
drop function if exists public.my_shared_brands();
create function public.my_shared_brands()
returns table (id uuid, brand_name text, logo_url text, client_id uuid, role text, owner_name text, access_until timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select b.id, b.brand_name, b.logo_url, b.client_id, m.role,
         coalesce(nullif(trim(c.contact_name), ''), nullif(trim(c.company_name), ''), 'the owner'),
         m.access_until
  from public.brand_members m
  join public.brand_profiles b on b.id = m.brand_id and b.is_active
  join public.clients c on c.id = b.client_id
  where m.user_id = auth.uid() and (m.access_until is null or m.access_until > now())
  order by m.created_at
$$;
revoke execute on function public.my_shared_brands() from public, anon;
grant execute on function public.my_shared_brands() to authenticated;
