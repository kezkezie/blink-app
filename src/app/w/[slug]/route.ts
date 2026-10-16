import { supabaseAdmin } from "@/lib/supabase-server";
import { PUBLISHED_CSP } from "@/lib/sites/code";

/**
 * A published website studio page: blinkspot.io/w/<slug>. Served as the owner wrote it, inside a
 * CSP sandbox: it runs as an opaque origin (no access to blinkspot.io cookies or storage), can't
 * call out, post forms or frame anything (lib/sites/code.ts PAGE_CSP).
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = /^[a-z0-9-]{3,80}$/.test(slug)
    ? (await supabaseAdmin.from("site_pages").select("html").eq("slug", slug).not("published_at", "is", null).maybeSingle()).data
    : null;
  if (!page?.html) {
    return new Response("<!doctype html><meta charset=utf-8><title>Not found</title><p style=\"font:16px system-ui;padding:40px\">This page isn't published.</p>", {
      status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PUBLISHED_CSP },
    });
  }
  return new Response(page.html as string, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PUBLISHED_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      // Not cached: "Take offline" and "Publish this version" must show at once (a CDN copy lingered for minutes).
      "Cache-Control": "no-store",
    },
  });
}
