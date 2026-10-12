import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { meteredCredits } from "@/lib/credits-price";

/**
 * Ask BlinkSpot's billing (Kezie, 2026-10-12: credits unlock all AI, plans buy brands).
 * Included: the plan's levels within the day's messages, and editing on paid plans.
 * Everything else uses credits for what the reply cost, capped per level, checked before running.
 */
const h = vi.hoisted(() => ({
  plan: { tier: "free" as string },
  dayAllowed: true,
  balance: 100,
  consume: vi.fn(),
  run: vi.fn(),
  charge: vi.fn(),
}));
vi.mock("@/lib/execution-security", () => ({
  authenticateExecutionRequest: async () => ({ ok: true, value: "user-1" }),
  isExecutionBodySizeAllowed: () => true,
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "client-1", plan_tier: h.plan.tier } }), eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) },
}));
vi.mock("@/lib/ai-rate-limit", () => ({
  consumeAiLimits: h.consume,
  aiLimitFor: () => ({ limit: 10, windowSeconds: 86400 }),
}));
vi.mock("@/lib/assistant/tools", () => ({ loadAccountBrief: async () => undefined }));
vi.mock("@/lib/assistant/agent", () => ({
  AssistantUnavailableError: class extends Error {},
  runAssistant: h.run,
  estimateUsd: () => 0.012, // 2.4 credits at 200 per dollar -> 3
}));
vi.mock("@/lib/credits-meter", () => ({
  creditBalance: async () => h.balance,
  chargeCredits: h.charge,
  meteredCredits,
}));

import { POST } from "@/app/api/assistant/route";

const ask = (extra: Record<string, unknown> = {}) => POST(new NextRequest("http://localhost/api/assistant", {
  method: "POST", body: JSON.stringify({ messages: [{ role: "user", text: "hi" }], ...extra }),
}));

beforeEach(() => {
  h.plan.tier = "free"; h.dayAllowed = true; h.balance = 100;
  h.consume.mockReset().mockImplementation(async (_u: string, ops: string[]) => (ops.includes("assistant_day") && !h.dayAllowed ? { allowed: false, status: 429, message: "used up" } : { allowed: true }));
  h.run.mockReset().mockResolvedValue({ reply: "ok", actions: [], model: "claude-sonnet-5-5", usage: { input: 1000, output: 200 } });
  h.charge.mockReset().mockResolvedValue(true);
});

describe("Ask BlinkSpot billing", () => {
  it("a Balanced message on Free within the day's messages is included (no credits)", async () => {
    const res = await ask({ effort: "medium" });
    expect((await res.json()).credits).toBe(0);
    expect(h.charge).not.toHaveBeenCalled();
  });

  it("after the day's included messages, it keeps answering and charges what the reply cost", async () => {
    h.dayAllowed = false;
    const body = await (await ask({ effort: "medium" })).json();
    expect(body.reply).toBe("ok");
    expect(body.credits).toBe(3);
    expect(h.charge).toHaveBeenCalledWith("client-1", 3, expect.stringContaining("Balanced"));
  });

  it("a level above the plan works on Free with credits, and never uses the day's messages", async () => {
    const body = await (await ask({ effort: "max" })).json();
    expect(body.credits).toBe(3);
    expect(h.consume.mock.calls.some(([, ops]) => (ops as string[]).includes("assistant_day"))).toBe(false);
  });

  it("checks the balance against the level's cap BEFORE running, and offers a top-up", async () => {
    h.balance = 20; // Max can cost up to 100
    const body = await (await ask({ effort: "max" })).json();
    expect(h.run).not.toHaveBeenCalled();
    expect(body.reply).toMatch(/up to 100 credits and you have 20/);
    expect(body.actions[0]).toMatchObject({ kind: "open_page", href: "/studio/account/billing" });
  });

  it("editing on Free uses credits; on a paid plan it is included", async () => {
    const editor = { timeline: { duration: 5, clips: [] }, frames: [] };
    const free = await (await ask({ effort: "medium", editor })).json();
    expect(free.credits).toBe(3);
    h.plan.tier = "starter"; h.charge.mockClear();
    const paid = await (await ask({ effort: "medium", editor })).json();
    expect(paid.credits).toBe(0);
    expect(h.charge).not.toHaveBeenCalled();
  });

  it("a failed reply is never charged", async () => {
    h.dayAllowed = false;
    h.run.mockRejectedValue(new Error("boom"));
    const res = await ask({ effort: "medium" });
    expect(res.status).toBe(502);
    expect(h.charge).not.toHaveBeenCalled();
  });
});
