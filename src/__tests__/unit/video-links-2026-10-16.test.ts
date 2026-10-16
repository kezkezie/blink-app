import { describe, expect, it } from "vitest";
import { videoKindOf, videoLinkProblem } from "@/lib/video-inspo/links";

/** Video Inspo links (2026-10-16): app links get the steps; other links must be real video files. */
describe("video inspo links", () => {
  it("answers app links with how to save the video", () => {
    for (const [url, app] of [
      ["https://www.pinterest.com/pin/701928429330859692/", "pinterest"],
      ["https://pin.it/3xAmPle", "pinterest"],
      ["https://za.pinterest.com/pin/123/", "pinterest"],
      ["https://www.tiktok.com/@kasi/video/1", "tiktok"],
      ["https://vt.tiktok.com/ZSgJT1nBP/", "tiktok"],
      ["https://www.instagram.com/reel/abc/", "instagram"],
      ["https://youtu.be/xyz", "youtube"],
      ["https://fb.watch/abc", "facebook"],
    ] as const) {
      const p = videoLinkProblem(url);
      expect(p?.app, url).toBe(app);
    }
    expect(videoLinkProblem("https://pin.it/x")!.message).toMatch(/Pinterest app/);
  });

  it("lets real file links through and refuses junk", () => {
    expect(videoLinkProblem("https://cdn.example.com/ads/soda.mp4")).toBeNull();
    expect(videoLinkProblem("https://notpinterest.com.evil.example/v.mp4")).toBeNull();
    expect(videoLinkProblem("http://cdn.example.com/a.mp4")?.message).toMatch(/https/);
    expect(videoLinkProblem("not a link")?.message).toMatch(/https/);
  });

  it("knows a video file from its first bytes", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...Array.from("ftypisom").map((c) => c.charCodeAt(0))]);
    const mov = new Uint8Array([0, 0, 0, 0x14, ...Array.from("ftypqt  ").map((c) => c.charCodeAt(0))]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    const html = new Uint8Array(Array.from("<!DOCTYPE html>").map((c) => c.charCodeAt(0)));
    expect(videoKindOf(mp4)).toEqual({ ext: "mp4", type: "video/mp4" });
    expect(videoKindOf(mov)).toEqual({ ext: "mov", type: "video/quicktime" });
    expect(videoKindOf(webm)).toEqual({ ext: "webm", type: "video/webm" });
    expect(videoKindOf(html)).toBeNull();
  });
});
