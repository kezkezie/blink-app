/**
 * Website studio (Kezie, 2026-10-16: "put HTML-like code on the side, like Google has done it, but
 * simple HTML and maybe JavaScript... an inbuilt IDE to an extent... download that code... see
 * different websites with variations, like images in the Library"; motionsites.ai as the feel).
 * Claude writes one complete HTML file per look from the Brand Brain; the owner reads and edits the
 * code, asks for changes, downloads it or publishes it at blinkspot.io/w/<slug>. Pages always run
 * sandboxed (an opaque origin, no forms, no network calls), in the preview and when published.
 * Pure parts here; the calls are in the /api/sites/code routes.
 */
import type { SiteContact, SiteImage, SiteProduct, SiteTheme } from "./spec";
import { whatsappLink } from "./spec";

export const SITE_PAGE_CREDITS = 30;
export const SITE_CHANGE_CREDITS = 12;
export const MAX_LOOKS = 3;
export const MAX_HTML = 400_000;

export type SiteLook = "cinematic" | "editorial" | "bold" | "minimal" | "warm";
export const SITE_LOOKS: Array<{ id: SiteLook; label: string; line: string; direction: string }> = [
  { id: "cinematic", label: "Cinematic", line: "Dark, full-bleed, scroll motion",
    direction: "Cinematic: a dark page; a full-bleed hero (the best photo, or giant type over a deep gradient) that scales or fades as you scroll; sections that reveal as they enter (GSAP ScrollTrigger: fade and rise, image scale-in, words arriving line by line); one pinned moment where a photo or a line of type is held while the page scrolls past; film-like pacing with lots of room." },
  { id: "editorial", label: "Editorial", line: "Light, big serif type, magazine",
    direction: "Editorial: a light page laid out like a magazine; large serif display type (use the brand heading font if it is a serif, else Fraunces or Playfair Display for headings only); an asymmetric 12-column grid, thin rules, small caps labels, numbered sections; photos in tall crops; quiet motion (soft fades, a slow image parallax)." },
  { id: "bold", label: "Bold", line: "Colour blocks, huge type, playful",
    direction: "Bold: full-width colour blocks in the brand colours; oversized tight sans-serif headlines that run edge to edge; a scrolling marquee strip of short phrases; stickers and rotated labels; snappy hover states and quick, springy scroll reveals." },
  { id: "minimal", label: "Minimal", line: "Calm, lots of space, product first",
    direction: "Minimal: calm and product-first; a lot of white (or very light) space; one accent colour used sparingly; a simple centred hero; small, precise type; smooth micro-interactions only (hover lifts, a gentle fade-in)." },
  { id: "warm", label: "Warm", line: "Soft, rounded, friendly",
    direction: "Warm: soft background tints from the brand colours, rounded cards and pill buttons, friendly rounded type, photos in rounded frames with a slight tilt, hand-drawn style inline SVG accents, gentle bouncy motion." },
];
export const lookOf = (v: unknown): SiteLook | null => (SITE_LOOKS.some((l) => l.id === v) ? (v as SiteLook) : null);

/** Scripts a page may load (pinned versions, our CSP allows only these hosts). */
export const GSAP = ["https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js", "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ScrollTrigger.min.js"];

export const CODE_SYSTEM = `You are a senior web designer and front-end developer. You write ONE complete, production-quality landing page for a real small brand, as a single HTML file.
Output only the file: start with <!doctype html> and end with </html>. No markdown fences, no notes before or after.

Tech:
- One file: semantic HTML, one <style> block, at most one inline <script> at the end of <body>. No frameworks, no Tailwind, no build step.
- Fonts: a Google Fonts <link> for the brand's fonts.
- Motion (optional): GSAP 3.13.0 with ScrollTrigger, loaded exactly from ${GSAP[0]} and ${GSAP[1]}. No other external scripts. CSS transitions and keyframes are fine.
- Pictures: write {{img:N}} for the brand's picture number N (as the src, or inside url() in CSS) and {{logo}} for the logo, never a URL you make up, a placeholder service or a stock photo. Use only the numbers given. With few or no pictures, design with type, colour, gradients, CSS shapes and inline SVG.
- Links and buttons go to the brand's real links given (WhatsApp, phone, email, socials, website) or to #sections on the page. No forms, no fetch or XHR, no localStorage, no iframes, no analytics.

Craft:
- Complete at rest: every word and picture is in the markup and visible without JavaScript. Motion only animates FROM that state (gsap.from inside ScrollTrigger), and does nothing when prefers-reduced-motion is set. Call ScrollTrigger.refresh() after document.fonts.ready.
- Responsive and designed at 390px and at 1440px: fluid type with clamp(), no horizontal scroll (overflow-x: clip on the page), tap targets at least 44px, a simple header (logo or name, 3 to 5 anchor links, one button) that collapses on phones.
- A clear hierarchy: the hero says what the brand gives in at most 8 words, with one main button. Then the sections that sell THIS kind of business, in the best order, ending with a contact or visit section and a small footer.
- The brand's colours exactly as given, used with intent; body text at least 4.5:1 contrast on its background. The brand's fonts (headings and body).
- Copy in the brand's voice, short and specific. Use ONLY the facts given: the brief, the brand facts, the products, the links, and words printed on the brand's own pictures. Never invent prices, dates or launch days, phone numbers, addresses, opening hours, stock levels, reviews, testimonials, statistics, awards or client names; leave a thing out when it isn't given.
- <title>, meta description, meta viewport, theme-color, Open Graph tags (og:image is the hero picture), alt text on every picture.
- Tidy, readable code with CSS custom properties for the colours and fonts. Keep it under about 900 lines.`;

