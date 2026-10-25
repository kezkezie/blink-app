import { supabaseAdmin } from "@/lib/supabase-server";
import { PUBLISHED_CSP } from "@/lib/sites/code";
import { workspaceNeedsStamp } from "@/lib/stamp-server";
import { withSiteBadge } from "@/lib/stamp";

/**
 * A published website studio page: blinkspot.io/w/<slug>. Served as the owner wrote it, inside a
 * CSP sandbox: it runs as an opaque origin (no access to blinkspot.io cookies or storage), can't
 * call out, post forms or frame anything (lib/sites/code.ts PAGE_CSP). A free account's page carries
 * a small "Made with BlinkSpot" badge (lib/stamp.ts), added here, so upgrading removes it within a minute.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = /^[a-z0-9-]{3,80}$/.test(slug)
    ? (await supabaseAdmin.from("site_pages").select("html, client_id").eq("slug", slug).not("published_at", "is", null).maybeSingle()).data
    : null;
  if (!page?.html) {
    return new Response("<!doctype html><meta charset=utf-8><title>Not found</title><p style=\"font:16px system-ui;padding:40px\">This page isn't published.</p>", {
      status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PUBLISHED_CSP },
    });
  }
  const html = (await workspaceNeedsStamp(page.client_id as string)) ? withSiteBadge(page.html as string) : (page.html as string);
  return new Response(html, {
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
