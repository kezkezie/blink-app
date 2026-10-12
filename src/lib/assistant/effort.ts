import { planOf } from "@/lib/plans";

/**
 * How hard Ask BlinkSpot thinks (Kezie, 2026-10-11: "the dial" from Claude Code, low to max).
 * Claude's `output_config.effort` sets how many tokens a reply may spend on thinking, tool calls and
 * text. Low and medium run on Sonnet 5.5; high and above on Opus 5.5.
 *
 * 2026-10-12 (Kezie: credits unlock all AI, plans buy brands): every level is open to everyone.
 * A plan INCLUDES some levels, and those messages count against the day's included Ask messages
 * (deeper levels count as more). Anything else (a level above the plan, a message after the day's
 * included ones run out, editing on the Free plan) is paid in credits for what it actually cost,
 * never more than the level's cap.
 */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_INFO: Record<Effort, { label: string; line: string; model: "sonnet" | "opus"; weight: number; maxTokens: number; creditCap: number }> = {
  low: { label: "Fast", line: "Quick answers and simple asks", model: "sonnet", weight: 1, maxTokens: 4000, creditCap: 4 },
  medium: { label: "Balanced", line: "Most things: ideas, plans, prompts", model: "sonnet", weight: 1, maxTokens: 6000, creditCap: 8 },
  high: { label: "Thorough", line: "Campaigns, long videos, tricky edits", model: "opus", weight: 2, maxTokens: 12000, creditCap: 25 },
  xhigh: { label: "Extra high", line: "Big multi-part plans", model: "opus", weight: 3, maxTokens: 20000, creditCap: 50 },
  max: { label: "Max", line: "The deepest thinking; slowest", model: "opus", weight: 4, maxTokens: 32000, creditCap: 100 },
};

/** Editing a canvas or timeline runs on Opus with pictures, whatever the level. */
export const EDITING_CREDIT_CAP = 25;

/** The highest level each plan includes. */
const PLAN_MAX: Record<ReturnType<typeof planOf>, Effort> = { free: "medium", starter: "high", pro: "xhigh", agency: "max" };

/** The levels a plan includes (messages on them use the day's included Ask messages). */
export function allowedEfforts(plan: unknown): Effort[] {
  return EFFORTS.slice(0, EFFORTS.indexOf(PLAN_MAX[planOf(plan)]) + 1);
}

/** A requested level (default Balanced). Any level is allowed; levels above the plan use credits. */
export function effortFor(requested: unknown): Effort {
  return (EFFORTS as readonly string[]).includes(String(requested)) ? (requested as Effort) : "medium";
}

/** The plan that includes a level. */
export function planFor(effort: Effort): string {
  return effort === "high" ? "Starter" : effort === "xhigh" ? "Pro" : effort === "max" ? "Agency" : "Free";
}

/** The most a message can cost in credits at this level (editing has its own floor). */
export function creditCapFor(effort: Effort, editing: boolean): number {
  return editing ? Math.max(EDITING_CREDIT_CAP, EFFORT_INFO[effort].creditCap) : EFFORT_INFO[effort].creditCap;
}
