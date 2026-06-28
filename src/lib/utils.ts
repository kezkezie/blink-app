import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Derives a still poster image (JPG) from a Cloudinary VIDEO url so that
 * <video> thumbnails paint a real frame instead of rendering black.
 *
 * A raw <video preload="metadata"> with no `poster` shows a black box in most
 * browsers until it is played, which is why generated story-sequence clips look
 * "missing" in the content grid and editor. Cloudinary can render a frame of any
 * uploaded video as an image by inserting a transformation (`so_0` = second 0)
 * and swapping the extension to `.jpg`.
 *
 * Returns `undefined` for anything that isn't a Cloudinary video upload, so the
 * caller can safely spread it onto the `poster` attribute.
 */
export function cloudinaryVideoPoster(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return undefined;

  // Insert the frame-grab transformation right after `/upload/`
  const withTransform = url.replace(
    "/video/upload/",
    "/video/upload/so_0,c_fill,q_auto,f_jpg/"
  );
  // Swap the video extension for .jpg so Cloudinary returns an image
  return withTransform.replace(/\.(mp4|mov|webm)(\?.*)?$/i, ".jpg$2");
}

/**
 * Returns a browser-streamable delivery URL for a Cloudinary VIDEO.
 *
 * The raw uploaded file often has its moov atom at the END (no "faststart"),
 * which means a browser must download the whole clip before it can play — the
 * tell-tale "it only plays after I download it" symptom. Requesting any DERIVED
 * (transformed) delivery makes Cloudinary re-mux with the moov atom at the front
 * and pick a web-optimal codec, so it streams progressively. `f_auto,q_auto`
 * also shrinks the file (smaller, faster start) without quality loss.
 *
 * Non-Cloudinary-video URLs are returned unchanged.
 */
export function cloudinaryStreamUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return url || "";
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return url;
  if (url.includes("/video/upload/f_") || url.includes("/video/upload/q_")) return url; // already transformed
  return url.replace("/video/upload/", "/video/upload/f_auto,q_auto/");
}
