import { supabaseAdmin } from "@/lib/supabase-server";
import { BRAND_KIT_COLUMNS, imageRequestPayload, kitFromRow, type ImageEngine } from "@/lib/image-request";
import { buildGeneratePrompt, routerTopic, type GenerateLook } from "@/lib/generate-prompt";
import { mustKeep } from "@/lib/design-pass";
import { designPrompt, type DesignLook } from "@/lib/design-pass-server";
import { validateVisualRefs } from "@/lib/visual-refs";
import { jobStatuses, kickRescue, startImageJobs } from "@/lib/image-jobs-server";
import { loadOwnedBrandCreativeContext } from "@/lib/brand-creative-context";
import { writeVideoPrompt } from "@/lib/video-prompt-server";
import { finishVideoRescue, startVideoRescue } from "@/lib/video-rescue-server";
import type { VideoJobSpec } from "@/lib/video-rescue";

/**
 * What an outside AI can make through the MCP (Connect your AI stage 2, 2026-10-21). The same
 * pipelines as the studio: images are Generate's (the prompt, the design pass, the server-owned job
 * with its second try); videos are the server-run Replicate path that already makes second tries
 * (a Library post, an on-brand prompt, a signed webhook, charged only when the video arrives).
 * Every job is a Library post the owner sees at once.
 */
export type Defer = (work: Promise<unknown>) => void;
type Made = { ok: true; ids: string[] } | { ok: false; error: string };

const urlsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || u.includes("/video/upload/");

/** A Library picture of this brand, as its first image URL (pictures to build on, a start frame). */
export async function brandPicture(clientId: string, brandId: string, postId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("content").select("image_urls").eq("id", postId).eq("client_id", clientId).eq("brand_id", brandId).maybeSingle();
  return urlsOf(data?.image_urls).find((u) => !isVideoUrl(u)) ?? null;
}

export const IMAGE_QUALITY: Record<"best" | "fast" | "draft", ImageEngine> = { best: "nb2", fast: "gpt-image-2-text-to-image", draft: "z-image" };

export async function makeImages(i: {
  userId: string; clientId: string; brandId: string; brief: string; words?: string; look: GenerateLook; aspect: string;
  quality: keyof typeof IMAGE_QUALITY; count: number; useLogo: boolean; pictures: string[]; defer: Defer;
}): Promise<Made> {
  const { data: row } = await supabaseAdmin.from("brand_profiles").select(`${BRAND_KIT_COLUMNS}, visual_refs`).eq("id", i.brandId).eq("client_id", i.clientId).maybeSingle();
  if (!row) return { ok: false, error: "No such brand in this account." };
  const kit = kitFromRow(row as Record<string, unknown>);
  const withLogo = i.useLogo && !!kit.logoUrl;
  let engine = IMAGE_QUALITY[i.quality];
  if (engine === "gpt-image-2-text-to-image" && (i.pictures.length || withLogo)) engine = "gpt-image-2-image-to-image";
  let assembledPrompt = buildGeneratePrompt({
    brief: i.brief, look: i.look, colours: [kit.primaryColor, kit.secondaryColor], font: kit.primaryFont,
    words: i.words, logo: withLogo, products: i.pictures.length, research: kit.research, visual: validateVisualRefs((row as { visual_refs?: unknown }).visual_refs),
  });
  // The same design pass Generate runs before Best and Fast; Plain and Draft go as written.
  if (i.look !== "plain" && i.quality !== "draft") {
    const designed = await designPrompt({ look: i.look as DesignLook, requirements: assembledPrompt, brandName: kit.name || "the brand", industry: kit.industry, clientId: i.clientId, userId: i.userId, brandId: i.brandId }).catch(() => null);
    if (designed?.prompt) { const keep = mustKeep(assembledPrompt); assembledPrompt = `${designed.prompt}${keep ? `\n${keep}` : ""}`; }
  }
  const payload = imageRequestPayload({
    clientId: i.clientId, brandId: i.brandId, kit, prompt: routerTopic(i.brief), assembledPrompt,
    references: [...(withLogo ? [kit.logoUrl!] : []), ...i.pictures], engine, aspect: i.aspect, style: i.look,
  });
  const started = await startImageJobs(i.userId, payload, i.count, (i.words?.trim() || i.brief.split(/[.!?]/)[0]).slice(0, 120));
  if (!started.ok) return { ok: false, error: started.error };
  i.defer(started.value.work);
  return { ok: true, ids: started.value.ids };
}

