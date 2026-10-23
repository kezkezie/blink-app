import { describe, expect, it } from "vitest";
import { CHANGE_SYSTEM, codeUserPrompt, inspirationPrompt } from "@/lib/sites/code";
import {
  FILM_MAX, FILM_MIN, FILM_PROMPT, addFilm, filmFolder, filmFrameCount, filmFrameTime, filmGlimpses, filmOf, filmUrls, keepFilm, parseFilm, phoneCountFor, withoutEngine,
} from "@/lib/sites/scroll-film";

const CID = "0f8b2c1e-1234-4abc-9def-0123456789ab";
const OTHER = "11111111-2222-4333-8444-555555555555";
const SUPA = "https://abc.supabase.co";
const film = { folder: `images/${CID}/site_film_1761200000000`, count: 96, phoneCount: 48, ext: "webp", ratio: 1.778 };
const urls = filmUrls(parseFilm(film, [CID])!, SUPA);
const brand = {
  name: "Nuf Farms", brief: "A farm.", theme: { primary: "#112233", secondary: "#445566", accent: "#778899", background: "#ffffff", headingFont: "Fraunces", bodyFont: "Inter" },
  contact: {}, products: [], images: [], logoUrl: null,
} as unknown as Parameters<typeof codeUserPrompt>[0]["brand"];

const page = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("scroll film (2026-10-23)", () => {
  it("cuts up to 96 frames, never more than the video has, over its first 20 s", () => {
    expect(filmFrameCount(8)).toBe(FILM_MAX);
    expect(filmFrameCount(60)).toBe(FILM_MAX);
    expect(filmFrameCount(1)).toBe(30);
    expect(filmFrameCount(0)).toBe(FILM_MIN);
    expect(phoneCountFor(96)).toBe(48);
    expect(phoneCountFor(31)).toBe(16);
    expect(filmFrameTime(0, 96, 8)).toBeCloseTo(0.02);
    expect(filmFrameTime(95, 96, 8)).toBeLessThan(8);
    expect(filmFrameTime(95, 96, 60)).toBeLessThanOrEqual(20);
  });

  it("only takes a film in the caller's own (or shared) folder, with sane numbers", () => {
    expect(filmFolder(CID, 1761200000000)).toBe(film.folder);
    expect(parseFilm(film, [CID])).toEqual(film);
    expect(parseFilm(film, [OTHER, CID])).toEqual(film);
    expect(parseFilm(film, [OTHER])).toBeNull();
    expect(parseFilm(film, [null])).toBeNull();
    expect(parseFilm({ ...film, folder: `images/${CID}/site_film_1/../../x` }, [CID])).toBeNull();
    expect(parseFilm({ ...film, folder: `references/${CID}/site_film_1761200000000` }, [CID])).toBeNull();
    expect(parseFilm({ ...film, count: 500, phoneCount: 250 }, [CID])).toBeNull();
    expect(parseFilm({ ...film, phoneCount: 10 }, [CID])).toBeNull();
    expect(parseFilm({ ...film, ext: "svg" }, [CID])).toBeNull();
    expect(parseFilm({ ...film, ratio: 40 }, [CID])).toBeNull();
    expect(parseFilm("nope", [CID])).toBeNull();
  });

  it("builds public frame URLs and three glimpses for Claude", () => {
    expect(urls.base).toBe(`${SUPA}/storage/v1/object/public/assets/${film.folder}/d/`);
    expect(urls.phone).toBe(`${SUPA}/storage/v1/object/public/assets/${film.folder}/m/`);
    expect(filmGlimpses(urls)).toEqual([`${urls.phone}000.webp`, `${urls.phone}023.webp`, `${urls.phone}047.webp`]);
  });

  it("fills Claude's stage with the frames, the canvas, the still and one engine", () => {
    const html = page(`<header data-section="header">Hi</header><section data-section="film" data-scroll-film class="f"><div class="stage" data-film-stage style="height:9px"><div data-film-step><h2>Sun up</h2></div><div data-film-step><p>Harvest</p></div></div></section><footer>f</footer>`);
    const out = addFilm(html, urls, "Nuf Farms, the film");
    expect(out).toContain(`data-film-base="${urls.base}"`);
    expect(out).toContain('data-film-count="96"');
    expect(out).not.toContain("height:9px");
    expect(count(out, /<canvas data-film-canvas/g)).toBe(1);
    expect(out).toContain(`<img data-film-still src="${urls.base}000.webp" alt="Nuf Farms, the film"`);
    expect(out).toContain("<h2>Sun up</h2>");
    expect(count(out, /<script data-blink-film>/g)).toBe(1);
    expect(count(out, /<style data-blink-film>/g)).toBe(1);
    expect(out.indexOf("<style data-blink-film>")).toBeLessThan(out.indexOf("</head>"));
    expect(out.indexOf("<script data-blink-film>")).toBeGreaterThan(out.indexOf("<footer>"));
    expect(filmOf(out)).toEqual({ ...urls });
    // Running it again replaces our pieces instead of doubling them.
    const again = addFilm(out, urls, "Nuf Farms, the film");
    expect(again).toBe(out);
  });

  it("adds a stage to a film section without one, or a film section before the footer", () => {
    const noStage = addFilm(page(`<section data-scroll-film><p data-film-step>Hi</p></section>`), urls, "film");
    expect(noStage).toMatch(/<section data-scroll-film><div data-film-stage data-film-base=/);
    const none = addFilm(page(`<main data-section="hero">x</main><footer data-section="footer">f</footer>`), urls, "film");
    expect(none).toMatch(/<section data-section="film" data-scroll-film><div data-film-stage[^>]*><canvas[\s\S]*<\/section>\n<footer/);
    const noFooter = addFilm(page(`<main>x</main>`), urls, "film");
    expect(noFooter).toMatch(/<\/section>\n?<script data-blink-film>[\s\S]*<\/script>\n<\/body>/);
  });

  it("keeps a film working through an AI change, and lets a removed one go", () => {
    const filmed = addFilm(page(`<section data-scroll-film><div data-film-stage><div data-film-step>Hi</div></div></section>`), urls, "film");
    // The change came back without the engine (Claude edits the page without it).
    const edited = withoutEngine(filmed).replace("Hi", "Hello");
    const kept = keepFilm(edited, filmed, "film");
    expect(kept).toContain("Hello");
    expect(count(kept, /<script data-blink-film>/g)).toBe(1);
    // A whole new file whose stage lost its frames gets them back from the page before.
    const lost = page(`<section data-scroll-film><div data-film-stage><div data-film-step>New</div></div></section>`);
    const back = keepFilm(lost, filmed, "film");
    expect(filmOf(back)).toEqual(urls);
    // The owner asked to remove the film: no engine left behind.
    const gone = keepFilm(page(`<main>no film</main><style data-blink-film>x</style>`), filmed, "film");
    expect(gone).not.toContain("data-blink-film");
  });

  it("escapes what goes into attributes", () => {
    const out = addFilm(page(`<main>x</main>`), { ...urls, base: 'https://a.co/"><script>x</script>/' }, 'a "b" <c>');
    expect(out).not.toContain('"><script>x');
    expect(out).toContain('alt="a &quot;b&quot; &lt;c>"');
  });
});

