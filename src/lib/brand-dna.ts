/**
 * Brand DNA v2 (2026-10-11): what BlinkSpot needs to know to make on-brand content, and nothing
 * it doesn't. Asked in onboarding (the short version) and on the Brand page (all of it).
 *
 * The classic form asked for a legal company name and an "industry context", but not who buys,
 * where the business is, what it sells, how customers reach it or which language it speaks. Those
 * are what decide whether a poster or caption is usable, so they lead here. Stored in
 * brand_profiles.dna (jsonb) next to the existing columns; products live in `products`.
 */

export type BrandDna = {
  tagline?: string;
  audience?: string;
  location?: string;
  usps?: string[];
  offer?: string;
  languages?: string[];
  /** 0 = very casual, 100 = very formal. */
  formality?: number;
  emoji?: "none" | "some" | "lots";
  cta?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  photoVibes?: string[];
  avoidVisual?: string;
  /** Who runs the account: one business, an agency for clients, or a creator. */
  role?: "business" | "agency" | "creator";
};

export const INDUSTRIES = [
  "Food & drink", "Restaurant & café", "Fashion & clothing", "Beauty & skincare", "Health & fitness",
  "Real estate", "Hospitality & travel", "Events & entertainment", "Retail & e-commerce", "Tech & apps",
  "Professional services", "Education", "Automotive", "Agriculture", "Creator / personal brand", "Non-profit",
];
export const LANGUAGES = ["English", "Swahili", "Sheng", "French", "Arabic", "Amharic", "Somali", "Luganda"];
export const PERSONALITY = ["Warm", "Bold", "Playful", "Premium", "Calm", "Honest", "Witty", "Expert", "Energetic", "Elegant", "Down-to-earth", "Inspiring"];
export const PHOTO_VIBES = ["Bright & clean", "Warm & natural", "Dark & moody", "Bold & colourful", "Minimal studio", "Real people", "Street & urban", "Luxury"];
export const CTAS = ["Order on WhatsApp", "Call us", "Book now", "Visit our shop", "Shop online", "DM us", "Learn more"];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined) || undefined;
const list = (v: unknown, n: number, max: number, allowed?: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, max)).filter(Boolean))].filter((x) => !allowed || allowed.includes(x) || x.length <= max).slice(0, n) : undefined;
const phone = (v: unknown) => { const s = str(v, 24); return s && /^[+\d][\d\s()-]{5,22}$/.test(s) ? s : undefined; };

/** Server-side: keep only known fields, sized and typed. Never trust what the browser sends. */
export function cleanDna(raw: unknown): BrandDna {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const formality = typeof r.formality === "number" && Number.isFinite(r.formality) ? Math.round(Math.min(100, Math.max(0, r.formality))) : undefined;
  const out: BrandDna = {
    tagline: str(r.tagline, 90),
    audience: str(r.audience, 300),
    location: str(r.location, 120),
    usps: list(r.usps, 3, 120),
    offer: str(r.offer, 200),
    languages: list(r.languages, 4, 30),
    formality,
    emoji: r.emoji === "none" || r.emoji === "some" || r.emoji === "lots" ? r.emoji : undefined,
    cta: str(r.cta, 60),
    whatsapp: phone(r.whatsapp),
    phone: phone(r.phone),
    email: (() => { const e = str(r.email, 120); return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined; })(),
    photoVibes: list(r.photoVibes, 4, 30),
    avoidVisual: str(r.avoidVisual, 300),
    role: r.role === "business" || r.role === "agency" || r.role === "creator" ? r.role : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as BrandDna;
}

export type BrandCore = {
  brand_name?: string | null; description?: string | null; industry?: string | null; website_url?: string | null; social_urls?: string | null;
  logo_url?: string | null; primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null;
  additional_colors?: unknown; primary_font?: string | null; secondary_font?: string | null; brand_voice?: string | null; tone_keywords?: unknown;
  visual_style_guide?: string | null; uploaded_assets?: unknown; dos?: string | null; donts?: string | null; vocabulary_notes?: string | null;
};
export type BrandProduct = { id?: string; name: string; description?: string | null; price?: number | null; currency?: string | null; image_url?: string | null };

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);

