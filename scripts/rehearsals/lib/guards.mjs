/**
 * Shared safety guards for the committed rehearsal suites.
 *
 * These are PURE functions wherever possible so they can be unit-tested in CI
 * without network access (see src/__tests__/unit/rehearsal-guards.test.ts).
 *
 * Design rules, all of them load-bearing:
 *  - No credential, token, email or password is ever committed or printed. Every
 *    secret is read from the environment at run time and only ever used as a
 *    header value.
 *  - DRY RUN IS THE DEFAULT. A rehearsal mutates nothing unless `--live` is passed.
 *  - Live mode additionally requires an allowlisted non-customer test client, a
 *    unique run id, and a hard ceiling on credit movement.
 *  - HTTP 0 / "000" (curl's connection-failure code) is NEVER success. Neither is
 *    "the command exited". A previous cleanup silently did nothing because every
 *    request returned 000 and the script treated completion as done.
 */

/** Non-customer test clients that live rehearsals may touch. UUIDs, not secrets. */
export const ALLOWED_TEST_CLIENTS = Object.freeze([
  "1c51553f-7abc-4ab8-ba92-4b130b05df64",
]);

/** Hard ceiling on credit movement for a single live run, unless lowered by flag. */
export const DEFAULT_MAX_CREDIT_MOVEMENT = 60;

/**
 * Provider CREATE / STATUS endpoints a rehearsal must never contact — these are
 * the ones that start or poll billable work. Asserted structurally against the
 * script's own source.
 *
 * Deliberately NOT listed: `api.replicate.com/v1/predictions` as a bare GET list.
 * That read is how a rehearsal PROVES no prediction was created, so forbidding it
 * would remove the evidence. It creates nothing: the billable create path is the
 * model-scoped `/v1/models/{owner}/{name}/predictions`, which IS forbidden below.
 */
export const FORBIDDEN_PROVIDER_HOSTS = Object.freeze([
  "api.replicate.com/v1/models/",
  "api.kie.ai/api/v1/jobs/createTask",
  "api.kie.ai/api/v1/jobs/recordInfo",
  "api.openai.com",
]);

/** Read-only provider endpoints permitted solely to prove nothing was created. */
export const ALLOWED_READONLY_PROVIDER_READS = Object.freeze([
  "api.replicate.com/v1/predictions",
]);

export function parseArgs(argv) {
  const args = { live: false, maxCredits: DEFAULT_MAX_CREDIT_MOVEMENT, client: ALLOWED_TEST_CLIENTS[0] };
  for (const a of argv) {
    if (a === "--live") args.live = true;
    else if (a.startsWith("--max-credits=")) args.maxCredits = Number(a.split("=")[1]);
    else if (a.startsWith("--client=")) args.client = a.split("=")[1];
  }
  return args;
}

/** A run id makes every disposable resource attributable to one invocation. */
export function makeRunId(now = Date.now(), rand = Math.random) {
  return `reh_${now}_${Math.floor(rand() * 1e6).toString(36)}`;
}

export function assertAllowlistedClient(clientId) {
  if (!ALLOWED_TEST_CLIENTS.includes(clientId)) {
    throw new Error(`client ${clientId} is not in the rehearsal allowlist — refusing to touch it`);
  }
  return true;
}

export function assertCreditCeiling(maxCredits) {
  if (!Number.isFinite(maxCredits) || maxCredits <= 0 || maxCredits > DEFAULT_MAX_CREDIT_MOVEMENT) {
    throw new Error(`credit ceiling ${maxCredits} must be > 0 and <= ${DEFAULT_MAX_CREDIT_MOVEMENT}`);
  }
  return true;
}

/**
 * Positive verification of an HTTP result. Anything that is not a real 2xx/3xx/4xx
 * response from the server is a FAILURE, including curl's 0/000 connection error.
 */
