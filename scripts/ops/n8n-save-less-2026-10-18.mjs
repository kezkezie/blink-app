#!/usr/bin/env node
/**
 * n8n keeps less (Kezie, 2026-10-18: "configure execution data pruning... to clean up database bloat
 * and stop those 502s"). The instance-wide switches (EXECUTIONS_DATA_SAVE_ON_SUCCESS, MAX_AGE) live
 * in the VPS's environment, which the API can't reach; this does the same per workflow through the
 * API: successful runs are no longer stored (their full data, pictures included, is what bloats the
 * database), failed runs still are (the video workflow's error path reads them), manual test runs
 * too. Settings only: nodes and connections are sent back exactly as read.
 *   node --env-file=.env.local scripts/ops/n8n-save-less-2026-10-18.mjs          # dry run
 *   node --env-file=.env.local scripts/ops/n8n-save-less-2026-10-18.mjs --apply  # backup, PUT, verify
 */
import fs from "node:fs";

const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const WANT = { saveDataSuccessExecution: "none", saveDataErrorExecution: "all", saveManualExecutions: true, saveExecutionProgress: false };
const apply = process.argv.includes("--apply");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (id) => (await fetch(`${N8N}/workflows/${id}`, { headers: H })).json();

const list = (await (await fetch(`${N8N}/workflows?limit=200&active=true`, { headers: H })).json()).data ?? [];
const todo = list.filter((w) => Object.entries(WANT).some(([k, v]) => (w.settings ?? {})[k] !== v));
console.log(`${list.length} active workflows, ${todo.length} to change${apply ? "" : " (dry run)"}`);
for (const w of todo) console.log(`- ${w.id} ${w.name}: saveDataSuccessExecution ${w.settings?.saveDataSuccessExecution ?? "(default: all)"} -> none`);
if (!apply) process.exit(0);

fs.mkdirSync("scripts/ops/backups", { recursive: true });
for (const { id } of todo) {
  const wf = await get(id);
  const raw = JSON.stringify(wf);
  const backup = `scripts/ops/backups/${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, raw);
  const settings = { ...Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...WANT };
  const res = await fetch(`${N8N}/workflows/${id}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings, ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
  console.log(`${wf.name}: backup ${backup} | PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
  if (!res.ok) process.exit(1);
  let after = await get(id);
  const same = JSON.stringify(after.nodes) === JSON.stringify(wf.nodes) && JSON.stringify(after.connections) === JSON.stringify(wf.connections);
  if (after.active === false && wf.active) { const r = await fetch(`${N8N}/workflows/${id}/activate`, { method: "POST", headers: H }); console.log("  re-activate ->", r.status); after = await get(id); }
  console.log(`  active: ${after.active} | success data: ${after.settings?.saveDataSuccessExecution} | errors: ${after.settings?.saveDataErrorExecution} | nodes unchanged: ${same}`);
  if (!same) { console.log("  nodes changed unexpectedly: stopping"); process.exit(1); }
  await pause(800);
}
