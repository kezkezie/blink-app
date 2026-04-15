import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
    title: "Cookie Policy | Blinkspot",
    description: "Learn about how Blinkspot uses cookies and similar technologies.",
};

export default function CookiesPage() {
    return (
        <div className="min-h-screen bg-[#191D23] text-[#DEDCDC]">
            <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">

                {/* Back link */}
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Cookie Policy</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 13, 2026</p>

                <div className="prose-legal text-sm leading-relaxed text-[#989DAA] space-y-6">
                    <p>
                        This Cookie Policy explains how <strong>Mubia Investment Limited</strong> (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; and &quot;our&quot;) uses cookies and similar technologies to recognize you when you visit our website at <a href="https://www.blinkspot.io" className="text-[#C5BAC4] hover:underline">https://www.blinkspot.io</a> (&quot;Website&quot;). It explains what these technologies are and why we use them, as well as your rights to control our use of them.
                    </p>
                    <p>
                        In some cases we may use cookies to collect personal information, or that becomes personal information if we combine it with other information.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">What are cookies?</h2>
                    <p>
                        Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners in order to make their websites work, or to work more efficiently, as well as to provide reporting information.
                    </p>
                    <p>
                        Cookies set by the website owner (in this case, <strong>Mubia Investment Limited</strong>) are called &quot;first-party cookies.&quot; Cookies set by parties other than the website owner are called &quot;third-party cookies.&quot; Third-party cookies enable third-party features or functionality to be provided on or through the website (e.g., advertising, interactive content, and analytics). The parties that set these third-party cookies can recognize your computer both when it visits the website in question and also when it visits certain other websites.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">Why do we use cookies?</h2>
                    <p>
                        We use first- and third-party cookies for several reasons. Some cookies are required for technical reasons in order for our Website to operate, and we refer to these as &quot;essential&quot; or &quot;strictly necessary&quot; cookies. Other cookies also enable us to track and target the interests of our users to enhance the experience on our Online Properties. Third parties serve cookies through our Website for advertising, analytics, and other purposes. This is described in more detail below.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">How can I control cookies?</h2>
                    <p>
                        You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in the Cookie Preference Center. The Cookie Preference Center allows you to select which categories of cookies you accept or reject. Essential cookies cannot be rejected as they are strictly necessary to provide you with services.
                    </p>
                    <p>
                        The Cookie Preference Center can be found in the notification banner and on our Website. If you choose to reject cookies, you may still use our Website though your access to some functionality and areas of our Website may be restricted. You may also set or amend your web browser controls to accept or refuse cookies.
                    </p>
                    <p>
                        The specific types of first- and third-party cookies served through our Website and the purposes they perform are described in the table below (please note that the specific cookies served may vary depending on the specific Online Properties you visit):
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">How can I control cookies on my browser?</h2>
                    <p>
                        As the means by which you can refuse cookies through your web browser controls vary from browser to browser, you should visit your browser&apos;s help menu for more information. The following is information about how to manage cookies on the most popular browsers:
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Chrome</li>
                        <li>Internet Explorer</li>
                        <li>Firefox</li>
                        <li>Safari</li>
                        <li>Edge</li>
                        <li>Opera</li>
                    </ul>
                    <p className="mt-4">
                        In addition, most advertising networks offer you a way to opt out of targeted advertising. If you would like to find out more information, please visit:
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mt-2">
                        <li>Digital Advertising Alliance</li>
                        <li>Digital Advertising Alliance of Canada</li>
                        <li>European Interactive Digital Advertising Alliance</li>
                    </ul>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">What about other tracking technologies, like web beacons?</h2>
                    <p>
                        Cookies are not the only way to recognize or track visitors to a website. We may use other, similar technologies from time to time, like web beacons (sometimes called &quot;tracking pixels&quot; or &quot;clear gifs&quot;). These are tiny graphics files that contain a unique identifier that enables us to recognize when someone has visited our Website or opened an email including them. This allows us, for example, to monitor the traffic patterns of users from one page within a website to another, to deliver or communicate with cookies, to understand whether you have come to the website from an online advertisement displayed on a third-party website, to improve site performance, and to measure the success of email marketing campaigns. In many instances, these technologies are reliant on cookies to function properly, and so declining cookies will impair their functioning.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">Do you use Flash cookies or Local Shared Objects?</h2>
                    <p>
                        Websites may also use so-called &quot;Flash Cookies&quot; (also known as Local Shared Objects or &quot;LSOs&quot;) to, among other things, collect and store information about your use of our services, fraud prevention, and for other site operations.
                    </p>
                    <p>
                        If you do not want Flash Cookies stored on your computer, you can adjust the settings of your Flash player to block Flash Cookies storage using the tools contained in the Website Storage Settings Panel. You can also control Flash Cookies by going to the Global Storage Settings Panel and following the instructions (which may include instructions that explain, for example, how to delete existing Flash Cookies (referred to &quot;information&quot; on the Macromedia site), how to prevent Flash LSOs from being placed on your computer without your being asked, and (for Flash Player 8 and later) how to block Flash Cookies that are not being delivered by the operator of the page you are on at the time).
                    </p>
                    <p>
                        Please note that setting the Flash Player to restrict or limit acceptance of Flash Cookies may reduce or impede the functionality of some Flash applications, including, potentially, Flash applications used in connection with our services or online content.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">Do you serve targeted advertising?</h2>
                    <p>
                        Third parties may serve cookies on your computer or mobile device to serve advertising through our Website. These companies may use information about your visits to this and other websites in order to provide relevant advertisements about goods and services that you may be interested in. They may also employ technology that is used to measure the effectiveness of advertisements. They can accomplish this by using cookies or web beacons to collect information about your visits to this and other sites in order to provide relevant advertisements about goods and services of potential interest to you. The information collected through this process does not enable us or them to identify your name, contact details, or other details that directly identify you unless you choose to provide these.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">How often will you update this Cookie Policy?</h2>
                    <p>
                        We may update this Cookie Policy from time to time in order to reflect, for example, changes to the cookies we use or for other operational, legal, or regulatory reasons. Please therefore revisit this Cookie Policy regularly to stay informed about our use of cookies and related technologies.
                    </p>
                    <p>
                        The date at the top of this Cookie Policy indicates when it was last updated.
                    </p>

                    <h2 className="text-xl font-bold text-[#C5BAC4] mt-10 mb-4">Where can I get further information?</h2>
                    <p>
                        If you have any questions about our use of cookies or other technologies, please email us at <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a> or by post to:
                    </p>
                </div>

                {/* Corporate Shield Contact Block */}
                <div className="mt-8 p-6 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl">
                    <p className="text-[#DEDCDC] font-medium mb-2">Mubia Investment Limited</p>
                    <p className="text-sm text-[#989DAA]">
                        45 Kenyatta Ave, Posta House, GPO<br />
                        Nairobi, Nairobi County 00100<br />
                        Kenya
                    </p>
                    <p className="text-sm mt-4">
                        Email: <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>
                    </p>
                </div>

            </div>
            <Footer />
        </div>
    );
}