import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { AssistantUnavailableError, assistantModelFor, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { realSpeech, transcribeCredits, transcriptForModel, validateHighlights, type Segment } from "@/lib/editor/highlights";
import { dropByRule, validateDrops, type Word } from "@/lib/editor/cleanup";
import { requestWorkspace } from "@/lib/brand-access";
import { brandArg } from "@/lib/credits-meter";
import { stopGuard } from "@/lib/stop-server";
import { stopSplit, transcriptionUsd } from "@/lib/stop-refund";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Editor AI (2026-10-11): captions for a video, the best short moments of a long one, or (2026-10-27)
 * the talking cleaned up: word by word, the ums, stutters, false starts, retakes and asides marked to
 * cut (lib/editor/cleanup.ts does the rule part and the cutting).
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

// Kezie, 2026-10-27: "you cut pauses, you cut awkward stares, you only look at the professional
// things... remove repetition of words... make the whole video look seamless".
const CLEAN = `You are a video editor cleaning up someone talking to camera for a brand's social post. You get their words, numbered, with [pause N s] where they went quiet. Mark what to CUT so the rest plays as one confident, professional take:
- filler sounds and filler phrases ("um", "uh", "you know", "I mean", "like" when it means nothing, "basically", "sort of");
- stutters and words said twice;
- false starts and restarted sentences: cut the abandoned try, keep the version they finish;
- a line said again as a retake: keep the best one (usually the last);
- thinking out loud, asides to someone off camera, "wait", "let me start again", "is it recording";
- rambling that loses the point, if what's left still makes sense without it.
Never cut words that carry the message, names, prices, numbers or the call to action. What's left must read as grammatical, natural sentences. Cut whole phrases rather than odd single words, and when unsure, keep it.
Reply with JSON only: {"cut":[[first,last], ...]} using the word numbers (inclusive ranges, in order). {"cut":[]} if it's already clean.`;

// Whisper leaves out "um" and "uh" unless its prompt has them (OpenAI's speech-to-text guide).
const KEEP_FILLERS = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking. Uh, so, so we, we can, um";

/** The words for the clean-up pass, numbered, with the pauses that matter. */
function wordsForModel(words: Word[]) {
  return words.map((w, i) => `${i > 0 && w.start - words[i - 1].end >= 0.7 ? `[pause ${(w.start - words[i - 1].end).toFixed(1)} s] ` : ""}${i}:${w.word.trim()}`).join(" ");
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Transcription is not configured." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const mode = body.mode === "highlights" ? "highlights" : body.mode === "clean" ? "clean" : "captions";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const seconds = Number(body.seconds);
  const count = Math.min(3, Math.max(1, Math.round(Number(body.count) || 3)));
  const target = [15, 30, 60].includes(Number(body.target)) ? Number(body.target) : 30;
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 300) : "";
  if (!Number.isFinite(seconds) || seconds <= 0) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (seconds > MAX_SECONDS) return NextResponse.json({ error: "That's longer than 90 minutes. Trim it first, or split it in two." }, { status: 413 });
  if (mode === "clean" && seconds > 30 * 60) return NextResponse.json({ error: "Clean-up works on up to 30 minutes at a time. Split the clip first." }, { status: 413 });

  const client = await requestWorkspace(request, auth.value, body.brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  // Any plan with credits (Kezie, 2026-10-12: credits unlock every AI feature).
  if (!audioUrl || !(await verifyOwnedInspirationImage(client.id, audioUrl))) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const limit = await consumeAiLimits(auth.value, ["clip_ai"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const credits = transcribeCredits(seconds);
  const label = mode === "highlights" ? "Editor: shorts from a long video" : mode === "clean" ? "Editor: clean up the talking" : "Editor: captions";
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
    if (mode === "clean") form.append("timestamp_granularities[]", "word");
    const prompt = mode === "clean" ? `${KEEP_FILLERS}${hint ? ` ${hint}.` : ""}` : hint;
    if (prompt) form.append("prompt", prompt.slice(0, 600));
    // Stop in the browser ends the calls here too, and the credits come back (2026-10-25).
    const stopped = () => guard.stopped;
    const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]) }).catch(() => null);
    const data = (await tr?.json().catch(() => ({}))) as { segments?: Array<{ start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }>; words?: Array<{ word?: unknown; start?: unknown; end?: unknown }>; duration?: number; error?: { message?: string } } | undefined;
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
    if (mode === "clean") {
      // Words inside what Whisper heard as real speech (its inventions over silence are dropped above).
      const words: Word[] = (data.words ?? [])
        .map((w) => ({ word: String(w.word ?? "").trim(), start: Math.round(Number(w.start) * 1000) / 1000, end: Math.round(Number(w.end) * 1000) / 1000 }))
        .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start && segments.some((sg) => w.start >= sg.start - 0.3 && w.end <= sg.end + 0.3));
      if (!words.length) return guard.done() ? NextResponse.json({ words: [], drop: [], duration, credits, note: "Nobody speaks in this clip, so there's no talking to clean up." }) : NextResponse.json({ error: "Stopped." }, { status: 499 });
      const drop = dropByRule(words);
      const byRule = drop.size;
      // Claude marks false starts, retakes and asides (not charged, like picking shorts). If it's
      // unavailable or answers badly, the rule clean-up still stands.
      let byClaude = 0;
      try {
        const provider = assistantProvider();
        const model = assistantModelFor("chat", provider.name);
        const res = await claudeFetch(provider, {
          method: "POST",
          headers: { ...provider.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 4000, system: CLEAN, messages: [{ role: "user", content: `${hint ? `Brand: ${hint}.\n` : ""}Words:\n${wordsForModel(words)}` }], ...(provider.name === "anthropic" ? { output_config: { effort: "low" } } : {}) }),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        }).catch(() => null);
        if (stopped()) return NextResponse.json({ error: "Stopped." }, { status: 499 });
        const out = (await res?.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
        const usd = estimateUsd(model, { input: out?.usage?.input_tokens ?? 0, output: out?.usage?.output_tokens ?? 0 });
        logAiUsage({ feature: "clip_ai", provider: provider.name, model, clientId: client.id, userId: auth.value, usage: { input: out?.usage?.input_tokens, output: out?.usage?.output_tokens }, usd, credits, meta: { seconds, mode } });
        const text = (out?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        let raw: unknown = [];
        try { raw = (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { cut?: unknown }).cut; } catch { /* the rules stand */ }
        const marked = validateDrops(raw, words.length);
        const both = new Set([...drop, ...marked]);
        if (both.size <= words.length * 0.7) { byClaude = both.size - drop.size; for (const i of marked) drop.add(i); }
      } catch (e) { if (!(e instanceof AssistantUnavailableError)) console.error("clean-up pass", e); }
      if (!guard.done()) return NextResponse.json({ error: "Stopped." }, { status: 499 });
      return NextResponse.json({ words, drop: [...drop].sort((x, y) => x - y), duration, credits, byRule, byClaude });
    }
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
