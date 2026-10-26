# Refund only if the post still exists (applied 2026-10-26, approved by Kezie)

n8n `Blink - 3.3. Image Generator (Smart Router v2.2)` (LXINWLmOghHWzRgA)
72a53fb5 → **ed167a52-b4a6-414a-8042-41da52ef0632**.

Closes the stopped-picture double refund. The app's Stop settles a stopped picture at once and
keeps what the image service bills (`lib/stop-refund.ts`). n8n used to refund the full price again
when that picture then failed at Kie or at the upload.

- New `Post Still There?` (HTTP GET `content?select=id&id=eq.<postId>`, BlinkSpot Supabase Secret,
  always outputs, continues on error) and `Refund Unless Stopped` (IF), placed in front of `Refund Credits`.
- Both links that went into `Refund Credits` (`Kie Too Slow?` false and the Cloudinary upload's error
  output) now go through the check.
- It refunds when there was no post (in-request pictures), the post is still there, or the check
  failed. It skips only when the post is gone, and the skip still ends at `Respond with Gen Error`,
  so the app gets its answer.

Proof: `node --env-file=.env.local patch.mjs test` builds a temporary workflow with the same two
nodes and credential, runs the three cases (post exists → refund, post gone → skip, no post →
refund), and deletes it. Live wiring was re-read after the PUT.

Rollback: PUT `.loop-private/refund-check/backup_LXINWLmOghHWzRgA.json` (settings without availableInMCP).
