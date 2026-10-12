import { NextRequest, NextResponse } from "next/server";
import { handleProviderEvent, paymentProvider } from "@/lib/payments/server";

/**
 * Paystack's webhook (set it in the Paystack dashboard to https://www.blinkspot.io/api/webhooks/paystack).
 * The signature is checked on the raw body; anything unsigned is refused. A failure answers 500 so
 * Paystack retries; granting is idempotent, so a retry can't add credits twice.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const event = paymentProvider().parseWebhook(raw, request.headers);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    await handleProviderEvent(event);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("paystack webhook error", event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
