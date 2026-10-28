import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { confirmsDeletion } from "@/lib/account-delete";
import { deleteAccount, deletionPreview } from "@/lib/account-delete-server";

/**
 * Delete my account (Kezie, 2026-10-28). GET: what it would remove, for the confirmation.
 * POST { confirm: "<the sign-in email>" }: deletes it (lib/account-delete-server.ts). Signed-in only,
 * and only your own account: the user comes from the session, never from the request.
 */
export const maxDuration = 300;

async function who(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return null;
  const { data } = await supabaseAdmin.auth.admin.getUserById(auth.value);
  return data.user?.email ? { id: auth.value, email: data.user.email } : null;
}

export async function GET(request: NextRequest) {
  const me = await who(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ email: me.email, ...(await deletionPreview(me.id)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const me = await who(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { confirm?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!confirmsDeletion(body.confirm, me.email)) return NextResponse.json({ error: "Type your sign-in email exactly to confirm." }, { status: 400 });
  const r = await deleteAccount(me.id, me.email);
  console.info("account delete", JSON.stringify({ user: me.id, ok: r.ok, ...(r.ok ? r.counts : { status: r.status }) }));
  return r.ok ? NextResponse.json({ ok: true, counts: r.counts }) : NextResponse.json({ error: r.error }, { status: r.status });
}
