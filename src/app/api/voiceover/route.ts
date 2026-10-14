import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { openAiSpeech } from "@/lib/openai-proxy";
import { TTS_VOICES } from "@/lib/video-execution";
import { voiceoverCredits } from "@/lib/voiceover";
import { requestWorkspace } from "@/lib/brand-access";
import { brandArg } from "@/lib/credits-meter";

/**
 * Make a voiceover (QA-021, 2026-10-12: the homepage sells voiceovers for 1 credit, but nothing in
 * the new look made one). Text to speech, saved to the Library as audio for the Editor's track.
 * 1 credit per started 300 characters (about 20 seconds of speech), so a short line is 1 credit.
 * Charged first, refunded if the speech fails.
 */
export const maxDuration = 60;
const MAX_CHARS = 3000;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { text?: unknown; voice?: unknown; brandId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  const voice = typeof body.voice === "string" && TTS_VOICES.has(body.voice) ? body.voice : "nova";
  if (text.length < 2) return NextResponse.json({ error: "Write what the voice should say." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: `That's long for one voiceover (${MAX_CHARS.toLocaleString("en-US")} characters at most). Split it in two.` }, { status: 400 });

  const client = await requestWorkspace(request, auth.value, body.brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let brandId: string | null = null;
  if (typeof body.brandId === "string" && /^[0-9a-f-]{36}$/i.test(body.brandId)) {
    const { data: b } = await supabaseAdmin.from("brand_profiles").select("id").eq("id", body.brandId).eq("client_id", client.id).maybeSingle();
    brandId = b?.id ?? null;
  }
  const limit = await consumeExecutionRateLimit(auth.value, "video_tts");
  if (!limit.ok) return NextResponse.json({ error: "Voiceovers are temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "That's a lot of voiceovers at once. Try again in a few minutes." }, { status: 429 });

  const credits = voiceoverCredits(text.length);
  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", { p_client_id: client.id, p_amount: credits, p_operation: "debit", p_description: `Voiceover (${text.length} characters)`, ...brandArg(brandId) });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `Not enough credits (this needs ${credits}). Get more in Billing.` }, { status: 402 });
  const refund = () => supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: credits, p_operation: "credit", p_description: "Refund: voiceover failed", ...brandArg(brandId) }).then(() => {}, () => {});

  try {
    const audio = await openAiSpeech(text, voice);
    const path = `videos/${client.id}/voiceover_${Date.now()}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage.from("assets").upload(path, new Uint8Array(audio), { contentType: "audio/mpeg" });
    if (upErr) throw new Error("upload");
    const url = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    const caption = `Voiceover: ${text.length > 48 ? `${text.slice(0, 47)}…` : text}`;
    const { data: row } = await supabaseAdmin.from("content").insert({
      client_id: client.id, brand_id: brandId, content_type: "generated_audio", status: "draft", caption, image_urls: [url], video_urls: [url], ai_model: `openai-tts:${voice}`,
    }).select("id").single();
    return NextResponse.json({ url, id: row?.id ?? null, credits, name: caption });
  } catch (e) {
    console.error("voiceover failed", e instanceof Error ? e.message : e);
    await refund();
    return NextResponse.json({ error: "Couldn't make the voiceover. Your credits were refunded." }, { status: 502 });
  }
}
