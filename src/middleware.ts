import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { UI_COOKIE, studioPathFor } from "@/lib/studio-routes";
import { REGION_COOKIE, needsConsentFor } from "@/lib/consent";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // 1. Initialize Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 2. Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 3. Define public routes
  const publicPaths = [
    "/",
    "/login",
    "/signup",
    "/how-it-works",
    "/pricing",
    "/get-started",
  ];

  const isPublicPath =
    publicPaths.includes(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".");

  const isAppPath = pathname.startsWith("/dashboard") || pathname === "/studio" || pathname.startsWith("/studio/");

  // 4. If logged OUT and trying to access the app (classic or studio) -> Kick to login
  if (!user && !isPublicPath && isAppPath) {
    const loginUrl = new URL("/login", request.url);
    // The whole address, so a return like ?success=account_connected survives signing in (2026-10-21).
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 5. If logged IN and trying to access login/signup pages -> Push to dashboard
  if (user) {
    if (pathname === "/login" || pathname === "/signup" || pathname === "/get-started") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 6. Two looks, one app. The new look (/studio) is the default since 2026-10-10: classic
  // /dashboard links (old bookmarks, the post-login redirect, router.push inside reused pages) land
  // on their /studio home. "Vintage look" in the studio account menu sets the cookie to "classic",
  // which keeps the original design; "New look" in the classic top bar switches back.
  if (user && pathname.startsWith("/dashboard") && request.cookies.get(UI_COOKIE)?.value !== "classic") {
    const target = studioPathFor(pathname);
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url);
    }
  }
  // Cookie consent (lib/consent.ts): whether this visitor must be asked, from Vercel's country header.
  const region = needsConsentFor(request.headers.get("x-vercel-ip-country")) ? "eu" : "other";
  if (request.cookies.get(REGION_COOKIE)?.value !== region) {
    response.cookies.set(REGION_COOKIE, region, { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ingest/|gstatic/|api/gfonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|otf)$).*)",
  ],
};