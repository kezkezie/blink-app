import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ✨ FIX: This MUST be a GET function to handle the Google redirect
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // Only a path on this site ("@evil.com" or "//evil.com" would send people elsewhere after signing in).
    const wanted = searchParams.get('next') ?? '/welcome'
    const next = /^\/(?!\/)[\w\-./?=&%]*$/.test(wanted) ? wanted : '/welcome'

    if (code) {
        const cookieStore = await cookies()

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options)
                            })
                        } catch (error) {
                            // Safe to ignore in a Route Handler
                        }
                    },
                },
            }
        )

        // Exchange the code for a real user session
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to login if something went wrong
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}