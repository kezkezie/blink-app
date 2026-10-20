import { supabaseAdmin } from "@/lib/supabase-server";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { softenForAi } from "@/lib/ai-safe-text";
import type { BrandCreativeContext } from "@/lib/brand-creative-context";
import { VIDEO_PROMPT_SYSTEM, fallbackVideoPrompt, validVideoPrompt, videoPromptUser } from "@/lib/video-prompt";

/**
 * Writes a scene's video prompt (lib/video-prompt.ts) with the brand's world as the guardrail.
 * Sonnet, about $0.003 a scene, free to the user. Never throws: without Claude the scene goes as
 * written with the brand named, never as a refusal.
 */
export async function brandWorld(context: BrandCreativeContext | null): Promise<string | null> {
  if (!context) return null;
  const { data: products } = await supabaseAdmin.from("products").select("name, description").eq("brand_id", context.brandId).eq("client_id", context.clientId).limit(10);
  return [
    `Name: ${context.name}`,
    context.industry ? `Industry: ${context.industry}` : "",
    context.description ? `What it does: ${softenForAi(context.description).slice(0, 600)}` : "",
    products?.length ? `Products: ${products.map((p) => `${p.name}${p.description ? ` (${String(p.description).slice(0, 80)})` : ""}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

export async function writeVideoPrompt(i: {
  scene: string; context: BrandCreativeContext | null; onBrand: boolean; seconds: number; startFrame: string | null; aspect?: string | null;
}): Promise<{ prompt: string; written: boolean }> {
  const fallback = fallbackVideoPrompt(i.scene, i.context?.name, i.context?.industry, i.onBrand);
  let provider;
  try { provider = assistantProvider(); } catch { return { prompt: fallback, written: false }; }
  const model = assistantModelFor("chat", provider.name);
  const brand = i.onBrand ? await brandWorld(i.context).catch(() => null) : null;
  const text = videoPromptUser({ scene: softenForAi(i.scene), brand, onBrand: i.onBrand, seconds: i.seconds, hasStartFrame: !!i.startFrame, aspect: i.aspect });
  const ask = async (withFrame: boolean) => {
    const content = withFrame && i.startFrame ? [{ type: "image", source: { type: "url", url: i.startFrame } }, { type: "text", text }] : text;
    const res = await fetch(provider.url, {
      method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 500, system: VIDEO_PROMPT_SYSTEM, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) return null;
    if (!res.ok) return { status: res.status, text: "" };
    const d = await res.json().catch(() => null) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | null;
    const usd = estimateUsd(model, { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 });
    console.info("video prompt", JSON.stringify({ brand: i.context?.brandId ?? null, onBrand: i.onBrand, frame: withFrame, usd: usd === null ? null : Number(usd.toFixed(4)) }));
    return { status: 200, text: (d?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("") };
  };
  // A start frame Claude can't open fails the call; then words only.
  let out = await ask(!!i.startFrame);
  if (out && out.status === 400 && i.startFrame) out = await ask(false);
  return validVideoPrompt(out?.text, fallback);
}
