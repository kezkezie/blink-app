#!/usr/bin/env node
/**
 * Brand-asset generation through the LIVE BlinkSpot image pipeline, on the eval client only,
 * under the same spend ledger and caps as the eval harness (scripts/eval/spend.json).
 *
 * Text never comes from the image model: prompts ask for photography with no text, and all type
 * is added afterwards in exact vector (Kezie-OS projects/<brand>/posters). The assembled prompt
 * is sent as `assembled_prompt`, which the Smart Router forwards verbatim since W1.2.
 *
 *   node --env-file=.env.local scripts/brand-assets/generate.mjs <jobs.json> <outDir> [--live]
 * jobs.json: [{ "id", "prompt", "aspect": "4:5", "refs": ["<id of an earlier job or https url>"] }]
 * Without --live it only prints the plan and the cost.
 */
import fs from "node:fs";
import path from "node:path";
import { EVAL_CLIENT, IMAGE_ENGINE, IMAGE_COST, BUDGET } from "../eval/lib/config.mjs";
import { emptyLedger, canSpend, recordSpend } from "../eval/lib/spend.mjs";

const WEBHOOK = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-images";
const LEDGER = new URL("../eval/spend.json", import.meta.url);
const [jobsPath, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const LIVE = process.argv.includes("--live");
const BRAND_ID = process.env.BRAND_ID; // eval-client brand row to attach the generation to

const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const todo = jobs.filter((j) => !manifest[j.id]?.url);
console.log(`${todo.length} job(s), ${todo.length * IMAGE_COST} credits${LIVE ? "" : " (plan only, add --live)"}`);
if (!LIVE) process.exit(0);
if (!BRAND_ID) { console.error("BRAND_ID not set"); process.exit(2); }

for (const job of todo) {
  let ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : emptyLedger();
  const gate = canSpend(ledger, IMAGE_COST, { runCap: BUDGET.perRunHard });
  if (!gate.ok) { console.error(`STOP: ${gate.reason}`); break; }
  const refs = (job.refs ?? []).map((r) => (r.startsWith("https://") ? r : manifest[r]?.url)).filter(Boolean);
  const payload = {
    client_id: EVAL_CLIENT, brand_id: BRAND_ID, mode: "generate", style: "photo",
    prompt: job.prompt, assembled_prompt: job.prompt, kie_model: IMAGE_ENGINE,
    aspect_ratio: job.aspect ?? "4:5", numImages: 1, brand_name: "Nuf Farms", is_sync: true,
    ...(refs.length ? { reference_image_urls: refs } : {}),
  };
  const t0 = Date.now();
  let status = 0, url = null, err = null;
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(300_000),
    });
    status = res.status;
    const text = await res.text();
    try { url = (JSON.parse(text).imageUrls ?? []).find((u) => /^https:\/\//.test(u)) ?? null; } catch { /* not JSON */ }
    if (!url) err = text.slice(0, 200);
  } catch (e) { err = String(e).slice(0, 200); }
  // every attempt is recorded: a failed call may still have been charged upstream
  ledger = recordSpend(ledger, IMAGE_COST, { note: `brand-assets ${job.id} http=${status}` });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  if (url) {
    const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
    fs.writeFileSync(path.join(outDir, `${job.id}.png`), buf);
  }
  manifest[job.id] = { url, status, seconds: (Date.now() - t0) / 1000, err, refs };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`${url ? "ok  " : "FAIL"} ${job.id} ${status} ${((Date.now() - t0) / 1000).toFixed(1)}s ${err ?? ""}`);
}