describe("designs you like (2026-10-23)", () => {
  it("tells Claude to follow the designs but never copy them onto the page", () => {
    const one = inspirationPrompt(1);
    expect(one).toMatch(/^Design A,/);
    expect(inspirationPrompt(3)).toMatch(/^Designs A to C/);
    expect(one).toMatch(/Never copy their text, logos/);
    expect(one).toMatch(/not \{\{img:N\}\} pictures/);
  });

  it("adds the designs and the film to the page prompt only when given", () => {
    const plain = codeUserPrompt({ brand, look: "cinematic" });
    expect(plain).not.toMatch(/Design A|Scroll film/);
    const full = codeUserPrompt({ brand, look: "cinematic", inspiration: 2, film: FILM_PROMPT, brief: "launch page" });
    expect(full).toMatch(/Designs A to B/);
    expect(full).toContain("data-scroll-film");
    expect(full.indexOf("Designs A to B")).toBeLessThan(full.indexOf("The owner's brief"));
    expect(codeUserPrompt({ brand, look: "bold", inspiration: 9 })).toMatch(/Designs A to D/);
  });

  it("tells the change writer to keep a scroll film", () => {
    expect(CHANGE_SYSTEM).toMatch(/data-scroll-film/);
    expect(CHANGE_SYSTEM).toMatch(/data-blink-film/);
  });
});
