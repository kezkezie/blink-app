"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ASK_TRIED_KEY, START_HIDDEN_KEY, START_STEPS, type StartStep } from "@/lib/guide";
import type { BrandProfile } from "@/app/store/useBrandStore";
import { track } from "@/lib/analytics";

/**
 * Getting started on Create (2026-10-20): five first steps that tick themselves off from what the
 * person has really done (a brand kit, a post, a connected account, something scheduled, a question
 * to Ask). Hidden for good once all five are done, or when they hide it.
 */
const noop = () => () => {};
const readHidden = () => { try { return localStorage.getItem(START_HIDDEN_KEY) === "1"; } catch { return false; } };

export function GettingStarted({ clientId, brand }: { clientId: string | null; brand: BrandProfile | null }) {
  const [done, setDone] = useState<Record<StartStep["id"], boolean> | null>(null);
  // Hidden until the browser says otherwise (the server can't read this device's choice).
  const storedHidden = useSyncExternalStore(noop, readHidden, () => true);
  const [hiddenNow, setHiddenNow] = useState(false);
  const hidden = storedHidden || hiddenNow;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!clientId || hidden) return;
    let alive = true;
    void (async () => {
      const [kit, posts, socials, scheduled] = await Promise.all([
        brand ? supabase.from("brand_profiles").select("logo_url, primary_color").eq("id", brand.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("content").select("id", { count: "exact", head: true }).eq("client_id", clientId),
        brand ? supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("is_active", true) : Promise.resolve({ count: 0 }),
        supabase.from("content_schedule").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      ]);
      let asked = false;
      try { asked = localStorage.getItem(ASK_TRIED_KEY) === "1"; } catch { /* private window */ }
      if (!alive) return;
      setDone({
        brand: !!(kit.data?.logo_url && kit.data?.primary_color),
        first: (posts.count ?? 0) > 0,
        socials: (socials.count ?? 0) > 0,
        schedule: (scheduled.count ?? 0) > 0,
        ask: asked,
      });
    })();
    return () => { alive = false; };
  }, [clientId, brand, hidden]);

  if (hidden || !done) return null;
  const count = START_STEPS.filter((s) => done[s.id]).length;
  if (count === START_STEPS.length) return null;
  const hide = () => { setHiddenNow(true); try { localStorage.setItem(START_HIDDEN_KEY, "1"); } catch { /* private window */ } };
  return (
    <section className="s-card mt-4 p-4 grid gap-3" aria-label="Getting started" style={{ borderColor: "color-mix(in oklab, var(--s-accent) 35%, var(--s-line))" }}>
      <div className="flex items-center gap-3">
        <b className="text-[14px]">Getting started</b>
        <span className="mono text-[12px]" style={{ color: "var(--s-mute)" }}>{count} of {START_STEPS.length}</span>
        <span className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[160px]" style={{ background: "var(--s-line)" }}>
          <span className="block h-full rounded-full" style={{ width: `${(count / START_STEPS.length) * 100}%`, background: "var(--s-accent)" }} />
        </span>
        <div className="flex-1" />
        <Link href="/studio/guide" className="s-btn ghost sm">Guide</Link>
        <button className="s-btn ghost sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Fold the list" : "Show the list"}>{open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
        <button className="s-btn ghost sm" onClick={hide}>Hide</button>
      </div>
      {open && (
        <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {START_STEPS.map((s) => (
            <li key={s.id}>
              <Link href={s.href} onClick={() => track("getting_started_clicked", { step: s.id, done: done[s.id] })} className="flex items-start gap-2 rounded-lg p-2.5 h-full" style={{ background: done[s.id] ? "transparent" : "var(--s-raised)", border: "1px solid var(--s-line)", opacity: done[s.id] ? 0.6 : 1 }} aria-label={`${s.title}${done[s.id] ? " (done)" : ""}`}>
                <span className="h-5 w-5 rounded-full grid place-items-center shrink-0 mt-0.5" style={{ background: done[s.id] ? "var(--s-accent)" : "transparent", border: done[s.id] ? "none" : "1.5px solid var(--s-line-2)", color: "var(--s-accent-ink)" }}>
                  {done[s.id] && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="grid gap-0.5 min-w-0">
                  <b className="text-[12.5px]" style={{ textDecoration: done[s.id] ? "line-through" : undefined }}>{s.title}</b>
                  <span className="text-[11.5px] leading-snug" style={{ color: "var(--s-mute)" }}>{s.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