export function isPositiveHttp(status) {
  const n = Number(status);
  return Number.isInteger(n) && n >= 200 && n < 500;
}

/** A successful mutation must be an explicit 2xx. */
export function isMutationOk(status) {
  const n = Number(status);
  return Number.isInteger(n) && n >= 200 && n < 300;
}

/** Cleanup is proven by a RE-READ showing absence, never by the delete's exit code. */
export function assertAbsent(label, rowsAfterReRead) {
  if (!Array.isArray(rowsAfterReRead)) {
    throw new Error(`${label}: cleanup could not be verified (re-read did not return a list)`);
  }
  if (rowsAfterReRead.length !== 0) {
    throw new Error(`${label}: ${rowsAfterReRead.length} resource(s) still present after cleanup`);
  }
  return true;
}

/** Tracks credit movement and refuses to exceed the ceiling. */
export function makeBudget(maxCredits) {
  assertCreditCeiling(maxCredits);
  let spent = 0;
  return {
    spend(amount) {
      if (spent + amount > maxCredits) {
        throw new Error(`credit ceiling exceeded: ${spent}+${amount} > ${maxCredits}`);
      }
      spent += amount;
      return spent;
    },
    get spent() {
      return spent;
    },
  };
}

/**
 * Structural provider block: a rehearsal's own source must not reference a
 * provider create/status endpoint. This is a self-check so the guarantee does not
 * rely on reviewer memory.
 */
export function assertNoProviderEndpoints(sourceText, label = "script") {
  // Only create/status endpoints are forbidden; a GET prediction list is the
  // evidence that nothing was created, so it is explicitly permitted.
  const hits = FORBIDDEN_PROVIDER_HOSTS.filter((h) => sourceText.includes(h));
  if (hits.length) {
    throw new Error(`${label} references forbidden provider endpoint(s): ${hits.join(", ")}`);
  }
  return true;
}

/** Every IF node must nest {options, conditions, combinator} inside
 *  parameters.conditions. A flat array or empty set silently evaluates TRUE. */
export function findMalformedIfNodes(workflow) {
  const problems = [];
  for (const node of workflow?.nodes ?? []) {
    if (!String(node.type ?? "").endsWith(".if")) continue;
    const cond = node.parameters?.conditions;
    if (Array.isArray(cond)) {
      problems.push(`${node.name}: conditions array at the wrong depth — n8n ignores it and always takes TRUE`);
    } else if (!cond || typeof cond !== "object") {
      problems.push(`${node.name}: parameters.conditions is not an object`);
    } else if (!Array.isArray(cond.conditions) || cond.conditions.length === 0) {
      problems.push(`${node.name}: empty condition set — always evaluates TRUE`);
    }
  }
  return problems;
}

/** Ledger attribution for one disposable attempt. */
export function marker(postId) {
  return `[vid:${postId}]`;
}

export function summarizeLedger(rows, postId) {
  const mine = (rows ?? []).filter((r) => typeof r.description === "string" && r.description.includes(marker(postId)));
  const deductions = mine.filter((r) => r.operation === "video_generation" && Number(r.amount) < 0);
  const refunds = mine.filter((r) => r.operation === "refund" && Number(r.amount) > 0);
  return {
    deductions: deductions.length,
    refunds: refunds.length,
    net: mine.reduce((s, r) => s + Number(r.amount), 0),
  };
}

/** At most one refund per deduction, and never a refund without one. */
export function assertRefundInvariant(summary, label = "ledger") {
  if (summary.refunds > summary.deductions) {
    throw new Error(`${label}: ${summary.refunds} refund(s) for ${summary.deductions} deduction(s) — double refund`);
  }
  return true;
}

export function ok(label, extra = "") {
  console.log(`  PASS  ${label}${extra ? `  — ${extra}` : ""}`);
}
export function bad(label, extra = "") {
  console.log(`  FAIL  ${label}${extra ? `  — ${extra}` : ""}`);
}
