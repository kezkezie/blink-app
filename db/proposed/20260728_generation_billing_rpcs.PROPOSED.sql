-- ============================================================================
-- PROPOSED MIGRATION — Slice 5 atomic image-generation billing (rev-4)
-- ============================================================================
-- STATUS: PLANNING / LOCAL-ONLY. NOT APPLIED to any remote database.
-- This file lives OUTSIDE supabase/migrations on purpose so `supabase db push`
-- cannot pick it up. Applying it to production requires the explicit gates in
-- Kezie-OS/projects/blinkspot/slice-5-live-async-preflight.md (§16, Gates 1-2).
--
-- Prerequisite (Gate 0, app-side, already implemented in this increment):
--   content.credit_cost is persisted at placeholder creation from the server-owned
--   pricing registry (src/lib/image-engine-pricing.ts). claim_and_charge requires
--   it non-null and charges exactly that stored value.
--
-- Additive only: one helper fn + one ledger table + two billing fns + grants.
-- Touches no existing table/column/function. Verify locally with
-- db/proposed/harness/run_billing_harness.sh before proposing application.
-- ============================================================================

-- Defense-in-depth ONLY — NOT the source of truth. If retained, this list must be
-- GENERATED from / kept in sync with the shared price registry (a drift test in the
-- harness fails if app registry, this list, and the n8n cost map diverge). It can
-- never substitute for `p_amount = content.credit_cost`.
CREATE OR REPLACE FUNCTION public.is_valid_image_generation_cost(p_amount integer)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_amount IS NOT NULL AND p_amount = ANY (ARRAY[1,2,5,6,8,15]);  -- registry-generated
$$;

CREATE TABLE IF NOT EXISTS public.generation_billing_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Immutable audit SNAPSHOTS (never nulled): the financial record of who/what.
  client_id_snapshot  uuid NOT NULL,
  content_id_snapshot uuid NOT NULL,
  idempotency_key text NOT NULL,
  operation       text NOT NULL CHECK (operation IN ('charge','refund')),
  amount          integer NOT NULL CHECK (amount > 0),
  credit_txn_id   uuid,                       -- audit ref; no cascade
  -- Live parent FKs for convenience JOINs, nulled (not cascaded) on deletion so the
  -- financial evidence in the snapshot columns survives content/client removal.
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  content_id      uuid REFERENCES public.content(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Exactly-once guarantees keyed on the IMMUTABLE snapshots (stable post-deletion).
  CONSTRAINT gbl_content_op_uniq UNIQUE (content_id_snapshot, operation),
  CONSTRAINT gbl_key_op_uniq     UNIQUE (client_id_snapshot, idempotency_key, operation)
);
CREATE INDEX IF NOT EXISTS gbl_content_snapshot_idx
  ON public.generation_billing_ledger (content_id_snapshot);

-- Financial audit data: RLS ON and access is SERVICE-ROLE ONLY. Browser roles get NO
-- direct SELECT on raw ledger rows (they contain idempotency keys + txn ids). If a
-- user-facing billing history is ever required, expose a SANITIZED VIEW (no
-- idempotency_key / credit_txn_id) with its own owner policy — not the raw table.
ALTER TABLE public.generation_billing_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.generation_billing_ledger FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.generation_billing_ledger TO service_role;
-- No policies for anon/authenticated → with RLS on and no grant, browser roles see nothing.

