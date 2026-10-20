import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { workspaceFor } from "@/lib/brand-access";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { DESIGN_SYSTEM, designUserPrompt, validateDesign } from "@/lib/design-pass";
import { jsonFrom } from "@/lib/brand-research";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * POST { brandId, look, requirements }: the design pass before Generate renders on Best or Fast
 * (lib/design-pass.ts). Part of the image's price, so no separate credits; about $0.01 of Sonnet.
 * Any failure answers 502 and Generate falls back to the requirements as they are.
 */
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOKS = ["poster", "studio", "lifestyle", "cinematic", "flatlay", "abstract"] as const;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 16_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; look?: unknown; requirements?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const look = LOOKS.find((l) => l === body.look);
  const requirements = typeof body.requirements === "string" ? body.requirements.trim().slice(0, 8000) : "";
  if (!brandId || !look || requirements.length < 8) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, industry").eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["design_pass"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "Design isn't available right now." }, { status: 502 }); }
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 2500,
      system: [{ type: "text", text: DESIGN_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: designUserPrompt({ look, requirements, brandName: brand.brand_name || "the brand", industry: brand.industry }) }],
    }),
    signal: AbortSignal.timeout(50_000),
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Design isn't available right now." }, { status: 502 });
  const data = await res.json();
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const design = validateDesign(jsonFrom(text));
  const usd = estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cacheRead: data.usage?.cache_read_input_tokens ?? 0, cacheWrite: data.usage?.cache_creation_input_tokens ?? 0 });
  console.info("design pass usage", JSON.stringify({ brand: brandId, look, model, ...data.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "design_pass", provider: provider.name, model, clientId: ws?.clientId, userId: auth.value, brandId, usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens, cacheRead: data.usage?.cache_read_input_tokens, cacheWrite: data.usage?.cache_creation_input_tokens }, usd, meta: { look } });
  if (!design) return NextResponse.json({ error: "Design came back unclear." }, { status: 502 });
  return NextResponse.json(design);
}
