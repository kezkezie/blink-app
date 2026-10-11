import { planOf } from "@/lib/plans";

/**
 * How hard Ask BlinkSpot thinks (Kezie, 2026-10-11: "the dial" from Claude Code, low to max).
 * Claude's `output_config.effort` sets how many tokens a reply may spend on thinking, tool calls and
 * text. Low and medium run on Sonnet 5.5; high and above on Opus 5.5. Deeper levels cost more, so
 * they count as more than one of the day's Ask messages and open up with the plan.
 */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_INFO: Record<Effort, { label: string; line: string; model: "sonnet" | "opus"; weight: number; maxTokens: number }> = {
  low: { label: "Fast", line: "Quick answers and simple asks", model: "sonnet", weight: 1, maxTokens: 4000 },
  medium: { label: "Balanced", line: "Most things: ideas, plans, prompts", model: "sonnet", weight: 1, maxTokens: 6000 },
  high: { label: "Thorough", line: "Campaigns, long videos, tricky edits", model: "opus", weight: 2, maxTokens: 12000 },
  xhigh: { label: "Extra high", line: "Big multi-part plans", model: "opus", weight: 3, maxTokens: 20000 },
  max: { label: "Max", line: "The deepest thinking; slowest", model: "opus", weight: 4, maxTokens: 32000 },
};

/** The highest level each plan can use. */
const PLAN_MAX: Record<ReturnType<typeof planOf>, Effort> = { free: "medium", starter: "high", pro: "xhigh", agency: "max" };

export function allowedEfforts(plan: unknown): Effort[] {
  return EFFORTS.slice(0, EFFORTS.indexOf(PLAN_MAX[planOf(plan)]) + 1);
}

/** A requested level, clamped to what the plan allows (default Balanced). */
export function effortFor(requested: unknown, plan: unknown): Effort {
  const allowed = allowedEfforts(plan);
  const want = (EFFORTS as readonly string[]).includes(String(requested)) ? (requested as Effort) : "medium";
  return allowed.includes(want) ? want : allowed[allowed.length - 1];
}

/** The plan that opens a level, for the lock label. */
export function planFor(effort: Effort): string {
  return effort === "high" ? "Starter" : effort === "xhigh" ? "Pro" : effort === "max" ? "Agency" : "Free";
}
