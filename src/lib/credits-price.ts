/**
 * The price rule for AI billed by the token (pure, no database), used by credits-meter.ts.
 * About 200 credits per provider dollar, like the rest of the price list (Pruna anchor, decisions
 * 2026-08-07). Credits sell at $0.01, so that is roughly a 50% margin.
 */
export const CREDITS_PER_USD = 200;

/** What a metered call costs: its real price in credits, at least `min`, never more than `cap`. */
export function meteredCredits(usd: number | null | undefined, cap: number, min = 1): number {
  if (usd === null || usd === undefined || !Number.isFinite(usd) || usd <= 0) return min;
  return Math.min(cap, Math.max(min, Math.ceil(usd * CREDITS_PER_USD)));
}

export const NOT_ENOUGH_CREDITS = (need: number) => `This needs up to ${need} credits and your balance is lower. Get more in Billing: top-ups on Starter and up, or upgrade from Free.`;
