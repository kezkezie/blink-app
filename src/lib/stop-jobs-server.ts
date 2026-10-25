import { supabaseAdmin } from "@/lib/supabase-server";
import { brandArg } from "@/lib/credits-meter";
import { stopImageJobs } from "@/lib/image-jobs-server";
import { stopVideoJob } from "@/lib/video-rescue-server";

/**
 * Stop anything still being made (Kezie, 2026-10-25: "a way to stop any kind of AI generation",
 * for the button pushed by mistake). One call for every kind of post that's still generating:
 * - images (server-owned jobs): removed, credits back (lib/image-jobs-server.ts);
 * - videos on the app's own path (AI connections, second tries): the Replicate prediction is
 *   cancelled and the post removed; they're charged only on delivery;
 * - videos n8n is making (Create, scenes, lip-sync, Video Inspo): n8n charges at the start, so the
 *   charge is refunded from the ledger and the post removed. The same compare-and-set n8n uses
 *   (billing_state refund_pending) means n8n can't save or refund it again afterwards;
 * - an Edit with AI still being made (its post says "Making your edit" until it's saved): removed
 *   and refunded here; the edit sees its post gone and doesn't save (lib/ai-edit-server.ts).
 * The provider may still finish its render (Kie has no cancel); the result is never saved.
 */
export type StopResult = { stopped: string[]; refunded: number; starting: string[]; notStopped: string[] };

const VIDEO_TYPES = new Set(["video", "reel", "sequence_clip", "raw_clip", "story_sequence"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What this post's video has cost so far, from the credit ledger (n8n tags its rows [vid:<id>]). */
async function videoCharge(clientId: string, id: string) {
  const { data } = await supabaseAdmin.from("credit_transactions").select("amount").eq("client_id", clientId).like("description", `%[vid:${id}]%`);
  return -(data ?? []).reduce((n, r) => n + (Number(r.amount) || 0), 0);
}

async function stopN8nVideo(clientId: string, row: { id: string; brand_id: string | null }, waitMs: number): Promise<{ state: "stopped"; credits: number } | { state: "starting" | "gone" }> {
  // n8n charges a few seconds after the start. Wait for that charge, so nothing is charged after a stop.
  let charged = await videoCharge(clientId, row.id);
  for (let waited = 0; charged <= 0 && waited < waitMs; waited += 2000) { await sleep(2000); charged = await videoCharge(clientId, row.id); }
  if (charged <= 0) return { state: "starting" };
  const { data: claimed } = await supabaseAdmin.from("content").update({ billing_state: "refund_pending", updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("client_id", clientId).or("generation_state.eq.generating,generation_state.is.null")
    .or("billing_state.is.null,billing_state.in.(not_charged,charged,refund_failed)").select("id");
  if (!claimed?.length) return { state: "gone" };
  const { error } = await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: charged, p_operation: "refund", p_description: `Refund: video stopped [vid:${row.id}]`, ...brandArg(row.brand_id) });
  if (error) {
    await supabaseAdmin.from("content").update({ billing_state: "refund_failed", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { state: "gone" };
  }
  await supabaseAdmin.from("content").delete().eq("id", row.id).eq("client_id", clientId);
  return { state: "stopped", credits: charged };
}

export async function stopJobs(clientId: string, ids: string[], opts: { waitMs?: number } = {}): Promise<StopResult> {
  // Older video screens make the post without a generation_state: those count while they have no video.
  const { data } = await supabaseAdmin.from("content").select("id, brand_id, content_type, generation_state, generation_status_text, creation_metadata, video_urls")
    .eq("client_id", clientId).in("id", ids).or("generation_state.eq.generating,generation_state.is.null");
  const meta = (r: NonNullable<typeof data>[number]) => (r.creation_metadata ?? {}) as { job?: unknown; video_rescue?: unknown; operation?: unknown; credits?: unknown; source_content_id?: unknown };
  const isEdit = (r: NonNullable<typeof data>[number]) => meta(r).operation === "ai_edit" && !!r.generation_status_text;
  const rows = (data ?? []).filter((r) => r.generation_state === "generating" || isEdit(r) || (VIDEO_TYPES.has(String(r.content_type)) && !(r.video_urls as string[] | null)?.length));
  const images = rows.filter((r) => meta(r).job).map((r) => r.id as string);
  const img = images.length ? await stopImageJobs(clientId, images) : { stopped: [], refunded: 0 };
  const stopped = [...img.stopped], starting: string[] = [];
  let refunded = img.refunded;
  for (const r of rows) {
    if (meta(r).job) continue;
    if (isEdit(r)) {
      const { data: gone } = await supabaseAdmin.from("content").delete().eq("id", r.id).eq("client_id", clientId).not("generation_status_text", "is", null).select("id");
      if (!gone?.length) continue;
      const credits = Number(meta(r).credits) || 0;
      if (credits > 0) await supabaseAdmin.rpc("refund_credits", { p_client_id: clientId, p_amount: credits, p_operation: "refund", p_description: `Refund: Edit with AI stopped [post:${String(meta(r).source_content_id ?? r.id)}]`, ...brandArg((r.brand_id as string | null) ?? null) }).then(() => {}, () => {});
      stopped.push(r.id as string); refunded += credits;
      continue;
    }
    if (meta(r).video_rescue) { if (await stopVideoJob(clientId, r.id as string)) stopped.push(r.id as string); continue; }
    if (!VIDEO_TYPES.has(String(r.content_type))) continue;
    const out = await stopN8nVideo(clientId, { id: r.id as string, brand_id: (r.brand_id as string | null) ?? null }, opts.waitMs ?? 10_000);
    if (out.state === "stopped") { stopped.push(r.id as string); refunded += out.credits; }
    if (out.state === "starting") starting.push(r.id as string);
  }
  return { stopped, refunded, starting, notStopped: ids.filter((id) => !stopped.includes(id) && !starting.includes(id)) };
}
