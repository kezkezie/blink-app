import { NextResponse } from "next/server";
import { paymentProvider } from "@/lib/payments/server";

/** Whether online checkout is on (the billing page falls back to email if not). No secrets. */
export const dynamic = "force-dynamic";
export async function GET() {
  const p = paymentProvider();
  const online = p.configured();
  const currency = online ? p.currency() : null;
  // Charging in a local currency (e.g. KES): the page says so, with the rate used.
  const fx = currency && currency !== "USD" ? Number(process.env.PAYSTACK_FX_PER_USD) || null : null;
  return NextResponse.json({ online, provider: online ? p.name : null, currency, fxPerUsd: fx, test: online && (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_") });
}
