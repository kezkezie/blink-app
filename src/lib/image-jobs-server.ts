import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-server";
import { authorizeImageWorkflow, parseImageWorkflowRequest } from "@/lib/execution-security";
import { brandArg } from "@/lib/credits-meter";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { renderEdit } from "@/lib/ai-edit-server";
import { readableRequest } from "@/lib/image-refs";
import {
  FINAL_FAILURE, FIRST_TRY_MS, LOW_BALANCE_FOR_RESCUE, RESCUE_AFTER_MS, RESCUE_DEAD_MS, RESCUE_ENGINE, STATUS,
  classifyRouter, jobSpecFrom, jobView, rescueCredits, validJobSpec, type ImageJobSpec, type JobView, type RouterOutcome,
} from "@/lib/image-jobs";
import { logAiUsage, USD_PER_CREDIT } from "@/lib/ai-usage";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { STOP_COST_USD, atCostSplit, stopSplit } from "@/lib/stop-refund";
import { kickStamp, stampImageBytes, stampImages, workspaceNeedsStamp } from "@/lib/stamp-server";
import { stampPending } from "@/lib/stamp";

/**
 * Image jobs, server side (lib/image-jobs.ts). startImageJobs makes the Library posts and runs the
 * first try in the background; a failed first try calls /api/images/rescue (a fresh function, its
 * own time budget) for the second. jobStatuses is what the browser polls; it also rescues jobs
 * whose function died. makeImageNow does both tries inside one request for in-editor edits that
 * don't become a post.
 */
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const n8nUrl = () => `${process.env.N8N_WEBHOOK_BASE || process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE || "https://n8n.srv1166077.hstgr.cloud/webhook"}/blink-generate-images`;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const sigKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function signRescue(id: string, ts: number) {
  return createHmac("sha256", sigKey()).update(`image-rescue.${id}.${ts}`).digest("hex");
}
export function checkRescueSignature(id: string, ts: number, sig: string) {
  if (!sigKey() || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false;
  const want = Buffer.from(signRescue(id, ts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The browser's request, checked exactly as /api/workflows checks it (brand, references, ids). */
export async function authorizeImageRequest(userId: string, raw: unknown): Promise<Result<Record<string, unknown>>> {
  const body = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : null;
  if (!body) return fail(400, "Invalid request");
  delete body.post_id;
  const parsed = parseImageWorkflowRequest(body);
  if (!parsed) return fail(400, "Invalid request");
  const authorized = await authorizeImageWorkflow(userId, parsed);
  if (!authorized.ok) return fail(authorized.status, authorized.error);
  // SVG logos and WebP/GIF pictures go as PNG copies (the services refuse them: "File type not supported").
  return { ok: true, value: await readableRequest(String(authorized.value.client_id), authorized.value) };
}

async function askRouter(payload: Record<string, unknown>, postId: string | null, budgetMs = FIRST_TRY_MS): Promise<RouterOutcome> {
  try {
    const res = await fetch(n8nUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify({ ...payload, ...(postId ? { post_id: postId } : {}), is_sync: true }),
      signal: AbortSignal.timeout(budgetMs),
    });
    return classifyRouter(res.status, await res.json().catch(() => null));
  } catch (e) {
    return classifyRouter(null, null, e instanceof Error && /timeout|abort/i.test(e.name + e.message));
  }
}

const update = async (id: string, patch: Record<string, unknown>): Promise<void> => {
  await supabaseAdmin.from("content").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).then(() => {}, () => {});
};

async function settleFirst(id: string, outcome: RouterOutcome, stoppedRefund?: { clientId: string; brandId: string | null; credits: number }, meta?: Record<string, unknown>) {
  if (outcome.kind === "image") {
    // A free account's pictures get the BlinkSpot stamp before they're shown (lib/stamp.ts).
    let urls = outcome.urls, stampPatch = {};
    if (meta?.stamp === true && stoppedRefund) {
      const out = await stampImages(urls, stoppedRefund.clientId);
      urls = out.urls;
      stampPatch = { creation_metadata: { ...meta, stamp_state: out.failed ? "failed" : "done", stamp_at: new Date().toISOString() } };
    }
    const { data: kept } = await supabaseAdmin.from("content").update({ image_urls: urls, ...stampPatch, generation_state: "succeeded", generation_status_text: null, generation_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("id");
    // Stopped meanwhile (the post is gone): the stop itself settled what comes back (stopImageJobs,
    // 2026-10-26), so nothing is refunded here; the picture n8n made is simply not kept.
    if (!kept?.length) console.info("image arrived after a stop", id);
  } else if (outcome.kind === "refused" || outcome.kind === "no_credits") {
    await update(id, { generation_state: "failed", generation_error_code: outcome.kind, generation_status_text: outcome.message || FINAL_FAILURE(0), retry_state: "retry_available", generation_completed_at: new Date().toISOString() });
  } else if (outcome.kind === "waiting") {
    await update(id, { generation_status_text: STATUS.slow });
  } else {
    await update(id, { generation_status_text: STATUS.rescue });
    await kickRescue(id);
  }
}

/** Ask a fresh function to make the second try (it answers at once and works in the background). */
export async function kickRescue(id: string) {
  const ts = Date.now();
  await fetch(`${appUrl()}/api/images/rescue`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ts, sig: signRescue(id, ts) }), signal: AbortSignal.timeout(15_000),
  }).catch((e) => console.warn("image rescue kick failed", id, e instanceof Error ? e.message : e));
}

export async function startImageJobs(userId: string, raw: unknown, count: number, caption: string): Promise<Result<{ ids: string[]; work: Promise<void> }>> {
  const auth = await authorizeImageRequest(userId, raw);
  if (!auth.ok) return auth;
  const payload = auth.value;
  const spec = jobSpecFrom(payload);
  const n = Math.min(4, Math.max(1, Math.floor(count) || 1));
  const now = new Date().toISOString();
  const meta: Record<string, unknown> = { operation: "generate", job: spec, ...((await workspaceNeedsStamp(payload.client_id as string)) ? { stamp: true } : {}) };
  const { data, error } = await supabaseAdmin.from("content").insert(Array.from({ length: n }, () => ({
    client_id: payload.client_id, brand_id: payload.brand_id, content_type: "post_image", status: "draft",
    caption: caption.slice(0, 300) || null, ai_model: typeof payload.kie_model === "string" ? payload.kie_model : null,
    generation_state: "generating", generation_status_text: STATUS.making, generation_started_at: now, generation_attempt: 1, retry_state: "none",
    creation_metadata: meta,
  }))).select("id");
  if (error || !data?.length) return fail(500, "Couldn't start the image. Nothing was charged.");
  const ids = data.map((r) => r.id as string);
  // Cost log (2026-10-20): every first try, so second tries per engine can be counted against them.
  const perImage = IMAGE_ENGINE_REGISTRY[spec.engine === "nano-banana-2" ? "nb2" : spec.engine]?.creditCost ?? 8;
  for (const id of ids) logAiUsage({ feature: "image", provider: "n8n", model: spec.engine, clientId: payload.client_id as string, userId, brandId: payload.brand_id as string | null, usd: perImage * USD_PER_CREDIT, credits: perImage, meta: { post: id } });
  const stoppedRefund = { clientId: payload.client_id as string, brandId: (payload.brand_id as string | null) ?? null, credits: perImage };
  const work = Promise.all(ids.map(async (id) => settleFirst(id, await askRouter(payload, id), stoppedRefund, meta))).then(() => {});
  return { ok: true, value: { ids, work } };
}

/** The second try: Nano Banana 2 on Kie, then on Replicate, charged like the first, refunded on failure. */
export async function rescue(id: string): Promise<void> {
  const { data: row } = await supabaseAdmin.from("content").select("id, client_id, brand_id, image_urls, generation_state, generation_attempt, creation_metadata").eq("id", id).maybeSingle();
  // A post that has its pictures (waiting for the stamp, at most) never needs a second try.
  if (!row || (Array.isArray(row.image_urls) && row.image_urls.length) || jobView(row).state !== "making") return;
  const spec = validJobSpec((row.creation_metadata as { job?: unknown } | null)?.job);
  const stamp = (row.creation_metadata as { stamp?: unknown } | null)?.stamp === true;
  if (!spec) { await update(id, { generation_state: "failed", generation_status_text: FINAL_FAILURE(0), generation_error_code: "no_spec" }); return; }
  // Claim it: only one rescue per post, whoever calls first.
  const { data: claimed } = await supabaseAdmin.from("content")
    .update({ generation_attempt: 2, retry_state: "retrying", generation_status_text: STATUS.rescue, updated_at: new Date().toISOString() })
    .eq("id", id).eq("generation_attempt", 1).is("generation_completed_at", null).select("id");
  if (!claimed?.length) return;
  // A post the person stopped meanwhile was refunded then: its failed second try refunds nothing more.
  const stillThere = async () => { try { return !!(await supabaseAdmin.from("content").select("id").eq("id", id).maybeSingle()).data; } catch { return true; } };
  const outcome = await secondTry(row.client_id as string, row.brand_id as string | null, spec, `post:${id}`, () => update(id, { billing_state: "charged" }), stillThere, stamp);
  if (outcome.ok) {
    await update(id, {
      image_urls: [outcome.url], generation_state: "succeeded", generation_status_text: null, generation_completed_at: new Date().toISOString(),
      retry_state: "none", billing_state: "charged", ai_model: RESCUE_ENGINE,
      creation_metadata: { ...(row.creation_metadata as object), rescued: { engine: RESCUE_ENGINE, provider: outcome.provider, credits: outcome.credits, from: spec.engine }, ...(stamp ? { stamp_state: outcome.stamped ? "done" : "failed", stamp_at: new Date().toISOString() } : {}) },
    });
  } else {
    await update(id, { generation_state: "failed", generation_status_text: outcome.message, generation_error_code: outcome.code, retry_state: "retry_available", billing_state: outcome.charged ? "refunded" : "not_charged", generation_completed_at: new Date().toISOString() });
  }
}

type SecondTry = { ok: true; url: string; provider: string; credits: number; stamped: boolean } | { ok: false; message: string; code: string; charged: boolean };

async function secondTry(clientId: string, brandId: string | null, spec: ImageJobSpec, label: string, onCharged?: () => Promise<void>, refundIf?: () => Promise<boolean>, stamp = false): Promise<SecondTry> {
  const credits = rescueCredits(spec.engine);
  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: clientId, p_amount: credits, p_operation: "debit", p_description: `Image, second try [${label}]`, ...brandArg(brandId),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return { ok: false, message: LOW_BALANCE_FOR_RESCUE, code: "no_credits", charged: false };
  await onCharged?.();
  const refund = async () => {
    if (refundIf && !(await refundIf())) return;
    await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: credits, p_operation: "refund", p_description: `Refund: image second try failed [${label}]`, ...brandArg(brandId) }).then(() => {}, () => {});
  };
  const rendered = await renderEdit(RESCUE_ENGINE, spec.prompt, spec.references, spec.aspect, Date.now() + 230_000, "2K");
  console.info("image rescue", JSON.stringify({ label, from: spec.engine, ...(rendered.ok ? { provider: rendered.provider } : { reason: rendered.reason.slice(0, 120), refused: rendered.refused }) }));
  // Replicate's Nano Banana 2 at 2K is $0.101; Kie's is about 18 of its credits. A Fast first try charges 6 for it.
  logAiUsage({ feature: "image_second_try", provider: rendered.ok ? (rendered.provider === "replicate" ? "replicate" : "kie") : "replicate", model: RESCUE_ENGINE, clientId, brandId, usd: rendered.ok ? (rendered.provider === "replicate" ? 0.101 : 18 * USD_PER_CREDIT) : 0, credits: rendered.ok ? credits : 0, ok: rendered.ok, meta: { from: spec.engine, label } });
  if (!rendered.ok) {
    await refund();
    return { ok: false, charged: true, code: rendered.refused ? "refused" : "rescue_failed", message: rendered.refused ? `The image service's safety filter refused this one. Your credits are back. Try different wording.` : FINAL_FAILURE(credits) };
  }
  // A stable copy in our storage (provider links expire), with the stamp for a free account.
  const file = await safeFetchBytes(rendered.url, { maxBytes: 25_000_000, timeoutMs: 45_000 });
  let bytes: Uint8Array | null = file.ok ? file.bytes : null, png = file.ok && file.contentType.includes("png"), stamped = false;
  if (bytes && stamp) {
    try { const s = await stampImageBytes(bytes); bytes = s.bytes; png = s.type === "image/png"; stamped = true; }
    catch (e) { console.warn("stamp failed", "image", label, e instanceof Error ? e.message : e); }
  }
  const path = `images/${clientId}/${stamped ? "stamped" : "gen"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${png ? "png" : "jpg"}`;
  const up = bytes ? await supabaseAdmin.storage.from("assets").upload(path, bytes, { contentType: png ? "image/png" : "image/jpeg" }) : null;
  if (!up || up.error) { await refund(); return { ok: false, charged: true, code: "save_failed", message: FINAL_FAILURE(credits) }; }
  return { ok: true, url: supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl, provider: rendered.provider, credits, stamped };
}

