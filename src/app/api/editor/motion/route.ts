import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { brandArg } from "@/lib/credits-meter";
import { assistantModelFor, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { jsonFrom } from "@/lib/brand-research";
import { motionContext, placePictures } from "@/lib/motion/context-server";
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


export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 24_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; prompt?: unknown; shape?: unknown; pictureId?: unknown; screens?: unknown; source?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  // A post, notes or a table to work from (2026-10-21: blog post to video, numbers that move).
  const source = typeof body.source === "string" ? body.source.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000) : "";
  const shape = SHAPES.find((s) => s === body.shape) ?? "9:16";
  const pictureId = typeof body.pictureId === "string" && UUID.test(body.pictureId) ? body.pictureId : null;
  if (!brandId || prompt.length < 3) return NextResponse.json({ error: "Say what the motion is for." }, { status: 400 });

  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  // A picture handed off from the Library ("Motion graphic" on an image, or ?picture=) becomes the
  // clip's animated background (Kezie, 2026-10-22), not a picture placed inside a scene — so it is
  // NOT offered to the planner as a scene ref; its URL is set as spec.background below.
  const kit = await motionContext(ws.clientId, brandId);
  if (!kit) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["motion"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const pictures = kit.pictures;
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
  const res = await claudeFetch(provider, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 4000,
      system: [{ type: "text", text: MOTION_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [...screens.flatMap((x) => [{ type: "text", text: `Screenshot ${x.ref} (${x.width} x ${x.height} px):` }, { type: "image", source: { type: "base64", media_type: x.media, data: x.data } }]), { type: "text", text: motionUserPrompt(kit.brief({ prompt, shape, screens: screens.map(({ ref, width, height }) => ({ ref, width, height })), source: source || null })) }] }],
    }),
    // Stop in the browser ends the call here too, and the credits come back (2026-10-25).
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(70_000)]),
  }).catch(() => null);
  if (!res?.ok) return refund("Couldn't plan the motion just now. Try again in a minute.");
  const data = await res.json().catch(() => null);
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  // Screen steps: the screenshot ref becomes our URL, the pixel box fractions of that screenshot.
  const raw = placeScreens(jsonFrom(text), screens);
  const spec = validateMotionSpec(raw, { shape, brand: kit.brand, images: [...pictures.map((p) => p.ref), ...screens.map((x) => x.url)] });
  const usd = data ? estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cacheRead: data.usage?.cache_read_input_tokens ?? 0, cacheWrite: data.usage?.cache_creation_input_tokens ?? 0 }) : null;
  console.info("motion usage", JSON.stringify({ brand: brandId, model, ok: !!spec, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "motion", provider: provider.name, model, clientId: ws.clientId, userId: auth.value, brandId, usage: data ? { input: data.usage?.input_tokens, output: data.usage?.output_tokens, cacheRead: data.usage?.cache_read_input_tokens, cacheWrite: data.usage?.cache_creation_input_tokens } : null, usd, credits: spec && !request.signal.aborted ? MOTION_CREDITS : 0, ok: !!spec, meta: { screens: screens.length } });
  if (!spec) return refund("The motion plan came back unclear. Try saying it another way.");
  if (request.signal.aborted) return refund("Stopped.", 499);
  // Picture refs become our URLs.
  placePictures(spec, pictures);
  // The handed-off picture plays as the background (the words and shapes animate over it).
  let background: string | null = null;
  if (pictureId && spec.kind !== "overlay") {
    const { data: bgRow } = await supabaseAdmin.from("content").select("image_urls").eq("id", pictureId).eq("client_id", ws.clientId).maybeSingle();
    let urls: unknown = bgRow?.image_urls;
    if (typeof urls === "string") { try { urls = JSON.parse(urls); } catch { urls = [urls]; } }
    const first = Array.isArray(urls) ? urls.find((u): u is string => typeof u === "string" && /^https:\/\//.test(u) && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) && !u.includes("/video/upload/")) : null;
    if (first) { spec.background = first; background = first; }
  }
  return NextResponse.json({ spec, pictures: [...(background ? [{ url: background, title: "This picture" }] : []), ...pictures.map(({ url, title }) => ({ url, title })), ...screens.map((x) => ({ url: x.url, title: `Screenshot ${x.ref}` }))], credits: MOTION_CREDITS });
}