export const CHANGE_SYSTEM = `You are the front-end developer of this one-file landing page. Make the owner's change and nothing else; keep everything that works.
Reply with edit blocks only, as many as needed, each exactly:
<<<<<<< FIND
(lines copied exactly from the current file, enough to be unique)
=======
(the new lines)
>>>>>>> REPLACE
If the change touches most of the page, reply instead with the whole new file, from <!doctype html> to </html>.
The same rules still hold: {{img:N}} for the brand's picture N and {{logo}} for the logo (or keep the picture URLs already in the file), only facts given, no forms, no fetch, no other external scripts than GSAP 3.13.0 from cdnjs, complete without JavaScript.`;

export type BrandForCode = {
  name: string; tagline?: string; brief: string; industry?: string;
  theme: SiteTheme; contact: SiteContact; products: SiteProduct[]; images: SiteImage[]; logoUrl: string | null;
};

/** Pictures for the page, numbered from 1, sized for the web where the host can do it. */
export function webImage(url: string, width = 1600) {
  return url.includes("res.cloudinary.com") && url.includes("/upload/") && !/\/upload\/[a-z]_/.test(url) ? url.replace("/upload/", `/upload/w_${width},c_limit,f_auto,q_auto/`) : url;
}

export function brandLinks(b: BrandForCode) {
  const c = b.contact;
  const wa = whatsappLink(c.whatsapp, `Hi ${b.name}, I found you on your website`);
  return [
    wa ? `WhatsApp: ${wa}` : "",
    c.phone ? `Phone: tel:${c.phone.replace(/[^\d+]/g, "")} (${c.phone})` : "",
    c.email ? `Email: mailto:${c.email}` : "",
    c.website ? `Website: ${c.website}` : "",
    ...(c.socials ?? []).map((s) => `Social: ${s}`),
    c.location ? `Location: ${c.location}` : "",
    c.cta ? `Main call to action: ${c.cta}` : "",
  ].filter(Boolean);
}

export function codeUserPrompt(i: { brand: BrandForCode; look: SiteLook; brief?: string; patterns?: string | null; captions?: string[] }) {
  const b = i.brand, t = b.theme;
  const look = SITE_LOOKS.find((l) => l.id === i.look)!;
  const links = brandLinks(b);
  return [
    `Brand: ${b.name}${b.industry ? ` (${b.industry})` : ""}${b.tagline ? `. Tagline: ${b.tagline}` : ""}`,
    `What we know about the brand:\n${b.brief}`,
    b.products.length ? `Products (${b.products.length}):\n${b.products.map((p) => `- ${p.name}${p.price ? `, ${p.currency || "KES"} ${p.price}` : ""}${p.description ? `: ${p.description.replace(/\s+/g, " ").slice(0, 200)}` : ""}`).join("\n")}` : "Products: none listed.",
    b.images.length ? `The brand's pictures (you see them above, in this order):\n${b.images.map((im, n) => `${n + 1}. ${im.caption ?? "a brand picture"}`).join("\n")}` : "The brand's pictures: none yet.",
    b.logoUrl ? "Logo: {{logo}}" : "Logo: none (set the name in the heading font).",
    `Colours: primary ${t.primary}, secondary ${t.secondary}, accent ${t.accent}, background ${t.background}. Fonts: headings ${t.headingFont}, body ${t.bodyFont}.`,
    links.length ? `Real links:\n${links.join("\n")}` : "Real links: none on file, so the buttons go to #sections.",
    i.captions?.length ? `Past post captions (for the voice):\n${i.captions.slice(0, 8).map((c) => `- ${c}`).join("\n")}` : "",
    i.patterns ? `What strong websites in this category do (patterns only, never copy them):\n${i.patterns}` : "",
    `Look: ${look.direction}`,
    i.brief ? `The owner's brief: ${i.brief}` : "",
    "Write the page.",
  ].filter(Boolean).join("\n\n");
}

