#!/usr/bin/env node
/**
 * REFUND ORCHESTRATION REHEARSAL — non-mutating.
 *
 * Runs the JavaScript that is ACTUALLY DEPLOYED in the live Video V3 Error Trigger
 * chain (fetched read-only over the n8n API) against crafted fixtures, and asserts
 * BOTH the TRUE and FALSE branch of every gate.
 *
 * Why it exists: on 2026-08-05 five IF nodes were written with the conditions array
 * at the wrong schema depth. n8n silently treated that as "no conditions", so every
 * gate took the TRUE branch and four failure branches were dead code — including a
 * path that marked a never-charged row `refunded`. No happy-path test can catch
 * that, because the happy path wants the true branch.
 *
 * This script mutates NOTHING: no database write, no provider call, no credit
 * movement. It needs only a read-capable n8n token.
 *
 *   N8N_TOKEN=... node scripts/rehearsals/refund-orchestration.mjs
 *
 * Exit 0 = all assertions pass, 1 = a failure, 2 = could not run.
 */
import fs from "node:fs";
import {
  assertNoProviderEndpoints,
  findMalformedIfNodes,
  ok,
  bad,
} from "./lib/guards.mjs";

const N8N = "https://n8n.srv1166077.hstgr.cloud/api/v1";
const VIDEO_V3 = "fy6MbNs4ShWkKk0i";
const RECONCILER = "aD8RyTUsRL81Rv0k";
const TOKEN = process.env.N8N_TOKEN;

let pass = 0;
let fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) { pass += 1; ok(label, extra); } else { fail += 1; bad(label, extra); }
};

async function fetchWorkflow(id) {
  const res = await fetch(`${N8N}/workflows/${id}`, { headers: { "X-N8N-API-KEY": TOKEN } });
  if (!res.ok) throw new Error(`n8n returned HTTP ${res.status} for ${id}`);
  return res.json();
}

/** Execute a deployed Code node with stubbed n8n context. */
function runNode(src, nodeName, $json, executed = {}, outputs = {}) {
  const code = src[nodeName];
  if (!code) throw new Error(`node "${nodeName}" has no jsCode in the live workflow`);
  const $ = (name) => ({
    isExecuted: Boolean(executed[name]),
    first: () => ({ json: outputs[name] }),
    all: () => (outputs[name] ? [{ json: outputs[name] }] : []),
    item: { json: outputs[name] },
  });
  return new Function("$json", "$", code)($json, $)[0].json;
}
function throwsFrom(src, nodeName, $json, executed = {}, outputs = {}) {
  try { runNode(src, nodeName, $json, executed, outputs); return null; } catch (e) { return e.message; }
}

const CLIENT = "1c51553f-7abc-4ab8-ba92-4b130b05df64";
const POST = "353aeac3-93d6-455c-9fc2-f0bc9e2531d0";
const MARK = `[vid:${POST}]`;
const DEDUCTION = { operation: "video_generation", amount: -20, description: `Dynamic Video Generation ${MARK}` };
const REFUND = { operation: "refund", amount: 20, description: `Refund ${MARK}` };

const execPayload = (parseJson) => JSON.stringify({
  data: { resultData: { runData: {
    "Parse Inputs & Calculate Cost": [{ data: { main: [[{ json: parseJson }]] } }],
    "Webhook: Generate Video": [{ data: { main: [[{ json: { body: { client_id: CLIENT, post_id: POST } } }]] } }],
  } } },
});
const TRIGGER = { execution: { id: 1, lastNodeExecuted: "Replicate: Create Task", error: { message: "boom" } } };

