import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { workspaceFor } from "@/lib/brand-access";
import { stopJobs } from "@/lib/stop-jobs-server";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * DELETE ?ids=a,b: stop posts still being made, whatever they are (images, videos, scenes,
 * lip-sync; lib/stop-jobs-server.ts). They're removed and what the provider hasn't billed comes back. A video n8n
 * hasn't charged yet comes back as `starting` (try again in a few seconds). The caller must be able
 * to write to each post's brand.
 */
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 24);
  if (!ids.length) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: rows } = await supabaseAdmin.from("content").select("id, client_id, brand_id").in("id", ids);
  const byWorkspace = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const ws = await workspaceFor(auth.value, { brandId: r.brand_id as string | null }).catch(() => null);
    if (!ws || ws.clientId !== r.client_id) continue;
    byWorkspace.set(ws.clientId, [...(byWorkspace.get(ws.clientId) ?? []), r.id as string]);
  }
  const out = { stopped: [] as string[], refunded: 0, kept: 0, starting: [] as string[], notStopped: [] as string[] };
  for (const [clientId, list] of byWorkspace) {
    const r = await stopJobs(clientId, list);
    out.stopped.push(...r.stopped); out.starting.push(...r.starting); out.notStopped.push(...r.notStopped); out.refunded += r.refunded; out.kept += r.kept;
  }
  out.notStopped.push(...ids.filter((id) => ![...out.stopped, ...out.starting, ...out.notStopped].includes(id)));
  return NextResponse.json(out);
}
