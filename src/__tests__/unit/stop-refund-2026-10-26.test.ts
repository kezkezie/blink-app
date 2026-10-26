import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));

import { AT_COST_USD_PER_CREDIT, NET_CREDIT_USD, atCostSplit, readingStopCredits, stopMessage, stopSplit, transcriptionUsd } from "@/lib/stop-refund";
import { USD_PER_CREDIT } from "@/lib/ai-usage";
import { CHEAPEST_CREDIT_USD, WORST_FEE } from "@/lib/admin";

describe("a stop never costs BlinkSpot money (2026-10-26)", () => {
  it("values a kept credit at the least a credit ever brings in", () => {
    expect(NET_CREDIT_USD).toBeCloseTo(CHEAPEST_CREDIT_USD * (1 - WORST_FEE), 10);
    expect(AT_COST_USD_PER_CREDIT).toBe(USD_PER_CREDIT);
  });

  it("keeps what the provider bills, gives back the rest", () => {
    // A Best picture: 18 credits = $0.09 at the image service.
    expect(atCostSplit(18)).toEqual({ kept: 12, back: 6 });
    // A 4 second video at 4 credits a second.
    expect(atCostSplit(16)).toEqual({ kept: 11, back: 5 });
    // A Draft picture (1 credit): nothing to give back once it has started.
    expect(atCostSplit(1)).toEqual({ kept: 1, back: 0 });
    // Never keeps more than was charged, never gives back more.
    expect(stopSplit(4, 10)).toEqual({ kept: 4, back: 0 });
    expect(stopSplit(10, 0)).toEqual({ kept: 0, back: 10 });
  });

  it("for every price, what's kept pays the provider at the cheapest credit", () => {
    for (let charged = 1; charged <= 2000; charged++) {
      const { kept, back } = atCostSplit(charged);
      expect(kept + back).toBe(charged);
      expect(kept * NET_CREDIT_USD + 1e-9).toBeGreaterThanOrEqual(Math.min(charged * NET_CREDIT_USD, charged * AT_COST_USD_PER_CREDIT));
    }
  });

  it("charges a stopped reading what it cost, within its cap", () => {
    expect(readingStopCredits(30)).toBe(4);
    expect(readingStopCredits(2)).toBe(2);
    expect(transcriptionUsd(60, false)).toBeCloseTo(0.006, 6);
  });

  it("says what happened", () => {
    expect(stopMessage(6, 12)).toBe("Stopped. 6 credits back; 12 credits paid the AI service, which had already started.");
    expect(stopMessage(1, 0)).toBe("Stopped. 1 credit is back.");
    expect(stopMessage(0, 0)).toBe("Stopped. Nothing was charged.");
    expect(stopMessage(0, 1)).toBe("Stopped. The 1 credit paid the AI service, which had already started.");
  });
});
