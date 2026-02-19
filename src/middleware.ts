import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Auth middleware: protects all /dashboard/* routes.
 * Redirects unauthenticated users to /login.
 * Redirects users who haven't completed onboarding to /onboarding.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Public routes — no auth required
    const publicPaths = ['/', '/login', '/signup', '/how-it-works', '/pricing', '/get-started', '/onboarding']
    const isPublicPath =
        publicPaths.includes(pathname) ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/') ||
        pathname.includes('.')

    if (isPublicPath) {
        return NextResponse.next()
    }

    // Create a Supabase client that reads cookies from the request
    let response = NextResponse.next({
        request: { headers: request.headers },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        response = NextResponse.next({
                            request: { headers: request.headers },
                        })
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // Check for an active session
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Redirect unauthenticated users to login
    if (!user) {
        if (pathname.startsWith('/dashboard')) {
            const loginUrl = new URL('/login', request.url)
            loginUrl.searchParams.set('redirect', pathname)
            return NextResponse.redirect(loginUrl)
        }
        return response
    }

    // Check if user has completed onboarding
    if (pathname.startsWith('/dashboard')) {
        const onboardingCompleted = user.user_metadata?.onboarding_completed === true

        if (!onboardingCompleted) {
            // Redirect to onboarding
            return NextResponse.redirect(new URL('/onboarding', request.url))
        }
    }

    return response
}

export const config = {
    matcher: ['/dashboard/:path*', '/onboarding', '/signup'],
}