/**
 * Stop images still being made (2026-10-22, test users asked for a Stop button): the post is
 * removed, so a picture arriving later lands nowhere. The credits come back once: a first try's
 * from n8n (it refunds when it can't save to the removed post) or from settleFirst (when n8n
 * delivered anyway); a second try's here (charged here; its own failure refund then skips).
 */
export async function stopImageJobs(clientId: string, ids: string[]): Promise<{ stopped: string[]; refunded: number; kept: number }> {
  const { data } = await supabaseAdmin.from("content").select("id, brand_id, generation_state, generation_attempt, billing_state, creation_metadata")
    .eq("client_id", clientId).in("id", ids).eq("generation_state", "generating");
  const stopped: string[] = [];
  let refunded = 0, keptTotal = 0;
  for (const r of data ?? []) {
    const spec = validJobSpec((r.creation_metadata as { job?: unknown } | null)?.job);
    if (!spec) continue;
    const second = (Number(r.generation_attempt) || 1) >= 2;
    // A first try is charged by n8n as it starts, and nothing else reliably settles it after a stop
    // (n8n saves into the removed post without noticing; the function waiting for it may be gone), so
    // the stop settles it here, once. The image service has started and can't be cancelled, so what it
    // bills is kept and the rest comes back (lib/stop-refund.ts, 2026-10-26).
    const firstCost = IMAGE_ENGINE_REGISTRY[spec.engine === "nano-banana-2" ? "nb2" : spec.engine]?.creditCost ?? 0;
    const charged = second ? (r.billing_state === "charged" ? rescueCredits(spec.engine) : 0) : firstCost;
    const split = second ? stopSplit(charged, STOP_COST_USD.secondTryPicture) : atCostSplit(charged);
    const credits = split.back;
    const { data: gone } = await supabaseAdmin.from("content").delete().eq("id", r.id).eq("client_id", clientId).eq("generation_state", "generating").select("id");
    if (!gone?.length) continue;
    stopped.push(r.id as string);
    keptTotal += split.kept;
    if (credits > 0) {
      await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: credits, p_operation: "refund", p_description: `Refund: image stopped [post:${r.id}]`, ...brandArg(r.brand_id as string | null) }).then(() => {}, () => {});
      refunded += credits;
    }
  }
  return { stopped, refunded, kept: keptTotal };
}

