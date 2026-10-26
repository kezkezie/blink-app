import "@/app/studio/studio.css";
import "@/components/home/home.css";
import "./legal.css";
import Link from "next/link";
import { HomeNav } from "@/components/home/HomeBits";
import { HomeFooter } from "@/components/home/HomeFooter";

const PAGES = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/contact", label: "Contact" },
];

/** Who runs BlinkSpot, the same on every legal page. */
export const COMPANY = {
  name: "Mubia Investment Limited",
  address: "P.O. Box 621 - G.P.O, Nairobi 00100, Kenya",
  email: "info@blinkspot.io",
} as const;

/** The contact block at the end of each legal page. */
export function LegalContact({ intro }: { intro?: string }) {
  return (
    <div className="mt-12 p-6 rounded-xl" style={{ background: "var(--s-panel)", border: "1px solid var(--s-line)" }}>
      <p className="font-medium mb-2" style={{ color: "var(--s-text)" }}>Contact us</p>
      {intro && <p className="text-sm mb-4" style={{ color: "var(--s-mute)" }}>{intro}</p>}
      <p className="text-sm" style={{ color: "var(--s-soft)" }}>{COMPANY.name} (trading as BlinkSpot)<br />{COMPANY.address}</p>
      <p className="text-sm mt-3">Email: <a href={`mailto:${COMPANY.email}`} className="underline" style={{ color: "var(--s-accent)" }}>{COMPANY.email}</a></p>
    </div>
  );
}

/** Privacy, terms, cookies, acceptable use and contact, in the homepage's look. */
export function LegalShell({ title, updated, current, children }: { title: string; updated?: string; current: string; children: React.ReactNode }) {
  return (
    <div className="studio home min-h-dvh">
      <div className="h-grain" aria-hidden />
      <HomeNav />
      <main className="relative z-[2] pt-28 md:pt-36 pb-24">
        <div className="h-wrap grid gap-12 lg:grid-cols-[220px_minmax(0,720px)]">
          <aside className="lg:sticky lg:top-28 self-start">
            <p className="h-eyebrow">Legal</p>
            <nav className="grid gap-1 mt-4" aria-label="Legal pages">
              {PAGES.map((p) => (
                <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}
                  className="px-3 py-2 rounded-lg text-[14px] transition-colors hover:bg-[var(--s-raised)]"
                  style={p.href === current ? { background: "var(--s-raised)", color: "var(--s-text)" } : { color: "var(--s-mute)" }}>
                  {p.label}
                </Link>
              ))}
            </nav>
          </aside>
          <article className="min-w-0">
            <h1 className="h-h2">{title}</h1>
            {updated && <p className="text-[13px] h-muted mt-3 font-mono">{updated}</p>}
            <div className="mt-10">{children}</div>
          </article>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
