import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { requestWorkspace } from "@/lib/brand-access";
import { brandArg } from "@/lib/credits-meter";

/**
 * Editor → Swap the face. A dedicated face-swap model on Replicate (cdingram/face-swap, about
 * $0.013 and 11 s a run) keeps the photo exactly and changes only the face. It replaced a Nano
 * Banana 2 edit that, live on 2026-10-10, returned the face photo's whole scene instead (18 cr).
 * Billed at cost (3 credits), deducted up front, refunded if anything fails, result re-hosted.
 */
export const maxDuration = 120;
const COST = 3;
const MODEL_VERSION = "d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111";

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) return NextResponse.json({ error: "Face swap is not configured." }, { status: 503 });
  let body: { url?: unknown; face?: unknown; brandId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url : "";
  const face = typeof body.face === "string" ? body.face : "";
  const client = await requestWorkspace(request, auth.value);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  // Any plan with credits (Kezie, 2026-10-12: credits unlock every AI feature).
  // Both pictures must be the user's own (their storage folder or Library), never an arbitrary URL.
  if (!url || !face || !(await verifyOwnedInspirationImage(client.id, url)) || !(await verifyOwnedInspirationImage(client.id, face))) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: client.id, p_amount: COST, p_operation: "debit", p_description: "Editor: swap a face", ...brandArg(body.brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: "Not enough credits. Get more in Billing." }, { status: 402 });
  const refund = () => supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: COST, p_operation: "credit", p_description: "Refund: editor face swap failed", ...brandArg(body.brandId) }).then(() => {}, () => {});
  const fail = async (message: string, status = 502) => { await refund(); return NextResponse.json({ error: `${message} Your credits were refunded.` }, { status }); };

  try {
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "wait=60" };
    const created = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST", headers, body: JSON.stringify({ version: MODEL_VERSION, input: { input_image: url, swap_image: face } }), signal: AbortSignal.timeout(70_000),
    });
    let p = (await created.json().catch(() => ({}))) as { status?: string; output?: unknown; urls?: { get?: string }; error?: unknown };
    const deadline = Date.now() + 90_000;
    while (p.status && !["succeeded", "failed", "canceled"].includes(p.status) && p.urls?.get && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const next = await fetch(p.urls.get, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      p = (await next?.json().catch(() => null)) ?? p;
    }
    const out = typeof p.output === "string" ? p.output : null;
    // The model reports "no face found" as a failure; say it in plain words.
    if (p.status !== "succeeded" || !out) return fail(/face/i.test(String(p.error ?? "")) ? "Couldn't find a clear face in one of the photos." : "Couldn't swap the face this time.");
    const got = await safeFetchBytes(out, { maxBytes: 20_000_000 });
    if (!got.ok) return fail("Couldn't save the result.");
    const path = `images/${client.id}/faceswap_${Date.now()}.jpg`;
    const { error } = await supabaseAdmin.storage.from("assets").upload(path, got.bytes, { contentType: got.contentType || "image/jpeg" });
    if (error) return fail("Couldn't save the result.", 500);
    return NextResponse.json({ url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, credits: COST });
  } catch {
    return fail("Face swap failed.", 500);
  }
}
