import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { checkStampSignature, stampImages, workspaceNeedsStamp } from "@/lib/stamp-server";
import { stampVideoUrl } from "@/lib/stamp-video-server";
import { isStampedUrl } from "@/lib/stamp";

/**
 * POST { id, kind: "image" | "video", ts, sig } (signed by kickStamp, lib/stamp-server.ts): stamps a
 * free account's post in the background, in its own function (videos take ffmpeg a few seconds to a
 * minute). Answers at once. A post whose workspace has moved to a paid plan meanwhile is left clean.
 */
export const maxDuration = 300;

const asList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((u): u is string => typeof u === "string");
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((u): u is string => typeof u === "string") : [v]; } catch { return [v]; } }
  return [];
};

async function work(id: string, kind: "image" | "video") {
  const { data: row } = await supabaseAdmin.from("content").select("id, client_id, image_urls, video_urls, creation_metadata").eq("id", id).maybeSingle();
  if (!row) return;
  const meta = (row.creation_metadata ?? {}) as Record<string, unknown>;
  const finish = (patch: Record<string, unknown>, state: "done" | "failed") =>
    supabaseAdmin.from("content").update({ ...patch, creation_metadata: { ...meta, stamp: true, stamp_state: state, stamp_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", id);
  const clientId = row.client_id as string;
  if (!(await workspaceNeedsStamp(clientId))) { await finish({}, "done"); return; }
  const t0 = Date.now();
  if (kind === "image") {
    const urls = asList(row.image_urls);
    const out = await stampImages(urls, clientId);
    await finish({ image_urls: out.urls }, out.failed ? "failed" : "done");
    console.info("stamp", JSON.stringify({ id, kind, n: urls.length, failed: out.failed, ms: Date.now() - t0 }));
    return;
  }
  const urls = asList(row.video_urls);
  const first = urls[0];
  if (!first || isStampedUrl(first)) { await finish({}, "done"); return; }
  try {
    const stamped = await stampVideoUrl(first, clientId);
    await finish({ video_urls: [stamped, ...urls.slice(1)] }, "done");
    console.info("stamp", JSON.stringify({ id, kind, ms: Date.now() - t0 }));
  } catch (e) {
    console.warn("stamp failed", "video", id, e instanceof Error ? e.message : e);
    await finish({}, "failed");
  }
}

export async function POST(request: NextRequest) {
  let body: { id?: unknown; kind?: unknown; ts?: unknown; sig?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const kind = body.kind === "video" ? "video" : body.kind === "image" ? "image" : null;
  if (!id || !kind || !checkStampSignature(kind, id, Number(body.ts), String(body.sig ?? ""))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  after(work(id, kind).catch((e) => console.error("stamp", id, e instanceof Error ? e.message : e)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
