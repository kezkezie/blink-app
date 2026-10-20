"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TOUR_KEY, TOUR_STEPS } from "@/lib/guide";

/**
 * The first-visit tour (2026-10-20): on Create, once per person (this device, and their account so
 * another device doesn't ask again), a few stops that light up each place with one line on what it
 * does. It never blocks the page: the dimming lets clicks through, and Esc or Skip ends it. The
 * Guide opens it again (/studio?tour=1). Automated browsers don't get it unless asked (?tour=1).
 */
function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [measured, setRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    setStep(null);
    try { localStorage.setItem(TOUR_KEY, "done"); } catch { /* private window */ }
    void supabase.auth.updateUser({ data: { tour_done: true } }).then(() => {}, () => {});
  }, []);

  // Start: on Create, first time, or when asked.
  useEffect(() => {
    if (pathname !== "/studio") return;
    const asked = new URLSearchParams(window.location.search).get("tour") === "1";
    let done = false;
    try { done = localStorage.getItem(TOUR_KEY) === "done"; } catch { /* private window */ }
    if (!asked && (done || navigator.webdriver)) return;
    let alive = true;
    const t = setTimeout(async () => {
      if (!asked) {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        if (data.user?.user_metadata?.tour_done) { try { localStorage.setItem(TOUR_KEY, "done"); } catch { /* private */ } return; }
      }
      if (alive) setStep(0);
      if (asked) router.replace("/studio", { scroll: false });
    }, 900);
    return () => { alive = false; clearTimeout(t); };
  }, [pathname, router]);

  // Where the lit-up place is, kept in step with resizes and scrolling.
  const target = step !== null ? TOUR_STEPS[step]?.target : undefined;
  useLayoutEffect(() => {
    if (!target) return;
    const measure = () => { const el = visible(`[data-tour="${target}"]`); setRect(el ? el.getBoundingClientRect() : null); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [target]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setStep((s) => (s === null ? s : Math.min(TOUR_STEPS.length - 1, s + 1)));
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(0, s - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null) return null;
  const s = TOUR_STEPS[step];
  const rect = target ? measured : null;
  const last = step === TOUR_STEPS.length - 1;
  const pad = 6;
  // The card: beside the lit place on wide screens (right of the rail, or under the top bar), above the tab bar on phones.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const W = Math.min(340, vw - 32);
  let pos: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    if (rect.top > vh - 120) pos = { left: Math.max(16, Math.min(vw - W - 16, rect.left + rect.width / 2 - W / 2)), bottom: vh - rect.top + 14 };
    else if (rect.left < 120) pos = { left: rect.right + 16, top: Math.max(16, Math.min(vh - 260, rect.top - 12)) };
    else pos = { left: Math.max(16, Math.min(vw - W - 16, rect.right - W)), top: rect.bottom + 14 };
  }
  return (
    <div className="fixed inset-0 z-[80]" style={{ pointerEvents: "none" }}>
      {rect ? (
        <div aria-hidden className="absolute rounded-xl transition-all duration-300" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(6,7,9,0.62), 0 0 0 2px var(--s-accent)" }} />
      ) : (
        <div aria-hidden className="absolute inset-0" style={{ background: "rgba(6,7,9,0.62)" }} />
      )}
      <div role="dialog" aria-label={`Tour: ${s.title}`} className="absolute s-card p-4 grid gap-2.5" style={{ ...pos, width: W, pointerEvents: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.5)", borderColor: "color-mix(in oklab, var(--s-accent) 45%, var(--s-line-2))" }}>
        <div className="flex items-center gap-2">
          <span className="mono text-[11px]" style={{ color: "var(--s-mute)" }}>{step + 1} / {TOUR_STEPS.length}</span>
          <div className="flex-1" />
          <button className="s-btn ghost sm" onClick={finish} aria-label="Close the tour"><X className="h-3.5 w-3.5" /></button>
        </div>
        <b className="text-[16px]">{s.title}</b>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--s-soft)" }}>{s.body}</p>
        <div className="flex items-center gap-2 mt-1">
          {step === 0 ? <button className="s-btn ghost sm" onClick={finish}>Skip</button> : <button className="s-btn ghost sm" onClick={() => setStep(step - 1)}>Back</button>}
          <div className="flex-1" />
          {last ? (
            <>
              <button className="s-btn sm" onClick={() => { finish(); router.push("/studio/guide"); }}>Open the Guide</button>
              <button className="s-btn primary sm" onClick={() => { finish(); router.push("/studio/image?mode=remix"); }}>Try Inspo Remix</button>
            </>
          ) : (
            <button className="s-btn primary sm" onClick={() => setStep(step + 1)} autoFocus>{step === 0 ? "Show me" : "Next"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
