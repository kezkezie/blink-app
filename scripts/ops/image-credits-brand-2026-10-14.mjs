#!/usr/bin/env node
/**
 * 2026-10-14 (credits by brand): the image router's charge and refund name the brand they are for,
 * so Billing can show what each brand used. The functions take it as an optional argument
 * (migration 20261014_credits_by_brand). Nothing else changes.
 *   node --env-file=.env.local scripts/ops/image-credits-brand-2026-10-14.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "LXINWLmOghHWzRgA";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const BRAND = "{{ JSON.stringify($('Parse Inputs & Calculate Cost').first().json.brandId || null) }}";

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
const charge = wf.nodes.find((n) => n.name === "Deduct Credits Upfront");
const refund = wf.nodes.find((n) => n.name === "Refund Credits");
console.log(wf.name, "| active:", wf.active);
const chargeTail = "\"cost_param\": {{ $('Parse Inputs & Calculate Cost').first().json.totalCost }}\n}";
const refundTail = "\"p_description\": \"Refund: AI Generation Failed or Timed Out\"\n}";
if (!charge.parameters.jsonBody.includes("brand_id_param")) {
  if (!charge.parameters.jsonBody.endsWith(chargeTail)) throw new Error("charge body not as expected; nothing written");
  charge.parameters.jsonBody = charge.parameters.jsonBody.replace(chargeTail, `"cost_param": {{ $('Parse Inputs & Calculate Cost').first().json.totalCost }},\n  "brand_id_param": ${BRAND}\n}`);
}
if (!refund.parameters.jsonBody.includes("p_brand_id")) {
  if (!refund.parameters.jsonBody.endsWith(refundTail)) throw new Error("refund body not as expected; nothing written");
  refund.parameters.jsonBody = refund.parameters.jsonBody.replace(refundTail, `"p_description": "Refund: AI Generation Failed or Timed Out",\n  "p_brand_id": ${BRAND}\n}`);
}
console.log(charge.parameters.jsonBody, "\n", refund.parameters.jsonBody);
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }

fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
if (!res.ok) process.exit(1);
let after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
if (after.active && !JSON.stringify(after.activeVersion ?? {}).includes("brand_id_param")) {
  const r = await fetch(`${N8N}/workflows/${ID}/activate`, { method: "POST", headers: H });
  console.log("re-activate ->", r.status);
  after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
}
console.log("active:", after.active, "| running with brand:", JSON.stringify(after.activeVersion ?? {}).includes("brand_id_param"));
