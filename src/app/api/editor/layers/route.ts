import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { AssistantUnavailableError, assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { chargeCredits, creditBalance, meteredCredits, NOT_ENOUGH_CREDITS } from "@/lib/credits-meter";
import { GOOGLE_FONTS_REGISTRY } from "@/lib/fonts";
import { validateLayers } from "@/lib/editor/layers";
import { requestWorkspace } from "@/lib/brand-access";

/**
 * Split a flat design into layers (2026-10-13): Claude reads where every piece of text is, how
 * big, what colour and weight, which font it looks like (and the closest free Google Font), and
 * where the logo is. The browser then builds real text layers, traces the logo and cleans the
 * photo. Paid for what the reading costs (usually 2-4 credits), checked first.
 */
export const maxDuration = 90;
const CAP = 10;
const FREE = GOOGLE_FONTS_REGISTRY.map((f) => f.family);

const SYSTEM = `You turn a flat graphic design (a poster, flyer or social post) into editable layers. You get one image.
Find every piece of visible text and every logo or brand mark.
Reply with JSON only:
{"texts":[{"text":"the exact words, with \\n for line breaks","box":[x,y,w,h],"sizePct":the font size as a percentage of the image HEIGHT (cap height plus a bit; e.g. a big headline is 6-12),"color":"#RRGGBB","weight":100-900,"italic":false,"align":"left|center|right","spacing":letter spacing in em (0 normal, 0.1 wide),"font":"the font it most looks like (any name, e.g. Helvetica Neue, Bebas Neue)","freeFont":"the closest free Google Font","category":"sans|serif|display|script|mono"}],
 "logos":[{"box":[x,y,w,h],"label":"what it is, e.g. Lup Space logo"}],
 "background":"one line about what's behind the text"}
Boxes are fractions of the image (0-1): x and y of the top-left corner, then width and height, tight around the ink.
One entry per text block that shares a style (a 3-line headline in one style is one entry with \\n). Keep small print too.
Prefer these free fonts for freeFont when one is close: ${FREE.join(", ")}.
Logos: the brand's mark or wordmark only, not product labels inside the photo. If a wordmark is plain text in a normal font, list it as text instead.`;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 3_000_000)) return NextResponse.json({ error: "That image is too large to read." }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { image?: unknown; width?: unknown; height?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^[A-Za-z0-9+/=]{1000,2800000}$/.test(image)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await requestWorkspace(request, auth.value);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if ((await creditBalance(client.id)) < CAP) return NextResponse.json({ error: NOT_ENOUGH_CREDITS(CAP), code: "not_enough_credits" }, { status: 402 });
  const limit = await consumeAiLimits(auth.value, ["vector_draw"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    return NextResponse.json({ error: e instanceof AssistantUnavailableError ? e.message : "The AI isn't available." }, { status: 503 });
  }
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 4000, system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: `The image is ${Number(body.width) || "?"}x${Number(body.height) || "?"} pixels. Map its layers.` },
      ] }],
      ...(provider.name === "anthropic" ? { output_config: { effort: "medium" } } : {}),
    }),
    signal: AbortSignal.timeout(80_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
  const usd = estimateUsd(model, { input: out?.usage?.input_tokens ?? 0, output: out?.usage?.output_tokens ?? 0 });
  const text = (out?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let raw: unknown = null;
  try { raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* checked below */ }
  const layers = validateLayers(raw, FREE);
  console.info("editor layers usage", JSON.stringify({ client: client.id, model, ok: !!layers, texts: layers?.texts.length ?? 0, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  if (!res?.ok || !layers) return NextResponse.json({ error: "Couldn't find text or a logo in this image. Nothing was charged." }, { status: 422 });
  const credits = meteredCredits(usd, CAP, 2);
  if (!(await chargeCredits(client.id, credits, "Editor: split a design into layers"))) console.error("layers: charge failed", client.id, credits);
  return NextResponse.json({ layers, credits });
}
