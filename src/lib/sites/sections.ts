import { fontsCssAbsolute } from "@/lib/google-fonts";
/**
 * Sections mode for website studio pages (Kezie, 2026-10-17: "whatever we create in the web studio
 * we should also be able to edit in the section builder... people who don't know HTML do the
 * section building, pros edit the HTML"). One page, two ways to edit it, both on the same HTML:
 *  - Sections: the page's top-level parts (data-section, or header / sections / footer), to move,
 *    hide, duplicate, delete or rewrite with AI; words edited by clicking them on the page;
 *    pictures swapped from the Library; colours and fonts from the page's CSS variables.
 *  - Code: the file itself.
 * While editing, elements carry data-bk-* ids (the preview and this code find the same element);
 * clean() takes them off before saving. Runs in the browser (DOMParser).
 */

const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "A", "BUTTON", "BLOCKQUOTE", "FIGCAPTION", "SMALL", "SPAN", "LABEL", "DT", "DD", "TD", "TH", "STRONG", "EM", "B", "CITE", "Q"]);
const INLINE = new Set(["EM", "STRONG", "B", "I", "U", "BR", "SPAN", "SMALL", "SUP", "SUB", "MARK", "A", "S", "CITE", "Q", "ABBR", "TIME"]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "LINK", "META", "IFRAME"]);
const BK = ["data-bk-s", "data-bk-t", "data-bk-i", "data-bk-l"];

export type PageSection = { id: string; key: string; name: string; hidden: boolean };
export type ThemeVar = { name: string; value: string; kind: "color" | "font" };

