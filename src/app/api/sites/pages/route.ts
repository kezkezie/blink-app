import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { supabaseAdmin } from "@/lib/supabase-server";
import { requestWorkspace } from "@/lib/brand-access";
import { MAX_HTML, SLUG, checkHtml, cleanSlug } from "@/lib/sites/code";

/**
 * The website studio's pages (lib/sites/code.ts): GET ?brandId= lists them (newest first, with
 * their code), PATCH { id, html?, name? } saves the owner's own edits, POST { action: "publish",
 * id, slug } or { action: "unpublish", id }, DELETE { id }. Writes check the code (a whole page,
 * within size); published pages are served sandboxed from /w/<slug>.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, brand_id, name, html, brief, notes, parent_id, slug, published_at, created_at, updated_at";

async function ownPage(request: NextRequest, userId: string, id: unknown) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data: page } = await supabaseAdmin.from("site_pages").select("id, client_id, brand_id, slug").eq("id", id).maybeSingle();
  if (!page) return null;
  const client = await requestWorkspace(request, userId, page.brand_id);
  return client && client.id === page.client_id ? page : null;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const brandId = request.nextUrl.searchParams.get("brandId");
  if (!brandId || !UUID.test(brandId)) return NextResponse.json({ error: "Pick a brand first." }, { status: 400 });
  const client = await requestWorkspace(request, auth.value, brandId, { write: false });
  if (!client?.id) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { data, error } = await supabaseAdmin.from("site_pages").select(COLUMNS).eq("client_id", client.id).eq("brand_id", brandId).order("created_at", { ascending: false }).limit(80);
  if (error) return NextResponse.json({ error: "Couldn't load your pages." }, { status: 500 });
  return NextResponse.json({ pages: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, MAX_HTML * 2 + 4_000)) return NextResponse.json({ error: "The page is too big." }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { id?: unknown; html?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const page = await ownPage(request, auth.value, body.id);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (typeof body.html === "string") {
    const checked = checkHtml(body.html);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    patch.html = checked.html;
  }
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const { data, error } = await supabaseAdmin.from("site_pages").update(patch).eq("id", page.id).select(COLUMNS).single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  return NextResponse.json({ page: data });
}

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 2_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { action?: unknown; id?: unknown; slug?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const page = await ownPage(request, auth.value, body.id);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  if (body.action === "unpublish") {
    await supabaseAdmin.from("site_pages").update({ slug: null, published_at: null }).eq("id", page.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "publish") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const slug = cleanSlug(typeof body.slug === "string" ? body.slug : "");
  if (!SLUG.test(slug)) return NextResponse.json({ error: "Use 3 to 80 letters, numbers and dashes for the address." }, { status: 400 });
  // An address already used by this workspace moves to this page (publishing a newer version);
  // someone else's stays theirs.
  const { data: holder } = await supabaseAdmin.from("site_pages").select("id, client_id").eq("slug", slug).maybeSingle();
  if (holder && holder.client_id !== page.client_id) return NextResponse.json({ error: "That address is taken. Try another." }, { status: 409 });
  if (holder && holder.id !== page.id) await supabaseAdmin.from("site_pages").update({ slug: null, published_at: null }).eq("id", holder.id);
  const { error } = await supabaseAdmin.from("site_pages").update({ slug, published_at: new Date().toISOString() }).eq("id", page.id);
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "That address is taken. Try another." : "Couldn't publish." }, { status: /duplicate|unique/i.test(error.message) ? 409 : 500 });
  return NextResponse.json({ ok: true, slug, moved: holder && holder.id !== page.id ? holder.id : null });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const page = await ownPage(request, auth.value, body.id);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  await supabaseAdmin.from("site_pages").delete().eq("id", page.id);
  return NextResponse.json({ ok: true });
}
