import { supabaseAdmin } from "@/lib/supabase-server";
import { validateResearch } from "@/lib/brand-research";
import type { MotionBrief, MotionShape, MotionSpec } from "@/lib/motion/spec";

/**
 * What a motion plan may use from a brand (shared by /api/editor/motion and Motion Inspo,
 * 2026-10-21): its colours, font, logo, website and handle, and its product photos plus a few
 * recent pictures (or the one asked for) as short refs, so Claude can only show pictures we offered.
 */
export type MotionPicture = { ref: string; url: string; title: string };
export type MotionContext = {
  brand: { primary: string | null; secondary: string | null };
  pictures: MotionPicture[];
  brief: (b: Pick<MotionBrief, "prompt" | "shape"> & Partial<Pick<MotionBrief, "screens" | "source">>) => MotionBrief;
};

const urlsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || u.includes("/video/upload/");

export async function motionContext(clientId: string, brandId: string, opts: { pictureId?: string | null; recent?: number } = {}): Promise<MotionContext | null> {
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("brand_name, company_name, industry, primary_color, secondary_color, primary_font, logo_url, website_url, social_urls, research")
    .eq("id", brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return null;
  const [{ data: products }, { data: posts }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, price, currency, image_url").eq("brand_id", brandId).eq("client_id", clientId).not("image_url", "is", null).limit(8),
    opts.pictureId
      ? supabaseAdmin.from("content").select("id, caption, image_urls").eq("id", opts.pictureId).eq("client_id", clientId).limit(1)
      : supabaseAdmin.from("content").select("id, caption, image_urls").eq("brand_id", brandId).eq("client_id", clientId).in("content_type", ["post_image", "post"]).order("created_at", { ascending: false }).limit(opts.recent ?? 6),
  ]);
  const pictures: MotionPicture[] = [];
  for (const p of products ?? []) if (typeof p.image_url === "string" && p.image_url) pictures.push({ ref: `img${pictures.length + 1}`, url: p.image_url, title: String(p.name ?? "Product").slice(0, 60) });
  const productRefs = (products ?? []).map((p, i) => ({ ref: `img${i + 1}`, name: String(p.name ?? ""), price: p.price != null ? `${p.currency ? `${p.currency} ` : ""}${p.price}` : null }));
  for (const c of posts ?? []) {
    const url = urlsOf(c.image_urls).find((u) => !isVideo(u));
    if (url) pictures.push({ ref: `img${pictures.length + 1}`, url, title: String(c.caption ?? "Picture").replace(/\s+/g, " ").slice(0, 60) });
  }
  const handle = typeof brand.social_urls === "string" ? brand.social_urls.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)?.[1] : undefined;
  const research = validateResearch(brand.research);
  const colours = [brand.primary_color, brand.secondary_color].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c));
  return {
    brand: { primary: brand.primary_color ?? null, secondary: brand.secondary_color ?? null },
    pictures,
    brief: (b) => ({
      brandName: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, prompt: b.prompt, shape: b.shape, colours,
      font: brand.primary_font, hasLogo: !!brand.logo_url, products: productRefs,
      pictures: pictures.slice(productRefs.length).map((p) => ({ ref: p.ref, title: p.title })),
      look: research?.visualLanguage?.slice(0, 300) ?? null,
      website: typeof brand.website_url === "string" ? brand.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null,
      handle: handle ? `@${handle}` : null,
      screens: b.screens ?? [],
      source: b.source ?? null,
    }),
  };
}

/** Picture refs in a checked spec become our URLs. */
export function placePictures(spec: MotionSpec, pictures: MotionPicture[]) {
  const byRef = new Map(pictures.map((p) => [p.ref, p.url]));
  for (const s of spec.scenes) {
    if (s.template === "product-reveal" && s.image) s.image = byRef.get(s.image);
    if (s.template === "story" && s.picture) s.picture = byRef.get(s.picture);
    if (s.template === "showcase") s.images = s.images.map((u) => byRef.get(u) ?? u).filter((u) => /^https:\/\//.test(u));
  }
  return spec;
}

export const shapeOf = (width: number, height: number): MotionShape => (height > width * 1.15 ? "9:16" : width > height * 1.15 ? "16:9" : "1:1");
