"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Code2, LayoutTemplate } from "lucide-react";
import { CodeStudio } from "./CodeStudio";
import { SiteBuilder } from "./SiteBuilder";

/**
 * The Website tab: the website studio (AI-written pages with their code, 2026-10-16) and the
 * section builder it grew from (2026-10-11), kept as it was. ?mode=builder opens the builder.
 */
export function SitesHome() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode") === "builder" ? "builder" : "studio";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="s-seg" role="tablist" aria-label="Website mode">
          <button role="tab" aria-selected={mode === "studio"} onClick={() => router.replace("/studio/sites", { scroll: false })}><Code2 className="h-3.5 w-3.5" /> Website studio</button>
          <button role="tab" aria-selected={mode === "builder"} onClick={() => router.replace("/studio/sites?mode=builder", { scroll: false })}><LayoutTemplate className="h-3.5 w-3.5" /> Section builder</button>
        </div>
        <span className="text-xs hidden sm:inline" style={{ color: "var(--s-mute)" }}>{mode === "studio" ? "Pages written as code: edit it, download it, publish it" : "A landing page from sections you fill in, at blinkspot.io/s/"}</span>
      </div>
      {mode === "studio" ? <CodeStudio /> : <SiteBuilder />}
    </div>
  );
}
