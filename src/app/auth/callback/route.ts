import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { consentRecord } from '@/lib/legal'

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
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const user = data.user
            if (user) {
                const meta = (user.user_metadata ?? {}) as Record<string, unknown>
                // Google (2026-10-25): the agreement shown next to the button, recorded like the sign-up box does.
                if (searchParams.get('agreed') === '1' && !meta.terms_accepted_at) {
                    await supabase.auth.updateUser({ data: consentRecord() }).catch(() => {})
                }
                // The account's name and email from Google, where the sign-up form would have set them.
                const name = String(meta.full_name || meta.name || '').trim().slice(0, 120)
                const { data: row } = await supabase.from('clients').select('contact_name, contact_email').eq('user_id', user.id).maybeSingle()
                if (row && ((!row.contact_name && name) || (!row.contact_email && user.email))) {
                    await supabase.from('clients').update({ ...(!row.contact_name && name ? { contact_name: name } : {}), ...(!row.contact_email && user.email ? { contact_email: user.email } : {}) }).eq('user_id', user.id)
                }
                // A new account goes to brand set-up first (an invite link keeps its own page).
                if (next === '/studio' && meta.onboarding_completed !== true) return NextResponse.redirect(`${origin}/welcome`)
            }
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to login if something went wrong
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}