import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { AssistantUnavailableError, assistantModelFor, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { realSpeech, transcribeCredits, transcriptForModel, validateHighlights, type Segment } from "@/lib/editor/highlights";
import { requestWorkspace } from "@/lib/brand-access";
import { brandArg } from "@/lib/credits-meter";
import { stopGuard } from "@/lib/stop-server";
import { stopSplit, transcriptionUsd } from "@/lib/stop-refund";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Editor AI (2026-10-11): captions for a video, or the best short moments of a long one.
 * The browser extracts the audio (mono, 16 kHz, 32 kb/s) into the user's own edits folder; this
 * transcribes it with timestamps (Whisper, $0.006/min) and, for shorts, asks Claude to pick the
 * moments. Charged 2 credits per started minute up front, refunded if anything fails. The
 * picking itself is not charged (like Ask). Up to 90 minutes.
 */
export const maxDuration = 300;
const MAX_SECONDS = 90 * 60;

const PICK = `You are a short-form video editor for small brands. From a timestamped transcript of a long video, pick the best moments to post as Reels/TikToks.
Good moments: a strong first line (a hook within 2 seconds), one complete idea, a payoff or punchline, quotable, makes sense with no context. Avoid intros, sign-offs, "um" stretches and half-sentences.
Reply with JSON only: {"highlights":[{"title":"3-6 words","start":seconds,"end":seconds,"hook":"the opening line, as said","caption":"a 1-2 sentence post caption in the brand's voice"}]}
Use exact times from the transcript (start at a line's start, end at a line's end). Return the requested number of moments, best first, never overlapping.`;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Transcription is not configured." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const mode = body.mode === "highlights" ? "highlights" : "captions";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const seconds = Number(body.seconds);
  const count = Math.min(3, Math.max(1, Math.round(Number(body.count) || 3)));
  const target = [15, 30, 60].includes(Number(body.target)) ? Number(body.target) : 30;
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 300) : "";
  if (!Number.isFinite(seconds) || seconds <= 0) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (seconds > MAX_SECONDS) return NextResponse.json({ error: "That's longer than 90 minutes. Trim it first, or split it in two." }, { status: 413 });

  const client = await requestWorkspace(request, auth.value, body.brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  // Any plan with credits (Kezie, 2026-10-12: credits unlock every AI feature).
  if (!audioUrl || !(await verifyOwnedInspirationImage(client.id, audioUrl))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const limit = await consumeAiLimits(auth.value, ["clip_ai"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const credits = transcribeCredits(seconds);
  const label = mode === "highlights" ? "Editor: shorts from a long video" : "Editor: captions";
  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: client.id, p_amount: credits, p_operation: "debit", p_description: `${label} (${Math.ceil(seconds / 60)} min)`, ...brandArg(body.brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `Not enough credits (this needs ${credits}). Get more in Billing.` }, { status: 402 });
  // Stopped in the browser or failed: the credits come back once (lib/stop-server.ts).
  // A stop keeps what transcribing had already cost; a failure gives all of it back.
  const guard = stopGuard(request, (why) => {
    const back = why === "fail" ? credits : stopSplit(credits, transcriptionUsd(seconds, mode !== "captions")).back;
    return back > 0 ? supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: back, p_operation: "credit", p_description: `Refund: ${label.toLowerCase()} ${why === "fail" ? "failed" : "stopped"}`, ...brandArg(body.brandId) }) : Promise.resolve();
  });
  const refund = () => guard.fail();

  try {
    const got = await safeFetchBytes(audioUrl, { maxBytes: 25_000_000, timeoutMs: 30_000 });
    if (!got.ok) { await refund(); return NextResponse.json({ error: "Couldn't read the audio. Your credits were refunded." }, { status: 502 }); }
    const form = new FormData();
    form.append("file", new Blob([got.bytes as BlobPart], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    if (hint) form.append("prompt", hint);
    // Stop in the browser ends the calls here too, and the credits come back (2026-10-25).
    const stopped = () => guard.stopped;
    const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]) }).catch(() => null);
    const data = (await tr?.json().catch(() => ({}))) as { segments?: Array<{ start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }>; duration?: number; error?: { message?: string } } | undefined;
    if (stopped()) return NextResponse.json({ error: "Stopped." }, { status: 499 }); // the stop already settled it
    if (!tr || !tr.ok || !Array.isArray(data?.segments)) {
      console.error("highlights transcribe failed", tr?.status, data?.error?.message);
      await refund();
      return NextResponse.json({ error: "Couldn't transcribe it. Your credits were refunded." }, { status: 502 });
    }
    // Whisper's invented lines over music or silence are dropped (lib/editor/highlights.ts realSpeech).
    const segments: Segment[] = realSpeech(data.segments.map((s) => ({ ...s, start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100, text: String(s.text || "").trim() })).filter((s) => s.text && s.end > s.start));
    const duration = Number(data.duration) || seconds;
    if (mode === "captions") return guard.done() ? NextResponse.json({ segments, duration, credits }) : NextResponse.json({ error: "Stopped." }, { status: 499 });
    if (!segments.length) return guard.done() ? NextResponse.json({ segments, duration, credits, highlights: [], note: "Nobody speaks in this video, so there are no moments to pick from the words. Try Cut to the beat instead." }) : NextResponse.json({ error: "Stopped." }, { status: 499 });

    // The brand, briefly, so captions sound like it.
    let brandLine = "";
    if (typeof body.brandId === "string" && /^[0-9a-f-]{36}$/i.test(body.brandId)) {
      const { data: b } = await supabaseAdmin.from("brand_profiles").select("brand_name, brand_voice, description").eq("id", body.brandId).eq("client_id", client.id).maybeSingle();
      if (b) brandLine = `Brand: ${b.brand_name}. ${b.description ?? ""} Voice: ${b.brand_voice ?? "warm, plain"}.`;
    }
    let provider;
    try { provider = assistantProvider(); } catch (e) {
      await refund();
      return NextResponse.json({ error: e instanceof AssistantUnavailableError ? e.message : "The AI isn't available." }, { status: 503 });
    }
    const model = assistantModelFor("chat", provider.name);
    const res = await claudeFetch(provider, {
      method: "POST",
      headers: { ...provider.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 3000, system: PICK,
        messages: [{ role: "user", content: `${brandLine}\nVideo length: ${duration.toFixed(0)} s. Pick ${count} moment${count === 1 ? "" : "s"}, each about ${target} seconds (between ${Math.round(target * 0.6)} and ${Math.round(target * 1.6)}).\n\nTranscript:\n${transcriptForModel(segments)}` }],
        ...(provider.name === "anthropic" ? { output_config: { effort: "low" } } : {}),
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
    }).catch(() => null);
    if (stopped()) return NextResponse.json({ error: "Stopped." }, { status: 499 }); // the stop already settled it
    const out = (await res?.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
    const usd = estimateUsd(model, { input: out?.usage?.input_tokens ?? 0, output: out?.usage?.output_tokens ?? 0 });
    console.info("highlights usage", JSON.stringify({ client: client.id, seconds, credits, model, usd: usd === null ? null : Number(usd.toFixed(4)) }));
    logAiUsage({ feature: "clip_ai", provider: provider.name, model, clientId: client.id, userId: auth.value, usage: { input: out?.usage?.input_tokens, output: out?.usage?.output_tokens }, usd, credits, meta: { seconds } });
    const text = (out?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    let raw: unknown = [];
    try { raw = (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { highlights?: unknown }).highlights; } catch { /* handled below */ }
    const highlights = validateHighlights(raw, duration, segments);
    // The transcript was paid for and is useful even if picking failed, so no refund here.
    if (!guard.done()) return NextResponse.json({ error: "Stopped." }, { status: 499 });
    return NextResponse.json({ segments, duration, credits, highlights, ...(highlights.length ? {} : { note: "The AI couldn't pick clean moments this time. The captions are ready; try again for moments." }) });
  } catch (err) {
    console.error("highlights error", err);
    await refund();
    return NextResponse.json({ error: "Something went wrong. Your credits were refunded." }, { status: 500 });
  }
}
