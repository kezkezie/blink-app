import { NextRequest, NextResponse } from 'next/server'
import { getPostResults } from '@/lib/postforme'
import { createServerClient } from "@supabase/ssr";

/**
 * GET /api/post-results?postId=xxx
 * 
 * Fetches post results from Post for Me for a given social post.
 * Returns the success/failure status per social account with platform URLs.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll() { return request.cookies.getAll(); }, setAll() {} } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url)
        const postId = searchParams.get('postId')

        if (!postId) {
            return NextResponse.json(
                { error: 'Missing required query parameter: postId' },
                { status: 400 }
            )
        }

        const results = await getPostResults(postId)

        return NextResponse.json({ results })
    } catch (error) {
        console.error('Post results API error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch post results' },
            { status: 500 }
        )
    }
}
