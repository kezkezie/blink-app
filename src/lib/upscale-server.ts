import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import {
  MAX_IMAGE_OUTPUT_MP, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, imageSize, imageUpscaleCredits, mp4Duration, videoUpscaleCredits,
  type UpscaleImageFactor, type UpscaleVideoTarget,
} from "@/lib/upscale";
import { brandArg } from "@/lib/credits-meter";

/**
 * Upscaler, server side (2026-10-13). Topaz on Replicate. The credits are taken first; the job row
 * records what was charged and which Library post it made, so a finished job lands exactly once
 * (the browser's poll and Replicate's webhook can both arrive) and a failed one is refunded once.
 * Results are copied into our storage: Replicate's links expire after an hour.
 */
const REPLICATE = "https://api.replicate.com/v1";
const STORAGE_LIMIT = 45 * 1024 * 1024; // the project refuses objects over 50 MB
const STALE_MS = 25 * 60 * 1000;

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

type Job = {
  id: string; client_id: string; brand_id: string | null; source_content_id: string | null; kind: "image" | "video";
  setting: string; prediction_id: string | null; credits: number; state: string; error: string | null;
  result_content_id: string | null; created_at: string; updated_at: string;
};

function replicateHeaders() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Upscaling isn't configured.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function secret() {
  return process.env.UPSCALE_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}
export function webhookSignature(jobId: string) {
  return createHmac("sha256", secret()).update(`upscale:${jobId}`).digest("hex");
}
export function validWebhookSignature(jobId: string, sig: string) {
  const want = Buffer.from(webhookSignature(jobId));
  const got = Buffer.from(sig || "");
  return got.length === want.length && timingSafeEqual(got, want);
}

const urlsOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x);
  if (typeof v === "string" && v) { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [v]; } catch { return [v]; } }
  return [];
};
const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || u.includes("/video/upload/");

export type StartInput = { userId: string; clientId: string; contentId: string; factor?: UpscaleImageFactor; target?: UpscaleVideoTarget; appUrl: string };
export type JobView = { id: string; state: "running" | "done" | "failed"; kind: "image" | "video"; credits: number; contentId: string | null; error: string | null };

const view = (j: Job): JobView => ({ id: j.id, state: j.state === "finalizing" ? "running" : (j.state as JobView["state"]), kind: j.kind, credits: j.credits, contentId: j.result_content_id, error: j.error });

