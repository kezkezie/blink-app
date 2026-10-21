import { describe, expect, it } from "vitest";
import { keyframePrompt } from "@/lib/video-inspo/keyframe";

/** First frames for Video Inspo, shot by shot (2026-10-22): no words get in, by name, quote or link. */
const base = { brand: "NUF FARMS", industry: "Agriculture", description: "Container mushroom farm in Kiambu.", colours: ["#1F1D1B", "#9C9A96"], motion: true, products: 0 };

describe("keyframePrompt", () => {
  it("never names the brand, quotes words or carries a link", () => {
    const p = keyframePrompt({ ...base, what: "A closing card: NUF FARMS crate under the sun, saying 'Picked today' and nuffarms.com, www.nuffarms.com/order", cast: "a NUF FARMS farmer in a green apron" });
    expect(p).not.toMatch(/NUF FARMS|Nuf Farms/i);
    expect(p).not.toContain("Picked today");
    expect(p).not.toMatch(/nuffarms\.com|www\./);
    expect(p).not.toContain("Kiambu");
    expect(p).toContain("Container mushroom farm in.");
    expect(p).toMatch(/^This frame has NO text/);
    expect(p).toContain("the business crate under the sun");
    expect(p).toContain("a the business farmer in a green apron");
  });
  it("keeps the layout, the animated look and the brand colours", () => {
    const p = keyframePrompt({ ...base, what: "A sun rises behind a hill", products: 2 });
    expect(p).toContain("flat animated style");
    expect(p).toContain("Images 2 to 3 are the business's real products");
    expect(p).toContain("#1F1D1B and #9C9A96");
    expect(p).toContain("a person who fits this business");
  });
});
