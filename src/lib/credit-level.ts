import { IMAGE_ENGINE_REGISTRY } from "./image-engine-pricing";

/**
 * How full the balance is (Kezie, 2026-10-22: "the balance would start turning red ... people can
 * get very carried away"). Low is under about one video or five Best images; out is under one Best
 * image, the point where most things stop. Pure, so the top bar and its warnings agree.
 */
export const BEST_IMAGE_CREDITS = IMAGE_ENGINE_REGISTRY.nb2.creditCost;
export const LOW_CREDITS = 100;
export type CreditLevel = "ok" | "low" | "out";

export function creditLevel(balance: number | null | undefined): CreditLevel {
  if (balance === null || balance === undefined) return "ok";
  if (balance < BEST_IMAGE_CREDITS) return "out";
  return balance < LOW_CREDITS ? "low" : "ok";
}

/** What the balance still buys, in things people make. */
export function whatItBuys(balance: number): string {
  const images = Math.floor(balance / BEST_IMAGE_CREDITS);
  if (images < 1) return "not enough for a Best image";
  return `about ${images} Best image${images === 1 ? "" : "s"}`;
}

/**
 * The warning to show when the balance moves from `before` to `now`, or null. Only on the way
 * down, once per level crossed: a page load that is already low says nothing (the red pill does).
 */
export function creditWarning(before: number | null, now: number | null, shared = false): { level: Exclude<CreditLevel, "ok">; text: string } | null {
  if (before === null || now === null || now >= before) return null;
  const was = creditLevel(before), is = creditLevel(now);
  if (is === was || is === "ok") return null;
  const whose = shared ? "The brand owner has" : "You have";
  const n = Math.max(0, Math.round(now)).toLocaleString("en-US");
  return is === "out"
    ? { level: "out", text: `${whose} ${n} credits left, ${whatItBuys(now)}. Top up so nothing stops halfway.` }
    : { level: "low", text: `${whose} ${n} credits left, ${whatItBuys(now)}. Worth topping up before a video or a big batch.` };
}
