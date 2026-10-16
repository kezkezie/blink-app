import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { supabaseAdmin } from "@/lib/supabase-server";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { jsonFrom } from "@/lib/brand-research";
import { imageTypeOf } from "@/lib/visual-refs";
import { STYLE_SYSTEM, WHATSHIPS, pickShips, posterOf, shipItems, stylePrompt, validateStyleIdeas, type ShipItem } from "@/lib/motion/inspo";

/**
 * POST { brandId, brief }: three motion styles from whatships.com's public launch films, after the
 * user said yes to looking (2026-10-16; lib/motion/inspo.ts). Titles and posters only; every idea
 * links to the film's page there. No credits (like the industry research); rate-limited.
 */
export const maxDuration = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let indexCache: { at: number; items: ShipItem[] } | null = null;

async function catalog(): Promise<ShipItem[]> {
  if (indexCache && Date.now() - indexCache.at < 60 * 60 * 1000) return indexCache.items;
  const got = await safeFetchBytes(`${WHATSHIPS}/search-index.json`, { maxBytes: 6_000_000, timeoutMs: 15_000, headers: { "User-Agent": "BlinkSpot/1.0 (user-triggered; +https://www.blinkspot.io)", Accept: "application/json" } });
  if (!got.ok) return indexCache?.items ?? [];
  try { indexCache = { at: Date.now(), items: shipItems(JSON.parse(Buffer.from(got.bytes).toString("utf8"))) }; } catch { return indexCache?.items ?? []; }
  return indexCache.items;
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 4_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; brief?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const brief = typeof body.brief === "string" ? body.brief.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  if (!brandId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, company_name, industry").eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["motion"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const items = await catalog();
  if (!items.length) return NextResponse.json({ error: "whatships.com didn't answer just now. Try again in a minute." }, { status: 502 });
  const picked = pickShips(items, `${brand.industry ?? ""} ${brief}`, 8);
  const stills = (await Promise.all(picked.map(async (s) => {
    const got = await safeFetchBytes(posterOf(s.poster), { maxBytes: 1_500_000, timeoutMs: 10_000 }).catch(() => null);
    const type = got?.ok ? imageTypeOf(got.bytes) : null;
    return got?.ok && type && type !== "image/gif" ? { s, data: Buffer.from(got.bytes).toString("base64"), type } : null;
  }))).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 6);
  if (stills.length < 2) return NextResponse.json({ error: "Couldn't load the films' stills just now. Try again." }, { status: 502 });

  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "Inspiration isn't available right now." }, { status: 503 }); }
  const model = assistantModelFor("chat", provider.name);
  const res = await fetch(provider.url, {
    method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 3000, system: STYLE_SYSTEM,
      messages: [{ role: "user", content: [
        ...stills.map((x) => ({ type: "image", source: { type: "base64", media_type: x.type, data: x.data } })),
        { type: "text", text: stylePrompt({ brandName: brand.brand_name || brand.company_name || "the brand", industry: brand.industry, brief, ships: stills.map((x) => x.s) }) },
      ] }],
    }),
    signal: AbortSignal.timeout(70_000),
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const text = ((data?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const ideas = validateStyleIdeas(jsonFrom(text), stills.map((x) => x.s));
  const usd = data ? estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }) : null;
  console.info("motion inspo usage", JSON.stringify({ brand: brandId, stills: stills.length, ideas: ideas.length, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  if (!ideas.length) return NextResponse.json({ error: "Couldn't put ideas together this time. Try again." }, { status: 502 });
  return NextResponse.json({ ideas, source: WHATSHIPS });
}
