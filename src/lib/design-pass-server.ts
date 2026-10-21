import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { DESIGN_SYSTEM, designUserPrompt, validateDesign } from "@/lib/design-pass";
import { jsonFrom } from "@/lib/brand-research";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * The design pass (lib/design-pass.ts) as a server call, for /api/generate/design and the MCP's
 * create_image (2026-10-21). About $0.01 of Sonnet, part of the image's price. null when it can't
 * run or comes back unclear: then the requirements go as they are.
 */
export const DESIGN_LOOKS = ["poster", "studio", "lifestyle", "cinematic", "flatlay", "abstract"] as const;
export type DesignLook = (typeof DESIGN_LOOKS)[number];

export async function designPrompt(i: { look: DesignLook; requirements: string; brandName: string; industry?: string | null; clientId: string; userId?: string | null; brandId: string }) {
  let provider;
  try { provider = assistantProvider(); } catch { return null; }
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 2500,
      system: [{ type: "text", text: DESIGN_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: designUserPrompt({ look: i.look, requirements: i.requirements, brandName: i.brandName, industry: i.industry }) }],
    }),
    signal: AbortSignal.timeout(50_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const design = validateDesign(jsonFrom(text));
  const usd = estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0, cacheRead: data.usage?.cache_read_input_tokens ?? 0, cacheWrite: data.usage?.cache_creation_input_tokens ?? 0 });
  console.info("design pass usage", JSON.stringify({ brand: i.brandId, look: i.look, model, ...data.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "design_pass", provider: provider.name, model, clientId: i.clientId, userId: i.userId ?? undefined, brandId: i.brandId, usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens, cacheRead: data.usage?.cache_read_input_tokens, cacheWrite: data.usage?.cache_creation_input_tokens }, usd, meta: { look: i.look } });
  return design;
}
