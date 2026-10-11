#!/usr/bin/env node
/**
 * Every Kling job renders on Seedance 2 (Kezie approved 2026-10-11). Kling 3.0 on Kie returns frozen
 * clips for image-to-video (5/5, 2026-10-08) and text-to-video (9/9, 2026-10-10). Replaces the
 * 2026-10-09 rule (image-led only, to Seedance 2.5). Mirrors routeVideoModelForFrames() in
 * src/lib/video-model-registry.ts.
 * A rerouted job keeps Kling's meaning of the photo: it is the FIRST frame (Seedance 2
 * first_frame_url / last_frame_url), unless the job also has a voice file (frames and reference_*
 * fields can't be mixed; the voice wins and the photo goes in as a reference).
 *   node --env-file=.env.local scripts/ops/kling-all-to-seedance-2026-10-11.mjs [--live]
 */
import fs from "node:fs";
const LIVE = process.argv.includes("--live"), ID = "fy6MbNs4ShWkKk0i", N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const H = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
const KEYS = ["executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"];
const once = (s, a, b, label) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${label}: ${n} matches`); console.log(`  ✓ ${label}`); return s.replace(a, b); };

const wf = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
const before = JSON.stringify(wf);
const parse = wf.nodes.find((n) => n.name === "Parse Inputs & Calculate Cost");
const build = wf.nodes.find((n) => n.name === "Build Universal Payload");
if (parse.parameters.jsCode.includes("Every Kling job renders on Seedance 2")) { console.log("already patched"); process.exit(0); }

parse.parameters.jsCode = once(parse.parameters.jsCode,
  "// Kling 3.0 image-to-video on Kie returns FROZEN clips (5/5 runs, 2026-10-08). An image-led Kling job\n" +
  "// with no voice/dialogue renders on Seedance 2.5. Mirrors routeVideoModelForFrames() in the app registry.\n" +
  "const hasVoiceIntent = Boolean((audioUrl && audioUrl !== 'null' && String(audioUrl).trim() !== '') || (audioScript && audioScript !== 'null' && String(audioScript).trim() !== '') || userPrompt.includes('\"'));\n" +
  "const klingRerouted = actualModel.includes('kling') && !!primaryImageUrl && !hasVoiceIntent;\n" +
  "if (klingRerouted) actualModel = 'bytedance/seedance-2-5';\n",
  "// Kling 3.0 on Kie returns FROZEN clips (image-to-video 5/5 on 2026-10-08, text-to-video 9/9 on 2026-10-10).\n" +
  "// Every Kling job renders on Seedance 2 until Kling is re-verified (Kezie, 2026-10-11).\n" +
  "// Mirrors routeVideoModelForFrames() in the app registry, so the quote matches the charge.\n" +
  "const klingRerouted = actualModel.includes('kling');\n" +
  "if (klingRerouted) actualModel = 'bytedance/seedance-2';\n",
  "Parse Inputs: every Kling job -> Seedance 2");

build.parameters.jsCode = once(build.parameters.jsCode,
  "    // Only attach if we have valid images\n    if (validImages.length > 0) {\n      apiPayload.input.reference_image_urls = validImages;",
  "    // A rerouted Kling job (2026-10-11) keeps Kling's meaning: the photo is the FIRST frame. Frames can't be\n" +
  "    // mixed with reference_* fields, so a job that also has a voice file stays on references (the voice wins).\n" +
  "    const asFrames = !!inputs.klingRerouted && !!primaryImg && !validAudioUrl && !actorSheet;\n" +
  "    if (asFrames) {\n" +
  "      apiPayload.input.aspect_ratio = 'adaptive'; // frame tasks take the frame's own ratio (as Seedance 2.5)\n" +
  "      apiPayload.input.first_frame_url = primaryImg;\n" +
  "      if (secondaryImg && secondaryImg !== primaryImg) apiPayload.input.last_frame_url = secondaryImg;\n" +
  "    } else if (validImages.length > 0) {\n      apiPayload.input.reference_image_urls = validImages;",
  "Build Universal Payload: rerouted photo is the first frame");

// Both nodes must still parse (n8n Code nodes run as an async function body).
for (const n of [parse, build]) { new Function("$", "$input", "items", `return (async () => {\n${n.parameters.jsCode}\n})`); console.log(`  ✓ ${n.name} parses`); }
if (!LIVE) { console.log("DRY-RUN: add --live to write"); process.exit(0); }
fs.mkdirSync("scripts/ops/backups", { recursive: true });
const backup = `scripts/ops/backups/${ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(backup, before);
const res = await fetch(`${N8N}/workflows/${ID}`, { method: "PUT", headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => KEYS.includes(k))), ...(wf.staticData ? { staticData: wf.staticData } : {}) }) });
console.log(`backup ${backup}\nPUT -> ${res.status}`, res.ok ? "" : (await res.text()).slice(0, 300));
const after = await (await fetch(`${N8N}/workflows/${ID}`, { headers: H })).json();
console.log("active:", after.active, "| parse patched:", after.nodes.find((n) => n.name === "Parse Inputs & Calculate Cost").parameters.jsCode.includes("Every Kling job"), "| build patched:", after.nodes.find((n) => n.name === "Build Universal Payload").parameters.jsCode.includes("asFrames"));
