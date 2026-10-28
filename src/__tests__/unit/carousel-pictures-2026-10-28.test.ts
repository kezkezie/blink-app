import { describe, expect, it } from "vitest";
import { coverRect, slideSizeLike, wholeRect } from "@/lib/carousel";
import { picturesOf } from "@/components/studio/media";
import { pictureLimit, picturesTrimmed, trimmedLine } from "@/lib/social-media-rules";

/** Separate pictures made into one carousel post (Kezie, 2026-10-28). */
describe("carousel from pictures", () => {
  it("a tall poster shown whole on a 4:5 slide keeps every pixel, centred", () => {
    // 1080×1920 (9:16) on 1080×1350: scaled to fit the height, side bands left and right.
    const d = wholeRect(1080, 1920, 1080, 1350);
    expect(d.dh).toBe(1350);
    expect(d.dw).toBe(759);
    expect(d.dx).toBe(Math.round((1080 - 759) / 2));
    expect(d.dy).toBe(0);
    // A wide photo: bands top and bottom.
    const wide = wholeRect(1600, 900, 1080, 1080);
    expect(wide).toEqual({ dx: 0, dy: 236, dw: 1080, dh: 608 });
  });

  it("filling crops the middle, at the slide's shape", () => {
    const r = coverRect(1080, 1920, 1080, 1350);
    expect(r.sw).toBe(1080);
    expect(r.sh).toBe(1350);
    expect(r.sy).toBe(285);
    expect(r.sx).toBe(0);
    const sq = coverRect(2000, 1000, 1080, 1080);
    expect(sq).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it("a slide added on the post page takes the cover's shape, within 16:9 and 9:16", () => {
    expect(slideSizeLike(1080, 1350)).toEqual({ w: 1080, h: 1350 });
    expect(slideSizeLike(2048, 2048)).toEqual({ w: 1080, h: 1080 });
    expect(slideSizeLike(500, 3000)).toEqual({ w: 1080, h: 1920 });
    expect(slideSizeLike(4000, 1000)).toEqual({ w: 1080, h: 608 });
  });

  it("a post's pictures: a carousel's slides in order, one picture, or none for a video", () => {
    expect(picturesOf({ image_urls: ["https://a/1.jpg", "https://a/2.jpg"], video_urls: null, reference_image_url: null })).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
    // Older rows keep image_urls as a JSON string, or none at all.
    type Row = Parameters<typeof picturesOf>[0];
    expect(picturesOf({ image_urls: JSON.stringify(["https://a/1.jpg"]), video_urls: null, reference_image_url: null } as unknown as Row)).toEqual(["https://a/1.jpg"]);
    expect(picturesOf({ image_urls: null, video_urls: null, reference_image_url: "https://a/ref.jpg" } as unknown as Row)).toEqual(["https://a/ref.jpg"]);
    expect(picturesOf({ image_urls: ["https://a/cover.jpg"], video_urls: ["https://res.cloudinary.com/x/video/upload/v1/clip.mp4"], reference_image_url: null })).toEqual([]);
  });

  it("each network gets what it takes, and says so", () => {
    expect(pictureLimit("instagram")).toBe(10);
    expect(pictureLimit("twitter")).toBe(4);
    expect(picturesTrimmed(["instagram", "twitter", "pinterest", "youtube"], 6)).toEqual([{ platform: "twitter", keeps: 4 }, { platform: "pinterest", keeps: 1 }]);
    expect(picturesTrimmed(["twitter"], 3)).toEqual([]);
    expect(trimmedLine([{ platform: "twitter", keeps: 4 }, { platform: "pinterest", keeps: 1 }], (p) => ({ twitter: "X", pinterest: "Pinterest" })[p] ?? p))
      .toBe("X takes up to 4 pictures, so it gets the first 4; Pinterest takes one picture, so it gets the first.");
  });
});
