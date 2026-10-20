"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import Link from "next/link";
import { ArrowRight, Compass, Search } from "lucide-react";
import { GUIDE, WHERE_DO_I, searchGuide } from "@/lib/guide";
import { useAskStore } from "@/components/studio/ask-store";

/** The Guide (2026-10-20): every place and button, what it does, what you need and what it costs. */
export default function GuidePage() {
  const [q, setQ] = useState("");
  // What people look for in the Guide (the words aren't sent, only how many results).
  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(() => track("guide_searched", { length: q.trim().length, results: searchGuide(q).reduce((n, s) => n + s.items.length, 0) }), 1200);
    return () => clearTimeout(t);
  }, [q]);
  const sections = useMemo(() => searchGuide(q), [q]);
  const { ask } = useAskStore();
  const faq = q.trim() ? WHERE_DO_I.filter((f) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 1).every((w) => `${f.q} ${f.a}`.toLowerCase().includes(w))) : WHERE_DO_I;
  return (
    <div className="max-w-[1040px] mx-auto pt-2 md:pt-6 pb-16">
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Help</p>
      <h2 className="text-[26px] md:text-[32px] font-semibold leading-tight tracking-tight mb-2">Guide</h2>
      <p className="text-[14px] mb-5 max-w-[680px]" style={{ color: "var(--s-soft)" }}>
        Where everything is, what each part does, what you need to start it and what it costs. Prices are in credits and show on every button before you press it; manual editing is always free.
      </p>
      <div className="flex flex-wrap gap-2 mb-8">
        <label className="s-input flex items-center gap-2 flex-1 min-w-[240px]" style={{ height: 40 }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--s-mute)" }} />
          <input className="bg-transparent outline-none flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: remove an object, connect Instagram, website…" aria-label="Search the guide" />
        </label>
        <Link href="/studio?tour=1" className="s-btn"><Compass className="h-4 w-4" /> Take the tour again</Link>
        <button className="s-btn ai" onClick={() => ask(q.trim() ? `How do I ${q.trim()} in BlinkSpot?` : "")}>Ask BlinkSpot</button>
      </div>

      {faq.length > 0 && (
        <section className="mb-10">
          <h3 className="s-section-h">Where do I…?</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {faq.map((f) => (
              <Link key={f.q} href={f.href} className="s-card p-3.5 grid gap-1" style={{ textDecoration: "none" }}>
                <b className="text-[13.5px]">{f.q}</b>
                <span className="text-[13px]" style={{ color: "var(--s-soft)" }}>{f.a}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="mb-10 scroll-mt-24">
          <h3 className="s-section-h">{s.title}</h3>
          <p className="text-[13px] -mt-1 mb-3" style={{ color: "var(--s-mute)" }}>{s.line}</p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {s.items.map((i) => (
              <div key={i.title} className="s-card p-4 grid gap-2 content-start">
                <b className="text-[14px]">{i.title}</b>
                <span className="text-[13px] leading-snug" style={{ color: "var(--s-soft)" }}>{i.what}</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {i.need && <><span className="text-[11px]" style={{ color: "var(--s-mute)" }}>You need</span><span className="s-badge">{i.need}</span></>}
                  {i.cost && <span className="s-badge" style={{ color: i.cost.startsWith("Free") || i.cost.includes("free") ? "var(--s-accent)" : undefined }}>{i.cost}</span>}
                </div>
                <Link href={i.href} className="text-[13px] flex items-center gap-1 mt-1" style={{ color: "var(--s-accent)" }}>Open <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!sections.length && !faq.length && (
        <div className="s-empty"><h3>Nothing matches “{q}”</h3><p className="text-sm">Try other words, or ask BlinkSpot: it knows every part of the app.</p></div>
      )}
      <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>All {GUIDE.reduce((n, s) => n + s.items.length, 0)} parts listed. Something missing? Ask BlinkSpot or write to info@blinkspot.io.</p>
    </div>
  );
}
