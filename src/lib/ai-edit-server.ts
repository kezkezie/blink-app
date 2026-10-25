import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { brandArg } from "@/lib/credits-meter";
import { imageSize } from "@/lib/upscale";
import { ASSISTANT_MODEL, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { jsonFrom } from "@/lib/brand-research";
import {
  EDIT_CREDITS, EDIT_ENGINES, MAX_SWAPS, SCAN_CREDITS, aspectFor, boxesToThousandths, buildEditPrompt, changeCount, keptScan,
  normalizeChanges, scanAfterEdit, scanSystem, validateScan, type EditEngine, type Scan, type StoredScan,
} from "@/lib/ai-edit";
import { logAiUsage } from "@/lib/ai-usage";
import { stampIfFree } from "@/lib/stamp-server";

/**
 * Edit with AI, server side (2026-10-15; see lib/ai-edit.ts). The scan is Claude looking at the
 * picture, kept on the post so reopening costs nothing. The edit is charged first, made on Kie
 * (Nano Banana 2 or GPT Image 2), retried on Replicate's Nano Banana 2 when Kie is too slow (it
 * failed half its tasks that day), saved into our storage as a NEW Library post (the original
 * stays), and refunded once if anything fails.
 */
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const KIE = "https://api.kie.ai/api/v1/jobs";
const REPLICATE_NB2 = "https://api.replicate.com/v1/models/google/nano-banana-2/predictions";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCAN_MODEL = "claude-sonnet-5-5";

const urlsOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x);
  if (typeof v === "string" && v) { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [v]; } catch { return [v]; } }
  return [];
};
const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || u.includes("/video/upload/");
/** What Claude looks at: Cloudinary resizes on the fly; anything else goes as it is. */
const viewUrl = (u: string) => (u.includes("res.cloudinary.com/") && u.includes("/image/upload/") ? u.replace("/image/upload/", "/image/upload/c_limit,w_1280,h_1280/") : u);

type Post = { id: string; client_id: string; brand_id: string | null; content_type: string | null; caption: string | null; image_urls: unknown; xray: unknown };

async function loadPost(clientId: string, contentId: string): Promise<Result<{ post: Post; source: string }>> {
  if (!UUID.test(contentId)) return fail(400, "Invalid request");
  const { data } = await supabaseAdmin.from("content").select("id, client_id, brand_id, content_type, caption, image_urls, xray")
    .eq("id", contentId).eq("client_id", clientId).maybeSingle();
  if (!data) return fail(404, "Post not found.");
  const source = urlsOf(data.image_urls).find((u) => !isVideoUrl(u));
  if (!source) return fail(400, "Edit with AI works on pictures. This post has none.");
  return { ok: true, value: { post: data as Post, source } };
}

async function refund(clientId: string, credits: number, description: string, brandId: string | null) {
  await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: credits, p_operation: "refund", p_description: description, ...brandArg(brandId) }).then(() => {}, () => {});
}

export type ScanView = { scan: Scan; cached: boolean; credits: number; from: "scan" | "edit"; size: [number, number] | null };

