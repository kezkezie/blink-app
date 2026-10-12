/**
 * What each plan gets.
 *
 * 2026-10-12 (Kezie): "what they're going to be paying is mostly for brands", and credits unlock
 * the AI. So: every AI feature works on every plan and costs credits (the same price everywhere);
 * credit packs can be bought on any plan, Free included. A plan buys brands (Starter 3), credits
 * every month and included Ask BlinkSpot messages each day (deeper thinking levels by plan).
 *
 * Free: 1 brand, 100 credits ONCE at sign-up (`grant_signup_credits` trigger), every editor, every
 * AI feature with credits, Ask 10 included messages a day.
 */
export type PlanTier = "free" | "starter" | "pro" | "agency";

export const SIGNUP_CREDITS = 100;
/** Credit packs, on any plan. $0.01 a credit (about 50% margin), a little off on the big ones. */
export const CREDIT_PACKS = [
  { id: "pack_300", credits: 300, usd: 3 },
  { id: "pack_800", credits: 800, usd: 8 },
  { id: "pack_2000", credits: 2000, usd: 18, note: "10% off" },
  { id: "pack_5000", credits: 5000, usd: 40, note: "20% off" },
] as const;
export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];
export const TOP_UP = { credits: 800, usd: 8 } as const;

export function planOf(v: unknown): PlanTier {
  if (v === "starter" || v === "pro" || v === "agency") return v;
  // Legacy custom/enterprise rows are paid accounts set up by hand.
  if (v === "enterprise" || v === "custom") return "agency";
  return "free";
}

export function isPaidPlan(v: unknown): boolean {
  return planOf(v) !== "free";
}

/** Shown where AI buttons wait for credits (any plan can buy them; Kezie, 2026-10-12). */
export const AI_NEEDS_CREDITS = "The AI tools use credits, on every plan. You're out of credits: top up in Billing (packs start at $3). Every manual editing tool stays free.";

/** One list for the homepage and the billing page, so prices and promises can't drift apart. */
export type PlanCard = {
  id: PlanTier;
  name: string;
  price: { monthly: number; weekly: number };
  credits: { monthly: string; weekly: string };
  brands: number;
  note: string;
  features: string[];
  popular?: boolean;
};

export const PLANS: PlanCard[] = [
  {
    id: "free", name: "Free", price: { monthly: 0, weekly: 0 }, brands: 1,
    credits: { monthly: `${SIGNUP_CREDITS} credits to start`, weekly: `${SIGNUP_CREDITS} credits to start` },
    note: "One brand, pay as you go",
    features: ["1 brand", `${SIGNUP_CREDITS} credits once, then top up from $3`, "Every AI feature, paid with credits", "Image and video editors, publish and schedule", "Ask BlinkSpot, 10 messages a day included"],
  },
  {
    id: "starter", name: "Starter", price: { monthly: 25, weekly: 7 }, brands: 3,
    credits: { monthly: "1,500 credits a month", weekly: "350 credits a week" },
    note: "A few brands, posting weekly",
    features: ["3 brands", "Ask BlinkSpot, 80 messages a day, up to Thorough", "Editing with Ask included", "Top up credits any time"],
  },
  {
    id: "pro", name: "Pro", price: { monthly: 49, weekly: 14 }, brands: 6, popular: true,
    credits: { monthly: "3,000 credits a month", weekly: "750 credits a week" },
    note: "Growing teams, approvals",
    features: ["6 brands", "Everything in Starter", "Send posts for approval", "Ask BlinkSpot, 250 messages a day, up to Extra high"],
  },
  {
    id: "agency", name: "Agency", price: { monthly: 99, weekly: 29 }, brands: 10,
    credits: { monthly: "6,000 credits a month", weekly: "1,500 credits a week" },
    note: "Client work at volume",
    features: ["10 brands, archive and swap clients", "Everything in Pro", "Ask BlinkSpot, 600 messages a day, every level", "Priority support"],
  },
];
