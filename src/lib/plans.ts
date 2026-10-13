/**
 * What each plan gets.
 *
 * 2026-10-12 (Kezie): "what they're going to be paying is mostly for brands", and credits unlock
 * the AI. So: every AI feature works on every plan and costs credits (the same price everywhere);
 * credit packs can be bought on any plan, Free included. A plan buys brands (Starter 3), credits
 * every month and included Ask BlinkSpot messages each day (deeper thinking levels by plan).
 *
 * 2026-10-13 (Kezie): top-ups only from Starter ($25) up ("I don't think it's wise to give people
 * topping up credits when they're on zero"); Free tries everything on its sign-up credits, then
 * upgrades. Shared brands get a few seats free, more on each plan.
 *
 * Free: 1 brand, 100 credits ONCE at sign-up (`grant_signup_credits` trigger), every editor, every
 * AI feature with credits, Ask 10 included messages a day.
 */
export type PlanTier = "free" | "starter" | "pro" | "agency";

export const SIGNUP_CREDITS = 100;
/** Credit packs, from Starter up. $0.01 a credit (about 50% margin), a little off on the big ones. */
export const CREDIT_PACKS = [
  { id: "pack_300", credits: 300, usd: 3 },
  { id: "pack_800", credits: 800, usd: 8 },
  { id: "pack_2000", credits: 2000, usd: 18, note: "10% off" },
  { id: "pack_5000", credits: 5000, usd: 40, note: "20% off" },
] as const;
export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];
export const TOP_UP = { credits: 800, usd: 8 } as const;

/** Credits a plan adds on each successful charge (first and every renewal). */
export const PLAN_CREDITS: Record<Exclude<PlanTier, "free">, { monthly: number; weekly: number }> = {
  starter: { monthly: 1500, weekly: 350 },
  pro: { monthly: 3000, weekly: 750 },
  agency: { monthly: 6000, weekly: 1500 },
};

export function planOf(v: unknown): PlanTier {
  if (v === "starter" || v === "pro" || v === "agency") return v;
  // Legacy custom/enterprise rows are paid accounts set up by hand.
  if (v === "enterprise" || v === "custom") return "agency";
  return "free";
}

export function isPaidPlan(v: unknown): boolean {
  return planOf(v) !== "free";
}

/** Credit packs can be bought on Starter and up (Kezie, 2026-10-13). */
export const canTopUp = (plan: unknown) => isPaidPlan(plan);
export const TOP_UP_NEEDS_PLAN = "Top-ups come with Starter ($25 a month) and up. Free gives you 100 credits to try everything; Starter adds 1,500 credits every month and top-ups any time.";

/** People a brand can be shared with (open invites count), by the owner's plan. */
export const SHARE_SEATS: Record<PlanTier, number> = { free: 3, starter: 5, pro: 10, agency: 20 };
export const shareSeatsFor = (plan: unknown) => SHARE_SEATS[planOf(plan)];

/** Shown where AI buttons wait for credits (top-ups from Starter up; Kezie, 2026-10-13). */
export const AI_NEEDS_CREDITS = "The AI tools use credits and you're out. On Starter and up, top up in Billing (packs start at $3); on Free, upgrade for 1,500 credits a month. Every manual editing tool stays free.";

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
    note: "One brand, try everything",
    features: ["1 brand", `${SIGNUP_CREDITS} credits once to try every AI feature`, "Image and video editors, publish and schedule", "Ask BlinkSpot, 10 messages a day included", `Share your brand with ${SHARE_SEATS.free} people`],
  },
  {
    id: "starter", name: "Starter", price: { monthly: 25, weekly: 7 }, brands: 3,
    credits: { monthly: "1,500 credits a month", weekly: "350 credits a week" },
    note: "A few brands, posting weekly",
    features: ["3 brands", "Top up credits any time, from $3", "Ask BlinkSpot, 80 messages a day, up to Thorough", "Editing with Ask included", `Share each brand with ${SHARE_SEATS.starter} people`],
  },
  {
    id: "pro", name: "Pro", price: { monthly: 49, weekly: 14 }, brands: 6, popular: true,
    credits: { monthly: "3,000 credits a month", weekly: "750 credits a week" },
    note: "Growing teams, approvals",
    features: ["6 brands", "Everything in Starter", "Send posts for approval", "Ask BlinkSpot, 250 messages a day, up to Extra high", `Share each brand with ${SHARE_SEATS.pro} people`],
  },
  {
    id: "agency", name: "Agency", price: { monthly: 99, weekly: 29 }, brands: 10,
    credits: { monthly: "6,000 credits a month", weekly: "1,500 credits a week" },
    note: "Client work at volume",
    features: ["10 brands, archive and swap clients", "Everything in Pro", "Ask BlinkSpot, 600 messages a day, every level", `Share each brand with ${SHARE_SEATS.agency} people`, "Priority support"],
  },
];
