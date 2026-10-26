import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { workspaceFor } from "@/lib/brand-access";
import { cleanSiteList } from "@/lib/sites/site-refs";
import { keptSiteRefs, studySites } from "@/lib/sites/site-refs-server";

/**
 * Websites you like (2026-10-27, lib/sites/site-refs.ts).
 * POST { brandId }: the sites the owner picked and what was learned from them ({ sites: [] } if none).
 * POST { brandId, sites: ["stripe.com", ...] }: study that list (it replaces the last one; empty
 * clears it). No credits, like the picture references; rate-limited with them.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 4_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; sites?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  if (!brandId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const studying = body.sites !== undefined;
  const ws = await workspaceFor(auth.value, { brandId, write: studying }).catch(() => null);
  if (!ws) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  if (!studying) {
    const kept = await keptSiteRefs(brandId, ws.clientId);
    return NextResponse.json(kept ?? { sites: [], patterns: "" });
  }
  const list = cleanSiteList(body.sites);
  if ("error" in list) return NextResponse.json({ error: list.error }, { status: 400 });
  if (list.sites.length) {
    const limit = await consumeAiLimits(auth.value, ["brand_build"]);
    if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  }
  const r = await studySites(brandId, ws.clientId, list.sites);
  return r.ok ? NextResponse.json({ ...r.value, skipped: r.skipped }) : NextResponse.json({ error: r.error }, { status: r.status });
}
