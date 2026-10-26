import { describe, expect, it } from "vitest";
import {
  MATCH_NEEDS_PICKS, PAGE_CSP, PUBLISHED_CSP, SITE_LOOKS, SLUG, applyEdits, brandLinks, checkHtml, cleanSlug, codeUserPrompt, downloadName, extractHtml, fillImages, lookOf, pageTitle, previewDoc, webImage,
  type BrandForCode,
} from "@/lib/sites/code";
import { MAX_SITES_YOU_LIKE, cleanSiteAddress, cleanSiteList, validatePatterns, validateSiteRefs } from "@/lib/sites/site-refs";

/** Website studio (2026-10-16): one-file pages, edit blocks, sandboxed preview, website research. */
const page = `<!doctype html>
<html lang="en">
<head>
  <title>Kasi Kicks</title>
</head>
<body>
  <header class="top"><a href="#shop">Shop</a></header>
  <h1>Fresh kicks</h1>
  <img src="{{img:2}}" alt="Sneaker">
  <img src="{{logo}}" alt="Logo">
</body>
</html>`;

const brand: BrandForCode = {
  name: "Kasi Kicks", brief: "Streetwear sneakers from Nairobi.", industry: "Streetwear",
  theme: { style: "bold", mode: "dark", primary: "#E4572E", secondary: "#14141A", accent: "#FFD23F", background: "#0E0E12", headingFont: "Space Grotesk", bodyFont: "Inter" },
  contact: { whatsapp: "+254 700 111 222", email: "hi@kasi.example", socials: ["https://instagram.com/kasikicks"] },
  products: [{ id: "p1", name: "Runner 01", price: 4500, currency: "KES" }],
  images: [{ id: "a", url: "https://res.cloudinary.com/x/image/upload/v1/a.jpg", caption: "Runner on concrete" }, { id: "b", url: "https://example.supabase.co/storage/v1/object/public/b.png", caption: "Team photo" }],
  logoUrl: "https://example.supabase.co/logo.png",
};

