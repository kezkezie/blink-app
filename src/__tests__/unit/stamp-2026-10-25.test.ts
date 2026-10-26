// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));

import { isStampedUrl, needsStamp, stampBox, stampPending } from "@/lib/stamp";
import { stampImageBytes } from "@/lib/stamp-server";
import { stampVideoBytes } from "@/lib/stamp-video-server";
import { consentRecord, LEGAL_VERSION, agreedToTerms } from "@/lib/legal";

/** A plain grey picture (so any stamp shows as a change in the corner). */
const grey = (w: number, h: number, format: "png" | "jpeg") => sharp({ create: { width: w, height: h, channels: 3, background: "#808080" } })[format]().toBuffer();
const pixel = async (buf: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};

describe("the BlinkSpot stamp (2026-10-25)", () => {
  it("is for the free plan only", () => {
    expect(needsStamp("free")).toBe(true);
    expect(needsStamp(null)).toBe(true);
    expect(needsStamp(undefined)).toBe(true);
    for (const p of ["starter", "pro", "agency", "enterprise"]) expect(needsStamp(p)).toBe(false);
  });

  it("sits in the bottom-right corner at about a quarter of the width", () => {
    const b = stampBox(1080, 1350);
    expect(b.width).toBe(281);
    expect(b.left + b.width).toBe(1080 - 32);
    expect(b.top + b.height).toBe(1350 - 32);
    const wide = stampBox(1920, 1080);
    // Landscape: sized from the height, so it stays modest on wide video (about 18% of 1920).
    expect(wide.width).toBe(351);
    const tiny = stampBox(200, 200);
    expect(tiny.width).toBeLessThanOrEqual(100);
    expect(tiny.left).toBeGreaterThanOrEqual(0);
  });

  it("knows a stamped copy, and a job that's still waiting for its stamp", () => {
    expect(isStampedUrl("https://x.supabase.co/storage/v1/object/public/assets/images/c/stamped_1_ab.png")).toBe(true);
    expect(isStampedUrl("https://x.supabase.co/storage/v1/object/public/assets/images/c/stamped_seamless_1.jpg?v=2")).toBe(true);
    expect(isStampedUrl("https://res.cloudinary.com/x/image/upload/v1/gen_1.png")).toBe(false);
    expect(isStampedUrl("https://x/stamped_dir/gen.png")).toBe(false);
    expect(stampPending({ stamp: true }, ["https://x/gen.png"])).toBe(true);
    expect(stampPending({ stamp: true, stamp_state: "running" }, ["https://x/gen.png"])).toBe(true);
    expect(stampPending({ stamp: true, stamp_state: "failed" }, ["https://x/gen.png"])).toBe(false);
    expect(stampPending({ stamp: true }, ["https://x/stamped_1.png"])).toBe(false);
    expect(stampPending({}, ["https://x/gen.png"])).toBe(false);
    expect(stampPending({ stamp: true }, [])).toBe(false);
  });

  it("burns into a picture's corner and keeps its size and format", async () => {
    const png = await stampImageBytes(await grey(1080, 1350, "png"));
    expect(png.type).toBe("image/png");
    const meta = await sharp(png.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1350]);
    const b = stampBox(1080, 1350);
    // Inside the pill (dark) it changed; the top-left corner of the picture didn't.
    const inPill = await pixel(png.bytes, b.left + Math.round(b.width * 0.6), b.top + Math.round(b.height / 2));
    expect(inPill.every((c, i) => Math.abs(c - [128, 128, 128][i]) > 20)).toBe(true);
    expect(await pixel(png.bytes, 10, 10)).toEqual([128, 128, 128]);
    const jpg = await stampImageBytes(await grey(800, 600, "jpeg"));
    expect(jpg.type).toBe("image/jpeg");
  });

  it("lays over a whole video and keeps the sound", async () => {
    const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
    const dir = mkdtempSync(path.join(tmpdir(), "stamp-test-"));
    const src = path.join(dir, "in.mp4");
    execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=640x360:d=2:r=24", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src]);
    const out = await stampVideoBytes(readFileSync(src));
    const dst = path.join(dir, "out.mp4");
    writeFileSync(dst, out);
    const info = (() => { try { execFileSync(ffmpeg, ["-hide_banner", "-i", dst]); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? ""); } })();
    expect(info).toMatch(/Video: h264[^\n]*640x360/);
    expect(info).toMatch(/Audio: aac/);
    // The last frame has the stamp in its corner.
    const frame = path.join(dir, "last.png");
    execFileSync(ffmpeg, ["-v", "error", "-sseof", "-0.2", "-i", dst, "-frames:v", "1", frame]);
    const b = stampBox(640, 360);
    const px = await pixel(readFileSync(frame), b.left + Math.round(b.width * 0.6), b.top + Math.round(b.height / 2));
    expect(px.some((c) => Math.abs(c - 128) > 20)).toBe(true);
  }, 60_000);
});

describe("the agreement at sign-up (2026-10-25)", () => {
  it("records when and which versions", () => {
    const r = consentRecord(new Date("2026-10-25T08:00:00Z"));
    expect(r).toEqual({ terms_accepted_at: "2026-10-25T08:00:00.000Z", terms_version: LEGAL_VERSION });
    expect(LEGAL_VERSION).toBe("terms@2026-10-26,privacy@2026-10-26,acceptable-use@2026-10-26");
    expect(agreedToTerms(true)).toBe(true);
    for (const v of [false, "true", 1, undefined, null]) expect(agreedToTerms(v)).toBe(false);
  });
});
