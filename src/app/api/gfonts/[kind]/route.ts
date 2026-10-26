import { NextRequest, NextResponse } from "next/server";
import { FONT_KINDS } from "@/lib/google-fonts";

/**
 * GET /api/gfonts/css2?family=... (also css, Google's older format, and icon, Material Icons): a
 * Google Fonts stylesheet fetched on the server, with its font files on /gstatic/ (proxied in
 * next.config.ts), so visitors' browsers never contact Google (lib/google-fonts.ts).
 */
const SAFE = /^[A-Za-z0-9+:;@,.=&%_\-|~]*$/;
// A current browser, so Google answers with woff2.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const css = (body: string, status: number) => new NextResponse(body, { status, headers: { "Content-Type": "text/css" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const query = request.nextUrl.search.slice(1);
  if (!(FONT_KINDS as readonly string[]).includes(kind)) return css("/* unknown font kind */", 404);
  if (!query || query.length > 2000 || !SAFE.test(query) || !/(^|&)family=/.test(query)) return css("/* bad font query */", 400);
  const res = await fetch(`https://fonts.googleapis.com/${kind}?${query}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return css("/* font unavailable */", res?.status === 400 ? 400 : 502);
  const origin = request.nextUrl.origin;
  const body = (await res.text()).replaceAll("https://fonts.gstatic.com/", `${origin}/gstatic/`);
  return new NextResponse(body, { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400", "Access-Control-Allow-Origin": "*" } });
}