/** The post's scan: the kept one when it still describes the picture, otherwise a new one (charged). */
export async function scanPost(clientId: string, contentId: string, refresh = false): Promise<Result<ScanView>> {
  const loaded = await loadPost(clientId, contentId);
  if (!loaded.ok) return loaded;
  const { post, source } = loaded.value;
  const kept = keptScan(post.xray, source);
  if (kept && !refresh) return { ok: true, value: { scan: kept.scan, cached: true, credits: 0, from: kept.from, size: kept.size ?? null } };

  let provider;
  try { provider = assistantProvider(); } catch { return fail(503, "Scanning isn't available right now."); }
  const pic = await safeFetchBytes(viewUrl(source), { maxBytes: 15_000_000, timeoutMs: 20_000 });
  if (!pic.ok) return fail(400, "Couldn't read this picture.");
  const size = imageSize(pic.bytes);
  if (!size) return fail(400, "This picture's format can't be scanned (JPEG, PNG or WebP).");
  const mediaType = pic.contentType.split(";")[0].trim();
  const inline = pic.bytes.length <= 3_700_000 && /^image\/(jpeg|png|webp)$/.test(mediaType);

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: clientId, p_amount: SCAN_CREDITS, p_operation: "xray_analysis", p_description: "Edit with AI: scan the picture", ...brandArg(post.brand_id),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return fail(402, `A scan is ${SCAN_CREDITS} credits and your balance is lower. Get more in Billing.`);

  const model = provider.name === "anthropic" ? SCAN_MODEL : ASSISTANT_MODEL;
  const res = await claudeFetch(provider, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 6000, system: scanSystem(size.width, size.height),
      messages: [{ role: "user", content: [
        inline
          ? { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(pic.bytes).toString("base64") } }
          : { type: "image", source: { type: "url", url: viewUrl(source) } },
        { type: "text", text: "Scan this picture." },
      ] }],
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const scan = validateScan(boxesToThousandths(jsonFrom(text), size.width, size.height));
  const usd = data ? estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }) : null;
  console.info("ai edit scan", JSON.stringify({ post: contentId, model, ok: !!scan, status: res?.status ?? null, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "xray_scan", provider: provider.name, model, usage: data ? { input: data.usage?.input_tokens, output: data.usage?.output_tokens } : null, usd, credits: scan ? SCAN_CREDITS : 0, ok: !!scan, meta: { post: contentId } });
  if (!scan) {
    await refund(clientId, SCAN_CREDITS, "Refund: Edit with AI scan failed", post.brand_id);
    return fail(502, `The scan didn't work this time. Your ${SCAN_CREDITS} credits were refunded. Try again.`);
  }
  const stored: StoredScan = { source, scan, at: new Date().toISOString(), from: "scan", size: [size.width, size.height] };
  await supabaseAdmin.from("content").update({ xray: stored }).eq("id", post.id).eq("client_id", clientId);
  return { ok: true, value: { scan, cached: false, credits: SCAN_CREDITS, from: "scan", size: stored.size ?? null } };
}

/** A swap picture: one you uploaded for this post, a Library post's picture, or a product photo, all yours. */
async function swapUrl(clientId: string, contentId: string, raw: unknown): Promise<string | null> {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.contentId === "string" && UUID.test(r.contentId)) {
    const { data } = await supabaseAdmin.from("content").select("image_urls").eq("id", r.contentId).eq("client_id", clientId).maybeSingle();
    return urlsOf(data?.image_urls).find((u) => !isVideoUrl(u)) ?? null;
  }
  if (typeof r.productId === "string" && UUID.test(r.productId)) {
    const { data } = await supabaseAdmin.from("products").select("image_url").eq("id", r.productId).eq("client_id", clientId).maybeSingle();
    return typeof data?.image_url === "string" && data.image_url ? data.image_url : null;
  }
  if (typeof r.upload === "string") {
    try {
      const url = new URL(r.upload);
      if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) return null;
      const path = decodeURIComponent(url.pathname).replace(/^\/storage\/v1\/object\/public\/assets\//, "");
      if (path === url.pathname || path.includes("..")) return null;
      return path.startsWith(`edits/${clientId}/${contentId}/`) || path.startsWith(`images/${clientId}/`) ? url.toString() : null;
    } catch { return null; }
  }
  return null;
}

export type Render = { ok: true; url: string; provider: "kie" | "replicate" } | { ok: false; url: null; reason: string; refused: boolean };
const REFUSED = /sensitive|nsfw|safety|policy|prohibit|flagged|violat|moderat/i;

