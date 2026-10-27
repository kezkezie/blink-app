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
import { APP_ORIGIN, throughOurFonts } from "@/lib/google-fonts";
import { MAX_DESIGNS } from "./site-refs";

export const SITE_PAGE_CREDITS = 30;
export const SITE_CHANGE_CREDITS = 6;
export const MAX_LOOKS = 3;
export const MAX_HTML = 400_000;

export type SiteLook = "match" | "cinematic" | "editorial" | "bold" | "minimal" | "warm";
export const SITE_LOOKS: Array<{ id: SiteLook; label: string; line: string; direction: string }> = [
  // Kezie, 2026-10-27: "see if it can make the exact website but with the brand colors and content".
  // No style of its own: the designs and websites the owner likes decide everything.
  { id: "match", label: "Like my picks", line: "Rebuilds the designs and sites you like",
    direction: "Like my picks: no look of its own. Rebuild the designs the owner likes as exactly as you can; where they don't decide something, keep it clean and modern." },
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
/** "Like my picks" needs something to follow: a design or a website the owner likes. */
export const MATCH_NEEDS_PICKS = "Like my picks rebuilds the designs or websites you like: add one first.";

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
- A clear hierarchy: the hero says what the brand gives in at most 8 words, with one main button. Then the sections that sell THIS kind of business, in the best order, ending with a contact or visit section and a small footer. When the owner gives designs to follow, their sections, order and composition come first.
- The brand's colours exactly as given, used with intent; body text at least 4.5:1 contrast on its background. The brand's fonts (headings and body).
- Copy in the brand's voice, short and specific. Use ONLY the facts given: the brief, the brand facts, the products, the links, and words printed on the brand's own pictures. Never invent prices, dates or launch days, phone numbers, addresses, opening hours, stock levels, reviews, testimonials, statistics, awards or client names; leave a thing out when it isn't given.
- <title>, meta description, meta viewport, theme-color, Open Graph tags (og:image is the hero picture), alt text on every picture.
- Editable without code: every top-level part of the page (header, hero, each section, footer) is one element with a short data-section name (data-section="hero", "menu", "story", "contact", "footer"). Pictures are <img> elements (object-fit for crops), not CSS background images, so the owner can swap them. Words sit in real text elements (h1-h3, p, li, a, button).
- Tidy, readable code. Colours and fonts as CSS custom properties in one :root block: --color-<name> with hex values (e.g. --color-bg, --color-text, --color-primary, --color-accent) and --font-heading / --font-body. Keep it under about 900 lines.`;

export const CHANGE_SYSTEM = `You are the front-end developer of this one-file landing page. Make the owner's change and nothing else; keep everything that works.
Reply with edit blocks only, as many as needed, each exactly:
<<<<<<< FIND
(lines copied exactly from the current file, enough to be unique)
=======
(the new lines)
>>>>>>> REPLACE
If the change touches most of the page, reply instead with the whole new file, from <!doctype html> to </html>.
The same rules still hold: {{img:N}} for the brand's picture N and {{logo}} for the logo (or keep the picture URLs already in the file), only facts given, no forms, no fetch, no other external scripts than GSAP 3.13.0 from cdnjs, complete without JavaScript.
A scroll film (the data-scroll-film section) stays as it is unless the owner asks to change or remove it: keep its data-film-* attributes, its canvas and picture, and the style and script marked data-blink-film. Its words are the data-film-step blocks.`;

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

/** Designs the owner likes (2026-10-23): shown to Claude after the brand's pictures as Design A, B... */
export const MAX_INSPIRATION = 4;
/** The owner's own words for the page (2026-10-27): their story, services, menu, an article. */
export const MAX_OWN_WORDS = 12_000;

/**
 * Kezie, 2026-10-27: "a way on how we can be able to post our written personal written content
 * for the website", with "What the site is for". Their words go on the page as written.
 */
export function ownWordsPrompt(words: string) {
  return `The owner's own words for this page (they wrote them; put them on the page):
"""
${words.slice(0, MAX_OWN_WORDS)}
"""
Use these words as written: keep their wording, names, prices, lists and the order of their ideas. Split them into the page's sections and add a short heading only where they have none; fix only clear typos. Don't summarise them, don't rewrite them in another voice, and don't add facts they don't give. A long piece (a story, an article) gets its own easy-to-read section rather than being cut.`;
}
export const designLetter = (n: number) => String.fromCharCode(65 + n);
export function inspirationPrompt(count: number) {
  const names = count > 1 ? `Designs A to ${designLetter(count - 1)}` : "Design A";
  return `${names}, shown above after the brand's pictures, ${count > 1 ? "are designs" : "is a design"} the owner loves (often screenshots of one website, top to bottom). Rebuild ${count > 1 ? "them" : "it"} for this brand as closely as you can, section by section:
- the same sections in the same order;
- the same hero composition: where the photo sits and how big it is (full-bleed or framed), where the headline, line and buttons sit, and their size and style;
- the same header layout, grids and column counts, card shapes, picture crops and where labels sit on them;
- the same spacing rhythm, type scale and weights, light or dark, and colour blocking.
Make it the brand's own: the brand's colours and fonts (unless the owner's brief says otherwise), the brand's words and the brand's pictures (reuse a picture, or use colour and type, when the design shows more photos than the brand has; leave out a part the brand has nothing for). Never copy their text, logos, brand names, prices or photos, and never put them on the page (they are not {{img:N}} pictures).`;
}

