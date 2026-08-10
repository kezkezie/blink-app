# Video durability rehearsals

Two committed suites that prove the video billing and refund contracts still hold.
They replace ad-hoc scripts that previously lived in a session scratchpad and were
lost when it rotated.

| Suite | Mutates anything? | What it proves |
|---|---|---|
| `refund-orchestration.mjs` | **No, ever** | Every gate in the live Error Trigger chain takes the correct branch in **both** directions, using the JS actually deployed in n8n |
| `database-durability.mjs` | Only with `--live` | Terminalization, distinct-state CAS claims, refund success/failure/retry, crash recovery, late-write guards, selector isolation, unrelated-row protection |

## Prerequisites

Environment variables only — **nothing is committed and nothing is printed**:

| Variable | Needed by | Purpose |
|---|---|---|
| `N8N_TOKEN` | both | Read-only fetch of the deployed workflow JSON |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | database suite | REST endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | database suite | Server-side key (the new `sb_secret_…`) |
| `REPLICATE_API_TOKEN` | optional | Read-only prediction **count**, used solely to prove nothing was created |

## Running

```bash
# 1. Refund orchestration — safe anywhere, mutates nothing.
N8N_TOKEN=… node scripts/rehearsals/refund-orchestration.mjs

# 2. Database durability — DRY RUN by default. Verifies preconditions, prints the
#    plan, writes nothing.
node scripts/rehearsals/database-durability.mjs

# 3. Database durability — LIVE. Explicit opt-in required.
node scripts/rehearsals/database-durability.mjs --live

# Optional: lower the ceiling (it can never be raised above the hard cap).
node scripts/rehearsals/database-durability.mjs --live --max-credits=20
```

Exit codes: `0` pass · `1` an assertion failed · `2` could not run (missing env).

## Safety model

These properties are enforced **in code**, not by convention:

1. **Dry run is the default.** `--live` is the only way to write anything.
2. **Allowlisted client only.** Live mode refuses any client not in
   `ALLOWED_TEST_CLIENTS`. It is a non-customer test UUID, not a secret.
3. **Hard credit ceiling.** Default 60 and it cannot be raised above that; the
   budget throws before exceeding it.
4. **Unique run id.** Every disposable row is captioned `REHEARSAL <runId>`, so a
   run's resources are always attributable.
5. **Positive precondition checks.** Aborts unless the opening balance is a real
   number and both workflow versions were fetched with well-formed IF nodes.
6. **Provider create/status endpoints are structurally blocked** — each script
   asserts against its **own source** that it references none. A read-only
   prediction *list* is explicitly permitted because it is the evidence that
   nothing was created.
7. **HTTP 0/`000` is never success.** Neither is "the command exited". A real
   incident: a cleanup pass returned `000` for every request and reported success,
   leaving an authenticated test webhook live.
8. **Cleanup is proven by re-reading** every disposable resource and asserting
   absence — never by a delete's status code.
9. **Ledger rows are preserved** as audit evidence (each attempt nets to zero);
   only disposable content rows are deleted.
10. **Never runs automatically.** `vitest.config.ts` includes only
    `src/__tests__/unit/**`, and `npm run build` is just `next build`, so nothing
    under `scripts/` can execute in unit tests, builds or CI. The pure guards are
    covered by `src/__tests__/unit/rehearsal-guards.test.ts`, which needs no
    network.

## Expected output

Both suites print one `PASS`/`FAIL` line per assertion and a final tally.

- `refund-orchestration.mjs`: **37 assertions**, ending
  `refund orchestration: 37 passed, 0 failed  (nothing was mutated)`.
- `database-durability.mjs --live`: **40 assertions**, ending with cleanup proof,
  `opening balance equals closing balance`, the credit movement versus the ceiling,
  and `no provider prediction created`.

A dry run prints 5 precondition assertions plus the plan.

## Emergency cleanup

If a live run is interrupted, its rows are still attributable. The cleanup block is
in a `finally`, so it normally runs even on failure. To clean up manually, delete
content rows whose `caption` equals `REHEARSAL <runId>` (the run id is printed at
the top of every run), then re-read to confirm absence.

**Leave the ledger alone.** Deduction/refund pairs net to zero and are audit
evidence; deleting them would corrupt the trail these suites exist to protect. If a
deduction is left without its refund, recover it through the normal distinct-state
CAS path rather than editing the ledger.
