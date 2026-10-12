#!/usr/bin/env node
/**
 * QA-017 follow-up (2026-10-12): Storyboard frames were always made at 16:9 (hard-coded in the
 * Create Task body), so a 9:16 story got landscape start frames. The frame now uses the request's
 * aspect_ratio (the app sends the scene's shape), limited to the shapes the image models accept,
 * 16:9 if missing. Nothing else in the workflow changes.
 *   node --env-file=.env.local scripts/ops/storyboard-frame-aspect-2026-10-12.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "0vszzy7EbOv3ADZ5";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
const node = wf.nodes.find((n) => n.name === "Create Task");
let body = node.parameters.jsonBody;
const count = (body.match(/"aspect_ratio": "16:9"/g) || []).length;
console.log(wf.name, "| active:", wf.active, "| hard-coded 16:9 spots:", count);
if (!body.includes("const aspect =")) {
  if (count !== 3) throw new Error(`expected 3 hard-coded aspect ratios, found ${count}`);
  body = body.replace(
    "  const engine = ob.imageEngine || 'nb2';\n",
    "  const engine = ob.imageEngine || 'nb2';\n  // The scene's shape (2026-10-12); it was always 16:9, so 9:16 stories got landscape frames.\n  const aspect = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '2:3', '3:2'].includes(ob.aspect_ratio) ? ob.aspect_ratio : '16:9';\n",
  );
  body = body.split('"aspect_ratio": "16:9"').join('"aspect_ratio": aspect');
  if (!body.includes("const aspect =") || body.includes('"aspect_ratio": "16:9"')) throw new Error("patch did not apply");
  node.parameters.jsonBody = body;
}
// The expression must still parse as JS (strip the ={{ }} wrapper).
new Function("$", `return ${body.replace(/^=\{\{\s*/, "").replace(/\s*\}\}\s*$/, "")}`);
console.log("  ✓ Create Task body parses; uses aspect");
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }
fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
const after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
console.log("active:", after.active, "| patched:", after.nodes.find((n) => n.name === "Create Task").parameters.jsonBody.includes("const aspect ="));
