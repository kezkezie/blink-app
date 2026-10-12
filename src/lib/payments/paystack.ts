import { createHmac, timingSafeEqual } from "node:crypto";
import type { Charge, CheckoutInput, PaymentProvider, ProviderEvent } from "./types";

/**
 * Paystack (https://paystack.com/docs/api). Checkout is Paystack's hosted page (cards, M-Pesa,
 * bank, depending on the account's country), so card details never touch BlinkSpot.
 *
 * Settings:
 *   PAYSTACK_SECRET_KEY   sk_test_... or sk_live_... (also signs the webhooks)
 *   PAYSTACK_CURRENCY     what the account charges in (default USD; e.g. KES)
 *   PAYSTACK_FX_PER_USD   for a non-USD currency: how many units make $1 (e.g. 129 for KES)
 */
const API = "https://api.paystack.co";

type PaystackTxn = {
  status?: string; reference?: string; amount?: number; currency?: string; metadata?: unknown;
  customer?: { customer_code?: string; email?: string };
  plan?: { plan_code?: string; interval?: string; name?: string } | string | null;
  plan_object?: { plan_code?: string; interval?: string; name?: string };
};

function secret() { return process.env.PAYSTACK_SECRET_KEY?.trim() ?? ""; }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || body.status === false) throw new Error(`Paystack ${path.split("?")[0]}: ${res.status} ${body.message ?? ""}`.trim());
  return body.data as T;
}

const interval = (v: unknown): "monthly" | "weekly" | undefined => (v === "monthly" || v === "weekly" ? v : undefined);

function toCharge(t: PaystackTxn): Charge {
  const plan = typeof t.plan === "object" && t.plan ? t.plan : t.plan_object;
  const meta = t.metadata && typeof t.metadata === "object" ? (t.metadata as Record<string, unknown>) : undefined;
  return {
    status: t.status === "success" ? "success" : t.status === "failed" || t.status === "abandoned" || t.status === "reversed" ? "failed" : "pending",
    reference: String(t.reference ?? ""),
    amountMinor: Number(t.amount) || 0,
    currency: String(t.currency ?? "").toUpperCase(),
    customerCode: t.customer?.customer_code,
    planCode: plan?.plan_code || (typeof t.plan === "string" && t.plan ? t.plan : undefined),
    planName: plan?.name,
    planInterval: interval(plan?.interval),
    customerEmail: t.customer?.email,
    metadata: meta,
    raw: t,
  };
}

/** Recurring plans are created on Paystack the first time they're sold, then reused by name. */
const planCodes = new Map<string, string>();
async function ensurePlan(p: NonNullable<CheckoutInput["plan"]>, currency: string): Promise<string> {
  const key = `${p.name}|${p.interval}|${p.amountMinor}|${currency}`;
  const cached = planCodes.get(key);
  if (cached) return cached;
  const list = await call<Array<{ name: string; plan_code: string; interval: string; amount: number; currency: string }>>("/plan?perPage=100");
  const found = list.find((x) => x.name === p.name && x.interval === p.interval && x.amount === p.amountMinor && x.currency === currency);
  const code = found?.plan_code ?? (await call<{ plan_code: string }>("/plan", { method: "POST", body: JSON.stringify({ name: p.name, interval: p.interval, amount: p.amountMinor, currency }) })).plan_code;
  planCodes.set(key, code);
  return code;
}

/** Paystack signs each webhook: HMAC-SHA512 of the raw body with the secret key, hex. */
export function validPaystackSignature(rawBody: string, signature: string | null, key = secret()): boolean {
  if (!signature || !key) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const paystack: PaymentProvider = {
  name: "paystack",
  configured: () => secret().startsWith("sk_"),
  currency: () => (process.env.PAYSTACK_CURRENCY?.trim().toUpperCase() || "USD"),
  toMinor(usd) {
    const fx = paystack.currency() === "USD" ? 1 : Number(process.env.PAYSTACK_FX_PER_USD) || 0;
    if (!fx) throw new Error("PAYSTACK_FX_PER_USD is needed for a non-USD Paystack currency");
    return Math.round(usd * fx * 100);
  },
  async startCheckout(input) {
    const currency = paystack.currency();
    const planCode = input.plan ? await ensurePlan(input.plan, currency) : undefined;
    const data = await call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email, amount: input.amountMinor, currency, reference: input.reference,
        callback_url: input.callbackUrl, metadata: input.metadata, ...(planCode ? { plan: planCode } : {}),
      }),
    });
    return { url: data.authorization_url };
  },
  async verify(reference) {
    try { return toCharge(await call<PaystackTxn>(`/transaction/verify/${encodeURIComponent(reference)}`)); } catch { return null; }
  },
  parseWebhook(rawBody, headers): ProviderEvent | null {
    if (!validPaystackSignature(rawBody, headers.get("x-paystack-signature"))) return null;
    let body: { event?: string; data?: Record<string, unknown> };
    try { body = JSON.parse(rawBody); } catch { return null; }
    const d = (body.data ?? {}) as Record<string, unknown> & { customer?: { customer_code?: string; email?: string }; plan?: { plan_code?: string }; subscription?: { subscription_code?: string } };
    switch (body.event) {
      case "charge.success": return { type: "charge.success", charge: toCharge(d as PaystackTxn) };
      case "subscription.create": return { type: "subscription.created", subscriptionCode: String(d.subscription_code ?? ""), customerCode: d.customer?.customer_code, customerEmail: d.customer?.email, nextPaymentAt: typeof d.next_payment_date === "string" ? d.next_payment_date : undefined, planCode: d.plan?.plan_code };
      case "subscription.disable":
      case "subscription.not_renew": return { type: "subscription.stopped", subscriptionCode: String(d.subscription_code ?? ""), customerCode: d.customer?.customer_code };
      case "invoice.payment_failed": return { type: "payment.failed", subscriptionCode: d.subscription?.subscription_code, customerCode: d.customer?.customer_code };
      default: return { type: "ignored", name: String(body.event ?? "unknown") };
    }
  },
  async manageLink(subscriptionCode) {
    try { return (await call<{ link: string }>(`/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`)).link; } catch { return null; }
  },
  async cancelSubscription(subscriptionCode) {
    try {
      const sub = await call<{ email_token?: string }>(`/subscription/${encodeURIComponent(subscriptionCode)}`);
      if (!sub.email_token) return false;
      await call("/subscription/disable", { method: "POST", body: JSON.stringify({ code: subscriptionCode, token: sub.email_token }) });
      return true;
    } catch { return false; }
  },
};
