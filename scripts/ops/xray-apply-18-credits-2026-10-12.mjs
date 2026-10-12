#!/usr/bin/env node
/**
 * X-ray "apply" (JSON Image Editor) charges 18 credits instead of 3, like the other Nano Banana 2
 * edits (Kezie, 2026-10-12: "raise it to 18 to match our other edits of that kind"). The refund
 * on failure moves with it.
 *   node --env-file=.env.local scripts/ops/xray-apply-18-credits-2026-10-12.mjs [--live]
 */
import fs from "node:fs";

const LIVE = process.argv.includes("--live");
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const ID = "U5rA3qk6fJwAvA61";
const PRICE = "18";
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
console.log(wf.name, "| active:", wf.active);
for (const name of ["Supabase: Deduct Credits", "Supabase: Refund Credits"]) {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node not found: ${name}`);
  const amount = n.parameters.bodyParameters.parameters.find((p) => p.name === "p_amount");
  console.log(`  ${name}: p_amount ${amount.value} -> ${PRICE}`);
  if (amount.value !== "3" && amount.value !== PRICE) throw new Error(`unexpected amount ${amount.value}`);
  amount.value = PRICE;
}
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }
fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
const after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
console.log("active:", after.active, "| amounts:", ["Supabase: Deduct Credits", "Supabase: Refund Credits"].map((x) => after.nodes.find((n) => n.name === x).parameters.bodyParameters.parameters.find((p) => p.name === "p_amount").value).join(", "));
