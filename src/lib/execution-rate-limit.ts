import { supabaseAdmin } from "@/lib/supabase-server";

// Durable, authenticated-user-scoped rate limiting for video execution routes.
//
// This deliberately reuses the SAME fixed-window backend the Image Studio
// Assisted Creation slice shipped (`consume_assisted_creation_rate_limit` +
// `assisted_creation_rate_limits`), with new operation names — not a parallel
// limiter. Widening the RPC/table operation allowlist to accept these names is
// an additive migration (`20260728_video_execution_rate_limits.sql`) that must
// be applied under authorization. Until it is applied AND enforcement is
// enabled, `executionRateLimitsEnabled()` is false and calls are bypassed
// (allowed) so authentication + validation ship without a fail-closed 503 in a
// still-unprovisioned environment. This mirrors the guarded-rollout pattern
// used for durable image jobs.

export type ExecutionRateLimitOperation =
  | "video_suggest"
  | "video_storyboard"
  | "video_suggest_frame"
  | "video_tts"
  | "video_director"
  | "video_job";

type RateLimitConfig = { limit: number; windowSeconds: number };

export type ExecutionRateLimitResult =
  | {
      ok: true;
      allowed: boolean;
      remaining: number;
      resetAt: string;
      retryAfterSeconds: number;
    }
  | { ok: false };

const DEFAULT_CONFIG: Record<ExecutionRateLimitOperation, RateLimitConfig> = {
  video_suggest: { limit: 40, windowSeconds: 60 * 60 },
  video_storyboard: { limit: 30, windowSeconds: 60 * 60 },
  video_suggest_frame: { limit: 60, windowSeconds: 60 * 60 },
  video_tts: { limit: 40, windowSeconds: 60 * 60 },
  video_director: { limit: 80, windowSeconds: 60 * 60 },
  video_job: { limit: 40, windowSeconds: 60 * 60 },
};

// Enforcement is off by default. The video rate-limit backend migration is not
// yet applied to any live environment; enabling enforcement before it is would
// fail closed on every request. Turn on with VIDEO_EXECUTION_RATE_LIMITS=1
// after the migration is applied under authorization.
export function executionRateLimitsEnabled(): boolean {
  return process.env.VIDEO_EXECUTION_RATE_LIMITS === "1";
}

function readBoundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function getExecutionRateLimitConfig(
  operation: ExecutionRateLimitOperation
): RateLimitConfig {
  const prefix = operation.toUpperCase();
  const defaults = DEFAULT_CONFIG[operation];
  return {
    limit: readBoundedInteger(`${prefix}_RATE_LIMIT`, defaults.limit, 1, 10_000),
    windowSeconds: readBoundedInteger(
      `${prefix}_RATE_LIMIT_WINDOW_SECONDS`,
      defaults.windowSeconds,
      60,
      7 * 24 * 60 * 60
    ),
  };
}

function parseRpcRow(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const resetAt = typeof value.reset_at === "string" ? value.reset_at : "";
  const resetTime = Date.parse(resetAt);
  const remaining = typeof value.remaining === "number" ? value.remaining : Number(value.remaining);
  if (typeof value.allowed !== "boolean" || !Number.isFinite(remaining) || !Number.isFinite(resetTime)) {
    return null;
  }
  return {
    allowed: value.allowed,
    remaining: Math.max(0, Math.floor(remaining)),
    resetAt: new Date(resetTime).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((resetTime - Date.now()) / 1_000)),
  };
}

export async function consumeExecutionRateLimit(
  userId: string,
  operation: ExecutionRateLimitOperation
): Promise<ExecutionRateLimitResult> {
  const config = getExecutionRateLimitConfig(operation);

  // Bypassed (allowed) while the durable backend is not yet provisioned/enabled.
  if (!executionRateLimitsEnabled()) {
    return {
      ok: true,
      allowed: true,
      remaining: config.limit,
      resetAt: new Date(Date.now() + config.windowSeconds * 1_000).toISOString(),
      retryAfterSeconds: config.windowSeconds,
    };
  }

  const { data, error } = await supabaseAdmin.rpc("consume_assisted_creation_rate_limit", {
    p_user_id: userId,
    p_operation: operation,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
  });
  if (error) return { ok: false };
  const result = parseRpcRow(data);
  return result ? { ok: true, ...result } : { ok: false };
}
