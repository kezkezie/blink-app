import { describe, expect, it } from "vitest";
import { nextMonthStart, openAiUsd, usageRow } from "@/lib/ai-usage";
import { ASK_INCLUDED_PER_MONTH, PLANS, askIncludedPerMonth } from "@/lib/plans";

/** Cost logging and Ask's monthly allowance (Kezie, 2026-10-20). */
describe("ai usage rows", () => {
  it("cleans a row for the table: ids, feature names, tokens, money", () => {
    const r = usageRow({ feature: "assistedCreation", provider: "openai", model: "gpt-4o", clientId: "not-a-uuid", brandId: "8c6f1f9e-1b2a-4c3d-9e8f-0a1b2c3d4e5f", usage: { input: 1200.4, output: -3 }, usd: 0.0123456, credits: 2.6, units: 400 });
    expect(r.feature).toBe("assisted_creation");
    expect(r.client_id).toBeNull();
    expect(r.brand_id).toBe("8c6f1f9e-1b2a-4c3d-9e8f-0a1b2c3d4e5f");
    expect(r.input_tokens).toBe(1200); expect(r.output_tokens).toBe(0);
    expect(r.usd).toBe(0.01235);
    expect(r.credits_charged).toBe(3);
    expect(r.units).toBe(100);
    expect(r.ok).toBe(true); expect(r.included).toBe(false);
  });
  it("prices OpenAI calls from list prices", () => {
    expect(openAiUsd("gpt-4o", 1_000_000, 100_000)).toBeCloseTo(3.5);
    expect(openAiUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15);
    expect(openAiUsd("nope", 1, 1)).toBeNull();
  });
});

describe("Ask's monthly allowance", () => {
  it("is what Kezie approved, and the plans say it", () => {
    expect(ASK_INCLUDED_PER_MONTH).toEqual({ free: 30, starter: 300, pro: 600, agency: 1500 });
    expect(askIncludedPerMonth("enterprise")).toBe(1500);
    expect(askIncludedPerMonth(null)).toBe(30);
    for (const p of PLANS) expect(p.features.join(" ")).toContain(`${ASK_INCLUDED_PER_MONTH[p.id].toLocaleString("en-US")} messages a month`);
  });
  it("comes back on the 1st", () => {
    expect(nextMonthStart(new Date("2026-10-20T10:00:00Z"))).toBe("1 November");
    expect(nextMonthStart(new Date("2026-12-31T23:00:00Z"))).toBe("1 January");
  });
});
