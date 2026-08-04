-- ============================================================================
-- Deterministic verification harness for the proposed billing RPCs (rev-4).
-- Run with: psql -v ON_ERROR_STOP=1 -f billing_harness.sql
-- Any failed assertion RAISEs and aborts with a non-zero exit.
-- Covers Appendix A §A.8 cases 1-15 and 18-25. Concurrency (16-17) is run as
-- real parallel connections by run_billing_harness.sh.
-- ============================================================================
\set ON_ERROR_STOP on

-- ---- assertion + seed helpers (harness-only) -------------------------------
CREATE OR REPLACE FUNCTION h_assert(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS: %', label;
  ELSE RAISE EXCEPTION 'FAIL: %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION h_seed_client(p_client uuid, p_balance integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.clients(id) VALUES (p_client);
  INSERT INTO public.credit_balances(client_id, balance) VALUES (p_client, p_balance);
END $$;

CREATE OR REPLACE FUNCTION h_seed_job(p_content uuid, p_client uuid, p_key text,
  p_cost integer, p_gen text, p_bill text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.content(id, client_id, generation_state, billing_state, retry_state,
                             credit_cost, generation_idempotency_key)
  VALUES (p_content, p_client, p_gen, p_bill, 'none', p_cost, p_key);
END $$;

CREATE OR REPLACE FUNCTION h_ledger_count(p_content uuid, p_op text) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.generation_billing_ledger
   WHERE content_id_snapshot = p_content AND operation = p_op;
$$;

CREATE OR REPLACE FUNCTION h_balance(p_client uuid) RETURNS integer
LANGUAGE sql AS $$ SELECT balance FROM public.credit_balances WHERE client_id = p_client $$;

-- Convenience: fixed uuids per case keep data isolated.
DO $harness$
DECLARE
  c uuid; j uuid; oc uuid;   -- client / job / other-client
  r record;
BEGIN
  -- ===== 1. Role-based EXECUTE: anon/authenticated denied, service_role allowed =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case1key000001', 8, 'queued', 'not_charged');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.claim_and_charge_image_generation(c, j, 'case1key000001', 8);
    RESET ROLE; RAISE EXCEPTION 'FAIL: authenticated should not EXECUTE charge';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM h_assert(true, '1a authenticated denied charge');
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.claim_and_refund_image_generation(c, j, 'case1key000001');
    RESET ROLE; RAISE EXCEPTION 'FAIL: anon should not EXECUTE refund';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM h_assert(true, '1b anon denied refund');
  END;
  SET LOCAL ROLE service_role;
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case1key000001', 8);
  RESET ROLE;
  PERFORM h_assert(r.outcome = 'charged', '1c service_role can charge');

  -- ===== 2. authenticated cannot SELECT the raw ledger =====
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.generation_billing_ledger;
    RESET ROLE; RAISE EXCEPTION 'FAIL: authenticated read ledger';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM h_assert(true, '2 authenticated cannot read ledger');
  END;

  -- ===== 3. Cross-tenant call → not_found, no mutation =====
  c := gen_random_uuid(); oc := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_client(oc, 100);
  PERFORM h_seed_job(j, c, 'case3key000001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(oc, j, 'case3key000001', 8);
  PERFORM h_assert(r.outcome = 'not_found', '3a cross-tenant not_found');
  PERFORM h_assert(h_balance(c) = 100 AND h_ledger_count(j,'charge') = 0, '3b no mutation cross-tenant');

  -- ===== 4. Key mismatch → invalid_key, no mutation =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case4key000001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'WRONGKEY00001', 8);
  PERFORM h_assert(r.outcome = 'invalid_key', '4a invalid_key');
  PERFORM h_assert(h_balance(c) = 100 AND h_ledger_count(j,'charge') = 0, '4b no mutation on invalid_key');

  -- ===== 5. Content A cannot use Content B's key (cross-content key) =====
  c := gen_random_uuid();
  PERFORM h_seed_client(c, 100);
  j := gen_random_uuid(); oc := gen_random_uuid();
  PERFORM h_seed_job(j, c, 'case5keyA00001', 8, 'queued', 'not_charged');
  PERFORM h_seed_job(oc, c, 'case5keyB00001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, oc, 'case5keyA00001', 8); -- B's row, A's key
  PERFORM h_assert(r.outcome = 'invalid_key', '5 cross-content key rejected');

  -- ===== 6. One content cannot receive two differently-keyed charges =====
  -- The row's key is fixed; a second charge with a different key → invalid_key.
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case6key000001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case6key000001', 8);
  PERFORM h_assert(r.outcome = 'charged', '6a first charge ok');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'DIFFERENTKEY6', 8);
  PERFORM h_assert(r.outcome = 'invalid_key', '6b second differently-keyed charge rejected');
  PERFORM h_assert(h_ledger_count(j,'charge') = 1, '6c exactly one charge ledger row');

  -- ===== 7. Missing stored cost → invalid_amount =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case7key000001', NULL, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case7key000001', 8);
  PERFORM h_assert(r.outcome = 'invalid_amount', '7a missing credit_cost → invalid_amount');
  PERFORM h_assert(h_balance(c) = 100, '7b no charge when cost missing');

  -- ===== 8. Wrong amount for stored engine → invalid_amount =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case8key000001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case8key000001', 2); -- asserts 2 != stored 8
  PERFORM h_assert(r.outcome = 'invalid_amount', '8 p_amount != stored credit_cost → invalid_amount');

  -- ===== 9. Browser cannot supply its own price: charged amount == stored cost =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case9key000001', 8, 'queued', 'not_charged');
  -- Even a "correct-looking" caller amount only passes when it equals the stored cost,
  -- and the DEDUCT uses the stored cost (100 - 8 = 92), never a caller value.
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case9key000001', 8);
  PERFORM h_assert(r.outcome = 'charged' AND h_balance(c) = 92, '9 charged the STORED cost, not a caller price');

  -- ===== 10. Supported engine cost persists & charges (see 9); assert ledger amount =====
  PERFORM h_assert((SELECT amount FROM public.generation_billing_ledger
                     WHERE content_id_snapshot = j AND operation='charge') = 8,
                   '10 ledger amount = server-derived cost');

  -- ===== 11. (pricing-registry drift is asserted in the app harness) ====================
  PERFORM h_assert(public.is_valid_image_generation_cost(8)
               AND public.is_valid_image_generation_cost(2)
               AND NOT public.is_valid_image_generation_cost(7),
                   '11 SQL cost allowlist matches registry values');

  -- ===== 12. Zero / negative / off-allowlist stored cost → invalid_amount =====
  c := gen_random_uuid();
  PERFORM h_seed_client(c, 100);
  j := gen_random_uuid(); PERFORM h_seed_job(j, c, 'case12a0000001', 0, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case12a0000001', 0);
  PERFORM h_assert(r.outcome = 'invalid_amount', '12a zero cost rejected');
  j := gen_random_uuid(); PERFORM h_seed_job(j, c, 'case12b0000001', 7, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case12b0000001', 7);
  PERFORM h_assert(r.outcome = 'invalid_amount', '12b off-allowlist cost (7) rejected');

  -- ===== 13. Insufficient balance → insufficient_credits, no ledger row =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 3); PERFORM h_seed_job(j, c, 'case13key00001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case13key00001', 8);
  PERFORM h_assert(r.outcome = 'insufficient_credits', '13a insufficient_credits');
  PERFORM h_assert(h_balance(c) = 3 AND h_ledger_count(j,'charge') = 0, '13b no money moved, no ledger');
  PERFORM h_assert((SELECT billing_state FROM public.content WHERE id=j) = 'not_charged'
               AND (SELECT generation_state FROM public.content WHERE id=j) = 'failed',
                   '13c row marked failed/not_charged');

  -- ===== 14. Succeeded job cannot be refunded / converted =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case14key00001', 8, 'succeeded', 'charged');
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case14key00001');
  PERFORM h_assert(r.outcome = 'invalid_state', '14a succeeded refund → invalid_state');
  PERFORM h_assert((SELECT generation_state FROM public.content WHERE id=j) = 'succeeded'
               AND h_balance(c) = 100, '14b succeeded row unchanged, no money');

  -- ===== 15. Legitimate uncharged failure → no_charge =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case15key00001', 8, 'generating', 'not_charged');
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case15key00001');
  PERFORM h_assert(r.outcome = 'no_charge', '15a no_charge for uncharged failure');
  PERFORM h_assert((SELECT billing_state FROM public.content WHERE id=j)='not_charged'
               AND (SELECT generation_state FROM public.content WHERE id=j)='failed'
               AND h_balance(c)=100, '15b marked failed/not_charged, no money');

  -- ===== 18. Full happy refund path + replay returns actual state (case 19 too) =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case18key00001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case18key00001', 8);
  PERFORM h_assert(r.outcome='charged' AND h_balance(c)=92, '18a charged');
  -- 19a replay charge returns ACTUAL state (generating/charged), no double deduct
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case18key00001', 8);
  PERFORM h_assert(r.outcome='replayed' AND r.generation_state='generating' AND r.billing_state='charged'
               AND h_balance(c)=92 AND h_ledger_count(j,'charge')=1, '19a charge replay = actual state, no double deduct');
  -- refund it
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case18key00001', 'safety_blocked', 'blocked');
  PERFORM h_assert(r.outcome='refunded' AND h_balance(c)=100, '18b refunded exact amount');
  -- 19b replay refund returns ACTUAL state (failed/refunded), no double refund
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case18key00001');
  PERFORM h_assert(r.outcome='replayed' AND r.generation_state='failed' AND r.billing_state='refunded'
               AND h_balance(c)=100 AND h_ledger_count(j,'refund')=1, '19b refund replay = actual state, no double refund');

  -- ===== 20. charged row with NO charge ledger → billing_inconsistent =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 92); PERFORM h_seed_job(j, c, 'case20key00001', 8, 'generating', 'charged'); -- no ledger row
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case20key00001');
  PERFORM h_assert(r.outcome='billing_inconsistent', '20a charged row w/o ledger → billing_inconsistent');
  PERFORM h_assert(h_balance(c)=92 AND (SELECT billing_state FROM public.content WHERE id=j)='charged',
                   '20b no money moved, state unchanged');

  -- ===== 21. refund_pending row with no refund ledger → billing_inconsistent =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 92); PERFORM h_seed_job(j, c, 'case21key00001', 8, 'failed', 'refund_pending');
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case21key00001');
  PERFORM h_assert(r.outcome='billing_inconsistent', '21 refund_pending w/o ledger → billing_inconsistent');

  -- ===== 22. refunded row with missing refund ledger → billing_inconsistent =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case22key00001', 8, 'failed', 'refunded');
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case22key00001');
  PERFORM h_assert(r.outcome='billing_inconsistent', '22 refunded w/o ledger → billing_inconsistent');

  -- ===== 23. charge ledger exists but credit_cost != charge amount → billing_inconsistent =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case23key00001', 8, 'queued', 'not_charged');
  SELECT * INTO r FROM public.claim_and_charge_image_generation(c, j, 'case23key00001', 8);
  UPDATE public.content SET credit_cost = 5 WHERE id = j; -- corrupt the cost after charge
  SELECT * INTO r FROM public.claim_and_refund_image_generation(c, j, 'case23key00001');
  PERFORM h_assert(r.outcome='billing_inconsistent', '23 cost mismatch vs charge ledger → billing_inconsistent');

  -- ===== 24. Deleting content parent preserves ledger evidence (snapshots) =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case24key00001', 8, 'queued', 'not_charged');
  PERFORM public.claim_and_charge_image_generation(c, j, 'case24key00001', 8);
  DELETE FROM public.content WHERE id = j;
  PERFORM h_assert(
    (SELECT count(*) FROM public.generation_billing_ledger
      WHERE content_id_snapshot = j AND operation='charge' AND content_id IS NULL AND amount=8) = 1,
    '24 content delete preserves ledger (content_id nulled, snapshot+amount intact)');

  -- ===== 25. Deleting client parent preserves ledger evidence =====
  c := gen_random_uuid(); j := gen_random_uuid();
  PERFORM h_seed_client(c, 100); PERFORM h_seed_job(j, c, 'case25key00001', 8, 'queued', 'not_charged');
  PERFORM public.claim_and_charge_image_generation(c, j, 'case25key00001', 8);
  DELETE FROM public.content WHERE client_id = c;
  DELETE FROM public.credit_transactions WHERE client_id = c;
  DELETE FROM public.credit_balances WHERE client_id = c;
  DELETE FROM public.clients WHERE id = c;
  PERFORM h_assert(
    (SELECT count(*) FROM public.generation_billing_ledger
      WHERE client_id_snapshot = c AND client_id IS NULL) >= 1,
    '25 client delete preserves ledger (client_id nulled, snapshot intact)');

  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'DETERMINISTIC HARNESS: all single-session cases PASSED';
  RAISE NOTICE '=========================================================';
END
$harness$;
