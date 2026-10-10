import { supabaseAdmin } from "@/lib/supabase-server";
import { parseRpcRow } from "@/lib/execution-rate-limit";

/**
 * Per-user caps on the routes that spend Kezie's own Claude API key (Ask BlinkSpot, the brand
 * builder, AI vectors). Users don't pay credits for these, so a cap is what stops one account, a
 * stuck client or a script from running up the bill. Reuses the durable fixed-window limiter
 * behind Assisted Creation (`consume_assisted_creation_rate_limit`).
 *
 * Off until AI_RATE_LIMITS=1: the database function only accepts these operation names after
 * migration 20260728_video_execution_rate_limits.sql is applied (it generalises the name check).
 */

export type AiOperation = "assistant_hour" | "assistant_day" | "brand_build" | "vector_draw";
type Plan = "free" | "starter" | "pro" | "agency";

/** Messages per day by plan, plus a burst cap per hour for everyone. */
const ASSISTANT_DAY: Record<Plan, number> = { free: 25, starter: 80, pro: 250, agency: 600 };
const FIXED: Record<Exclude<AiOperation, "assistant_day">, { limit: number; windowSeconds: number }> = {
  assistant_hour: { limit: 40, windowSeconds: 60 * 60 },
  brand_build: { limit: 12, windowSeconds: 60 * 60 },
  vector_draw: { limit: 45, windowSeconds: 60 * 60 },
};

export function aiRateLimitsEnabled() {
  return process.env.AI_RATE_LIMITS === "1";
}

export function aiLimitFor(op: AiOperation, plan?: string | null) {
  if (op === "assistant_day") {
    const tier = (["free", "starter", "pro", "agency"] as const).find((t) => t === plan) ?? "free";
    return { limit: ASSISTANT_DAY[tier], windowSeconds: 24 * 60 * 60 };
  }
  return FIXED[op];
}

export type AiLimitResult = { allowed: true } | { allowed: false; status: 429 | 503; message: string; retryAfterSeconds?: number };

/** Consume one unit of each operation; the first one that is used up blocks the request. */
export async function consumeAiLimits(userId: string, ops: AiOperation[], plan?: string | null): Promise<AiLimitResult> {
  if (!aiRateLimitsEnabled()) return { allowed: true };
  for (const op of ops) {
    const { limit, windowSeconds } = aiLimitFor(op, plan);
    const { data, error } = await supabaseAdmin.rpc("consume_assisted_creation_rate_limit", {
      p_user_id: userId, p_operation: op, p_limit: limit, p_window_seconds: windowSeconds,
    });
    const row = error ? null : parseRpcRow(data);
    if (!row) return { allowed: false, status: 503, message: "The AI is busy right now. Try again in a minute." };
    if (!row.allowed) {
      const wait = row.retryAfterSeconds > 3600 ? `${Math.ceil(row.retryAfterSeconds / 3600)} hours` : `${Math.max(1, Math.ceil(row.retryAfterSeconds / 60))} minutes`;
      const message = op === "assistant_day"
        ? `You've used today's ${limit} Ask BlinkSpot messages on your plan. More in about ${wait}, or upgrade for more.`
        : `That's the limit for now (${limit} an hour). Try again in about ${wait}.`;
      return { allowed: false, status: 429, message, retryAfterSeconds: row.retryAfterSeconds };
    }
  }
  return { allowed: true };
}
