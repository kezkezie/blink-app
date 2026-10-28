import Link from "next/link";
import { COMPANY, LegalContact, LegalShell } from "@/components/legal/LegalShell";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";

export const metadata = {
    title: "Privacy Policy | BlinkSpot",
    description: "What BlinkSpot collects, why, who processes it, and the choices and rights you have.",
};

/**
 * Rewritten 2026-10-26 (Kezie: "go check all my legals"): the April template named Google Analytics
 * and targeted advertising (we use neither), listed none of the services that process data, said
 * we hold card numbers (Paystack does), and had no transfers, complaint right or real retention.
 * This one says what the app does. When a provider or a data use changes, change it here and bump
 * the version in lib/legal.ts.
 */
const PROVIDERS: Array<[string, string]> = [
    ["Supabase", "Database, sign-in and file storage"],
    ["Vercel", "Hosting the website and app, and server logs"],
    ["Cloudinary", "Storing and delivering pictures and videos"],
    ["Hostinger", "The server that runs our automation workflows (n8n)"],
    ["Anthropic", "Claude: writing, Ask BlinkSpot, planning and reading pictures"],
    ["OpenRouter", "A backup route to Claude when Anthropic is unavailable"],
    ["OpenAI", "Pictures, transcription (captions), voiceover and writing"],
    ["Kie.ai", "Picture and video models (Google Nano Banana, Kling, ByteDance Seedance, GPT Image)"],
    ["Replicate", "Upscaling and picture models (such as Ideogram, Flux and Qwen)"],
    ["PostForMe", "Connecting your social accounts and publishing your posts"],
    ["Paystack", "Payments (cards, bank and mobile money)"],
    ["PostHog", "Product analytics and session replays, only with your consent where the law requires it"],
    ["Google", "Sign in with Google, if you choose it"],
];

