import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { ASSISTANT_MODEL, AssistantUnavailableError, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { GOOGLE_FONTS_REGISTRY } from "@/lib/fonts";

/**
 * Brand builder: from a few lines about a business, propose a complete starter identity (name ideas,
 * tagline, description, voice, palette, fonts, three logo directions). Text only, no credits.
 * Logos are drawn afterwards as editable vectors by /api/editor/vector.
 */
export const maxDuration = 120;

const FONTS = GOOGLE_FONTS_REGISTRY.map((f) => f.family);
const HEX = /^#[0-9a-f]{6}$/i;

const SYSTEM = `You are a brand strategist and identity designer for small businesses, creators and start-ups (many in Kenya and East Africa).
From the brief, propose ONE coherent starter brand. Reply with JSON only (no markdown), exactly this shape:
{"names":[3 short, memorable, easy-to-say names; [] if the user gave a name],
 "name":"the user's name, or your best suggestion",
 "tagline":"max 8 words",
 "description":"2 sentences, plain words, what they do and for whom",
 "industry":"short label",
 "audience":"one line",
 "voice":{"summary":"one line","keywords":[3-5 adjectives],"dos":[3 short rules],"donts":[3 short rules]},
 "palette":{"primary":"#RRGGBB","secondary":"#RRGGBB","accent":"#RRGGBB","neutral":"#RRGGBB"},
 "fonts":{"heading":"family","body":"family"},
 "visualStyle":"2 sentences on photography and layout style",
 "logos":[3 logo directions, each one sentence describing a simple vector mark plus wordmark, e.g. "a rounded leaf inside a circle, wordmark in bold geometric sans"]}
Rules: colours must have enough contrast for text on the neutral; fonts MUST come from this list: ${FONTS.join(", ")}.`;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await consumeAiLimits(auth.value, ["brand_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const s = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
  const business = s("business", 1200);
  if (business.length < 8) return NextResponse.json({ error: "Tell us a little more about the business." }, { status: 400 });
  const vibe = Array.isArray(body.vibe) ? body.vibe.filter((v): v is string => typeof v === "string").slice(0, 6).map((v) => v.slice(0, 30)) : [];
  const brief = [
    `Business: ${business}`,
    s("name", 80) ? `Name: ${s("name", 80)}` : "No name yet: suggest names.",
    s("audience", 300) ? `Audience: ${s("audience", 300)}` : "",
    vibe.length ? `Feel: ${vibe.join(", ")}` : "",
    s("place", 80) ? `Based in: ${s("place", 80)}` : "",
    s("colors", 200) ? `Colour wishes: ${s("colors", 200)}` : "",
  ].filter(Boolean).join("\n");

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    if (e instanceof AssistantUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: ASSISTANT_MODEL, max_tokens: 1800, system: SYSTEM, messages: [{ role: "user", content: brief }] }),
    signal: AbortSignal.timeout(100_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "That took too long. Try again." }, { status: 504 });
  const data = (await res.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const usd = estimateUsd(ASSISTANT_MODEL, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 });
  console.info("brand build usage", JSON.stringify({ user: auth.value, ...data.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let out: Record<string, unknown>;
  try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Couldn't put the brand together. Try again." }, { status: 502 }); }

  // Never trust the model's shape: clamp everything that reaches the UI.
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);
  const pal = (out.palette ?? {}) as Record<string, unknown>;
  const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback);
  const fonts = (out.fonts ?? {}) as Record<string, unknown>;
  const font = (v: unknown, fallback: string) => (typeof v === "string" && FONTS.includes(v) ? v : fallback);
  const voice = (out.voice ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    names: list(out.names, 3, 40),
    name: str(out.name, 60) || s("name", 60),
    tagline: str(out.tagline, 80),
    description: str(out.description, 500),
    industry: str(out.industry, 60),
    audience: str(out.audience, 200),
    voice: { summary: str(voice.summary, 200), keywords: list(voice.keywords, 5, 24), dos: list(voice.dos, 4, 100), donts: list(voice.donts, 4, 100) },
    palette: { primary: color(pal.primary, "#111111"), secondary: color(pal.secondary, "#C6F432"), accent: color(pal.accent, "#FF6B35"), neutral: color(pal.neutral, "#F5F3EF") },
    fonts: { heading: font(fonts.heading, "Plus Jakarta Sans"), body: font(fonts.body, "Inter") },
    visualStyle: str(out.visualStyle, 400),
    logos: list(out.logos, 3, 240),
  });
}
