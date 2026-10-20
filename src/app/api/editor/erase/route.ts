import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { requestWorkspace } from "@/lib/brand-access";
import { brandArg } from "@/lib/credits-meter";
import { AI_ERASE_CREDITS, blendInto } from "@/lib/editor/regions";

/**
 * Editor → AI eraser (2026-10-20). POST { url, mask, brandId }: both the user's own uploads; white
 * in the mask is what goes. Bria Eraser on Replicate (official, trained on licensed images, $0.04)
 * removes it and fills in what was behind. Bria answers at about 1024 px, so its picture is laid
 * back onto the original only inside a feathered mask: the rest keeps full sharpness. Charged up
 * front, refunded if anything fails.
 */
export const maxDuration = 120;
const BRIA = "https://api.replicate.com/v1/models/bria/eraser/predictions";
const REFUSED = /moderat|nsfw|safety|inappropriate|flagged/i;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ error: "The AI eraser isn't set up yet." }, { status: 503 });
  let body: { url?: unknown; mask?: unknown; brandId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url : "";
  const mask = typeof body.mask === "string" ? body.mask : "";
  const client = await requestWorkspace(request, auth.value);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!url || !mask || !(await verifyOwnedInspirationImage(client.id, url)) || !(await verifyOwnedInspirationImage(client.id, mask))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: client.id, p_amount: AI_ERASE_CREDITS, p_operation: "debit", p_description: "Editor: AI eraser", ...brandArg(body.brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: "Not enough credits. Get more in Billing." }, { status: 402 });
  const refund = (error: string, status = 502) => supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: AI_ERASE_CREDITS, p_operation: "credit", p_description: "Refund: AI eraser didn't finish", ...brandArg(body.brandId) })
    .then(() => NextResponse.json({ error: `${error} Your ${AI_ERASE_CREDITS} credits were refunded.` }, { status }), () => NextResponse.json({ error }, { status }));

  try {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const res = await fetch(BRIA, {
      method: "POST", headers: { ...headers, Prefer: "wait=60" },
      body: JSON.stringify({ input: { image: url, mask, preserve_alpha: true, content_moderation: true } }),
      signal: AbortSignal.timeout(70_000),
    }).catch(() => null);
    let p = (await res?.json().catch(() => null)) as { id?: string; status?: string; output?: unknown; error?: unknown } | null;
    const deadline = Date.now() + 95_000;
    while (p?.id && !["succeeded", "failed", "canceled"].includes(p.status ?? "") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      p = r?.ok ? await r.json() : p;
    }
    const out = Array.isArray(p?.output) ? p?.output[0] : p?.output;
    if (p?.status !== "succeeded" || typeof out !== "string") {
      const why = String(p?.error ?? p?.status ?? "no answer");
      console.info("ai erase failed", JSON.stringify({ client: client.id, why: why.slice(0, 160) }));
      return refund(REFUSED.test(why) ? "This picture can't go through the AI eraser (its safety check refused it)." : "The AI eraser couldn't finish this time. Try again in a minute.");
    }
    const [orig, fresh, marks] = await Promise.all([
      safeFetchBytes(url, { maxBytes: 25_000_000 }), safeFetchBytes(out, { maxBytes: 25_000_000 }), safeFetchBytes(mask, { maxBytes: 10_000_000 }),
    ]);
    if (!orig.ok || !fresh.ok || !marks.ok) return refund("Couldn't save the result.");
    const base = sharp(orig.bytes).rotate().ensureAlpha();
    const { data: o, info } = await base.raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const f = await sharp(fresh.bytes).ensureAlpha().resize(w, h, { fit: "fill" }).raw().toBuffer();
    // The feather: a little blur so the seam doesn't show (the browser already grew the mask).
    const a = await sharp(marks.bytes).greyscale().resize(w, h, { fit: "fill" }).blur(Math.max(1, Math.round(Math.max(w, h) / 900))).raw().toBuffer();
    const blended = blendInto(new Uint8Array(o.buffer, o.byteOffset, o.length), new Uint8Array(f.buffer, f.byteOffset, f.length), new Uint8Array(a.buffer, a.byteOffset, w * h));
    const png = await sharp(Buffer.from(blended.buffer, blended.byteOffset, blended.length), { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 8 }).toBuffer();
    const path = `images/${client.id}/erased_${Date.now()}.png`;
    const { error } = await supabaseAdmin.storage.from("assets").upload(path, png, { contentType: "image/png" });
    if (error) return refund("Couldn't save the result.", 500);
    console.info("ai erase done", JSON.stringify({ client: client.id, w, h }));
    return NextResponse.json({ url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, credits: AI_ERASE_CREDITS });
  } catch (e) {
    console.error("ai erase", e);
    return refund("The AI eraser failed.", 500);
  }
}
