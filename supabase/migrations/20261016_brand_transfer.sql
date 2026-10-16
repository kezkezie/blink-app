-- Hand a whole brand to another account (Kezie, 2026-10-16: "if they've built something from
-- scratch and it's looking nice, can I transfer the whole brand to another account completely, and
-- then it uses their credits"). The owner offers it to an email; that person accepts with the link
-- signed in with that email. The brand and everything made for it move to their workspace in one
-- step. Past credit history stays with the old owner; from then on the new owner pays.
-- Social connections stay with the old owner (switched off for this brand: the new owner connects
-- their own), existing shares end (nobody spends the new owner's credits without their say), and
-- the old owner can stay on as an editor. Server only.

create table if not exists public.brand_transfers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brand_profiles(id) on delete cascade,
  from_client uuid not null references public.clients(id) on delete cascade,
  to_email text not null,
  token text not null unique check (char_length(token) >= 32),
  keep_access boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists brand_transfers_brand on public.brand_transfers (brand_id);
create index if not exists brand_transfers_email on public.brand_transfers (to_email);
alter table public.brand_transfers enable row level security;

create or replace function public.transfer_brand(p_brand uuid, p_from uuid, p_to uuid, p_old_owner uuid, p_new_owner uuid, p_keep_access boolean)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_scheduled integer;
  v_posts integer;
begin
  if p_from = p_to then raise exception 'same workspace'; end if;
  perform 1 from public.brand_profiles where id = p_brand and client_id = p_from and is_active for update;
  if not found then raise exception 'brand not found'; end if;
  -- Scheduled posts would publish through the old owner's accounts: they come off the calendar first.
  select count(*) into v_scheduled from public.content
   where brand_id = p_brand and client_id = p_from and (status = 'scheduled' or scheduled_at > now());
  if v_scheduled > 0 then raise exception 'scheduled posts: %', v_scheduled; end if;

  update public.brand_profiles set client_id = p_to, updated_at = now() where id = p_brand;
  update public.content set client_id = p_to where brand_id = p_brand and client_id = p_from;
  get diagnostics v_posts = row_count;
  update public.products set client_id = p_to where brand_id = p_brand and client_id = p_from;
  update public.faqs set client_id = p_to where brand_id = p_brand and client_id = p_from;
  update public.sites set client_id = p_to where brand_id = p_brand and client_id = p_from;
  update public.upscale_jobs set client_id = p_to where brand_id = p_brand and client_id = p_from;
  update public.social_accounts set is_active = false where brand_id = p_brand and client_id = p_from;
  delete from public.brand_members where brand_id = p_brand;
  update public.brand_invites set revoked_at = now() where brand_id = p_brand and accepted_at is null and revoked_at is null;
  if p_keep_access then
    insert into public.brand_members (brand_id, user_id, role, invited_by) values (p_brand, p_old_owner, 'editor', p_new_owner)
    on conflict (brand_id, user_id) do update set role = 'editor', access_until = null;
  end if;
  return json_build_object('posts', v_posts);
end $$;

revoke execute on function public.transfer_brand(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.transfer_brand(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;