async function main() {
  if (!TOKEN) { console.error("N8N_TOKEN not set — cannot fetch the deployed workflow."); return 2; }

  // Self-check: this script must not reference a provider endpoint.
  assertNoProviderEndpoints(fs.readFileSync(new URL(import.meta.url), "utf8"), "refund-orchestration");
  ok("structural provider block: this script references no provider create/status endpoint");
  pass += 1;

  const [v3, rec] = await Promise.all([fetchWorkflow(VIDEO_V3), fetchWorkflow(RECONCILER)]);
  console.log(`\n  Video V3 ${v3.versionId} (active=${v3.active}) · reconciler ${rec.versionId} (active=${rec.active})\n`);

  // ── GATE 0: IF-node schema. A malformed gate makes every later assertion moot.
  for (const [label, wf] of [["Video V3", v3], ["reconciler", rec]]) {
    const problems = findMalformedIfNodes(wf);
    check(`${label}: every IF node nests its conditions correctly`, problems.length === 0, problems.join("; "));
  }
  if (fail > 0) { console.error("\n  Malformed IF nodes — aborting before the rehearsal."); return 1; }

  const src = Object.fromEntries(v3.nodes.filter((n) => n.parameters?.jsCode).map((n) => [n.name, n.parameters.jsCode]));

  console.log("\n── context recovery ──");
  const ctxOk = runNode(src, "Extract Error Context", { data: execPayload({ clientId: CLIENT, postId: POST, totalCost: 20 }) }, { "Error Trigger": true }, { "Error Trigger": TRIGGER });
  check("TRUE branch: full context recovered", ctxOk.canProceed === true && ctxOk.clientId === CLIENT && ctxOk.postId === POST && ctxOk.amount === 20);
  for (const [label, input] of [
    ["no execution data", { data: undefined }],
    ["malformed JSON", { data: "<html>502</html>" }],
    ["empty runData", { data: JSON.stringify({ data: { resultData: { runData: {} } } }) }],
    ["missing amount", { data: execPayload({ clientId: CLIENT, postId: POST }) }],
    ["non-UUID client", { data: execPayload({ clientId: "nope", postId: POST, totalCost: 20 }) }],
  ]) {
    const c = runNode(src, "Extract Error Context", input, { "Error Trigger": true }, { "Error Trigger": TRIGGER });
    check(`FALSE branch: refuses to proceed (${label})`, c.canProceed === false && c.clientId !== "00000000-0000-0000-0000-000000000000" && !(c.amount > 0 && c.clientId && c.postId));
  }
  check("FALSE branch destination raises visibly", Boolean(throwsFrom(src, "Reconciliation Required", ctxOk && { ...ctxOk, canProceed: false })));

  console.log("\n── ledger authorization ──");
  const evalL = (rows) => runNode(src, "Evaluate Ledger", { data: JSON.stringify(rows) }, {}, { "Extract Error Context": ctxOk });
  const authed = evalL([DEDUCTION]);
  check("TRUE branch: one deduction, no refund -> authorized", authed.authorized === true, authed.authorizedReason);
  check("refund amount comes from the LEDGER, not the caller", authed.refundAmount === 20);
  check("FALSE branch: no deduction", evalL([]).authorized === false);
  check("FALSE branch: refund already exists (no double refund)", evalL([DEDUCTION, REFUND]).authorized === false);
  check("FALSE branch: ambiguous duplicate deductions", evalL([DEDUCTION, DEDUCTION]).authorized === false);
  check("FALSE branch: another post id is not attributable", evalL([{ ...DEDUCTION, description: "Dynamic Video Generation [vid:99999999-9999-4999-8999-999999999999]" }]).authorized === false);
  check("FALSE branch: unreadable ledger", runNode(src, "Evaluate Ledger", { data: "not json" }, {}, { "Extract Error Context": ctxOk }).authorized === false);

  console.log("\n── distinct-state CAS claim ──");
  const claim = (rows) => runNode(src, "Evaluate Claim", { data: JSON.stringify(rows) }, {}, { "Evaluate Ledger": authed });
  const won = claim([{ id: POST }]);
  check("TRUE branch: exactly one row claimed -> won", won.claimWon === true);
  check("FALSE branch: zero rows -> claim lost (no-op)", claim([]).claimWon === false);
  check("FALSE branch: unreadable claim response -> treated as lost", runNode(src, "Evaluate Claim", { data: undefined }, {}, { "Evaluate Ledger": authed }).claimWon === false);
  const selectors = JSON.stringify(v3.nodes.map((n) => n.parameters?.url ?? "")).match(/billing_state=in\.\([^)]*\)/g) ?? [];
  check("no claim selector contains refund_pending (self-transition would let two runners win)", selectors.every((s) => !s.includes("refund_pending")), selectors.join(" "));

  console.log("\n── refund response assertion (HTTP 200 is not business success) ──");
  const assertR = (data) => runNode(src, "Assert Refund Response", { data }, {}, { "Evaluate Claim": won });
  check('TRUE branch: {"success":true}', assertR('{"success":true}').refundSuccess === true);
  for (const [label, body] of [
    ["HTTP 200 with success:false", '{"success":false,"error":"No client profile found for this ID."}'],
    ["timeout / empty body", undefined],
    ["malformed JSON", "<html>504</html>"],
    ["missing success key", '{"ok":1}'],
    ['string "true" not boolean', '{"success":"true"}'],
  ]) {
    check(`FALSE branch: ${label}`, assertR(body).refundSuccess === false);
  }

  console.log("\n── post-refund ledger confirmation ──");
  const asserted = assertR('{"success":true}');
  const confirm = (rows) => runNode(src, "Confirm Ledger Refund", { data: JSON.stringify(rows) }, {}, { "Assert Refund Response": asserted });
  check("TRUE branch: exactly one matching refund confirmed", confirm([DEDUCTION, REFUND]).refundLedgerConfirmed === true);
  check("FALSE branch: no refund in ledger", confirm([DEDUCTION]).refundLedgerConfirmed === false);
  check("FALSE branch: wrong refund amount", confirm([DEDUCTION, { ...REFUND, amount: 8 }]).refundLedgerConfirmed === false);
  check("FALSE branch: two refunds present", confirm([DEDUCTION, REFUND, REFUND]).refundLedgerConfirmed === false);

  console.log("\n── terminalization guards (static) ──");
  const urlOf = (name) => v3.nodes.find((n) => n.name === name)?.parameters?.url ?? "";
  check("Mark Refunded and Failed is guarded by the claim state", urlOf("Mark Refunded and Failed").includes("billing_state=eq.refund_pending"));
  check("Mark Refund Failed is guarded by the claim state", urlOf("Mark Refund Failed").includes("billing_state=eq.refund_pending"));
  check("Terminalize Without Refund cannot overwrite a terminal row", urlOf("Terminalize Without Refund").includes("generation_state=not.in.(succeeded,failed,timed_out)"));
  check("Terminalize Invalid Request only touches a non-terminal row", urlOf("Terminalize Invalid Request").includes("generation_state=in.(queued,preparing,generating,saving)"));
  check("progress writes cannot resurrect a refunded row", urlOf("progress: Rendering").includes("billing_state=not.in.(refund_pending,refunded)"));
  check("success write cannot resurrect a refunded row", urlOf("Save Video to Supabase").includes("billing_state=not.in.(refund_pending,refunded)"));

  console.log(`\n  refund orchestration: ${pass} passed, ${fail} failed  (nothing was mutated)`);
  return fail ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error("rehearsal failed:", e.message); process.exit(2); });
