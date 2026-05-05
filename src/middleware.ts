import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Auth middleware: protects all /dashboard/* routes.
 * Redirects unauthenticated users to /login.
 * Client profile auto-creation is handled by useClient hook.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
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

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Create a Supabase client that reads cookies from the request
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  // Check for an active session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (!user) {
    if (pathname.startsWith("/dashboard")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  return response;
}

export const config = {
  // ✅ FIXED: Updated matcher to track /get-started instead
  matcher: ["/dashboard/:path*", "/get-started", "/signup"],
};
