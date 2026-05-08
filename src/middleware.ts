import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // 1. ALWAYS initialize Supabase first so it manages cookies properly
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

  // 2. ALWAYS call getUser() to refresh the session and clear dead cookies
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

  // 4. Redirect unauthenticated users trying to access protected routes
  if (!user && !isPublicPath && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Intelligent Routing for Logged-In Users
  if (user) {
    const onboardingCompleted = user.user_metadata?.onboarding_completed === true;

    // Prevent logged-in users from seeing the login/signup screens
    if (pathname === "/login" || pathname === "/signup") {
      return NextResponse.redirect(
        new URL(onboardingCompleted ? "/dashboard" : "/get-started", request.url)
      );
    }

    // Prevent unfinished users from accessing the dashboard
    if (pathname.startsWith("/dashboard") && !onboardingCompleted) {
      return NextResponse.redirect(new URL("/get-started", request.url));
    }

    // Prevent finished users from going back to the onboarding wizard
    if (pathname === "/get-started" && onboardingCompleted) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Catch everything except static assets so cookie refreshing always fires
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};