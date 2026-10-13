import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { ASSISTANT_MODEL, AssistantUnavailableError, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { loadBrandBrain, retrieve } from "@/lib/sites/brain";
import { placeImages, slugify, validateSections, validateSpec, validateTheme, type SiteSection, type SiteSpec } from "@/lib/sites/spec";
import { playbookFor } from "@/lib/sites/playbooks";
import { extractInspiration, inspirationBrief } from "@/lib/sites/inspiration";
import { normaliseWebsite } from "@/lib/brand-autofill";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { requestWorkspace } from "@/lib/brand-access";

/**
 * Landing-page builder: the AI plans the page from the Brand Brain (sections, copy, which of the
 * brand's own images go where); our templates render it. "full" makes the whole page, "section"
 * rewrites one section with the user's note. Uses the assistant model; no image credits.
 */
export const maxDuration = 120;

const RULES = `Rules:
- Use ONLY facts from the brand brief, products and images given. Never invent prices, phone numbers, addresses, opening hours, awards, statistics, client names or testimonials.
- Short, specific copy in the brand's voice and language(s). Headline at most 8 words. No buzzwords ("elevate", "unlock", "seamless", "world-class").
- Images: you can SEE the brand's images (each labelled with its id). Pages with the brand's own images convert far better, so use them:
  * hero: the best photo of the product, food, place or people (variant "split", or "full" if it is a striking wide photo). If the brand only has posters, use variant "split" with its best-looking poster. Use "type" only when there are no images.
  * about: a photo that shows the people, place or making of it, if there is one.
  * gallery: whenever there are 4 or more images, include one with the 6 to 9 best-looking that fit this brand (posters are fine here). Skip anything off-brand or broken.
  Use ids from the list only.
- Products: refer to them by productIds from the list (or leave productIds out to show all).`;

const FULL = `You are a senior web designer and conversion copywriter building a one-page landing page for a small brand.
Reply with JSON only (no markdown):
{"style":"editorial|bold|soft|minimal","mode":"light|dark","seo":{"title":"max 60 chars","description":"max 155 chars"},
 "imageRanking":["the brand's image ids from best to worst for this page; leave out off-brand, broken or unrelated ones"],
 "sections":[
  {"type":"hero","variant":"split|full|type","eyebrow":"optional, 2-5 words","headline":"...","sub":"1-2 sentences","cta":"button text","secondaryCta":"optional","imageId":"optional"},
  {"type":"highlights","title":"optional","items":[{"title":"2-6 words","body":"one sentence"}]},
  {"type":"products","title":"...","sub":"optional","productIds":["optional"]},
  {"type":"about","title":"...","body":"2-4 short sentences","imageId":"optional"},
  {"type":"gallery","title":"optional","imageIds":["3 to 9 ids"]},
  {"type":"faq","title":"optional","items":[{"q":"...","a":"..."}]},
  {"type":"contact","title":"...","sub":"optional"}
 ]}
Pick the sections that suit THIS brand, in the best order: always a hero first and contact last; products only if there are products; a gallery when there are 4+ images; faq only if the facts answer real questions (3-5 items).
If the owner gave a site they like, follow its section order, density and feel as closely as our section types allow (and its light/dark and boldness when choosing style and mode). Otherwise follow the playbook for this kind of business.
${RULES}`;

const ONE = (type: string) => `You are a senior web designer and copywriter. Rewrite ONE section of a landing page, type "${type}", following the user's note.
Reply with JSON only: the single section object, same shape as before (include "type":"${type}").
${RULES}`;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; mode?: unknown; sectionIndex?: unknown; instruction?: unknown; inspirationUrl?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && /^[0-9a-f-]{36}$/i.test(body.brandId) ? body.brandId : null;
  const mode = body.mode === "section" ? "section" : "full";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 500) : "";
  if (!brandId) return NextResponse.json({ error: "Pick a brand first." }, { status: 400 });

  const client = await requestWorkspace(request, auth.value, brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["site_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const brain = await loadBrandBrain(client.id, brandId);
  if (!brain) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from("sites").select("id, spec, slug, published").eq("brand_id", brandId).eq("client_id", client.id).maybeSingle();
  const base = {
    brand: { name: brain.name, logoUrl: brain.logoUrl, tagline: brain.tagline },
    theme: brain.theme, images: brain.images, products: brain.products, contact: brain.contact,
  };
  const current = existing?.spec && typeof existing.spec === "object" && Array.isArray((existing.spec as SiteSpec).sections) ? (existing.spec as SiteSpec) : null;

  let system: string, user: string;
  let sectionIndex = -1;
  if (mode === "section") {
    sectionIndex = typeof body.sectionIndex === "number" ? Math.floor(body.sectionIndex) : -1;
    const sec = current?.sections[sectionIndex];
    if (!current || !sec) return NextResponse.json({ error: "Build the page first." }, { status: 400 });
    system = ONE(sec.type);
    const relevant = retrieve(brain, `${sec.type} ${instruction} ${JSON.stringify(sec)}`, 28);
    user = [
      `What the brand is (most relevant first):\n${relevant.filter((c) => c.kind !== "image").map((c) => `- ${c.text}`).join("\n")}`,
      `Products: ${JSON.stringify(brain.products.map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency })))}`,
      `Images: ${JSON.stringify(brain.images.map((i) => ({ id: i.id, caption: i.caption })))}`,
      `The section now: ${JSON.stringify(sec)}`,
      `The user's note: ${instruction || "Make it better: clearer and more specific."}`,
    ].join("\n\n");
  } else {
    system = FULL;
    // Kezie's two ways in: a site the owner likes (structure and feel only), or what usually works
    // for this kind of business.
    let inspiration = "";
    const rawUrl = typeof body.inspirationUrl === "string" ? body.inspirationUrl.trim().slice(0, 300) : "";
    if (rawUrl) {
      const url = normaliseWebsite(rawUrl);
      const got = url ? await safeFetchBytes(url, { maxBytes: 2_500_000, timeoutMs: 12_000, headers: { "User-Agent": "Mozilla/5.0 (compatible; BlinkSpotBot/1.0; +https://www.blinkspot.io)", Accept: "text/html" } }) : null;
      if (!got || !got.ok || !/html/i.test(got.contentType)) return NextResponse.json({ error: "Couldn't open that site. Check the link, or build from what works for your kind of business." }, { status: 400 });
      inspiration = inspirationBrief(extractInspiration(new TextDecoder().decode(got.bytes), got.finalUrl));
    }
    const playbook = playbookFor(brain.industry, brain.description);
    user = [
      inspiration || `Playbook for ${playbook.label}: ${playbook.guide} Suggested style: ${playbook.style}.`,
      `Brand brief:\n${brain.brief}`,
      `Products (${brain.products.length}): ${JSON.stringify(brain.products.map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, about: p.description })))}`,
      `Images (${brain.images.length}): ${JSON.stringify(brain.images.map((i) => ({ id: i.id, caption: i.caption })))}`,
      `Past post captions (for voice): ${JSON.stringify(brain.chunks.filter((c) => c.kind === "post").slice(0, 10).map((c) => c.text))}`,
      `Contact on file: ${JSON.stringify({ whatsapp: !!brain.contact.whatsapp, phone: !!brain.contact.phone, email: !!brain.contact.email, location: brain.contact.location ?? null, cta: brain.contact.cta ?? null })}`,
      instruction ? `The owner's note: ${instruction}` : "",
    ].filter(Boolean).join("\n\n");
  }

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    if (e instanceof AssistantUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  // Let the model look at the brand's best photos (small thumbnails) so it picks by what they show.
  const thumb = (u: string) => (u.includes("res.cloudinary.com") && u.includes("/upload/") ? u.replace("/upload/", "/upload/w_320,h_320,c_limit,f_jpg,q_70/") : u);
  const looks = provider.name === "anthropic" ? brain.images.slice(0, mode === "full" ? 24 : 12).flatMap((im) => [
    { type: "text", text: `Image ${im.id}:` },
    { type: "image", source: { type: "url", url: thumb(im.url) } },
  ]) : [];
  const content = looks.length ? [...looks, { type: "text", text: user }] : user;
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: ASSISTANT_MODEL, max_tokens: mode === "full" ? 5000 : 1500, system, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "That took too long. Try again." }, { status: 504 });
  const data = (await res.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const usd = estimateUsd(ASSISTANT_MODEL, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 });
  console.info("site build usage", JSON.stringify({ user: auth.value, mode, ...data.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let out: Record<string, unknown>;
  try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Couldn't put the page together. Try again." }, { status: 502 }); }

  let spec: SiteSpec;
  if (mode === "section" && current) {
    const [sec] = validateSections([{ ...out, type: current.sections[sectionIndex].type }], brain.images, brain.products) as SiteSection[];
    if (!sec) return NextResponse.json({ error: "Couldn't rewrite that section. Try a different note." }, { status: 502 });
    const sections = current.sections.map((x, i) => (i === sectionIndex ? { ...sec, hidden: x.hidden } : x));
    spec = validateSpec({ ...current, sections }, { ...base, theme: current.theme });
  } else {
    const theme = validateTheme({ ...brain.theme, style: out.style, mode: out.mode }, brain.theme);
    spec = validateSpec({ seo: out.seo, sections: out.sections, theme }, { ...base, theme });
    spec = { ...spec, sections: placeImages(spec.sections, out.imageRanking, brain.images.map((i) => i.id)) };
  }

  const row = { spec, updated_at: new Date().toISOString() };
  if (existing) await supabaseAdmin.from("sites").update(row).eq("id", existing.id);
  else await supabaseAdmin.from("sites").insert({ ...row, client_id: client.id, brand_id: brandId, slug: null });
  return NextResponse.json({ spec, suggestedSlug: existing?.slug ?? slugify(brain.name), slug: existing?.slug ?? null, published: !!existing?.published });
}
