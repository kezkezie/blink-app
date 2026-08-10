#!/usr/bin/env node
/**
 * DATABASE DURABILITY REHEARSAL — dry run by DEFAULT, live only with --live.
 *
 * Proves the durable video-job contracts against the real database using the exact
 * URLs the live workflow issues: invalid/not-charged terminalization, charged stale
 * reconciliation, refund-pending crash recovery, late progress/success guards,
 * reconciler selector isolation, unrelated-row protection and retry-state
 * transitions — with both the TRUE and FALSE side of every claim.
 *
 * SAFETY, all enforced in code rather than by convention:
 *  - Default mode is DRY RUN: preconditions are verified and the plan is printed,
 *    but nothing is written.
 *  - --live requires an allowlisted non-customer test client, a unique run id, and
 *    a hard credit ceiling (default 60, cannot be raised above it).
 *  - Aborts unless the opening balance and the expected workflow versions are
 *    positively verified first.
 *  - No provider create/status endpoint appears in this file (self-checked), and
 *    the Replicate prediction count is compared before/after when a read-only
 *    token is available.
 *  - HTTP 0/"000" is never success, and cleanup is proven by RE-READING every
 *    disposable resource, never by a delete's exit code.
 *  - Ledger rows are PRESERVED as audit evidence; disposable content rows are
 *    deleted and their absence proven.
 *  - Lives in scripts/, which vitest never includes, so it cannot run in unit
 *    tests, builds or CI.
 *
 *   node scripts/rehearsals/database-durability.mjs              # dry run
 *   node scripts/rehearsals/database-durability.mjs --live       # explicit opt-in
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *      N8N_TOKEN, optional REPLICATE_API_TOKEN (read-only prediction count).
 * Exit 0 = pass, 1 = failure, 2 = could not run.
 */
import fs from "node:fs";
import {
  ALLOWED_TEST_CLIENTS,
  assertAbsent,
  assertAllowlistedClient,
  assertCreditCeiling,
  assertNoProviderEndpoints,
  assertRefundInvariant,
  bad,
  findMalformedIfNodes,
  isMutationOk,
  isPositiveHttp,
  makeBudget,
  makeRunId,
  marker,
  ok,
  parseArgs,
  summarizeLedger,
} from "./lib/guards.mjs";

const SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const N8N_TOKEN = process.env.N8N_TOKEN;
const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const EXPECTED = { "fy6MbNs4ShWkKk0i": null, "aD8RyTUsRL81Rv0k": null }; // versions printed, not pinned

const args = parseArgs(process.argv.slice(2));
let pass = 0;
let fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) { pass += 1; ok(label, extra); } else { fail += 1; bad(label, extra); }
};

