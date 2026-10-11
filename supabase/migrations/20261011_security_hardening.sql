-- Security hardening (2026-10-11), from the Supabase security advisor plus a policy review.
-- Server code (service role) and n8n (the "BlinkSpot Supabase Secret" credential) bypass RLS and
-- keep their function grants, so they are unaffected. Verified first: no browser code calls the
-- credit functions or reads the six tables below; every n8n call uses the secret credential.

-- 1. Credit functions: anyone with the public anon key could call refund_credits and mint credits.
revoke execute on function public.deduct_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.downgrade_expired_subscriptions() from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, text) to service_role;
grant execute on function public.refund_credits(uuid, integer, text, text) to service_role;
grant execute on function public.downgrade_expired_subscriptions() to service_role;

-- 2. Credit tables had a "service role full access" policy granted to PUBLIC with USING (true):
--    every user could read and rewrite every balance. The service role does not need a policy.
--    The users' read policy compared client_id to auth.uid() (wrong id); fixed to "my account".
drop policy if exists "Service role full access to credit_balances" on public.credit_balances;
drop policy if exists "Users can view own credit balance" on public.credit_balances;
create policy "Users read own credit balance" on public.credit_balances for select to authenticated
  using (client_id in (select id from public.clients where user_id = auth.uid()));
drop policy if exists "Service role full access to credit_transactions" on public.credit_transactions;
drop policy if exists "Users can view own credit transactions" on public.credit_transactions;
create policy "Users read own credit transactions" on public.credit_transactions for select to authenticated
  using (client_id in (select id from public.clients where user_id = auth.uid()));

-- 3. Tables that had no RLS at all (server-only today).
alter table public.content_schedule enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.analytics enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.waitlist enable row level security;

-- 4. Users may edit their own clients row (name, email, phone) but never their plan or billing.
--    The browser inserts its own row on first visit (useClient) and updates contact fields.
create or replace function public.protect_client_billing_fields() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan_tier := 'free';
      new.billing_status := 'trial';
      new.current_period_end := null;
      new.monthly_fee := null;
    else
      new.plan_tier := old.plan_tier;
      new.billing_status := old.billing_status;
      new.billing_cycle := old.billing_cycle;
      new.current_period_end := old.current_period_end;
      new.monthly_fee := old.monthly_fee;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_client_billing_fields on public.clients;
create trigger protect_client_billing_fields before insert or update on public.clients
  for each row execute function public.protect_client_billing_fields();

-- 5. Storage: anyone (even signed out) could upload anywhere in the assets bucket, including into
--    another account's folder, which the app trusts as that account's files. Now: signed-in users,
--    into a known top folder, under their own account id, one of their brand ids, or their user id.
drop policy if exists "Allow public uploads to assets bucket" on storage.objects;
create policy "Users upload into their own folders" on storage.objects for insert to authenticated
with check (
  bucket_id = 'assets'
  and (storage.foldername(name))[1] in ('images', 'videos', 'brands', 'edits', 'uploads', 'references')
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[2] in (select id::text from public.clients where user_id = auth.uid())
    or (storage.foldername(name))[2] in (select bp.id::text from public.brand_profiles bp join public.clients c on c.id = bp.client_id where c.user_id = auth.uid())
  )
);

-- 6. Pin search_path on functions (advisor: role mutable search_path).
alter function public.downgrade_expired_subscriptions() set search_path = public, pg_temp;
alter function public.refund_credits(uuid, integer, text, text) set search_path = public, pg_temp;
alter function public.deduct_credits(uuid, integer, text, text) set search_path = public, pg_temp;
alter function public.is_valid_image_generation_cost(integer) set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;
alter function public.process_image_generation_billing(uuid, integer) set search_path = public, pg_temp;
