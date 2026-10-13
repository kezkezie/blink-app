/**
 * Upscaler (Kezie, 2026-10-13: "an upscaler for both images and videos"). Topaz on Replicate:
 * images 2x / 4x (priced by output megapixels, $0.05 up to 24 MP), videos to 1080p or 4K
 * (priced per second). Charged at the usual 200 credits per provider dollar, before the run, and
 * refunded if it fails. Pure helpers here: prices, and reading sizes from file headers so the
 * server never trusts the browser about how big or long a file is.
 */
export type UpscaleImageFactor = 2 | 4;
export type UpscaleVideoTarget = "1080p" | "4k";

/** Replicate's Topaz image tiers (output megapixels → dollars). */
const IMAGE_TIERS: Array<[number, number]> = [[24, 0.05], [48, 0.10], [60, 0.15], [96, 0.20]];
export const MAX_IMAGE_OUTPUT_MP = 96;

/** Credits for an image upscale, from the input size; null when the result would be too big. */
export function imageUpscaleCredits(width: number, height: number, factor: UpscaleImageFactor) {
  const mp = (width * factor * height * factor) / 1e6;
  const tier = IMAGE_TIERS.find(([max]) => mp <= max);
  return tier ? Math.round(tier[1] * 200) : null;
}

/** Credits per second of video, by target (Replicate Topaz video). */
export const VIDEO_CREDITS_PER_SECOND: Record<UpscaleVideoTarget, number> = { "1080p": 10, "4k": 20 };
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export function videoUpscaleCredits(seconds: number, target: UpscaleVideoTarget) {
  return Math.max(VIDEO_CREDITS_PER_SECOND[target], Math.ceil(seconds) * VIDEO_CREDITS_PER_SECOND[target]);
}

/** Width and height of a PNG, JPEG or WebP from its first bytes; null if it isn't one of those. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: u32(16), height: u32(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16(i + 2);
      // SOF0-SOF15 (not DHT C4, JPG C8, DAC CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === "VP8 ") return { width: ((b[27] << 8) | b[26]) & 0x3fff, height: ((b[29] << 8) | b[28]) & 0x3fff };
    if (kind === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

/** Duration in seconds of an MP4/MOV from its movie header (mvhd), wherever moov sits; null if not found. */
export function mp4Duration(b: Uint8Array): number | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const type = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const walk = (start: number, end: number): number | null => {
    let i = start;
    while (i + 8 <= end) {
      let size = u32(i);
      const t = type(i + 4);
      let header = 8;
      if (size === 1) { size = u32(i + 8) * 2 ** 32 + u32(i + 12); header = 16; }
      else if (size === 0) size = end - i;
      if (size < header || i + size > end + 8) return null;
      if (t === "moov") return walk(i + header, Math.min(end, i + size));
      if (t === "mvhd") {
        const v = b[i + header];
        const p = i + header + 4;
        if (v === 1) { const scale = u32(p + 16); const dur = u32(p + 20) * 2 ** 32 + u32(p + 24); return scale ? dur / scale : null; }
        const scale = u32(p + 8); const dur = u32(p + 12);
        return scale ? dur / scale : null;
      }
      i += size;
    }
    return null;
  };
  return walk(0, b.length);
}
