#!/usr/bin/env node
/**
 * BlinkSpot output-quality eval.
 *
 * Measures what a real user gets: each case sends a plain-language intent for a
 * golden brand through the LIVE image pipeline (the same n8n webhook Image Studio
 * uses), then scores the result with free deterministic checks and a multimodal
 * judge, and compares it pairwise against the best output ever recorded for that case.
 *
 * DRY RUN by default: verifies brands and budget, prints the plan, spends nothing.
 *
 *   node scripts/eval/run.mjs                         # plan, no spend
 *   node scripts/eval/run.mjs --live --subset         # 6 cases, ~48 credits
 *   node scripts/eval/run.mjs --live --max-credits=240  # full 30 cases
 *   node scripts/eval/run.mjs --live --case=nuf-farms__promotion
 *
 * Safety: allowlisted eval client only; per-run, daily and total credit caps
 * (lib/spend.mjs); every attempt is recorded even if it fails; never touches a
 * real customer account. Outputs are retained as evidence, not deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { EVAL_CLIENT, GOLDEN_BRANDS, INTENTS, ASPECT_RATIO, IMAGE_ENGINE, IMAGE_COST, BUDGET } from "./lib/config.mjs";
import { buildCases, referencesFor } from "./lib/cases.mjs";
import { canSpend, recordSpend, emptyLedger, dayKey } from "./lib/spend.mjs";
import { runDeterministicChecks, checkRenditionUrl } from "./lib/checks.mjs";
import { judgeImage, comparePair, caseVerdict, DIMENSIONS } from "./lib/judge.mjs";
import { assertAllowlistedClient, assertNoProviderEndpoints } from "../rehearsals/lib/guards.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK = "https://n8n.srv1166077.hstgr.cloud/webhook/blink-generate-images";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const LIVE = Boolean(args.live);
const RUN_CAP = Number(args["max-credits"] ?? BUDGET.perRunDefault);

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8")); } catch { return fallback; } };
const writeJson = (f, v) => fs.writeFileSync(path.join(HERE, f), JSON.stringify(v, null, 2) + "\n");

async function loadBrands() {
  const map = readJson("brands.json", null);
  if (!map) throw new Error("brands.json missing. Run: node scripts/eval/clone-brands.mjs --live");
  const ids = GOLDEN_BRANDS.map((g) => map[g.key]).filter(Boolean);
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const r = await fetch(`${SB}/rest/v1/brand_profiles?id=in.(${ids.join(",")})&client_id=eq.${EVAL_CLIENT}&is_active=eq.true&select=*`, { headers: h });
  if (!r.ok) throw new Error(`brand read HTTP ${r.status}`);
  const rows = await r.json();
  return GOLDEN_BRANDS.map((g) => {
    const row = rows.find((b) => b.id === map[g.key]);
    if (!row) throw new Error(`eval brand ${g.key} (${map[g.key]}) not found/active on the eval client`);
    return { key: g.key, ...row };
  });
}

async function generate(testCase) {
  const { brand, intent } = testCase;
  const refs = intent.needsReferences ? referencesFor(brand) : [];
  const payload = {
    client_id: EVAL_CLIENT,
    brand_id: brand.id,
    mode: intent.mode,
    style: intent.style,
    prompt: intent.text,
    kie_model: IMAGE_ENGINE,
    aspect_ratio: ASPECT_RATIO,
    numImages: 1,
    brand_name: brand.brand_name,
    ...(brand.website_url ? { brand_website: brand.website_url } : {}),
    ...(refs.length ? { reference_image_urls: refs } : {}),
    is_sync: true,
  };
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const t0 = Date.now();
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "x-blink-webhook-secret": secret } : {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(240_000),
  });
  const text = await res.text();
  let url = null;
  try { url = (JSON.parse(text).imageUrls ?? []).find((u) => /^https:\/\//.test(u)) ?? null; } catch { /* not JSON */ }
  return { status: res.status, url, seconds: (Date.now() - t0) / 1000, error: url ? null : text.slice(0, 240), refs };
}