/**
 * Both tries inside this request, no post (editor edits, first frames): the picture's URL or why
 * not. Stopped in the browser (`signal`, 2026-10-25): the router has charged for a picture it made,
 * so that picture's credits go back; no second try starts. (Its answer is waited for: a failed first
 * try is refunded by n8n itself.)
 */
export async function makeImageNow(userId: string, raw: unknown, signal?: AbortSignal): Promise<Result<{ url: string; rescued: boolean }>> {
  const auth = await authorizeImageRequest(userId, raw);
  if (!auth.ok) return auth;
  const first = await askRouter(auth.value, null, 150_000);
  const spec = jobSpecFrom(auth.value);
  if (signal?.aborted) {
    if (first.kind === "image") {
      const credits = IMAGE_ENGINE_REGISTRY[spec.engine === "nano-banana-2" ? "nb2" : spec.engine]?.creditCost ?? 0;
      if (credits > 0) await supabaseAdmin.rpc("refund_credits", { p_client_id: auth.value.client_id as string, p_amount: credits, p_operation: "refund", p_description: "Refund: image stopped", ...brandArg((auth.value.brand_id as string | null) ?? null) }).then(() => {}, () => {});
    }
    return fail(499, "Stopped.");
  }
  if (first.kind === "image") return { ok: true, value: { url: first.urls[0], rescued: false } };
  if (first.kind === "refused" || first.kind === "no_credits") return fail(first.kind === "no_credits" ? 402 : 422, first.message || FINAL_FAILURE(0));
  const second = await secondTry(auth.value.client_id as string, (auth.value.brand_id as string) ?? null, spec, "direct");
  return second.ok ? { ok: true, value: { url: second.url, rescued: true } } : fail(second.code === "no_credits" ? 402 : 502, second.message);
}

