import Link from "next/link";
import { COMPANY, LegalContact, LegalShell } from "@/components/legal/LegalShell";

export const metadata = {
    title: "Terms of Service | BlinkSpot",
    description: "The terms for using BlinkSpot: accounts, credits and plans, your content, AI, and our responsibilities.",
};

/**
 * Rewritten 2026-10-26 (Kezie: "go check all my legals"): the April template took a perpetual right
 * to sell users' content (while another section said they own it), banned automated use (which the
 * API and "Connect Claude" are), allowed 13-year-olds (the privacy policy said 18), said nothing about
 * credits, Stop or the free-plan stamp, and had no consumer-law carve-outs. Bump lib/legal.ts with it.
 */
export default function TermsPage() {
    return (
        <LegalShell title="Terms of Service" updated="Last updated October 26, 2026" current="/terms">
            <div className="legal-body">
                <p>
                    These terms are an agreement between you and <strong>{COMPANY.name}</strong>, trading as BlinkSpot (&quot;we&quot;, &quot;us&quot;), a company registered in Kenya at {COMPANY.address}. They cover <a href="https://www.blinkspot.io">blinkspot.io</a>, the BlinkSpot app, websites you publish with it, and BlinkSpot&apos;s API and AI-app connections (together, the &quot;Services&quot;). By creating an account or using the Services you agree to them, to our <Link href="/acceptable-use">Acceptable Use Policy</Link>, and to how we handle data in our <Link href="/privacy">Privacy Policy</Link>. If you use BlinkSpot for a business, you agree for that business.
                </p>

                <h2>1. What BlinkSpot is</h2>
                <p>
                    BlinkSpot helps you create, edit, plan and publish social media content for your brands: AI pictures, videos, carousels, motion graphics, captions, voiceovers and websites, editors for images and video, and scheduling and posting to your connected social accounts.
                </p>

                <h2>2. Your account</h2>
                <ul>
                    <li>You must be 18 or over, and able to enter a contract where you live.</li>
                    <li>Give accurate details, keep your password safe, and tell us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> if you think someone else got in. You&apos;re responsible for what happens in your account, including by people you share a brand with and AI apps or API keys you connect.</li>
                    <li>One person or business per account; don&apos;t make extra accounts to get more free credits or get around limits.</li>
                </ul>

                <h2>3. Plans, credits and payments</h2>
                <ul>
                    <li><strong>Plans.</strong> Free, Starter, Pro and Agency, billed weekly or monthly, with the brands, credits and features shown on our pricing page when you buy. Paid plans renew automatically and add their credits each time a payment goes through, until you cancel.</li>
                    <li><strong>Credits.</strong> AI features use credits, at the price shown before you start. Credits have no cash value, can&apos;t be transferred or exchanged for money, and end when your account closes. Free accounts get sign-up credits once; credit packs are available on paid plans.</li>
                    <li><strong>When AI fails or you stop it.</strong> If an AI job fails, its credits come back. If you press Stop, the part the AI service hasn&apos;t already charged us for comes back; the part it already charged stays used. The app shows what came back.</li>
                    <li><strong>Payment.</strong> Paystack handles payments on its own secure page (cards, bank or mobile money, depending on your country). Prices are in US dollars; Paystack may charge the equivalent in your local currency, and your bank may add fees.</li>
                    <li><strong>Cancelling.</strong> Cancel any time in Billing &gt; Manage subscription. You keep your plan until the end of the period you paid for, then move to Free. Credits already in your account stay usable while the account is open.</li>
                    <li><strong>Price changes.</strong> We&apos;ll tell you before a new price applies to your plan. It applies from your next renewal; if you don&apos;t want it, cancel before then.</li>
                    <li><strong>Refunds.</strong> Payments aren&apos;t refundable, except as set out in these terms or where the law gives you a right to one. If we make a billing mistake, we fix it.</li>
                </ul>
                <p>
                    <strong>If you&apos;re a consumer in the EU, EEA or UK:</strong> you can withdraw from a purchase within 14 days of buying it by emailing us. Because BlinkSpot starts at once when you buy (your plan and credits are ready straight away, at your request), if you withdraw we refund the part you haven&apos;t used, and the part you used is not refunded.
                </p>

                <h2>4. Your content</h2>
                <ul>
                    <li><strong>You own it.</strong> What you upload (logos, photos, footage, text) and what you make with BlinkSpot is yours, as far as the law allows. We claim no ownership.</li>
                    <li><strong>What you let us do with it.</strong> You give us a worldwide, royalty-free licence to host, store, copy, process, change the format of and display your content, and to send it to our service providers and to the places you publish it, only to run and improve the Services for you. It ends when you delete the content or close your account, except for copies we must keep by law or that are in backups until they roll off.</li>
                    <li><strong>Your responsibility.</strong> You need the rights to what you upload, including permission from people who appear in it, and you&apos;re responsible for what you publish. Don&apos;t upload or make anything the Acceptable Use Policy forbids.</li>
                    <li><strong>Feedback.</strong> If you send ideas or suggestions, we may use them freely, without owing you anything.</li>
                    <li>We may remove content or limit features where content breaks these terms or the law, or a valid complaint is made.</li>
                </ul>

                <h2>5. AI-generated content</h2>
                <ul>
                    <li>AI can be wrong, make things that look like existing work, or make something unsuitable. Review everything before you use or post it; you decide what gets published.</li>
                    <li>Results aren&apos;t guaranteed to be unique; someone else may get something similar.</li>
                    <li>AI features run on third-party models (listed in our Privacy Policy). Don&apos;t use them in ways those providers forbid.</li>
                    <li>Where a platform or the law requires it (for example, realistic AI images or video of real people or events), label AI-made content as AI-made.</li>
                </ul>

                <h2>6. Free plan stamp</h2>
                <p>
                    On the Free plan, pictures and videos you make carry a small &quot;Made with BlinkSpot&quot; mark, and websites you publish carry a small BlinkSpot badge. Work made on a paid plan has no mark, and the website badge goes away when you upgrade.
                </p>

                <h2>7. Social accounts and posting</h2>
                <ul>
                    <li>When you connect a social account, you confirm you&apos;re allowed to, and you let BlinkSpot post the content you schedule or approve to it. Each network&apos;s own terms apply to what you post there.</li>
                    <li>We work hard to post on time, but networks change, go down or reject posts. We can&apos;t guarantee a post goes out at the exact time or at all, and we&apos;re not responsible for what a network does (like removing a post, limiting reach or suspending an account).</li>
                    <li>Check scheduled posts before they go out. You can disconnect an account any time.</li>
                </ul>

                <h2>8. AI apps, API keys and websites</h2>
                <ul>
                    <li>You can connect Claude or another AI app to BlinkSpot, or make an API key. It can act only on the brands and with the permissions you allowed, and spends your credits up to the budget you set. What it does counts as done by you. You can revoke it any time in Settings &gt; AI connections.</li>
                    <li>Don&apos;t share keys, and don&apos;t use them to go around limits or overload the Services. We may limit or revoke keys that are misused.</li>
                    <li>Websites you publish with BlinkSpot are public at their link. Keep what&apos;s on them lawful and accurate; you&apos;re responsible for them as the site&apos;s owner.</li>
                </ul>

                <h2>9. Sharing brands</h2>
                <p>
                    You can invite people to work on a brand, within your plan&apos;s seats. They can see and change the brand&apos;s content and may spend credits as the brand allows. Remove them any time.
                </p>

                <h2>10. Our Services and intellectual property</h2>
                <ul>
                    <li>BlinkSpot itself (the software, design, templates we provide, and our name and logo) belongs to us or our licensors. We give you a personal, non-transferable right to use it under these terms. Don&apos;t copy, resell or reverse engineer the Services except where the law allows it.</li>
                    <li>We keep improving BlinkSpot, so features may change. If we remove something important from a paid plan, we&apos;ll tell you in advance.</li>
                    <li>We aim to keep BlinkSpot available, but it may sometimes be down for maintenance or because of a provider we rely on.</li>
                </ul>

                <h2>11. Copyright complaints</h2>
                <p>
                    If you think something on BlinkSpot infringes your copyright, email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> with what it is, where it is, your contact details, and a statement that you own the rights or act for the owner. We&apos;ll look at it promptly and remove it if appropriate. We close accounts that infringe repeatedly.
                </p>

                <h2>12. Ending your account</h2>
                <ul>
                    <li>You can stop using BlinkSpot and ask us to close your account any time.</li>
                    <li>We may suspend or close an account that breaks these terms, the Acceptable Use Policy or the law, that puts other users or BlinkSpot at risk, or when the law requires it. Where we can, we tell you why and give you a chance to fix it.</li>
                    <li>If we close a paid account for no such reason, we tell you in advance and refund the unused part of what you paid.</li>
                    <li>When an account closes, its content is deleted as our Privacy Policy describes. Download what you want to keep first.</li>
                </ul>

                <h2>13. Disclaimers</h2>
                <p>
                    Apart from what these terms promise, the Services are provided &quot;as is&quot; and &quot;as available&quot;. To the extent the law allows, we don&apos;t give other warranties, for example that the Services will meet a particular need, be uninterrupted or error-free, or that AI output will be accurate.
                </p>

                <h2>14. Our liability</h2>
                <ul>
                    <li>To the extent the law allows, we&apos;re not liable for indirect or consequential losses (such as lost profits, revenue, data or business opportunities), or for what third-party platforms and providers do.</li>
                    <li>To the extent the law allows, our total liability to you for all claims is limited to the greater of what you paid us in the 6 months before the claim and US$100.</li>
                    <li>Nothing in these terms limits liability that can&apos;t legally be limited, such as for death or personal injury caused by negligence, for fraud, or your rights as a consumer under the law where you live.</li>
                </ul>

                <h2>15. Indemnity</h2>
                <p>
                    If you use BlinkSpot for a business, you&apos;ll cover our reasonable costs (including legal fees) from third-party claims caused by your content, how you used the Services, or your breaking these terms or the law.
                </p>

                <h2>16. Law and disputes</h2>
                <ul>
                    <li>Kenyan law governs these terms. Please contact us first; most things can be fixed quickly.</li>
                    <li>If we can&apos;t resolve it, a business customer&apos;s dispute will be decided by arbitration seated in Nairobi, in English.</li>
                    <li>If you&apos;re a consumer, you keep the protection of the mandatory laws of the country where you live, and you can bring a claim in your local courts.</li>
                </ul>

                <h2>17. Changes to these terms</h2>
                <p>
                    We may update these terms as BlinkSpot changes. We&apos;ll update the date at the top and, for important changes, tell you by email or in the app at least 14 days before they apply. If you don&apos;t agree, you can cancel before then; continuing to use BlinkSpot after that means you accept them.
                </p>

                <h2>18. General</h2>
                <p>
                    If part of these terms can&apos;t be enforced, the rest still applies. If we don&apos;t enforce something straight away, we can still do it later. You can&apos;t transfer these terms without our OK; we may transfer them to a company that takes over BlinkSpot, and your rights stay the same. These terms, with the policies they mention, are the whole agreement between us about the Services.
                </p>
            </div>
            <LegalContact intro="Questions about these terms, or a complaint? Write to us." />
        </LegalShell>
    );
}
