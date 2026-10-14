import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { workspaceFor } from "@/lib/brand-access";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { RESEARCH_SYSTEM, jsonFrom, researchPrompt, validateResearch } from "@/lib/brand-research";

/**
 * POST { brandId, refresh? }: how leading brands in this brand's industry design their posts,
 * researched on the web by Claude and kept on the brand (lib/brand-research.ts). Part of brand
 * set-up, so no credits; capped like the brand builder. A playbook under 30 days old is returned
 * as is unless refresh is asked for.
 */
export const maxDuration = 150;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 2_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; refresh?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  if (!brandId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("id, brand_name, company_name, industry, description, website_url, dna, research, research_at")
    .eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

  const kept = validateResearch(brand.research);
  if (kept && !body.refresh && brand.research_at && Date.now() - new Date(brand.research_at).getTime() < FRESH_MS) {
    return NextResponse.json({ research: kept, researchedAt: brand.research_at, cached: true });
  }

  const limit = await consumeAiLimits(auth.value, ["brand_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "Research isn't available right now." }, { status: 503 }); }
  // Web search is Anthropic's own tool; the Kie fallback can't do it.
  if (provider.name !== "anthropic") return NextResponse.json({ error: "Research isn't available right now." }, { status: 503 });

  const { data: products } = await supabaseAdmin.from("products").select("name").eq("brand_id", brandId).eq("client_id", ws.clientId).limit(8);
  const dna = (brand.dna ?? {}) as { audience?: string; location?: string };
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 8000, system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: researchPrompt({
        name: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, description: brand.description,
        website: brand.website_url, products: (products ?? []).map((p) => p.name as string), audience: dna.audience, location: dna.location,
      }) }],
    }),
    signal: AbortSignal.timeout(140_000),
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Couldn't research the industry just now. Try again in a minute." }, { status: 502 });
  const data = await res.json();
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const research = validateResearch(jsonFrom(text));
  const usd = estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 });
  const searches = data.usage?.server_tool_use?.web_search_requests ?? 0;
  console.info("brand research usage", JSON.stringify({ brand: brandId, model, searches, ...data.usage, usd: usd === null ? null : Number((usd + searches * 0.01).toFixed(4)) }));
  if (!research) {
    console.warn("brand research unusable", JSON.stringify({ brand: brandId, stop: data.stop_reason, start: text.slice(0, 300), end: text.slice(-300) }));
    return NextResponse.json({ error: "The research came back unclear. Try again." }, { status: 502 });
  }
  const researchedAt = new Date().toISOString();
  await supabaseAdmin.from("brand_profiles").update({ research, research_at: researchedAt }).eq("id", brandId).eq("client_id", ws.clientId);
  return NextResponse.json({ research, researchedAt, cached: false });
}
