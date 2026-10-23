/**
 * Scroll film for website studio pages (Kezie, 2026-10-23: "like the website we made for Nuf Farms,
 * where we got the video and we split the video into a sequence, and as we're scrolling... the
 * video plays back"). The studio cuts a video into frames in the browser (two sets: 1280 wide for
 * desktops, every other frame at 720 wide for phones) and uploads them to the owner's storage.
 * Claude writes the section and its captions; BlinkSpot adds the canvas, the still and the engine,
 * so the scrubbing is the same tested code on every page (Kezie-OS skill scroll-brand-site):
 * - tiers on load: static (reduced motion, data saver, 2G, ≤2 GB) shows the still and the captions;
 *   lite (touch, <900 px, ≤4 cores) loads the phone set; full loads the desktop set;
 * - pinned with CSS sticky (no scroll library, nothing to re-measure after fonts load);
 * - frames load when the section is within 1.5 screens, every 8th first, and the nearest loaded
 *   frame is drawn; DPR capped at 2 (1.5 on lite); nothing draws while the tab is hidden;
 * - complete at rest: the still and the captions are in the markup and readable without script.
 * Pure parts here (tested); the browser cutting is in components/studio/sites/film-frames.ts.
 */

export const FILM_MIN = 12;
export const FILM_MAX = 96;
export const FILM_WIDTH = 1280;
export const FILM_PHONE_WIDTH = 720;
/** Longer videos use their first 20 s: past that, a scroll can't show the motion anyway. */
export const FILM_MAX_SECONDS = 20;

/** What the browser sends after uploading the frames (the folder is in the owner's storage). */
export type FilmInput = { folder: string; count: number; phoneCount: number; ext: "webp" | "jpg"; ratio: number };
/** The frames as URLs, as they are written onto the page. */
export type FilmUrls = { base: string; phone: string; count: number; phoneCount: number; ext: string; ratio: number };

const FOLDER = /^images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/site_film_(\d{10,16})$/;
export const filmFolder = (clientId: string, stamp = Date.now()) => `images/${clientId}/site_film_${stamp}`;
export const framePath = (folder: string, set: "d" | "m", i: number, ext: string) => `${folder}/${set}/${String(i).padStart(3, "0")}.${ext}`;

/** How many frames to cut: up to FILM_MAX, never more than the video has (about 30 a second). */
export function filmFrameCount(seconds: number) {
  const s = Math.min(FILM_MAX_SECONDS, Math.max(0, seconds || 0));
  return Math.max(FILM_MIN, Math.min(FILM_MAX, Math.round(s * 30)));
}
/** The time of frame i of n, spread over the usable part of the video. */
export function filmFrameTime(i: number, n: number, seconds: number) {
  const usable = Math.max(0.1, Math.min(FILM_MAX_SECONDS, seconds) - 0.06);
  return 0.02 + (n > 1 ? (i / (n - 1)) * usable : 0);
}
export const phoneCountFor = (count: number) => Math.ceil(count / 2);

/** A film the request may use: the right shape, in the caller's own (or shared) workspace folder. */
export function parseFilm(raw: unknown, clientIds: Array<string | null | undefined>): FilmInput | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const folder = typeof f.folder === "string" ? f.folder : "";
  const m = FOLDER.exec(folder);
  if (!m || !clientIds.some((id) => id && id.toLowerCase() === m[1].toLowerCase())) return null;
  const count = Number(f.count), phoneCount = Number(f.phoneCount), ratio = Number(f.ratio);
  if (!Number.isInteger(count) || count < FILM_MIN || count > FILM_MAX) return null;
  if (phoneCount !== phoneCountFor(count)) return null;
  if (f.ext !== "webp" && f.ext !== "jpg") return null;
  if (!Number.isFinite(ratio) || ratio < 0.3 || ratio > 3.5) return null;
  return { folder, count, phoneCount, ext: f.ext, ratio: Math.round(ratio * 1000) / 1000 };
}

