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
