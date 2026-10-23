import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, devices, type Page } from "@playwright/test";
import { addFilm, type FilmUrls } from "@/lib/sites/scroll-film";

/**
 * The scroll film engine (2026-10-23, lib/sites/scroll-film.ts) on a page, no sign-in: frames are
 * made with ffmpeg (a colour per frame) and served from a fake host. Checks the three tiers, that
 * scrolling moves through the frames and the captions, and that nothing jumps (scroll-brand-site).
 */
const HOST = "https://frames.test";
const dir = mkdtempSync(path.join(tmpdir(), "film-"));
const COUNT = 48, PHONE = 24;

test.beforeAll(() => {
  for (const [set, n, w] of [["d", COUNT, 640], ["m", PHONE, 360]] as const) {
    execFileSync("mkdir", ["-p", path.join(dir, set)]);
    // Hue walks round the circle frame by frame, so each frame has its own colour.
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=red:s=${w}x${Math.round(w * 9 / 16)}:r=${n},hue=h=t*360`, "-frames:v", String(n), "-start_number", "0", "-q:v", "4", path.join(dir, set, "%03d.jpg")]);
  }
});

const film: FilmUrls = { base: `${HOST}/d/`, phone: `${HOST}/m/`, count: COUNT, phoneCount: PHONE, ext: "jpg", ratio: 1.778 };
const html = addFilm(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:sans-serif}main,footer{height:120vh;display:grid;place-items:center}[data-film-step] h2{color:#fff;font-size:40px;margin:0}</style></head><body>
<main data-section="hero"><h1>Nuf Farms</h1></main>
<section data-section="film" data-scroll-film><div data-film-stage><div data-film-step><h2>Sun up</h2></div><div data-film-step><h2>Into the rows</h2></div><div data-film-step><h2>Harvest</h2></div></div></section>
<footer data-section="footer">Visit us</footer></body></html>`, film, "Nuf Farms, the film");

async function open(page: Page) {
  const asked: string[] = [];
  await page.route(`${HOST}/**`, (route) => {
    const rel = new URL(route.request().url()).pathname.slice(1);
    asked.push(rel);
    const file = path.join(dir, rel);
    return existsSync(file) ? route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(file) }) : route.fulfill({ status: 404 });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The frames are cross-origin (the canvas can't be read back), so note which frame is drawn.
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage as (...a: unknown[]) => void;
    (CanvasRenderingContext2D.prototype as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      const src = (a[0] as HTMLImageElement)?.src ?? "";
      (window as unknown as { __frame: string }).__frame = src.split("/").slice(-2).join("/");
      return draw.apply(this, a);
    };
  });
  await page.route("https://site.test/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("https://site.test/", { waitUntil: "domcontentloaded" });
  return { asked, errors };
}

/** The frame on the canvas now, e.g. "d/017.jpg". */
const centre = (page: Page) => page.evaluate(() => (window as unknown as { __frame?: string }).__frame ?? "");
const opacities = (page: Page) => page.$$eval("[data-film-step]", (els) => els.map((e) => Number(getComputedStyle(e).opacity)));

test.describe("scroll film engine", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("desktop: pins, scrubs through the frames and the captions, no jumps", async ({ page }) => {
    const { asked, errors } = await open(page);
    const section = page.locator("[data-scroll-film]");
    await expect(section).toHaveClass(/bs-film--live/);
    const height = await section.evaluate((e) => e.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(900 * 3 - 5);

    // Into the film: the frames load (desktop set) and the first one is drawn.
    await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-scroll-film]")!.getBoundingClientRect().top + window.scrollY));
    await expect(section).toHaveClass(/bs-film--drawn/, { timeout: 10_000 });
    await expect.poll(() => new Set(asked.filter((a) => a.startsWith("d/"))).size, { timeout: 10_000 }).toBe(COUNT);
    expect(asked.some((a) => a.startsWith("m/"))).toBe(false);
    expect((await opacities(page))[0]).toBe(1);
    const first = await centre(page);
    expect(first).toBe("d/000.jpg");

    // Wheel through in even steps: the frame and the caption change, the stage stays pinned.
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    let lastY = await page.evaluate(() => window.scrollY);
    const frames = new Set([first]);
    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
      const y = await page.evaluate(() => window.scrollY);
      expect(y - lastY).toBeLessThan(400);
      expect(y).toBeGreaterThanOrEqual(lastY);
      lastY = y;
      const top = await page.locator("[data-film-stage]").evaluate((e) => e.getBoundingClientRect().top);
      if (await section.evaluate((e) => e.getBoundingClientRect().bottom > window.innerHeight)) expect(Math.abs(top)).toBeLessThan(2);
      frames.add(await centre(page));
    }
    expect(frames.size).toBeGreaterThan(5);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(docHeight);

    // Half way: the middle caption shows, the first has gone.
    await page.evaluate(() => { const s = document.querySelector("[data-scroll-film]")!; const top = s.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, top + (s.getBoundingClientRect().height - window.innerHeight) / 2); });
    await expect.poll(async () => (await opacities(page)).map((o) => Math.round(o)).join(","), { timeout: 3000 }).toBe("0,1,0");
    // The end: the last caption stays.
    await page.evaluate(() => { const s = document.querySelector("[data-scroll-film]")!; const top = s.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, top + s.getBoundingClientRect().height - window.innerHeight); });
    await expect.poll(async () => (await opacities(page)).map((o) => Math.round(o)).join(","), { timeout: 3000 }).toBe("0,0,1");
    expect(await centre(page)).toBe(`d/${String(COUNT - 1).padStart(3, "0")}.jpg`);
    expect(errors).toEqual([]);
  });

  test("reduced motion: the still and every caption, nothing pinned, no frames loaded", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { asked, errors } = await open(page);
    await page.waitForTimeout(500);
    await expect(page.locator("[data-scroll-film]")).not.toHaveClass(/bs-film--live/);
    await expect(page.locator("img[data-film-still]")).toBeVisible();
    for (const t of ["Sun up", "Into the rows", "Harvest"]) await expect(page.getByText(t)).toBeVisible();
    expect(asked.filter((a) => a !== "d/000.jpg")).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("scroll film engine on a phone", () => {
  const phone = devices["iPhone 13"];
  test.use({ viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: phone.userAgent });

  test("loads the phone set and never scrolls sideways", async ({ page }) => {
    const { asked, errors } = await open(page);
    await expect(page.locator("[data-scroll-film]")).toHaveClass(/bs-film--live/);
    await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-scroll-film]")!.getBoundingClientRect().top + window.scrollY + 200));
    await expect(page.locator("[data-scroll-film]")).toHaveClass(/bs-film--drawn/, { timeout: 10_000 });
    await expect.poll(() => new Set(asked.filter((a) => a.startsWith("m/"))).size, { timeout: 10_000 }).toBe(PHONE);
    expect(asked.filter((a) => a.startsWith("d/") && a !== "d/000.jpg")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
