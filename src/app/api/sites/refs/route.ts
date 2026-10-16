import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { runSiteRefs } from "@/lib/sites/site-refs-server";

/**
 * POST { brandId, refresh?, cachedOnly? }: well-designed websites in the brand's category and the
 * patterns the website studio follows (2026-10-16, lib/sites/site-refs.ts). Kept 30 days; the first
 * run takes about a minute. No credits, like the picture references; rate-limited with them.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 2_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; refresh?: unknown; cachedOnly?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  if (!brandId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ws = await workspaceFor(auth.value, { brandId }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const refresh = body.refresh === true;
  const kept = await runSiteRefs(brandId, ws.clientId, { cachedOnly: true });
  if (kept.ok && !refresh) return NextResponse.json({ ...kept.value, cached: true });
  if (body.cachedOnly === true) return NextResponse.json({ sites: null });
  const limit = await consumeAiLimits(auth.value, ["brand_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const r = await runSiteRefs(brandId, ws.clientId, { refresh });
  return r.ok ? NextResponse.json({ ...r.value, cached: r.cached }) : NextResponse.json({ error: r.error }, { status: r.status });
}
