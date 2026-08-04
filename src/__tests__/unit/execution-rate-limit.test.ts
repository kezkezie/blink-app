import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { rpc } }));

import {
  consumeExecutionRateLimit,
  executionRateLimitsEnabled,
  getExecutionRateLimitConfig,
} from "@/lib/execution-rate-limit";

const ORIGINAL = process.env.VIDEO_EXECUTION_RATE_LIMITS;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VIDEO_EXECUTION_RATE_LIMITS;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VIDEO_EXECUTION_RATE_LIMITS;
  else process.env.VIDEO_EXECUTION_RATE_LIMITS = ORIGINAL;
});

describe("executionRateLimitsEnabled", () => {
  it("is off by default and on only when explicitly set to 1", () => {
    expect(executionRateLimitsEnabled()).toBe(false);
    process.env.VIDEO_EXECUTION_RATE_LIMITS = "1";
    expect(executionRateLimitsEnabled()).toBe(true);
    process.env.VIDEO_EXECUTION_RATE_LIMITS = "true";
    expect(executionRateLimitsEnabled()).toBe(false);
  });
});

describe("consumeExecutionRateLimit", () => {
  it("bypasses (allowed) and does NOT touch the RPC while disabled", async () => {
    const result = await consumeExecutionRateLimit("user-1", "video_job");
    expect(result).toMatchObject({ ok: true, allowed: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("consumes the durable RPC with the right operation when enabled", async () => {
    process.env.VIDEO_EXECUTION_RATE_LIMITS = "1";
    rpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 3600_000).toISOString() }],
      error: null,
    });
    const result = await consumeExecutionRateLimit("user-1", "video_director");
    expect(result).toMatchObject({ ok: true, allowed: true, remaining: 5 });
    expect(rpc).toHaveBeenCalledWith("consume_assisted_creation_rate_limit", expect.objectContaining({
      p_user_id: "user-1", p_operation: "video_director",
    }));
  });

  it("reports allowed:false when the durable window is exhausted", async () => {
    process.env.VIDEO_EXECUTION_RATE_LIMITS = "1";
    rpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    });
    const result = await consumeExecutionRateLimit("user-1", "video_tts");
    expect(result).toMatchObject({ ok: true, allowed: false, remaining: 0 });
  });

  it("fails closed (ok:false) when the RPC errors", async () => {
    process.env.VIDEO_EXECUTION_RATE_LIMITS = "1";
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await consumeExecutionRateLimit("user-1", "video_suggest");
    expect(result).toEqual({ ok: false });
  });
});

describe("getExecutionRateLimitConfig", () => {
  it("returns bounded defaults per operation", () => {
    expect(getExecutionRateLimitConfig("video_job").limit).toBeGreaterThan(0);
    expect(getExecutionRateLimitConfig("video_director").windowSeconds).toBeGreaterThanOrEqual(60);
  });
});
