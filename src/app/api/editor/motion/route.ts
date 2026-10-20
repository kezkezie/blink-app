import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { brandArg } from "@/lib/credits-meter";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { jsonFrom, validateResearch } from "@/lib/brand-research";
import { MOTION_CREDITS, MOTION_SYSTEM, motionUserPrompt, placeScreens, validateMotionSpec, type MotionShape } from "@/lib/motion/spec";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { imageSize } from "@/lib/upscale";
import { pictureKind } from "@/lib/image-refs";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * POST { brandId, prompt, shape, pictureId? }: Claude plans a motion graphic from the brand's kit
 * (2026-10-15). Charged 4 credits, refunded if the plan doesn't come back usable. Pictures are
 * offered as short refs and mapped back to our own URLs, so Claude can only use pictures we gave.
 * Answers { spec, pictures, credits }; edits and the render happen in the browser, free.
 */
export const maxDuration = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHAPES: MotionShape[] = ["9:16", "1:1", "16:9"];

const urlsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || u.includes("/video/upload/");

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 12_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; prompt?: unknown; shape?: unknown; pictureId?: unknown; screens?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  const shape = SHAPES.find((s) => s === body.shape) ?? "9:16";
  const pictureId = typeof body.pictureId === "string" && UUID.test(body.pictureId) ? body.pictureId : null;
  if (!brandId || prompt.length < 3) return NextResponse.json({ error: "Say what the motion is for." }, { status: 400 });

  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("brand_name, company_name, industry, primary_color, secondary_color, primary_font, logo_url, website_url, social_urls, research")
    .eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["motion"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  // What Claude may show: the brand's product photos and a few recent pictures (or the one asked for).
  const [{ data: products }, { data: posts }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, price, currency, image_url").eq("brand_id", brandId).eq("client_id", ws.clientId).not("image_url", "is", null).limit(8),
    pictureId
      ? supabaseAdmin.from("content").select("id, caption, image_urls").eq("id", pictureId).eq("client_id", ws.clientId).limit(1)
      : supabaseAdmin.from("content").select("id, caption, image_urls").eq("brand_id", brandId).eq("client_id", ws.clientId).in("content_type", ["post_image", "post"]).order("created_at", { ascending: false }).limit(6),
  ]);
  const pictures: Array<{ ref: string; url: string; title: string }> = [];
  for (const p of products ?? []) if (typeof p.image_url === "string" && p.image_url) pictures.push({ ref: `img${pictures.length + 1}`, url: p.image_url, title: String(p.name ?? "Product").slice(0, 60) });
  for (const c of posts ?? []) {
    const url = urlsOf(c.image_urls).find((u) => !isVideo(u));
    if (url) pictures.push({ ref: `img${pictures.length + 1}`, url, title: String(c.caption ?? "Picture").replace(/\s+/g, " ").slice(0, 60) });
  }
  const productRefs = (products ?? []).map((p, i) => ({ ref: `img${i + 1}`, name: String(p.name ?? ""), price: p.price != null ? `${p.currency ? `${p.currency} ` : ""}${p.price}` : null }));
  // Screenshots for an app walkthrough (2026-10-20): the user's own uploads only, up to 6, sized here
  // so Claude can give pixel boxes (they land more precisely than fractions; see the X-ray scans).
  const storage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/images/${ws.clientId}/`;
  const screenUrls = (Array.isArray(body.screens) ? body.screens : []).filter((u): u is string => typeof u === "string" && u.startsWith(storage) && !u.includes("..")).slice(0, 6);
  const screens = (await Promise.all(screenUrls.map(async (url, i) => {
    const got = await safeFetchBytes(url, { maxBytes: 8_000_000, timeoutMs: 15_000 }).catch(() => null);
    if (!got?.ok) return null;
    const kind = pictureKind(got.bytes);
    const size = imageSize(got.bytes);
    if (!size || (kind !== "png" && kind !== "jpeg" && kind !== "webp")) return null;
    return { ref: `S${i + 1}`, url, width: size.width, height: size.height, media: kind === "png" ? "image/png" : kind === "jpeg" ? "image/jpeg" : "image/webp", data: Buffer.from(got.bytes).toString("base64") };
  }))).filter((x): x is NonNullable<typeof x> => !!x);
  const handle = typeof brand.social_urls === "string" ? brand.social_urls.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)?.[1] : undefined;
  const research = validateResearch(brand.research);
  const colours = [brand.primary_color, brand.secondary_color].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));

  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "Motion isn't available right now." }, { status: 503 }); }
  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: ws.clientId, p_amount: MOTION_CREDITS, p_operation: "debit", p_description: "Editor: motion graphic", ...brandArg(brandId),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `A motion is ${MOTION_CREDITS} credits and your balance is lower. Get more in Billing.` }, { status: 402 });
  const refund = (why: string, status = 502) => supabaseAdmin.rpc("refund_credits", {
    p_client_id: ws.clientId, p_amount: MOTION_CREDITS, p_operation: "refund", p_description: "Refund: motion graphic failed", ...brandArg(brandId),
  }).then(() => NextResponse.json({ error: `${why} Your ${MOTION_CREDITS} credits were refunded.` }, { status }), () => NextResponse.json({ error: why }, { status }));

  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 4000,
      system: [{ type: "text", text: MOTION_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [...screens.flatMap((x) => [{ type: "text", text: `Screenshot ${x.ref} (${x.width} x ${x.height} px):` }, { type: "image", source: { type: "base64", media_type: x.media, data: x.data } }]), { type: "text", text: motionUserPrompt({
        brandName: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, prompt, shape, colours,
        font: brand.primary_font, hasLogo: !!brand.logo_url, products: productRefs,
        pictures: pictures.slice(productRefs.length).map((p) => ({ ref: p.ref, title: p.title })),
        look: research?.visualLanguage?.slice(0, 300) ?? null,
        website: typeof brand.website_url === "string" ? brand.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null,
        handle: handle ? `@${handle}` : null,
        screens: screens.map(({ ref, width, height }) => ({ ref, width, height })),
      }) }] }],
    }),
    signal: AbortSignal.timeout(70_000),
  }).catch(() => null);
  if (!res?.ok) return refund("Couldn't plan the motion just now. Try again in a minute.");
  const data = await res.json().catch(() => null);
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  // Screen steps: the screenshot ref becomes our URL, the pixel box fractions of that screenshot.
  const raw = placeScreens(jsonFrom(text), screens);
  const spec = validateMotionSpec(raw, { shape, brand: { primary: brand.primary_color, secondary: brand.secondary_color }, images: [...pictures.map((p) => p.ref), ...screens.map((x) => x.url)] });
  const usd = data ? estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cacheRead: data.usage?.cache_read_input_tokens ?? 0, cacheWrite: data.usage?.cache_creation_input_tokens ?? 0 }) : null;
  console.info("motion usage", JSON.stringify({ brand: brandId, model, ok: !!spec, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "motion", provider: provider.name, model, clientId: ws.clientId, userId: auth.value, brandId, usage: data ? { input: data.usage?.input_tokens, output: data.usage?.output_tokens, cacheRead: data.usage?.cache_read_input_tokens, cacheWrite: data.usage?.cache_creation_input_tokens } : null, usd, credits: spec ? MOTION_CREDITS : 0, ok: !!spec, meta: { screens: screens.length } });
  if (!spec) return refund("The motion plan came back unclear. Try saying it another way.");
  // Picture refs become our URLs.
  const byRef = new Map(pictures.map((p) => [p.ref, p.url]));
  for (const s of spec.scenes) if (s.template === "product-reveal" && s.image) s.image = byRef.get(s.image);
  return NextResponse.json({ spec, pictures: [...pictures.map(({ url, title }) => ({ url, title })), ...screens.map((x) => ({ url: x.url, title: `Screenshot ${x.ref}` }))], credits: MOTION_CREDITS });
}
