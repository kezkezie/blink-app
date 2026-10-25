import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isStampedUrl, stampBox } from "@/lib/stamp";
import { saveStamped, stampPng } from "@/lib/stamp-server";

/**
 * The stamp on videos (lib/stamp.ts): ffmpeg (ffmpeg-static) lays the stamp over every frame and
 * keeps the sound. Only the /api/stamp function imports this, so only it carries the binary
 * (next.config.ts outputFileTracingIncludes).
 */
const run = promisify(execFile);

/** The ffmpeg binary (ffmpeg-static), or null where it isn't there. */
async function ffmpegPath(): Promise<string | null> {
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null } | string;
    const p = typeof mod === "string" ? mod : mod.default ?? null;
    return p || null;
  } catch { return null; }
}

/** A video with the stamp in its corner for its whole length; the sound is kept as it is. */
export async function stampVideoBytes(bytes: Uint8Array): Promise<Buffer> {
  const ffmpeg = await ffmpegPath();
  if (!ffmpeg) throw new Error("ffmpeg isn't available");
  const dir = await mkdtemp(path.join(tmpdir(), "stamp-"));
  try {
    const input = path.join(dir, "in.mp4"), mark = path.join(dir, "stamp.png"), output = path.join(dir, "out.mp4");
    await writeFile(input, bytes);
    // The frame size, from ffmpeg's own description of the file (ffmpeg exits 1 with no output: expected).
    const probe = await run(ffmpeg, ["-hide_banner", "-i", input], { maxBuffer: 4_000_000 }).then((r) => r.stderr, (e: { stderr?: string }) => e.stderr ?? "");
    const size = /Stream #\d+:\d+[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(probe);
    if (!size) throw new Error("couldn't read the video's size");
    let w = Number(size[1]), h = Number(size[2]);
    if (/rotate\s*:\s*-?(90|270)|displaymatrix: rotation of -?(90|270)/.test(probe)) [w, h] = [h, w];
    const box = stampBox(w, h);
    await writeFile(mark, await sharp(stampPng()).resize({ width: box.width, height: box.height, fit: "fill" }).png().toBuffer());
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-i", mark,
      "-filter_complex", `[0:v][1:v]overlay=${box.left}:${box.top}:format=auto,format=yuv420p[v]`,
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", output,
    ], { timeout: 240_000, maxBuffer: 8_000_000 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** A stamped copy of a video at a URL (or the URL itself if it is one already). */
export async function stampVideoUrl(url: string, clientId: string): Promise<string> {
  if (isStampedUrl(url)) return url;
  const got = await safeFetchBytes(url, { maxBytes: 200_000_000, timeoutMs: 90_000 });
  if (!got.ok) throw new Error(`fetch: ${got.reason}`);
  return saveStamped(clientId, "videos", await stampVideoBytes(got.bytes), "video/mp4", "mp4");
}

