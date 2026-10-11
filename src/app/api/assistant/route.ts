import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AssistantUnavailableError, estimateUsd, runAssistant } from "@/lib/assistant/agent";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { loadAccountBrief } from "@/lib/assistant/tools";
import { parseAssistantRequest } from "@/lib/assistant/request";
import { EDITOR_AI_UPGRADE, isPaidPlan } from "@/lib/plans";
import { EFFORT_INFO, effortFor } from "@/lib/assistant/effort";

// A reply can take several model turns; Kie alone has measured 70-80 s per turn.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Up to 24 small JPEG frames from the editor (~60 KB each) ride along with editing requests.
  if (!isExecutionBodySizeAllowed(request, 2_500_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = parseAssistantRequest(body);
  if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: client } = await supabaseAdmin.from("clients").select("id, plan_tier").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  // Editing a timeline or canvas runs on Opus; on the Free plan the editors' AI is a paid feature.
  if ((parsed.editor || parsed.canvas) && !isPaidPlan(client.plan_tier)) {
    return NextResponse.json({
      reply: `${EDITOR_AI_UPGRADE} I can still help you plan and write: close the editor and ask me anything.`,
      actions: [{ kind: "open_page", label: "See plans", href: "/studio/account/billing" }],
    });
  }
  // Deeper thinking costs more, so it counts as more of the day's messages (Thorough 2, Extra high 3, Max 4).
  const effort = effortFor(parsed.effort, client.plan_tier);
  const limit = await consumeAiLimits(auth.value, ["assistant_hour", ...Array<"assistant_day">(EFFORT_INFO[effort].weight).fill("assistant_day")], client.plan_tier);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status, headers: limit.retryAfterSeconds ? { "Retry-After": String(limit.retryAfterSeconds) } : undefined });

  // The brand must belong to this account and be active; otherwise the assistant works brand-less.
  let brandId: string | null = null;
  if (parsed.brandId) {
    const { data: brand } = await supabaseAdmin
      .from("brand_profiles").select("id").eq("id", parsed.brandId).eq("client_id", client.id).eq("is_active", true).maybeSingle();
    brandId = brand?.id ?? null;
  }

  try {
    const ctx = { clientId: client.id, brandId, tz: parsed.tz, tzOffset: parsed.tzOffset };
    const brief = await loadAccountBrief(ctx).catch(() => undefined);
    const result = await runAssistant(parsed.messages, { ...ctx, brief, pageHint: parsed.page, editor: parsed.editor, canvas: parsed.canvas, effort });
    // One line per answer so the Claude bill can be traced to accounts in the Vercel logs.
    const usd = estimateUsd(result.model, result.usage);
    console.info("assistant usage", JSON.stringify({ client: client.id, model: result.model, effort, ...result.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AssistantUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("assistant error", err);
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "The AI took too long to answer (the model provider is slow right now). Try again in a minute." : "The assistant could not answer just now. Try again in a moment." }, { status: timedOut ? 504 : 502 });
  }
}
