"use client";

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * PostHog (2026-10-20: wired to production). Events go through /ingest on our own domain (rewrites
 * in next.config.ts) so ad blockers don't drop them. Signed-in people are identified by their user
 * id only (no email or name), with their plan. Test accounts and automated browsers send nothing.
 * Inputs are masked in session replays.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (typeof window !== 'undefined' && KEY) {
    posthog.init(KEY, {
        api_host: '/ingest',
        ui_host: 'https://us.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: false, // handled below for the App Router
        capture_pageleave: true,
        session_recording: { maskAllInputs: true },
        loaded: (ph) => {
            if (navigator.webdriver) ph.opt_out_capturing();
        },
    });
}

function PostHogPageViews() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!KEY || !pathname || typeof window === 'undefined') return;
        let url = window.origin + pathname;
        if (searchParams.toString()) url = url + `?${searchParams.toString()}`;
        posthog.capture('$pageview', { $current_url: url });
    }, [pathname, searchParams]);

    return null;
}

/** Who this is: the user id and plan; reset on sign-out. */
function PostHogIdentify() {
    useEffect(() => {
        if (!KEY) return;
        const identify = async (userId: string | null, email?: string | null) => {
            if (!userId) { posthog.reset(); return; }
            if (email?.endsWith('@blinkspot-test.dev')) { posthog.opt_out_capturing(); return; }
            const { data } = await supabase.from('clients').select('plan_tier').eq('user_id', userId).maybeSingle();
            posthog.identify(userId, { plan: data?.plan_tier ?? 'free' });
        };
        void supabase.auth.getUser().then(({ data }) => identify(data.user?.id ?? null, data.user?.email));
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') posthog.reset();
            else if (event === 'SIGNED_IN') void identify(session?.user.id ?? null, session?.user.email);
        });
        return () => sub.subscription.unsubscribe();
    }, []);
    return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    return (
        <PHProvider client={posthog}>
            <Suspense fallback={null}>
                <PostHogPageViews />
            </Suspense>
            <PostHogIdentify />
            {children}
        </PHProvider>
    );
}
