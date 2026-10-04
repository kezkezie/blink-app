# Kie create-task guard (PREPARED, NOT APPLIED: Red, needs Kezie's approval)

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
