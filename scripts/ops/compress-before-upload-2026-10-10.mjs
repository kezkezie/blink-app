#!/usr/bin/env node
/**
 * Image Smart Router v2.2: stop losing 4K images that are over Cloudinary's 10 MB limit, and make the
 * failure reply honest. Approved by Kezie 2026-10-10 ("the compress idea").
 *   node --env-file=.env.local scripts/ops/compress-before-upload-2026-10-10.mjs [--live]
 *
 *  1. Download Image -> NEW "Compress for Upload" (Edit Image: JPEG q90, never upscaled, resized only
 *     above 5000 px) -> Upload. A 12.9 MB NB2 4K JPEG became ~1.2 MB in a probe (3712x4608 kept).
 *     If compression errors, its error output still goes to Upload with the original file.
 *  2. "Respond with Gen Error": the body was `=JSON.stringify(...)` without {{ }}, so every failure
 *     reply crashed and the app got a bare 502. Now valid JSON, and the message matches the cause
 *     (saved-failed / timeout / generation refused) instead of always blaming safety filters.
 * Dry-run prints the plan; --live backs up the workflow, then PUTs.
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "LXINWLmOghHWzRgA";
const SETTINGS_KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const pick = (st = {}) => Object.fromEntries(Object.entries(st).filter(([k]) => SETTINGS_KEYS.includes(k)));
const node = (wf, name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`node not found: ${name}`); return n; };

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
console.log(wf.name);
const before = JSON.stringify(wf);

// 1. compress between download and upload
const COMPRESS = "Compress for Upload";
if (!wf.nodes.some((n) => n.name === COMPRESS)) {
  const dl = node(wf, "Download Image");
  const up = node(wf, "Upload an asset from file data");
  wf.nodes.push({
    id: "compress-for-upload-2026-10-10",
    name: COMPRESS,
    type: "n8n-nodes-base.editImage",
    typeVersion: 1,
    position: [Math.round((dl.position[0] + up.position[0]) / 2), dl.position[1] + 160],
    onError: "continueErrorOutput",
    parameters: { operation: "resize", width: 5000, height: 5000, resizeOption: "onlyIfLarger", options: { format: "jpeg", quality: 90 } },
  });
  const outs = wf.connections["Download Image"].main[0];
  const i = outs.findIndex((c) => c.node === up.name);
  if (i < 0) throw new Error("Download Image is not wired to the upload node any more");
  outs[i] = { node: COMPRESS, type: "main", index: 0 };
  wf.connections[COMPRESS] = { main: [[{ node: up.name, type: "main", index: 0 }], [{ node: up.name, type: "main", index: 0 }]] };
  console.log("  ✓ Download Image -> Compress for Upload -> Upload (error output also -> Upload)");
} else console.log("  (compress node already present)");

// 2. honest, valid failure reply
const r = node(wf, "Respond with Gen Error");
const body = `={{ JSON.stringify((() => {
  const ex = $('Extract Data').isExecuted ? $('Extract Data').first().json : {};
  const reason = ex.status === 'success' ? 'save_failed' : (ex.error_reason === 'timeout' ? 'timeout' : 'generation_failed');
  const message = reason === 'save_failed'
    ? 'The image was made but could not be saved. Your credits have been refunded. Please try again.'
    : reason === 'timeout'
      ? 'Generation timed out. Your credits have been automatically refunded. Please try again.'
      : 'The AI could not make this image. This can happen with safety filters, for example when adding real people or public figures. Your credits have been refunded. Try rephrasing, or upload a reference photo instead.';
  return { success: false, credits_refunded: true, reason, message };
})()) }}`;
if (r.parameters.responseBody !== body) {
  if (!String(r.parameters.responseBody).startsWith("=JSON.stringify(")) throw new Error("Respond with Gen Error body changed since the audit; re-check before patching");
  r.parameters.responseBody = body;
  console.log("  ✓ Respond with Gen Error: valid JSON + cause-specific message");
}

if (JSON.stringify(wf) === before) { console.log("  (no change)"); process.exit(0); }
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }
fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H,
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: pick(wf.settings), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`  backup ${backup}\n  PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 400));
