import { NextRequest, NextResponse } from 'next/server'
import { schedulePost } from '@/lib/posting'

/**
 * POST /api/social-posts/schedule
 * 
 * Schedules or immediately publishes a content piece via Post for Me.
 * 
 * Body: {
 *   contentId: string,
 *   clientId: string,
 *   platforms: string[],
 *   scheduledAt?: string | null  // ISO date string, null = post now
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { contentId, clientId, platforms, scheduledAt } = body

        if (!contentId || !clientId || !platforms || platforms.length === 0) {
            return NextResponse.json(
                { error: 'Missing required fields: contentId, clientId, platforms' },
                { status: 400 }
            )
        }

        const result = await schedulePost({
            contentId,
            clientId,
            platforms,
            scheduledAt: scheduledAt || null,
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            postformePostId: result.postformePostId,
        })
    } catch (error) {
        console.error('Schedule post API error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to schedule post' },
            { status: 500 }
        )
    }
}
