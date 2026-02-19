import { NextRequest, NextResponse } from 'next/server'
import { generateAuthUrl } from '@/lib/postforme'

/**
 * POST /api/social-accounts/auth-url
 * 
 * Generates an OAuth URL for connecting a social media account via Post for Me.
 * The frontend redirects the user to this URL to initiate the OAuth flow.
 * 
 * Body: { platform: string, clientId: string }
 * Returns: { url: string, platform: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { platform, clientId } = body

        if (!platform || !clientId) {
            return NextResponse.json(
                { error: 'Missing required fields: platform, clientId' },
                { status: 400 }
            )
        }

        // Build the callback URL — this is where Post for Me redirects after OAuth
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const callbackUrl = `${appUrl}/api/social-accounts/callback?clientId=${encodeURIComponent(clientId)}`

        const result = await generateAuthUrl(platform, clientId, callbackUrl)

        return NextResponse.json({
            url: result.url,
            platform: result.platform,
        })
    } catch (error) {
        console.error('Error generating auth URL:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate auth URL' },
            { status: 500 }
        )
    }
}
