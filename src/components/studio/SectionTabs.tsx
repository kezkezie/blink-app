"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A quiet segmented control that switches between the pages of one place (Plan, Account). */
export function SectionTabs({ tabs, children }: { tabs: Array<{ href: string; label: string }>; children?: React.ReactNode }) {
  const pathname = usePathname();
  // The most specific tab wins, so /studio/plan/approvals does not also light up /studio/plan.
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <nav className="s-seg" aria-label="Section">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active?.href === t.href ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <div className="flex-1" />
      {children}
    </div>
  );
}
