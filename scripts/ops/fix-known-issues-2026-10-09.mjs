#!/usr/bin/env node
/**
 * Known-issues batch, 2026-10-09 (Kezie: "fix all the issues", pricing "at cost for now").
 *   node --env-file=.env.local scripts/ops/fix-known-issues-2026-10-09.mjs [--live]
 *
 * Image workflow (Smart Router v2.2):
 *   1. costMap nano-banana-2 8 -> 18 (it renders 4K now; Kie charges 18).
 *   2. Upload to Cloudinary: on failure take an error output to Refund Credits (it used to dead-end
 *      in the Error Trigger, which has no refund and never knows the client).
 *   3. Refund Credits reads the client from Parse Inputs (works for both callers).
 * Video workflow (Generate Video V3):
 *   4. per-second cost at Kie's measured rates: kling 27 (pro + sound), seedance-2-5 158 (1080p),
 *      seedance 2/fast 41 (720p, image input), sora 20. Audio surcharge only where the base rate
 *      excludes audio (pruna, gemini, sora).
 *   5. The four state-guarded PATCHes treat NULL generation_state/billing_state as allowed
 *      (NULL NOT IN (...) is never true, so rows created without the envelope matched 0 rows).
 * Every change asserts its anchor exists exactly once. Dry-run prints the plan; --live backs up, then PUTs.
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const SETTINGS_KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const pick = (st = {}) => Object.fromEntries(Object.entries(st).filter(([k]) => SETTINGS_KEYS.includes(k)));

function once(str, from, to, label) {
  const n = str.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected exactly 1 match, found ${n}`);
  console.log(`  ✓ ${label}`);
  return str.replace(from, to);
}
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`node not found: ${name}`); return n; };

async function patch(id, edit) {
  const wf = await (await fetch(`${N8N}/workflows/${id}`, { headers: H })).json();
  console.log(`\n${wf.name}`);
  const before = JSON.stringify(wf);
  edit(wf);
  if (JSON.stringify(wf) === before) { console.log("  (no change)"); return; }
  if (!LIVE) { console.log("  DRY-RUN: add --live to write"); return; }
  fs.mkdirSync("scripts/ops/backups", { recursive: true });
  const backup = `scripts/ops/backups/${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, before);
  const res = await fetch(`${N8N}/workflows/${id}`, { method: "PUT", headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: pick(wf.settings), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
  console.log(`  backup ${backup}\n  PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
}

// ---------------- image
await patch("LXINWLmOghHWzRgA", (wf) => {
  const p = node(wf, "Parse Inputs & Calculate Cost").parameters;
  p.jsCode = once(p.jsCode, "'nano-banana-2': 8,", "'nano-banana-2': 18, // renders 4K since 2026-10-08; Kie 4K = 18", "nano-banana-2 cost 8 -> 18");

  const up = node(wf, "Upload an asset from file data");
  if (up.onError !== "continueErrorOutput") { up.onError = "continueErrorOutput"; console.log("  ✓ upload: error output enabled"); }
  const outs = (wf.connections["Upload an asset from file data"] ??= { main: [[]] }).main;
  while (outs.length < 2) outs.push([]);
  if (!outs[1].some((c) => c.node === "Refund Credits")) { outs[1].push({ node: "Refund Credits", type: "main", index: 0 }); console.log("  ✓ upload error -> Refund Credits"); }

  const r = node(wf, "Refund Credits").parameters;
  r.jsonBody = once(r.jsonBody, '"p_client_id": "{{ $json.clientId }}"', `"p_client_id": "{{ $('Parse Inputs & Calculate Cost').first().json.clientId }}"`, "refund reads client from Parse Inputs");
});

// ---------------- video
await patch("fy6MbNs4ShWkKk0i", (wf) => {
  const p = node(wf, "Parse Inputs & Calculate Cost").parameters;
  let c = p.jsCode;
  c = once(c, "perSecCost = 64; // Seedance 2.5, provisional: ~$0.315/s at 720p (2026-10-02)", "perSecCost = 158; // Seedance 2.5 at 1080p + audio, Kie measured 2026-10-08 (790 / 5 s)", "seedance-2-5 64 -> 158");
  c = once(c, "perSecCost = 20; // Premium model, higher API cost", "perSecCost = 41; // Seedance 2 / Fast at 720p with an image (Kie: 41/s)", "seedance 20 -> 41");
  c = once(c, "} else if (actualModel.includes('kling') || actualModel.includes('sora')) {\n    perSecCost = 12; // Standard premium pricing",
    "} else if (actualModel.includes('kling')) {\n    perSecCost = 27; // Kling 3.0 pro + native sound, Kie measured 2026-10-08\n} else if (actualModel.includes('sora')) {\n    perSecCost = 20; // Sora 2 on Replicate: $0.10/s", "kling 27, sora 20");
  c = once(c, "if (hasAudioUrl || hasAudioScript || hasDialogue) {\n  perSecCost += 4; ",
    "// kling and seedance rates above already include audio; only add it where the base rate does not\nif ((hasAudioUrl || hasAudioScript || hasDialogue) && !actualModel.includes('kling') && !actualModel.includes('seedance')) {\n  perSecCost += 4; ", "audio surcharge only for pruna/gemini/sora");
  p.jsCode = c;

  const guard = "&billing_state=not.in.(refund_pending,refunded)&generation_state=not.in.(failed,timed_out)";
  const safe = "&and=(or(billing_state.is.null,billing_state.not.in.(refund_pending,refunded)),or(generation_state.is.null,generation_state.not.in.(failed,timed_out)))";
  for (const name of ["Save Video to Supabase", "progress: Rendering", "Progress: Scripting"]) {
    const q = node(wf, name).parameters; q.url = once(q.url, guard, safe, `${name}: NULL-safe guard`);
  }
  const t = node(wf, "Terminalize Without Refund").parameters;
  t.url = once(t.url, "&generation_state=not.in.(succeeded,failed,timed_out)", "&or=(generation_state.is.null,generation_state.not.in.(succeeded,failed,timed_out))", "Terminalize: NULL-safe guard");
});
