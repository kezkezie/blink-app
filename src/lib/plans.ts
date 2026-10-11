/**
 * What each plan gets (Kezie approved 2026-10-11).
 *
 * Free: the editors (they run in the browser, so they cost nothing), the AI brand set-up (auto-fill
 * and brand builder, cents per person and the moment the app "gets" a business), 100 credits ONCE
 * at sign-up to try generating, and Ask BlinkSpot capped at 10 a day. The AI tools inside the
 * Editor (remove background, swap a face, edit with words, draw a vector) need a paid plan.
 * The one-time credits are granted by the `grant_signup_credits` trigger, not here.
 */
export type PlanTier = "free" | "starter" | "pro" | "agency";

export const SIGNUP_CREDITS = 100;
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

export const EDITOR_AI_UPGRADE = "AI tools in the Editor come with a paid plan (from $25 a month). Every manual editing tool stays free.";

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
    note: "Try it on your own brand",
    features: ["1 brand", `${SIGNUP_CREDITS} credits once, to try making images and videos`, "Image and video editors", "AI brand set-up from your website or Instagram", "Ask BlinkSpot, 10 messages a day"],
  },
  {
    id: "starter", name: "Starter", price: { monthly: 25, weekly: 7 }, brands: 2,
    credits: { monthly: "1,500 credits a month", weekly: "350 credits a week" },
    note: "One business, posting weekly",
    features: ["2 brands", "AI in the Editor: remove background, swap a face, edit with words, draw vectors", "Ask BlinkSpot, 80 messages a day", "Publish and schedule to your socials"],
  },
  {
    id: "pro", name: "Pro", price: { monthly: 49, weekly: 14 }, brands: 6, popular: true,
    credits: { monthly: "3,000 credits a month", weekly: "750 credits a week" },
    note: "Growing teams, approvals",
    features: ["6 brands", "Everything in Starter", "Send posts for approval", "Ask BlinkSpot, 250 messages a day"],
  },
  {
    id: "agency", name: "Agency", price: { monthly: 99, weekly: 29 }, brands: 10,
    credits: { monthly: "6,000 credits a month", weekly: "1,500 credits a week" },
    note: "Client work at volume",
    features: ["10 brands, archive and swap clients", "Everything in Pro", "Ask BlinkSpot, 600 messages a day", "Priority support"],
  },
];
