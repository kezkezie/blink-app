import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { brandArg } from "@/lib/credits-meter";
import { renderEdit } from "@/lib/ai-edit-server";
import { assistantProvider } from "@/lib/assistant/agent";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { seamlessPlan, seamlessPrompt, type SlideShape } from "@/lib/carousel";

/**
 * POST { brandId, brief, slides, shape }: the wide picture for a seamless carousel (2026-10-16).
 * Its own route, not the image router: the router adds brand and style text that pulled the model
 * back to three separate shots (judged 5-6/10; the prompt on its own, 9-10/10). Nano Banana 2 on Kie,
 * Replicate when Kie is slow; Claude checks it's one continuous place and, if not, it's made once
 * more at our cost. Charged as one Best image, refunded if it fails. The browser cuts it into slides.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function continuity(url: string): Promise<number> {
  let provider;
  try { provider = assistantProvider(); } catch { return 10; }
  const res = await fetch(provider.url, {
    method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 600, messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url } },
      { type: "text", text: "Is this one continuous panoramic scene (same place, horizon, sky and light across the whole width), or separate panels or shots? Reply with only a number from 1 (separate panels) to 10 (one continuous place)." },
    ] }] }),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const n = Number(text.match(/\b(10|[1-9])\b/)?.[1]);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 6_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; brief?: unknown; slides?: unknown; shape?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const brief = typeof body.brief === "string" ? body.brief.replace(/\s+/g, " ").trim().slice(0, 1200) : "";
  const shape: SlideShape = body.shape === "1:1" ? "1:1" : "4:5";
  if (!brandId || brief.length < 8) return NextResponse.json({ error: "Say what the wide picture shows." }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, company_name, industry, primary_color, secondary_color").eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["motion"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const plan = seamlessPlan(Number(body.slides) || 3, shape);
  const credits = IMAGE_ENGINE_REGISTRY.nb2.creditCost;
  const colours = [brand.primary_color, brand.secondary_color].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));
  const prompt = `${seamlessPrompt(brief, plan.slides)}\nIt's for ${brand.brand_name || brand.company_name || "the brand"}${brand.industry ? ` (${brand.industry})` : ""}${colours.length ? `; let the brand colours ${colours.join(" and ")} appear naturally in the scene` : ""}. Draw no logos or brand names.`;

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: ws.clientId, p_amount: credits, p_operation: "debit", p_description: "Seamless carousel picture", ...brandArg(brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `This is ${credits} credits and your balance is lower. Get more in Billing.` }, { status: 402 });
  const refund = (why: string) => supabaseAdmin.rpc("refund_credits", { p_client_id: ws.clientId, p_amount: credits, p_operation: "refund", p_description: "Refund: seamless carousel picture failed", ...brandArg(brandId) })
    .then(() => NextResponse.json({ error: `${why} Your ${credits} credits were refunded.` }, { status: 502 }), () => NextResponse.json({ error: why }, { status: 502 }));

  const deadline = Date.now() + 250_000;
  let best: { url: string; score: number } | null = null;
  for (let attempt = 0; attempt < 2 && Date.now() < deadline - 60_000; attempt++) {
    const made = await renderEdit("nano-banana-2", prompt, [], plan.aspect, Math.min(deadline, Date.now() + 160_000));
    if (!made.ok) { if (made.refused) return refund("The image service's safety filter refused this picture. Try other words."); continue; }
    const score = await continuity(made.url);
    console.info("seamless render", JSON.stringify({ brand: brandId, attempt, provider: made.provider, score }));
    if (!best || score > best.score) best = { url: made.url, score };
    if (score >= 7) break;
  }
  if (!best) return refund("The image service couldn't make the picture just now (on its side). Try again in a minute.");
  // Kept in our storage (the services' links expire).
  const file = await safeFetchBytes(best.url, { maxBytes: 25_000_000, timeoutMs: 45_000 });
  if (!file.ok) return refund("Couldn't save the picture.");
  const path = `images/${ws.clientId}/seamless_${Date.now()}.jpg`;
  const up = await supabaseAdmin.storage.from("assets").upload(path, file.bytes, { contentType: file.contentType.includes("png") ? "image/png" : "image/jpeg" });
  if (up.error) return refund("Couldn't save the picture.");
  return NextResponse.json({ url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, slides: plan.slides, aspect: plan.aspect, continuity: best.score, credits });
}
