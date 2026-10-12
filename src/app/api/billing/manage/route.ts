import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { paymentProvider } from "@/lib/payments/server";

/** The provider's page to change the card or cancel the plan. */
export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: client } = await supabaseAdmin.from("clients").select("billing_subscription_code").eq("user_id", auth.value).maybeSingle();
  if (!client?.billing_subscription_code) return NextResponse.json({ error: "There's no online subscription on this account. Email info@blinkspot.io to change it." }, { status: 404 });
  const url = await paymentProvider().manageLink(client.billing_subscription_code);
  if (!url) return NextResponse.json({ error: "Couldn't open the subscription page. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ url });
}
