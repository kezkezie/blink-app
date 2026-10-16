import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { requestWorkspace } from "@/lib/brand-access";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { brandArg } from "@/lib/credits-meter";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { loadBrandBrain } from "@/lib/sites/brain";
import { CHANGE_SYSTEM, SITE_CHANGE_CREDITS, applyEdits, changeUserPrompt, checkHtml, extractHtml, fillImages } from "@/lib/sites/code";

/**
 * POST { id, instruction }: the owner's change to a page, made by Claude as edit blocks (cheap and
 * quick) or as a whole new file when the change is sweeping. Saved as a new version (parent_id),
 * so the one before is always there to go back to. SITE_CHANGE_CREDITS, refunded on failure; when
 * the edit blocks don't match the file, one whole-file retry runs at our cost.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, brand_id, name, html, brief, notes, parent_id, slug, published_at, created_at, updated_at";

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 6_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { id?: unknown; instruction?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 1500) : "";
  if (!id || !instruction) return NextResponse.json({ error: "Say what to change." }, { status: 400 });

  const { data: page } = await supabaseAdmin.from("site_pages").select("id, client_id, brand_id, name, html, brief, notes").eq("id", id).maybeSingle();
  const client = page ? await requestWorkspace(request, auth.value, page.brand_id) : null;
  if (!page || !client || client.id !== page.client_id) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["site_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "The website studio isn't available right now." }, { status: 503 }); }
  if (provider.name !== "anthropic") return NextResponse.json({ error: "The website studio isn't available right now." }, { status: 503 });
  const model = assistantModelFor("chat", provider.name);

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: client.id, p_amount: SITE_CHANGE_CREDITS, p_operation: "debit", p_description: "Website studio: change a page", ...brandArg(page.brand_id),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `A change is ${SITE_CHANGE_CREDITS} credits and your balance is lower. Get more in Billing.` }, { status: 402 });
  const fail = async (status: number, error: string) => {
    await supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: SITE_CHANGE_CREDITS, p_operation: "refund", p_description: "Refund: website change failed", ...brandArg(page.brand_id) }).then(() => {}, () => {});
    return NextResponse.json({ error: `${error} Your ${SITE_CHANGE_CREDITS} credits were refunded.` }, { status });
  };

  const brain = page.brand_id ? await loadBrandBrain(client.id, page.brand_id) : null;
  const images = brain?.images.slice(0, 16) ?? [];
  let usd = 0;
  const ask = async (system: string, prompt: string, maxTokens: number) => {
    const res = await fetch(provider.url, {
      method: "POST", headers: { ...provider.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(240_000),
    }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    usd += estimateUsd(model, { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 }) ?? 0;
    return ((d?.content ?? []) as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  };

  const prompt = changeUserPrompt({ html: page.html, instruction, images });
  const reply = await ask(CHANGE_SYSTEM, prompt, 16000);
  let next: string | null = null, how = "none";
  const whole = /<!doctype html/i.test(reply) && !/<{5,9} ?FIND/.test(reply) ? extractHtml(reply) : null;
  if (whole) { next = whole; how = "whole"; }
  else if (reply) {
    const edited = applyEdits(page.html, reply);
    if (edited.ok) { next = edited.html; how = `edits:${edited.edits}`; }
  }
  if (!next && reply) {
    // The edit blocks didn't match the file: once more as a whole file (our cost, not the owner's).
    const again = extractHtml(await ask(`${CHANGE_SYSTEM}\nThis time reply with the whole new file, from <!doctype html> to </html>.`, prompt, 24000));
    if (again) { next = again; how = "whole-retry"; }
  }
  console.info("site change usage", JSON.stringify({ user: auth.value, page: id, model, how, usd: Number(usd.toFixed(4)) }));
  if (!next) return fail(502, "Couldn't make that change this time. Try saying it another way.");
  const checked = checkHtml(fillImages(next, images, brain?.logoUrl ?? null));
  if (!checked.ok) return fail(502, checked.error);
  if (checked.html === page.html) return fail(422, "That didn't change anything. Try saying it another way.");

  const { data: saved, error } = await supabaseAdmin.from("site_pages")
    .insert({ client_id: page.client_id, brand_id: page.brand_id, name: page.name, html: checked.html, brief: instruction, notes: page.notes, parent_id: page.id })
    .select(COLUMNS).single();
  if (error || !saved) return fail(500, "Couldn't save the change.");
  return NextResponse.json({ page: saved });
}
