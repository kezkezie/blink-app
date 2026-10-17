// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clean, deleteSection, duplicateSection, editorDoc, moveSection, prepare, sanitizeInline, sectionsOf, setImage, setLink, setText, setTheme, themeOf, toggleSection } from "@/lib/sites/sections";

/** Sections mode (2026-10-17): the same HTML, edited without code. */
const page = `<!doctype html><html><head><title>Kasi</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap">
<style>:root{--color-bg:#0e0e12;--color-primary:#E4572E;--font-heading:"Space Grotesk", sans-serif;--font-body:"Inter", sans-serif;--gap:24px}body{background:var(--color-bg)}</style></head>
<body><header><a href="#shop">Shop</a></header>
<main><section id="hero"><h1>Fresh <em>kicks</em></h1><p>Made in Nairobi.</p><a class="btn" href="https://wa.me/254700">Order on WhatsApp</a><img src="https://x/a.jpg" alt="Shoe"></section>
<section><h2>Our story</h2><p>Since 2019.</p></section></main>
<footer><p>© Kasi</p></footer><script>gsap.from(".x",{})</script></body></html>`;

describe("sections of a page", () => {
  it("finds the parts in order, names them and marks them for the AI", () => {
    const work = prepare(page);
    expect(sectionsOf(work).map((s) => [s.name, s.key])).toEqual([["Header", "header"], ["Hero", "hero"], ["Our story", "our-story"], ["Footer", "footer"]]);
    const saved = clean(work);
    expect(saved).toContain('data-section="hero"');
    expect(saved).not.toMatch(/data-bk-/);
    expect(saved.startsWith("<!doctype html>")).toBe(true);
    expect(saved).toContain('gsap.from(".x",{})'); // the page's own script is kept
  });

  it("uses data-section when the page has it", () => {
    const marked = prepare(`<!doctype html><html><body><div data-section="hero"><h1>A</h1></div><div data-section="menu"><h2>B</h2></div></body></html>`);
    expect(sectionsOf(marked).map((s) => s.name)).toEqual(["Hero", "Menu"]);
  });

  it("moves, hides, duplicates and deletes sections", () => {
    let work = prepare(page);
    const [, hero, story] = sectionsOf(work);
    work = moveSection(work, story.id, -1);
    expect(sectionsOf(work).map((s) => s.key)).toEqual(["header", "our-story", "hero", "footer"]);
    work = toggleSection(work, hero.id);
    expect(sectionsOf(work).find((s) => s.key === "hero")!.hidden).toBe(true);
    expect(clean(work)).toContain("[data-hidden]{display:none!important}");
    work = duplicateSection(work, sectionsOf(work).find((s) => s.key === "hero")!.id);
    expect(sectionsOf(work).map((s) => s.key)).toContain("hero-copy");
    work = deleteSection(work, sectionsOf(work).find((s) => s.key === "hero-copy")!.id);
    expect(sectionsOf(work)).toHaveLength(4);
  });

  it("changes words, pictures and links, and keeps only safe inline markup", () => {
    let work = prepare(page);
    const t = /<h1 data-bk-t="(\d+)"/.exec(work)![1];
    work = setText(work, t, 'Kicks <strong>built</strong> for Nairobi<img src=x onerror=alert(1)><script>alert(1)</script>');
    expect(clean(work)).toContain("<h1>Kicks <strong>built</strong> for Nairobi</h1>");
    expect(clean(work)).not.toContain("onerror");
    const i = /<img[^>]*data-bk-i="(\d+)"/.exec(work)![1];
    work = setImage(work, i, "https://y/b.jpg", "New shoe");
    expect(clean(work)).toContain('src="https://y/b.jpg"');
    expect(setImage(work, i, "javascript:alert(1)")).toBe(work);
    const l = /class="btn"[^>]*data-bk-l="(\d+)"|data-bk-l="(\d+)"[^>]*class="btn"/.exec(work);
    const lid = l![1] ?? l![2];
    work = setLink(work, lid, "tel:+254700");
    expect(clean(work)).toContain('href="tel:+254700"');
    expect(setLink(work, lid, "javascript:alert(1)")).toBe(work);
    expect(sanitizeInline('<a href="javascript:x" onclick="y">a</a>')).toBe("<a>a</a>");
    expect(sanitizeInline('<div>hi <img src=x onerror=alert(1)><span onclick="z">there</span></div>')).toBe("hi <span>there</span>");
  });

  it("reads and changes colours and fonts in :root", () => {
    expect(themeOf(page)).toEqual([
      { name: "--color-bg", value: "#0E0E12", kind: "color" },
      { name: "--color-primary", value: "#E4572E", kind: "color" },
      { name: "--font-heading", value: "Space Grotesk", kind: "font" },
      { name: "--font-body", value: "Inter", kind: "font" },
    ]);
    const red = setTheme(page, "--color-primary", "#FF0000");
    expect(red).toContain("--color-primary:#FF0000;");
    expect(red).toContain("--color-bg:#0e0e12;");
    const font = setTheme(page, "--font-heading", "Fraunces");
    expect(font).toContain('--font-heading:"Fraunces", sans-serif;');
    expect(font).toContain("family=Fraunces:wght@400;500;600;700;800&family=Inter");
    expect(setTheme(page, "--color-primary", "red; } body{display:none")).toBe(page);
  });

  it("previews without the page's scripts, with the editor's", () => {
    const doc = editorDoc(prepare(page), 420);
    expect(doc).not.toContain('gsap.from(".x"');
    expect(doc).toContain("data-blink-editor");
    expect(doc).toContain('data-bk-scroll="420"');
    expect(clean(doc)).not.toContain("data-blink-editor");
  });
});
