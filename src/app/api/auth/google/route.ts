import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const origin = request.nextUrl.origin

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

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // ✨ This line forces Supabase to send them to the exact catcher route
        redirectTo: `${origin}/auth/callback?next=/get-started`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ url: data.url })

  } catch (error) {
    console.error('Google auth error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Google auth failed' },
      { status: 500 }
    )
  }
}