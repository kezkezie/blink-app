import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes, safeFetchText, validatePublicUrl } from "@/lib/safe-fetch";
import { INSPO_TYPES, bestPinImage, isPinterestShortLink, pinterestPinId } from "@/lib/inspo";

/**
 * Inspo Remix: a pasted link (a Pinterest pin, a pin.it short link, or a direct image URL) becomes
 * an inspiration image in the user's own storage folder, so the image workflow accepts it as a
 * reference (it only trusts the user's library, logo and storage). Fetches are SSRF-safe.
 */
async function followToPin(raw: string): Promise<string | null> {
  let current = raw;
  for (let hop = 0; hop < 5; hop += 1) {
    const check = await validatePublicUrl(current);
    if (!check.ok) return null;
    const res = await fetch(check.url.toString(), { redirect: "manual", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res) return null;
    await res.body?.cancel().catch(() => {});
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return pinterestPinId(current);
    current = new URL(location, check.url).toString();
    const id = pinterestPinId(current);
    if (id) return id;
  }
  return null;
}

async function pinImageUrls(pinId: string): Promise<string[]> {
  const info = await safeFetchText(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${pinId}`, { maxBytes: 400_000 });
  if (!info.ok) return [];
  let json: unknown;
  try { json = JSON.parse(info.text); } catch { return []; }
  const best = bestPinImage(json);
  if (!best) return [];
  // Originals are the full-size upload; fall back to the 736/564 renditions if they are missing.
  return [best, best.replace("/originals/", "/736x/"), best.replace("/originals/", "/564x/")];
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { url?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw || raw.length > 2000) return NextResponse.json({ error: "Paste a link to an image or a Pinterest pin." }, { status: 400 });

  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const pinId = pinterestPinId(raw) ?? (isPinterestShortLink(raw) ? await followToPin(raw) : null);
  const candidates = pinId ? await pinImageUrls(pinId) : [raw];
  if (!candidates.length) return NextResponse.json({ error: "Couldn't read that Pinterest pin. Try saving the image and uploading it." }, { status: 422 });

  for (const url of candidates) {
    const got = await safeFetchBytes(url, { maxBytes: 12_000_000, headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5" } });
    if (!got.ok) continue;
    const ext = INSPO_TYPES[got.contentType];
    if (!ext) continue; // not an image (an HTML page, an SVG, a video)
    const path = `images/${client.id}/inspo_${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage.from("assets").upload(path, got.bytes, { contentType: got.contentType });
    if (error) return NextResponse.json({ error: "Couldn't save the image. Please try again." }, { status: 500 });
    const publicUrl = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url: publicUrl, source: pinId ? "pinterest" : "link" });
  }
  return NextResponse.json({ error: pinId ? "Couldn't download that pin's image. Try saving it and uploading it." : "That link isn't a JPG, PNG or WebP image. Copy the image address, or save it and upload it." }, { status: 422 });
}
