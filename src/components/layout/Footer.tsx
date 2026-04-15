"use client";

import Link from "next/link";

export function Footer() {
    return (
        <footer className="w-full border-t border-[#57707A]/20 bg-[#191D23]">
            <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-[#57707A] font-medium tracking-wide">
                    &copy; {new Date().getFullYear()} Blinkspot. All rights reserved.
                </p>

                <nav className="flex items-center gap-6">
                    <Link
                        href="/terms"
                        className="text-xs text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-medium"
                    >
                        Terms &amp; Conditions
                    </Link>
                    <Link
                        href="/privacy"
                        className="text-xs text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-medium"
                    >
                        Privacy Policy
                    </Link>
                    <Link
                        href="/cookies"
                        className="text-xs text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-medium"
                    >
                        Cookie Policy
                    </Link>
                    <Link
                        href="/acceptable-use"
                        className="text-xs text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-medium"
                    >
                        Acceptable Use
                    </Link>
                    <a
                        href="mailto:info@blinkspot.io"
                        className="text-xs text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-medium"
                    >
                        Contact
                    </a>
                </nav>
            </div>
        </footer>
    );
}
