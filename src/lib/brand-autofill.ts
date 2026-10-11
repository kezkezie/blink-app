/**
 * Brand auto-fill (2026-10-11): read a brand's website (and Instagram) so new users don't face a
 * blank questionnaire. Pure extraction here (regex over HTML, no DOM); the route asks the model to
 * turn it into Brand DNA and keeps only contacts that really appear on the page.
 */

export type SiteFacts = {
  url: string;
  title?: string;
  description?: string;
  ogImage?: string;
  themeColor?: string;
  jsonld: { name?: string; telephone?: string; email?: string; address?: string; sameAs: string[]; logo?: string };
  text: string;
  socials: string[];
  phones: string[];
  emails: string[];
  whatsapp: string[];
  logoCandidates: string[];
  moreLinks: string[];
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const meta = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() || undefined : undefined;
};
const abs = (href: string, base: string) => { try { return new URL(href, base).toString(); } catch { return null; } };

export function extractSite(html: string, baseUrl: string): SiteFacts {
  const head = html.slice(0, 200_000);
  const facts: SiteFacts = {
    url: baseUrl,
    title: decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 160) || undefined,
    description: (meta(head, "description") ?? meta(head, "og:description"))?.slice(0, 400),
    ogImage: meta(head, "og:image"),
    themeColor: (() => { const c = meta(head, "theme-color"); return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : undefined; })(),
    jsonld: { sameAs: [] },
    text: "",
    socials: [], phones: [], emails: [], whatsapp: [], logoCandidates: [], moreLinks: [],
  };
  // Structured data (Organization / LocalBusiness) is the most reliable source of name, phone, address.
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = (Array.isArray(data) ? data : data["@graph"] ?? [data]) as Array<Record<string, unknown>>;
      for (const it of items) {
        const t = String(it["@type"] ?? "");
        if (!/Organization|LocalBusiness|Restaurant|Store|Brand|Corporation|ProfessionalService|FoodEstablishment/i.test(t)) continue;
        facts.jsonld.name ??= typeof it.name === "string" ? it.name : undefined;
        facts.jsonld.telephone ??= typeof it.telephone === "string" ? it.telephone : undefined;
        facts.jsonld.email ??= typeof it.email === "string" ? it.email.replace(/^mailto:/, "") : undefined;
        const a = it.address as Record<string, unknown> | string | undefined;
        facts.jsonld.address ??= typeof a === "string" ? a : a ? [a.streetAddress, a.addressLocality, a.addressCountry].filter((x) => typeof x === "string").join(", ") || undefined : undefined;
        const logo = it.logo as string | { url?: string } | undefined;
        facts.jsonld.logo ??= typeof logo === "string" ? logo : logo?.url;
        if (Array.isArray(it.sameAs)) facts.jsonld.sameAs.push(...it.sameAs.filter((x): x is string => typeof x === "string"));
      }
    } catch { /* malformed JSON-LD is common */ }
  }
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = decode(m[1]);
    if (/^mailto:/i.test(href)) facts.emails.push(href.replace(/^mailto:/i, "").split("?")[0]);
    else if (/^tel:/i.test(href)) facts.phones.push(href.replace(/^tel:/i, ""));
    else if (/wa\.me\/|api\.whatsapp\.com\/send/i.test(href)) { const n = href.match(/wa\.me\/(\+?\d{8,15})|phone=(\+?\d{8,15})/i); if (n) facts.whatsapp.push(n[1] || n[2]); }
    else if (/(instagram|tiktok|facebook|x|twitter|linkedin|youtube)\.com\//i.test(href)) facts.socials.push(href);
    else if (/\/(about|our-story|menu|products|services|shop)\b/i.test(href)) { const u = abs(href, baseUrl); if (u && new URL(u).host === new URL(baseUrl).host) facts.moreLinks.push(u); }
  }
  // Logo candidates, best first: JSON-LD logo, an <img> that says "logo", the touch icon.
  if (facts.jsonld.logo) facts.logoCandidates.push(facts.jsonld.logo);
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    if (!/logo/i.test(m[0])) continue;
    const src = m[0].match(/\s(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    if (src && !/\.svg(\?|$)/i.test(src)) facts.logoCandidates.push(src);
  }
  const touch = head.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (touch) facts.logoCandidates.push(touch);
  facts.logoCandidates = [...new Set(facts.logoCandidates.map((u) => abs(decode(u), baseUrl)).filter((u): u is string => !!u && /^https:\/\//.test(u)))].slice(0, 4);
  // Visible text, roughly: drop scripts/styles/svg, then tags.
  facts.text = decode(html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 7000);
  // Phone numbers written in the text (East African and international formats).
  for (const m of facts.text.matchAll(/(?:\+?\d{1,3}[\s-]?)?(?:\(?0?\d{2,3}\)?[\s-]?)\d{3}[\s-]?\d{3,4}/g)) if (m[0].replace(/\D/g, "").length >= 9) facts.phones.push(m[0].trim());
  for (const m of facts.text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) facts.emails.push(m[0]);
  for (const k of ["socials", "phones", "emails", "whatsapp", "moreLinks"] as const) facts[k] = [...new Set(facts[k])].slice(0, 8);
  if (facts.jsonld.sameAs.length) facts.socials = [...new Set([...facts.socials, ...facts.jsonld.sameAs])].slice(0, 8);
  return facts;
}

/** A contact the model returns is kept only if its digits (or the address) appear in what we read. */
export function verifiedContact(value: unknown, seen: string[], kind: "phone" | "email"): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (kind === "email") return seen.some((e) => e.toLowerCase() === value.trim().toLowerCase()) ? value.trim() : undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return seen.some((s) => { const d = s.replace(/\D/g, ""); return d.length >= 8 && (d.endsWith(digits.slice(-9)) || digits.endsWith(d.slice(-9))); }) ? value.trim() : undefined;
}

export function normaliseWebsite(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); if (!u.hostname.includes(".")) return null; u.hash = ""; return u.toString(); } catch { return null; }
}

export function instagramHandle(input: string): string | null {
  const t = input.trim().replace(/^@/, "");
  const m = t.match(/instagram\.com\/([A-Za-z0-9_.]{1,30})/i);
  const h = m ? m[1] : t;
  return /^[A-Za-z0-9_.]{1,30}$/.test(h) ? h : null;
}
