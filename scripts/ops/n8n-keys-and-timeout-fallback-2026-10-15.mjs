#!/usr/bin/env node
/**
 * 2026-10-15, approved by Kezie ("go on the router"; "move both the Replicate token and the OpenAI
 * key into n8n credentials, then rotate them"):
 *  1. Two n8n credentials from the app's own keys (one Replicate token, one OpenAI key to manage):
 *     "BlinkSpot Replicate API (2026-10-15)" and "BlinkSpot OpenAI API (2026-10-15)".
 *  2. The hardcoded Authorization headers come out of: the image router and the durable image
 *     workflow ("Create Replicate Task") and the classic X-ray ("OpenAI Vision API1"). The old
 *     hardcoded keys then serve nothing and can be revoked (that's the rotation).
 *  3. Image router: a Kie timeout (Kie accepted the task, then "generate task timeout") tries
 *     Replicate's Nano Banana 2 once before refunding; Kie failed half its tasks that day.
 *   node --env-file=.env.local scripts/ops/n8n-keys-and-timeout-fallback-2026-10-15.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const ROUTER = "LXINWLmOghHWzRgA";
const TARGETS = [
  { id: ROUTER, node: "Create Replicate Task", cred: "replicate" },
  { id: "U0HoLHJuS5aKDyBD", node: "Create Replicate Task", cred: "replicate" },
  { id: "kWMHsGM7goHkhFPn", node: "OpenAI Vision API1", cred: "openai" },
];
const CREDS = {
  replicate: { name: "BlinkSpot Replicate API (2026-10-15)", token: process.env.REPLICATE_API_TOKEN },
  openai: { name: "BlinkSpot OpenAI API (2026-10-15)", token: process.env.OPENAI_API_KEY },
};
const SECRET = /Bearer\s+(?!\{\{)[A-Za-z0-9_\-.]{20,}|r8_[A-Za-z0-9]{20,}|sk-(proj-)?[A-Za-z0-9_-]{20,}/;
const IF_NAME = "Kie Too Slow?";

// The router's new branch: Kie was slow or busy, and Replicate hasn't been tried. Safety refusals refund.
const SLOW = "={{ $json.provider !== 'replicate' && /timeout|timed out|524|busy|overload|queue|capacity|try again later/i.test(String($json.kieFailReason || '') + ' ' + String($json.kieFailCode || '') + ' ' + String($json.error_reason || '')) }}";
const slow = (json) => new Function("$json", `return ${SLOW.replace(/^=\{\{\s*/, "").replace(/\s*\}\}\s*$/, "")}`)(json);
for (const [json, want] of [
  [{ status: "failed", kieFailReason: "generate task timeout.", kieFailCode: "524", error_reason: "no_image_returned" }, true],
  [{ status: "failed", kieFailReason: null, error_reason: "timeout" }, true],
  [{ status: "failed", kieFailReason: "Your prompt was flagged as sensitive", error_reason: "no_image_returned" }, false],
  [{ status: "failed", kieFailReason: "500 Internal Error", error_reason: "no_image_returned" }, false],
  [{ status: "failed", kieFailReason: "timeout", error_reason: "replicate_failed", provider: "replicate" }, false],
]) if (slow(json) !== want) throw new Error(`fallback condition wrong for ${JSON.stringify(json)}; nothing written`);
console.log("✓ fallback condition: Kie timeouts retry on Replicate; refusals, other errors and a failed Replicate try refund");

for (const [k, c] of Object.entries(CREDS)) {
  if (!c.token) throw new Error(`${k} key missing from .env.local; nothing written`);
  const url = k === "openai" ? "https://api.openai.com/v1/models" : "https://api.replicate.com/v1/account";
  const r = await fetch(url, { headers: { Authorization: `Bearer ${c.token}` } });
  if (!r.ok) throw new Error(`${k} key answers ${r.status}; nothing written`);
  console.log(`✓ app ${k} key works`);
}

const workflows = {};
for (const t of TARGETS) workflows[t.id] ??= await (await fetch(`${N8N}/workflows/${t.id}`, { headers: H })).json();
const before = Object.fromEntries(Object.entries(workflows).map(([id, w]) => [id, JSON.stringify(w)]));
const node = (wf, name) => wf.nodes.find((n) => n.name === name) ?? (() => { throw new Error(`${wf.name}: ${name} missing; nothing written`); })();
for (const t of TARGETS) {
  const n = node(workflows[t.id], t.node);
  const hasHeader = (n.parameters.headerParameters?.parameters ?? []).some((p) => p.name === "Authorization");
  console.log(`${workflows[t.id].name} › ${t.node}: hardcoded key ${hasHeader ? "present" : "already gone"}`);
}

// Router fallback (the graph is checked before anything is written).
const router = workflows[ROUTER];
const gate = node(router, "Generation Success?");
const rep = node(router, "Create Replicate Task");
const format = node(router, "Format Replicate Output");
node(router, "Refund Credits");
if (JSON.stringify(router.connections["Generation Success?"]?.main?.[1] ?? []) !== JSON.stringify([{ node: "Refund Credits", type: "main", index: 0 }]) && !router.nodes.some((n) => n.name === IF_NAME)) {
  throw new Error("router: Generation Success? false branch isn't Refund Credits; nothing written");
}
// Replicate reads the job from the first (only) item, whichever branch reached it.
rep.parameters.jsonBody = rep.parameters.jsonBody.replaceAll("$('Build Payload Router').item.json", "$('Build Payload Router').first().json");
format.parameters.jsCode = format.parameters.jsCode.replace("$('Build Payload Router').item.json.meta", "$('Build Payload Router').first().json.meta");
new Function("$", "$json", format.parameters.jsCode);
if (!router.nodes.some((n) => n.name === IF_NAME)) {
  router.nodes.push({
    id: crypto.randomUUID(), name: IF_NAME, type: gate.type, typeVersion: gate.typeVersion,
    position: [gate.position[0] + 220, gate.position[1] + 200],
    parameters: { conditions: { options: {}, conditions: [{ id: crypto.randomUUID(), leftValue: SLOW, rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} },
  });
}
router.connections["Generation Success?"].main[1] = [{ node: IF_NAME, type: "main", index: 0 }];
router.connections[IF_NAME] = { main: [[{ node: "Create Replicate Task", type: "main", index: 0 }], [{ node: "Refund Credits", type: "main", index: 0 }]] };
console.log("✓ router: Generation Success? (false) → Kie Too Slow? → Create Replicate Task | Refund Credits");

if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }

const made = {};
for (const [k, c] of Object.entries(CREDS)) {
  const res = await fetch(`${N8N}/credentials`, { method: "POST", headers: H, body: JSON.stringify({ name: c.name, type: "httpHeaderAuth", data: { name: "Authorization", value: `Bearer ${c.token}` } }) });
  if (!res.ok) throw new Error(`credential ${c.name} -> ${res.status} ${(await res.text()).slice(0, 200)}; workflows untouched`);
  const { id, name } = await res.json();
  made[k] = { id, name };
  console.log("credential created:", name, id);
}
for (const t of TARGETS) {
  const n = node(workflows[t.id], t.node);
  n.parameters.authentication = "genericCredentialType";
  n.parameters.genericAuthType = "httpHeaderAuth";
  n.credentials = { ...(n.credentials ?? {}), httpHeaderAuth: made[t.cred] };
  if (n.parameters.headerParameters?.parameters) n.parameters.headerParameters.parameters = n.parameters.headerParameters.parameters.filter((p) => p.name !== "Authorization");
  if (SECRET.test(JSON.stringify(n.parameters))) throw new Error(`${t.node} still holds a key; nothing written`);
}

fs.mkdirSync("scripts/ops/backups", { recursive: true });
for (const [id, wf] of Object.entries(workflows)) {
  const backup = `scripts/ops/backups/${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, before[id]);
  const res = await fetch(`${N8N}/workflows/${id}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
  console.log(`${wf.name}: backup ${backup} | PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
  if (!res.ok) process.exit(1);
  let after = await (await fetch(`${N8N}/workflows/${id}`, { headers: H })).json();
  const running = (w) => { const s = JSON.stringify(w.activeVersion ?? w); return !SECRET.test(s.replace(/"credentials":\{[^}]*\}/g, "")) && (id !== ROUTER || s.includes(IF_NAME)); };
  if (after.active && !running(after)) {
    const r = await fetch(`${N8N}/workflows/${id}/activate`, { method: "POST", headers: H });
    console.log("  re-activate ->", r.status);
    after = await (await fetch(`${N8N}/workflows/${id}`, { headers: H })).json();
  }
  console.log(`  active: ${after.active} | live version clean${id === ROUTER ? " and has the fallback" : ""}: ${running(after)}`);
}
