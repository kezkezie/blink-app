/**
 * Websites you like (Kezie, 2026-10-27: "people are having issues with the website just randomly
 * going to search for inspirations... let them go look for those particular type of websites then
 * pick the websites and give us as inspiration"). The owner pastes the addresses of sites they like;
 * the server opens each homepage (SSRF-safe) and keeps only its shape (section order, fonts, light or
 * dark, how much text, how many pictures: lib/sites/inspiration.ts); Claude turns those shapes into
 * patterns the website studio follows. Nothing is copied. Before this, Claude searched the web for
 * "sites like yours" by itself (2026-10-16); those finds are no longer used. Pure parts here.
 */
import type { Inspiration } from "./inspiration";

export type SiteRef = { url: string; name: string; why: string };
/** picked: chosen by the owner (only these are shown and followed). */
export type SiteRefs = { sites: Array<SiteRef & { host: string; dark: boolean | null; fonts: string[] }>; patterns: string; at: string; picked?: boolean };

export const MAX_SITES_YOU_LIKE = 5;

/** Where to look for sites to like, opened in a new tab. */
export const SITE_GALLERIES = [
  { name: "Awwwards", url: "https://www.awwwards.com/websites/" },
  { name: "Land-book", url: "https://land-book.com/" },
  { name: "SiteInspire", url: "https://www.siteinspire.com/" },
  { name: "Godly", url: "https://godly.website/" },
] as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Galleries, marketplaces and social sites are not one brand's website. */
const NOT_A_BRAND_SITE = /awwwards|siteinspire|land-book|landbook|godly\.website|lapa\.ninja|onepagelove|httpster|dribbble|behance|pinterest|instagram|facebook|tiktok|youtube|linkedin|twitter|x\.com|medium\.com|themeforest|envato|amazon\.|jumia\.|etsy\.com|tripadvisor|yelp\.|google\./i;

/**
 * A website address as people paste it ("stripe.com", "www.kith.com/pages/about", "http://...")
 * made into an https link, or why it can't be used.
 */
export function cleanSiteAddress(raw: unknown): { url: string; host: string } | { error: string } {
  const text = str(raw, 400);
  if (!text) return { error: "Paste a website address, like stripe.com." };
  let url: URL;
  try { url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`); } catch { return { error: "That doesn't look like a website address." }; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "That doesn't look like a website address." };
  url.protocol = "https:";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+)+$/.test(host)) return { error: "That doesn't look like a website address." };
  if (NOT_A_BRAND_SITE.test(host)) return { error: `Paste the website itself, not a gallery or social page: open the site from ${host.split(".")[0]} and copy its address.` };
  url.hash = "";
  return { url: url.toString(), host };
}

/** The sites to study: cleaned, one per domain, at most MAX_SITES_YOU_LIKE, or the first problem. */
export function cleanSiteList(raw: unknown): { sites: Array<{ url: string; host: string }> } | { error: string } {
  const list = Array.isArray(raw) ? raw : [];
  const out: Array<{ url: string; host: string }> = [];
  for (const x of list) {
    const c = cleanSiteAddress(x);
    if ("error" in c) return c;
    if (!out.some((o) => o.host === c.host)) out.push(c);
  }
  return out.length > MAX_SITES_YOU_LIKE ? { error: `Up to ${MAX_SITES_YOU_LIKE} websites.` } : { sites: out };
}

export const PATTERNS_SYSTEM = `You are a web design lead. You get the structure of websites the brand's owner likes (their section headings in order, menu, fonts, light or dark, how much text, how many pictures). Write the patterns a new landing page for this brand should follow so it feels like those sites: craft to borrow, never their words, names or pictures.
Reply with JSON only: {"patterns":"5 to 8 short lines (under 40 words each), each starting with a dash: the section order that works in this category, the hero approach, typography, light or dark and colour use, picture use, motion, how much text, and the main call to action"}`;

export function patternsPrompt(name: string, industry: string | null | undefined, shapes: Array<{ ref: SiteRef; shape: Inspiration }>) {
  return [
    `Brand: ${name}${industry ? ` (${industry})` : ""}`,
    ...shapes.map(({ ref, shape }, n) => [
      `Site ${n + 1}: ${ref.name} (${new URL(ref.url).hostname})${ref.why ? `. Does well: ${ref.why}` : ""}`,
      shape.outline.length ? `Sections: ${shape.outline.slice(0, 16).join(" | ")}` : "",
      shape.nav.length ? `Menu: ${shape.nav.join(", ")}` : "",
      `${shape.dark === null ? "" : shape.dark ? "Dark. " : "Light. "}${shape.words} words, ${shape.images} pictures.${shape.fonts.length ? ` Fonts: ${shape.fonts.join(", ")}.` : ""}`,
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}

/** A line no longer than max, ending on a whole word ("…" when cut): "our own photogra" read badly. */
const wholeWords = (l: string, max: number) => (l.length <= max ? l : `${l.slice(0, l.lastIndexOf(" ", max - 1)).replace(/[,;:]$/, "")}…`);

/** Patterns as dashed lines, at most 8, each short. */
export function validatePatterns(raw: unknown): string | null {
  const p = raw && typeof raw === "object" ? (raw as { patterns?: unknown }).patterns : null;
  const lines = (Array.isArray(p) ? p.map(String) : typeof p === "string" ? p.split(/\n+/) : [])
    .map((l) => wholeWords(l.replace(/^\s*[-•*\d.)]+\s*/, "").replace(/\s+/g, " ").trim(), 320)).filter((l) => l.split(" ").length >= 4).slice(0, 8);
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
  return patterns && sites.length ? { sites, patterns, at: typeof r.at === "string" ? r.at : new Date(0).toISOString(), ...(r.picked === true ? { picked: true } : {}) } : null;
}
