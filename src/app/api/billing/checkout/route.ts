import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CheckoutError, itemFor, startCheckout } from "@/lib/payments/server";

/** Start a payment for a credit pack or a plan; answers with the provider's checkout page. */
export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { item?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const item = itemFor(body.item);
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 400 });

  const { data: client } = await supabaseAdmin.from("clients").select("id, plan_tier, billing_cycle, billing_status").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (item.kind === "plan" && client.plan_tier === item.tier && client.billing_cycle === item.cycle && client.billing_status === "active") {
    return NextResponse.json({ error: "You're already on this plan." }, { status: 409 });
  }
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(auth.value);
  const email = user?.user?.email;
  if (!email) return NextResponse.json({ error: "Your account needs an email address to pay." }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  try {
    const { url, reference } = await startCheckout({ clientId: client.id, email, itemId: item.id, appUrl });
    return NextResponse.json({ url, reference });
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("checkout error", e);
    return NextResponse.json({ error: "Couldn't start the payment." }, { status: 500 });
  }
}
