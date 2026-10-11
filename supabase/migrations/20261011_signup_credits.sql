-- One-time welcome credits (Kezie, 2026-10-11: free users get 100 credits once at sign-up, not every
-- month). Before this nothing granted any credits: real sign-ups started at 0 while the pricing
-- page promised 100 a month.
--
-- * signup_grants records one grant per auth user. Users can't read or write it (RLS, no policies),
--   so deleting and re-creating a client row can't earn a second grant.
-- * grant_signup_credits() fires after a client row is inserted (the browser creates it on first
--   sign-in, see useClient) and credits the first client of each user only.
-- * Browser sessions can no longer DELETE their client row (nothing in the app needs it; account
--   deletion is a server job), which also closed the delete/re-create path.

create table if not exists public.signup_grants (
  user_id uuid primary key,
  client_id uuid,
  amount integer not null,
  granted_at timestamptz not null default now()
);
alter table public.signup_grants enable row level security;
revoke all on public.signup_grants from anon, authenticated;

create or replace function public.grant_signup_credits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount constant integer := 100;
  v_balance integer;
begin
  if new.user_id is null then return new; end if;
  insert into public.signup_grants (user_id, client_id, amount) values (new.user_id, new.id, v_amount)
    on conflict (user_id) do nothing;
  if not found then return new; end if;

  insert into public.credit_balances (client_id, balance, lifetime_earned, lifetime_spent)
    values (new.id, v_amount, v_amount, 0)
    on conflict (client_id) do update
      set balance = public.credit_balances.balance + v_amount,
          lifetime_earned = public.credit_balances.lifetime_earned + v_amount,
          updated_at = now()
    returning balance into v_balance;
  insert into public.credit_transactions (client_id, amount, balance_after, operation, description)
    values (new.id, v_amount, v_balance, 'signup_bonus', 'Welcome credits (one time)');
  return new;
end $$;
revoke execute on function public.grant_signup_credits() from public, anon, authenticated;

drop trigger if exists grant_signup_credits on public.clients;
create trigger grant_signup_credits after insert on public.clients
  for each row execute function public.grant_signup_credits();

-- Client rows: read, create and update your own; no delete from the browser.
drop policy if exists "Users see own client" on public.clients;
create policy "Users read own client" on public.clients for select to authenticated using (user_id = auth.uid());
create policy "Users create own client" on public.clients for insert to authenticated with check (user_id = auth.uid());
create policy "Users update own client" on public.clients for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Backfill. Free-plan people who signed up and never got credits get their 100 now; every existing
-- user is recorded as granted (amount 0 if they already had a balance) so nobody gets it twice.
with owed as (
  select c.id, c.user_id
  from public.clients c
  left join public.credit_balances b on b.client_id = c.id
  where b.client_id is null and c.user_id is not null and c.plan_tier = 'free'
    and c.company_name not ilike 'test%'
    and coalesce(c.contact_email, '') not ilike '%test%'
    and coalesce(c.contact_email, '') not ilike '%e2e%'
    and coalesce(c.contact_email, '') not ilike '%.local'
),
granted as (
  insert into public.signup_grants (user_id, client_id, amount)
  select user_id, id, 100 from owed
  on conflict (user_id) do nothing
  returning user_id, client_id
),
balances as (
  insert into public.credit_balances (client_id, balance, lifetime_earned, lifetime_spent)
  select client_id, 100, 100, 0 from granted
  on conflict (client_id) do nothing
  returning client_id
)
insert into public.credit_transactions (client_id, amount, balance_after, operation, description)
select client_id, 100, 100, 'signup_bonus', 'Welcome credits (one time, backfilled 2026-10-11)' from balances;

insert into public.signup_grants (user_id, client_id, amount)
select distinct on (c.user_id) c.user_id, c.id, 0
from public.clients c
where c.user_id is not null
order by c.user_id, c.created_at
on conflict (user_id) do nothing;
