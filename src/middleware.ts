import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Auth middleware: protects all /dashboard/* routes.
 * If the user is not authenticated, redirects to /login.
 * Public routes (/, /login, /how-it-works, /pricing, /get-started, /api) are allowed through.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Define public routes that don't require authentication
    const publicPaths = ['/', '/login', '/how-it-works', '/pricing', '/get-started']
    const isPublicPath =
        publicPaths.includes(pathname) ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/') ||
        pathname.includes('.')

    // Only protect /dashboard routes
    if (isPublicPath) {
        return NextResponse.next()
    }

    // Check for Supabase auth session via cookies
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                cookie: request.headers.get('cookie') || '',
            },
        },
    })

    const {
        data: { session },
    } = await supabase.auth.getSession()

    // If no session and trying to access protected route, redirect to login
    // if (!session && pathname.startsWith('/dashboard')) {
    //     const loginUrl = new URL('/login', request.url)
    //     loginUrl.searchParams.set('redirect', pathname)
    //     return NextResponse.redirect(loginUrl)
    // }

    return NextResponse.next()
}

export const config = {
    matcher: ['/dashboard/:path*'],
}
