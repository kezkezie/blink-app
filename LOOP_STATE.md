# LOOP STATE — read me first

The launch loop's memory between sessions. Plan of record:
`/Users/freddykezie/Documents/ AIos demo/Kezie-OS/projects/blinkspot/launch-loop-plan.md`.
Resume prompt: *"Continue the BlinkSpot launch loop. Read Kezie-OS/projects/blinkspot/launch-loop-plan.md and LOOP_STATE.md, then proceed."*

Last updated: 2026-10-02 by session 2

## Resume here
Current task: **W1 known bugs.** Green items done (W1.1 validation half, W1.3, W1.4, W1.5 onboard
deletion). Red items prepared/queued below.
Status: in progress
Next step (Green, do these without waiting for approvals):
  1. **W1.1 second half:** `prompt-helper` still trusts the browser's `brandContext`. Derive it
     server-side via `loadOwnedBrandCreativeContext(userId, brandId)` (callers must send brandId).
  2. **W1.5:** `/api/agent/generate` always 401s (`clients.api_key` does not exist) and
     `/api/openapi.json` advertises it at `yourdomain.com`. Remove both from public reach.
  3. **RLS verification** of `brand_profiles` (settings page updates `primary_font` straight from
     the browser, relying on RLS). Read-only: check policies via the Supabase SQL of record or a
     browser-session probe that uses GET only.
  4. **Eval must send `assembled_prompt`** now that W1.2 is live (cases.mjs / run.mjs), then
     re-baseline. Then **W2 helper model A/B** (needs the judge's 3-vote majority first).
Resume a crashed eval: `node scripts/eval/run.mjs --live --subset --resume=<stamp>` (free for
already-paid images; reads local copies first).
Tree: all product work committed and deployed through b682828. Eval state files, LOOP_STATE and
scripts/n8n-patches are uncommitted.

## Gates at last check
tsc: ✓ · unit: **764/764** · build: ✓ · live auth spec: ✓ (after 7b639b2) · deployed: b682828

## Baseline (pre-fix product) — run 2026-09-29T12-37-25-479Z, 6-case subset, all 6 scored
**all-pass 1/6 · deterministic 4/6 · judge 1/6 · regressed 0**
intent_match 4/6 · brand_fit 2/6 · text_quality 4/6 · focal_point 6/6 · ai_defects 6/6 · post_worthy 1/6
Credits: 56 total today (8 lost to the first crashed run; everything since is recorded + resumable).

Root causes found by looking at the images (session-1 human calibration, agrees with judge 4/5):
1. **No product understanding.** "Showcase our best-selling product" → a smartphone for Zap
   (crypto exchange) and a perfume bottle for Bluewave Laundry. Nothing tells the model what
   the brand actually sells. → Director layer (W3), and brand enrichment (W4).
2. **Router style text leaks into images.** Smart Router `FLAT_2D_TEXT` asks for "rounded
   colour label chips"; nano-banana-2 renders them as literal pills with gibberish
   ("chilshtrip", "crever", "Color chip") on the Gasless Cash poster. Remove that phrase. (Red:
   live n8n.) Candidate for bundling with W1.2.
3. **Bad brand data is rendered faithfully.** Mama Njeri's stored `website_url` is a Netlify
   placeholder and its primary colour is `#ffffff`; the poster prints the placeholder URL.
   → W4 brand data quality + never print a URL that isn't a real domain.
Judge disagreement: it PASSED Lup Space (generic woman-at-laptop). Too lenient on brand_fit;
tighten the rubric before trusting it for launch criteria.

## Budget
Credits: see `scripts/eval/spend.json` · daily cap 400 · total cap 3,000
LLM $ today: judge only, small (gpt-4o vision, 6 calls/run) · cap $5/day

## Approvals queue (Red — waiting for Kezie)
**APPROVED 2026-10-02 by Kezie ("reply 1-3 which i want"): W1.2 assembledPrompt, remove the
"colour label chips" phrase, X-Ray deduction gate.** W1.2 + chips APPLIED (see Done). X-Ray APPLIED
too. n8n API key = `N8N_MCP_TOKEN` in blink-app/.env.local (export it as N8N_TOKEN for scripts).
- [ ] **W1.6 misleading ledger text is a DB function, not n8n.** "AI Image Generation (8 images)"
  is written by `process_image_generation_billing(user_id_param, cost_param)`, which only
  receives the cost. Fix needs a migration adding an image-count parameter. Not yet prepared.

## Done (newest first)
- **7402b33 + n8n fy6MbNs4ShWkKk0i → a51f87c9: Seedance 2.5** (`bytedance/seedance-2-5`, 4-30s, true
  first/last frame) in registry, Video Studio, Storytelling and the live video workflow. 7/7 fixtures on
  real node code; all other models byte-identical. **Price 64 cr/s is PROVISIONAL**: correct it from Kie
  `creditsConsumed` on the first real run. See scripts/n8n-patches/seedance-2-5/.
- **55650d5 + n8n kWMHsGM7goHkhFPn → 692f5f3f: X-Ray deduction gate** (approved). Live negative test
  exec 94449: vision never ran. Route maps `insufficient_credits` → 402. Found: its refund branch is dead
  (connections name an Error Trigger node that does not exist). See scripts/n8n-patches/xray/.
- **2026-10-02 n8n `LXINWLmOghHWzRgA` → version cc2f9b0b-0b07-454f-b299-d0ec005ea322** (Red,
  approved). Parse node now returns `assembledPrompt` (trimmed, ≤8000 chars) and the router uses it;
  both "label chips" phrases removed from the flat-2D style text (template-recreation mention kept).
  Verified 5/5 on live code + 1 real generation (Gasless Cash "20% off", HTTP 200, 46.4s, 8 credits):
  text exact, no gibberish pills. But the image is generic (stock phone + tick, weak brand colour) →
  the prompt now arrives, so quality now depends on what the prompt says (W1.1 / W3 / W4).
  Rollback: PUT `.loop-private/w1.2/backup_LXINWLmOghHWzRgA.json` (was a3bc64fb). Ledger total 64.
- **b682828** SECURITY: brand server actions now authenticate from the session and check
  ownership (anyone could overwrite any brand before). `/api/onboard` deleted (unauthenticated,
  free agency tier, confirmed accounts for any email). W1.3 archive instead of delete (inline
  two-step confirm; lists + 5 ownership gates ignore archived brands). W1.4 plan brand limits
  enforced server-side on both creation paths; `getBrandAllowance()` explains the limit before
  the form. 24 new tests on an in-memory fake DB.
- **a51f609** eval harness committed (resume, per-case isolation, incremental saves, renditions).
- **7b639b2** SECURITY: SSRF in brand autofill closed (`src/lib/safe-fetch.ts`, 36 tests).
  W0.4 complete: adapter is the only chat-completion call site.
- **397b857** content/analyze validated + on the adapter (11 tests, 7 confirmed the billing fix).
- **707eca4** prompt-helper validated + on the adapter; all 8 real caller modes pinned.
- **6ca60c3** W0.4 (part 1): `src/lib/llm` adapter (task-keyed model config, image input,
  JSON mode, timeouts, transient retries). openai-proxy, assisted-creation and brand/suggest
  moved onto it with zero behaviour change. brand/suggest now validates + bounds input (was
  untested, 4 tests red first) and stops leaking provider errors.
- **d7614a8** Billing fix: `deduct_credits` returns HTTP 200 `{success:false}` on failure; three
  routes tested `=== false`, so failed deductions ran paid work free AND later refunded credits
  never taken (credit minting). Shared `isDeductionSuccessful()`. Test fixtures had mocked a
  shape the real RPC never returns, which is why the suite stayed green. Verified in an
  isolated worktree: 630/630.
- W0.3 eval harness: `scripts/eval/` (run, clone-brands, config, cases, checks, judge, spend),
  README, 19 unit tests. Golden brands cloned onto eval client `1c51553f` (brands.json), each
  proven by re-read.
- W0.2 this file.
- W0.1 Kie key rotated + removed from `Kezie-OS/.claude/settings.json` (done by Kezie).

## Parked
(none)

## Doc/code conflicts found
- Plan W1.1 claimed `prompt-helper`'s `max_tokens: 80` blocks detailed prompts. **Wrong:** the
  helper deliberately emits a 15-40 word concept seed; detail comes from the Creative Direction
  Engine downstream, which n8n discards (W1.2). Plan corrected.
- `current-state.md` says "#4 logo workflow LIVE + smoke-verified (2026-08-03)", but on
  2026-09-17 `/api/brand/logo` 502'd because `blink-generate-logo` did not exist, and a new
  workflow `PPasXaEYlBaniu6l` was built. Unresolved which statement describes what.

## Learned (the next session must know)
- **Never probe a write endpoint with a write verb.** An empty POST to `/api/onboard` returned
  200 and created 3 production rows (reverted, proven by re-read). Use GET/OPTIONS, or read the code.
- **Next.js server actions are public HTTP endpoints.** Any `"use server"` function that uses
  `supabaseAdmin` must derive identity from the session and check ownership itself. Audit every
  new one.
- Test with the in-memory fake (`src/__tests__/unit/helpers/fake-supabase.ts`) when the question
  is "what happens to the data", not "which mock was called".
- Show a guard test is real by deleting the guard and watching the test go red, then restoring.
- **Test fixtures must use the REAL response shape.** Probe the live function/endpoint once
  (with a nonexistent id, so nothing real changes) and copy its exact shape into the mocks.
  Fixtures that mocked `deduct_credits` as a bare boolean hid a live billing hole.
- **Large Cloudinary PNGs crawl on this link**: a 1.2 MB original got 49 KB in 60 s; the
  `w_512` rendition took 3.8 s. Evals use renditions for pixel checks. **Product backlog:** the
  app should serve `f_auto,q_auto,w_*` renditions to users too, not raw PNGs (mobile networks).
- **CORRECTION:** the judge is NOT stable. Re-scoring the same 6 images flipped `text_quality` on
  2 cases (~7% of verdicts) at temperature 0. An early 3-image match was too small a sample.
  **Before W2's model A/B, make the judge vote 3× per dimension (majority).** Until then, a
  difference of one case between runs is noise.
- Baseline so far (pre-fix product): Zap "showcase best-selling product" produced a generic
  black smartphone for a crypto exchange: the Director layer has no idea what a brand's
  "product" actually is. That, not the image model, is the first quality problem.
- **This machine's network drops connections** (3 drops on 2026-09-29: a Supabase read, an
  eval run killed mid-download with `terminated`). Every fetch needs a timeout and a retry on
  reads. An 8-credit image was lost because the old runner had neither. The runner now records
  each generation URL in `spend.json` before scoring, so a crash never loses a paid image.
- The eval measures what production does TODAY: the webhook receives the user's short intent,
  because the assembled prompt is discarded (W1.2). Keep that in mind when reading the baseline.
- Only `style: "poster"` permits text in the Smart Router; all other styles append "NO TEXT".
- `visual_style_guide` is appended LAST in the final prompt, so it wins on recency.
- Deploying app code to production is **Amber** while BlinkSpot has no users (Kezie,
  2026-09-29): deploy from a green full gate, verify live, revert on failure. n8n, DB migrations
  and keys remain **Red**.
- `.loop-private/` is gitignored and holds workflow backups that may contain secrets. Never
  commit it, never print it.
