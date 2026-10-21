import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { workspaceFor } from "@/lib/brand-access";
import { DESIGN_LOOKS, designPrompt } from "@/lib/design-pass-server";

/**
 * POST { brandId, look, requirements }: the design pass before Generate renders on Best or Fast
 * (lib/design-pass.ts). Part of the image's price, so no separate credits; about $0.01 of Sonnet.
 * Any failure answers 502 and Generate falls back to the requirements as they are.
 */
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 16_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; look?: unknown; requirements?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const look = DESIGN_LOOKS.find((l) => l === body.look);
  const requirements = typeof body.requirements === "string" ? body.requirements.trim().slice(0, 8000) : "";
  if (!brandId || !look || requirements.length < 8) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data: brand } = await supabaseAdmin.from("brand_profiles").select("brand_name, industry").eq("id", brandId).eq("client_id", ws.clientId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["design_pass"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  const design = await designPrompt({ look, requirements, brandName: brand.brand_name || "the brand", industry: brand.industry, clientId: ws.clientId, userId: auth.value, brandId });
  if (!design) return NextResponse.json({ error: "Design isn't available right now." }, { status: 502 });
  return NextResponse.json(design);
}
