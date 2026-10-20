import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes, safeFetchText } from "@/lib/safe-fetch";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { jsonFrom, validateResearch } from "@/lib/brand-research";
import { bestPinImage, pinterestPinId } from "@/lib/inspo";
import {
  DIRECTION_SYSTEM, REF_SEARCH_SYSTEM, directionPrompt, imageTypeOf, previewImageFrom, refSearchPrompt, validateDirection, validatePages, validateVisualRefs,
  type VisualRef, type VisualRefs,
} from "@/lib/visual-refs";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Visual references, server side (2026-10-16; lib/visual-refs.ts). Two Claude calls: web search
 * for reference pages, then a look at the pictures themselves. Pages and pictures are fetched
 * SSRF-safe; Pinterest pins through Pinterest's public widget endpoint (as Inspo Remix does).
 * Kept on the brand for 30 days; no credits (like the industry research), about $0.10 a brand.
 */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PICTURES = 8;
const MAX_PICTURE_BYTES = 2_000_000;

export type VisualRefsOutcome = { ok: true; value: VisualRefs; cached: boolean } | { ok: false; status: number; error: string };

async function pictureFor(pageUrl: string): Promise<string | null> {
  const pin = pinterestPinId(pageUrl);
  if (pin && /^\d+$/.test(pin)) {
    const info = await safeFetchText(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${pin}`, { maxBytes: 400_000, timeoutMs: 8_000 });
    if (!info.ok) return null;
    try { return bestPinImage(JSON.parse(info.text))?.replace("/originals/", "/736x/") ?? null; } catch { return null; }
  }
  const page = await safeFetchText(pageUrl, { maxBytes: 1_500_000, timeoutMs: 10_000, headers: { Accept: "text/html" } });
  return page.ok ? previewImageFrom(page.text, pageUrl) : null;
}

export async function runVisualRefs(brandId: string, clientId: string, refresh = false, opts: { cachedOnly?: boolean } = {}): Promise<VisualRefsOutcome> {
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("brand_name, company_name, industry, description, primary_color, secondary_color, dna, research, visual_refs, visual_refs_at")
    .eq("id", brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return { ok: false, status: 404, error: "Brand not found." };
  const kept = validateVisualRefs(brand.visual_refs);
  if (kept && !refresh && brand.visual_refs_at && Date.now() - new Date(brand.visual_refs_at).getTime() < FRESH_MS) return { ok: true, value: kept, cached: true };
  if (opts.cachedOnly) return { ok: false, status: 404, error: "No references yet." };

  let provider;
  try { provider = assistantProvider(); } catch { return { ok: false, status: 503, error: "References aren't available right now." }; }
  if (provider.name !== "anthropic") return { ok: false, status: 503, error: "References aren't available right now." };
  const model = assistantModelFor("chat", provider.name);
  const name = brand.brand_name || brand.company_name || "the brand";
  const research = validateResearch(brand.research);
  const call = async (body: object, timeout: number) => {
    const res = await fetch(provider.url, { method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) }).catch(() => null);
    return res?.ok ? res.json().catch(() => null) : null;
  };
  const textOf = (d: { content?: Array<{ type: string; text?: string }> } | null) => (d?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let usd = 0;
  const spend = (d: { usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } } | null) => {
    usd += (estimateUsd(model, { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 }) ?? 0) + (d?.usage?.server_tool_use?.web_search_requests ?? 0) * 0.01;
  };

  // 1. Pages with strong work in the category.
  const found = await call({
    model, max_tokens: 6000, system: REF_SEARCH_SYSTEM,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: refSearchPrompt({ name, industry: research?.industry || brand.industry, description: brand.description, peers: research?.peers.map((p) => p.name), location: (brand.dna as { location?: string } | null)?.location }) }],
  }, 120_000);
  spend(found);
  const pages = validatePages(jsonFrom(textOf(found)));
  if (pages.length < 3) return { ok: false, status: 502, error: "Couldn't find enough references just now. Try again in a minute." };

  // 2. Each page's picture, fetched and checked (Claude only sees real images).
  const pictures = (await Promise.all(pages.map(async (p) => {
    const image = await pictureFor(p.url).catch(() => null);
    if (process.env.DEBUG_REFS) console.log("ref page", p.url, "→", image ?? "no picture");
    if (!image) return null;
    const got = await safeFetchBytes(image, { maxBytes: MAX_PICTURE_BYTES, timeoutMs: 10_000 }).catch(() => null);
    const type = got?.ok ? imageTypeOf(got.bytes) : null;
    if (process.env.DEBUG_REFS) console.log("   picture", got?.ok ? `${got.bytes.length} bytes ${type}` : `failed: ${got && !got.ok ? got.reason : "error"}`);
    if (!got?.ok || !type || type === "image/gif") return null;
    return { ref: { ...p, image, source: new URL(p.url).hostname.replace(/^www\./, "") } as VisualRef, bytes: got.bytes, type };
  }))).filter((x): x is NonNullable<typeof x> => !!x).slice(0, MAX_PICTURES);
  if (pictures.length < 3) return { ok: false, status: 502, error: "The references had no pictures we could look at. Try again." };

  // 3. Claude looks at them and writes the art direction for this brand.
  const colours = [brand.primary_color, brand.secondary_color].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));
  const looked = await call({
    model, max_tokens: 4000, system: DIRECTION_SYSTEM,
    messages: [{ role: "user", content: [
      ...pictures.map((p) => ({ type: "image", source: { type: "base64", media_type: p.type, data: Buffer.from(p.bytes).toString("base64") } })),
      { type: "text", text: directionPrompt({ name, industry: research?.industry || brand.industry, colours, refs: pictures.map((p) => p.ref) }) },
    ] }],
  }, 90_000);
  spend(looked);
  const checked = validateDirection(jsonFrom(textOf(looked)), pictures.map((p) => p.ref));
  console.info("visual refs usage", JSON.stringify({ brand: brandId, model, pages: pages.length, pictures: pictures.length, ok: !!checked, usd: Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "visual_refs", provider: provider.name, model, brandId, usd, ok: !!checked, meta: { pages: pages.length, pictures: pictures.length } });
  if (!checked) return { ok: false, status: 502, error: "Couldn't read the references this time. Try again." };
  const value: VisualRefs = { ...checked, at: new Date().toISOString() };
  await supabaseAdmin.from("brand_profiles").update({ visual_refs: value, visual_refs_at: value.at }).eq("id", brandId).eq("client_id", clientId);
  return { ok: true, value, cached: false };
}