/** Editing ids are small numbers; anything else matches nothing. */
const num = (id: string) => (/^\d{1,5}$/.test(id) ? id : "none");
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const serialize = (doc: Document) => `<!doctype html>\n${doc.documentElement.outerHTML}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

/** The page's parts in order: marked ones first; otherwise body's blocks, with <main> opened up. */
function sectionElements(doc: Document): Element[] {
  const marked = [...doc.querySelectorAll("[data-section]")].filter((el) => !el.parentElement?.closest("[data-section]"));
  if (marked.length) return marked;
  const blocks = (parent: Element): Element[] => [...parent.children].filter((el) => !SKIP.has(el.tagName));
  let top = blocks(doc.body);
  if (top.length === 1 && ["DIV", "MAIN"].includes(top[0].tagName)) top = blocks(top[0]);
  return top.flatMap((el) => (el.tagName === "MAIN" ? blocks(el) : [el]));
}

function nameOf(el: Element): string {
  const marked = el.getAttribute("data-section");
  if (marked) return marked.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  if (el.tagName === "HEADER" || el.tagName === "NAV") return "Header";
  if (el.tagName === "FOOTER") return "Footer";
  const label = el.getAttribute("aria-label") || el.id;
  if (label) return label.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()).slice(0, 40);
  const heading = el.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
  return heading ? heading.split(" ").slice(0, 5).join(" ") : "Section";
}

/** A text block: words you can click and type, with only inline formatting inside. */
const isTextBlock = (el: Element) =>
  TEXT_TAGS.has(el.tagName) && !!el.textContent?.trim() && [...el.querySelectorAll("*")].every((c) => INLINE.has(c.tagName)) && !el.parentElement?.closest("[data-bk-t]");

/** Ids on everything editable (sections, words, pictures, links), and data-section names on the parts. */
export function prepare(html: string): string {
  const doc = parse(html);
  doc.querySelectorAll(BK.map((a) => `[${a}]`).join(",")).forEach((el) => BK.forEach((a) => el.removeAttribute(a)));
  const used = new Set<string>();
  sectionElements(doc).forEach((el, i) => {
    el.setAttribute("data-bk-s", String(i));
    if (!el.getAttribute("data-section")) {
      let key = slug(el.tagName === "HEADER" ? "header" : el.tagName === "FOOTER" ? "footer" : el.id || nameOf(el)) || `section-${i + 1}`;
      while (used.has(key)) key = `${key}-${i + 1}`;
      el.setAttribute("data-section", key);
    }
    used.add(el.getAttribute("data-section")!);
  });
  let t = 0, im = 0, l = 0;
  const walk = (el: Element) => {
    if (SKIP.has(el.tagName)) return;
    if (el.tagName === "IMG") { el.setAttribute("data-bk-i", String(im++)); return; }
    if (isTextBlock(el)) {
      el.setAttribute("data-bk-t", String(t++));
      const link = el.tagName === "A" ? el : el.closest("a");
      if (link && !link.hasAttribute("data-bk-l")) link.setAttribute("data-bk-l", String(l++));
      el.querySelectorAll("a").forEach((a) => { if (!a.hasAttribute("data-bk-l")) a.setAttribute("data-bk-l", String(l++)); });
      return;
    }
    [...el.children].forEach(walk);
  };
  walk(doc.body);
  return serialize(doc);
}

/** The page as saved: editing ids and helpers off, data-section names kept. */
export function clean(work: string): string {
  const doc = parse(work);
  doc.querySelectorAll(BK.map((a) => `[${a}]`).join(",")).forEach((el) => BK.forEach((a) => el.removeAttribute(a)));
  doc.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  doc.querySelectorAll(".bk-sel").forEach((el) => { el.classList.remove("bk-sel"); if (!el.getAttribute("class")) el.removeAttribute("class"); });
  doc.querySelectorAll("[data-blink-editor]").forEach((el) => el.remove());
  if (doc.querySelector("[data-hidden]") && !doc.querySelector("style[data-blink-hidden]")) {
    const st = doc.createElement("style");
    st.setAttribute("data-blink-hidden", "");
    st.textContent = "[data-hidden]{display:none!important}";
    doc.head.appendChild(st);
  }
  return serialize(doc);
}

export function sectionsOf(work: string): PageSection[] {
  const doc = parse(work);
  return [...doc.querySelectorAll("[data-bk-s]")].map((el) => ({ id: el.getAttribute("data-bk-s")!, key: el.getAttribute("data-section") ?? "", name: nameOf(el), hidden: el.hasAttribute("data-hidden") }));
}

const edit = (work: string, fn: (doc: Document) => boolean | void) => {
  const doc = parse(work);
  return fn(doc) === false ? work : serialize(doc);
};

/** Words typed on the page: only inline formatting survives (no scripts, no handlers, no styles). */
export function sanitizeInline(html: string): string {
  const doc = parse(`<!doctype html><body><div id="x">${html}</div></body>`);
  const root = doc.getElementById("x")!;
  const scrub = (el: Element) => {
    for (const c of [...el.children]) {
      // Inside first, so whatever an unwrapped element leaves behind is already clean.
      scrub(c);
      if (SKIP.has(c.tagName) || ["IMG", "VIDEO", "AUDIO", "OBJECT", "EMBED", "INPUT", "SELECT", "TEXTAREA", "FORM"].includes(c.tagName)) { c.remove(); continue; }
      if (!INLINE.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); continue; }
      for (const a of [...c.attributes]) if (!(a.name === "class" || (c.tagName === "A" && (a.name === "href" || a.name === "target" || a.name === "rel" || a.name.startsWith("data-bk"))))) c.removeAttribute(a.name);
      if (c.tagName === "A" && /^\s*javascript:/i.test(c.getAttribute("href") ?? "")) c.removeAttribute("href");
    }
  };
  scrub(root);
  return root.innerHTML.replace(/&nbsp;/g, " ").trim();
}

export const setText = (work: string, id: string, html: string) => edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-t="${num(id)}"]`);
  if (!el) return false;
  el.innerHTML = sanitizeInline(html);
});

