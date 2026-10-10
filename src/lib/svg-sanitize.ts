/**
 * Strict allow-list sanitiser for SVG coming from the AI (vectors, logos) or from image tracing,
 * before it is parsed into editor layers. Only drawing elements and presentation attributes survive:
 * no scripts, no event handlers, no external references, no foreignObject, no CSS url().
 * Pure string-in/string-out over a DOM parser, so it runs in the browser and in tests.
 */

const TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan",
  "defs", "lineargradient", "radialgradient", "stop", "clippath",
]);
const ATTRS = new Set([
  "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "opacity", "transform", "font-family", "font-size", "font-weight",
  "font-style", "text-anchor", "letter-spacing", "dominant-baseline", "id", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "clip-path", "clip-rule", "xmlns",
]);
// Paint may reference an in-document gradient (#id) but nothing else.
const URL_REF = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

type Parser = { parseFromString(s: string, type: "image/svg+xml"): Document };

export function sanitizeSvg(input: string, parser?: Parser, maxElements = 4000): string | null {
  const p = parser ?? (typeof DOMParser !== "undefined" ? new DOMParser() : null);
  if (!p || typeof input !== "string" || input.length > 400_000) return null;
  const start = input.indexOf("<svg");
  if (start < 0) return null;
  const doc = p.parseFromString(input.slice(start), "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;

  let count = 0;
  const clean = (el: Element): boolean => {
    if (++count > maxElements) return false;
    const tag = el.nodeName.toLowerCase();
    if (!TAGS.has(tag)) { el.remove(); return true; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (!ATTRS.has(name) || /javascript:|data:|expression\(/i.test(value)) { el.removeAttribute(attr.name); continue; }
      // Only same-document gradient/clip references are allowed inside url().
      const refs = Array.from(value.matchAll(URL_REF)).map((m) => m[1]);
      if (refs.some((ref) => !/^#[\w-]+$/.test(ref))) el.removeAttribute(attr.name);
    }
    for (const child of Array.from(el.children)) if (!clean(child)) return false;
    // Text nodes are kept only inside text/tspan.
    if (tag !== "text" && tag !== "tspan") for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent?.trim()) n.remove();
    return true;
  };
  if (!clean(root)) return null;
  let out = root.outerHTML ?? new XMLSerializer().serializeToString(root);
  // xmlns can't be set as a plain attribute on an XML document; add it to the markup instead.
  if (!/^<svg[^>]*\sxmlns=/i.test(out)) out = out.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return /<(path|rect|circle|ellipse|line|polyline|polygon|text)\b/i.test(out) ? out : null;
}
