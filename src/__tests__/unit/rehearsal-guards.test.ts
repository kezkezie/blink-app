import { describe, expect, it } from "vitest";
// Plain .mjs helper module shared with the rehearsal scripts (no types needed).
import * as guards from "../../../scripts/rehearsals/lib/guards.mjs";

/**
 * CI-safe tests for the rehearsal safety guards.
 *
 * The rehearsal SCRIPTS live under scripts/, which vitest never includes, so they
 * can never run automatically in unit tests, builds or CI. These tests cover the
 * PURE guard functions only — no network, no database, no provider.
 */

describe("rehearsal guards: default mode is non-mutating", () => {
  it("defaults to dry run with the ceiling and allowlisted client", () => {
    const a = guards.parseArgs([]);
    expect(a.live).toBe(false);
    expect(a.maxCredits).toBe(guards.DEFAULT_MAX_CREDIT_MOVEMENT);
    expect(guards.ALLOWED_TEST_CLIENTS).toContain(a.client);
  });

  it("only turns live on with an explicit --live flag", () => {
    expect(guards.parseArgs(["--max-credits=20"]).live).toBe(false);
    expect(guards.parseArgs(["--live"]).live).toBe(true);
  });
});

describe("rehearsal guards: allowlist and credit ceiling", () => {
  it("refuses any client that is not allowlisted", () => {
    expect(() => guards.assertAllowlistedClient("00000000-0000-0000-0000-000000000000")).toThrow(/not in the rehearsal allowlist/);
    expect(guards.assertAllowlistedClient(guards.ALLOWED_TEST_CLIENTS[0])).toBe(true);
  });

  it("refuses a ceiling above the hard cap, or a nonsensical one", () => {
    for (const bad of [0, -1, 5000, Number.NaN, guards.DEFAULT_MAX_CREDIT_MOVEMENT + 1]) {
      expect(() => guards.assertCreditCeiling(bad), String(bad)).toThrow();
    }
    expect(guards.assertCreditCeiling(guards.DEFAULT_MAX_CREDIT_MOVEMENT)).toBe(true);
  });

  it("stops spending at the ceiling", () => {
    const b = guards.makeBudget(40);
    expect(b.spend(20)).toBe(20);
    expect(b.spend(20)).toBe(40);
    expect(() => b.spend(20)).toThrow(/credit ceiling exceeded/);
    expect(b.spent).toBe(40);
  });

  it("gives every run a unique attributable id", () => {
    expect(guards.makeRunId(1, () => 0.5)).not.toBe(guards.makeRunId(2, () => 0.5));
    expect(guards.makeRunId()).toMatch(/^reh_\d+_/);
  });
});

describe("rehearsal guards: HTTP 000 is never success", () => {
  it("treats a connection failure as failure, not success", () => {
    // The real incident: every cleanup request returned 000 and the script
    // reported success, leaving an authenticated test webhook live.
    for (const s of [0, "000", null, undefined, "", Number.NaN, 999]) {
      expect(guards.isPositiveHttp(s as never), String(s)).toBe(false);
      expect(guards.isMutationOk(s as never), String(s)).toBe(false);
    }
  });

  it("accepts a real server response, and only 2xx as a successful mutation", () => {
    expect(guards.isPositiveHttp(200)).toBe(true);
    expect(guards.isPositiveHttp(404)).toBe(true);
    expect(guards.isMutationOk(204)).toBe(true);
    expect(guards.isMutationOk(404)).toBe(false);
  });
});

describe("rehearsal guards: cleanup is proven by re-read", () => {
  it("passes only on a verified empty re-read", () => {
    expect(guards.assertAbsent("rows", [])).toBe(true);
    expect(() => guards.assertAbsent("rows", [{ id: "x" }])).toThrow(/still present after cleanup/);
    // A non-list means the re-read itself failed — that is not proof of deletion.
    expect(() => guards.assertAbsent("rows", null as never)).toThrow(/could not be verified/);
  });
});

describe("rehearsal guards: provider create/status endpoints are structurally blocked", () => {
  it("rejects a script that references a create or status endpoint", () => {
    for (const host of guards.FORBIDDEN_PROVIDER_HOSTS) {
      expect(() => guards.assertNoProviderEndpoints(`fetch("https://${host}foo")`, "t")).toThrow(/forbidden provider endpoint/);
    }
  });

  it("permits the read-only prediction list, which is the no-creation evidence", () => {
    for (const allowed of guards.ALLOWED_READONLY_PROVIDER_READS) {
      expect(guards.assertNoProviderEndpoints(`fetch("https://${allowed}")`, "t")).toBe(true);
    }
  });
});

describe("rehearsal guards: IF-node schema validation", () => {
  it("flags a conditions array at the wrong depth (always evaluates TRUE)", () => {
    const problems = guards.findMalformedIfNodes({
      nodes: [{ name: "Bad", type: "n8n-nodes-base.if", parameters: { conditions: [{ leftValue: "x" }] } }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/wrong depth/);
  });

  it("flags an empty condition set", () => {
    const problems = guards.findMalformedIfNodes({
      nodes: [{ name: "Empty", type: "n8n-nodes-base.if", parameters: { conditions: { conditions: [], combinator: "and" } } }],
    });
    expect(problems[0]).toMatch(/empty condition set/);
  });

  it("accepts a correctly nested condition and ignores non-IF nodes", () => {
    expect(guards.findMalformedIfNodes({
      nodes: [
        { name: "Good", type: "n8n-nodes-base.if", parameters: { conditions: { conditions: [{ leftValue: "x" }], combinator: "and" } } },
        { name: "Http", type: "n8n-nodes-base.httpRequest", parameters: {} },
      ],
    })).toEqual([]);
  });
});

describe("rehearsal guards: ledger attribution and the refund invariant", () => {
  const POST = "353aeac3-93d6-455c-9fc2-f0bc9e2531d0";
  const OTHER = "99999999-9999-4999-8999-999999999999";

  it("attributes only rows carrying this attempt's bounded marker", () => {
    const s = guards.summarizeLedger([
      { operation: "video_generation", amount: -20, description: `x ${guards.marker(POST)}` },
      { operation: "refund", amount: 20, description: `y ${guards.marker(POST)}` },
      { operation: "video_generation", amount: -20, description: `z ${guards.marker(OTHER)}` },
    ], POST);
    expect(s).toEqual({ deductions: 1, refunds: 1, net: 0 });
  });

  it("fails when a refund exceeds its deduction (double refund)", () => {
    expect(() => guards.assertRefundInvariant({ deductions: 1, refunds: 2, net: 20 })).toThrow(/double refund/);
    expect(guards.assertRefundInvariant({ deductions: 1, refunds: 1, net: 0 })).toBe(true);
    expect(guards.assertRefundInvariant({ deductions: 1, refunds: 0, net: -20 })).toBe(true);
  });
});
