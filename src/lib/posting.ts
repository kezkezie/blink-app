/**
 * Posting Helper — orchestrates creating posts via the Post for Me API.
 * 
 * Server-side only! Used by API routes to handle the full posting flow:
 * 1. Fetch content from Supabase
 * 2. Upload media to Post for Me (if needed)
 * 3. Get the client's connected Post for Me account IDs
 * 4. Create the post via Post for Me API
 * 5. Track the post ID in content_schedule
 */
import { createClient } from '@supabase/supabase-js'
import {
    createSocialPost,
    uploadMediaUrl,
    listConnectedAccounts,
    toPfmPlatform,
} from '@/lib/postforme'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface SchedulePostParams {
    contentId: string
    clientId: string
    platforms: string[]
    scheduledAt?: string | null
}

interface SchedulePostResult {
    success: boolean
    postformePostId?: string
    error?: string
}

export async function schedulePost(params: SchedulePostParams): Promise<SchedulePostResult> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        // 1. Fetch the content from Supabase
        const { data: content, error: contentError } = await supabase
            .from('content')
            .select('*')
            .eq('id', params.contentId)
            .single()

        if (contentError || !content) {
            return { success: false, error: `Content not found: ${contentError?.message}` }
        }

        // 2. Get the client's connected Post for Me accounts
        const pfmAccounts = await listConnectedAccounts(params.clientId)

        if (!pfmAccounts || pfmAccounts.length === 0) {
            return { success: false, error: 'No connected social accounts found. Connect accounts in Settings first.' }
        }

        // Filter to only requested platforms and connected accounts
        const targetAccountIds = pfmAccounts
            .filter((acc) => {
                const blinkPlatforms = params.platforms.map(toPfmPlatform)
                return blinkPlatforms.includes(acc.platform) && acc.status === 'connected'
            })
            .map((acc) => acc.id)

        if (targetAccountIds.length === 0) {
            return {
                success: false,
                error: `No connected accounts found for platforms: ${params.platforms.join(', ')}. Connect them in Settings.`,
            }
        }

        // 3. Upload media to Post for Me (if the content has images)
        const mediaUrls: string[] = []

        if (content.image_url) {
            try {
                const pfmMediaUrl = await uploadMediaUrl(content.image_url as string)
                mediaUrls.push(pfmMediaUrl)
            } catch (err) {
                console.error('Media upload error:', err)
                // Continue without media — still post the caption
            }
        }

        // Also handle image_urls array if present
        if (content.image_urls && Array.isArray(content.image_urls)) {
            for (const url of content.image_urls as string[]) {
                try {
                    const pfmMediaUrl = await uploadMediaUrl(url)
                    mediaUrls.push(pfmMediaUrl)
                } catch (err) {
                    console.error('Media upload error for carousel image:', err)
                }
            }
        }

        // 4. Build the caption
        const caption = buildCaption(
            content.caption as string | null,
            content.hashtags as string | null,
            content.call_to_action as string | null
        )

        // 5. Create the post via Post for Me
        const post = await createSocialPost({
            caption,
            accountIds: targetAccountIds,
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
            scheduledAt: params.scheduledAt || undefined,
            externalId: params.contentId,
        })

        // 6. Create a content_schedule entry in Supabase for each platform
        for (const platform of params.platforms) {
            await supabase
                .from('content_schedule')
                .insert({
                    content_id: params.contentId,
                    client_id: params.clientId,
                    platform,
                    scheduled_at: params.scheduledAt || new Date().toISOString(),
                    status: params.scheduledAt ? 'queued' : 'posting',
                    postforme_post_id: post.id,
                } as Record<string, unknown>)
        }

        // 7. Update content status
        const newStatus = params.scheduledAt ? 'scheduled' : 'posted'
        await supabase
            .from('content')
            .update({ status: newStatus } as Record<string, unknown>)
            .eq('id', params.contentId)

        return { success: true, postformePostId: post.id }
    } catch (error) {
        console.error('Schedule post error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
    }
}

/**
 * Builds a full caption from content fields — caption + hashtags + CTA
 */
function buildCaption(
    caption: string | null,
    hashtags: string | null,
    callToAction: string | null
): string {
    const parts: string[] = []

    if (caption) parts.push(caption)
    if (hashtags) parts.push('\n\n' + hashtags)
    if (callToAction) parts.push('\n\n' + callToAction)

    return parts.join('') || 'Check this out!'
}
