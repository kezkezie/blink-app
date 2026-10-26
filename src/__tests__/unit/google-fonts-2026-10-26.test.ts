import { describe, expect, it } from "vitest";
import { APP_ORIGIN, fontsCss, fontsCssAbsolute, throughOurFonts } from "@/lib/google-fonts";
import { PAGE_CSP, previewDoc } from "@/lib/sites/code";

/** Google Fonts through blinkspot.io (cookie consent / GDPR, 2026-10-26): pages never call Google. */
describe("Google Fonts through our domain", () => {
  it("builds our own stylesheet links", () => {
    expect(fontsCss("family=Inter:wght@400&display=swap")).toBe("/api/gfonts/css2?family=Inter:wght@400&display=swap");
    expect(fontsCssAbsolute("family=Inter")).toBe(`${APP_ORIGIN}/api/gfonts/css2?family=Inter`);
  });

  it("rewrites Claude-written pages: css2, the old css, icons, @import and font files", () => {
    const page = `<head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.gstatic.com" rel="dns-prefetch">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700|Open+Sans" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<style>@import url('//fonts.googleapis.com/css2?family=Inter'); @font-face{src:url(https://fonts.gstatic.com/s/inter/v1/a.woff2)}</style>
</head>`;
    const out = throughOurFonts(page);
    expect(out).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(out).not.toMatch(/preconnect|dns-prefetch/);
    expect(out).toContain(`${APP_ORIGIN}/api/gfonts/css2?family=Playfair+Display:wght@700&display=swap`);
    expect(out).toContain(`${APP_ORIGIN}/api/gfonts/css?family=Roboto:400,700|Open+Sans`);
    expect(out).toContain(`${APP_ORIGIN}/api/gfonts/icon?family=Material+Icons`);
    expect(out).toContain(`url('${APP_ORIGIN}/api/gfonts/css2?family=Inter')`);
    expect(out).toContain(`url(${APP_ORIGIN}/gstatic/s/inter/v1/a.woff2)`);
  });

  it("leaves pages without Google Fonts alone", () => {
    const page = `<link rel="preconnect" href="https://cdnjs.cloudflare.com"><p>fonts.googleapis.com is a host</p>`;
    expect(throughOurFonts(page)).toBe(page);
  });

  it("the page CSP allows our stylesheets, not Google's, and the preview is rewritten", () => {
    expect(PAGE_CSP).toContain(`style-src 'unsafe-inline' ${APP_ORIGIN}`);
    expect(PAGE_CSP).not.toContain("fonts.googleapis.com");
    expect(previewDoc(`<head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head>`)).not.toContain("fonts.googleapis.com");
  });
});
