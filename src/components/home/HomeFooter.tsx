import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";

/** The site footer, shared by the homepage, the legal pages and contact. */
export function HomeFooter() {
  return (
    <footer className="relative z-[2] py-12 h-divider">
      <div className="h-wrap grid gap-8 md:grid-cols-[1fr_auto] items-start">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-lime.png" alt="" className="h-7 w-7 object-contain" />
          <span className="text-[15px] font-semibold">BlinkSpot</span>
        </Link>
        <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13.5px] h-muted" aria-label="Footer">
          <Link href="/#features">Features</Link><Link href="/#pricing">Pricing</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><CookieSettingsLink /><Link href="/acceptable-use">Acceptable use</Link>
        </nav>
        <p className="text-[12.5px] h-muted">© 2026 Mubia Investment Limited (operating as BlinkSpot). All rights reserved.</p>
        <p className="text-[12.5px] h-muted">Questions? <a href="mailto:info@blinkspot.io" className="underline">info@blinkspot.io</a></p>
      </div>
    </footer>
  );
}
