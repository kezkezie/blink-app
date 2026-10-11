import { supabaseAdmin } from "@/lib/supabase-server";
import { brandBrief, cleanDna, type BrandDna } from "@/lib/brand-dna";
import type { SiteContact, SiteImage, SiteProduct, SiteStyle, SiteTheme } from "./spec";

/**
 * Brand Brain (2026-10-11): everything BlinkSpot knows about one brand, gathered in one place so
 * any feature (the landing-page builder first) can ask "what's relevant to this task?".
 * A mini RAG without a vector store: knowledge is split into small chunks (brand facts, products,
 * past captions, image captions) and scored against the task by keyword overlap, like the AIOS
 * `brain` tool. Small brands fit whole; bigger ones get the most relevant chunks.
 */

export type BrainChunk = { kind: "fact" | "product" | "post" | "image"; text: string; ref?: string };
export type BrandBrain = {
  brandId: string;
  name: string;
  logoUrl: string | null;
  tagline?: string;
  brief: string;
  dna: BrandDna;
  products: SiteProduct[];
  images: SiteImage[];
  contact: SiteContact;
  theme: SiteTheme;
  chunks: BrainChunk[];
};

const IMAGE_TYPES = ["post_image", "carousel", "post", "image"];
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : []; } catch { return []; } })() : []);
const isImage = (u: string) => /^https:\/\//.test(u) && !/\.(mp4|mov|webm)(\?|$)/i.test(u);
const lum = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 1; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

function styleFor(tone: string[]): SiteStyle {
  const t = tone.map((x) => x.toLowerCase());
  if (t.some((x) => ["premium", "elegant", "calm", "luxury"].includes(x))) return "editorial";
  if (t.some((x) => ["bold", "energetic", "street", "witty"].includes(x))) return "bold";
  if (t.some((x) => ["warm", "playful", "down-to-earth", "friendly"].includes(x))) return "soft";
  return "minimal";
}

export async function loadBrandBrain(clientId: string, brandId: string): Promise<BrandBrain | null> {
  const [{ data: b }, { data: products }, { data: posts }] = await Promise.all([
    supabaseAdmin.from("brand_profiles").select("*").eq("id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle(),
    supabaseAdmin.from("products").select("id, name, description, price, currency, image_url").eq("brand_id", brandId).eq("client_id", clientId).limit(24),
    supabaseAdmin.from("content").select("id, caption, image_prompt_used, ai_prompt_used, status, image_urls, content_type, created_at").eq("brand_id", brandId).eq("client_id", clientId)
      .in("content_type", IMAGE_TYPES).not("status", "in", "(failed,archived)")
      // Storyboard start/end frames are saved as post_image; they are video parts, not brand photos (NULL-safe, as in the Library).
      .or('caption.is.null,caption.not.ilike."Storyboard: Scene*"')
      .order("created_at", { ascending: false }).limit(60),
  ]);
  if (!b) return null;
  const dna = cleanDna(b.dna);
  const prods: SiteProduct[] = (products ?? []).map((p) => ({ id: p.id as string, name: p.name as string, description: p.description as string | null, price: p.price as number | null, currency: p.currency as string | null, image_url: p.image_url as string | null }));

  // Images: the brand's own Library posts first (with captions), then its reference photos.
  const images: SiteImage[] = [];
  // Approved posts first (the owner liked them), then the newest. Many posts have no caption, so the
  // prompt that made the image describes it instead.
  const ranked = [...(posts ?? [])].sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved"));
  for (const p of ranked) {
    const url = arr(p.image_urls).find(isImage);
    const about = [p.caption, p.image_prompt_used, p.ai_prompt_used].find((x) => typeof x === "string" && x.trim()) as string | undefined;
    if (url && !images.some((i) => i.url === url)) images.push({ id: `p_${String(p.id).slice(0, 8)}`, url, caption: about ? about.replace(/\s+/g, " ").slice(0, 160) : undefined });
  }
  arr(b.uploaded_assets).filter(isImage).slice(0, 12).forEach((url, i) => images.push({ id: `r_${i}`, url, caption: "Reference photo of the brand" }));
  prods.forEach((p) => { if (p.image_url) images.push({ id: `x_${p.id.slice(0, 8)}`, url: p.image_url, caption: `Product: ${p.name}` }); });

  const background = arr(b.additional_colors)[0] || "#F7F5F0";
  const tone = arr(b.tone_keywords);
  const theme: SiteTheme = {
    style: styleFor(tone),
    mode: lum(background) < 0.35 ? "dark" : "light",
    primary: (b.primary_color as string) || "#111111",
    secondary: (b.secondary_color as string) || "#E8E2D6",
    accent: (b.accent_color as string) || (b.secondary_color as string) || "#FF6B35",
    background,
    headingFont: (b.primary_font as string) || "Plus Jakarta Sans",
    bodyFont: (b.secondary_font as string) || (b.primary_font as string) || "Inter",
  };
  const contact: SiteContact = {
    whatsapp: dna.whatsapp, phone: dna.phone, email: dna.email, location: dna.location, website: (b.website_url as string) || undefined,
    socials: typeof b.social_urls === "string" ? b.social_urls.split(/\n|,/).map((x: string) => x.trim()).filter(Boolean).slice(0, 6) : [], cta: dna.cta,
  };
  const brief = brandBrief(b, dna, prods, 3000);
  const chunks: BrainChunk[] = [
    ...brief.split("\n").map((t) => ({ kind: "fact" as const, text: t })),
    ...prods.map((p) => ({ kind: "product" as const, text: `${p.name}${p.price ? ` ${p.currency || "KES"} ${p.price}` : ""}${p.description ? `: ${p.description}` : ""}`, ref: p.id })),
    ...(posts ?? []).filter((p) => typeof p.caption === "string" && p.caption.trim()).slice(0, 30).map((p) => ({ kind: "post" as const, text: String(p.caption).slice(0, 220) })),
    ...images.map((i) => ({ kind: "image" as const, text: i.caption ?? "", ref: i.id })),
  ];
  // "mama njeri kitchen" → "Mama Njeri Kitchen" for display; names with their own casing are kept.
  const rawName = (b.brand_name as string) || "Your brand";
  const name = rawName === rawName.toLowerCase() ? rawName.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : rawName;
  return { brandId, name, logoUrl: (b.logo_url as string) || null, tagline: dna.tagline, brief, dna, products: prods, images: images.slice(0, 40), contact, theme, chunks };
}

const STOP = new Set("the a an and or of to in for on with our your my we you is are it this that be at by from as".split(" "));
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** The chunks most relevant to a task, best first (facts always lead: they're short and always useful). */
export function retrieve(brain: BrandBrain, task: string, k = 24): BrainChunk[] {
  const q = new Set(words(task));
  const scored = brain.chunks.map((c, i) => {
    const w = words(c.text);
    const hits = w.filter((x) => q.has(x)).length;
    return { c, score: (c.kind === "fact" ? 2 : 0) + hits * 3 + (c.kind === "product" ? 1 : 0) - i * 0.001 };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.c);
}
