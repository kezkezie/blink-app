import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { paymentProvider, settleCharge } from "@/lib/payments/server";

/**
 * Back from the checkout page: ask the provider how the payment went and grant it (the webhook
 * may already have; granting twice is impossible). Only the account's own payments.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const reference = request.nextUrl.searchParams.get("reference") ?? "";
  if (!/^bs_[0-9a-f]{32}$/.test(reference)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  const { data: row } = await supabaseAdmin.from("payments").select("client_id, status, kind, credits, plan_tier").eq("reference", reference).maybeSingle();
  if (!client?.id || !row || row.client_id !== client.id) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (row.status === "paid") return NextResponse.json({ status: "paid", kind: row.kind, credits: row.credits, plan: row.plan_tier });

  const charge = await paymentProvider().verify(reference);
  if (!charge) return NextResponse.json({ status: "pending" });
  if (charge.status !== "success") {
    if (charge.status === "failed") await settleCharge(charge);
    return NextResponse.json({ status: charge.status });
  }
  try {
    const result = await settleCharge(charge);
    if (!result.ok) return NextResponse.json({ status: "failed", error: result.error === "amount_mismatch" ? "The amount paid didn't match the price, so nothing was added. Contact us and we'll sort it out." : "We couldn't add it yet. If you were charged, it will appear within a few minutes." }, { status: 409 });
    return NextResponse.json({ status: "paid", kind: row.kind, credits: row.credits, plan: row.plan_tier });
  } catch (e) {
    console.error("verify error", e);
    return NextResponse.json({ status: "pending" });
  }
}