export function codeUserPrompt(i: { brand: BrandForCode; look: SiteLook; brief?: string; patterns?: string | null; captions?: string[]; inspiration?: number; film?: string; words?: string }) {
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
    i.patterns ? `What the websites the owner likes do (follow their patterns, never copy their words, names or pictures):\n${i.patterns}` : "",
    i.inspiration ? `Look (only the mood where the designs below don't decide; the designs win on layout, composition and section order): ${look.direction}` : `Look: ${look.direction}`,
    i.inspiration ? inspirationPrompt(Math.min(MAX_DESIGNS, i.inspiration)) : "",
    i.film ?? "",
    i.words?.trim() ? ownWordsPrompt(i.words.trim()) : "",
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
 * cdnjs, load Google Fonts through blinkspot.io (never from Google itself: throughOurFonts) and https pictures; never call out (connect-src), post a form or change
 * the base. Published pages add the sandbox, so they run as an opaque origin with no access to
 * blinkspot.io's cookies or storage.
 */
export const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com",
  `style-src 'unsafe-inline' ${APP_ORIGIN}`,
  "font-src https: data:",
  "img-src https: data: blob:",
  "media-src https: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");
export const PUBLISHED_CSP = `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; ${PAGE_CSP}`;

/**
 * Links in the in-app preview (Kezie, 2026-10-17: "clicking buttons on the website takes us back to
 * BlinkSpot sign in"). The preview is an about:srcdoc page whose links resolve against the studio's
 * own address, so "#menu" loaded blinkspot.io inside the frame (signed out there, so: sign in).
 * Here: #links scroll on the page, outside links (and WhatsApp, phone, email) open in a new tab,
 * other paths do nothing (it's one page), forms don't post. Storage works in memory (a sandboxed
 * page can't use the real one, and a script that tries would stop).
 */
export const PREVIEW_SCRIPT = `(function(){
try{window.localStorage.getItem("x")}catch(e){var m={},st={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};try{Object.defineProperty(window,"localStorage",{configurable:true,value:st});Object.defineProperty(window,"sessionStorage",{configurable:true,value:st})}catch(_){}}
document.addEventListener("click",function(e){
if(e.defaultPrevented)return;
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
var h=(a.getAttribute("href")||"").trim();
if(h.charAt(0)==="#"){e.preventDefault();var id=decodeURIComponent(h.slice(1));var el=id?(document.getElementById(id)||document.querySelector('[name="'+id.replace(/"/g,"")+'"]')):null;
if(location.hash!==h){try{location.hash=h}catch(_){}}
if(el)el.scrollIntoView({behavior:"smooth",block:"start"});else if(!id)window.scrollTo({top:0,behavior:"smooth"});return}
if(/^(https?:|mailto:|tel:|sms:)/i.test(h)){e.preventDefault();window.open(h,"_blank","noopener");return}
e.preventDefault()},false);
document.addEventListener("submit",function(e){e.preventDefault()},true);
})();`;

/** The page for the in-app preview: the same CSP as a meta tag (the iframe adds the sandbox), and links kept on the page. */
export function previewDoc(page: string) {
  const html = throughOurFonts(page);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}"><script>${PREVIEW_SCRIPT}</script>`;
  if (/<head(\s[^>]*)?>/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${meta}`);
  if (/<html(\s[^>]*)?>/i.test(html)) return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${meta}</head>`);
  return `${meta}${html}`;
}

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/;
export const cleanSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
export const downloadName = (name: string) => `${cleanSlug(name) || "website"}.html`;
