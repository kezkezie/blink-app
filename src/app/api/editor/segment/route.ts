import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { requestWorkspace } from "@/lib/brand-access";
import { chargeCredits } from "@/lib/credits-meter";
import { MAP_CREDITS, composeLabels, packLabels } from "@/lib/editor/regions";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * The AI eraser's map (2026-10-20). POST { url, brandId }: SAM 2 on Replicate starts finding every
 * thing in the photo (15 s warm, up to a minute or so from cold), and the browser gets a signed job
 * id. GET ?id&token: the job's state; when done, its masks become one label map (lib/editor/regions)
 * and the map is charged then, once ("[seg:id]" on the charge): a run that fails costs nothing.
 */
export const maxDuration = 60;
const REPLICATE = "https://api.replicate.com/v1";
const SAM2 = "fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83";
const ID = /^[a-z0-9]{10,40}$/i;

const secret = () => process.env.N8N_WEBHOOK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sign = (clientId: string, id: string) => createHmac("sha256", secret()).update(`segment:${clientId}:${id}`).digest("hex");
function signed(clientId: string, id: string, token: string) {
  const want = Buffer.from(sign(clientId, id)), got = Buffer.from(token || "");
  return got.length === want.length && timingSafeEqual(got, want);
}
const headers = () => ({ Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" });

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!process.env.REPLICATE_API_TOKEN) return NextResponse.json({ error: "The AI eraser isn't set up yet." }, { status: 503 });
  let body: { url?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const url = typeof body.url === "string" ? body.url : "";
  const client = await requestWorkspace(request, auth.value);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!url || !(await verifyOwnedInspirationImage(client.id, url))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: bal } = await supabaseAdmin.from("credit_balances").select("balance").eq("client_id", client.id).maybeSingle();
  if (Number(bal?.balance ?? 0) < MAP_CREDITS) return NextResponse.json({ error: "Not enough credits. Get more in Billing." }, { status: 402 });
  const res = await fetch(`${REPLICATE}/predictions`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ version: SAM2, input: { image: url, points_per_side: 32, pred_iou_thresh: 0.86, stability_score_thresh: 0.92, use_m2m: true } }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const p = (await res?.json().catch(() => null)) as { id?: string } | null;
  if (!res?.ok || !p?.id) return NextResponse.json({ error: "Mapping is busy right now. Try again in a minute; nothing was charged." }, { status: 502 });
  return NextResponse.json({ id: p.id, token: sign(client.id, p.id), credits: MAP_CREDITS });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const brandId = request.nextUrl.searchParams.get("brandId");
  const client = await requestWorkspace(request, auth.value);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!ID.test(id) || !signed(client.id, id, token)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await fetch(`${REPLICATE}/predictions/${id}`, { headers: headers(), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const p = (await r?.json().catch(() => null)) as { status?: string; output?: { individual_masks?: unknown }; error?: unknown; metrics?: { predict_time?: number } } | null;
  if (!r?.ok || !p) return NextResponse.json({ state: "running" });
  if (p.status === "failed" || p.status === "canceled") return NextResponse.json({ state: "failed", error: "Couldn't map this picture. Nothing was charged. Brush over what to remove instead." });
  if (p.status !== "succeeded") return NextResponse.json({ state: "running" });

  const urls = (Array.isArray(p.output?.individual_masks) ? p.output.individual_masks : []).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 300);
  if (!urls.length) return NextResponse.json({ state: "failed", error: "Nothing clear to pick in this picture. Nothing was charged. Brush over what to remove instead." });
  let size: { w: number; h: number } | null = null;
  const masks: Uint8Array[] = [];
  for (let i = 0; i < urls.length; i += 10) {
    const batch = await Promise.all(urls.slice(i, i + 10).map(async (u) => {
      const got = await safeFetchBytes(u, { maxBytes: 6_000_000, timeoutMs: 15_000 }).catch(() => null);
      if (!got?.ok) return null;
      try {
        const img = sharp(got.bytes).greyscale();
        const meta = await img.metadata();
        // The map is at most 1024 px on its long side: the browser reads it per pointer move.
        size ??= (() => { const s = Math.min(1, 1024 / Math.max(meta.width ?? 1, meta.height ?? 1)); return { w: Math.max(8, Math.round((meta.width ?? 8) * s)), h: Math.max(8, Math.round((meta.height ?? 8) * s)) }; })();
        const { data } = await img.resize(size.w, size.h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
        return new Uint8Array(data.buffer, data.byteOffset, size.w * size.h);
      } catch { return null; }
    }));
    for (const m of batch) if (m) masks.push(m);
  }
  if (!size || !masks.length) return NextResponse.json({ state: "failed", error: "Couldn't read the map. Nothing was charged. Try again." });
  const { w, h } = size as { w: number; h: number };
  const map = composeLabels(masks, w, h);

  // Charged now that the map exists, once per job.
  const tag = `[seg:${id}]`;
  const { data: prior } = await supabaseAdmin.from("credit_transactions").select("id").eq("client_id", client.id).like("description", `%${tag}%`).limit(1);
  if (!prior?.length && !(await chargeCredits(client.id, MAP_CREDITS, `Editor: map the picture for the AI eraser ${tag}`, brandId))) {
    return NextResponse.json({ state: "failed", error: "Not enough credits to map it. Get more in Billing." }, { status: 402 });
  }
  console.info("segment done", JSON.stringify({ client: client.id, masks: masks.length, regions: map.regions.length, w, h }));
  // SAM 2 runs on an L40S at $0.000975 a second.
  if (!prior?.length) logAiUsage({ feature: "photo_map", provider: "replicate", model: "meta/sam-2", clientId: client.id, userId: auth.value, brandId, usd: (Number(p.metrics?.predict_time) || 20) * 0.000975, credits: MAP_CREDITS, meta: { regions: map.regions.length } });
  return NextResponse.json({ state: "done", w, h, labels: packLabels(map.labels), regions: map.regions.length, credits: prior?.length ? 0 : MAP_CREDITS });
}
