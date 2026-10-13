import { describe, expect, it } from "vitest";
import { imageSize, imageUpscaleCredits, mp4Duration, videoUpscaleCredits } from "@/lib/upscale";

/** Upscaler (2026-10-13): prices from the real file, measured against Replicate's Topaz bills. */
describe("prices", () => {
  it("pictures: $0.05 up to 24 MP (10 credits), more above, refused past 96 MP", () => {
    expect(imageUpscaleCredits(1080, 1350, 2)).toBe(10); // 5.8 MP
    expect(imageUpscaleCredits(1080, 1350, 4)).toBe(10); // 23.3 MP
    expect(imageUpscaleCredits(2048, 2048, 4)).toBe(40); // 67 MP: the $0.20 tier
    expect(imageUpscaleCredits(1600, 1600, 4)).toBe(20); // 41 MP
    expect(imageUpscaleCredits(3000, 3000, 4)).toBeNull(); // 144 MP
  });

  it("videos: per started second, 1080p 10, 4K 20 (a 5 s clip billed 3 and 6 units)", () => {
    expect(videoUpscaleCredits(5.042, "1080p")).toBe(60);
    expect(videoUpscaleCredits(5, "1080p")).toBe(50);
    expect(videoUpscaleCredits(5, "4k")).toBe(100);
    expect(videoUpscaleCredits(0.4, "1080p")).toBe(10);
  });
});

describe("reading sizes from the file", () => {
  it("PNG", () => {
    const b = new Uint8Array(32);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    b.set([0, 0, 0x04, 0x38, 0, 0, 0x05, 0x46], 16); // 1080 x 1350
    expect(imageSize(b)).toEqual({ width: 1080, height: 1350 });
  });

  it("JPEG, past an APP0 segment to the frame header", () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03, 0, 0, 0, 0]);
    expect(imageSize(b)).toEqual({ width: 1080, height: 1350 });
  });

  it("WebP (VP8X)", () => {
    const b = new Uint8Array(32);
    b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    b.set([0x37, 0x04, 0x00, 0x45, 0x05, 0x00], 24); // 1080 x 1350, stored minus one
    expect(imageSize(b)).toEqual({ width: 1080, height: 1350 });
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  /** A minimal MP4: ftyp, then (optionally) mdat before moov > mvhd(timescale, duration). */
  function mp4(timescale: number, duration: number, moovLast = false, v1 = false) {
    const box = (type: string, body: number[]) => { const size = 8 + body.length; return [size >>> 24, (size >> 16) & 255, (size >> 8) & 255, size & 255, ...[...type].map((c) => c.charCodeAt(0)), ...body]; };
    const u32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    const mvhd = v1
      ? box("mvhd", [1, 0, 0, 0, ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(timescale), ...u32(0), ...u32(duration), ...new Array(80).fill(0)])
      : box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration), ...new Array(80).fill(0)]);
    const moov = box("moov", mvhd);
    const ftyp = box("ftyp", [...[..."isom"].map((c) => c.charCodeAt(0)), 0, 0, 2, 0]);
    const mdat = box("mdat", new Array(64).fill(7));
    return new Uint8Array(moovLast ? [...ftyp, ...mdat, ...moov] : [...ftyp, ...moov, ...mdat]);
  }

  it("MP4 duration, wherever the movie header sits, version 0 and 1", () => {
    expect(mp4Duration(mp4(1000, 5042))).toBeCloseTo(5.042);
    expect(mp4Duration(mp4(600, 6000, true))).toBe(10);
    expect(mp4Duration(mp4(90000, 450000, true, true))).toBe(5);
    expect(mp4Duration(new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]))).toBeNull();
  });
});