-- outcome ∈ charged | replayed | insufficient_credits | not_found | invalid_key | invalid_amount | invalid_state
-- Every return (including replay) reports the ACTUAL current durable row state.
CREATE OR REPLACE FUNCTION public.claim_and_charge_image_generation(
  p_client_id       uuid,
  p_content_id      uuid,
  p_idempotency_key text,
  p_amount          integer
) RETURNS TABLE (outcome text, charged boolean, new_balance integer,
                 generation_state text, billing_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row     public.content%ROWTYPE;
  v_balance integer;
  v_txn_id  uuid;
  v_cost    integer;
BEGIN
  -- 1. Lock the OWNED placeholder (ownership enforced in-txn).
  SELECT * INTO v_row FROM public.content
    WHERE id = p_content_id AND client_id = p_client_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, NULL::int, NULL::text, NULL::text; RETURN;
  END IF;

  -- 2. Bind the supplied key to the owned row's stored key.
  IF v_row.generation_idempotency_key IS NULL
     OR v_row.generation_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RETURN QUERY SELECT 'invalid_key', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 3. If a charge already exists for THIS content row → truthful replay (actual state).
  IF EXISTS (SELECT 1 FROM public.generation_billing_ledger
               WHERE content_id_snapshot = p_content_id AND client_id_snapshot = p_client_id
                 AND idempotency_key = p_idempotency_key AND operation = 'charge') THEN
    RETURN QUERY SELECT 'replayed', false,
      (SELECT balance FROM public.credit_balances WHERE client_id = p_client_id),
      v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 4. Expected-state predicate (no charge ledger yet, so must be a fresh placeholder).
  IF v_row.generation_state IS DISTINCT FROM 'queued'
     OR v_row.billing_state IS DISTINCT FROM 'not_charged' THEN
    RETURN QUERY SELECT 'invalid_state', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 5. AUTHORITATIVE cost: the row MUST carry a server-derived credit_cost, and the
  --    caller's p_amount is only a checked assertion against it. The stored cost —
  --    not the browser number, not the allowlist — governs what is charged.
  v_cost := v_row.credit_cost;
  IF v_cost IS NULL OR v_cost <= 0
     OR p_amount IS DISTINCT FROM v_cost
     OR NOT public.is_valid_image_generation_cost(v_cost) THEN  -- registry sanity (defense-in-depth)
    RETURN QUERY SELECT 'invalid_amount', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 6. Deduct the STORED cost with a balance check (same txn as row + ledger writes).
  INSERT INTO public.credit_balances (client_id) VALUES (p_client_id)
    ON CONFLICT (client_id) DO NOTHING;
  UPDATE public.credit_balances
     SET balance = balance - v_cost,
         lifetime_spent = lifetime_spent + v_cost,
         updated_at = now()
   WHERE client_id = p_client_id AND balance >= v_cost
   RETURNING balance INTO v_balance;
  IF NOT FOUND THEN
    UPDATE public.content
       SET generation_state = 'failed', billing_state = 'not_charged',
           retry_state = 'retry_available',
           generation_error_code = 'insufficient_credits',
           generation_status_text = 'Insufficient credits', updated_at = now()
     WHERE id = p_content_id;
    RETURN QUERY SELECT 'insufficient_credits', false,
      (SELECT balance FROM public.credit_balances WHERE client_id = p_client_id),
      'failed', 'not_charged'; RETURN;
  END IF;

  -- 7. Audit txn + ledger (plain INSERTs: the FOR UPDATE lock already serialized this
  --    content row, so a unique_violation here signals genuine corruption and MUST
  --    propagate/roll back — it is NOT swallowed as a replay). Snapshots = live ids.
  INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
    VALUES (p_client_id, -v_cost, v_balance, 'image_generation', 'Image generation charge')
    RETURNING id INTO v_txn_id;
  INSERT INTO public.generation_billing_ledger
    (client_id_snapshot, content_id_snapshot, idempotency_key, operation, amount,
     credit_txn_id, client_id, content_id)
    VALUES (p_client_id, p_content_id, p_idempotency_key, 'charge', v_cost,
            v_txn_id, p_client_id, p_content_id);

  -- 8. Job-row transition in the SAME transaction (credit_cost already set; keep it).
  UPDATE public.content
     SET generation_state = 'generating', billing_state = 'charged',
         generation_status_text = 'Generating',
         generation_started_at = COALESCE(generation_started_at, now()), updated_at = now()
   WHERE id = p_content_id;

  RETURN QUERY SELECT 'charged', true, v_balance, 'generating', 'charged';
END;
$$;

-- outcome ∈ refunded | replayed | no_charge | not_found | invalid_key | invalid_state | billing_inconsistent
-- Never refunds/overwrites a succeeded job. Never erases an inconsistent charged row.
-- Every return reports the ACTUAL current state.
CREATE OR REPLACE FUNCTION public.claim_and_refund_image_generation(
  p_client_id       uuid,
  p_content_id      uuid,
  p_idempotency_key text,
  p_error_code      text DEFAULT 'generation_failed',
  p_error_message   text DEFAULT 'Generation failed'
) RETURNS TABLE (outcome text, refunded boolean, new_balance integer,
                 generation_state text, billing_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row     public.content%ROWTYPE;
  v_charge  integer;
  v_balance integer;
  v_txn_id  uuid;
  v_code    text := left(coalesce(p_error_code, 'generation_failed'), 64);
  v_msg     text := left(coalesce(p_error_message, 'Generation failed'), 500);
BEGIN
  -- 1. Lock the OWNED job.
  SELECT * INTO v_row FROM public.content
    WHERE id = p_content_id AND client_id = p_client_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', false, NULL::int, NULL::text, NULL::text; RETURN;
  END IF;

  -- 2. Bind the key to the owned row.
  IF v_row.generation_idempotency_key IS NULL
     OR v_row.generation_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RETURN QUERY SELECT 'invalid_key', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 3. Prior refund for THIS content row → truthful replay (actual state).
  IF EXISTS (SELECT 1 FROM public.generation_billing_ledger
               WHERE content_id_snapshot = p_content_id AND client_id_snapshot = p_client_id
                 AND idempotency_key = p_idempotency_key AND operation = 'refund') THEN
    RETURN QUERY SELECT 'replayed', false,
      (SELECT balance FROM public.credit_balances WHERE client_id = p_client_id),
      v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 4. NEVER refund or overwrite a completed job.
  IF v_row.generation_state = 'succeeded' THEN
    RETURN QUERY SELECT 'invalid_state', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 5. Find the content-bound charge ledger row (authoritative refund amount).
  SELECT amount INTO v_charge FROM public.generation_billing_ledger
    WHERE content_id_snapshot = p_content_id AND client_id_snapshot = p_client_id
      AND idempotency_key = p_idempotency_key AND operation = 'charge';

  -- 6. Reconcile the row's billing_state against the ledger evidence.
  IF v_charge IS NULL THEN
    -- 6a. No charge ledger row. `no_charge` is valid ONLY for a truly uncharged,
    --     unfinished/failed job. If the row nonetheless CLAIMS money moved
    --     (charged / refund_pending / refunded / refund_failed) the evidence is
    --     missing → billing_inconsistent: change NOTHING, move NO money.
    IF v_row.billing_state IS DISTINCT FROM 'not_charged' THEN
      RETURN QUERY SELECT 'billing_inconsistent', false, NULL::int,
                          v_row.generation_state, v_row.billing_state; RETURN;
    END IF;
    IF v_row.generation_state NOT IN ('queued','preparing','generating','saving','failed','timed_out') THEN
      RETURN QUERY SELECT 'invalid_state', false, NULL::int,
                          v_row.generation_state, v_row.billing_state; RETURN;
    END IF;
    -- Genuine uncharged failure: mark failed/not_charged, no money. (Never 'succeeded'
    -- — excluded at step 4 — so a success is never converted.)
    UPDATE public.content
       SET generation_state = 'failed', billing_state = 'not_charged',
           retry_state = 'retry_available',
           generation_error_code = v_code, generation_status_text = v_msg,
           generation_completed_at = now(), updated_at = now()
     WHERE id = p_content_id;
    RETURN QUERY SELECT 'no_charge', false,
      (SELECT balance FROM public.credit_balances WHERE client_id = p_client_id),
      'failed', 'not_charged'; RETURN;
  END IF;

  -- 6b. A charge ledger row exists. The row MUST corroborate it: billing_state
  --     'charged', a refundable generation state, and credit_cost = charge amount.
  --     Any disagreement (e.g. billing_state already 'refunded' with no refund
  --     ledger, or a cost mismatch) is a real inconsistency, NOT a routine refund.
  IF v_row.billing_state IS DISTINCT FROM 'charged'
     OR v_row.generation_state NOT IN ('generating','saving','failed','timed_out')
     OR v_row.credit_cost IS DISTINCT FROM v_charge THEN
    RETURN QUERY SELECT 'billing_inconsistent', false, NULL::int,
                        v_row.generation_state, v_row.billing_state; RETURN;
  END IF;

  -- 7. Refund the exact content-bound charge amount (same transaction). Snapshots = live ids.
  UPDATE public.credit_balances
     SET balance = balance + v_charge,
         lifetime_earned = lifetime_earned + v_charge, updated_at = now()
   WHERE client_id = p_client_id
   RETURNING balance INTO v_balance;
  INSERT INTO public.credit_transactions (client_id, amount, balance_after, operation, description)
    VALUES (p_client_id, v_charge, v_balance, 'refund', 'Image generation refund')
    RETURNING id INTO v_txn_id;
  INSERT INTO public.generation_billing_ledger
    (client_id_snapshot, content_id_snapshot, idempotency_key, operation, amount,
     credit_txn_id, client_id, content_id)
    VALUES (p_client_id, p_content_id, p_idempotency_key, 'refund', v_charge,
            v_txn_id, p_client_id, p_content_id);

  -- 8. Terminal failure + refunded, same transaction.
  UPDATE public.content
     SET generation_state = 'failed', billing_state = 'refunded',
         retry_state = 'retry_available',
         generation_error_code = v_code, generation_status_text = v_msg,
         generation_completed_at = now(), updated_at = now()
   WHERE id = p_content_id;

  RETURN QUERY SELECT 'refunded', true, v_balance, 'failed', 'refunded';
END;
$$;

-- Revoke the implicit PUBLIC EXECUTE grant and lock execution to service_role only.
REVOKE ALL ON FUNCTION public.claim_and_charge_image_generation(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_and_charge_image_generation(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_and_charge_image_generation(uuid, uuid, text, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_and_charge_image_generation(uuid, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_and_refund_image_generation(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_and_refund_image_generation(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_and_refund_image_generation(uuid, uuid, text, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_and_refund_image_generation(uuid, uuid, text, text, text) TO service_role;

-- Helper is pure/read-only but lock it down too.
REVOKE ALL ON FUNCTION public.is_valid_image_generation_cost(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_valid_image_generation_cost(integer) TO service_role;
