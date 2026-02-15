import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase Auth callback handler.
 * After a user clicks the magic link in their email,
 * Supabase redirects them here with a code in the URL.
 * We exchange that code for a session and redirect to /dashboard.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            return NextResponse.redirect(new URL(next, request.url))
        }
    }

    // If there's no code or the exchange fails, redirect to login with error
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