export const setImage = (work: string, id: string, src: string, alt?: string) => edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-i="${num(id)}"]`);
  if (!el || !/^https:\/\//.test(src)) return false;
  el.setAttribute("src", src);
  el.removeAttribute("srcset");
  if (alt) el.setAttribute("alt", alt.slice(0, 160));
});

export const linkOf = (work: string, id: string) => parse(work).querySelector(`[data-bk-l="${num(id)}"]`)?.getAttribute("href") ?? "";
export const setLink = (work: string, id: string, href: string) => edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-l="${num(id)}"]`);
  const h = href.trim();
  if (!el || !(/^(https?:|mailto:|tel:|#)/i.test(h))) return false;
  el.setAttribute("href", h.slice(0, 600));
});

export const moveSection = (work: string, id: string, by: -1 | 1) => edit(work, (doc) => {
  const all = [...doc.querySelectorAll("[data-bk-s]")];
  const i = all.findIndex((el) => el.getAttribute("data-bk-s") === id);
  const other = all[i + by];
  if (i < 0 || !other || other.parentElement !== all[i].parentElement) return false;
  if (by < 0) other.before(all[i]); else other.after(all[i]);
});

export const toggleSection = (work: string, id: string) => edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-s="${num(id)}"]`);
  if (!el) return false;
  if (el.hasAttribute("data-hidden")) el.removeAttribute("data-hidden"); else el.setAttribute("data-hidden", "");
});

/** A copy right after it (renumbered with prepare, so its words and pictures get their own ids). */
export const duplicateSection = (work: string, id: string) => prepare(edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-s="${num(id)}"]`);
  if (!el) return false;
  const copy = el.cloneNode(true) as Element;
  copy.setAttribute("data-section", `${el.getAttribute("data-section") ?? "section"}-copy`);
  el.after(copy);
}));

export const deleteSection = (work: string, id: string) => prepare(edit(work, (doc) => {
  const el = doc.querySelector(`[data-bk-s="${num(id)}"]`);
  if (!el || doc.querySelectorAll("[data-bk-s]").length <= 1) return false;
  el.remove();
}));

/** Colours and fonts the page keeps in :root custom properties (the studio asks for them). */
export function themeOf(html: string): ThemeVar[] {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  const out: ThemeVar[] = [];
  for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const value = m[2].trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) out.push({ name: m[1], value: value.toUpperCase(), kind: "color" });
    else if (/font/i.test(m[1]) && /^["']?[A-Za-z][\w ]{1,40}["']?\s*(,|$)/.test(value)) out.push({ name: m[1], value: value.split(",")[0].replace(/["']/g, "").trim(), kind: "font" });
  }
  return out.slice(0, 12);
}

