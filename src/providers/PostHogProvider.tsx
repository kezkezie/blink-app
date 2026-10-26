"use client";

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CONSENT_EVENT, analyticsAllowed, type Consent } from '@/lib/consent';

/**
 * PostHog (2026-10-20: wired to production). Events go through /ingest on our own domain (rewrites
 * in next.config.ts) so ad blockers don't drop them. Signed-in people are identified by their user
 * id only (no email or name), with their plan. Test accounts and automated browsers send nothing.
 * Inputs are masked in session replays.
 * Cookie consent (2026-10-26, lib/consent.ts): where the visitor must be asked (EU, EEA, UK,
 * Switzerland), PostHog doesn't start at all until they say yes: no config fetch, no cookies, no
 * user id sent. It starts the moment they say yes, and stops (and forgets) if they later say no.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const started = () => posthog.__loaded;

/** Who this is: the user id and plan only. Test accounts send nothing. */
async function identify(userId: string | null, email?: string | null) {
    if (!started()) return;
    if (!userId) { posthog.reset(); return; }
    if (email?.endsWith('@blinkspot-test.dev')) { posthog.opt_out_capturing(); return; }
    const { data } = await supabase.from('clients').select('plan_tier').eq('user_id', userId).maybeSingle();
    posthog.identify(userId, { plan: data?.plan_tier ?? 'free' });
}

const pageview = () => posthog.capture('$pageview', { $current_url: window.location.href });

function start() {
    if (!KEY || started()) return;
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

if (typeof window !== 'undefined' && KEY) {
    if (analyticsAllowed()) start();
    window.addEventListener(CONSENT_EVENT, (e) => {
        const yes = (e as CustomEvent<Consent>).detail?.analytics === true;
        if (yes) {
            if (started()) { posthog.opt_in_capturing(); posthog.startSessionRecording(); }
            else { start(); pageview(); void supabase.auth.getUser().then(({ data }) => identify(data.user?.id ?? null, data.user?.email)); }
        } else if (started()) {
            posthog.opt_out_capturing();
            posthog.stopSessionRecording();
            posthog.reset();
            // What PostHog stored goes too.
            for (const c of document.cookie.split('; ')) { const name = c.split('=')[0]; if (name.startsWith('ph_')) document.cookie = `${name}=; Max-Age=0; Path=/`; }
            try { for (const k of Object.keys(localStorage)) if (k.startsWith('ph_')) localStorage.removeItem(k); } catch { /* blocked storage */ }
        }
    });
}

function PostHogPageViews() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!KEY || !pathname || !started()) return;
        pageview();
    }, [pathname, searchParams]);

    return null;
}

/** Identify on sign-in, reset on sign-out (only once PostHog has started). */
function PostHogIdentify() {
    useEffect(() => {
        if (!KEY) return;
        void supabase.auth.getUser().then(({ data }) => identify(data.user?.id ?? null, data.user?.email));
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (!started()) return;
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
