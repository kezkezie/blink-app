/**
 * One shape for every payment provider (the PayZephyr idea, in our stack; Kezie, 2026-10-12).
 * Paystack is the first; Flutterwave or Stripe can be added as another file behind this interface
 * and picked by PAYMENTS_PROVIDER, without touching the routes or the database.
 */
export type ProviderName = "paystack";

export type CheckoutInput = {
  email: string;
  amountMinor: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
  /** For a plan: the provider's recurring plan (created on first use). */
  plan?: { name: string; interval: "monthly" | "weekly"; amountMinor: number };
};

/** What the provider says about one charge. */
export type Charge = {
  status: "success" | "failed" | "pending";
  reference: string;
  amountMinor: number;
  currency: string;
  customerCode?: string;
  /** Set on a plan's charges (first and renewals). */
  planCode?: string;
  /** Our name for the plan on the provider, e.g. "BlinkSpot Starter (monthly)". */
  planName?: string;
  planInterval?: "monthly" | "weekly";
  customerEmail?: string;
  metadata?: Record<string, unknown>;
  raw: unknown;
};

export type ProviderEvent =
  | { type: "charge.success"; charge: Charge }
  | { type: "subscription.created"; subscriptionCode: string; customerCode?: string; customerEmail?: string; nextPaymentAt?: string; planCode?: string }
  | { type: "subscription.stopped"; subscriptionCode: string; customerCode?: string }
  | { type: "payment.failed"; subscriptionCode?: string; customerCode?: string }
  /** A card dispute (chargeback): Paystack gives 16 hours to answer (2026-10-23, the merchant agreement). */
  | { type: "dispute"; stage: "opened" | "reminder" | "resolved"; reference?: string; amountMinor?: number; currency?: string; customerEmail?: string; status?: string; resolution?: string; dueAt?: string; category?: string }
  | { type: "ignored"; name: string };

export interface PaymentProvider {
  name: ProviderName;
  configured(): boolean;
  /** The currency charged, and USD prices in its minor units. */
  currency(): string;
  toMinor(usd: number): number;
  startCheckout(input: CheckoutInput): Promise<{ url: string }>;
  verify(reference: string): Promise<Charge | null>;
  /** Checks the signature; null if it isn't from the provider. */
  parseWebhook(rawBody: string, headers: Headers): ProviderEvent | null;
  /** A link where the customer can update their card or cancel. */
  manageLink(subscriptionCode: string): Promise<string | null>;
  /** Stop a subscription renewing (used when someone switches plan). */
  cancelSubscription(subscriptionCode: string): Promise<boolean>;
}