async function downloadImage(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw last;
}

async function main() {
  if (!SB || !KEY) { console.error("Supabase env not set."); return 2; }
  assertAllowlistedClient(EVAL_CLIENT);
  assertNoProviderEndpoints(fs.readFileSync(new URL(import.meta.url), "utf8"), "eval/run");

  const brands = await loadBrands();
  let cases = buildCases(brands, { subset: Boolean(args.subset), intents: INTENTS });
  if (args.case) cases = cases.filter((c) => c.id === args.case);
  if (!cases.length) { console.error("no cases selected"); return 2; }

  // Inspiration cases need references; a brand with none is skipped, and SAID so.
  const runnable = cases.filter((c) => !c.intent.needsReferences || referencesFor(c.brand).length > 0);
  const skipped = cases.filter((c) => !runnable.includes(c));

  let ledger = readJson("spend.json", emptyLedger());
  const estimate = runnable.length * IMAGE_COST;
  console.log(`\n  eval: ${runnable.length} case(s), est. ${estimate} credits | run cap ${RUN_CAP} | today ${ledger.days[dayKey()] ?? 0}/${BUDGET.daily} | total ${ledger.total}/${BUDGET.total}`);
  for (const s of skipped) console.log(`  skip  ${s.id}: brand has no reference images`);

  const gate = canSpend(ledger, estimate, { runCap: RUN_CAP });
  if (!LIVE) {
    for (const c of runnable) console.log(`  plan  ${c.id.padEnd(30)} style=${c.intent.style}`);
    console.log(`\n  budget check for this plan: ${gate.ok ? "OK" : `WOULD BE REFUSED — ${gate.reason}`}`);
    console.log("  dry run: nothing generated, nothing spent. Re-run with --live.\n");
    return 0;
  }
  if (!gate.ok) { console.error(`  refused: ${gate.reason}`); return 1; }

  // --resume=<stamp>: reuse images ALREADY PAID FOR in that run (URLs are in the
  // ledger) instead of generating them again. Never buy the same image twice.
  const resumeStamp = typeof args.resume === "string" ? args.resume : null;
  const paid = new Map();
  if (resumeStamp) {
    for (const e of ledger.entries) {
      const [st, id, , url] = String(e.note).split(" ");
      if (st === resumeStamp && /^https:\/\//.test(url ?? "")) paid.set(id, url);
    }
    console.log(`  resume ${resumeStamp}: ${paid.size} already-paid image(s) will be re-scored, not regenerated`);
  }
  const stamp = resumeStamp ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(HERE, "runs", stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const best = readJson("best.json", {});
  const results = [];
  let runSpent = 0;
  let judgeTokens = 0;

  const persist = () => {
    writeJson("best.json", best);
    fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ stamp, results, runSpent, judgeTokens }, null, 2));
  };

  for (const c of runnable) {
    let gen;
    if (paid.has(c.id)) {
      gen = { status: 200, url: paid.get(c.id), seconds: 0, error: null, refs: [], reused: true };
    } else {
      const check = canSpend(ledger, IMAGE_COST, { runCap: RUN_CAP, runSpent });
      if (!check.ok) { console.log(`  STOP  budget: ${check.reason}`); break; }
      gen = await generate(c).catch((e) => ({ status: 0, url: null, error: e.message, seconds: 0, refs: [] }));
      // Recorded BEFORE inspecting success: a failed call may still have been charged.
      ledger = recordSpend(ledger, IMAGE_COST, { note: `${stamp} ${c.id} http=${gen.status} ${gen.url ?? "no-url"}` });
      writeJson("spend.json", ledger);
      runSpent += IMAGE_COST;
    }

    const r = { id: c.id, brand: c.brand.brand_name, intent: c.intent.text, style: c.intent.style, generation: gen };
    if (!gen.url) {
      r.verdict = { pass: false, deterministicPass: false, judgePass: false, failures: ["generation_failed"] };
      console.log(`  FAIL  ${c.id.padEnd(30)} generation failed: HTTP ${gen.status} ${gen.error ?? ""}`);
      results.push(r);
      persist();
      continue;
    }

    // Bounded + retried: an unbounded download can hang the whole run forever.
    try {
    // Prefer the copy already saved for this run: on resume the image is local and
    // re-downloading it is just another chance for this link to time out.
    const localCopy = path.join(runDir, `${c.id}.png`);
    const buf = fs.existsSync(localCopy) && fs.statSync(localCopy).size > 0
      ? fs.readFileSync(localCopy)
      : await downloadImage(checkRenditionUrl(gen.url));
    fs.writeFileSync(localCopy, buf);
    r.deterministic = await runDeterministicChecks(buf, c.brand, { ratio: ASPECT_RATIO });
    r.judge = await judgeImage({ imageUrl: gen.url, brand: c.brand, intentText: c.intent.text }).catch((e) => ({ error: e.message }));
    if (r.judge.usage) judgeTokens += r.judge.usage.total_tokens ?? 0;
    r.verdict = caseVerdict({ deterministic: r.deterministic, judge: r.judge.error ? null : r.judge });

    if (best[c.id]) {
      r.pairwise = await comparePair({ bestUrl: best[c.id].url, newUrl: gen.url, brand: c.brand, intentText: c.intent.text }).catch((e) => ({ verdict: "same", reason: `compare failed: ${e.message}` }));
    }
    const promote = !best[c.id] || r.pairwise?.verdict === "better";
    if (promote) best[c.id] = { url: gen.url, run: stamp, pass: r.verdict.pass };

    console.log(`  ${r.verdict.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(30)} ${r.verdict.pass ? "" : r.verdict.failures.join(", ")}${r.pairwise ? `  [vs best: ${r.pairwise.verdict}]` : "  [first best]"}${gen.reused ? "  (re-scored, not regenerated)" : ""}`);
    } catch (e) {
      // One case's failure never kills the run. It is recorded, not hidden.
      r.verdict = { pass: false, deterministicPass: false, judgePass: false, failures: ["scoring_error"] };
      r.error = e.message;
      console.log(`  ERROR ${c.id.padEnd(30)} scoring failed: ${e.message}  (image kept: ${gen.url})`);
    }
    results.push(r);
    persist(); // after EVERY case, so a crash loses nothing already scored
  }

  persist();

  const n = results.length;
  const count = (fn) => results.filter(fn).length;
  const det = count((r) => r.verdict.deterministicPass);
  const jud = count((r) => r.verdict.judgePass);
  const all = count((r) => r.verdict.pass);
  const regress = count((r) => r.pairwise?.verdict === "worse");
  const dimLine = DIMENSIONS.map((d) => `${d} ${count((r) => r.judge?.dims?.[d]?.pass)}/${n}`).join(" · ");

  const row = `| ${stamp} | ${n} | ${all}/${n} | ${det}/${n} | ${jud}/${n} | ${regress} | ${runSpent} | ${dimLine} |\n`;
  const hist = path.join(HERE, "HISTORY.md");
  if (!fs.existsSync(hist)) {
    fs.writeFileSync(hist, "# Eval history\n\nOne row per live run. Exit criteria (launch-loop-plan §5.4): ≥26/30 deterministic, ≥24/30 judge, 0 regressions.\n\n| run | cases | all-pass | deterministic | judge | regressed | credits | per-dimension |\n|---|---|---|---|---|---|---|---|\n");
  }
  fs.appendFileSync(hist, row);

  console.log(`\n  all-pass ${all}/${n} · deterministic ${det}/${n} · judge ${jud}/${n} · regressed ${regress}`);
  console.log(`  ${dimLine}`);
  console.log(`  spent ${runSpent} credits (today ${ledger.days[dayKey()]}/${BUDGET.daily}, total ${ledger.total}/${BUDGET.total}) · judge tokens ${judgeTokens}`);
  console.log(`  evidence: scripts/eval/runs/${stamp}/\n`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error("eval failed:", e.message); process.exit(2); });
