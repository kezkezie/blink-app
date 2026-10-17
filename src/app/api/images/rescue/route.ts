import { NextRequest, NextResponse, after } from "next/server";
import { checkRescueSignature, rescue } from "@/lib/image-jobs-server";

/**
 * The second try for an image whose first try failed (lib/image-jobs.ts). Called by the server
 * itself, signed; it answers at once and works in the background with its own time budget.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: { id?: unknown; ts?: unknown; sig?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id || typeof body.sig !== "string" || !checkRescueSignature(id, Number(body.ts), body.sig)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  after(rescue(id).catch((e) => console.error("image rescue failed", id, e instanceof Error ? e.message : e)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