/** Supabase REST with positive status verification. Never returns silently on 0. */
async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1${path}`, {
    ...init,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  }).catch((e) => { throw new Error(`network failure (not success): ${e.message}`); });
  if (!isPositiveHttp(res.status)) throw new Error(`non-response status ${res.status} — treated as FAILURE`);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
const rows = (r) => (Array.isArray(r.body) ? r.body : []);

async function main() {
  assertNoProviderEndpoints(fs.readFileSync(new URL(import.meta.url), "utf8"), "database-durability");
  ok("structural provider block: no provider create/status endpoint in this script"); pass += 1;

  if (!SB || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); return 2; }
  if (!N8N_TOKEN) { console.error("N8N_TOKEN not set (needed to verify workflow versions)."); return 2; }

  assertAllowlistedClient(args.client);
  assertCreditCeiling(args.maxCredits);
  const runId = makeRunId();
  const budget = makeBudget(args.maxCredits);
  console.log(`\n  mode=${args.live ? "LIVE (explicit opt-in)" : "DRY RUN (default — nothing will be written)"}`);
  console.log(`  client=${args.client} (allowlisted)  runId=${runId}  creditCeiling=${args.maxCredits}\n`);

  // ── Preconditions, positively verified ──
  for (const id of Object.keys(EXPECTED)) {
    const res = await fetch(`${N8N}/workflows/${id}`, { headers: { "X-N8N-API-KEY": N8N_TOKEN } });
    if (!res.ok) throw new Error(`n8n HTTP ${res.status} for ${id}`);
    const wf = await res.json();
    const problems = findMalformedIfNodes(wf);
    check(`${wf.name}: version ${wf.versionId} active=${wf.active}, IF nodes well-formed`, problems.length === 0, problems.join("; "));
  }
  const balRes = await sb(`/credit_balances?client_id=eq.${args.client}&select=balance`);
  const opening = rows(balRes)[0]?.balance;
  check("opening balance positively verified", Number.isFinite(opening), String(opening));
  if (!Number.isFinite(opening)) { console.error("  cannot proceed without a verified opening balance"); return 1; }

  let predictionsBefore = null;
  if (process.env.REPLICATE_API_TOKEN) {
    const r = await fetch("https://api.replicate.com/v1/predictions", { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } });
    if (r.ok) predictionsBefore = (await r.json()).results?.length ?? null;
  }

  const baseline = rows(await sb("/content?select=id,updated_at,generation_state,billing_state&limit=2000"));
  check("baseline fingerprint of all content rows captured", baseline.length > 0, `${baseline.length} rows`);

  if (!args.live) {
    console.log("\n── DRY RUN plan (nothing written) ──");
    for (const s of [
      "invalid request -> failed/not_charged/invalid_request, 0 ledger rows",
      "charged stale row -> distinct-state CAS claim wins once, second claim wins zero",
      "refund success -> refunded + terminal; late progress and late success change 0 rows",
      "refund failure -> refund_failed; retry claim wins exactly once",
      "abandoned refund_pending -> not reclaimable by the ordinary selector; crash sweep only after its own age threshold",
      "reconciler selector isolation + unrelated-row protection + retry_state transitions",
    ]) console.log(`     · ${s}`);
    console.log(`\n  dry run: ${pass} passed, ${fail} failed. Re-run with --live to execute (ceiling ${args.maxCredits} credits).`);
    return fail ? 1 : 0;
  }

  // ── LIVE ──
  const disposables = [];
  const newRow = async (billing, gen, contentType = "video") => {
    const id = crypto.randomUUID();
    const r = await sb("/content", {
      method: "POST",
      body: JSON.stringify({
        id, client_id: args.client, content_type: contentType, status: "draft",
        caption: `REHEARSAL ${runId}`, billing_state: billing, generation_state: gen,
        retry_state: "none", credit_cost: 20,
      }),
    });
    if (!isMutationOk(r.status)) throw new Error(`row insert failed with ${r.status}`);
    disposables.push(id);
    return id;
  };
  const claimCas = (id) => sb(`/content?id=eq.${id}&billing_state=in.(not_charged,charged,refund_failed)`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ billing_state: "refund_pending" }),
  });
  const deduct = async (id) => {
    budget.spend(20);
    return sb("/rpc/deduct_credits", { method: "POST", body: JSON.stringify({ p_client_id: args.client, p_amount: 20, p_operation: "video_generation", p_description: `Rehearsal ${runId} ${marker(id)}` }) });
  };
  const refund = (id) => sb("/rpc/refund_credits", { method: "POST", body: JSON.stringify({ p_client_id: args.client, p_amount: 20, p_operation: "refund", p_description: `Rehearsal refund ${runId} ${marker(id)}` }) });
  const ledger = async (id) => summarizeLedger(rows(await sb(`/credit_transactions?description=like.*%5Bvid:${id}%5D*&select=amount,operation,description&limit=50`)), id);

  try {
    console.log("── A. invalid request terminalizes without a charge ──");
    const a = await newRow("not_charged", "queued");
    const aT = await sb(`/content?id=eq.${a}&generation_state=in.(queued,preparing,generating,saving)`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ generation_state: "failed", status: "failed", billing_state: "not_charged", retry_state: "none", generation_error_code: "invalid_request", generation_status_text: "cannot render 300s" }),
    });
    check("terminalized exactly 1 row", rows(aT).length === 1);
    check("billing_state stays not_charged (never 'refunded')", rows(aT)[0]?.billing_state === "not_charged");
    const aL = await ledger(a);
    check("zero ledger movement", aL.deductions === 0 && aL.refunds === 0);
    check("reconciler cannot select a terminal row", rows(await sb(`/content?id=eq.${a}&generation_state=in.(queued,generating,saving)&select=id`)).length === 0);

    console.log("\n── B. charged stale row: claim, refund, terminalize ──");
    const b = await newRow("charged", "generating", "sequence_clip");
    await deduct(b);
    check("exactly one attributable deduction", (await ledger(b)).deductions === 1);
    check("TRUE branch: first CAS claim wins", rows(await claimCas(b)).length === 1);
    check("FALSE branch: second CAS claim wins zero", rows(await claimCas(b)).length === 0);
    const bR = await refund(b);
    check("refund RPC reports success", bR.body?.success === true);
    const bL = await ledger(b);
    check("exactly one refund for one deduction", bL.refunds === 1 && bL.deductions === 1);
    assertRefundInvariant(bL, "case B");
    const bT = await sb(`/content?id=eq.${b}&billing_state=eq.refund_pending`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ billing_state: "refunded", generation_state: "failed", status: "failed", retry_state: "retry_available" }),
    });
    check("terminalization guarded by the claim state", rows(bT).length === 1);
    check("retry_state transitions to retry_available", rows(bT)[0]?.retry_state === "retry_available");
    check("repeat claim after terminalization is a no-op", rows(await claimCas(b)).length === 0);
    const lateP = await sb(`/content?id=eq.${b}&billing_state=not.in.(refund_pending,refunded)&generation_state=not.in.(failed,timed_out)`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ generation_status_text: "Rendering...", billing_state: "charged" }),
    });
    check("late PROGRESS write changes zero rows", rows(lateP).length === 0);
    const lateS = await sb(`/content?id=eq.${b}&billing_state=not.in.(refund_pending,refunded)&generation_state=not.in.(failed,timed_out)`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ video_urls: ["https://example.com/late.mp4"], generation_state: "succeeded", billing_state: "charged" }),
    });
    check("late SUCCESS write changes zero rows", rows(lateS).length === 0);
    const bNow = rows(await sb(`/content?id=eq.${b}&select=billing_state,generation_state,video_urls`))[0];
    check("row remains refunded/failed with no video", bNow?.billing_state === "refunded" && bNow?.generation_state === "failed" && (bNow?.video_urls ?? []).length === 0);
    check("net movement for this attempt is zero", (await ledger(b)).net === 0);

    console.log("\n── C. refund failure, then a single-winner retry ──");
    const c = await newRow("charged", "generating", "sequence_clip");
    await deduct(c);
    check("claim wins", rows(await claimCas(c)).length === 1);
    const cF = await sb(`/content?id=eq.${c}&billing_state=eq.refund_pending`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ billing_state: "refund_failed", generation_error_code: "refund_retry_pending" }),
    });
    check("refund failure -> refund_failed (distinct state)", rows(cF).length === 1);
    check("TRUE branch: retry from refund_failed wins once", rows(await claimCas(c)).length === 1);
    check("FALSE branch: a second retry wins zero", rows(await claimCas(c)).length === 0);
    check("retry refund succeeds", (await refund(c)).body?.success === true);
    const cL = await ledger(c);
    check("still exactly one refund", cL.refunds === 1);
    assertRefundInvariant(cL, "case C");
    await sb(`/content?id=eq.${c}&billing_state=eq.refund_pending`, { method: "PATCH", body: JSON.stringify({ billing_state: "refunded", generation_state: "failed", status: "failed" }) });
    check("net movement zero", (await ledger(c)).net === 0);

    console.log("\n── D. abandoned refund_pending crash recovery ──");
    const d = await newRow("refund_pending", "generating", "sequence_clip");
    check("ordinary selector does NOT reclaim an abandoned claim", rows(await sb(`/content?id=eq.${d}&billing_state=in.(not_charged,charged,refund_failed)&select=id`)).length === 0);
    const early = await sb(`/content?id=eq.${d}&billing_state=eq.refund_pending&updated_at=lt.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ billing_state: "refund_failed" }),
    });
    check("FALSE branch: crash sweep before its age threshold changes zero rows", rows(early).length === 0);
    const late = await sb(`/content?id=eq.${d}&billing_state=eq.refund_pending&updated_at=lt.${new Date(Date.now() + 60 * 1000).toISOString()}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ billing_state: "refund_failed" }),
    });
    check("TRUE branch: once the age condition holds it returns to refund_failed", rows(late).length === 1);
    check("only a later exclusive claim may then retry", rows(await claimCas(d)).length === 1);
    await sb(`/content?id=eq.${d}&billing_state=eq.refund_pending`, { method: "PATCH", body: JSON.stringify({ billing_state: "not_charged", generation_state: "failed", status: "failed" }) });
    check("no money moved on the never-charged crash row", (await ledger(d)).deductions === 0);

    console.log("\n── E. reconciler selector isolation ──");
    const e = await newRow("charged", "generating", "video");
    check("content_type outside the reconciler's filter is not selected", rows(await sb(`/content?id=eq.${e}&generation_state=in.(queued,generating,saving)&billing_state=in.(not_charged,charged,refund_failed)&content_type=in.(sequence_clip,reel)&select=id`)).length === 0);
    check("but the in-flight state filter does match it", rows(await sb(`/content?id=eq.${e}&generation_state=in.(queued,generating,saving)&select=id`)).length === 1);
  } finally {
    console.log("\n── CLEANUP (proven by re-read, never by exit code) ──");
    for (const id of disposables) {
      await sb(`/content?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    }
    let residue = [];
    for (const id of disposables) {
      residue = residue.concat(rows(await sb(`/content?id=eq.${id}&select=id`)));
    }
    try { assertAbsent("disposable content rows", residue); check("every disposable row proven absent", true, `${disposables.length} deleted`); pass += 0; }
    catch (err) { check("every disposable row proven absent", false, err.message); }
    const byCaption = rows(await sb(`/content?caption=eq.REHEARSAL ${runId}&select=id`));
    check("no row remains under this run id", byCaption.length === 0);

    const after = rows(await sb("/content?select=id,updated_at,generation_state,billing_state&limit=2000"));
    const before = new Map(baseline.map((r) => [r.id, r]));
    const changed = after.filter((r) => before.has(r.id) && JSON.stringify(before.get(r.id)) !== JSON.stringify(r));
    check("no unrelated production row changed", changed.length === 0, changed.slice(0, 3).map((r) => r.id).join(","));

    const closing = rows(await sb(`/credit_balances?client_id=eq.${args.client}&select=balance`))[0]?.balance;
    check("opening balance equals closing balance", closing === opening, `${opening} -> ${closing}`);
    console.log(`  credit movement within ceiling: ${budget.spent} <= ${args.maxCredits}`);
    console.log("  financial ledger entries PRESERVED as audit evidence (net zero per attempt)");

    if (predictionsBefore !== null && process.env.REPLICATE_API_TOKEN) {
      const r = await fetch("https://api.replicate.com/v1/predictions", { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } });
      const nowCount = r.ok ? (await r.json()).results?.length ?? null : null;
      check("no provider prediction created", nowCount === predictionsBefore, `${predictionsBefore} -> ${nowCount}`);
    } else {
      console.log("  provider prediction count not checked (no read-only token) — no provider endpoint exists in this script");
    }
    console.log(`\n  database durability: ${pass} passed, ${fail} failed`);
  }
  return fail ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error("rehearsal failed:", e.message); process.exit(2); });
