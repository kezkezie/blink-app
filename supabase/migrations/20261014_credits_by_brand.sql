-- Credits by brand (Kezie, 2026-10-14: "we need to know how much a brand would have taken in terms
-- of credits"). Every ledger line can name its brand. The credit functions take an optional
-- p_brand_id (old calls keep working), image jobs take it from their post, and a trigger fills it
-- in from a post id in the description ("[vid:<id>]") and drops a brand from another workspace.

alter table public.credit_transactions add column if not exists brand_id uuid references public.brand_profiles(id) on delete set null;
create index if not exists credit_transactions_client_brand on public.credit_transactions (client_id, brand_id, created_at desc);

create or replace function public.credit_transaction_brand()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_post uuid;
begin
  if new.brand_id is null and new.description ~* '\[(vid|post|img):[0-9a-f-]{36}\]' then
    begin
      v_post := (regexp_match(new.description, '\[(?:vid|post|img):([0-9a-fA-F-]{36})\]'))[1]::uuid;
      select brand_id into new.brand_id from public.content where id = v_post and client_id = new.client_id;
    exception when others then new.brand_id := null;
    end;
  end if;
  -- Only a brand of the same workspace.
  if new.brand_id is not null and not exists (select 1 from public.brand_profiles where id = new.brand_id and client_id = new.client_id) then
    new.brand_id := null;
  end if;
  return new;
end $$;
drop trigger if exists credit_transaction_brand on public.credit_transactions;
create trigger credit_transaction_brand before insert on public.credit_transactions for each row execute function public.credit_transaction_brand();

-- The same functions, now with an optional brand (named-argument callers without it still match).
drop function if exists public.deduct_credits(uuid, integer, text, text);
create function public.deduct_credits(p_client_id uuid, p_amount integer, p_operation text, p_description text, p_brand_id uuid default null)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  actual_client_id uuid;
  current_balance integer;
begin
  -- SMART CHECK: Determine if the ID passed is a user_id or a client_id, and grab the real client_id
  select id into actual_client_id from public.clients where user_id = p_client_id or id = p_client_id limit 1;
  if actual_client_id is null then
    return json_build_object('success', false, 'error', 'No client profile found for this ID.');
  end if;
  select balance into current_balance from public.credit_balances where client_id = actual_client_id for update;
  if current_balance is null then
    return json_build_object('success', false, 'error', 'No credit balance account found for this user.');
  end if;
  if current_balance < p_amount then
    return json_build_object('success', false, 'error', 'Insufficient credits.');
  end if;
  update public.credit_balances
  set balance = balance - p_amount, lifetime_spent = lifetime_spent + p_amount, updated_at = now()
  where client_id = actual_client_id;
  insert into public.credit_transactions (client_id, amount, balance_after, operation, description, brand_id)
  values (actual_client_id, -p_amount, current_balance - p_amount, p_operation, p_description, p_brand_id);
  return json_build_object('success', true);
end $$;

drop function if exists public.refund_credits(uuid, integer, text, text);
create function public.refund_credits(p_client_id uuid, p_amount integer, p_operation text, p_description text, p_brand_id uuid default null)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  actual_client_id uuid;
  current_balance integer;
begin
  select id into actual_client_id from public.clients where user_id = p_client_id or id = p_client_id limit 1;
  if actual_client_id is null then
    return json_build_object('success', false, 'error', 'No client profile found for this ID.');
  end if;
  select balance into current_balance from public.credit_balances where client_id = actual_client_id for update;
  if current_balance is null then
    return json_build_object('success', false, 'error', 'No credit balance account found for this user.');
  end if;
  update public.credit_balances
  set balance = balance + p_amount, lifetime_spent = lifetime_spent - p_amount, updated_at = now()
  where client_id = actual_client_id;
  insert into public.credit_transactions (client_id, amount, balance_after, operation, description, brand_id)
  values (actual_client_id, p_amount, current_balance + p_amount, p_operation, p_description, p_brand_id);
  return json_build_object('success', true);
end $$;

drop function if exists public.process_image_generation_billing(uuid, integer);
create function public.process_image_generation_billing(user_id_param uuid, cost_param integer, brand_id_param uuid default null)
returns json language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  current_balance int;
  new_balance int;
begin
  select balance into current_balance from public.credit_balances where client_id = user_id_param for update;
  if current_balance is null then
    return json_build_object('success', false, 'message', 'No credit balance found for this user.');
  end if;
  if current_balance < cost_param then
    return json_build_object('success', false, 'message', 'Insufficient credits. Please upgrade your plan or buy a top-up.');
  end if;
  new_balance := current_balance - cost_param;
  update public.credit_balances
  set balance = new_balance, lifetime_spent = lifetime_spent + cost_param, updated_at = now()
  where client_id = user_id_param;
  insert into public.credit_transactions (client_id, amount, balance_after, operation, description, brand_id)
  values (user_id_param, -cost_param, new_balance, 'debit', 'AI Image Generation (' || cost_param || ' credits)', brand_id_param);
  return json_build_object('success', true, 'new_balance', new_balance);
end $$;

-- Server-only, like every other credit function (this one was callable with the public key).
revoke execute on function public.deduct_credits(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.process_image_generation_billing(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.credit_transaction_brand() from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.refund_credits(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.process_image_generation_billing(uuid, integer, uuid) to service_role;

-- Image jobs: the charge and its refund carry the post's brand.
do $$
declare d text;
begin
  select pg_get_functiondef('public.claim_and_charge_image_generation(uuid, uuid, text, integer)'::regprocedure) into d;
  d := replace(d, 'INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
    VALUES (p_client_id, -v_cost, v_balance, ''image_generation'', ''Image generation charge'')',
    'INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description, brand_id)
    VALUES (p_client_id, -v_cost, v_balance, ''image_generation'', ''Image generation charge'', v_row.brand_id)');
  if position('v_row.brand_id)' in d) = 0 then raise exception 'claim_and_charge_image_generation not as expected'; end if;
  execute d;
  select pg_get_functiondef('public.claim_and_refund_image_generation(uuid, uuid, text, text, text)'::regprocedure) into d;
  d := replace(d, 'INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
    VALUES (p_client_id, v_charge, v_balance, ''refund'', ''Image generation refund'')',
    'INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description, brand_id)
    VALUES (p_client_id, v_charge, v_balance, ''refund'', ''Image generation refund'', v_row.brand_id)');
  if position('v_row.brand_id)' in d) = 0 then raise exception 'claim_and_refund_image_generation not as expected'; end if;
  execute d;
end $$;