/** Price, charge and start an upscale of one Library post (image or video) in the given workspace. */
export async function startUpscale(input: StartInput): Promise<Result<JobView>> {
  const { data: post } = await supabaseAdmin.from("content")
    .select("id, client_id, brand_id, content_type, caption, image_urls, video_urls")
    .eq("id", input.contentId).eq("client_id", input.clientId).maybeSingle();
  if (!post) return fail(404, "Post not found.");
  const video = urlsOf(post.video_urls)[0] ?? urlsOf(post.image_urls).find(isVideoUrl);
  const image = video ? null : urlsOf(post.image_urls)[0];
  const source = video ?? image;
  if (!source) return fail(400, "This post has no picture or video to upscale.");
  const kind: "image" | "video" = video ? "video" : "image";

  // Size and length come from the file itself, never from the browser.
  const got = await safeFetchBytes(source, { maxBytes: kind === "video" ? MAX_VIDEO_BYTES : 25_000_000, timeoutMs: 45_000 });
  if (!got.ok) return fail(400, kind === "video" ? "Couldn't read this video (it may be too big: up to 200 MB)." : "Couldn't read this picture.");
  let credits: number | null;
  let setting: string;
  let replicateInput: Record<string, unknown>;
  let model: string;
  if (kind === "image") {
    const size = imageSize(got.bytes);
    if (!size) return fail(400, "This picture's format can't be upscaled (JPEG, PNG or WebP).");
    const factor: UpscaleImageFactor = input.factor === 4 ? 4 : 2;
    credits = imageUpscaleCredits(size.width, size.height, factor);
    if (!credits) return fail(400, `At ${factor}× this picture would be over ${MAX_IMAGE_OUTPUT_MP} megapixels. Try 2×.`);
    setting = `${factor}x`;
    model = "topazlabs/image-upscale";
    replicateInput = { image: source, upscale_factor: `${factor}x`, enhance_model: "Standard V2", output_format: "jpg" };
  } else {
    const seconds = mp4Duration(got.bytes);
    if (!seconds) return fail(400, "Couldn't read this video's length (MP4 or MOV).");
    const target: UpscaleVideoTarget = input.target === "4k" ? "4k" : "1080p";
    const limit = target === "4k" ? MAX_VIDEO_SECONDS / 2 : MAX_VIDEO_SECONDS;
    if (seconds > limit) return fail(400, `Videos up to ${limit} seconds can be upscaled to ${target === "4k" ? "4K" : "1080p"}; this one is ${Math.round(seconds)} s.`);
    credits = videoUpscaleCredits(seconds, target);
    setting = target;
    model = "topazlabs/video-upscale";
    replicateInput = { video: source, target_resolution: target, target_fps: 30 };
  }

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: input.clientId, p_amount: credits, p_operation: "debit",
    p_description: kind === "image" ? `Upscale picture ${setting}` : `Upscale video to ${setting === "4k" ? "4K" : setting}`,
    ...brandArg(post.brand_id),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return fail(402, `This needs ${credits} credits and your balance is lower. Get more in Billing.`);

  const { data: job, error: jobError } = await supabaseAdmin.from("upscale_jobs").insert({
    client_id: input.clientId, brand_id: post.brand_id, user_id: input.userId, source_content_id: post.id, kind, setting, credits,
  }).select("*").single();
  if (jobError || !job) { await refund(input.clientId, credits, "Refund: upscale could not start", post.brand_id); return fail(500, "Couldn't start the upscale. Your credits were refunded."); }

  try {
    const webhook = `${input.appUrl.replace(/\/$/, "")}/api/webhooks/upscale?job=${job.id}&sig=${webhookSignature(job.id)}`;
    const res = await fetch(`${REPLICATE}/models/${model}/predictions`, {
      method: "POST",
      headers: { ...replicateHeaders(), ...(kind === "image" ? { Prefer: "wait=50" } : {}) },
      body: JSON.stringify({ input: replicateInput, ...(webhook.startsWith("https://") ? { webhook, webhook_events_filter: ["completed"] } : {}) }),
      signal: AbortSignal.timeout(kind === "image" ? 60_000 : 20_000),
    });
    const prediction = await res.json().catch(() => ({}));
    if (!res.ok || !prediction.id) throw new Error(prediction.detail || "the upscaler refused it");
    await supabaseAdmin.from("upscale_jobs").update({ prediction_id: prediction.id, updated_at: new Date().toISOString() }).eq("id", job.id);
    const settled = await settle({ ...(job as Job), prediction_id: prediction.id }, prediction);
    return { ok: true, value: view(settled) };
  } catch (e) {
    const failed = await markFailed(job as Job, e instanceof Error ? e.message : "the upscaler is busy");
    return { ok: true, value: view(failed) };
  }
}

async function refund(clientId: string, credits: number, description: string, brandId?: string | null) {
  await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: credits, p_operation: "refund", p_description: description, ...brandArg(brandId) }).then(() => {}, () => {});
}

/** Failed once: the state flips first, so only one caller refunds. */
async function markFailed(job: Job, reason: string): Promise<Job> {
  const message = `The upscale didn't work (${reason.slice(0, 120)}). Your ${job.credits} credits were refunded.`;
  const { data } = await supabaseAdmin.from("upscale_jobs").update({ state: "failed", error: message, updated_at: new Date().toISOString() })
    .eq("id", job.id).in("state", ["running", "finalizing"]).select("*");
  if (data?.length) await refund(job.client_id, job.credits, `Refund: upscale ${job.kind} failed`, job.brand_id);
  const { data: now } = await supabaseAdmin.from("upscale_jobs").select("*").eq("id", job.id).single();
  return (now as Job) ?? { ...job, state: "failed", error: message };
}

