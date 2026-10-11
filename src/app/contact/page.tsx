import Link from "next/link";
import { Mail } from "lucide-react";
import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = {
  title: "Contact | BlinkSpot",
  description: "Get in touch with the BlinkSpot team for support, billing, partnerships and press.",
};

const TOPICS = [
  { topic: "Account & billing", detail: "Plan upgrades, credit top-ups, invoices, cancellations" },
  { topic: "Technical support", detail: "Generation failures, publishing errors, feature issues" },
  { topic: "Bug reports", detail: "Include your account email, what you did, and what happened" },
  { topic: "Partnerships & press", detail: "Agency plans, media enquiries, integration requests" },
];

export default function ContactPage() {
  return (
    <LegalShell title="Contact us" updated="We're here to help" current="/contact">
      <div className="h-panel p-7 md:p-8 flex gap-4 items-start">
        <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "color-mix(in oklab, var(--s-accent) 14%, transparent)" }}>
          <Mail className="h-5 w-5" style={{ color: "var(--s-accent)" }} />
        </span>
        <div>
          <p className="h-eyebrow" style={{ color: "var(--s-mute)" }}>Email</p>
          <a href="mailto:info@blinkspot.io" className="text-[22px] font-semibold tracking-tight mt-1 inline-block hover:underline">info@blinkspot.io</a>
          <p className="text-[15px] mt-2 leading-relaxed" style={{ color: "var(--s-soft)" }}>For support, billing questions, bug reports and general enquiries. We aim to reply within 24 hours on business days.</p>
        </div>
      </div>

      <div className="grid gap-px mt-6 rounded-2xl overflow-hidden" style={{ background: "var(--s-line)", border: "1px solid var(--s-line)" }}>
        {TOPICS.map(({ topic, detail }) => (
          <div key={topic} className="p-5" style={{ background: "var(--s-bg)" }}>
            <p className="text-[15px] font-semibold">{topic}</p>
            <p className="text-[14px] mt-1" style={{ color: "var(--s-mute)" }}>{detail}</p>
          </div>
        ))}
      </div>

      <p className="text-[14px] mt-10 pt-8" style={{ color: "var(--s-soft)", borderTop: "1px solid var(--s-line)" }}>
        Already using BlinkSpot? <Link href="/login" className="underline" style={{ color: "var(--s-text)" }}>Sign in</Link> and ask Ask BlinkSpot, or email us from the address on your account for the fastest help.
      </p>
    </LegalShell>
  );
}