export default function PrivacyPage() {
    return (
        <LegalShell title="Privacy Policy" updated="Last updated October 26, 2026" current="/privacy">
            <div className="legal-body">
                <p>
                    This policy explains what personal information BlinkSpot collects, why, who helps us process it, and the choices and rights you have. BlinkSpot is run by <strong>{COMPANY.name}</strong> (&quot;we&quot;, &quot;us&quot;), a company registered in Kenya, at {COMPANY.address}. We are the data controller for the information described here. For anything in this policy, email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
                </p>
                <p>
                    It covers <a href="https://www.blinkspot.io">blinkspot.io</a>, the BlinkSpot app, websites you publish with it, and BlinkSpot&apos;s connections for AI apps (like Claude). When an agency or business uses BlinkSpot for its own clients, it decides what goes in; for that content we act on its behalf.
                </p>

                <h2>1. What we collect</h2>
                <ul>
                    <li><strong>Your account.</strong> Your name, email address and password (stored only as a secure hash), or, if you use Sign in with Google, the name, email address and profile picture Google shares. When you signed up and which version of our terms you agreed to.</li>
                    <li><strong>Your brands and content.</strong> What you add or make: brand details, logos, product photos, videos, voice recordings, prompts, captions, messages to Ask BlinkSpot, and the pictures, videos, carousels, motion graphics and websites you create. Contact details you put on a brand or website (like a WhatsApp number) are part of this.</li>
                    <li><strong>Connected social accounts.</strong> When you connect Instagram, TikTok, Facebook, LinkedIn, X, YouTube or another network, we receive the account&apos;s name and picture, keep what&apos;s needed to post for you, and the posts you schedule with their results.</li>
                    <li><strong>Payments.</strong> Paystack collects your card, bank or mobile money details on its own page. We never see or store your full card number. We receive a payment reference, the plan or credit pack, the amount, currency, date and whether it went through.</li>
                    <li><strong>Usage of credits and AI.</strong> Which AI features you used, what each cost in credits, and when.</li>
                    <li><strong>AI app connections.</strong> When you connect Claude or another AI app, or make an API key: its name, the brands and permissions you allowed, its monthly budget, and a log of what it did.</li>
                    <li><strong>Device and log data.</strong> Your IP address, browser and device type, the pages you request, and errors. Our hosting providers record this to keep BlinkSpot running and secure.</li>
                    <li><strong>Analytics.</strong> With your consent where the law requires it (the EU, EEA, UK and Switzerland), PostHog records which pages and features are used, and session replays with every typed field hidden. Elsewhere it&apos;s on by default and you can turn it off in <CookieSettingsLink className="cookie-link" />.</li>
                    <li><strong>Messages to us.</strong> What you send when you email us or ask for support.</li>
                </ul>
                <p>
                    You need an email address to have an account. Everything else is up to you, though some features need it (posting needs a connected account; buying a plan needs a payment). We don&apos;t ask for sensitive information (like health, religion or political views), and we don&apos;t buy data about you from others.
                </p>

                <h2>2. Why we use it, and our legal bases</h2>
                <div className="overflow-x-auto">
                    <table>
                        <thead><tr><th>What we do</th><th>Legal basis (GDPR, UK GDPR, Kenya DPA)</th></tr></thead>
                        <tbody>
                            <tr><td>Run your account, make what you ask for with AI, store it, and publish and schedule your posts</td><td>Performing our contract with you</td></tr>
                            <tr><td>Take payments, keep billing records and meet tax and accounting rules</td><td>Contract; legal obligation</td></tr>
                            <tr><td>Send service messages (sign-in links, receipts, important changes)</td><td>Contract</td></tr>
                            <tr><td>Keep BlinkSpot secure, prevent fraud and abuse, enforce limits and our terms</td><td>Legitimate interests (a safe, working service)</td></tr>
                            <tr><td>Understand which features help and fix what doesn&apos;t (PostHog)</td><td>Consent in the EU, EEA, UK and Switzerland; legitimate interests elsewhere, and you can say no</td></tr>
                            <tr><td>Send news and offers</td><td>Consent, only if you opted in; unsubscribe any time</td></tr>
                            <tr><td>Answer legal requests and protect our rights</td><td>Legal obligation; legitimate interests</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>We don&apos;t sell your personal information, and we don&apos;t use it for targeted advertising.</p>

                <h2>3. AI and your content</h2>
                <ul>
                    <li>To make what you ask for, we send the prompt and the material it needs (like your brand details, product photos or footage) to the AI provider for that feature (listed below). We send only what the task needs.</li>
                    <li>We don&apos;t use your content to train AI models, and we don&apos;t let it be used for advertising. Anthropic and OpenAI state that they don&apos;t train their models on data sent through their business APIs by default; each provider processes data under its own terms.</li>
                    <li>AI can be wrong. Review what it makes before you post it.</li>
                    <li>We don&apos;t make decisions about you by automated means that have legal or similarly significant effects. Automated checks (like rate limits or blocking abuse) only limit use of the service.</li>
                    <li>If your content shows other people, you need their permission to use it.</li>
                </ul>

                <h2>4. Who we share it with</h2>
                <p>Service providers that process data for us, under contract, only to run BlinkSpot:</p>
                <div className="overflow-x-auto">
                    <table>
                        <thead><tr><th>Provider</th><th>What for</th></tr></thead>
                        <tbody>{PROVIDERS.map(([name, what]) => <tr key={name}><td>{name}</td><td>{what}</td></tr>)}</tbody>
                    </table>
                </div>
                <p>We also share information:</p>
                <ul>
                    <li><strong>Where you send it:</strong> the social networks you publish to, the AI apps you connect (they get only what you allowed), and the people you share a brand with.</li>
                    <li><strong>When the law requires it,</strong> or to protect people, our users or BlinkSpot from harm or fraud.</li>
                    <li><strong>If our business is sold or merged,</strong> with the buyer, who must keep protecting it under this policy.</li>
                </ul>
                <p>Google Fonts on BlinkSpot and on websites you publish are fetched by our own server, so your browser doesn&apos;t contact Google for them.</p>

                <h2>5. International transfers</h2>
                <p>
                    We are based in Kenya and our providers process data in the United States and other countries. Where the law requires it, transfers are protected by safeguards such as the European Commission&apos;s Standard Contractual Clauses (and the UK addendum) in our providers&apos; data processing terms, or the provider&apos;s certification under the EU-US Data Privacy Framework, and as the Kenya Data Protection Act requires.
                </p>

                <h2>6. How long we keep it</h2>
                <ul>
                    <li><strong>Account and content:</strong> while your account is open. When you delete something, it leaves the app straight away; stored copies are removed when you close your account. When you close your account, we delete your account and content within 30 days; backups roll off within 90 days.</li>
                    <li><strong>Payment and billing records:</strong> as long as tax and accounting law requires (up to 7 years).</li>
                    <li><strong>Logs and security records:</strong> for short periods, unless needed to investigate abuse.</li>
                    <li><strong>Analytics:</strong> only as long as we need it to understand how BlinkSpot is used. We delete yours when you ask.</li>
                    <li><strong>Your cookie choice:</strong> 12 months, then we ask again.</li>
                </ul>

                <h2>7. Your rights and choices</h2>
                <p>Depending on where you live (including under the GDPR, UK GDPR, the Kenya Data Protection Act 2019 and US state laws), you can:</p>
                <ul>
                    <li>get a copy of your personal information, and have it in a portable format;</li>
                    <li>correct it, or have it deleted;</li>
                    <li>object to, or ask us to restrict, how we use it;</li>
                    <li>withdraw consent any time (for analytics, use <CookieSettingsLink className="cookie-link" />), without affecting what happened before;</li>
                    <li>not be treated differently for using these rights.</li>
                </ul>
                <p>
                    Much of this you can do in the app: edit your profile and brands, delete content from your Library, disconnect social accounts, revoke AI connections in Settings &gt; AI connections, cancel your plan in Billing, and delete your account and everything in it in Settings &gt; Delete my account. For anything else, email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> from your account&apos;s email address. We reply within one month.
                </p>
                <p>
                    You can also complain to a data protection authority: in Kenya, the Office of the Data Protection Commissioner (<a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">odpc.go.ke</a>); in the EU or EEA, the authority where you live or work; in the UK, the ICO (<a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>). We&apos;d like the chance to fix it first, so please write to us.
                </p>
                <p>
                    <strong>US residents:</strong> we don&apos;t sell personal information or share it for cross-context behavioural advertising. You can ask to know, correct or delete what we hold, and an authorised agent can ask for you.
                </p>

                <h2>8. Cookies</h2>
                <p>
                    We use essential cookies to keep you signed in and secure, and analytics cookies only as described above. No advertising cookies. Details in our <Link href="/cookies">Cookie Policy</Link>; change your choice in <CookieSettingsLink className="cookie-link" />.
                </p>

                <h2>9. Google user data</h2>
                <p>
                    With Sign in with Google, we receive only your name, email address and profile picture, and use them only to create and sign you in to your account. Our use of information received from Google APIs follows the Google API Services User Data Policy, including the Limited Use requirements.
                </p>

                <h2>10. Children</h2>
                <p>BlinkSpot is for people 18 and over. We don&apos;t knowingly collect information from children. If you think a child has given us information, email us and we&apos;ll delete it.</p>

                <h2>11. Security</h2>
                <p>
                    We use encryption in transit, access controls that keep each account&apos;s data to itself, and providers with strong security programmes; payment details stay with Paystack. No system is perfectly secure. If a breach puts your information at risk, we&apos;ll tell you and the authorities as the law requires.
                </p>

                <h2>12. Changes</h2>
                <p>We&apos;ll update the date at the top when this policy changes. For important changes we&apos;ll tell you by email or in the app before they apply.</p>
            </div>
            <LegalContact intro="Questions about your data, or want to use your rights? Write to us." />
        </LegalShell>
    );
}
