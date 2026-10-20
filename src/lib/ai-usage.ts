import { after } from "next/server";

/**
 * Cost logging (Kezie, 2026-10-20): one `ai_usage` row per AI call, so the unit economics are a
 * query instead of estimates (Vercel Hobby keeps logs about 30 minutes). Written after the response
 * (next/server `after`), never in the way: a failed write is dropped. The table is server-only.
 */
export type AiUsage = {
  feature: string;
  provider: "anthropic" | "kie" | "openai" | "replicate" | "n8n";
  model?: string | null;
  clientId?: string | null;
  userId?: string | null;
  brandId?: string | null;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | null;
  /** Estimated provider cost in USD (list prices). */
  usd?: number | null;
  /** Credits the user paid for this call (0: free to them). */
  credits?: number;
  /** Counted against an included allowance (Ask BlinkSpot's messages). */
  included?: boolean;
  units?: number;
  ok?: boolean;
  meta?: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null);

export function usageRow(u: AiUsage) {
  return {
    feature: u.feature.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 41),
    provider: u.provider,
    model: u.model ? String(u.model).slice(0, 80) : null,
    client_id: uuid(u.clientId), user_id: uuid(u.userId), brand_id: uuid(u.brandId),
    input_tokens: int(u.usage?.input), output_tokens: int(u.usage?.output),
    cache_read_tokens: int(u.usage?.cacheRead), cache_write_tokens: int(u.usage?.cacheWrite),
    usd: typeof u.usd === "number" && Number.isFinite(u.usd) ? Number(u.usd.toFixed(5)) : null,
    credits_charged: Math.max(0, Math.round(u.credits ?? 0)),
    included: !!u.included,
    units: Math.min(100, Math.max(0, Math.round(u.units ?? 1))),
    ok: u.ok !== false,
    meta: u.meta ?? null,
  };
}

export function logAiUsage(u: AiUsage): void {
  const row = usageRow(u);
  const write = async () => {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase-server");
      const { error } = await supabaseAdmin.from("ai_usage").insert(row);
      if (error) console.warn("ai usage not recorded", error.message);
    } catch { /* never in the way of the answer */ }
  };
  try { after(write); } catch { void write(); }
}

/** OpenAI list prices, USD per million tokens. */
const OPENAI: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};
export function openAiUsd(model: string, input: number, output: number) {
  const p = OPENAI[model];
  return p ? (input * p.in + output * p.out) / 1_000_000 : null;
}

/** One BlinkSpot credit is priced at $0.005 of provider cost (200 credits per provider dollar). */
export const USD_PER_CREDIT = 0.005;

/** Ask BlinkSpot's included units used by this person since the start of this month (UTC). */
export async function askUnitsThisMonth(userId: string): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-server");
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const { data, error } = await supabaseAdmin.from("ai_usage").select("units").eq("user_id", userId).eq("feature", "ask").eq("included", true).gte("created_at", start.toISOString()).limit(5000);
    if (error) return null;
    return (data ?? []).reduce((n, r) => n + (Number(r.units) || 0), 0);
  } catch { return null; }
}

/** When this month's allowance comes back: the 1st of next month, as "1 November". */
export function nextMonthStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
