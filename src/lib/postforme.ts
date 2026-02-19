/**
 * Post for Me API Client — centralized wrapper for the PostForMe SDK.
 * 
 * Server-side only! Never import this in 'use client' components.
 * All API key access stays on the server via Next.js API routes.
 */
import PostForMe from 'post-for-me'

// Singleton client instance — reused across API route invocations
let _client: PostForMe | null = null

export function getPostForMeClient(): PostForMe {
    if (!_client) {
        const apiKey = process.env.POST_FOR_ME_API_KEY
        if (!apiKey) {
            throw new Error(
                'POST_FOR_ME_API_KEY is not set. Add it to your .env.local file.'
            )
        }
        _client = new PostForMe({ apiKey })
    }
    return _client
}

// ─── Platform Mapping ───
// Maps Blink platform names → Post for Me platform names
const BLINK_TO_PFM_PLATFORM: Record<string, string> = {
    instagram: 'instagram',
    facebook: 'facebook',
    tiktok: 'tiktok',
    twitter: 'x',        // Blink uses "twitter", PFM uses "x"
    linkedin: 'linkedin',
    youtube: 'youtube',
    pinterest: 'pinterest',
    threads: 'threads',
    bluesky: 'bluesky',
}

export function toPfmPlatform(blinkPlatform: string): string {
    return BLINK_TO_PFM_PLATFORM[blinkPlatform] || blinkPlatform
}

export function toBlinkPlatform(pfmPlatform: string): string {
    // Reverse lookup
    const entry = Object.entries(BLINK_TO_PFM_PLATFORM).find(
        ([, pfm]) => pfm === pfmPlatform
    )
    return entry ? entry[0] : pfmPlatform
}

// ─── Helper: Generate OAuth URL ───
export async function generateAuthUrl(
    platform: string,
    clientId: string,
    redirectUrl?: string
) {
    const client = getPostForMeClient()
    const result = await client.socialAccounts.createAuthURL({
        platform: toPfmPlatform(platform),
        external_id: clientId,
        permissions: ['posts', 'feeds'],
        ...(redirectUrl ? { redirect_url_override: redirectUrl } : {}),
    })
    return result
}

// ─── Helper: List Connected Accounts ───
export async function listConnectedAccounts(externalId?: string) {
    const client = getPostForMeClient()
    const result = await client.socialAccounts.list({
        ...(externalId ? { external_id: [externalId] } : {}),
        limit: 100,
    })
    return result.data
}

// ─── Helper: Disconnect Account ───
export async function disconnectAccount(postformeAccountId: string) {
    const client = getPostForMeClient()
    return await client.socialAccounts.disconnect(postformeAccountId)
}

// ─── Helper: Upload Media ───
export async function uploadMediaUrl(
    imageUrl: string
): Promise<string> {
    const client = getPostForMeClient()

    // Step 1: Get a signed upload URL
    const { media_url, upload_url } = await client.media.createUploadURL()

    // Step 2: Fetch the image from the existing URL and upload it
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from ${imageUrl}: ${imageResponse.status}`)
    }

    const imageBlob = await imageResponse.blob()
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: imageBlob,
    })

    if (!uploadResponse.ok) {
        throw new Error(`Failed to upload media: ${uploadResponse.status}`)
    }

    // Step 3: Return the permanent media URL for use in posts
    return media_url
}

// ─── Helper: Create Post ───
export async function createSocialPost(params: {
    caption: string
    accountIds: string[]
    mediaUrls?: string[]
    scheduledAt?: string | null
    externalId?: string
}) {
    const client = getPostForMeClient()

    const media = params.mediaUrls?.map((url) => ({ url })) || undefined

    const result = await client.socialPosts.create({
        caption: params.caption,
        social_accounts: params.accountIds,
        ...(media && media.length > 0 ? { media } : {}),
        ...(params.scheduledAt ? { scheduled_at: params.scheduledAt } : {}),
        ...(params.externalId ? { external_id: params.externalId } : {}),
    })

    return result
}

// ─── Helper: Get Post Results ───
export async function getPostResults(postId: string) {
    const client = getPostForMeClient()
    const result = await client.socialPostResults.list({
        post_id: [postId],
    })
    return result.data
}
