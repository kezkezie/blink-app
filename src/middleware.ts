import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { UI_COOKIE, studioPathFor } from "@/lib/studio-routes";

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
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. If logged IN and trying to access login/signup pages -> Push to dashboard
  if (user) {
    if (pathname === "/login" || pathname === "/signup" || pathname === "/get-started") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 6. Two looks, one app. Opening /studio opts into the new look; "Classic look" in the studio
  // account menu sets the cookie back. While the new look is on, classic /dashboard links (old
  // bookmarks, the post-login redirect, router.push inside reused pages) land on their /studio home.
  if (user && pathname.startsWith("/dashboard") && request.cookies.get(UI_COOKIE)?.value === "studio") {
    const target = studioPathFor(pathname);
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url);
    }
  }
  // Only a real page load opts in. A background RSC fetch or link prefetch of a /studio page (still
  // in flight when someone picks "Classic look") must not flip the cookie back.
  const isDocumentRequest = !request.headers.get("rsc") && !request.headers.get("next-router-prefetch") && request.headers.get("purpose") !== "prefetch";
  if (user && isDocumentRequest && (pathname === "/studio" || pathname.startsWith("/studio/")) && request.cookies.get(UI_COOKIE)?.value !== "studio") {
    response.cookies.set(UI_COOKIE, "studio", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};