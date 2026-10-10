import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { ASSISTANT_MODEL, AssistantUnavailableError, assistantProvider } from "@/lib/assistant/agent";

/**
 * Editor → "Make a vector": Claude draws clean, editable SVG (shapes, icons, badges, simple logos)
 * that the editor turns into layers. No credits; the browser sanitises the SVG before using it.
 */
export const maxDuration = 120;

const SYSTEM = `You are a vector illustrator inside BlinkSpot's image editor. You draw with clean SVG that a designer can edit.
Rules:
- Reply with ONE complete <svg> element and nothing else (no markdown, no prose).
- Use only: svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, clipPath.
- The background must be transparent: never draw a full-size background rectangle or frame unless asked.
- Always set viewBox. Use solid fills and a small, deliberate palette (use the brand colours when given). No raster images, no filters, no scripts, no external links, no CSS.
- Prefer few, well-formed paths. Group logical parts with <g id="..."> so each part becomes a layer (e.g. "mark", "wordmark", "badge").
- For logos: a simple, bold, memorable mark that works small; wordmarks as <text> with a common font-family (e.g. "Inter", "Montserrat", "Playfair Display") so the user can edit the words.`;

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { prompt?: unknown; brandId?: unknown; style?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 800) : "";
  if (prompt.length < 3) return NextResponse.json({ error: "Describe what to draw." }, { status: 400 });

  let brandLine = "";
  if (typeof body.brandId === "string" && /^[0-9a-f-]{36}$/i.test(body.brandId)) {
    const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
    if (client?.id) {
      const { data: b } = await supabaseAdmin.from("brand_profiles").select("brand_name, primary_color, secondary_color, industry").eq("id", body.brandId).eq("client_id", client.id).maybeSingle();
      if (b) brandLine = `Brand: ${b.brand_name}${b.industry ? ` (${b.industry})` : ""}. Brand colours: ${[b.primary_color, b.secondary_color].filter(Boolean).join(", ") || "not set"}.`;
    }
  }
  const style = body.style === "outline" ? "Line art: strokes only, no fills, consistent stroke width." : body.style === "flat" ? "Flat design: solid fills, no gradients." : "";

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    if (e instanceof AssistantUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model: ASSISTANT_MODEL, max_tokens: 6000, system: SYSTEM, messages: [{ role: "user", content: [brandLine, style, `Draw: ${prompt}`].filter(Boolean).join("\n") }] }),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "The vector took too long. Try a simpler description." }, { status: 504 });
  const data = (await res.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const svg = text.match(/<svg[\s\S]*<\/svg>/i)?.[0];
  if (!res.ok || !svg) return NextResponse.json({ error: "Couldn't draw that. Try describing it differently." }, { status: 502 });
  return NextResponse.json({ svg });
}
