import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { STAMP_PNG_BASE64 } from "@/lib/stamp-image";
import { isStampedUrl, needsStamp, stampBox } from "@/lib/stamp";

/**
 * The stamp, server side (lib/stamp.ts): burned into a picture with sharp and saved as a
 * stamped_<...> copy in the workspace's storage (videos: lib/stamp-video-server.ts, only in the
 * /api/stamp function, which carries ffmpeg). Every step fails open: if the stamp can't be added,
 * the work is still delivered (and the failure logged), never lost.
 */
export const stampPng = () => Buffer.from(STAMP_PNG_BASE64, "base64");
const rand = () => Math.random().toString(36).slice(2, 8);

/** Whether a workspace's work gets the stamp (its plan; cached for a minute). Unknown: no stamp. */
const plans = new Map<string, { at: number; free: boolean }>();
export async function workspaceNeedsStamp(clientId: string | null | undefined): Promise<boolean> {
  if (!clientId) return false;
  const hit = plans.get(clientId);
  if (hit && Date.now() - hit.at < 60_000) return hit.free;
  const { data, error } = await supabaseAdmin.from("clients").select("plan_tier").eq("id", clientId).maybeSingle();
  if (error || !data) return false;
  const free = needsStamp(data.plan_tier);
  plans.set(clientId, { at: Date.now(), free });
  return free;
}

/** A picture with the stamp in its corner, in the picture's own format (PNG stays PNG). */
export async function stampImageBytes(bytes: Uint8Array): Promise<{ bytes: Buffer; type: "image/png" | "image/jpeg" }> {
  const base = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const oriented = (meta.orientation ?? 1) >= 5;
  const w = (oriented ? meta.height : meta.width) ?? 0, h = (oriented ? meta.width : meta.height) ?? 0;
  if (!w || !h) throw new Error("not a picture");
  const box = stampBox(w, h);
  const stamp = await sharp(stampPng()).resize({ width: box.width, height: box.height, fit: "fill" }).png().toBuffer();
  const png = meta.format === "png" || meta.format === "webp";
  const out = base.composite([{ input: stamp, left: box.left, top: box.top }]);
  return png ? { bytes: await out.png().toBuffer(), type: "image/png" } : { bytes: await out.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), type: "image/jpeg" };
}

export async function saveStamped(clientId: string, folder: "images" | "videos", bytes: Uint8Array, type: string, ext: string) {
  const file = `${folder}/${clientId}/stamped_${Date.now()}_${rand()}.${ext}`;
  const up = await supabaseAdmin.storage.from("assets").upload(file, bytes, { contentType: type });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return supabaseAdmin.storage.from("assets").getPublicUrl(file).data.publicUrl;
}

/** A stamped copy of a picture at a URL (or the URL itself if it is one already). */
export async function stampImageUrl(url: string, clientId: string): Promise<string> {
  if (isStampedUrl(url)) return url;
  const got = await safeFetchBytes(url, { maxBytes: 45_000_000, timeoutMs: 45_000 });
  if (!got.ok) throw new Error(`fetch: ${got.reason}`);
  const out = await stampImageBytes(got.bytes);
  return saveStamped(clientId, "images", out.bytes, out.type, out.type === "image/png" ? "png" : "jpg");
}

/** Stamp a list of picture URLs; any that can't be stamped stay as they were (and it says how many). */
export async function stampImages(urls: string[], clientId: string): Promise<{ urls: string[]; failed: number }> {
  let failed = 0;
  const out = await Promise.all(urls.map(async (u) => {
    try { return await stampImageUrl(u, clientId); }
    catch (e) { failed++; console.warn("stamp failed", "image", u.slice(0, 120), e instanceof Error ? e.message : e); return u; }
  }));
  return { urls: out, failed };
}

/** A signed request to /api/stamp (the same pattern as image second tries): only we can ask. */
const stampKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export function signStamp(kind: string, id: string, ts: number) {
  return createHmac("sha256", stampKey()).update(`stamp.${kind}.${id}.${ts}`).digest("hex");
}
export function checkStampSignature(kind: string, id: string, ts: number, sig: string) {
  if (!stampKey() || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false;
  const want = Buffer.from(signStamp(kind, id, ts));
  const got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got);
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

/**
 * Ask /api/stamp to stamp a post's pictures or video, once: the post is marked "running" first (only
 * if it isn't already, or a run went quiet for 5 minutes), so polls that arrive together don't
 * start it twice. Returns whether this call started it.
 */
export async function kickStamp(id: string, kind: "image" | "video", meta: Record<string, unknown>): Promise<boolean> {
  const was = meta.stamp_state, at = typeof meta.stamp_at === "string" ? new Date(meta.stamp_at).getTime() : 0;
  if (was === "done" || was === "failed" || (was === "running" && Date.now() - at < 5 * 60_000)) return false;
  let q = supabaseAdmin.from("content").update({ creation_metadata: { ...meta, stamp: true, stamp_state: "running", stamp_at: new Date().toISOString() } }).eq("id", id);
  q = was === "running" ? q.eq("creation_metadata->>stamp_at", String(meta.stamp_at)) : q.is("creation_metadata->>stamp_state", null);
  const { data } = await q.select("id");
  if (!data?.length) return false;
  const ts = Date.now();
  await fetch(`${appUrl()}/api/stamp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, kind, ts, sig: signStamp(kind, id, ts) }), signal: AbortSignal.timeout(15_000),
  }).catch((e) => console.warn("stamp kick failed", id, e instanceof Error ? e.message : e));
  return true;
}

/** For routes that save a finished picture themselves: stamped if the workspace is on the free plan. */
export async function stampIfFree(clientId: string, bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string; stamped: boolean }> {
  if (!(await workspaceNeedsStamp(clientId))) return { bytes, contentType, stamped: false };
  try { const s = await stampImageBytes(bytes); return { bytes: s.bytes, contentType: s.type, stamped: true }; }
  catch (e) { console.warn("stamp failed", "image", clientId, e instanceof Error ? e.message : e); return { bytes, contentType, stamped: false }; }
}