export function changeUserPrompt(i: { html: string; instruction: string; images: SiteImage[] }) {
  return [
    i.images.length ? `The brand's pictures you can add with {{img:N}}:\n${i.images.map((im, n) => `${n + 1}. ${im.caption ?? "a brand picture"}`).join("\n")}` : "",
    `The current file:\n${i.html}`,
    `The owner's change: ${i.instruction}`,
  ].filter(Boolean).join("\n\n");
}

/** The HTML document in a reply: fences and chatter around it dropped. */
export function extractHtml(text: string): string | null {
  const start = text.search(/<!doctype html|<html[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) return null;
  return text.slice(start, end + 7).trim();
}

/** {{img:N}} and {{logo}} to the real URLs. Unknown numbers fall back to the first picture, or nothing. */
export function fillImages(html: string, images: SiteImage[], logoUrl: string | null) {
  return html
    .replace(/\{\{\s*img\s*:\s*(\d{1,3})\s*\}\}/g, (_, n) => { const im = images[Number(n) - 1] ?? images[0]; return im ? webImage(im.url) : ""; })
    .replace(/\{\{\s*logo\s*\}\}/g, logoUrl ? webImage(logoUrl, 600) : "");
}

/** Checked before it is saved: a whole document, within size, with a viewport. */
export function checkHtml(html: string): { ok: true; html: string } | { ok: false; error: string } {
  const doc = html.trim();
  if (!/^<!doctype html/i.test(doc) && !/^<html[\s>]/i.test(doc)) return { ok: false, error: "That isn't a whole HTML page (it should start with <!doctype html>)." };
  if (!/<\/html>\s*$/i.test(doc)) return { ok: false, error: "The page is cut off (it should end with </html>)." };
  if (doc.length > MAX_HTML) return { ok: false, error: `The page is too big (${Math.round(doc.length / 1000)} KB, the limit is ${MAX_HTML / 1000} KB).` };
  const withViewport = /<meta[^>]+name=["']viewport["']/i.test(doc) ? doc : doc.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n<meta name="viewport" content="width=device-width, initial-scale=1">`);
  return { ok: true, html: withViewport };
}

export const pageTitle = (html: string) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Edit blocks from a change reply, applied in order. Each FIND must match the file once (exactly,
 * or line by line ignoring indentation). Returns the new file, or which blocks didn't match.
 */
export function applyEdits(html: string, reply: string): { ok: true; html: string; edits: number } | { ok: false; failed: number; edits: number } {
  const blocks = [...reply.matchAll(/<{5,9} ?FIND\r?\n([\s\S]*?)\r?\n={5,9}\r?\n([\s\S]*?)\r?\n?>{5,9} ?REPLACE/g)].map((m) => ({ find: m[1], replace: m[2] }));
  if (!blocks.length) return { ok: false, failed: 0, edits: 0 };
  let out = html, failed = 0;
  for (const b of blocks) {
    const at = out.indexOf(b.find);
    if (at >= 0 && out.indexOf(b.find, at + 1) < 0) { out = out.slice(0, at) + b.replace + out.slice(at + b.find.length); continue; }
    const loose = new RegExp(b.find.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `[ \\t]*${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*`).join("\\r?\\n"));
    const m = b.find.trim() ? loose.exec(out) : null;
    if (m && !new RegExp(loose.source).exec(out.slice(m.index + m[0].length))) { out = out.slice(0, m.index) + b.replace + out.slice(m.index + m[0].length); continue; }
    failed++;
  }
  return failed ? { ok: false, failed, edits: blocks.length } : { ok: true, html: out, edits: blocks.length };
}

/**
 * What a page may do, in the preview and when published: run its own inline script and GSAP from
 * cdnjs, load Google Fonts and https pictures; never call out (connect-src), post a form or change
 * the base. Published pages add the sandbox, so they run as an opaque origin with no access to
 * blinkspot.io's cookies or storage.
 */
export const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https: data:",
  "img-src https: data: blob:",
  "media-src https: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");
export const PUBLISHED_CSP = `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; ${PAGE_CSP}`;

/** The page for the in-app preview: the same CSP as a meta tag (the iframe adds the sandbox). */
export function previewDoc(html: string) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`;
  if (/<head(\s[^>]*)?>/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${meta}`);
  if (/<html(\s[^>]*)?>/i.test(html)) return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${meta}</head>`);
  return `${meta}${html}`;
}

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;
export const cleanSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
export const downloadName = (name: string) => `${cleanSlug(name) || "website"}.html`;
