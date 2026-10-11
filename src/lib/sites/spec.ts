/**
 * A landing page as data (2026-10-11). The AI writes this plan; our templates render it, so every
 * page looks finished, works on phones and can be edited section by section. Pure: validated
 * here before it is saved or shown, whatever the model returned.
 */

export type SiteStyle = "editorial" | "bold" | "soft" | "minimal";
export type SiteTheme = {
  style: SiteStyle;
  mode: "light" | "dark";
  primary: string; secondary: string; accent: string; background: string;
  headingFont: string; bodyFont: string;
};
export type SiteImage = { id: string; url: string; caption?: string };
export type HeroSection = { type: "hero"; variant: "split" | "full" | "type"; eyebrow?: string; headline: string; sub?: string; cta?: string; secondaryCta?: string; imageId?: string; hidden?: boolean };
export type HighlightsSection = { type: "highlights"; title?: string; items: Array<{ title: string; body?: string }>; hidden?: boolean };
export type ProductsSection = { type: "products"; title?: string; sub?: string; productIds?: string[]; hidden?: boolean };
export type GallerySection = { type: "gallery"; title?: string; imageIds: string[]; hidden?: boolean };
export type AboutSection = { type: "about"; title: string; body: string; imageId?: string; hidden?: boolean };
export type FaqSection = { type: "faq"; title?: string; items: Array<{ q: string; a: string }>; hidden?: boolean };
export type ContactSection = { type: "contact"; title: string; sub?: string; hidden?: boolean };
export type SiteSection = HeroSection | HighlightsSection | ProductsSection | GallerySection | AboutSection | FaqSection | ContactSection;

export type SiteProduct = { id: string; name: string; description?: string | null; price?: number | null; currency?: string | null; image_url?: string | null };
export type SiteContact = { whatsapp?: string; phone?: string; email?: string; location?: string; website?: string; socials?: string[]; cta?: string };

export type SiteSpec = {
  version: 1;
  brand: { name: string; logoUrl?: string | null; tagline?: string };
  theme: SiteTheme;
  seo: { title: string; description: string };
  sections: SiteSection[];
  /** Copied in at build time so the public page never reads the private brand tables. */
  images: SiteImage[];
  products: SiteProduct[];
  contact: SiteContact;
};

export const SECTION_TYPES = ["hero", "highlights", "products", "gallery", "about", "faq", "contact"] as const;
export const SECTION_LABEL: Record<SiteSection["type"], string> = {
  hero: "Hero", highlights: "Why us", products: "Products", gallery: "Gallery", about: "About", faq: "Questions", contact: "Contact",
};

const HEX = /^#[0-9a-f]{6}$/i;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => s(v, max) || undefined;
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback);
const font = (v: unknown, fallback: string) => (typeof v === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(v) ? v : fallback);

/** Keep only what our templates can render, sized for the layout, pointing at known images/products. */
export function validateSections(raw: unknown, images: SiteImage[], products: SiteProduct[]): SiteSection[] {
  if (!Array.isArray(raw)) return [];
  const imageIds = new Set(images.map((i) => i.id));
  const productIds = new Set(products.map((p) => p.id));
  const img = (v: unknown) => (typeof v === "string" && imageIds.has(v) ? v : undefined);
  const out: SiteSection[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 12)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const hidden = o.hidden === true ? true : undefined;
    switch (o.type) {
      case "hero": {
        const headline = s(o.headline, 90);
        if (!headline || seen.has("hero")) break;
        const variant = o.variant === "full" || o.variant === "type" ? o.variant : "split";
        out.push({ type: "hero", variant, eyebrow: opt(o.eyebrow, 50), headline, sub: opt(o.sub, 240), cta: opt(o.cta, 32), secondaryCta: opt(o.secondaryCta, 32), imageId: img(o.imageId), hidden });
        break;
      }
      case "highlights": {
        const items = Array.isArray(o.items) ? o.items.slice(0, 4).map((i) => ({ title: s((i as Record<string, unknown>)?.title, 60), body: opt((i as Record<string, unknown>)?.body, 180) })).filter((i) => i.title) : [];
        if (items.length) out.push({ type: "highlights", title: opt(o.title, 80), items, hidden });
        break;
      }
      case "products": {
        if (!products.length) break;
        const ids = Array.isArray(o.productIds) ? o.productIds.filter((x): x is string => typeof x === "string" && productIds.has(x)).slice(0, 12) : undefined;
        out.push({ type: "products", title: opt(o.title, 80), sub: opt(o.sub, 180), productIds: ids?.length ? ids : undefined, hidden });
        break;
      }
      case "gallery": {
        const ids = Array.isArray(o.imageIds) ? [...new Set(o.imageIds.map(img).filter((x): x is string => !!x))].slice(0, 9) : [];
        if (ids.length >= 2) out.push({ type: "gallery", title: opt(o.title, 80), imageIds: ids, hidden });
        break;
      }
      case "about": {
        const title = s(o.title, 80), body = s(o.body, 900);
        if (title && body) out.push({ type: "about", title, body, imageId: img(o.imageId), hidden });
        break;
      }
      case "faq": {
        const items = Array.isArray(o.items) ? o.items.slice(0, 6).map((i) => ({ q: s((i as Record<string, unknown>)?.q, 120), a: s((i as Record<string, unknown>)?.a, 400) })).filter((i) => i.q && i.a) : [];
        if (items.length) out.push({ type: "faq", title: opt(o.title, 80), items, hidden });
        break;
      }
      case "contact": {
        if (seen.has("contact")) break;
        out.push({ type: "contact", title: s(o.title, 80) || "Get in touch", sub: opt(o.sub, 200), hidden });
        break;
      }
    }
    if (typeof o.type === "string") seen.add(o.type);
  }
  return out;
}