const fontsHref = (families: string[]) => fontsCssAbsolute(`${[...new Set(families)].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`).join("&")}&display=swap`);

/** One theme value changed, in the :root block (a font also goes into the Google Fonts link). */
export function setTheme(html: string, name: string, value: string): string {
  if (!/^--[\w-]+$/.test(name)) return html;
  const v = value.trim();
  const isColor = /^#[0-9a-f]{6}$/i.test(v);
  const isFont = /^[A-Za-z][\w ]{1,40}$/.test(v);
  if (!isColor && !isFont) return html;
  // The variable inside the page's :root block, and nowhere else.
  let out = html.replace(/:root\s*\{[^}]*\}/, (block) => block.replace(new RegExp(`(${name}\\s*:\\s*)([^;]+)(;)`), (_m, pre: string, old: string, endc: string) =>
    isColor ? `${pre}${v}${endc}` : `${pre}"${v}"${old.includes(",") ? old.slice(old.indexOf(",")) : ", sans-serif"}${endc}`));
  if (isFont) {
    const fonts = themeOf(out).filter((t) => t.kind === "font").map((t) => t.value);
    const link = /<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']*["'][^>]*>/i;
    const tag = `<link rel="stylesheet" href="${fontsHref(fonts)}">`;
    out = link.test(out) ? out.replace(link, tag) : out.replace(/<\/head>/i, `${tag}\n</head>`);
  }
  return out;
}

/** The script the Sections preview runs inside its sandbox: click words to type, pictures to swap. */
const EDITOR_SCRIPT = `(function(){
var send=function(m){m.blink=1;parent.postMessage(m,"*")};
var st=document.createElement("style");st.setAttribute("data-blink-editor","");
st.textContent="[data-bk-t]{cursor:text}[data-bk-t]:hover{outline:2px dashed rgba(124,92,255,.8);outline-offset:3px}[data-bk-t][contenteditable=true]{outline:2px solid #7c5cff;outline-offset:3px}[data-bk-i]{cursor:pointer}[data-bk-i]:hover{outline:3px solid rgba(124,92,255,.85);outline-offset:-3px}.bk-sel{outline:3px solid #7c5cff!important;outline-offset:-3px}[data-hidden]{display:block!important;opacity:.35}";
document.head.appendChild(st);
var tx=function(e){return e.target&&e.target.closest?e.target.closest("[data-bk-t]"):null};
document.addEventListener("click",function(e){
var img=e.target.closest&&e.target.closest("[data-bk-i]");
var a=e.target.closest&&e.target.closest("a,button");if(a)e.preventDefault();
if(img){e.preventDefault();send({t:"image",id:img.getAttribute("data-bk-i")});return}
var t=tx(e);if(t&&!t.isContentEditable){t.contentEditable="true";t.focus()}
var l=e.target.closest&&e.target.closest("[data-bk-l]");
var s=e.target.closest&&e.target.closest("[data-bk-s]");
send({t:"select",section:s?s.getAttribute("data-bk-s"):null,link:l?l.getAttribute("data-bk-l"):null,href:l?l.getAttribute("href"):null});
},true);
document.addEventListener("submit",function(e){e.preventDefault()},true);
document.addEventListener("input",function(e){var t=tx(e);if(t)send({t:"text",id:t.getAttribute("data-bk-t"),html:t.innerHTML})},true);
document.addEventListener("focusout",function(e){var t=tx(e);if(t){t.contentEditable="false";send({t:"text",id:t.getAttribute("data-bk-t"),html:t.innerHTML})}},true);
document.addEventListener("keydown",function(e){var t=tx(e);if(t&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();t.blur()}if(t&&e.key==="Escape")t.blur()},true);
document.addEventListener("paste",function(e){var t=tx(e);if(t){e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain"))}},true);
window.addEventListener("message",function(e){var m=e.data||{};if(m.blinkParent!==1)return;
if(m.t==="img"){var el=document.querySelector('[data-bk-i="'+m.id+'"]');if(el){el.setAttribute("src",m.src);el.removeAttribute("srcset")}}
if(m.t==="show"){var s=document.querySelector('[data-bk-s="'+m.id+'"]');document.querySelectorAll(".bk-sel").forEach(function(x){x.classList.remove("bk-sel")});if(s){s.classList.add("bk-sel");s.scrollIntoView({behavior:"smooth",block:"start"})}}});
var lastY=0;window.addEventListener("scroll",function(){var y=Math.round(window.scrollY);if(Math.abs(y-lastY)>30){lastY=y;send({t:"scroll",y:y})}},{passive:true});
var y=Number(document.documentElement.getAttribute("data-bk-scroll")||0);if(y)window.addEventListener("load",function(){window.scrollTo(0,y)});
})();`;

/** The page for the Sections preview: its own scripts off (pages are complete without them), ours on. */
export function editorDoc(work: string, scrollY = 0): string {
  const doc = parse(work);
  doc.querySelectorAll("script").forEach((s) => s.remove());
  doc.documentElement.setAttribute("data-bk-scroll", String(Math.max(0, Math.round(scrollY))));
  const s = doc.createElement("script");
  s.setAttribute("data-blink-editor", "");
  s.textContent = EDITOR_SCRIPT;
  doc.body.appendChild(s);
  return serialize(doc);
}
