-- Online payments (2026-10-12). Kezie chose PayZephyr, which is a Laravel package over Paystack,
-- Flutterwave, Stripe and others; BlinkSpot is Next.js, so the same idea lives in src/lib/payments
-- (one provider interface, Paystack first, signed webhooks, no double crediting).
--
-- A payment row is written by the server before checkout and fulfilled once, by whichever comes
-- first: the redirect back (verify) or the provider's webhook. fulfill_payment locks the row, so a
-- second call is a no-op. Renewals of a plan arrive as new references and get their own row.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null default 'paystack',
  kind text not null check (kind in ('credit_pack', 'plan')),
  item text not null,
  credits integer not null default 0 check (credits >= 0),
  plan_tier text check (plan_tier in ('starter', 'pro', 'agency')),
  billing_cycle text check (billing_cycle in ('monthly', 'weekly')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  reference text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  failure text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, reference)
);
create index if not exists payments_client_created on public.payments (client_id, created_at desc);

alter table public.payments enable row level security;
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments for select to authenticated
  using (exists (select 1 from public.clients c where c.id = payments.client_id and c.user_id = (select auth.uid())));
-- No insert/update/delete policies: only the server (service role) writes payments.

-- Who the provider knows this account as, for renewals and the "manage subscription" link.
alter table public.clients
  add column if not exists billing_provider text,
  add column if not exists billing_customer_code text,
  add column if not exists billing_subscription_code text;

-- The browser must not be able to set these either (extends the 2026-10-11 trigger).
create or replace function public.protect_client_billing_fields()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan_tier := 'free';
      new.billing_status := 'trial';
      new.current_period_end := null;
      new.monthly_fee := null;
      new.billing_provider := null;
      new.billing_customer_code := null;
      new.billing_subscription_code := null;
    else
      new.plan_tier := old.plan_tier;
      new.billing_status := old.billing_status;
      new.billing_cycle := old.billing_cycle;
      new.current_period_end := old.current_period_end;
      new.monthly_fee := old.monthly_fee;
      new.user_id := old.user_id;
      new.billing_provider := old.billing_provider;
      new.billing_customer_code := old.billing_customer_code;
      new.billing_subscription_code := old.billing_subscription_code;
    end if;
  end if;
  return new;
end $$;

-- Grant what a payment bought, exactly once. The amount and currency the provider reports must
-- match what we asked for, or nothing is granted.
create or replace function public.fulfill_payment(
  p_provider text, p_reference text, p_amount_minor bigint, p_currency text, p_payload jsonb,
  p_period_end timestamptz default null, p_customer_code text default null, p_subscription_code text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  pay public.payments%rowtype;
  new_balance integer;
begin
  select * into pay from public.payments where provider = p_provider and reference = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_reference'); end if;
  if pay.status = 'paid' then return jsonb_build_object('ok', true, 'already', true, 'credits', pay.credits, 'kind', pay.kind); end if;
  if pay.amount_minor <> p_amount_minor or upper(pay.currency) <> upper(p_currency) then
    update public.payments set status = 'failed', failure = 'amount_mismatch', provider_payload = p_payload where id = pay.id;
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  update public.payments set status = 'paid', paid_at = now(), provider_payload = p_payload, failure = null where id = pay.id;

  if pay.credits > 0 then
    insert into public.credit_balances (client_id, balance, lifetime_earned, lifetime_spent, updated_at)
      values (pay.client_id, 0, 0, 0, now()) on conflict (client_id) do nothing;
    update public.credit_balances
      set balance = balance + pay.credits, lifetime_earned = lifetime_earned + pay.credits, updated_at = now()
      where client_id = pay.client_id
      returning balance into new_balance;
    insert into public.credit_transactions (client_id, amount, balance_after, operation, description)
      values (pay.client_id, pay.credits, new_balance, 'purchase',
        case when pay.kind = 'plan' then initcap(pay.plan_tier) || ' plan credits (' || pay.billing_cycle || ')' else 'Bought ' || pay.credits || ' credits' end);
  end if;

  if pay.kind = 'plan' then
    update public.clients set
      plan_tier = pay.plan_tier,
      billing_status = 'active',
      billing_cycle = pay.billing_cycle,
      -- Two days' grace past the next charge, so a renewal retry doesn't downgrade anyone overnight.
      current_period_end = coalesce(p_period_end, now() + case when pay.billing_cycle = 'weekly' then interval '7 days' else interval '1 month' end) + interval '2 days',
      monthly_fee = round(pay.amount_minor / 100.0, 2),
      billing_provider = p_provider,
      billing_customer_code = coalesce(p_customer_code, billing_customer_code),
      billing_subscription_code = coalesce(p_subscription_code, billing_subscription_code),
      updated_at = now()
    where id = pay.client_id;
  end if;

  return jsonb_build_object('ok', true, 'credits', pay.credits, 'kind', pay.kind);
end $$;

revoke execute on function public.fulfill_payment(text, text, bigint, text, jsonb, timestamptz, text, text) from public, anon, authenticated;

-- (applied as 20261012_payments_email) The checkout email, so a subscription event that arrives
-- before its first charge can still be matched to the account.
alter table public.payments add column if not exists customer_email text;
create index if not exists payments_plan_email on public.payments (lower(customer_email), created_at desc) where kind = 'plan';

-- (applied as 20261012_payments_replaces) The subscription a plan purchase replaces, recorded at
-- checkout, so switching plans stops exactly the old one once the new one is paid.
alter table public.payments add column if not exists replaces_subscription text;
