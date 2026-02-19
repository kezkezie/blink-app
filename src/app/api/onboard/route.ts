import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Direct Supabase onboarding — replaces the n8n webhook.
 * Creates: client → brand_profile → social_accounts → assets
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.json()

        // Use service role key for server-side inserts
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Server configuration error: missing Supabase credentials' },
                { status: 500 }
            )
        }
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // ─── 1. Map plan name → plan_tier enum ───
        const planMap: Record<string, string> = {
            starter: 'starter',
            growth: 'pro',
            premium: 'agency',
        }
        const planTier = planMap[payload.plan] || 'starter'

        // ─── 2. Map chat platform → approval_channel ───
        const channelMap: Record<string, string> = {
            whatsapp: 'whatsapp',
            telegram: 'telegram',
            instagram_dm: 'whatsapp', // fallback
            facebook_messenger: 'whatsapp', // fallback
        }
        const approvalChannel = channelMap[payload.chat_platform] || 'telegram'

        // ─── 3. Create the Client record ───
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .insert({
                company_name: payload.business_name,
                contact_name: payload.contact_name,
                contact_email: payload.email,
                contact_phone: payload.phone || null,
                website_url: payload.website_url || null,
                industry: payload.industry || null,
                plan_tier: planTier,
                billing_status: 'trial',
                onboarding_status: 'form_submitted',
                onboarding_notes: JSON.stringify({
                    description: payload.description,
                    chat_platform: payload.chat_platform,
                    chat_handle: payload.chat_handle,
                    chat_auto_reply: payload.chat_auto_reply,
                    chat_business_hours: payload.chat_business_hours,
                    avoid_text: payload.avoid_text,
                }),
                approval_channel: approvalChannel,
                approval_contact: payload.chat_handle || payload.email,
                timezone: 'Africa/Nairobi',
                // Link to the authenticated user (multi-tenant)
                user_id: payload.user_id || null,
            } as Record<string, unknown>)
            .select('id')
            .single()

        if (clientError || !client) {
            console.error('Client insert error:', clientError)
            return NextResponse.json(
                { error: clientError?.message || 'Failed to create client record' },
                { status: 500 }
            )
        }

        const clientId = client.id

        // ─── 4. Create Brand Profile ───
        const colors = payload.brand_colors || []
        const { error: brandError } = await supabase
            .from('brand_profiles')
            .insert({
                client_id: clientId,
                source: 'manual',
                logo_url: payload.logo_url || null,
                primary_color: colors[0] || null,
                secondary_color: colors[1] || null,
                accent_color: colors[2] || null,
                additional_colors: colors.slice(3),
                tone_keywords: payload.brand_vibes || [],
                vocabulary_notes: payload.avoid_text
                    ? `Avoid: ${payload.avoid_text}`
                    : null,
                uploaded_assets: payload.brand_photo_urls || [],
                is_active: true,
            } as Record<string, unknown>)

        if (brandError) {
            console.error('Brand profile insert error:', brandError)
            // Non-fatal — continue
        }

        // ─── 5. Create Social Accounts ───
        const socialEntries: Array<Record<string, unknown>> = []

        if (payload.instagram_handle) {
            socialEntries.push({
                client_id: clientId,
                platform: 'instagram',
                account_name: `@${payload.instagram_handle}`,
                account_id: payload.instagram_handle,
                is_active: true,
                connected_at: new Date().toISOString(),
            })
        }
        if (payload.tiktok_handle) {
            socialEntries.push({
                client_id: clientId,
                platform: 'tiktok',
                account_name: `@${payload.tiktok_handle}`,
                account_id: payload.tiktok_handle,
                is_active: true,
                connected_at: new Date().toISOString(),
            })
        }
        if (payload.facebook_handle) {
            socialEntries.push({
                client_id: clientId,
                platform: 'facebook',
                account_name: payload.facebook_handle,
                account_id: payload.facebook_handle,
                is_active: true,
                connected_at: new Date().toISOString(),
            })
        }
        if (payload.twitter_handle) {
            socialEntries.push({
                client_id: clientId,
                platform: 'twitter',
                account_name: `@${payload.twitter_handle}`,
                account_id: payload.twitter_handle,
                is_active: true,
                connected_at: new Date().toISOString(),
            })
        }

        if (socialEntries.length > 0) {
            const { error: socialError } = await supabase
                .from('social_accounts')
                .insert(socialEntries)

            if (socialError) {
                console.error('Social accounts insert error:', socialError)
                // Non-fatal
            }
        }

        // ─── 6. Create Asset records for uploaded files ───
        const assetEntries: Array<Record<string, unknown>> = []

        if (payload.logo_url) {
            assetEntries.push({
                client_id: clientId,
                asset_type: 'logo',
                file_name: 'logo',
                file_url: payload.logo_url,
                storage_provider: 'supabase',
                purpose: 'brand_logo',
            })
        }

        if (payload.brand_photo_urls && payload.brand_photo_urls.length > 0) {
            for (const url of payload.brand_photo_urls) {
                assetEntries.push({
                    client_id: clientId,
                    asset_type: 'image',
                    file_name: url.split('/').pop() || 'brand_photo',
                    file_url: url,
                    storage_provider: 'supabase',
                    purpose: 'brand_reference',
                })
            }
        }

        if (assetEntries.length > 0) {
            const { error: assetError } = await supabase
                .from('assets')
                .insert(assetEntries)

            if (assetError) {
                console.error('Assets insert error:', assetError)
                // Non-fatal
            }
        }

        // ─── 7. Log a workflow run for tracking ───
        await supabase
            .from('workflow_runs')
            .insert({
                client_id: clientId,
                workflow_name: 'client_onboarding',
                workflow_type: 'onboarding',
                status: 'success',
                input_summary: {
                    business_name: payload.business_name,
                    plan: payload.plan,
                    email: payload.email,
                },
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
            } as Record<string, unknown>)

        console.log(`✅ Client onboarded: ${payload.business_name} (ID: ${clientId})`)

        return NextResponse.json({
            success: true,
            clientId,
            message: `Welcome! ${payload.business_name} has been onboarded successfully.`,
        })
    } catch (err) {
        console.error('Onboard error:', err)
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Onboarding failed' },
            { status: 500 }
        )
    }
}
