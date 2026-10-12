import { NextResponse } from "next/server";
import { paymentProvider } from "@/lib/payments/server";

/** Whether online checkout is on (the billing page falls back to email if not). No secrets. */
export const dynamic = "force-dynamic";
export async function GET() {
  const p = paymentProvider();
  const online = p.configured();
  return NextResponse.json({ online, provider: online ? p.name : null, currency: online ? p.currency() : null, test: online && (process.env.PAYSTACK_SECRET_KEY ?? "").startsWith("sk_test_") });
}