/** Bring a job up to date from its Replicate prediction (pass one in to skip the fetch). */
export async function settle(job: Job, known?: { status?: string; output?: unknown; error?: unknown }): Promise<Job> {
  if (job.state === "done" || job.state === "failed") return job;
  if (job.state === "finalizing" && Date.now() - new Date(job.updated_at).getTime() < 5 * 60 * 1000) return job;
  if (!job.prediction_id) return Date.now() - new Date(job.created_at).getTime() > 2 * 60 * 1000 ? markFailed(job, "it never started") : job;
  let prediction = known;
  if (!prediction?.status || !["succeeded", "failed", "canceled"].includes(prediction.status)) {
    const res = await fetch(`${REPLICATE}/predictions/${job.prediction_id}`, { headers: replicateHeaders(), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    prediction = res?.ok ? await res.json() : prediction;
  }
  const status = prediction?.status;
  if (status === "failed" || status === "canceled") return markFailed(job, String(prediction?.error || status));
  if (status !== "succeeded") {
    return Date.now() - new Date(job.created_at).getTime() > STALE_MS ? markFailed(job, "it took too long") : job;
  }
  const out = Array.isArray(prediction?.output) ? prediction?.output[0] : prediction?.output;
  if (typeof out !== "string") return markFailed(job, "no file came back");
  // Only one caller copies the file and makes the post.
  const { data: claimed } = await supabaseAdmin.from("upscale_jobs").update({ state: "finalizing", updated_at: new Date().toISOString() })
    .eq("id", job.id).in("state", ["running", "finalizing"]).select("*");
  if (!claimed?.length) { const { data } = await supabaseAdmin.from("upscale_jobs").select("*").eq("id", job.id).single(); return data as Job; }
  try {
    const file = await safeFetchBytes(out, { maxBytes: STORAGE_LIMIT, timeoutMs: 60_000 });
    if (!file.ok) return markFailed(job, file.reason.includes("large") ? "the result is over 45 MB" : "couldn't download the result");
    const ext = job.kind === "video" ? "mp4" : "jpg";
    const path = `${job.kind === "video" ? "videos" : "images"}/${job.client_id}/upscaled_${Date.now()}.${ext}`;
    const up = await supabaseAdmin.storage.from("assets").upload(path, file.bytes, { contentType: job.kind === "video" ? "video/mp4" : "image/jpeg" });
    if (up.error) return markFailed(job, "couldn't save the result");
    const url = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    const { data: source } = job.source_content_id
      ? await supabaseAdmin.from("content").select("content_type, caption").eq("id", job.source_content_id).maybeSingle()
      : { data: null };
    const label = job.kind === "image" ? `Upscaled ${job.setting.replace("x", "×")}` : `Upscaled to ${job.setting === "4k" ? "4K" : job.setting}`;
    const { data: post, error } = await supabaseAdmin.from("content").insert({
      client_id: job.client_id, brand_id: job.brand_id, status: "draft",
      content_type: source?.content_type && !["sequence_clip", "raw_clip"].includes(source.content_type) ? source.content_type : job.kind === "video" ? "video" : "post_image",
      caption: `${label}${source?.caption ? ` · ${String(source.caption).slice(0, 240)}` : ""}`,
      ...(job.kind === "video" ? { video_urls: [url], image_urls: [] } : { image_urls: [url] }),
      ai_model: job.kind === "video" ? "topazlabs/video-upscale" : "topazlabs/image-upscale",
      creation_metadata: { operation: "upscale", source_content_id: job.source_content_id, setting: job.setting, credits: job.credits },
    }).select("id").single();
    if (error || !post) return markFailed(job, "couldn't add it to the Library");
    const { data: done } = await supabaseAdmin.from("upscale_jobs").update({ state: "done", result_content_id: post.id, updated_at: new Date().toISOString() }).eq("id", job.id).select("*").single();
    return done as Job;
  } catch (e) {
    return markFailed(job, e instanceof Error ? e.message : "couldn't finish");
  }
}

/** A job of this workspace, brought up to date. */
export async function checkUpscale(jobId: string, clientId: string): Promise<Result<JobView>> {
  const { data: job } = await supabaseAdmin.from("upscale_jobs").select("*").eq("id", jobId).eq("client_id", clientId).maybeSingle();
  if (!job) return fail(404, "Upscale not found.");
  return { ok: true, value: view(await settle(job as Job)) };
}

/** Replicate says a job finished: settle it from Replicate's own record (the body isn't trusted). */
export async function settleFromWebhook(jobId: string): Promise<boolean> {
  const { data: job } = await supabaseAdmin.from("upscale_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return false;
  await settle(job as Job);
  return true;
}
