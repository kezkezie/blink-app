import { NextRequest, NextResponse, after } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { workspaceFor } from "@/lib/brand-access";
import { jobStatuses, kickRescue, startImageJobs, stopImageJobs } from "@/lib/image-jobs-server";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Images that arrive (lib/image-jobs.ts). POST { request, count, caption }: makes the Library
 * posts and returns their ids at once; the first try runs in the background and a failed one is
 * retried by the server on its own. GET ?ids=a,b: where each one is (making / done / failed, the
 * line to show), rescuing any whose function died.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 64_000)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { request?: unknown; count?: unknown; caption?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const started = await startImageJobs(auth.value, body.request, typeof body.count === "number" ? body.count : 1, typeof body.caption === "string" ? body.caption : "");
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  after(started.value.work);
  return NextResponse.json({ ids: started.value.ids }, { status: 202 });
}

/** DELETE ?ids=a,b: stop images still being made (removed, credits back). The caller must be able to write to each brand. */
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
  let stopped: string[] = [], refunded = 0;
  for (const [clientId, list] of byWorkspace) { const r = await stopImageJobs(clientId, list); stopped = [...stopped, ...r.stopped]; refunded += r.refunded; }
  return NextResponse.json({ stopped, refunded });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 24);
  if (!ids.length) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const seen = new Map<string, string | null>();
  const canRead = async (row: { client_id: string; brand_id: string | null }) => {
    const key = row.brand_id ?? "";
    if (!seen.has(key)) seen.set(key, (await workspaceFor(auth.value, { brandId: row.brand_id, write: false }).catch(() => null))?.clientId ?? null);
    return seen.get(key) === row.client_id;
  };
  const { jobs, rescues } = await jobStatuses(canRead, ids);
  if (rescues.length) after(Promise.all(rescues.map((id) => kickRescue(id))).then(() => {}));
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}