/** What a brand is missing, most useful first, and a 0-100 score for the strength meter. */
export function brandStrength(core: BrandCore, dna: BrandDna, products: BrandProduct[]) {
  const checks: Array<[boolean, string, number]> = [
    [!!core.description && core.description.length > 20, "Say what you do in a sentence", 14],
    [!!core.logo_url, "Add your logo", 12],
    [!!dna.audience, "Say who it's for", 12],
    [products.length > 0, "Add a product or service", 12],
    [!!core.primary_color, "Pick your colours", 8],
    [arr(core.tone_keywords).length > 0 || !!core.brand_voice, "Describe how you sound", 10],
    [!!dna.location, "Say where you're based", 7],
    [!!(dna.whatsapp || dna.phone || dna.email || core.website_url), "Add how people reach you", 8],
    [(dna.usps?.length ?? 0) > 0, "Say why people choose you", 7],
    [arr(core.uploaded_assets).length > 0, "Add photos that feel like you", 6],
    [(dna.languages?.length ?? 0) > 0, "Pick your languages", 4],
  ];
  const score = checks.reduce((s, [ok, , w]) => s + (ok ? w : 0), 0);
  return { score: Math.min(100, score), missing: checks.filter(([ok]) => !ok).map(([, label]) => label) };
}

/**
 * The brand as the AI reads it (Ask BlinkSpot, the landing-page builder, captions). Plain lines,
 * most important first, with a hard size cap so it can sit in every prompt.
 */
export function brandBrief(core: BrandCore, dna: BrandDna, products: BrandProduct[] = [], maxChars = 2400): string {
  const tone = arr(core.tone_keywords);
  const formality = dna.formality === undefined ? "" : dna.formality < 35 ? "casual and friendly" : dna.formality > 65 ? "formal and polished" : "friendly but professional";
  const lines = [
    `Brand: ${core.brand_name || "Unnamed"}${dna.tagline ? ` — "${dna.tagline}"` : ""}`,
    core.description ? `What they do: ${core.description}` : "",
    core.industry ? `Industry: ${core.industry}` : "",
    dna.audience ? `Who it's for: ${dna.audience}` : "",
    dna.location ? `Based in: ${dna.location}` : "",
    dna.usps?.length ? `Why people choose them: ${dna.usps.join("; ")}` : "",
    dna.offer ? `Current offer: ${dna.offer}` : "",
    products.length ? `Products and services: ${products.slice(0, 12).map((p) => `${p.name}${p.price ? ` (${p.currency || "KES"} ${p.price})` : ""}${p.description ? `: ${p.description.slice(0, 90)}` : ""}`).join(" | ")}` : "",
    tone.length || core.brand_voice ? `Voice: ${[tone.join(", "), formality, core.brand_voice].filter(Boolean).join(". ")}` : formality ? `Voice: ${formality}` : "",
    dna.languages?.length ? `Languages: ${dna.languages.join(", ")}` : "",
    dna.emoji ? `Emoji: ${dna.emoji === "none" ? "never" : dna.emoji === "some" ? "a few" : "lots"}` : "",
    core.vocabulary_notes ? `Words: ${core.vocabulary_notes}` : "",
    core.dos ? `Always: ${core.dos.replace(/\n+/g, "; ")}` : "",
    core.donts ? `Never: ${core.donts.replace(/\n+/g, "; ")}` : "",
    [core.primary_color, core.secondary_color, core.accent_color].some(Boolean) ? `Colours: ${[core.primary_color, core.secondary_color, core.accent_color].filter(Boolean).join(", ")}` : "",
    core.primary_font ? `Fonts: ${[core.primary_font, core.secondary_font].filter(Boolean).join(" / ")}` : "",
    core.visual_style_guide || dna.photoVibes?.length ? `Photo style: ${[dna.photoVibes?.join(", "), core.visual_style_guide].filter(Boolean).join(". ")}` : "",
    dna.avoidVisual ? `Avoid in visuals: ${dna.avoidVisual}` : "",
    dna.cta ? `Main call to action: ${dna.cta}` : "",
    [dna.whatsapp && `WhatsApp ${dna.whatsapp}`, dna.phone && `phone ${dna.phone}`, dna.email, core.website_url].some(Boolean) ? `Contact (the only details allowed): ${[dna.whatsapp && `WhatsApp ${dna.whatsapp}`, dna.phone && `phone ${dna.phone}`, dna.email, core.website_url].filter(Boolean).join(", ")}` : "",
  ].filter(Boolean);
  let out = "";
  for (const l of lines) { if ((out + l).length + 1 > maxChars) break; out += `${l}\n`; }
  return out.trim();
}
