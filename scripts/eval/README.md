# Output-quality eval

Measures what a real user gets from BlinkSpot's image pipeline, so the launch loop
optimises for output quality instead of for "the request returned 200".

| File | Role |
|---|---|
| `run.mjs` | Runs cases through the **live** image webhook, scores them, compares to the best ever |
| `clone-brands.mjs` | One-time: clones golden brands onto the eval client (never touches originals) |
| `lib/config.mjs` | Golden brands, intents, budgets, judge model. Change the eval here |
| `lib/checks.mjs` | Free deterministic checks: aspect ratio, brand-palette presence |
| `lib/judge.mjs` | Multimodal judge (6 pass/fail dimensions with reasons) + pairwise vs best |
| `lib/spend.mjs` | Credit ledger: per-run, daily and total caps |
| `brands.json` | golden key → eval brand id (written by clone-brands) |
| `best.json` | best output per case so far (the regression baseline) |
| `spend.json` | every attempted generation, with running totals |
| `HISTORY.md` | one summary row per live run |
| `runs/` | per-run images + full results (gitignored) |

## Usage

```bash
node scripts/eval/run.mjs                              # plan only, spends nothing
node scripts/eval/run.mjs --live --subset              # 6 cases, 48 credits
node scripts/eval/run.mjs --live --max-credits=240     # all 30 cases
node scripts/eval/run.mjs --live --case=nuf-farms__promotion
```

Needs `.env.local`: Supabase URL + service key, `N8N_WEBHOOK_SECRET`, `OPENAI_API_KEY`.

## What counts as a pass

A case passes only when **every** deterministic check and **every** judge dimension
passes: `intent_match`, `brand_fit`, `text_quality`, `focal_point`, `ai_defects`,
`post_worthy`. A missing verdict is a failure, never a silent pass. Exit criteria for
launch (launch-loop-plan §5.4): ≥26/30 deterministic, ≥24/30 judge, 0 regressions,
and Kezie would post ≥12 of 15 in a blind review.

## Safety

- Only the allowlisted non-customer eval client, asserted at start.
- Budget: ≤60 credits per run by default (hard cap 240), ≤400/day, ≤3,000 total,
  then check in with Kezie. Every attempt is recorded **before** checking whether it
  succeeded, because a failed call may still have been charged.
- Never collected by vitest; cannot run in tests, builds or CI. The pure logic is
  covered by `src/__tests__/unit/eval-harness.test.ts`.
- Generated images are retained as evidence, not deleted.

## Known limits (be honest about these when reading results)

- The judge is a model (`gpt-4o` baseline). It must be calibrated against Kezie's
  own ratings before its verdicts are trusted (launch-loop-plan §5.2).
- Text correctness comes from the judge reading the image; there is no OCR installed.
- The eval sends the user's plain intent the way the n8n webhook receives it today.
  Until the `assembledPrompt` bug (W1.2) is fixed, that IS what production does:
  the frontend's assembled prompt is discarded. After W1.2 lands, the eval must
  send the assembled prompt too, or it will stop measuring the real product.
