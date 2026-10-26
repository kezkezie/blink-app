/**
 * Google Fonts through blinkspot.io (2026-10-26, cookie consent / GDPR): loading fonts straight from
 * Google sends every visitor's IP address to Google before any consent (a German court fined a site
 * for it, LG München 3 O 17493/20). Our route fetches the stylesheet on the server and points its font
 * files at /gstatic/, which next.config.ts proxies on the server, so the browser never calls Google.
 */
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://www.blinkspot.io";

/** The app's own fonts (globals.css uses them): Inter, DM Sans, JetBrains Mono. */
export const APP_FONTS = "family=Inter:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

/** The stylesheet for a Google Fonts css2 query ("family=Inter:wght@400;700&display=swap"). */
export const fontsCss = (query: string) => `/api/gfonts/css2?${query}`;

/** The same, absolute, for published pages (they run on their own sandboxed origin). */
export const fontsCssAbsolute = (query: string) => `${APP_ORIGIN}${fontsCss(query)}`;

/** The Google stylesheet kinds our route serves: css2, the older css, and icon (Material Icons). */
export const FONT_KINDS = ["css2", "css", "icon"] as const;

/**
 * Claude-written pages link Google Fonts directly: point those links at our route and any font file
 * at /gstatic/, and drop preconnect hints to Google (a preconnect alone opens a connection, so it
 * sends the IP address too).
 */
export const throughOurFonts = (html: string) => html
  .replace(/<link\b[^>]*\brel\s*=\s*["']?(?:preconnect|dns-prefetch)["']?[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, "")
  .replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*\brel\s*=\s*["']?(?:preconnect|dns-prefetch)["']?[^>]*>/gi, "")
  .replace(/(?:https?:)?\/\/fonts\.googleapis\.com\/(css2|css|icon)\?/g, `${APP_ORIGIN}/api/gfonts/$1?`)
  .replace(/(?:https?:)?\/\/fonts\.gstatic\.com\//g, `${APP_ORIGIN}/gstatic/`);
