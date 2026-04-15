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
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Cookie Policy</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">Last updated April 13, 2026</p>

                <div className="prose-legal text-sm leading-relaxed text-[#989DAA]">
                    {/* TERMLY EMBED START */}
                    <div
                        className="termly-embed-container"
                        dangerouslySetInnerHTML={{
                            __html: `
                                <div name="termly-embed" data-id="c75d6600-8cd4-4036-86f5-3b9497e57c0c"></div>
                                <script type="text/javascript">
                                    (function(d, s, id) {
                                        var js, tjs = d.getElementsByTagName(s)[0];
                                        if (d.getElementById(id)) return;
                                        js = d.createElement(s); js.id = id;
                                        js.src = "https://app.termly.io/embed-policy.min.js";
                                        tjs.parentNode.insertBefore(js, tjs);
                                    }(document, 'script', 'termly-jssdk'));
                                </script>
                            `
                        }}
                    />
                    {/* TERMLY EMBED END */}
                </div>

                {/* Backup Contact Info if the embed fails to load */}
                <div className="mt-12 p-6 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl">
                    <p className="text-[#DEDCDC] font-medium mb-2">Questions regarding our cookies?</p>
                    <p className="text-sm">
                        Email: <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>
                    </p>
                    <p className="text-sm mt-1">
                        Mail: Mubia Investment Limited, P.O. Box 621 - G.P.O, Nairobi, Kenya
                    </p>
                </div>
            </div>
            <Footer />
        </div>
    );
}