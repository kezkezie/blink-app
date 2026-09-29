# W1.2 — forward `assembledPrompt` to the image router (PREPARED, NOT APPLIED)

**Status:** awaiting Kezie's approval (Red tier: live n8n change).
**Workflow:** `LXINWLmOghHWzRgA` Image Generator Smart Router v2.2, live version `a3bc64fb-14ab-449a-a69d-275710023c45`.
**Node changed:** `Parse Inputs & Calculate Cost` only. Replace its `jsCode` with `parse-inputs.patched.js`.

## The bug
`Build Payload Router` branches on `input.assembledPrompt` (PATH A), but the parse node never
returned it. So the frontend Creative Direction Engine's assembled prompt was discarded on every
Image Studio generation and PATH B rebuilt a generic prompt from the user's short text.

## The fix
Return `assembledPrompt` (trimmed, bounded to 8000 chars, `null` if blank). Nothing else.
`negativePrompt` is deliberately NOT forwarded: PATH A would add `negative_prompt` to the Kie
payload, and Kie's nano-banana-2 input schema is unverified. An unknown field could 422 after
the upfront charge. Verify that separately first.

## Proof (free, no provider call) — 7/7
Ran the live router code against the old and patched parse nodes:
- live code discards the assembled prompt (bug reproduced)
- patched code puts it in the provider payload (PATH A reached)
- `negative_prompt` still not forwarded
- requests without `assembled_prompt` produce a byte-identical PATH B payload
- whitespace-only falls back to PATH B; oversize bounded to 8000
- billing fields (`kieModel`, `perImageCost`, `totalCost`) identical

## Apply
1. PUT the workflow with only this node's `jsCode` changed (settings allowlist: `executionOrder`,
   `callerPolicy`, `executionTimeout`).
2. Re-fetch; confirm `versionId` changed, still active, IF nodes well-formed
   (`Kezie-OS/scripts/n8n/check-if-nodes.py`).
3. **Update the eval to send `assembled_prompt`** or it stops measuring the real product.
4. Run the eval subset; compare against the baseline in `scripts/eval/HISTORY.md`.

## Rollback
PUT `.loop-private/w1.2/backup_LXINWLmOghHWzRgA.json` (gitignored; may contain secrets).
