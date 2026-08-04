# Proposed billing migration (LOCAL-ONLY — NOT APPLIED)

`20260728_generation_billing_rpcs.PROPOSED.sql` is the rev-4 Appendix A billing
migration from `Kezie-OS/projects/blinkspot/slice-5-live-async-preflight.md`
(atomic `claim_and_charge_image_generation` / `claim_and_refund_image_generation`
+ `generation_billing_ledger` + `is_valid_image_generation_cost`).

**It is deliberately kept OUT of `supabase/migrations/`** so `supabase db push`
cannot apply it. Applying it to any remote DB is gated (preflight §16, Gates 1–2)
and requires independent review + explicit authorization. Nothing here has been
applied remotely.

## Verify locally (ephemeral throwaway Postgres, no remote DB, no spend)

```bash
bash db/proposed/harness/run_billing_harness.sh
```

Spins up an `initdb` cluster, applies `harness/seed.sql` + the proposed migration,
runs the 25-case matrix (`harness/billing_harness.sql` for the deterministic cases;
the runner adds real two-connection concurrency for cases 16–17), then tears the
cluster down. Exit 0 = all 25 passed.

## Prerequisite already implemented (Gate 0, app-side)

`content.credit_cost` is persisted at placeholder creation from the server-owned
pricing registry (`src/lib/image-engine-pricing.ts`); `claim_and_charge` requires
it non-null and charges exactly that stored value (`p_amount` is only a checked
assertion). See `src/__tests__/unit/image-engine-pricing.test.ts` for the
registry ⇄ n8n cost-map ⇄ SQL-allowlist drift tests.
