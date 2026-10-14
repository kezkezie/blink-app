import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { runBrandResearch } from "@/lib/brand-research-server";

/**
 * POST { brandId, refresh? }: how leading brands in this brand's industry design their posts,
 * researched on the web and kept on the brand (lib/brand-research-server.ts). Part of brand
 * set-up, so no credits; capped like the brand builder. A playbook under 30 days old is returned
 * as is unless refresh is asked for.
 */
export const maxDuration = 150;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 2_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; refresh?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  if (!brandId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  // Capped like the brand builder (a failed research isn't kept, so retries would each cost).
  const limit = await consumeAiLimits(auth.value, ["brand_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const r = await runBrandResearch(brandId, ws.clientId, !!body.refresh);
  return r.ok ? NextResponse.json({ research: r.research, researchedAt: r.researchedAt, cached: r.cached }) : NextResponse.json({ error: r.error }, { status: r.status });
}
