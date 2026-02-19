import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Google Sign-In OAuth flow handler
 * Initiates the OAuth flow with Google
 */
export async function POST(request: NextRequest) {
  try {
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
              // Don't set cookies in this handler - let Supabase handle it
            })
          },
        },
      }
    )

    // Start OAuth flow with Google
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Redirect to Google OAuth URL
    return NextResponse.redirect(data.url)
  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Google auth failed' },
      { status: 500 }
    )
  }
}
