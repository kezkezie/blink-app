import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchText } from "@/lib/safe-fetch";
import { assistantModelFor, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { jsonFrom, validateResearch } from "@/lib/brand-research";
import { extractInspiration } from "./inspiration";
import { PATTERNS_SYSTEM, SITE_SEARCH_SYSTEM, patternsPrompt, siteSearchPrompt, validatePatterns, validateSiteRefs, validateSites, type SiteRefs } from "./site-refs";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Website research, server side (lib/sites/site-refs.ts). Two Claude calls (web search, then the
 * patterns), homepages fetched SSRF-safe in between. Kept on the brand for 30 days; no credits,
 * like the picture references (about $0.05 a brand).
 */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const UA = "Mozilla/5.0 (compatible; BlinkSpotBot/1.0; +https://www.blinkspot.io)";

export type SiteRefsOutcome = { ok: true; value: SiteRefs; cached: boolean } | { ok: false; status: number; error: string };

export async function runSiteRefs(brandId: string, clientId: string, opts: { refresh?: boolean; cachedOnly?: boolean } = {}): Promise<SiteRefsOutcome> {
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("brand_name, company_name, industry, description, dna, research, site_refs, site_refs_at")
    .eq("id", brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return { ok: false, status: 404, error: "Brand not found." };
  const kept = validateSiteRefs(brand.site_refs);
  if (kept && !opts.refresh && brand.site_refs_at && Date.now() - new Date(brand.site_refs_at).getTime() < FRESH_MS) return { ok: true, value: kept, cached: true };
  if (opts.cachedOnly) return { ok: false, status: 404, error: "No research yet." };

  let provider;
  try { provider = assistantProvider(); } catch { return { ok: false, status: 503, error: "Research isn't available right now." }; }
  if (provider.name !== "anthropic") return { ok: false, status: 503, error: "Research isn't available right now." };
  const model = assistantModelFor("chat", provider.name);
  const name = brand.brand_name || brand.company_name || "the brand";
  const research = validateResearch(brand.research);
  const industry = research?.industry || brand.industry;
  let usd = 0;
  const call = async (body: object, timeout: number) => {
    const res = await claudeFetch(provider, { method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    usd += (estimateUsd(model, { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 }) ?? 0) + (d?.usage?.server_tool_use?.web_search_requests ?? 0) * 0.01;
    return ((d?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  };

  // 1. Well-designed sites in the category.
  const sites = validateSites(jsonFrom(await call({
    model, max_tokens: 5000, system: SITE_SEARCH_SYSTEM,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: siteSearchPrompt({ name, industry, description: brand.description, peers: research?.peers.map((p) => p.name), location: (brand.dna as { location?: string } | null)?.location }) }],
  }, 120_000)));
  if (sites.length < 3) return { ok: false, status: 502, error: "Couldn't find enough websites just now. Try again in a minute." };

  // 2. Their shape (never their words): headings, menu, fonts, light or dark.
  const shapes = (await Promise.all(sites.map(async (ref) => {
    const page = await safeFetchText(ref.url, { maxBytes: 2_000_000, timeoutMs: 10_000, headers: { "User-Agent": UA, Accept: "text/html" } }).catch(() => null);
    if (!page?.ok) return null;
    const shape = extractInspiration(page.text, ref.url);
    return shape.outline.length >= 2 || shape.words > 80 ? { ref, shape } : null;
  }))).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 8);
  if (shapes.length < 2) return { ok: false, status: 502, error: "The websites we found wouldn't open for us. Try again." };

  // 3. The patterns to follow.
  const patterns = validatePatterns(jsonFrom(await call({ model, max_tokens: 1500, system: PATTERNS_SYSTEM, messages: [{ role: "user", content: patternsPrompt(name, industry, shapes) }] }, 60_000)));
  console.info("site refs usage", JSON.stringify({ brand: brandId, model, found: sites.length, opened: shapes.length, ok: !!patterns, usd: Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "site_refs", provider: provider.name, model, brandId, usd, ok: !!patterns, meta: { found: sites.length } });
  if (!patterns) return { ok: false, status: 502, error: "Couldn't read the websites this time. Try again." };
  const value: SiteRefs = {
    sites: shapes.map(({ ref, shape }) => ({ ...ref, host: new URL(ref.url).hostname.replace(/^www\./, ""), dark: shape.dark, fonts: shape.fonts })),
    patterns, at: new Date().toISOString(),
  };
  await supabaseAdmin.from("brand_profiles").update({ site_refs: value, site_refs_at: value.at }).eq("id", brandId).eq("client_id", clientId);
  return { ok: true, value, cached: false };
}