describe("website studio pages", () => {
  it("pulls the document out of a reply and checks it", () => {
    expect(extractHtml(`Here you go:\n\`\`\`html\n${page}\n\`\`\`\nEnjoy`)).toBe(page);
    expect(extractHtml("no page here")).toBeNull();
    const ok = checkHtml(page);
    expect(ok.ok && ok.html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    // The viewport goes in <head>, not in a <header> that comes first.
    expect(ok.ok && ok.html.indexOf("viewport")).toBeLessThan(ok.ok ? ok.html.indexOf("<header") : 0);
    expect(checkHtml("<div>hi</div>").ok).toBe(false);
    expect(checkHtml(page.replace("</html>", "")).ok).toBe(false);
    expect(checkHtml(`<!doctype html><html>${"x".repeat(400_001)}</html>`).ok).toBe(false);
    expect(pageTitle(page)).toBe("Kasi Kicks");
  });

  it("puts the brand's real pictures where Claude wrote their numbers", () => {
    const filled = fillImages(page, brand.images, brand.logoUrl);
    expect(filled).toContain('src="https://example.supabase.co/storage/v1/object/public/b.png"');
    expect(filled).toContain('src="https://example.supabase.co/logo.png"');
    expect(fillImages('<img src="{{img:9}}">', brand.images, null)).toContain(webImage(brand.images[0].url));
    expect(fillImages('<img src="{{logo}}">', [], null)).toBe('<img src="">');
    expect(webImage("https://res.cloudinary.com/x/image/upload/v1/a.jpg")).toBe("https://res.cloudinary.com/x/image/upload/w_1600,c_limit,f_auto,q_auto/v1/a.jpg");
  });

  it("gives Claude the brand, its real links and the look", () => {
    const text = codeUserPrompt({ brand, look: "bold", brief: "launch the Runner 01", patterns: "- big hero" });
    expect(text).toContain("Runner 01, KES 4500");
    expect(text).toContain("WhatsApp: https://wa.me/254700111222?text=");
    expect(text).toContain("1. Runner on concrete");
    expect(text).toContain("Look: Bold:");
    expect(text).toContain("What the websites the owner likes do (follow their patterns, never copy their words, names or pictures)");
    expect(brandLinks({ ...brand, contact: {} })).toEqual([]);
    expect(lookOf("cinematic")).toBe("cinematic");
    expect(lookOf("<script>")).toBeNull();
  });

  it("applies edit blocks, exactly or ignoring indentation, and refuses ambiguous ones", () => {
    const one = applyEdits(page, "<<<<<<< FIND\n  <h1>Fresh kicks</h1>\n=======\n  <h1>Kicks that last</h1>\n>>>>>>> REPLACE");
    expect(one.ok && one.html).toContain("<h1>Kicks that last</h1>");
    const loose = applyEdits(page, "<<<<<<< FIND\n<h1>Fresh kicks</h1>\n<img src=\"{{img:2}}\" alt=\"Sneaker\">\n=======\n<h1>New</h1>\n>>>>>>> REPLACE");
    expect(loose.ok && loose.html).toContain("<h1>New</h1>");
    expect(loose.ok && loose.html).not.toContain("Sneaker");
    const removed = applyEdits(page, "<<<<<<< FIND\n  <img src=\"{{logo}}\" alt=\"Logo\">\n=======\n>>>>>>> REPLACE");
    expect(removed.ok && removed.html).not.toContain("{{logo}}");
    const twice = applyEdits(`${page}\n<p>a</p>\n<p>a</p>`, "<<<<<<< FIND\n<p>a</p>\n=======\n<p>b</p>\n>>>>>>> REPLACE");
    expect(twice.ok).toBe(false);
    expect(applyEdits(page, "I changed it!").ok).toBe(false);
  });

  it("runs every page sandboxed with no way to call out", () => {
    expect(PAGE_CSP).toContain("connect-src 'none'");
    expect(PAGE_CSP).toContain("form-action 'none'");
    expect(PAGE_CSP).toContain("script-src 'unsafe-inline' https://cdnjs.cloudflare.com");
    expect(PUBLISHED_CSP.startsWith("sandbox allow-scripts")).toBe(true);
    expect(PUBLISHED_CSP).not.toContain("allow-same-origin");
    expect(PUBLISHED_CSP).not.toContain("allow-forms");
    const doc = previewDoc(page);
    expect(doc.indexOf("Content-Security-Policy")).toBeGreaterThan(doc.indexOf("<head>"));
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<title>"));
    expect(previewDoc("<html><body>x</body></html>")).toContain("<html><head><meta http-equiv");
  });

  it("makes clean addresses and file names", () => {
    expect(cleanSlug("Kasi Kicks · Launch!")).toBe("kasi-kicks-launch");
    expect(SLUG.test("kasi-kicks")).toBe(true);
    expect(SLUG.test("-bad")).toBe(false);
    expect(SLUG.test("ab")).toBe(false);
    expect(downloadName("Kasi Kicks")).toBe("kasi-kicks.html");
    expect(downloadName("!!!")).toBe("website.html");
  });
});

describe("rebuilding a design the owner likes (2026-10-27: \"the exact website but with the brand colors and content\")", () => {
  it("tells Claude to rebuild it section by section, with the brand's own colours, words and pictures", () => {
    const text = codeUserPrompt({ brand, look: "match", inspiration: 3 });
    expect(text).toContain("Designs A to C");
    expect(text).toContain("the same sections in the same order");
    expect(text).toContain("the same hero composition");
    expect(text).toContain("Never copy their text, logos, brand names, prices or photos");
    expect(text).toContain("the designs win on layout, composition and section order");
    expect(codeUserPrompt({ brand, look: "minimal" })).toContain("Look: Minimal:");
  });
  it("offers Like my picks first, which needs something to follow", () => {
    expect(SITE_LOOKS[0]).toMatchObject({ id: "match", label: "Like my picks" });
    expect(lookOf("match")).toBe("match");
    expect(MATCH_NEEDS_PICKS).toMatch(/add one first/);
  });
});

describe("websites you like (2026-10-27: picked by the owner, never searched for them)", () => {
  it("takes addresses as people paste them and makes them https", () => {
    expect(cleanSiteAddress("stripe.com")).toEqual({ url: "https://stripe.com/", host: "stripe.com" });
    expect(cleanSiteAddress("  http://www.Kith.com/pages/about#top ")).toEqual({ url: "https://www.kith.com/pages/about", host: "kith.com" });
    expect(cleanSiteAddress("https://aimeleondore.com")).toEqual({ url: "https://aimeleondore.com/", host: "aimeleondore.com" });
  });

  it("refuses what isn't one brand's website", () => {
    for (const bad of ["", "not a site", "ftp://files.example.com", "http://192.168.1.10", "localhost:3000", "javascript:alert(1)"]) expect(cleanSiteAddress(bad)).toHaveProperty("error");
    for (const gallery of ["https://www.awwwards.com/sites/kith", "pinterest.com/pin/1", "https://www.instagram.com/kith"]) expect((cleanSiteAddress(gallery) as { error: string }).error).toMatch(/not a gallery or social page/);
  });

  it("keeps one per domain, up to the limit, and stops at the first bad one", () => {
    expect(cleanSiteList(["kith.com", "https://www.kith.com/shop", "stripe.com"])).toEqual({ sites: [{ url: "https://kith.com/", host: "kith.com" }, { url: "https://stripe.com/", host: "stripe.com" }] });
    expect(cleanSiteList(["kith.com", "nope"])).toHaveProperty("error");
    expect(cleanSiteList(Array.from({ length: MAX_SITES_YOU_LIKE + 1 }, (_, n) => `site${n}.com`))).toHaveProperty("error");
    expect(cleanSiteList([])).toEqual({ sites: [] });
  });

  it("keeps the patterns as short dashed lines", () => {
    expect(validatePatterns({ patterns: "1. Hero with one big product photo and a single CTA\n- Dark pages with one accent colour\n• Serif headlines with a clean sans body\nok" }))
      .toBe("- Hero with one big product photo and a single CTA\n- Dark pages with one accent colour\n- Serif headlines with a clean sans body");
    expect(validatePatterns({ patterns: "too short" })).toBeNull();
    // A long line ends on a whole word.
    const long = validatePatterns({ patterns: `- ${"Use only our own photography ".repeat(14)}\n- Dark pages with one accent colour\n- Serif headlines with a clean sans body` })!.split("\n")[0];
    expect(long.length).toBeLessThanOrEqual(323);
    expect(long).toMatch(/(own|only|Use|photography)…$/);
    const kept = validateSiteRefs({ sites: [{ url: "https://kith.com/", name: "Kith", host: "kith.com", dark: false, fonts: ["Inter"] }], patterns: "- a\n- b", at: "2026-10-16T00:00:00Z" });
    expect(kept?.sites[0].host).toBe("kith.com");
    expect(validateSiteRefs({ sites: [], patterns: "x" })).toBeNull();
    expect(kept?.picked).toBeUndefined(); // an older automatic find: not shown, not followed
    expect(validateSiteRefs({ sites: [{ url: "https://kith.com/", host: "kith.com" }], patterns: "- a", picked: true })?.picked).toBe(true);
  });
});
