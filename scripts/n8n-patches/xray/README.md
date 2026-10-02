# X-Ray deduction gate (applied 2026-10-02, approved by Kezie)

Workflow `kWMHsGM7goHkhFPn` (blink- X-Ray Image Analyzer). Before: `Supabase: Deduct Credits` fed
straight into `OpenAI Vision API1`, so a failed deduction (HTTP 200 `{success:false}`) still ran the
paid vision call.

After (version 692f5f3f-a5cd-458d-8765-26e338bbd5d9):
Deduct → IF `Deduction Succeeded?` (`$json.success === true || $json.data === true`, same pattern as
the live "Billing Success?" node) → true: OpenAI Vision → Format; false: `Insufficient Credits Response`
`{success:false, error, code:"insufficient_credits"}`. Webhook is responseMode lastNode, so that body
is returned (HTTP 200); `/api/video/nano-banana` maps the code to HTTP 402.

Proof: 7/7 gate fixtures; live call with a nonexistent client id → execution 94449 ran Webhook,
Deduct, gate, deny only (vision never ran), no credits moved.
Rollback: PUT `.loop-private/xray/backup_kWMHsGM7goHkhFPn.json` (was 196175e9).

Known, not fixed here: connections reference an `Error Trigger` node that does not exist, so the
refund branch (Extract Error Context → Refund Credits) can never fire.
