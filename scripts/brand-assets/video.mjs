#!/usr/bin/env node
/**
 * One brand video through the LIVE BlinkSpot video workflow (n8n "Generate Video V3"), eval client
 * only, under the eval spend ledger. post_id is a fresh UUID with no content row, so the workflow's
 * progress/save PATCHes match nothing; the result is read back from the n8n execution instead.
 *
 *   node --env-file=.env.local scripts/brand-assets/video.mjs <job.json> <outDir> [--live]
 * job.json: { id, model, duration, aspect, prompt, start, end, creditsPerSecond }
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EVAL_CLIENT, BUDGET } from "../eval/lib/config.mjs";
import { emptyLedger, dayKey, recordSpend } from "../eval/lib/spend.mjs";

const N8N = "https://n8n.srv1166077.hstgr.cloud";
const WORKFLOW_ID = "fy6MbNs4ShWkKk0i";
const LEDGER = new URL("../eval/spend.json", import.meta.url);
const [jobPath, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const LIVE = process.argv.includes("--live");
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const cost = Number(job.duration) * job.creditsPerSecond;
console.log(`${job.id}: ${job.model} ${job.duration}s ${job.aspect} = ${cost} credits${LIVE ? "" : " (plan only)"}`);
if (!LIVE) process.exit(0);

let ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : emptyLedger();
// A single clip can exceed the eval harness's per-RUN cap (240, set for batches of images), so video
// is gated on the caps Kezie approved: 400 credits a day and 3,000 total.
const today = ledger.days[dayKey()] ?? 0;
if (today + cost > BUDGET.daily) { console.error(`STOP: daily cap ${today}+${cost} > ${BUDGET.daily}`); process.exit(3); }
if (ledger.total + cost > BUDGET.total) { console.error(`STOP: total cap ${ledger.total}+${cost} > ${BUDGET.total}`); process.exit(3); }

const postId = crypto.randomUUID();
const startedAt = new Date();
const res = await fetch(`${N8N}/webhook/blink-generate-video-v1`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}) },
  body: JSON.stringify({
    client_id: EVAL_CLIENT, post_id: postId, content_type: "video", video_mode: "showcase",
    ai_model_override: job.model, duration: String(job.duration), aspect_ratio: job.aspect,
    primary_image_url: job.start, secondary_image_url: job.end, user_prompt: job.prompt,
    ai_enhance: false, brand_name: "Nuf Farms",
  }),
});
console.log("queued:", res.status, (await res.text()).slice(0, 120), "post", postId);
ledger = recordSpend(ledger, cost, { note: `brand-assets video ${job.id} ${job.model} ${job.duration}s http=${res.status}` });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

// find this run's execution and wait for it to finish
const H = { "X-N8N-API-KEY": process.env.N8N_MCP_TOKEN };
let exec = null;
for (let i = 0; i < 200 && !exec?.finished && exec?.status !== "error"; i += 1) {
  await new Promise((r) => setTimeout(r, 10_000));
  const list = await (await fetch(`${N8N}/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=5&includeData=true`, { headers: H })).json();
  exec = (list.data ?? []).find((e) => JSON.stringify(e.data?.resultData?.runData?.["Parse Inputs & Calculate Cost"] ?? "").includes(postId)) ?? exec;
  if (exec) process.stdout.write(`\r  execution ${exec.id} ${exec.status} ${Math.round((Date.now() - startedAt) / 1000)}s   `);
}
console.log("");
const rd = exec?.data?.resultData?.runData ?? {};
const pick = (node) => rd[node]?.[0]?.data?.main?.[0]?.[0]?.json;
const kie = pick("Kie.ai: Check Status");
const out = {
  id: job.id, postId, execution: exec?.id, status: exec?.status,
  videoUrl: pick("Format Video URL")?.videoUrl ?? pick("Upload Video to Cloudinary1")?.secure_url ?? pick("Extract Kie URL")?.videoUrl ?? null,
  kieCreditsConsumed: kie?.data?.creditsConsumed ?? null, kieCostTime: kie?.data?.costTime ?? null,
  billed: pick("Parse Inputs & Calculate Cost")?.totalCost ?? null,
  error: exec?.data?.resultData?.error?.message ?? null,
};
fs.mkdirSync(outDir, { recursive: true });
if (out.videoUrl) fs.writeFileSync(path.join(outDir, `${job.id}.mp4`), Buffer.from(await (await fetch(out.videoUrl)).arrayBuffer()));
fs.writeFileSync(path.join(outDir, `${job.id}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
