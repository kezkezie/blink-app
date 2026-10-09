#!/usr/bin/env node
/**
 * Kling 3.0 image-to-video on Kie returns frozen clips (5/5 runs, 2026-10-08). An image-led Kling
 * job with no voice/dialogue renders on Seedance 2.5 instead, priced as Seedance 2.5.
 * Mirrors routeVideoModelForFrames() in src/lib/video-model-registry.ts.
 *   node --env-file=.env.local scripts/ops/kling-i2v-fallback-2026-10-09.mjs [--live]
 */
import fs from "node:fs";
const LIVE = process.argv.includes("--live"), ID = "fy6MbNs4ShWkKk0i", N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const once = (s, a, b, label) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${label}: ${n} matches`); console.log(`  ✓ ${label}`); return s.replace(a, b); };

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const node = wf.nodes.find((n) => n.name === "Parse Inputs & Calculate Cost");
const before = JSON.stringify(wf);
let c = node.parameters.jsCode;
if (c.includes("klingRerouted")) { console.log("already patched"); process.exit(0); }
c = once(c, "      actualModel = \"seedance-2\"; \n    }\n}\n",
  "      actualModel = \"seedance-2\"; \n    }\n}\n\n" +
  "// Kling 3.0 image-to-video on Kie returns FROZEN clips (5/5 runs, 2026-10-08). An image-led Kling job\n" +
  "// with no voice/dialogue renders on Seedance 2.5. Mirrors routeVideoModelForFrames() in the app registry.\n" +
  "const hasVoiceIntent = Boolean((audioUrl && audioUrl !== 'null' && String(audioUrl).trim() !== '') || (audioScript && audioScript !== 'null' && String(audioScript).trim() !== '') || userPrompt.includes('\"'));\n" +
  "const klingRerouted = actualModel.includes('kling') && !!primaryImageUrl && !hasVoiceIntent;\n" +
  "if (klingRerouted) actualModel = 'bytedance/seedance-2-5';\n", "reroute after model resolution");
c = once(c, "brandName, brandInfo, aiModelOverride, strictBrandAlignment,", "brandName, brandInfo, aiModelOverride: klingRerouted ? actualModel : aiModelOverride, klingRerouted, strictBrandAlignment,", "payload builder gets the rerouted model");
node.parameters.jsCode = c;
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }
fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
