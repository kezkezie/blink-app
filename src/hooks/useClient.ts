'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface UseClientResult {
    clientId: string | null
    user: User | null
    loading: boolean
}

/**
 * Central hook that derives the client_id from the authenticated user's session.
 * Replaces all hardcoded CLIENT_ID / TEST_CLIENT_ID constants.
 *
 * - If no session → redirect to /login
 * - If session but no client → auto-creates the client row (starter tier)
 * - Otherwise → return { clientId, user }
 */
export function useClient(): UseClientResult {
    const [clientId, setClientId] = useState<string | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        let cancelled = false

        async function resolve() {
            try {
                // 1. Get the current user from session
                const {
                    data: { user: authUser },
                } = await supabase.auth.getUser()

                if (!authUser) {
                    router.replace('/login')
                    return
                }

                if (cancelled) return
                setUser(authUser)

                // 2. Look up the client linked to this user
                const { data: client, error } = await supabase
                    .from('clients')
                    .select('id')
                    .eq('user_id', authUser.id)
                    .maybeSingle()

                if (cancelled) return

                if (error) {
                    console.error('useClient: error fetching client', error)
                }

                if (!client) {
                    // ✨ THE FIX: Provide a default company_name to satisfy the database constraint!
                    const defaultName = authUser.email ? `${authUser.email.split('@')[0]}'s Workspace` : 'My Workspace';

                    const { data: newClient, error: insertError } = await supabase
                        .from('clients')
                        .insert({
                            user_id: authUser.id,
                            company_name: defaultName,
                            plan_tier: 'starter',
                            onboarding_status: 'active'
                        })
                        .select('id')
                        .single()

                    if (insertError || !newClient) {
                        console.error('Failed to auto-create client profile:', insertError)
                        // Fallback to login if we can't create their profile
                        router.replace('/login')
                        return
                    }

                    // Update their auth metadata so they are officially onboarded
                    await supabase.auth.updateUser({
                        data: { onboarding_completed: true }
                    })

                    setClientId(newClient.id)
                    return
                }

                setClientId(client.id)
            } catch (err) {
                console.error('useClient error:', err)
                router.replace('/login')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        resolve()

        // Listen for auth state changes (login/logout)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                setClientId(null)
                setUser(null)
                router.replace('/login')
            }
        })

        return () => {
            cancelled = true
            subscription.unsubscribe()
        }
    }, [router])

    return { clientId, user, loading }
}
