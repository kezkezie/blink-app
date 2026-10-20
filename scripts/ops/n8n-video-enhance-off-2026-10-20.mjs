#!/usr/bin/env node
/**
 * Backstop in n8n (Kezie approved, 2026-10-20): Generate Video V3's GPT-4o "AI enhance" step
 * answered "I'm sorry, I can't..." on 7 of 17 saved runs and that sentence was rendered as the video.
 * The app already sends ai_enhance:false with its own prompt; this makes the workflow safe on its own:
 *  1. "Parse Inputs & Calculate Cost": AI enhance defaults to OFF when the request doesn't say.
 *  2. "Build Universal Payload": a GPT reply that is a refusal (or empty) is never used as the prompt;
 *     the request's own words are.
 * Two code lines change; everything else is sent back exactly as read, backed up first, verified after.
 *   node --env-file=.env.local scripts/ops/n8n-video-enhance-off-2026-10-20.mjs          # dry run
 *   node --env-file=.env.local scripts/ops/n8n-video-enhance-off-2026-10-20.mjs --apply  # backup, PUT, verify
 */
import fs from "node:fs";

const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const ID = "fy6MbNs4ShWkKk0i";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const apply = process.argv.includes("--apply");

const DEFAULT_FROM = "let rawAiEnhance = body.ai_enhance !== undefined ? body.ai_enhance : (sceneData.ai_enhance !== undefined ? sceneData.ai_enhance : true);";
const DEFAULT_TO = "let rawAiEnhance = body.ai_enhance !== undefined ? body.ai_enhance : (sceneData.ai_enhance !== undefined ? sceneData.ai_enhance : false); // 2026-10-20: off unless asked (refusals were rendered)";
const GUARD_FROM = "    aiPrompt = rawContent || '';";
const GUARD_TO = "    aiPrompt = rawContent || '';\n    // 2026-10-20: a refusal is never a prompt; the request's own words are.\n    if (/(i'?m sorry|i am sorry|i can(?:no|'?)t|unable to (?:help|assist|create|generate|fulfill)|as an ai)/i.test(aiPrompt.slice(0, 240))) aiPrompt = inputs.userPrompt || '';";

const get = async () => (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const wf = await get();
const edit = (nodes) => nodes.map((n) => {
  if (n.name === "Parse Inputs & Calculate Cost" && n.parameters?.jsCode?.includes(DEFAULT_FROM)) return { ...n, parameters: { ...n.parameters, jsCode: n.parameters.jsCode.replace(DEFAULT_FROM, DEFAULT_TO) } };
  if (n.name === "Build Universal Payload" && n.parameters?.jsCode?.includes(GUARD_FROM) && !n.parameters.jsCode.includes("a refusal is never a prompt")) return { ...n, parameters: { ...n.parameters, jsCode: n.parameters.jsCode.replace(GUARD_FROM, GUARD_TO) } };
  return n;
});
const nodes = edit(wf.nodes);
const changed = nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(wf.nodes[i])).map((n) => n.name);
console.log(`${wf.name}: ${changed.length ? `changes ${changed.join(" + ")}` : "already done"}${apply ? "" : " (dry run)"}`);
if (!apply || !changed.length) process.exit(0);

fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, JSON.stringify(wf));
const settings = Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k)));
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes, connections: wf.connections, settings, ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup} | PUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
if (!res.ok) process.exit(1);
let after = await get();
if (after.active === false && wf.active) { const r = await fetch(`${N8N}/workflows/${ID}/activate`, { method: "POST", headers: H }); console.log("re-activate ->", r.status); after = await get(); }
const sameElsewhere = after.nodes.every((n, i) => changed.includes(n.name) || JSON.stringify(n) === JSON.stringify(wf.nodes[i])) && JSON.stringify(after.connections) === JSON.stringify(wf.connections);
const applied = after.nodes.find((n) => n.name === "Parse Inputs & Calculate Cost")?.parameters.jsCode.includes(DEFAULT_TO) && after.nodes.find((n) => n.name === "Build Universal Payload")?.parameters.jsCode.includes("a refusal is never a prompt");
console.log(`verify: edits in place ${!!applied}, everything else unchanged ${sameElsewhere}, active ${after.active}`);
if (!applied || !sameElsewhere || !after.active) process.exit(1);
