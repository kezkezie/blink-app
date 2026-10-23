import { speedOf } from "./speed";

/**
 * Export settings for the video editor (2026-10-11): the canvas shape (16:9, 9:16 for Reels/TikTok,
 * 1:1), fit (letterbox) or fill (crop to the frame), and text that lands where the preview shows it.
 */
export type CanvasAspect = "16:9" | "9:16" | "1:1";
export type FitMode = "fit" | "fill";

export function canvasSize(aspect: CanvasAspect): { W: number; H: number } {
  return aspect === "9:16" ? { W: 1080, H: 1920 } : aspect === "1:1" ? { W: 1080, H: 1080 } : { W: 1920, H: 1080 };
}

/**
 * Scale one input to the canvas: letterboxed (fit) or cropped to fill. A clip with a speed
 * (2026-10-23, slow-mo) has its frames stretched first, so fps=30 then fills the slowed clip.
 */
export function normalizeFilter(index: number, W: number, H: number, fit: FitMode, speed = 1): string {
  const size = fit === "fill"
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const s = speedOf({ speed });
  const stretch = s === 1 ? "" : `setpts=${(1 / s).toFixed(4)}*(PTS-STARTPTS),`;
  return `[${index}:v]${stretch}${size},setsar=1,fps=30,format=yuv420p[v${index}]`;
}

export type ExportText = { text: string; x: number; y: number; fontSize: number; color: string; timelineStart: number; trimStart: number; trimEnd: number; style?: "plain" | "caption" };

/**
 * One drawtext filter. Font sizes are "pixels on a 960-wide preview" (so 1920 wide doubles them, as
 * before); the text is centred on its point, the way the preview draws it; captions get an outline.
 */
export function drawtextFilter(layer: ExportText, W: number): string {
  const start = layer.timelineStart;
  const end = layer.timelineStart + (layer.trimEnd - layer.trimStart);
  const size = Math.round(layer.fontSize * (W / 960));
  const safeText = layer.text.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
  const outline = layer.style === "caption" ? `:borderw=${Math.max(2, Math.round(size / 12))}:bordercolor=black` : "";
  return `drawtext=fontfile=font.ttf:text='${safeText}':fontcolor=${layer.color || "white"}:fontsize=${size}${outline}:x=(w*${layer.x}/100)-text_w/2:y=(h*${layer.y}/100)-text_h/2:enable='between(t,${start},${end})'`;
}

/** A Cloudinary frame at a time, for timeline filmstrips (undefined for other hosts). */
export function frameAt(url: string, seconds: number, height = 64): string | undefined {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return undefined;
  return url.replace("/video/upload/", `/video/upload/so_${Math.max(0, seconds).toFixed(1)},h_${height},c_fill,q_auto,f_jpg/`).replace(/\.(mp4|mov|webm)(\?.*)?$/i, ".jpg$2");
}

/**
 * A clip on a row above V1, laid over the video (2026-10-15, for see-through motion graphics: the
 * export used to string every clip one after another, so the preview's layers didn't survive).
 * Fitted to the canvas with a transparent surround, placed at its timeline time, faded by its opacity.
 */
export function overlayFilter(index: number, W: number, H: number, fit: FitMode, start: number, opacity = 100, speed = 1): string {
  const size = fit === "fill"
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
  const fade = opacity < 100 ? `,colorchannelmixer=aa=${(Math.max(0, opacity) / 100).toFixed(2)}` : "";
  const s = speedOf({ speed });
  const pts = s === 1 ? "PTS-STARTPTS" : `${(1 / s).toFixed(4)}*(PTS-STARTPTS)`;
  return `[${index}:v]format=yuva420p,${size},setsar=1,fps=30${fade},setpts=${pts}+${start}/TB[ov${index}]`;
}

/** Lay one overlay onto the running picture between its start and end. */
export function overlayStep(input: string, index: number, start: number, end: number, out: string): string {
  return `${input}[ov${index}]overlay=0:0:enable='between(t,${start},${end})':eof_action=pass[${out}]`;
}

/**
 * VP8 or VP9, read from a WebM's header ("V_VP8" / "V_VP9"), so its transparency is decoded:
 * ffmpeg's own VP8/VP9 decoders drop the alpha channel; libvpx keeps it.
 */
export function webmDecoder(bytes: Uint8Array): "libvpx" | "libvpx-vp9" | null {
  if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return null;
  const head = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 4096)));
  return head.includes("V_VP9") ? "libvpx-vp9" : head.includes("V_VP8") ? "libvpx" : null;
}
