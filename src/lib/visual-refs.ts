/**
 * Visual references for a brand (Kezie, 2026-10-16: "go over to websites like Pinterest, Behance...
 * look for images on Google and find designs in the same category with the brand. Then look for
 * the best way to create an image: good photographic looks, lifestyle..."). Claude searches the
 * web for strong work in the brand's category, the server fetches each page's preview picture,
 * and Claude looks at the actual pictures and writes concrete art direction per look. Generate's
 * design pass follows it; nothing is copied. Pure parts here; the calls are in visual-refs-server.
 */
import type { GenerateLook } from "@/lib/generate-prompt";

export type RefLook = Exclude<GenerateLook, "plain">;
export const REF_LOOKS: RefLook[] = ["poster", "studio", "lifestyle", "cinematic", "flatlay", "abstract"];
export type RefPage = { url: string; title: string; why: string; look: RefLook };
export type VisualRef = RefPage & { image: string; source: string };
export type VisualRefs = { refs: VisualRef[]; direction: Partial<Record<RefLook, string>>; notes: string; at: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lookOf = (v: unknown): RefLook => (REF_LOOKS.includes(v as RefLook) ? (v as RefLook) : "poster");

export const REF_SEARCH_SYSTEM = `You are an art director building a reference board for a brand. Use web search to find 12 to 16 web pages that each show ONE excellent, professional image in this brand's category: social media posts and ads, product photography, lifestyle photography, packaging and poster design.
Where to look (our server opens these pages to see their picture, and some sites refuse it):
- Pinterest pins: links of the form pinterest.com/pin/<number>/ (not boards or "ideas" pages).
- The websites, shops, lookbooks and press pages of leading brands in the same category.
- Portfolios and case studies of photographers and design studios, design blogs and magazines.
Do NOT use behance.net, dribbble.com, stock-photo sites, generic listicles or search-result pages.
Mix the looks: posters/ads with words, studio product shots, lifestyle photos, and if they fit the brand, cinematic, flat lay or 3D. Only pages you actually found in search results.
Reply with JSON only: {"pages":[{"url":"page url","title":"what the image is","why":"what makes it strong, concretely","look":"poster | studio | lifestyle | cinematic | flatlay | abstract"}]}`;

export function refSearchPrompt(b: { name: string; industry?: string | null; description?: string | null; peers?: string[]; location?: string | null }) {
  return [
    `Brand: ${b.name}`,
    b.industry ? `Category: ${b.industry}` : "",
    b.description ? `What it does: ${b.description.slice(0, 400)}` : "",
    b.peers?.length ? `Leading brands in the category: ${b.peers.join(", ")}` : "",
    b.location ? `Market: ${b.location}` : "",
    "Find the reference pages.",
  ].filter(Boolean).join("\n");
}

/** The pages Claude found, checked: https, no duplicates, no stock sites, at most 12. */
export function validatePages(raw: unknown): RefPage[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { pages?: unknown }).pages) ? (raw as { pages: unknown[] }).pages : [];
  const seen = new Set<string>();
  const out: RefPage[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    let url: URL;
    try { url = new URL(str(r.url, 500)); } catch { continue; }
    if (url.protocol !== "https:" || /shutterstock|istockphoto|gettyimages|adobestock|stock\.adobe|depositphotos|dreamstime|123rf|freepik|behance\.net|dribbble\.com/i.test(url.hostname)) continue;
    // Pinterest only as pins (boards and "ideas" pages have no one picture).
    if (/pinterest\./i.test(url.hostname) && !/\/pin\/\d+/.test(url.pathname)) continue;
    const key = `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: url.toString(), title: str(r.title, 100), why: str(r.why, 240), look: lookOf(r.look) });
    if (out.length >= 16) break;
  }
  return out;
}

/** A page's preview picture (og:image, twitter:image, image_src), made absolute. */
export function previewImageFrom(html: string, pageUrl: string): string | null {
  const metas = [...html.matchAll(/<meta\s+[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const tag = metas.find((t) => (attr(t, "property") ?? attr(t, "name"))?.toLowerCase() === key);
    const content = tag ? attr(tag, "content") : undefined;
    if (content) { try { return new URL(content.replace(/&amp;/g, "&"), pageUrl).toString(); } catch { /* next */ } }
  }
  const link = html.match(/<link\s+[^>]*rel=["']image_src["'][^>]*>/i)?.[0];
  const href = link ? attr(link, "href") : undefined;
  if (href) { try { return new URL(href, pageUrl).toString(); } catch { /* none */ } }
  return null;
}

/** A picture's type from its first bytes (what Claude can look at), or null. */
export function imageTypeOf(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") return "image/webp";
  if (String.fromCharCode(b[0], b[1], b[2]) === "GIF") return "image/gif";
  return null;
}

export const DIRECTION_SYSTEM = `You are a senior art director. You are shown reference images found for a brand's category (numbered in order). Study what makes the strong ones work: composition, camera angle and lens, lighting, colour handling, materials and props, typography and how much text, negative space.
Then write art direction for THIS brand to make its own original images (never copy a reference's logo, product, person, wording or layout exactly). For each look the brand would use, 2 or 3 concrete sentences an image model can follow, in the brand's own colours.
Reply with JSON only: {"direction":{"poster":"...","studio":"...","lifestyle":"...","cinematic":"...","flatlay":"...","abstract":"..."},"notes":"one line: what the best references have in common","keep":[numbers of the references that are genuinely good and on-category]}
Leave out a look that doesn't suit the brand.`;

export function directionPrompt(b: { name: string; industry?: string | null; colours: string[]; refs: Array<{ title: string; why: string; look: RefLook }> }) {
  return [
    `Brand: ${b.name}${b.industry ? ` (${b.industry})` : ""}`,
    b.colours.length ? `Brand colours: ${b.colours.join(", ")}` : "",
    "The references, in the order shown:",
    ...b.refs.map((r, i) => `${i + 1}. ${r.title} (${r.look})${r.why ? `: ${r.why}` : ""}`),
  ].filter(Boolean).join("\n");
}

/** The art direction, checked; refs kept are the ones Claude judged good (all, if it didn't say). */
export function validateDirection(raw: unknown, refs: VisualRef[]): Pick<VisualRefs, "direction" | "notes" | "refs"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const d = (r.direction && typeof r.direction === "object" ? r.direction : {}) as Record<string, unknown>;
  const direction: Partial<Record<RefLook, string>> = {};
  for (const look of REF_LOOKS) { const s = str(d[look], 500); if (s.split(" ").length >= 8) direction[look] = s; }
  if (!Object.keys(direction).length) return null;
  const keep = Array.isArray(r.keep) ? r.keep.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= refs.length) : [];
  return { direction, notes: str(r.notes, 240), refs: keep.length ? [...new Set(keep)].map((n) => refs[n - 1]) : refs };
}

/** Stored references, checked. */
export function validateVisualRefs(raw: unknown): VisualRefs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const refs = (Array.isArray(r.refs) ? r.refs : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const image = str(o.image, 1000), url = str(o.url, 500);
    return /^https:\/\//.test(image) && /^https:\/\//.test(url) ? { image, url, source: str(o.source, 80), title: str(o.title, 100), why: str(o.why, 240), look: lookOf(o.look) } : null;
  }).filter((x): x is VisualRef => !!x).slice(0, 12);
  const checked = validateDirection({ direction: r.direction, notes: r.notes }, refs);
  if (!checked) return null;
  return { refs, direction: checked.direction, notes: checked.notes, at: str(r.at, 40) };
}

/** The art direction line for a look, for the design pass. */
export function directionFor(v: VisualRefs | null | undefined, look: GenerateLook) {
  if (!v || look === "plain") return "";
  const d = v.direction[look as RefLook];
  return d ? `Art direction from strong work in this category (${v.refs.length} references, follow the craft, never copy): ${d}` : "";
}