async function kieRender(engine: EditEngine, prompt: string, images: string[], aspect: string, deadline: number, resolution = "1K"): Promise<Render> {
  const key = process.env.KIE_API_TOKEN;
  if (!key) return { ok: false, url: null, reason: "not configured", refused: false };
  const input = engine === "gpt-image-2-image-to-image"
    ? { prompt, input_urls: images, aspect_ratio: aspect, resolution }
    : { prompt, image_input: images, aspect_ratio: aspect, resolution, output_format: "jpg" };
  const created = await fetch(`${KIE}/createTask`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: engine, input }), signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const task = (await created?.json().catch(() => null)) as { data?: { taskId?: string }; msg?: string } | null;
  const taskId = task?.data?.taskId;
  if (!taskId) return { ok: false, url: null, reason: task?.msg || "busy", refused: false };
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${KIE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { data?: { state?: string; resultJson?: string; failMsg?: string; failCode?: string } } | null;
    if (d?.data?.state === "success") {
      try { const url = JSON.parse(d.data.resultJson || "{}").resultUrls?.[0]; if (typeof url === "string") return { ok: true, url, provider: "kie" }; } catch { /* below */ }
      return { ok: false, url: null, reason: "no picture came back", refused: false };
    }
    if (d?.data?.state === "fail") {
      const reason = `${d.data.failMsg || ""} ${d.data.failCode || ""}`.trim() || "failed";
      return { ok: false, url: null, reason, refused: REFUSED.test(reason) };
    }
  }
  return { ok: false, url: null, reason: "timeout", refused: false };
}

async function replicateRender(prompt: string, images: string[], aspect: string, deadline: number, resolution = "1K"): Promise<Render> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, url: null, reason: "no fallback", refused: false };
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const res = await fetch(REPLICATE_NB2, {
    method: "POST", headers: { ...headers, Prefer: "wait=60" },
    body: JSON.stringify({ input: { prompt, image_input: images, aspect_ratio: aspect, resolution, output_format: "jpg" } }),
    signal: AbortSignal.timeout(70_000),
  }).catch(() => null);
  let p = (await res?.json().catch(() => null)) as { id?: string; status?: string; output?: unknown; error?: unknown } | null;
  while (p?.id && !["succeeded", "failed", "canceled"].includes(p.status ?? "") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    p = r?.ok ? await r.json() : p;
  }
  const out = Array.isArray(p?.output) ? p?.output[0] : p?.output;
  if (p?.status === "succeeded" && typeof out === "string") return { ok: true, url: out, provider: "replicate" };
  const reason = String(p?.error || p?.status || "failed");
  return { ok: false, url: null, reason, refused: REFUSED.test(reason) };
}

/** Kie first; Replicate's Nano Banana 2 when Kie was slow, busy or errored (never when it refused the content). */
export async function renderEdit(engine: EditEngine, prompt: string, images: string[], aspect: string, deadline: number, resolution = "1K"): Promise<Render> {
  const first = await kieRender(engine, prompt, images, aspect, Math.min(deadline, Date.now() + 150_000), resolution);
  if (first.ok || first.refused) return first;
  const second = await replicateRender(prompt, images, aspect, deadline, resolution);
  return second.ok ? second : first;
}

export type ApplyInput = { clientId: string; contentId: string; changes: unknown; swaps: unknown; engine: unknown };
export type ApplyView = { contentId: string; url: string; credits: number; provider: "kie" | "replicate" };

