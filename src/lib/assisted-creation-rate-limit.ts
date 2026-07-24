import { supabaseAdmin } from "@/lib/supabase-server";

export type AssistedCreationRateLimitOperation = "concepts" | "direction";

type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
};

export type AssistedCreationRateLimitResult =
  | {
      ok: true;
      allowed: boolean;
      remaining: number;
      resetAt: string;
      retryAfterSeconds: number;
    }
  | { ok: false };

const DEFAULT_CONFIG: Record<AssistedCreationRateLimitOperation, RateLimitConfig> = {
  concepts: { limit: 10, windowSeconds: 60 * 60 },
  direction: { limit: 30, windowSeconds: 60 * 60 },
};

function readBoundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function getAssistedCreationRateLimitConfig(
  operation: AssistedCreationRateLimitOperation
): RateLimitConfig {
  const prefix = operation === "concepts"
    ? "ASSISTED_CREATION_CONCEPTS"
    : "ASSISTED_CREATION_DIRECTION";
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

export async function consumeAssistedCreationRateLimit(
  userId: string,
  operation: AssistedCreationRateLimitOperation
): Promise<AssistedCreationRateLimitResult> {
  const config = getAssistedCreationRateLimitConfig(operation);
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
