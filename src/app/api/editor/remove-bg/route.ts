import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { safeFetchBytes } from "@/lib/safe-fetch";

/**
 * Editor → Remove background. Recraft Remove Background on Kie (1 Kie credit, $0.005) is billed at
 * cost: 1 BlinkSpot credit, deducted up front and refunded if anything fails. The cut-out PNG is
 * re-hosted in the user's storage folder (Kie's result links expire).
 */
export const maxDuration = 120;
const COST = 1;
const KIE = "https://api.kie.ai/api/v1/jobs";

async function pollResult(taskId: string, key: string, deadline: number): Promise<string | null> {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`${KIE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { data?: { state?: string; resultJson?: string } } | null;
    const state = data?.data?.state;
    if (state === "success") {
      try { return (JSON.parse(data!.data!.resultJson || "{}").resultUrls ?? [])[0] ?? null; } catch { return null; }
    }
    if (state === "fail") return null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = process.env.KIE_API_TOKEN;
  if (!key) return NextResponse.json({ error: "Background removal is not configured." }, { status: 503 });
  let body: { url?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url : "";
  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!url || !(await verifyOwnedInspirationImage(client.id, url))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: client.id, p_amount: COST, p_operation: "debit", p_description: "Editor: remove background" });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: "Not enough credits. Top up in Billing." }, { status: 402 });
  const refund = () => supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: COST, p_operation: "credit", p_description: "Refund: editor remove background failed" }).then(() => {}, () => {});

  try {
    const created = await fetch(`${KIE}/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "recraft/remove-background", input: { image: url } }),
      signal: AbortSignal.timeout(20000),
    });
    const task = (await created.json().catch(() => ({}))) as { code?: number; data?: { taskId?: string }; msg?: string };
    const taskId = task.data?.taskId;
    if (!created.ok || !taskId) { await refund(); return NextResponse.json({ error: "Background removal is busy. Your credit was refunded." }, { status: 502 }); }
    const resultUrl = await pollResult(taskId, key, Date.now() + 90_000);
    if (!resultUrl) { await refund(); return NextResponse.json({ error: "Couldn't remove the background this time. Your credit was refunded." }, { status: 502 }); }
    const got = await safeFetchBytes(resultUrl, { maxBytes: 20_000_000 });
    if (!got.ok) { await refund(); return NextResponse.json({ error: "Couldn't save the cut-out. Your credit was refunded." }, { status: 502 }); }
    const path = `images/${client.id}/cutout_${Date.now()}.png`;
    const { error } = await supabaseAdmin.storage.from("assets").upload(path, got.bytes, { contentType: got.contentType || "image/png" });
    if (error) { await refund(); return NextResponse.json({ error: "Couldn't save the cut-out. Your credit was refunded." }, { status: 500 }); }
    return NextResponse.json({ url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, credits: COST });
  } catch {
    await refund();
    return NextResponse.json({ error: "Background removal failed. Your credit was refunded." }, { status: 500 });
  }
}
