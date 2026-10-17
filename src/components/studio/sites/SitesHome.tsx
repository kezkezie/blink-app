"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CodeStudio } from "./CodeStudio";
import { SiteBuilder } from "./SiteBuilder";

/**
 * The Website tab: one website studio (2026-10-17, Kezie: "combine both of them"). Every page is
 * edited by Sections (no code) or as Code. The section builder it grew from (2026-10-11) is kept
 * as it was, a link away, for pages already published at blinkspot.io/s/.
 */
export function SitesHome() {
  const params = useSearchParams();
  if (params.get("mode") === "builder") {
    return (
      <div>
        <Link href="/studio/sites" className="s-btn ghost sm mb-3 w-fit"><ArrowLeft className="h-3.5 w-3.5" /> Back to the website studio</Link>
        <SiteBuilder />
      </div>
    );
  }
  return (
    <div>
      <CodeStudio initialBrief={params.get("brief") ?? undefined} initialLooks={params.get("looks") ?? undefined} autoStart={params.get("auto") === "1"} />
      <p className="max-w-[1180px] mx-auto pb-8 text-[12px]" style={{ color: "var(--s-mute)" }}>
        Have a page from the older one-page builder (blinkspot.io/s/…)? <Link href="/studio/sites?mode=builder" className="underline">Open it here</Link>.
      </p>
    </div>
  );
}
