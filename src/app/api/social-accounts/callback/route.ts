import { NextRequest, NextResponse } from 'next/server'
import { listConnectedAccounts, toBlinkPlatform } from '@/lib/postforme'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/social-accounts/callback
 * 
 * Handles the OAuth callback from Post for Me after a user authorizes their social account.
 * Syncs the connected account info into Supabase and redirects back to settings.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const clientId = searchParams.get('clientId')

        if (!clientId) {
            return NextResponse.redirect(
                new URL('/dashboard/settings?error=missing_client_id', request.url)
            )
        }

        // Give Post for Me a moment to finalize the account connection
        await new Promise((r) => setTimeout(r, 2000))

        // Fetch all accounts linked to this client's external_id from Post for Me
        const pfmAccounts = await listConnectedAccounts(clientId)

        if (!pfmAccounts || pfmAccounts.length === 0) {
            return NextResponse.redirect(
                new URL('/dashboard/settings?error=no_accounts_found', request.url)
            )
        }

        // Sync each connected account to Supabase
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        for (const account of pfmAccounts) {
            if (account.status !== 'connected') continue

            const blinkPlatform = toBlinkPlatform(account.platform)

            // Upsert into social_accounts — match on client_id + platform + account_id
            await supabase
                .from('social_accounts')
                .upsert(
                    {
                        client_id: clientId,
                        platform: blinkPlatform,
                        account_name: account.username || null,
                        account_id: account.user_id,
                        postforme_account_id: account.id,
                        is_active: true,
                        connected_at: new Date().toISOString(),
                    } as Record<string, unknown>,
                    {
                        onConflict: 'client_id,platform',
                        ignoreDuplicates: false,
                    }
                )
        }

        return NextResponse.redirect(
            new URL('/dashboard/settings?success=account_connected', request.url)
        )
    } catch (error) {
        console.error('OAuth callback error:', error)
        return NextResponse.redirect(
            new URL('/dashboard/settings?error=connection_failed', request.url)
        )
    }
}
