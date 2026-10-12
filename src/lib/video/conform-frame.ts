"use client";

import { supabase } from "@/lib/supabase";

/**
 * QA-014 (2026-10-12): Pruna (and Seedance from a first frame) makes the video in the start photo's
 * own shape, so a portrait photo gave a portrait video even with 16:9 picked. Before a render the
 * start frame is fitted to the chosen shape: the whole photo stays in view, on a soft blurred copy
 * of itself, so nothing is cropped off the product. Within 3% of the shape it is left alone.
 */
export function shapeOf(aspect: string): number | null {
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

export function needsConform(width: number, height: number, aspect: string, tolerance = 0.03): boolean {
  const target = shapeOf(aspect);
  if (!target || !width || !height) return false;
  return Math.abs(width / height - target) / target > tolerance;
}

/** Cloudinary does the fitting in the URL (pad to the shape on a blurred copy). Null for other hosts. */
export function cloudinaryConformUrl(url: string, aspect: string): string | null {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/") || !shapeOf(aspect)) return null;
  const [w, h] = aspect.split(":");
  return url.replace("/image/upload/", `/image/upload/c_pad,ar_${w}:${h},b_blurred:400:15,q_auto:good,f_jpg/`);
}

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** The start frame in the chosen shape (the same URL if it already fits or can't be read). */
export async function conformFrame(url: string | null | undefined, aspect: string, clientId: string): Promise<string | null> {
  if (!url) return url ?? null;
  try {
    const probe = await loadImage(url, false);
    if (!needsConform(probe.naturalWidth, probe.naturalHeight, aspect)) return url;
    const viaCloudinary = cloudinaryConformUrl(url, aspect);
    if (viaCloudinary) return viaCloudinary;

    const target = shapeOf(aspect)!;
    const img = await loadImage(url, true);
    const long = Math.min(1920, Math.max(img.naturalWidth, img.naturalHeight));
    const W = target >= 1 ? long : Math.round(long * target);
    const H = target >= 1 ? Math.round(long / target) : long;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    // Blurred, darkened cover behind; the whole photo on top.
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    g.filter = "blur(40px) brightness(0.8)";
    g.drawImage(img, (W - img.naturalWidth * cover) / 2, (H - img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover);
    g.filter = "none";
    const fit = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    g.drawImage(img, (W - img.naturalWidth * fit) / 2, (H - img.naturalHeight * fit) / 2, img.naturalWidth * fit, img.naturalHeight * fit);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return url;
    const path = `images/${clientId}/frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: "image/jpeg" });
    if (error) return url;
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  } catch {
    return url; // never block a render on the fitting step
  }
}