/**
 * What the browser polls. A first try silent for RESCUE_AFTER_MS gets its rescue now (its function
 * may have died); a rescue silent for RESCUE_DEAD_MS is closed and refunded.
 */
export async function jobStatuses(canRead: (row: { client_id: string; brand_id: string | null }) => Promise<boolean>, ids: string[]): Promise<{ jobs: JobView[]; rescues: string[] }> {
  const { data } = await supabaseAdmin.from("content")
    .select("id, client_id, brand_id, image_urls, generation_state, generation_status_text, generation_attempt, generation_started_at, updated_at, billing_state, creation_metadata")
    .in("id", ids);
  const rows = [];
  for (const r of data ?? []) if (await canRead({ client_id: r.client_id as string, brand_id: r.brand_id as string | null })) rows.push(r);
  const rescues: string[] = [];
  const now = Date.now();
  for (const r of rows) {
    // Pictures waiting for their stamp: if the first-try function died before stamping, stamp them now.
    const urls = Array.isArray(r.image_urls) ? r.image_urls.filter((u: unknown): u is string => typeof u === "string") : [];
    if (urls.length && stampPending(r.creation_metadata, urls)) {
      if (now - new Date((r.updated_at ?? r.generation_started_at) as string).getTime() > 25_000) await kickStamp(r.id as string, "image", (r.creation_metadata ?? {}) as Record<string, unknown>);
      continue;
    }
    if (jobView(r).state !== "making" || r.generation_state !== "generating") continue;
    const quiet = now - new Date((r.updated_at ?? r.generation_started_at) as string).getTime();
    if ((r.generation_attempt ?? 1) <= 1 && quiet > RESCUE_AFTER_MS) rescues.push(r.id as string);
    else if ((r.generation_attempt ?? 1) >= 2 && quiet > RESCUE_DEAD_MS) {
      const spec = validJobSpec((r.creation_metadata as { job?: unknown } | null)?.job);
      // Only what the rescue actually took comes back, once (the status flip is the guard).
      const credits = spec && r.billing_state === "charged" ? rescueCredits(spec.engine) : 0;
      const { data: closed } = await supabaseAdmin.from("content").update({ generation_state: "failed", generation_status_text: FINAL_FAILURE(credits), generation_error_code: "rescue_died", billing_state: credits ? "refunded" : "not_charged", retry_state: "retry_available", updated_at: new Date().toISOString() })
        .eq("id", r.id).eq("generation_state", "generating").select("id");
      if (closed?.length && credits) await supabaseAdmin.rpc("refund_credits", { p_client_id: r.client_id, p_amount: credits, p_operation: "refund", p_description: `Refund: image second try stopped [post:${r.id}]`, ...brandArg(r.brand_id) }).then(() => {}, () => {});
      r.generation_state = "failed"; r.generation_status_text = FINAL_FAILURE(credits);
    }
  }
  return { jobs: rows.map(jobView), rescues };
}
