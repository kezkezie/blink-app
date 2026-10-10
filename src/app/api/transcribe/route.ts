import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";

/**
 * Voice input for any text box in the studio: the browser records a short clip, this turns it into
 * text with OpenAI Whisper (handles accents and mixed English/Swahili; follows spelling hints best of
 * the models tried 2026-10-10, ~2 s per clip). $0.006 per minute; clips are capped at 2 minutes /
 * 8 MB. Nothing is stored.
 */
export const maxDuration = 60;

const MAX_BYTES = 8_000_000;
const TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"]);
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/aac": "aac" };

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice input is not configured." }, { status: 503 });

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES + 100_000) return NextResponse.json({ error: "That recording is too long. Keep it under 2 minutes." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "No audio received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Keep it under 2 minutes." }, { status: 413 });
  const type = (audio.type || "").split(";")[0].toLowerCase();
  if (!TYPES.has(type)) return NextResponse.json({ error: "Unsupported audio format." }, { status: 415 });
  // Spelling hints (brand names, product words) so "Njeri" doesn't come back as "Jerry".
  const hint = typeof form.get("hint") === "string" ? String(form.get("hint")).slice(0, 300) : "";

  const upstream = new FormData();
  upstream.append("file", audio, `voice.${EXT[type]}`);
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "json");
  if (hint) upstream.append("prompt", hint);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: upstream,
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Transcription timed out. Try again." }, { status: 504 });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!res.ok) {
    console.error("transcribe failed", res.status, data.error?.message);
    return NextResponse.json({ error: "Couldn't transcribe that. Try again." }, { status: 502 });
  }
  return NextResponse.json({ text: (data.text || "").trim() });
}
