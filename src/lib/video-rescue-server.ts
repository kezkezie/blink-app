import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { chargeCredits, creditBalance } from "@/lib/credits-meter";
import { estimateVideoCredits } from "@/lib/video-model-registry";
import { readablePicture } from "@/lib/image-refs";
import { RESCUE_STATUS, VIDEO_FINAL_FAILURE, VIDEO_LOW_BALANCE, needsRescue, rescuePlan, validVideoSpec, type VideoJobSpec } from "@/lib/video-rescue";
import { logAiUsage, USD_PER_CREDIT } from "@/lib/ai-usage";

/**
 * Videos that arrive, server side (lib/video-rescue.ts). rememberVideoJob keeps what a second try
 * needs on the post; claimVideoRescue (called when anyone checks the scene) turns a failed first
 * try back into "making" at once; startVideoRescue sends it to Replicate with a signed webhook;
 * finishVideoRescue (the webhook, or a later check) saves the video and only then charges.
 */
const REPLICATE = "https://api.replicate.com/v1";
const REFUSED = /sensitive|nsfw|safety|policy|prohibit|flagged|violat|moderat|E005/i;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const signVideoRescue = (id: string) => createHmac("sha256", key()).update(`video-rescue.${id}`).digest("hex");
export function checkVideoRescueSignature(id: string, sig: string) {
  if (!key()) return false;
  const want = Buffer.from(signVideoRescue(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

type Meta = Record<string, unknown> & { video_job?: unknown; video_rescue?: { state?: string; prediction?: string; model?: string; cost?: number; at?: string; origin?: string } };
const metaOf = (v: unknown): Meta => (v && typeof v === "object" ? (v as Meta) : {});
const touch = (patch: Record<string, unknown>) => ({ ...patch, updated_at: new Date().toISOString() });

/** Pictures the providers can read, then the spec kept on the post for a second try. */
export async function rememberVideoJob(postId: string, clientId: string, spec: VideoJobSpec): Promise<VideoJobSpec> {
  const [start, end] = await Promise.all([spec.start ? readablePicture(clientId, spec.start) : null, spec.end ? readablePicture(clientId, spec.end) : null]);
  const ready: VideoJobSpec = { ...spec, start: start ?? spec.start, end: end ?? spec.end };
  const { data } = await supabaseAdmin.from("content").select("creation_metadata").eq("id", postId).eq("client_id", clientId).maybeSingle();
  if (data) await supabaseAdmin.from("content").update({ creation_metadata: { ...metaOf(data.creation_metadata), video_job: ready } }).eq("id", postId).eq("client_id", clientId);
  return ready;
}

/** Turn a failed first try into a second one, once (the conditional update is the lock). */
export async function claimVideoRescue(row: Record<string, unknown>): Promise<boolean> {
  if (!needsRescue(row)) return false;
  const meta = metaOf(row.creation_metadata);
  const { data } = await supabaseAdmin.from("content").update(touch({
    generation_state: "generating", status: "draft", generation_attempt: 2, retry_state: "retrying", billing_state: "not_charged",
    generation_status_text: RESCUE_STATUS, generation_error_code: null, generation_completed_at: null,
    creation_metadata: { ...meta, video_rescue: { state: "starting", at: new Date().toISOString() } },
  })).eq("id", row.id).eq("generation_state", "failed").or("generation_attempt.is.null,generation_attempt.eq.1").select("id");
  return !!data?.length;
}

async function fail(id: string, meta: Meta, message: string, code: string) {
  await supabaseAdmin.from("content").update(touch({
    generation_state: "failed", status: "failed", generation_error_code: code, generation_status_text: message, retry_state: "retry_available",
    billing_state: "not_charged", generation_completed_at: new Date().toISOString(),
    creation_metadata: { ...meta, video_rescue: { ...(meta.video_rescue ?? {}), state: "failed" } },
  })).eq("id", id);
}

/** Send the second try to Replicate. Nothing is charged here. */
export async function startVideoRescue(id: string): Promise<void> {
  const { data: row } = await supabaseAdmin.from("content").select("id, client_id, brand_id, credit_cost, ai_model, creation_metadata").eq("id", id).maybeSingle();
  if (!row) return;
  const meta = metaOf(row.creation_metadata);
  const spec = validVideoSpec(meta.video_job);
  if (!spec) return fail(id, meta, VIDEO_FINAL_FAILURE, "no_spec");
  const cost = Number(row.credit_cost) > 0 ? Number(row.credit_cost) : (estimateVideoCredits(spec.model === "auto" ? "bytedance/seedance-2" : spec.model, spec.seconds, { hasStartFrame: !!spec.start }) ?? 0);
  if (cost > 0 && (await creditBalance(row.client_id as string)) < cost) return fail(id, meta, VIDEO_LOW_BALANCE, "no_credits");
  const plan = rescuePlan(spec);
  const res = await fetch(`${REPLICATE}/models/${plan.model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" },
    // Replicate only calls https; without one (local runs) the status check collects the result.
    body: JSON.stringify({ input: plan.input, ...(appUrl().startsWith("https://") ? { webhook: `${appUrl()}/api/webhooks/video-rescue?id=${id}&sig=${signVideoRescue(id)}`, webhook_events_filter: ["completed"] } : {}) }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const p = (await res?.json().catch(() => null)) as { id?: string; error?: unknown } | null;
  console.info("video rescue start", JSON.stringify({ post: id, from: spec.model, to: plan.model, ok: !!p?.id, status: res?.status ?? null }));
  if (!p?.id) return fail(id, meta, VIDEO_FINAL_FAILURE, "rescue_failed");
  await supabaseAdmin.from("content").update(touch({ creation_metadata: { ...meta, video_rescue: { state: "running", prediction: p.id, model: plan.model, cost, at: new Date().toISOString() } } })).eq("id", id);
}

/** The second try's result: saved to our storage and charged once it's there; or closed honestly. */
export async function finishVideoRescue(id: string): Promise<void> {
  const { data: row } = await supabaseAdmin.from("content").select("id, client_id, brand_id, generation_state, generation_status_text, creation_metadata").eq("id", id).maybeSingle();
  if (!row || row.generation_state !== "generating") return;
  const meta = metaOf(row.creation_metadata);
  const r = meta.video_rescue;
  if (!r?.prediction || r.state !== "running") return;
  const got = await fetch(`${REPLICATE}/predictions/${r.prediction}`, { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const p = (await got?.json().catch(() => null)) as { status?: string; output?: unknown; error?: unknown } | null;
  if (!p?.status || ["starting", "processing"].includes(p.status)) return;
  // Only one finisher (webhook or a check) gets past this.
  const { data: mine } = await supabaseAdmin.from("content").update(touch({ generation_status_text: "Saving the video", creation_metadata: { ...meta, video_rescue: { ...r, state: "saving" } } }))
    .eq("id", id).eq("generation_state", "generating").eq("generation_status_text", row.generation_status_text as string).select("id");
  if (!mine?.length) return;
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (p.status !== "succeeded" || typeof out !== "string") {
    const why = String(p.error ?? p.status);
    console.info("video rescue failed", JSON.stringify({ post: id, why: why.slice(0, 160) }));
    return fail(id, meta, REFUSED.test(why) ? "The video services' safety filters refused this scene. Nothing was charged. Try a different start frame or wording (see the tips for sensitive subjects)." : VIDEO_FINAL_FAILURE, REFUSED.test(why) ? "refused" : "rescue_failed");
  }
  const file = await safeFetchBytes(out, { maxBytes: 48_000_000, timeoutMs: 60_000 });
  if (!file.ok) return fail(id, meta, VIDEO_FINAL_FAILURE, "save_failed");
  const path = `videos/${row.client_id}/rescue_${id}_${Date.now()}.mp4`;
  const up = await supabaseAdmin.storage.from("assets").upload(path, file.bytes, { contentType: "video/mp4" });
  if (up.error) return fail(id, meta, VIDEO_FINAL_FAILURE, "save_failed");
  const videoUrl = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  // Charged only now that the video exists. A balance that dropped meanwhile gets it anyway.
  // An AI connection's video (2026-10-21) runs this same path; it says so on the bill.
  const fromMcp = (r as { origin?: string }).origin === "mcp";
  const charged = r.cost ? await chargeCredits(row.client_id as string, r.cost, `${fromMcp ? "Video from an AI connection" : "Video, second try"} [vidr:${id}]`, row.brand_id as string | null) : false;
  await supabaseAdmin.from("content").update(touch({
    video_urls: [videoUrl], status: "draft", generation_state: "succeeded", billing_state: charged ? "charged" : "not_charged", generation_status_text: "Ready",
    generation_error_code: null, retry_state: "none", generation_completed_at: new Date().toISOString(), ai_model: `replicate:${r.model}`,
    creation_metadata: { ...meta, video_rescue: { ...r, state: "done", charged } },
  })).eq("id", id);
  console.info("video rescue done", JSON.stringify({ post: id, model: r.model, charged, cost: r.cost }));
  logAiUsage({ feature: fromMcp ? "video_mcp" : "video_second_try", provider: "replicate", model: r.model, clientId: row.client_id as string, brandId: row.brand_id as string | null, usd: (Number(r.cost) || 0) * USD_PER_CREDIT, credits: charged ? Number(r.cost) || 0 : 0, meta: { post: id } });
}

/** The status check's part: claim a failed first try, or look in on a second try whose webhook is late. */
export async function rescueOnCheck(row: Record<string, unknown>): Promise<{ claimed: boolean; work: Promise<void> | null }> {
  if (await claimVideoRescue(row)) return { claimed: true, work: startVideoRescue(String(row.id)) };
  const r = metaOf(row.creation_metadata).video_rescue;
  const quiet = Date.now() - new Date(String(row.updated_at ?? 0)).getTime();
  if (row.generation_state === "generating" && r?.state === "running" && quiet > 3 * 60_000) return { claimed: false, work: finishVideoRescue(String(row.id)) };
  if (row.generation_state === "generating" && r?.state === "starting" && quiet > 5 * 60_000) return { claimed: false, work: startVideoRescue(String(row.id)) };
  return { claimed: false, work: null };
}

/**
 * Stop a video on this path (an AI connection's video, or a second try) before it arrives
 * (2026-10-22): the Replicate prediction is cancelled and the post removed. These are charged only
 * on delivery, so there is nothing to refund.
 */
export async function stopVideoJob(clientId: string, id: string): Promise<boolean> {
  const { data: row } = await supabaseAdmin.from("content").select("id, generation_state, creation_metadata").eq("id", id).eq("client_id", clientId).maybeSingle();
  const r = metaOf(row?.creation_metadata).video_rescue;
  if (!row || row.generation_state !== "generating" || !r) return false;
  if (r.prediction) await fetch(`${REPLICATE}/predictions/${r.prediction}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const { data: gone } = await supabaseAdmin.from("content").delete().eq("id", id).eq("client_id", clientId).eq("generation_state", "generating").select("id");
  return !!gone?.length;
}
