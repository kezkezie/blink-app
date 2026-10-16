/**
 * Website research for a brand (Kezie, 2026-10-16: "go and research to find better designs... I
 * also want the same for websites"). Claude searches the web for well-designed sites of brands in
 * the same category; the server opens each homepage (SSRF-safe) and keeps only its shape (section
 * order, fonts, light or dark, how much text, how many pictures: lib/sites/inspiration.ts); Claude
 * turns those shapes into patterns the website studio follows. Nothing is copied. Pure parts here.
 */
import type { Inspiration } from "./inspiration";

export type SiteRef = { url: string; name: string; why: string };
export type SiteRefs = { sites: Array<SiteRef & { host: string; dark: boolean | null; fonts: string[] }>; patterns: string; at: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Galleries, marketplaces and social sites are not one brand's website. */
const NOT_A_BRAND_SITE = /awwwards|siteinspire|land-book|landbook|godly\.website|lapa\.ninja|onepagelove|httpster|dribbble|behance|pinterest|instagram|facebook|tiktok|youtube|linkedin|twitter|x\.com|medium\.com|wix\.com|squarespace\.com|shopify\.com|webflow\.com|themeforest|envato|wordpress\.com|amazon\.|jumia\.|etsy\.com|tripadvisor|yelp\.|google\./i;

export const SITE_SEARCH_SYSTEM = `You are a web design lead researching websites for a brand. Use web search to find 8 to 10 real websites of brands in the same category (or a close one) whose website design is excellent: modern, distinctive, award-level (the kind featured on Awwwards, SiteInspire or Land-book), and right for this kind of business.
Return each brand's own website (its homepage or main landing page), never the gallery, an article, a marketplace listing or a social profile. Prefer a mix: leaders in the category worldwide, and strong ones in the brand's market. Only sites you actually found in search results.
Reply with JSON only: {"sites":[{"url":"https://...","name":"brand name","why":"what its website does well, concretely (layout, hero, type, motion)"}]}`;

export function siteSearchPrompt(b: { name: string; industry?: string | null; description?: string | null; peers?: string[]; location?: string | null }) {
  return [
    `Brand: ${b.name}`,
    b.industry ? `Category: ${b.industry}` : "",
    b.description ? `What it does: ${b.description.slice(0, 400)}` : "",
    b.peers?.length ? `Leading brands in the category: ${b.peers.join(", ")}` : "",
    b.location ? `Market: ${b.location}` : "",
    "Find the websites.",
  ].filter(Boolean).join("\n");
}

/** The sites Claude found: https brand sites, one per domain, at most 10. */
export function validateSites(raw: unknown): SiteRef[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { sites?: unknown }).sites) ? (raw as { sites: unknown[] }).sites : [];
  const seen = new Set<string>();
  const out: SiteRef[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    let url: URL;
    try { url = new URL(str(r.url, 400)); } catch { continue; }
    const host = url.hostname.replace(/^www\./, "");
    if (url.protocol !== "https:" || NOT_A_BRAND_SITE.test(host) || seen.has(host)) continue;
    seen.add(host);
    out.push({ url: url.toString(), name: str(r.name, 60) || host, why: str(r.why, 240) });
    if (out.length >= 10) break;
  }
  return out;
}

export const PATTERNS_SYSTEM = `You are a web design lead. You get the structure of several well-designed websites in one category (their section headings in order, menu, fonts, light or dark, how much text, how many pictures, and what each does well). Write the patterns a new landing page for this brand should follow: craft to borrow, never their words, names or pictures.
Reply with JSON only: {"patterns":"5 to 8 short lines, each starting with a dash: the section order that works in this category, the hero approach, typography, light or dark and colour use, picture use, motion, how much text, and the main call to action"}`;

export function patternsPrompt(name: string, industry: string | null | undefined, shapes: Array<{ ref: SiteRef; shape: Inspiration }>) {
  return [
    `Brand: ${name}${industry ? ` (${industry})` : ""}`,
    ...shapes.map(({ ref, shape }, n) => [
      `Site ${n + 1}: ${ref.name} (${new URL(ref.url).hostname}). Does well: ${ref.why || "n/a"}`,
      shape.outline.length ? `Sections: ${shape.outline.slice(0, 16).join(" | ")}` : "",
      shape.nav.length ? `Menu: ${shape.nav.join(", ")}` : "",
      `${shape.dark === null ? "" : shape.dark ? "Dark. " : "Light. "}${shape.words} words, ${shape.images} pictures.${shape.fonts.length ? ` Fonts: ${shape.fonts.join(", ")}.` : ""}`,
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}

/** Patterns as dashed lines, at most 8, each short. */
export function validatePatterns(raw: unknown): string | null {
  const p = raw && typeof raw === "object" ? (raw as { patterns?: unknown }).patterns : null;
  const lines = (Array.isArray(p) ? p.map(String) : typeof p === "string" ? p.split(/\n+/) : [])
    .map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 220)).filter((l) => l.split(" ").length >= 4).slice(0, 8);
  return lines.length >= 3 ? lines.map((l) => `- ${l}`).join("\n") : null;
}

export function validateSiteRefs(raw: unknown): SiteRefs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const patterns = typeof r.patterns === "string" ? r.patterns : null;
  const sites = Array.isArray(r.sites) ? r.sites.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const x = s as Record<string, unknown>;
    if (typeof x.url !== "string" || !x.url.startsWith("https://")) return [];
    return [{ url: x.url, name: str(x.name, 60), why: str(x.why, 240), host: str(x.host, 80), dark: typeof x.dark === "boolean" ? x.dark : null, fonts: Array.isArray(x.fonts) ? x.fonts.map(String).slice(0, 4) : [] }];
  }) : [];
  return patterns && sites.length ? { sites, patterns, at: typeof r.at === "string" ? r.at : new Date(0).toISOString() } : null;
}
