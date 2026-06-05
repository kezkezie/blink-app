import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
    title: "Contact | Blinkspot",
    description: "Get in touch with the Blinkspot team for support, billing questions, or general enquiries.",
};

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-[#191D23] text-[#DEDCDC] flex flex-col">
            <div className="flex-1 max-w-2xl mx-auto px-6 py-16 sm:py-24 w-full">

                {/* Back link */}
                <Link href="/" className="text-sm text-[#989DAA] hover:text-[#C5BAC4] transition-colors mb-8 inline-block">
                    &larr; Back to Home
                </Link>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#C5BAC4] font-display mb-3">Contact Us</h1>
                <p className="text-sm text-[#57707A] font-medium mb-12">We&apos;re here to help</p>

                {/* Primary contact card */}
                <div className="bg-[#2A2F38] border border-[#57707A]/30 rounded-2xl p-8 mb-8">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-[#B3FF00]/10 border border-[#B3FF00]/20 flex items-center justify-center shrink-0 mt-0.5">
                            <svg className="w-5 h-5 text-[#B3FF00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-[#57707A] uppercase tracking-widest mb-1">Email</p>
                            <a
                                href="mailto:info@blinkspot.io"
                                className="text-lg font-semibold text-[#C5BAC4] hover:text-[#B3FF00] transition-colors"
                            >
                                info@blinkspot.io
                            </a>
                            <p className="text-sm text-[#989DAA] mt-2 leading-relaxed">
                                For support, billing questions, bug reports, and general enquiries.
                                We aim to respond within 24 hours on business days.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Topic guide */}
                <div className="space-y-3 mb-12">
                    {[
                        { topic: "Account & Billing", detail: "Plan upgrades, credit top-ups, invoices, cancellations" },
                        { topic: "Technical Support", detail: "Generation failures, publishing errors, feature issues" },
                        { topic: "Bug Reports", detail: "Include your account email, what you did, and what happened" },
                        { topic: "Partnerships & Press", detail: "Agency plans, media enquiries, integration requests" },
                    ].map(({ topic, detail }) => (
                        <div key={topic} className="flex gap-3 items-start bg-[#2A2F38]/50 border border-[#57707A]/20 rounded-xl px-5 py-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#B3FF00] mt-2 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-[#C5BAC4]">{topic}</p>
                                <p className="text-xs text-[#57707A] mt-0.5">{detail}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Already a user nudge */}
                <div className="border-t border-[#57707A]/20 pt-8">
                    <p className="text-sm text-[#57707A]">
                        Already a Blinkspot user?{" "}
                        <Link href="/login" className="text-[#C5BAC4] hover:text-[#B3FF00] transition-colors font-medium">
                            Sign in
                        </Link>{" "}
                        and use the in-app feedback button for the fastest response.
                    </p>
                </div>

            </div>
            <Footer />
        </div>
    );
}