export const VIDEO_PLAN: Record<"draft" | "standard" | "cinema", { model: string; resolution: "720p" | "1080p" }> = {
  draft: { model: "replicate:prunaai/p-video", resolution: "720p" },
  standard: { model: "bytedance/seedance-2", resolution: "720p" },
  cinema: { model: "bytedance/seedance-2", resolution: "1080p" },
};

export async function makeVideo(i: {
  userId: string; clientId: string; brandId: string; brief: string; seconds: number; aspect: string;
  quality: keyof typeof VIDEO_PLAN; startFrame: string | null; credits: number; defer: Defer;
}): Promise<Made> {
  const ctx = await loadOwnedBrandCreativeContext(i.userId, i.brandId).catch(() => null);
  const written = await writeVideoPrompt({ scene: i.brief, context: ctx?.ok ? ctx.context : null, onBrand: true, seconds: i.seconds, startFrame: i.startFrame, aspect: i.aspect });
  const plan = VIDEO_PLAN[i.quality];
  const spec: VideoJobSpec = { prompt: written.prompt, start: i.startFrame, end: null, seconds: i.seconds, aspect: i.aspect, resolution: plan.resolution, model: plan.model, audio: false };
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("content").insert({
    client_id: i.clientId, brand_id: i.brandId, content_type: "video", status: "draft", caption: i.brief.split(/[.!?]/)[0].slice(0, 120),
    ai_model: plan.model, credit_cost: i.credits, generation_state: "generating", generation_status_text: "Making your video",
    generation_started_at: now, generation_attempt: 2, retry_state: "none", billing_state: "not_charged",
    // Kept like a second try's, so the webhook, the late-webhook check and the charge-on-delivery all apply.
    creation_metadata: { operation: "mcp_video", video_job: spec, video_rescue: { state: "starting", origin: "mcp", at: now } },
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't start the video. Nothing was charged." };
  i.defer(startVideoRescue(data.id as string));
  return { ok: true, ids: [data.id as string] };
}

export type JobState = { id: string; type: string; state: "making" | "done" | "failed"; message: string | null; url: string | null; open: string };

/** Where each job is: images through the studio's own status check (it rescues dead first tries), videos from the post. */
export async function jobStates(clientId: string, brandIds: string[] | null, ids: string[], defer: Defer): Promise<JobState[]> {
  let q = supabaseAdmin.from("content").select("id, client_id, brand_id, content_type, generation_state, generation_status_text, image_urls, video_urls, updated_at, creation_metadata").eq("client_id", clientId).in("id", ids);
  if (brandIds) q = q.in("brand_id", brandIds);
  const { data } = await q;
  const rows = data ?? [];
  const images = rows.filter((r) => r.content_type !== "video").map((r) => r.id as string);
  const { jobs, rescues } = images.length ? await jobStatuses(async () => true, images) : { jobs: [], rescues: [] };
  if (rescues.length) defer(Promise.all(rescues.map((id) => kickRescue(id))));
  const byImage = new Map(jobs.map((j) => [j.id, j]));
  return rows.map((r) => {
    const open = `https://www.blinkspot.io/studio/library/${r.id}`;
    if (r.content_type !== "video") {
      const j = byImage.get(r.id as string);
      return { id: r.id as string, type: "image", state: (j?.state ?? "failed") as JobState["state"], message: j?.text ?? null, url: j?.url ?? null, open };
    }
    const rescue = (r.creation_metadata as { video_rescue?: { state?: string } } | null)?.video_rescue;
    // A late webhook: collect the result here (finishVideoRescue only acts once).
    if (r.generation_state === "generating" && rescue?.state === "running" && Date.now() - new Date(String(r.updated_at)).getTime() > 60_000) defer(finishVideoRescue(r.id as string));
    const url = urlsOf(r.video_urls)[0] ?? null;
    const state = r.generation_state === "succeeded" && url ? "done" : r.generation_state === "failed" ? "failed" : "making";
    return { id: r.id as string, type: "video", state, message: state === "done" ? null : (r.generation_status_text as string | null), url, open };
  });
}
