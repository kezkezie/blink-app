import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { rpc } }));

import {
  consumeAssistedCreationRateLimit,
  getAssistedCreationRateLimitConfig,
} from "@/lib/assisted-creation-rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("assisted creation durable rate limiter", () => {
  it("uses independent server-configurable operation budgets", () => {
    vi.stubEnv("ASSISTED_CREATION_CONCEPTS_RATE_LIMIT", "12");
    vi.stubEnv("ASSISTED_CREATION_CONCEPTS_RATE_LIMIT_WINDOW_SECONDS", "1800");
    vi.stubEnv("ASSISTED_CREATION_DIRECTION_RATE_LIMIT", "40");
    vi.stubEnv("ASSISTED_CREATION_DIRECTION_RATE_LIMIT_WINDOW_SECONDS", "7200");

    expect(getAssistedCreationRateLimitConfig("concepts")).toEqual({ limit: 12, windowSeconds: 1800 });
    expect(getAssistedCreationRateLimitConfig("direction")).toEqual({ limit: 40, windowSeconds: 7200 });
  });

  it("falls back to bounded defaults for unsafe configuration", () => {
    vi.stubEnv("ASSISTED_CREATION_CONCEPTS_RATE_LIMIT", "0");
    vi.stubEnv("ASSISTED_CREATION_CONCEPTS_RATE_LIMIT_WINDOW_SECONDS", "999999999");

    expect(getAssistedCreationRateLimitConfig("concepts")).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(getAssistedCreationRateLimitConfig("direction")).toEqual({ limit: 30, windowSeconds: 3600 });
  });

  it("passes only authenticated identity, operation, and bounded config to the atomic RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: "2026-07-15T10:02:00.000Z" }],
      error: null,
    });

    const result = await consumeAssistedCreationRateLimit("authenticated-user-id", "concepts");

    expect(rpc).toHaveBeenCalledWith("consume_assisted_creation_rate_limit", {
      p_user_id: "authenticated-user-id",
      p_operation: "concepts",
      p_limit: 10,
      p_window_seconds: 3600,
    });
    expect(result).toEqual({
      ok: true,
      allowed: false,
      remaining: 0,
      resetAt: "2026-07-15T10:02:00.000Z",
      retryAfterSeconds: 120,
    });
  });

  it("fails closed on RPC errors or malformed backend responses", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "backend unavailable" } });
    await expect(consumeAssistedCreationRateLimit("authenticated-user-id", "direction"))
      .resolves.toEqual({ ok: false });

    rpc.mockResolvedValueOnce({ data: [{ allowed: "yes" }], error: null });
    await expect(consumeAssistedCreationRateLimit("authenticated-user-id", "direction"))
      .resolves.toEqual({ ok: false });
  });
});
