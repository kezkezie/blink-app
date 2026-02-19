import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Create Supabase client with cookie handling
    const response = NextResponse.json(
      { success: true, message: 'Check your email to confirm signup' },
      { status: 200 }
    )

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
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    // Sign up user WITHOUT email verification (testing mode)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // In testing mode, don't require email confirmation
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
        data: {
          onboarding_completed: false,
          client_id: undefined, // Will be generated in onboarding
        },
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // For testing mode: immediately sign in the user after signup
    if (process.env.NEXT_PUBLIC_TESTING_MODE === 'true' && data.user) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        return NextResponse.json(
          { error: signInError.message },
          { status: 400 }
        )
      }

      // Get fresh session
      const { data: sessionData } = await supabase.auth.getSession()

      if (sessionData.session) {
        // Set auth cookies
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          response.cookies.set('auth-token', data.session.access_token, {
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
            sameSite: 'lax',
          })
        }
      }
    }

    // Return user ID as Client ID
    return NextResponse.json({
      success: true,
      clientId: data.user?.id,
      email: data.user?.email,
      userId: data.user?.id,
      message: 'Signup successful! Redirecting to onboarding...',
    })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Signup failed' },
      { status: 500 }
    )
  }
}