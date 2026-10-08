import { describe, expect, it } from "vitest";
// Plain .mjs modules shared with scripts/eval (no network, no images).
import { BUDGET, GOLDEN_BRANDS, INTENTS, EVAL_CLIENT } from "../../../scripts/eval/lib/config.mjs";
import { buildCases, referencesFor } from "../../../scripts/eval/lib/cases.mjs";
import { canSpend, recordSpend, emptyLedger } from "../../../scripts/eval/lib/spend.mjs";
import { hexToRgb, brandPalette, paletteCoverage, aspectMatches, checkRenditionUrl } from "../../../scripts/eval/lib/checks.mjs";
import { caseVerdict, DIMENSIONS } from "../../../scripts/eval/lib/judge.mjs";
import { ALLOWED_TEST_CLIENTS } from "../../../scripts/rehearsals/lib/guards.mjs";

/**
 * CI-safe tests for the eval harness. The harness itself lives under scripts/,
 * which vitest never collects, so it cannot run (or spend) during tests or builds.
 */

describe("eval harness: scope and isolation", () => {
  it("only ever targets the allowlisted non-customer client", () => {
    expect(ALLOWED_TEST_CLIENTS).toContain(EVAL_CLIENT);
  });

  it("has 6 golden brands x 5 intents = 30 cases", () => {
    const brands = GOLDEN_BRANDS.map((g: { key: string }) => ({ key: g.key }));
    expect(buildCases(brands)).toHaveLength(30);
  });

  it("the subset is 6 cases that still cover every brand AND every intent", () => {
    const brands = GOLDEN_BRANDS.map((g: { key: string }) => ({ key: g.key }));
    const sub = buildCases(brands, { subset: true });
    expect(sub).toHaveLength(6);
    expect(new Set(sub.map((c: { brand: { key: string } }) => c.brand.key)).size).toBe(6);
    expect(new Set(sub.map((c: { intent: { key: string } }) => c.intent.key)).size).toBe(INTENTS.length);
  });

  it("text-bearing intents use the only style that permits text", () => {
    // Every other Smart Router style appends "NO TEXT anywhere".
    for (const i of INTENTS.filter((x: { expectsText: boolean }) => x.expectsText)) expect(i.style).toBe("poster");
  });

  it("references are https only and capped", () => {
    const refs = referencesFor({ uploaded_assets: ["https://a/1.png", "http://b/2.png", "https://c/3.png", "https://d/4.png"] });
    expect(refs).toEqual(["https://a/1.png", "https://c/3.png"]);
    expect(referencesFor({})).toEqual([]);
  });
});

describe("eval harness: budget", () => {
  it("allows spend within every cap", () => {
    expect(canSpend(emptyLedger(), 8).ok).toBe(true);
  });

  it("enforces the per-run cap", () => {
    expect(canSpend(emptyLedger(), 8, { runSpent: 56, runCap: 60 }).reason).toMatch(/run cap/);
  });

  it("refuses a run cap above the hard cap", () => {
    expect(canSpend(emptyLedger(), 8, { runCap: BUDGET.perRunHard + 1 }).reason).toMatch(/hard cap/);
  });

  it("enforces the daily cap", () => {
    const l = recordSpend(emptyLedger(), BUDGET.daily - 4, { day: "2026-09-29" });
    expect(canSpend(l, 8, { day: "2026-09-29", runCap: BUDGET.perRunHard }).reason).toMatch(/daily cap/);
    // A new day resets the daily allowance but not the total.
    expect(canSpend(l, 8, { day: "2026-09-30", runCap: BUDGET.perRunHard }).ok).toBe(true);
  });

  it("enforces the total cap and says to check in", () => {
    let l = emptyLedger();
    // fill exactly to the configured total cap (raised to 6,000 for the KYRA build, 2026-10-08)
    const days = 8, per = BUDGET.total / days;
    for (let d = 0; d < days; d += 1) l = recordSpend(l, per, { day: `2026-10-0${d + 1}` });
    expect(l.total).toBe(BUDGET.total);
    expect(canSpend(l, 8, { day: "2026-10-20", runCap: BUDGET.perRunHard }).reason).toMatch(/Check in with Kezie/);
  });

  it("rejects nonsense amounts", () => {
    for (const bad of [0, -8, Number.NaN]) expect(canSpend(emptyLedger(), bad).ok).toBe(false);
  });

  it("records every entry with a running total", () => {
    const l = recordSpend(recordSpend(emptyLedger(), 8, { day: "d" }), 8, { day: "d" });
    expect(l.total).toBe(16);
    expect(l.days.d).toBe(16);
    expect(l.entries).toHaveLength(2);
  });
});

describe("eval harness: deterministic checks", () => {
  it("parses hex colours and rejects junk", () => {
    expect(hexToRgb("#1F1D1B")).toEqual([31, 29, 27]);
    expect(hexToRgb("DEDDDA")).toEqual([222, 221, 218]);
    expect(hexToRgb("red")).toBeNull();
  });

  it("builds a deduplicated palette from brand fields", () => {
    const p = brandPalette({ primary_color: "#000000", secondary_color: "#000000", accent_color: "#ffffff", additional_colors: ["bad", "#ff0000"] });
    expect(p).toEqual([[0, 0, 0], [255, 255, 255], [255, 0, 0]]);
  });

  it("measures palette coverage as a share of pixels", () => {
    // 4 pixels: 2 near black, 1 near white, 1 pure green.
    const px = new Uint8Array([5, 5, 5, 0, 10, 0, 250, 250, 250, 0, 255, 0]);
    expect(paletteCoverage(px, [[0, 0, 0]])).toBe(0.5);
    expect(paletteCoverage(px, [[0, 0, 0], [255, 255, 255]])).toBe(0.75);
    expect(paletteCoverage(px, [])).toBeNull();
  });

  it("fetches a small Cloudinary rendition for pixel checks, and leaves other URLs alone", () => {
    expect(checkRenditionUrl("https://res.cloudinary.com/dap8jijxa/image/upload/v1/x.png"))
      .toBe("https://res.cloudinary.com/dap8jijxa/image/upload/w_512/v1/x.png");
    expect(checkRenditionUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });

  it("checks aspect ratio with tolerance", () => {
    expect(aspectMatches(928, 1152, "4:5")).toBe(true);
    expect(aspectMatches(1024, 1024, "4:5")).toBe(false);
  });
});

describe("eval harness: verdicts", () => {
  const allPass = Object.fromEntries(DIMENSIONS.map((d: string) => [d, { pass: true, reason: "" }]));

  it("passes only when every check and dimension passes", () => {
    const v = caseVerdict({ deterministic: { aspect: { pass: true }, palette: { pass: true } }, judge: { dims: allPass } });
    expect(v.pass).toBe(true);
  });

  it("a missing judge is a failure, never a silent pass", () => {
    const v = caseVerdict({ deterministic: { aspect: { pass: true } }, judge: null });
    expect(v.pass).toBe(false);
    expect(v.failures).toContain("judge_missing");
  });

  it("names exactly which checks failed", () => {
    const dims = { ...allPass, text_quality: { pass: false, reason: "misspelled" } };
    const v = caseVerdict({ deterministic: { aspect: { pass: false }, palette: { pass: null } }, judge: { dims } });
    expect(v.failures).toEqual(["aspect", "text_quality"]);
  });
});
