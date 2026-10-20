import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { AssistantUnavailableError, assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { runAssistantTool } from "@/lib/assistant/tools";
import { chargeCredits, creditBalance, meteredCredits, NOT_ENOUGH_CREDITS } from "@/lib/credits-meter";
import { validatePlan, validateRecipe } from "@/lib/video-inspo/plan";
import { requestWorkspace } from "@/lib/brand-access";
import { logAiUsage } from "@/lib/ai-usage";

/**
 * Video Inspo (Kezie, 2026-10-12: "steal" a video's style for your own brand). Claude can't watch
 * a video, so the browser sends one still per shot with its timing (lib/video-inspo/analyze.ts).
 * "remake": the video rebuilt shot by shot for the brand, as Storyboard scenes.
 * "edit": its editing (cut lengths, words on screen) for the Video Editor to apply to your clips.
 * Paid in credits for what the reading cost (Sonnet with pictures), checked before it runs.
 */
export const maxDuration = 120;
const CAP = { remake: 30, edit: 20 } as const;

const REMAKE = `You are a commercial director at BlinkSpot, an AI studio for small brands. You get the stills of a reference video, one per shot, in order, with each shot's start and end in seconds.
1. Work out why it works: the hook, the pacing, the camera language, the look (light, colour, lenses), the energy, how words appear.
2. Rebuild it for the brand below: the same structure, pacing, camera moves, look and energy, with the brand's own products, people, places and words. Never copy the original brand, its logo, a real person's face, or its exact words.
Reply with JSON only:
{"title":"3-6 words","why":["2-4 short reasons it works"],"style":{"look":"","pace":"","camera":"","music":"the feel of the music","text":"how words appear on screen"},"hook":"the brand's first 2 seconds","scenes":[{"shots":[1,3],"seconds":2.5,"what":"what happens, in plain words for the owner","prompt":"for an AI video model: subject + action + camera move + light + mood, 25-60 words, NO words or letters on screen","text":"on-screen words for this setup, max 6, or empty","mode":"showcase|ugc|logo_reveal|kling_keyframe|clothing"}],"caption":"a post caption in the brand's voice"}
Rules: each scene is one SETUP (the same subject, framing and look). Every scene renders about 5 seconds and the editor cuts it into as many short shots as the reference needs, so shots that show the same setup belong to ONE scene: list all of them in "shots" (every reference shot must be in exactly one scene). Use the fewest scenes that cover every distinct setup (usually 2-6, never more than 8): renders cost money. "seconds" is how long the setup is on screen in total. mode: showcase (products and camera moves), ugc (a person talking to camera), logo_reveal (a logo or pack reveal), kling_keyframe (people or objects with physical motion), clothing (someone wearing an outfit). Use the brand's products and place by name where it helps.`;

const EDIT = `You are a video editor at BlinkSpot. You get the stills of a reference video, one per shot, in order, with each shot's start and end in seconds. Describe its EDITING so it can be applied to someone else's clips:
Reply with JSON only:
{"title":"3-6 words","pace":"e.g. fast cuts on every beat","why":["2-3 short reasons the edit works"],"cuts":[the length in seconds of each shot, in order],"texts":[{"at":seconds from the start,"duration":seconds,"text":"the words on screen, rewritten for the brand below (same job: hook, offer, call to action), max 6 words","y":percent from the top where they sit,"size":"big|medium|small","style":"caption|plain"}],"aspect":"9:16|1:1|16:9"}
Only include texts that the reference actually shows on screen. If it shows none, return "texts":[].`;

type Body = { mode?: unknown; shots?: unknown; duration?: unknown; width?: unknown; height?: unknown; brandId?: unknown; purpose?: unknown };

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 3_000_000)) return NextResponse.json({ error: "Too much at once. Try a shorter video." }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const mode = body.mode === "edit" ? "edit" : "remake";
  const duration = Number(body.duration);
  const shots = Array.isArray(body.shots) ? body.shots.slice(0, 16) : [];
  const valid = shots.every((s) => s && typeof s === "object" && Number.isFinite(Number((s as { start: unknown }).start)) && Number.isFinite(Number((s as { end: unknown }).end))
    && typeof (s as { data: unknown }).data === "string" && /^[A-Za-z0-9+/=]{100,220000}$/.test((s as { data: string }).data));
  if (!shots.length || !valid || !Number.isFinite(duration) || duration <= 0 || duration > 95) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = await requestWorkspace(request, auth.value, body.brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  let brandId: string | null = null;
  if (typeof body.brandId === "string" && /^[0-9a-f-]{36}$/i.test(body.brandId)) {
    const { data: b } = await supabaseAdmin.from("brand_profiles").select("id").eq("id", body.brandId).eq("client_id", client.id).eq("is_active", true).maybeSingle();
    brandId = b?.id ?? null;
  }
  if (!brandId) return NextResponse.json({ error: "Pick a brand first (top right)." }, { status: 400 });
  const cap = CAP[mode];
  if ((await creditBalance(client.id)) < cap) return NextResponse.json({ error: NOT_ENOUGH_CREDITS(cap), code: "not_enough_credits" }, { status: 402 });
  const limit = await consumeAiLimits(auth.value, ["video_inspo"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    return NextResponse.json({ error: e instanceof AssistantUnavailableError ? e.message : "The AI isn't available." }, { status: 503 });
  }
  const brand = (await runAssistantTool("get_brand", {}, { clientId: client.id, brandId }).catch(() => ({ content: "" }))).content;
  const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0, 300) : "";
  const shape = Number(body.width) > 0 && Number(body.height) > 0 ? `${body.width}x${body.height}` : "unknown";
  const content = [
    { type: "text", text: `Reference video: ${duration.toFixed(1)} s, ${shape} pixels, ${shots.length} shots.${purpose ? ` The owner wants it for: ${purpose}.` : ""}\n\nBrand:\n${brand}` },
    ...shots.flatMap((s, i) => {
      const x = s as { start: number; end: number; data: string };
      return [
        { type: "text", text: `Shot ${i + 1}: ${Number(x.start).toFixed(1)}-${Number(x.end).toFixed(1)} s` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: x.data } },
      ];
    }),
  ];
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4000, system: mode === "edit" ? EDIT : REMAKE, messages: [{ role: "user", content }], ...(provider.name === "anthropic" ? { output_config: { effort: "medium" } } : {}) }),
    signal: AbortSignal.timeout(100_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
  const usd = estimateUsd(model, { input: out?.usage?.input_tokens ?? 0, output: out?.usage?.output_tokens ?? 0 });
  const text = (out?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let raw: unknown = null;
  try { raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* checked below */ }
  const result = mode === "edit" ? validateRecipe(raw, duration) : validatePlan(raw, shots.length);
  console.info("video inspo usage", JSON.stringify({ client: client.id, mode, shots: shots.length, model, ok: !!result, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  logAiUsage({ feature: "video_inspo", provider: provider.name, model, clientId: client.id, userId: auth.value, brandId, usage: { input: out?.usage?.input_tokens, output: out?.usage?.output_tokens }, usd, credits: res?.ok && result ? meteredCredits(usd, cap, mode === "edit" ? 2 : 3) : 0, ok: !!result, meta: { mode, shots: shots.length } });
  if (!res?.ok || !result) return NextResponse.json({ error: "Couldn't read that video this time. Nothing was charged; try again." }, { status: 502 });

  const credits = meteredCredits(usd, cap, mode === "edit" ? 2 : 3);
  if (!(await chargeCredits(client.id, credits, mode === "edit" ? "Video Inspo: read the edit" : "Video Inspo: remake for your brand", brandId))) console.error("video inspo: charge failed", client.id, credits);
  return NextResponse.json(mode === "edit" ? { recipe: result, credits } : { plan: result, credits });
}
