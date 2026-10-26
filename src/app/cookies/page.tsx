import Link from "next/link";
import { COMPANY, LegalContact, LegalShell } from "@/components/legal/LegalShell";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";

export const metadata = {
    title: "Cookie Policy | BlinkSpot",
    description: "The cookies and browser storage BlinkSpot uses, and how to change your choice.",
};

/**
 * Rewritten 2026-10-26 with the cookie choice (lib/consent.ts, components/CookieConsent.tsx): the
 * April template described advertising cookies, tracking pixels and Flash, none of which BlinkSpot
 * uses. This lists what the app really sets. Adding a cookie or a tracker? Add its row here.
 */
const ESSENTIAL: Array<[string, string, string]> = [
    ["sb-…-auth-token", "Keeps you signed in (Supabase)", "Until you sign out, up to 400 days"],
    ["auth-token", "Signs you in right after creating an account", "7 days"],
    ["ui", "Remembers which look of the app you use", "12 months"],
    ["blink_region", "Whether we need to ask you about cookies (from your country)", "1 day"],
    ["blink_consent", "Your cookie choice", "12 months"],
];

export default function CookiesPage() {
    return (
        <LegalShell title="Cookie Policy" updated="Last updated October 26, 2026" current="/cookies">
            <div className="legal-body">
                <p>
                    This policy explains the cookies and similar browser storage <strong>{COMPANY.name}</strong> (trading as BlinkSpot) uses on <a href="https://www.blinkspot.io">blinkspot.io</a> and in the BlinkSpot app, and how you choose. For how we handle personal information generally, see our <Link href="/privacy">Privacy Policy</Link>.
                </p>

                <h2>The short version</h2>
                <ul>
                    <li>Essential cookies keep you signed in and secure. They don&apos;t need consent, and BlinkSpot can&apos;t work without them.</li>
                    <li>Analytics (PostHog) helps us see which features help. In the EU, EEA, UK and Switzerland it only runs after you say yes; elsewhere it&apos;s on unless you turn it off.</li>
                    <li>No advertising cookies, no tracking pixels, and we never sell your data.</li>
                    <li>Change your choice any time: <CookieSettingsLink className="cookie-link" />.</li>
                </ul>

                <h2>Essential cookies</h2>
                <div className="overflow-x-auto">
                    <table>
                        <thead><tr><th>Name</th><th>What it does</th><th>How long</th></tr></thead>
                        <tbody>{ESSENTIAL.map(([name, what, long]) => <tr key={name}><td><code>{name}</code></td><td>{what}</td><td>{long}</td></tr>)}</tbody>
                    </table>
                </div>
                <p>
                    The app also keeps things on your device so they&apos;re there next time: your active brand, unsent drafts and editor preferences (in your browser&apos;s local storage, under names starting <code>blink</code>, <code>brand-storage</code>, <code>draft:</code> and <code>kept:</code>). They stay until you clear them and never leave your device on their own.
                </p>

                <h2>Analytics (only with your choice)</h2>
                <div className="overflow-x-auto">
                    <table>
                        <thead><tr><th>Name</th><th>Who</th><th>What it does</th><th>How long</th></tr></thead>
                        <tbody>
                            <tr><td><code>ph_…_posthog</code> (cookie and local storage)</td><td>PostHog, through our own domain</td><td>A random id and session, so we can count visits and see which features are used, plus session replays with every typed field hidden</td><td>12 months</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Where we must ask (the EU, EEA, UK and Switzerland), PostHog doesn&apos;t start at all until you say yes: nothing is stored and nothing is sent. If you say no later, it stops and what it stored is removed.
                </p>

                <h2>Other sites</h2>
                <p>
                    Paying opens Paystack&apos;s page, and Sign in with Google opens Google&apos;s; they set their own cookies under their own policies. Fonts on BlinkSpot come through our own server, so your browser doesn&apos;t contact Google for them.
                </p>

                <h2>Your choices</h2>
                <ul>
                    <li>Use <CookieSettingsLink className="cookie-link" /> (also at the bottom of every page) to turn analytics on or off.</li>
                    <li>You can also block or delete cookies in your browser settings. Blocking essential cookies will sign you out and parts of BlinkSpot won&apos;t work.</li>
                </ul>

                <h2>Changes</h2>
                <p>When we change the cookies we use, we update this page and its date. If a change needs your consent, we ask again.</p>
            </div>
            <LegalContact intro="Questions about cookies? Write to us." />
        </LegalShell>
    );
}
