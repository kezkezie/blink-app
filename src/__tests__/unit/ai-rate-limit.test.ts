import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { rpc } }));

import { aiLimitFor, consumeAiLimits } from "@/lib/ai-rate-limit";

const row = (allowed: boolean, inSeconds = 600) => ({ data: [{ allowed, remaining: allowed ? 3 : 0, reset_at: new Date(Date.now() + inSeconds * 1000).toISOString() }], error: null });

afterEach(() => { delete process.env.AI_RATE_LIMITS; rpc.mockReset(); });

describe("AI rate limits (routes that spend the owner's Claude key)", () => {
  it("is off until AI_RATE_LIMITS=1, and then never touches the database", async () => {
    expect(await consumeAiLimits("u1", ["assistant_hour", "assistant_day"], "free")).toEqual({ allowed: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives bigger plans more daily Ask messages; unknown plans get the free allowance", () => {
    expect(aiLimitFor("assistant_day", "free").limit).toBeLessThan(aiLimitFor("assistant_day", "pro").limit);
    expect(aiLimitFor("assistant_day", "agency").limit).toBeGreaterThan(aiLimitFor("assistant_day", "pro").limit);
    expect(aiLimitFor("assistant_day", "made-up")).toEqual(aiLimitFor("assistant_day", "free"));
    // Hand-made enterprise/custom accounts are paid: they get the biggest allowance, not the free one.
    expect(aiLimitFor("assistant_day", "custom")).toEqual(aiLimitFor("assistant_day", "agency"));
    expect(aiLimitFor("assistant_day", "free").windowSeconds).toBe(86_400);
  });

  it("consumes each operation through the durable limiter and allows when all have room", async () => {
    process.env.AI_RATE_LIMITS = "1";
    rpc.mockResolvedValue(row(true));
    expect(await consumeAiLimits("u1", ["assistant_hour", "assistant_day"], "pro")).toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(["consume_assisted_creation_rate_limit", { p_user_id: "u1", p_operation: "assistant_day", p_limit: aiLimitFor("assistant_day", "pro").limit, p_window_seconds: 86_400 }]);
  });

  it("blocks with 429 and a plain-words message once the day is used up", async () => {
    process.env.AI_RATE_LIMITS = "1";
    rpc.mockResolvedValueOnce(row(true)).mockResolvedValueOnce(row(false, 5 * 3600));
    const r = await consumeAiLimits("u1", ["assistant_hour", "assistant_day"], "free");
    expect(r).toMatchObject({ allowed: false, status: 429 });
    expect(r.allowed === false && r.message).toMatch(/today's 10 Ask BlinkSpot messages.*5 hours/);
  });

  it("fails closed (503) if the limiter can't answer, so a broken limiter can't mean an unlimited bill", async () => {
    process.env.AI_RATE_LIMITS = "1";
    rpc.mockResolvedValue({ data: null, error: { message: "Invalid rate-limit arguments" } });
    expect(await consumeAiLimits("u1", ["brand_build"])).toMatchObject({ allowed: false, status: 503 });
  });
});
