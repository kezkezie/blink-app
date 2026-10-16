import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { brandArg } from "@/lib/credits-meter";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { jsonFrom, validateResearch } from "@/lib/brand-research";
import { MAX_SLIDES, PLAN_CREDITS, TOPIC_SYSTEM, topicPrompt, validateTopicCarousel } from "@/lib/carousel";

/**
 * POST { brandId, topic, slides }: Claude writes a topic carousel's outline (2026-10-16, like
 * Canva's Carousel Studio: topic, number of slides, a designed set). 4 credits, refunded if it
 * doesn't come back usable. Our templates draw the slides in the browser, free.
 */
export const maxDuration = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 6_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; topic?: unknown; slides?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const topic = typeof body.topic === "string" ? body.topic.replace(/\s+/g, " ").trim().slice(0, 800) : "";
  const slides = Math.min(MAX_SLIDES, Math.max(3, Math.round(Number(body.slides) || 6)));
  if (!brandId || topic.length < 4) return NextResponse.json({ error: "Say what the carousel is about." }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, company_name, industry, dna, social_urls, research").eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["motion"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "Carousels aren't available right now." }, { status: 503 }); }

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: ws.clientId, p_amount: PLAN_CREDITS, p_operation: "debit", p_description: "Carousel outline", ...brandArg(brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `An outline is ${PLAN_CREDITS} credits and your balance is lower. Get more in Billing.` }, { status: 402 });
  const refund = (why: string) => supabaseAdmin.rpc("refund_credits", { p_client_id: ws.clientId, p_amount: PLAN_CREDITS, p_operation: "refund", p_description: "Refund: carousel outline failed", ...brandArg(brandId) })
    .then(() => NextResponse.json({ error: `${why} Your ${PLAN_CREDITS} credits were refunded.` }, { status: 502 }), () => NextResponse.json({ error: why }, { status: 502 }));

  // The brand's pictures Claude may put on slides: product photos first, then recent Library pictures.
  const [{ data: products }, { data: posts }] = await Promise.all([
    supabaseAdmin.from("products").select("name, image_url").eq("brand_id", brandId).eq("client_id", ws.clientId).not("image_url", "is", null).limit(6),
    supabaseAdmin.from("content").select("caption, image_urls").eq("brand_id", brandId).eq("client_id", ws.clientId).in("content_type", ["post_image", "post"]).order("created_at", { ascending: false }).limit(6),
  ]);
  const pictures: Array<{ ref: string; url: string; title: string }> = [];
  for (const p of products ?? []) if (typeof p.image_url === "string" && p.image_url) pictures.push({ ref: `img${pictures.length + 1}`, url: p.image_url, title: `product photo: ${String(p.name ?? "product").slice(0, 50)}` });
  for (const c of posts ?? []) {
    const url = (Array.isArray(c.image_urls) ? c.image_urls : []).find((u: unknown): u is string => typeof u === "string" && !/\.(mp4|mov|webm)(\?|$)/i.test(u));
    if (url) pictures.push({ ref: `img${pictures.length + 1}`, url, title: String(c.caption ?? "a brand picture").replace(/\s+/g, " ").slice(0, 60) });
  }
  const handle = typeof brand.social_urls === "string" ? brand.social_urls.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)?.[1] : undefined;
  const research = validateResearch(brand.research);
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 4000,
      system: [{ type: "text", text: TOPIC_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: topicPrompt({ brandName: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, topic, slides, audience: (brand.dna as { audience?: string } | null)?.audience, handle: handle ? `@${handle}` : null, look: research?.visualLanguage?.slice(0, 240), pictures: pictures.map(({ ref, title }) => ({ ref, title })) }) }],
    }),
    signal: AbortSignal.timeout(70_000),
  }).catch(() => null);
  if (!res?.ok) return refund("Couldn't write the carousel just now. Try again in a minute.");
  const data = await res.json().catch(() => null);
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const carousel = validateTopicCarousel(jsonFrom(text), pictures.map((p) => p.ref));
  // Picture refs become our URLs.
  const byRef = new Map(pictures.map((p) => [p.ref, p.url]));
  for (const sl of carousel?.slides ?? []) if ("image" in sl && sl.image) sl.image = byRef.get(sl.image);
  const usd = data ? estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }) : null;
  console.info("carousel plan usage", JSON.stringify({ brand: brandId, model, ok: !!carousel, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  if (!carousel) return refund("The outline came back unclear. Try saying it another way.");
  return NextResponse.json({ carousel, pictures: pictures.map(({ url, title }) => ({ url, title })), handle: handle ? `@${handle}` : null, credits: PLAN_CREDITS });
}
