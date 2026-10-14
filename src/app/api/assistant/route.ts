import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AssistantUnavailableError, estimateUsd, runAssistant } from "@/lib/assistant/agent";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { loadAccountBrief } from "@/lib/assistant/tools";
import { parseAssistantRequest } from "@/lib/assistant/request";
import { isPaidPlan } from "@/lib/plans";
import { EFFORT_INFO, allowedEfforts, creditCapFor, effortFor, planFor } from "@/lib/assistant/effort";
import { chargeCredits, creditBalance, meteredCredits } from "@/lib/credits-meter";
import { aiLimitFor } from "@/lib/ai-rate-limit";
import { requestWorkspace } from "@/lib/brand-access";

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

  const client = await requestWorkspace(request, auth.value, parsed.brandId);
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  // Credits unlock everything (Kezie, 2026-10-12). Included: the plan's levels, within the day's
  // Ask messages (deeper levels count as more), and editing on paid plans. Everything else is paid
  // in credits for what the reply actually cost, never more than the level's cap.
  const effort = effortFor(parsed.effort);
  const editing = !!(parsed.editor || parsed.canvas);
  const paidPlan = isPaidPlan(client.plan_tier);
  const burst = await consumeAiLimits(auth.value, ["assistant_hour"], client.plan_tier);
  if (!burst.allowed) return NextResponse.json({ error: burst.message }, { status: burst.status, headers: burst.retryAfterSeconds ? { "Retry-After": String(burst.retryAfterSeconds) } : undefined });
  let included = false;
  let why: "day" | "level" | "editing" = "level";
  if (editing && !paidPlan) why = "editing";
  else if (allowedEfforts(client.plan_tier).includes(effort)) {
    const day = await consumeAiLimits(auth.value, Array<"assistant_day">(EFFORT_INFO[effort].weight).fill("assistant_day"), client.plan_tier);
    if (day.allowed) included = true;
    else if (day.status === 503) return NextResponse.json({ error: day.message }, { status: 503 });
    else why = "day";
  }
  const cap = creditCapFor(effort, editing);
  if (!included) {
    const balance = await creditBalance(client.id);
    if (balance < cap) {
      const reason = why === "day"
        ? `You've used today's ${aiLimitFor("assistant_day", client.plan_tier).limit} included Ask messages.`
        : why === "editing"
          ? "Editing with Ask on the Free plan uses credits."
          : `${EFFORT_INFO[effort].label} isn't included in your plan (it is from ${planFor(effort)}), so it uses credits.`;
      return NextResponse.json({
        reply: `${reason} A message like this costs up to ${cap} credits and you have ${balance}. ${paidPlan ? "Top up any time in Billing." : "Starter ($25 a month) adds 1,500 credits every month and top-ups any time."}${why !== "editing" && effort !== "low" && effort !== "medium" ? " Or switch the dial to Balanced." : ""}`,
        actions: [{ kind: "open_page", label: paidPlan ? "Top up credits" : "See plans", href: "/studio/account/billing" }],
        credits: 0,
      });
    }
  }

  // The brand must belong to this account and be active; otherwise the assistant works brand-less.
  let brandId: string | null = null;
  if (parsed.brandId) {
    const { data: brand } = await supabaseAdmin
      .from("brand_profiles").select("id").eq("id", parsed.brandId).eq("client_id", client.id).eq("is_active", true).maybeSingle();
    brandId = brand?.id ?? null;
  }

  try {
    // Skills are the user's own, even while working in a brand someone shared with them.
    const skillsClientId = client.ownClientId ?? client.id;
    const ctx = { clientId: client.id, brandId, skillsClientId, tz: parsed.tz, tzOffset: parsed.tzOffset };
    // The account's own skills, listed for Ask in one line each (a failure here never blocks a reply).
    const loadSkills = async () => {
      try {
        const { data } = await supabaseAdmin.from("assistant_skills").select("slug, name, description").eq("client_id", skillsClientId).eq("enabled", true).limit(25);
        return (data ?? []).map((k) => ({ id: k.slug as string, name: k.name as string, description: k.description as string }));
      } catch { return []; }
    };
    const [brief, skills] = await Promise.all([loadAccountBrief(ctx).catch(() => undefined), loadSkills()]);
    const result = await runAssistant(parsed.messages, { ...ctx, brief, skills, pageHint: parsed.page, editor: parsed.editor, canvas: parsed.canvas, effort });
    // One line per answer so the Claude bill can be traced to accounts in the Vercel logs.
    const usd = estimateUsd(result.model, result.usage);
    let credits = 0;
    if (!included) {
      credits = meteredCredits(usd, cap);
      const charged = await chargeCredits(client.id, credits, `Ask BlinkSpot (${EFFORT_INFO[effort].label}${editing ? ", editing" : ""})`, brandId);
      if (!charged) console.error("assistant: charge failed after reply", client.id, credits);
    }
    console.info("assistant usage", JSON.stringify({ client: client.id, model: result.model, effort, included, credits, ...result.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
    return NextResponse.json({ ...result, credits });
  } catch (err) {
    if (err instanceof AssistantUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("assistant error", err);
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "The AI took too long to answer (the model provider is slow right now). Try again in a minute." : "The assistant could not answer just now. Try again in a moment." }, { status: timedOut ? 504 : 502 });
  }
}