export function validateTheme(raw: unknown, fallback: SiteTheme): SiteTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    style: (["editorial", "bold", "soft", "minimal"] as const).find((x) => x === t.style) ?? fallback.style,
    mode: t.mode === "dark" || t.mode === "light" ? t.mode : fallback.mode,
    primary: color(t.primary, fallback.primary), secondary: color(t.secondary, fallback.secondary),
    accent: color(t.accent, fallback.accent), background: color(t.background, fallback.background),
    headingFont: font(t.headingFont, fallback.headingFont), bodyFont: font(t.bodyFont, fallback.bodyFont),
  };
}

/** Validate a whole stored/edited spec (the browser sends edits back). Images/products/contact come from the server copy. */
export function validateSpec(raw: unknown, base: Pick<SiteSpec, "images" | "products" | "contact" | "brand" | "theme">): SiteSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seo = (r.seo && typeof r.seo === "object" ? r.seo : {}) as Record<string, unknown>;
  const sections = validateSections(r.sections, base.images, base.products);
  return {
    version: 1,
    brand: base.brand,
    theme: validateTheme(r.theme, base.theme),
    seo: { title: s(seo.title, 70) || base.brand.name, description: s(seo.description, 170) || base.brand.tagline || "" },
    sections: sections.length ? sections : [{ type: "hero", variant: "type", headline: base.brand.name }],
    images: base.images,
    products: base.products,
    contact: base.contact,
  };
}

/**
 * The model ranks the brand's images; the server places them, because left alone it tended to skip
 * images entirely (live 2026-10-11, 3/3 builds). Best image → hero (text + photo), next → about,
 * the next six → a gallery before contact. Anything the model already placed is kept.
 */
export function placeImages(sections: SiteSection[], ranking: unknown, known: string[]): SiteSection[] {
  const ok = new Set(known);
  const ranked = Array.isArray(ranking) ? [...new Set(ranking.filter((x): x is string => typeof x === "string" && ok.has(x)))] : [];
  if (!ranked.length) return sections;
  const used = new Set<string>();
  for (const s of sections) {
    if ((s.type === "hero" || s.type === "about") && s.imageId) used.add(s.imageId);
    if (s.type === "gallery") s.imageIds.forEach((i) => used.add(i));
  }
  const next = () => { const id = ranked.find((x) => !used.has(x)); if (id) used.add(id); return id; };
  let out = sections.map((s) => {
    if (s.type === "hero" && !s.imageId) { const id = next(); return id ? { ...s, imageId: id, variant: s.variant === "type" ? ("split" as const) : s.variant } : s; }
    if (s.type === "about" && !s.imageId) { const id = next(); return id ? { ...s, imageId: id } : s; }
    return s;
  });
  if (!out.some((s) => s.type === "gallery")) {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) { const id = next(); if (id) ids.push(id); }
    if (ids.length >= 4) {
      const at = out.findIndex((s) => s.type === "contact");
      const gallery: SiteSection = { type: "gallery", title: "A look at what we make", imageIds: ids };
      out = at >= 0 ? [...out.slice(0, at), gallery, ...out.slice(at)] : [...out, gallery];
    }
  }
  return out;
}

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "my-brand";
}

/** wa.me link with the message ready, e.g. "Hi Mavuno, I'd like the Family platter". */
export function whatsappLink(number: string | undefined, text: string) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
