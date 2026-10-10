import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AssistantUnavailableError, runAssistant } from "@/lib/assistant/agent";
import { loadAccountBrief } from "@/lib/assistant/tools";
import { parseAssistantRequest } from "@/lib/assistant/request";

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

  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // The brand must belong to this account and be active; otherwise the assistant works brand-less.
  let brandId: string | null = null;
  if (parsed.brandId) {
    const { data: brand } = await supabaseAdmin
      .from("brand_profiles").select("id").eq("id", parsed.brandId).eq("client_id", client.id).eq("is_active", true).maybeSingle();
    brandId = brand?.id ?? null;
  }

  try {
    const ctx = { clientId: client.id, brandId };
    const brief = await loadAccountBrief(ctx).catch(() => undefined);
    const result = await runAssistant(parsed.messages, { ...ctx, brief, pageHint: parsed.page, editor: parsed.editor, canvas: parsed.canvas });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AssistantUnavailableError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("assistant error", err);
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "The AI took too long to answer (the model provider is slow right now). Try again in a minute." : "The assistant could not answer just now. Try again in a moment." }, { status: timedOut ? 504 : 502 });
  }
}
