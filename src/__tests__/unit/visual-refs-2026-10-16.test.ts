import { describe, expect, it } from "vitest";
import { directionFor, imageTypeOf, previewImageFrom, validateDirection, validatePages, validateVisualRefs, type VisualRef } from "@/lib/visual-refs";
import { buildGeneratePrompt } from "@/lib/generate-prompt";

/** Visual references (2026-10-16): pages checked, pictures found, art direction per look. */
const ref = (n: number, look: VisualRef["look"] = "studio"): VisualRef => ({ url: `https://studio.example/work/${n}`, image: `https://cdn.example/${n}.jpg`, source: "studio.example", title: `Ref ${n}`, why: "one clear light", look });

describe("reference pages", () => {
  it("keeps real pages and drops stock, protected sites, boards and duplicates", () => {
    const pages = validatePages({ pages: [
      { url: "https://www.pinterest.com/pin/232216924521971360/", title: "Pink oyster", why: "texture", look: "studio" },
      { url: "https://www.pinterest.com/ideas/organic-food-ads/929559111995/", title: "board" },
      { url: "https://www.behance.net/gallery/1/x", title: "blocked" },
      { url: "https://dribbble.com/shots/1", title: "blocked" },
      { url: "https://www.shutterstock.com/image-photo/1", title: "stock" },
      { url: "http://insecure.example/a", title: "http" },
      { url: "https://www.thisjanuary.com/work/mistercaps-branding", title: "Mistercaps", look: "poster" },
      { url: "https://www.thisjanuary.com/work/mistercaps-branding/", title: "dup" },
      { url: "https://farm.example/blog", title: "Harvest", look: "nonsense" },
    ] });
    expect(pages.map((p) => p.title)).toEqual(["Pink oyster", "Mistercaps", "Harvest"]);
    expect(pages[2].look).toBe("poster");
    expect(validatePages(null)).toEqual([]);
  });

  it("finds a page's preview picture in any attribute order and makes it absolute", () => {
    expect(previewImageFrom('<head><meta content="/img/a.jpg" property="og:image"></head>', "https://brand.example/p/1")).toBe("https://brand.example/img/a.jpg");
    expect(previewImageFrom('<meta name="twitter:image" content="https://cdn.example/t.png">', "https://x.example")).toBe("https://cdn.example/t.png");
    expect(previewImageFrom('<meta property="og:image:secure_url" content="https://cdn.example/s.jpg"><meta property="og:image" content="http://cdn.example/s.jpg">', "https://x.example")).toBe("https://cdn.example/s.jpg");
    expect(previewImageFrom('<link rel="image_src" href="/i.webp">', "https://x.example/a/")).toBe("https://x.example/i.webp");
    expect(previewImageFrom("<p>no picture</p>", "https://x.example")).toBeNull();
  });

  it("knows a picture from its first bytes", () => {
    expect(imageTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(imageTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(imageTypeOf(new Uint8Array([...Array.from("RIFF").map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from("WEBP").map((c) => c.charCodeAt(0))]))).toBe("image/webp");
    expect(imageTypeOf(new Uint8Array(Array.from("<!DOCTYPE html>").map((c) => c.charCodeAt(0))))).toBeNull();
  });
});

describe("art direction", () => {
  it("keeps concrete direction per look and the references judged good", () => {
    const refs = [ref(1), ref(2, "lifestyle"), ref(3, "poster")];
    const d = validateDirection({ direction: { studio: "A cluster on a seamless warm-grey sweep, soft side light, 100mm lens, generous negative space.", lifestyle: "too short", plain: "ignored here entirely because plain is not a look" }, notes: "One light, simple ground.", keep: [1, 3, 9, 1] }, refs)!;
    expect(Object.keys(d.direction)).toEqual(["studio"]);
    expect(d.refs.map((r) => r.title)).toEqual(["Ref 1", "Ref 3"]);
    expect(validateDirection({ direction: {} }, refs)).toBeNull();
    expect(validateDirection({ direction: { poster: "Bold monochrome poster with one sculptural cluster and a small wordmark band." } }, refs)!.refs).toHaveLength(3);
  });

  it("round-trips the stored board and gives Generate one line for the look", () => {
    const stored = { refs: [ref(1), { image: "javascript:alert(1)", url: "https://x" }], direction: { poster: "Monochrome sculptural poster, one cluster lit from the side, small wordmark band at the bottom." }, notes: "n", at: "2026-10-16T00:00:00Z" };
    const v = validateVisualRefs(stored)!;
    expect(v.refs).toHaveLength(1);
    expect(directionFor(v, "poster")).toMatch(/^Art direction from strong work in this category \(1 references, follow the craft, never copy\): Monochrome/);
    expect(directionFor(v, "studio")).toBe("");
    expect(directionFor(v, "plain")).toBe("");
    const p = buildGeneratePrompt({ brief: "Weekly availability", look: "poster", logo: false, products: 0, visual: v });
    expect(p).toContain("Art direction from strong work in this category");
    expect(buildGeneratePrompt({ brief: "Weekly availability", look: "plain", logo: false, products: 0, visual: v })).not.toContain("Art direction");
  });
});
