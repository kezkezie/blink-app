# Seedance 2.5 video model (applied 2026-10-02, requested by Kezie)

Kie model `bytedance/seedance-2-5` (docs.kie.ai/market/bytedance/seedance-2-5): 4-30s, 480/720/1080p,
true `first_frame_url` / `last_frame_url` (mutually exclusive with `reference_*` arrays), native audio.

n8n `Blink - Generate Video V3` (fy6MbNs4ShWkKk0i) 6f45616e → **a51f87c9-4632-4d98-8c57-d401fae73365**:
- `Parse Inputs & Calculate Cost`: seedance-2-5 duration 4-30 and aspect rules ahead of the generic
  seedance rules; price 64 cr/s (provisional); start frame + reference audio refused before deduction.
- `Build Universal Payload`: new branch, 720p, frames as first/last frame, never reference arrays.
App: registry entry (Video Studio picker derives from it), Storytelling picker option, price mirror,
drift-test rules.

Proof: `node fixtures.mjs <dir>` runs the real node code, original vs patched: 7/7, and every existing
model's cost + payload is byte-identical to live. Live code re-read after PUT == patched.
Rollback: PUT `.loop-private/seedance25/backup_fy6MbNs4ShWkKk0i.json` (settings: drop timeSavedMode,
availableInMCP; the public API rejects them).

OPEN: the price is provisional (Kie publishes none; ~$9.45/30s at 720p from two third-party sources).
Read `creditsConsumed` from the first real task and correct 64 on both sides.