/** Charge, make the edited picture, and add it to the Library as a new post that starts pre-scanned. */
export async function applyEdit(input: ApplyInput): Promise<Result<ApplyView>> {
  const loaded = await loadPost(input.clientId, input.contentId);
  if (!loaded.ok) return loaded;
  const { post, source } = loaded.value;
  const kept = keptScan(post.xray, source);
  if (!kept) return fail(409, "Scan the picture first.");
  const engine: EditEngine = EDIT_ENGINES.find((e) => e === input.engine) ?? "nano-banana-2";

  const rawSwaps = input.swaps && typeof input.swaps === "object" ? Object.entries(input.swaps as Record<string, unknown>) : [];
  if (rawSwaps.length > MAX_SWAPS) return fail(400, `Swap up to ${MAX_SWAPS} things at a time.`);
  const swapOrder: string[] = [];
  const swapImages: string[] = [];
  for (const [id, raw] of rawSwaps) {
    if (!kept.scan.objects.some((o) => o.id === id)) return fail(400, "Invalid request");
    const url = await swapUrl(input.clientId, post.id, raw);
    if (!url) return fail(404, "One of the swap pictures wasn't found.");
    swapOrder.push(id);
    swapImages.push(url);
  }
  const changes = normalizeChanges(kept.scan, input.changes, swapOrder);
  if (!changeCount(changes)) return fail(400, "Change something first.");
  const prompt = buildEditPrompt(kept.scan, changes, swapOrder);
  let size = kept.size;
  if (!size) {
    const pic = await safeFetchBytes(viewUrl(source), { maxBytes: 15_000_000, timeoutMs: 20_000 });
    const s = pic.ok ? imageSize(pic.bytes) : null;
    size = s ? [s.width, s.height] : undefined;
  }
  const aspect = size ? aspectFor(size[0], size[1]) : "1:1";

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: input.clientId, p_amount: EDIT_CREDITS, p_operation: "image_edit", p_description: `Edit with AI [post:${post.id}]`, ...brandArg(post.brand_id),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return fail(402, `An edit is ${EDIT_CREDITS} credits and your balance is lower. Get more in Billing.`);

  // The result's post exists before the render, so a closed tab still gets the picture it paid for.
  const caption = String(post.caption ?? "").replace(/^Edited · /, "").slice(0, 260);
  const { data: placeholder } = await supabaseAdmin.from("content").insert({
    client_id: input.clientId, brand_id: post.brand_id, status: "draft",
    content_type: post.content_type && !["sequence_clip", "raw_clip"].includes(post.content_type) ? post.content_type : "post_image",
    caption: `Edited · ${caption}`.trim(), ai_model: engine, generation_status_text: "Making your edit",
    creation_metadata: { operation: "ai_edit", source_content_id: post.id, engine, changes: changeCount(changes), credits: EDIT_CREDITS },
  }).select("id").single();
  const undo = async (message: string, status = 502) => {
    if (placeholder?.id) await supabaseAdmin.from("content").delete().eq("id", placeholder.id).eq("client_id", input.clientId).then(() => {}, () => {});
    await refund(input.clientId, EDIT_CREDITS, `Refund: Edit with AI failed [post:${post.id}]`, post.brand_id);
    return fail(status, message);
  };
  if (!placeholder?.id) return undo("Couldn't start the edit. Your credits were refunded.", 500);

  try {
    const rendered = await renderEdit(engine, prompt, [source, ...swapImages], aspect, Date.now() + 230_000);
    console.info("ai edit render", JSON.stringify({ post: post.id, engine, aspect, changes: changeCount(changes), swaps: swapOrder.length, ...(rendered.ok ? { provider: rendered.provider } : { reason: rendered.reason.slice(0, 120) }) }));
    if (!rendered.ok) {
      return undo(rendered.refused
        ? `The image service's safety filter refused this edit. Your ${EDIT_CREDITS} credits were refunded. Try different wording.`
        : `The image service couldn't make this edit just now (on its side). Your ${EDIT_CREDITS} credits were refunded. Try again in a minute.`);
    }
    const file = await safeFetchBytes(rendered.url, { maxBytes: 25_000_000, timeoutMs: 45_000 });
    if (!file.ok) return undo(`Couldn't save the edited picture. Your ${EDIT_CREDITS} credits were refunded.`);
    // A free account's edit carries the BlinkSpot stamp (same corner, so an edit of an edit lines up).
    const pic = await stampIfFree(input.clientId, file.bytes, file.contentType);
    const png = pic.contentType.includes("png");
    const path = `images/${input.clientId}/${pic.stamped ? "stamped_" : ""}edit_${Date.now()}.${png ? "png" : "jpg"}`;
    const up = await supabaseAdmin.storage.from("assets").upload(path, pic.bytes, { contentType: png ? "image/png" : "image/jpeg" });
    if (up.error) return undo(`Couldn't save the edited picture. Your ${EDIT_CREDITS} credits were refunded.`);
    const url = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    const outSize = imageSize(pic.bytes);
    const xray: StoredScan = { source: url, scan: scanAfterEdit(kept.scan, changes), at: new Date().toISOString(), from: "edit", ...(outSize ? { size: [outSize.width, outSize.height] as [number, number] } : {}) };
    await supabaseAdmin.from("content").update({ image_urls: [url], generation_status_text: null, image_prompt_used: prompt.slice(0, 4000), xray }).eq("id", placeholder.id);
    return { ok: true, value: { contentId: placeholder.id, url, credits: EDIT_CREDITS, provider: rendered.provider } };
  } catch {
    return undo(`The edit failed. Your ${EDIT_CREDITS} credits were refunded.`);
  }
}