/** The frame URLs in public storage. */
export function filmUrls(film: FilmInput, supabaseUrl: string): FilmUrls {
  const root = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/assets/${film.folder}`;
  return { base: `${root}/d/`, phone: `${root}/m/`, count: film.count, phoneCount: film.phoneCount, ext: film.ext, ratio: film.ratio };
}
/** Start, middle and end (phone size), for Claude to see what the film shows. */
export function filmGlimpses(f: FilmUrls) {
  const at = (i: number) => `${f.phone}${String(i).padStart(3, "0")}.${f.ext}`;
  return [at(0), at(Math.floor((f.phoneCount - 1) / 2)), at(f.phoneCount - 1)];
}

export const FILM_PROMPT = `Scroll film: the owner added a video that plays frame by frame as the visitor scrolls (the film frames above show its start, middle and end). Put this section in exactly once, where it tells the story best (often straight after the hero), with this structure:
<section data-section="film" data-scroll-film>
  <div data-film-stage>
    <div data-film-step><h2>...</h2></div>
    <div data-film-step><p>...</p></div>
  </div>
</section>
Write 2 to 4 data-film-step blocks: short lines (at most 10 words each) that follow what the film shows, in order. BlinkSpot adds the frames, the canvas and the scroll script itself: write no script, canvas, video or picture for this section, and don't set the height, position, overflow or background of the section or the stage, or the position, opacity or transform of the steps. Style only the step text: the heading font, large (clamp), light text with a soft text-shadow; it sits over the video, and on a dark band when motion is off.`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const FILM_CSS = `[data-scroll-film]{position:relative}
[data-scroll-film] [data-film-stage]{position:relative;overflow:hidden;background:#0b0b0c;color:#fff}
[data-scroll-film] [data-film-canvas]{display:none}
[data-scroll-film] [data-film-still]{display:block;width:100%;max-height:85vh;object-fit:cover;aspect-ratio:var(--film-ratio,1.778)}
[data-scroll-film] [data-film-step]{position:relative;padding:1.25rem 6vw}
[data-scroll-film].bs-film--live{height:calc(var(--film-len,4) * 100vh)!important;height:calc(var(--film-len,4) * 100svh)!important;overflow:visible!important;padding:0!important}
.bs-film--live [data-film-stage]{position:sticky!important;top:0;height:100vh!important;height:100svh!important}
.bs-film--live [data-film-canvas]{display:block;position:absolute;inset:0;width:100%;height:100%}
.bs-film--live [data-film-still]{position:absolute;inset:0;width:100%;height:100%;max-height:none;aspect-ratio:auto}
.bs-film--drawn [data-film-still]{visibility:hidden}
.bs-film--live [data-film-stage]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:50%;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.55));z-index:1;pointer-events:none}
.bs-film--live [data-film-step]{position:absolute!important;left:0;right:0;bottom:12vh;margin:0 auto;padding:0 6vw;max-width:960px;text-align:center;opacity:var(--o,0);transform:translateY(calc((1 - var(--o,0)) * 18px));z-index:2;pointer-events:none}`;

/** The engine (ES5, no libraries). Only the first film on a page plays. */
export const FILM_SCRIPT = `(function(){
var root=document.querySelector("[data-scroll-film]"),stage=root&&root.querySelector("[data-film-stage]"),canvas=stage&&stage.querySelector("canvas[data-film-canvas]");
if(!canvas||!canvas.getContext)return;
var mq=function(q){try{return window.matchMedia(q).matches}catch(e){return false}},nav=navigator,cn=nav.connection||{};
var tier=mq("(prefers-reduced-motion: reduce)")||cn.saveData||/2g/.test(cn.effectiveType||"")||(nav.deviceMemory&&nav.deviceMemory<=2)?"static":mq("(pointer: coarse)")||window.innerWidth<900||(nav.hardwareConcurrency&&nav.hardwareConcurrency<=4)?"lite":"full";
if(tier==="static")return;
var lite=tier==="lite",base=stage.getAttribute(lite?"data-film-phone":"data-film-base"),n=parseInt(stage.getAttribute(lite?"data-film-phone-count":"data-film-count"),10)||0,ext=stage.getAttribute("data-film-ext")||"webp";
if(!base||n<2)return;
var steps=[].slice.call(root.querySelectorAll("[data-film-step]")),ctx=canvas.getContext("2d"),imgs=[],asked=[],want=0,shown=-1,drawn=false,queued=false,dpr=Math.min(window.devicePixelRatio||1,lite?1.5:2);
steps.forEach(function(s){if(!stage.contains(s))stage.appendChild(s)});
root.classList.add("bs-film--live");
root.style.setProperty("--film-len",String(Math.min(5,Math.max(3,steps.length+1.5))));
function load(i){if(asked[i])return;asked[i]=1;var im=new Image();im.decoding="async";im.onload=function(){imgs[i]=im;if(!drawn||Math.abs(i-want)<Math.abs(shown-want))paint()};im.src=base+("00"+i).slice(-3)+"."+ext}
function start(){var i;for(i=0;i<n;i+=8)load(i);load(n-1);for(i=0;i<n;i++)load(i)}
function near(t){for(var d=0;d<n;d++){if(imgs[t-d])return t-d;if(imgs[t+d])return t+d}return -1}
function fit(){var r=stage.getBoundingClientRect(),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;shown=-1}}
function paint(){var i=near(want);if(i<0||i===shown)return;var im=imgs[i],cw=canvas.width,ch=canvas.height,iw=im.naturalWidth||1,ih=im.naturalHeight||1,a=iw/ih,v=cw/ch,cover=Math.max(a/v,v/a)<1.6,s=cover?Math.max(cw/iw,ch/ih):Math.min(cw/iw,ch/ih),w=iw*s,h=ih*s;ctx.clearRect(0,0,cw,ch);ctx.drawImage(im,(cw-w)/2,(ch-h)/2,w,h);shown=i;if(!drawn){drawn=true;root.classList.add("bs-film--drawn")}}
function progress(){var r=root.getBoundingClientRect(),run=r.height-window.innerHeight;return run>0?Math.min(1,Math.max(0,-r.top/run)):0}
function tick(){queued=false;if(document.hidden)return;var p=progress(),k=steps.length,f=Math.min(0.06,0.25/Math.max(1,k));want=Math.round(p*(n-1));paint();for(var j=0;j<k;j++){var a=j/k,b=(j+1)/k,o=Math.min(j?(p-a)/f:1,j<k-1?(b-p)/f:1);steps[j].style.setProperty("--o",Math.max(0,Math.min(1,o)).toFixed(3))}}
function ask(){if(!queued){queued=true;window.requestAnimationFrame(tick)}}
window.addEventListener("scroll",ask,{passive:true});
window.addEventListener("resize",function(){fit();paint();ask()});
document.addEventListener("visibilitychange",function(){if(!document.hidden)ask()});
fit();tick();
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es.some(function(e){return e.isIntersecting})){io.disconnect();start()}},{rootMargin:"150% 0px"});io.observe(root)}else start();
})();`;

const STAGE_TAG = /<([a-z][a-z0-9-]*)(\s[^>]*?\bdata-film-stage\b[^>]*)>/i;
const FILM_TAG = /<([a-z][a-z0-9-]*)(\s[^>]*?\bdata-scroll-film\b[^>]*)>/i;
const ENGINE = /<(style|script)\b[^>]*\bdata-blink-film\b[^>]*>[\s\S]*?<\/\1>\s*/gi;
const OURS = /<canvas\b[^>]*\bdata-film-canvas\b[^>]*>\s*<\/canvas>\s*|<img\b[^>]*\bdata-film-still\b[^>]*>\s*/gi;

function stageAttrs(f: FilmUrls) {
  return ` data-film-base="${esc(f.base)}" data-film-phone="${esc(f.phone)}" data-film-count="${f.count}" data-film-phone-count="${f.phoneCount}" data-film-ext="${esc(f.ext)}" data-film-ratio="${f.ratio}" style="--film-ratio:${f.ratio}"`;
}
function inner(f: FilmUrls, alt: string) {
  return `<canvas data-film-canvas aria-hidden="true"></canvas><img data-film-still src="${esc(`${f.base}000.${f.ext}`)}" alt="${esc(alt)}" decoding="async">`;
}

/** The page with only its own styles and scripts (any engine taken out). */
export const withoutEngine = (html: string) => html.replace(ENGINE, "");

/** The latest engine on a page that has a film (taken out first, so it is never there twice). */
export function withEngine(html: string) {
  let out = withoutEngine(html);
  const style = `<style data-blink-film>\n${FILM_CSS}\n</style>\n`;
  const script = `<script data-blink-film>\n${FILM_SCRIPT}\n</script>\n`;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${style}</head>`) : out.replace(/<body(\s[^>]*)?>/i, (m) => `${m}\n${style}`);
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${script}</body>`) : `${out}\n${script}`;
  return out;
}

/**
 * Put the film on the page. Claude's stage gets the frames, the canvas and the still; with no stage
 * the stage goes inside Claude's film section; with no section, a film section goes before the
 * footer (or at the end). Safe to run again: our own pieces are replaced, never doubled.
 */
export function addFilm(html: string, f: FilmUrls, alt: string): string {
  let out = withoutEngine(html).replace(OURS, "");
  const stage = STAGE_TAG.exec(out);
  if (stage && FILM_TAG.test(out)) {
    const attrs = stage[2].replace(/\s(?:data-film-(?:base|phone|count|phone-count|ext|ratio)|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    out = out.slice(0, stage.index) + `<${stage[1]}${attrs}${stageAttrs(f)}>${inner(f, alt)}` + out.slice(stage.index + stage[0].length);
  } else {
    const box = `<div data-film-stage${stageAttrs(f)}>${inner(f, alt)}</div>`;
    const film = FILM_TAG.exec(out);
    if (film) out = out.slice(0, film.index + film[0].length) + box + out.slice(film.index + film[0].length);
    else {
      const section = `<section data-section="film" data-scroll-film>${box}</section>\n`;
      const footer = out.search(/<footer\b|<[a-z]+\b[^>]*\bdata-section=["']footer["']/i);
      out = footer >= 0 ? out.slice(0, footer) + section + out.slice(footer) : /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${section}</body>`) : `${out}\n${section}`;
    }
  }
  return withEngine(out);
}

/** The film already on a page (read from its stage), or null. */
export function filmOf(html: string): FilmUrls | null {
  const tag = STAGE_TAG.exec(html)?.[2];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1]?.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&amp;/g, "&") ?? null;
  const base = attr("data-film-base"), phone = attr("data-film-phone");
  const count = Number(attr("data-film-count")), phoneCount = Number(attr("data-film-phone-count")), ratio = Number(attr("data-film-ratio")) || 16 / 9;
  if (!base || !phone || !/^https:\/\//.test(base) || !/^https:\/\//.test(phone) || !(count >= 2) || !(phoneCount >= 2)) return null;
  return { base, phone, count, phoneCount, ext: attr("data-film-ext") || "webp", ratio };
}

/**
 * After an AI change: a film the page still has keeps a working engine (re-added if the change
 * dropped it, or its frames put back if the stage lost them); a film section the owner had removed
 * stays removed, and its engine goes with it.
 */
export function keepFilm(next: string, prev: string, alt: string): string {
  if (!FILM_TAG.test(next)) return withoutEngine(next);
  const now = filmOf(next);
  if (now) return withEngine(next);
  const before = filmOf(prev);
  return before ? addFilm(next, before, alt) : withoutEngine(next);
}
