/**
 * "A site I like" (Kezie's idea, 2026-10-11): read a page the owner admires and keep only its
 * shape and feel (section order, how much text, light or dark, colour mood, fonts). Pure, regex
 * over HTML. Its words, images and brand are never passed on as content: the model is told to
 * borrow structure only, and the page's copy still comes from the Brand Brain.
 */
export type Inspiration = {
  url: string;
  title?: string;
  /** Headings in page order, e.g. "h2 Our menu". Labels only (short), to read the structure. */
  outline: string[];
  nav: string[];
  colors: string[];
  fonts: string[];
  dark: boolean | null;
  words: number;
  images: number;
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const expand = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();

export function extractInspiration(html: string, url: string): Inspiration {
  const body = html.replace(/<(script|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
  const outline: string[] = [];
  for (const m of body.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = strip(m[2]).slice(0, 60);
    if (text) outline.push(`h${m[1]} ${text}`);
    if (outline.length >= 24) break;
  }
  const navHtml = body.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? "";
  const nav = [...new Set([...navHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => strip(m[1]).slice(0, 24)).filter(Boolean))].slice(0, 10);

  // Colour mood: theme-color plus the most used hex colours in styles.
  const counts = new Map<string, number>();
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") + " " + [...html.matchAll(/style=["']([^"']*)["']/gi)].map((m) => m[1]).join(" ");
  for (const m of styles.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { const c = expand(`#${m[1]}`); counts.set(c, (counts.get(c) ?? 0) + 1); }
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-f]{3,6})["']/i)?.[1];
  const colors = [...new Set([...(theme ? [expand(theme)] : []), ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)])].slice(0, 6);

  // Background: the body/html background if it is set, else the theme colour.
  const bg = styles.match(/(?:body|html)\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/i)?.[1];
  const ref = bg ? expand(bg) : theme ? expand(theme) : null;
  const fonts = [...new Set([
    ...[...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi)].flatMap((m) => decodeURIComponent(m[1]).split("|").map((f) => f.split(":")[0].replace(/\+/g, " "))),
    ...[...styles.matchAll(/font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 ]{1,30})/gi)].map((m) => m[1].trim()),
  ].filter((f) => !/^(inherit|initial|sans-serif|serif|system-ui|monospace|-apple-system|var)$/i.test(f)))].slice(0, 4);

  const text = strip(body.replace(/<style[\s\S]*?<\/style>/gi, " "));
  return {
    url,
    title: strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 80) || undefined,
    outline, nav, colors, fonts,
    dark: ref ? lum(ref) < 0.35 : null,
    words: text ? text.split(" ").length : 0,
    images: (body.match(/<img\b/gi) ?? []).length,
  };
}

/** The lines the model gets. It never sees the page's body copy, only its shape. */
export function inspirationBrief(i: Inspiration): string {
  const density = i.words > 1800 ? "a lot of text" : i.words > 600 ? "a medium amount of text" : "very little text, image-led";
  return [
    `The owner likes this site: ${i.url}${i.title ? ` ("${i.title}")` : ""}. Borrow its STRUCTURE and FEEL only.`,
    i.outline.length ? `Its sections, in order (headings): ${i.outline.join(" | ")}` : "",
    i.nav.length ? `Its menu: ${i.nav.join(", ")}` : "",
    `It uses ${density} and about ${i.images} images${i.dark === null ? "" : `, on a ${i.dark ? "dark" : "light"} background`}.`,
    i.colors.length ? `Its colours: ${i.colors.join(", ")} (use for mood only; the brand's own colours win).` : "",
    i.fonts.length ? `Its fonts: ${i.fonts.join(", ")}.` : "",
    "Never copy its words, claims, prices, images, logo or name. Every word on our page comes from the brand brief.",
  ].filter(Boolean).join("\n");
}
