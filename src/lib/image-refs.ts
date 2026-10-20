import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";

/**
 * Pictures the image and video services can read (2026-10-18). Kie and Replicate take JPEG and
 * PNG; an SVG logo (LADI APP's) failed every image with "Put our logo on it" on both, as "File type
 * not supported". Anything else (SVG, WebP, GIF, AVIF, HEIC) is turned into a PNG once, kept in
 * the owner's references folder, and that copy is sent instead. Same URL, same copy next time.
 */
const MAX_IN = 15_000_000;
const MAX_SIDE = 2048;

export type PictureKind = "jpeg" | "png" | "webp" | "gif" | "svg" | "avif" | "heic" | "other";

/** What a file really is, from its first bytes (never the name or the header it came with). */
export function pictureKind(b: Uint8Array): PictureKind {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  const box = String.fromCharCode(...b.slice(4, 12));
  if (box.startsWith("ftyp")) return /avif|avis/.test(box) ? "avif" : /heic|heix|mif1|msf1/.test(box) ? "heic" : "other";
  const head = new TextDecoder().decode(b.slice(0, 600)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) || head.includes("<svg")) return "svg";
  return "other";
}

/** By the name alone: JPEG and PNG pass without a download. */
export const looksReadable = (url: string) => /\.(jpe?g|png)(\?|#|$)/i.test(url) && !/\/image\/upload\/.*f_(webp|avif|auto)/.test(url);

async function exists(url: string) {
  const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) }).catch(() => null);
  return !!r?.ok;
}

/** One picture as something the services can read, or null when it can't be read at all. */
export async function readablePicture(clientId: string, url: string): Promise<string | null> {
  if (looksReadable(url)) return url;
  const path = `references/${clientId}/conv_${createHash("sha1").update(url).digest("hex").slice(0, 20)}.png`;
  const copy = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  if (await exists(copy)) return copy;
  const got = await safeFetchBytes(url, { maxBytes: MAX_IN, timeoutMs: 20_000 });
  if (!got.ok) return null;
  const kind = pictureKind(got.bytes);
  if (kind === "jpeg" || kind === "png") return url;
  if (kind === "other") return null;
  try {
    const { default: sharp } = await import("sharp");
    // SVGs are drawn large enough to stay sharp (a logo is often a tiny viewBox), never huge.
    const img = sharp(Buffer.from(got.bytes), { density: kind === "svg" ? 300 : undefined, animated: false, limitInputPixels: 80_000_000 });
    const png = await img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: kind !== "svg" }).png().toBuffer();
    const up = await supabaseAdmin.storage.from("assets").upload(path, png, { contentType: "image/png", upsert: true });
    return up.error ? null : copy;
  } catch (e) {
    console.warn("picture convert failed", kind, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * A picture as a JPEG for posting (2026-10-20): Instagram's API only takes JPEG photos, and most of
 * our pictures are now PNG or WebP in Supabase (only Cloudinary links were being converted). A
 * JPEG passes as is; anything else is flattened on white and copied once (kept by the link's hash).
 * Videos and pictures we can't read are left alone.
 */
export async function jpegForPosting(clientId: string, url: string): Promise<string> {
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url) || /\.jpe?g(\?|#|$)/i.test(url)) return url;
  const path = `images/${clientId}/post_${createHash("sha1").update(url).digest("hex").slice(0, 20)}.jpg`;
  const copy = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  if (await exists(copy)) return copy;
  const got = await safeFetchBytes(url, { maxBytes: MAX_IN, timeoutMs: 20_000 }).catch(() => null);
  if (!got?.ok) return url;
  const kind = pictureKind(got.bytes);
  if (kind === "jpeg" || kind === "other") return url;
  try {
    const { default: sharp } = await import("sharp");
    const jpg = await sharp(Buffer.from(got.bytes), { density: kind === "svg" ? 300 : undefined, animated: false, limitInputPixels: 80_000_000 })
      .rotate().flatten({ background: "#ffffff" }).resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const up = await supabaseAdmin.storage.from("assets").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
    return up.error ? url : copy;
  } catch (e) {
    console.warn("jpeg for posting failed", kind, e instanceof Error ? e.message : e);
    return url;
  }
}

/** The request's pictures (references, inputs, logo) swapped for readable copies; unreadable ones dropped. */
export async function readableRequest<T extends Record<string, unknown>>(clientId: string, payload: T): Promise<T> {
  const lists = ["reference_image_urls", "input_urls"] as const;
  const all = new Set<string>();
  for (const k of lists) for (const u of Array.isArray(payload[k]) ? (payload[k] as unknown[]) : []) if (typeof u === "string") all.add(u);
  if (typeof payload.logo_url === "string") all.add(payload.logo_url);
  if (![...all].some((u) => !looksReadable(u))) return payload;
  const map = new Map<string, string | null>();
  await Promise.all([...all].map(async (u) => map.set(u, await readablePicture(clientId, u).catch(() => null))));
  const out: Record<string, unknown> = { ...payload };
  for (const k of lists) if (Array.isArray(payload[k])) out[k] = [...new Set((payload[k] as unknown[]).map((u) => (typeof u === "string" ? map.get(u) : null)).filter((u): u is string => !!u))];
  if (typeof payload.logo_url === "string") { const l = map.get(payload.logo_url); if (l) out.logo_url = l; else delete out.logo_url; }
  return out as T;
}
