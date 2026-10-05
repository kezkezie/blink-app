# Kie create-task guard (APPLIED 2026-10-05 with Kezie's approval: version ac0b5360)

Found live 2026-10-05, execution 95541 (Generate Video V3, fy6MbNs4ShWkKk0i): Kie answered createTask
with `{"code":422,"msg":"...","data":null}`. Nothing checks for that: `Kie.ai: Create Task` feeds
`Wait 15s (Kie)` directly, `Kie Done?` only exits on data.state success|fail, so the loop polled
`recordInfo?taskId=undefined` 118 times until the 30-minute executionTimeout CANCELLED the run.
Cancellation is not an error, so no refund ran. Real-user impact: any Kie creation error (bad
param, provider outage, moderation) = credits deducted, no video, no refund, a 30-minute spinner.

Fix:
1. New Code node `Assert Kie Task Created` between Create Task and Wait 15s (Kie):
   ```js
   const id = $json?.data?.taskId;
   if (!id) throw new Error(`Kie createTask failed: ${$json?.code ?? ''} ${String($json?.msg ?? 'no taskId').slice(0, 200)}`);
   return [{ json: $json }];
   ```
2. Poll cap: in the loop, count runs of `Kie.ai: Check Status` and throw after 100 (~25 min), so a
   stuck provider task errors (refundable) instead of being cancelled by the timeout (not refundable).

Before applying, VERIFY the refund path actually fires on a thrown error: the workflow's refund chain
starts at an `Error Trigger` node inside this same workflow, and settings name no `errorWorkflow`.
Run scripts/rehearsals/refund-orchestration.mjs (its documented rehearsal) against a forced failure on
the eval client and confirm the ledger refund, then apply.

## Outcome (2026-10-05)
Applied: `Assert Kie Task Created` + `Kie Poll Cap` (6/6 fixtures, structure check). Forced failure
(Kling with a missing start image, exec 95734) errored in 46 s instead of hanging 30 min; the in-workflow
Error Trigger DID fire (exec 95735). Its refund then stopped at Reconciliation Required because
`Fetch Execution Data` got 401 from the n8n API: the "BlinkSpot n8n API" credential has a dead key.
Real users are still refunded by the Stale Job Reconciler (content row exists). Fix the credential.
