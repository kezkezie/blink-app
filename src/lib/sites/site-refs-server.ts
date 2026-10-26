import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchText } from "@/lib/safe-fetch";
import { assistantModelFor, assistantProvider, estimateUsd, claudeFetch } from "@/lib/assistant/agent";
import { jsonFrom, validateResearch } from "@/lib/brand-research";
import { extractInspiration } from "./inspiration";
import { PATTERNS_SYSTEM, patternsPrompt, validatePatterns, validateSiteRefs, type SiteRefs } from "./site-refs";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Websites you like, server side (lib/sites/site-refs.ts). The owner's sites are opened SSRF-safe,
 * their shapes read, and one Claude call writes the patterns. Kept on the brand until the list
 * changes; no credits, like the picture references (a few cents a study).
 */
const UA = "Mozilla/5.0 (compatible; BlinkSpotBot/1.0; +https://www.blinkspot.io)";

export type SiteRefsOutcome = { ok: true; value: SiteRefs; skipped: string[] } | { ok: false; status: number; error: string };

/** The sites the owner picked and what was learned from them, or null (older automatic finds don't count). */
export async function keptSiteRefs(brandId: string, clientId: string): Promise<SiteRefs | null> {
  const { data } = await supabaseAdmin.from("brand_profiles").select("site_refs").eq("id", brandId).eq("client_id", clientId).maybeSingle();
  const kept = validateSiteRefs(data?.site_refs);
  return kept?.picked ? kept : null;
}

/** Study the owner's sites (already cleaned) and keep the result on the brand. An empty list clears it. */
export async function studySites(brandId: string, clientId: string, sites: Array<{ url: string; host: string }>): Promise<SiteRefsOutcome> {
  const { data: brand } = await supabaseAdmin.from("brand_profiles")
    .select("brand_name, company_name, industry, research")
    .eq("id", brandId).eq("client_id", clientId).maybeSingle();
  if (!brand) return { ok: false, status: 404, error: "Brand not found." };
  if (!sites.length) {
    await supabaseAdmin.from("brand_profiles").update({ site_refs: null, site_refs_at: null }).eq("id", brandId).eq("client_id", clientId);
    return { ok: true, value: { sites: [], patterns: "", at: new Date().toISOString(), picked: true }, skipped: [] };
  }

  // Their shape (never their words): headings, menu, fonts, light or dark.
  const opened = await Promise.all(sites.map(async (site) => {
    const page = await safeFetchText(site.url, { maxBytes: 2_000_000, timeoutMs: 12_000, headers: { "User-Agent": UA, Accept: "text/html" } }).catch(() => null);
    if (!page?.ok) return null;
    const shape = extractInspiration(page.text, site.url);
    return shape.outline.length >= 2 || shape.words > 80 ? { ref: { url: site.url, name: site.host, why: "" }, shape, host: site.host } : null;
  }));
  const shapes = opened.filter((x): x is NonNullable<typeof x> => !!x);
  const skipped = sites.filter((_, n) => !opened[n]).map((s) => s.host);
  if (!shapes.length) return { ok: false, status: 422, error: `Couldn't open ${skipped.join(", ")}. Check the address, or try another site (some sites block visitors like us).` };

  let provider;
  try { provider = assistantProvider(); } catch { return { ok: false, status: 503, error: "Studying sites isn't available right now." }; }
  if (provider.name !== "anthropic") return { ok: false, status: 503, error: "Studying sites isn't available right now." };
  const model = assistantModelFor("chat", provider.name);
  const research = validateResearch(brand.research);
  const res = await claudeFetch(provider, {
    method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, max_tokens: 1500, system: PATTERNS_SYSTEM, messages: [{ role: "user", content: patternsPrompt(brand.brand_name || brand.company_name || "the brand", research?.industry || brand.industry, shapes) }] }),
  }).catch(() => null);
  const d = res?.ok ? await res.json().catch(() => null) : null;
  const usd = estimateUsd(model, { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 }) ?? 0;
  const patterns = validatePatterns(jsonFrom(((d?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")));
  logAiUsage({ feature: "site_refs", provider: provider.name, model, brandId, usd, ok: !!patterns, meta: { picked: sites.length, opened: shapes.length } });
  if (!patterns) return { ok: false, status: 502, error: "Couldn't read those websites this time. Try again." };
  const value: SiteRefs = {
    sites: shapes.map(({ ref, shape, host }) => ({ ...ref, host, dark: shape.dark, fonts: shape.fonts })),
    patterns, at: new Date().toISOString(), picked: true,
  };
  await supabaseAdmin.from("brand_profiles").update({ site_refs: value, site_refs_at: value.at }).eq("id", brandId).eq("client_id", clientId);
  return { ok: true, value, skipped };
}
