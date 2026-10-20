import { supabaseAdmin } from "@/lib/supabase-server";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { RESEARCH_SYSTEM, jsonFrom, researchPrompt, validateResearch, type BrandResearch } from "@/lib/brand-research";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Industry research for a brand, server side (2026-10-14): used by POST /api/brand/research
 * (Generate's first "Get 3 ideas") and by Ask BlinkSpot's research_industry tool (Kezie: "Ask
 * BlinkSpot is the one that will be doing the research"). Kept on the brand for 30 days.
 */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

export type ResearchOutcome =
  | { ok: true; research: BrandResearch; researchedAt: string; cached: boolean }
  | { ok: false; status: number; error: string };

export async function runBrandResearch(brandId: string, clientId: string, refresh = false): Promise<ResearchOutcome> {
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("id, brand_name, company_name, industry, description, website_url, dna, research, research_at")
    .eq("id", brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return { ok: false, status: 404, error: "Brand not found." };
  const kept = validateResearch(brand.research);
  if (kept && !refresh && brand.research_at && Date.now() - new Date(brand.research_at).getTime() < FRESH_MS) {
    return { ok: true, research: kept, researchedAt: brand.research_at as string, cached: true };
  }

  let provider;
  try { provider = assistantProvider(); } catch { return { ok: false, status: 503, error: "Research isn't available right now." }; }
  // Web search is Anthropic's own tool; the Kie fallback can't do it.
  if (provider.name !== "anthropic") return { ok: false, status: 503, error: "Research isn't available right now." };

  const { data: products } = await supabaseAdmin.from("products").select("name").eq("brand_id", brandId).eq("client_id", clientId).limit(8);
  const dna = (brand.dna ?? {}) as { audience?: string; location?: string };
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 8000, system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages: [{ role: "user", content: researchPrompt({
        name: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, description: brand.description,
        website: brand.website_url, products: (products ?? []).map((p) => p.name as string), audience: dna.audience, location: dna.location,
      }) }],
    }),
    signal: AbortSignal.timeout(140_000),
  }).catch(() => null);
  if (!res?.ok) return { ok: false, status: 502, error: "Couldn't research the industry just now. Try again in a minute." };
  const data = await res.json();
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const research = validateResearch(jsonFrom(text));
  const usd = estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 });
  const searches = data.usage?.server_tool_use?.web_search_requests ?? 0;
  console.info("brand research usage", JSON.stringify({ brand: brandId, model, searches, ...data.usage, usd: usd === null ? null : Number((usd + searches * 0.01).toFixed(4)) }));
  logAiUsage({ feature: "brand_research", provider: provider.name, model, brandId, usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens }, usd: (usd ?? 0) + searches * 0.01, ok: !!research, meta: { searches } });
  if (!research) {
    console.warn("brand research unusable", JSON.stringify({ brand: brandId, stop: data.stop_reason, start: text.slice(0, 300), end: text.slice(-300) }));
    return { ok: false, status: 502, error: "The research came back unclear. Try again." };
  }
  const researchedAt = new Date().toISOString();
  await supabaseAdmin.from("brand_profiles").update({ research, research_at: researchedAt }).eq("id", brandId).eq("client_id", clientId);
  return { ok: true, research, researchedAt, cached: false };
}
