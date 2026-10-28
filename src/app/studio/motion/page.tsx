"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import "@/components/layout/video-editor.css";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { MotionBin } from "@/components/studio/motion/MotionBin";
import { MOTION_INSPO_HANDOFF_KEY, type MotionShape, type MotionSpec } from "@/lib/motion/spec";
import { LOOKS, lookById } from "@/lib/motion/looks";
import { useBrandKit } from "@/components/studio/generate-image";
import type { GalleryBrand } from "@/components/studio/motion/MotionGallery";

// The gallery's previews (Remotion) load in the browser only, after the page.
const LooksFan = dynamic(() => import("@/components/studio/motion/MotionGallery").then((m) => m.LooksFan), { ssr: false, loading: () => <div className="s-skel" style={{ height: 440 }} /> });
const WhatItMakes = dynamic(() => import("@/components/studio/motion/MotionGallery").then((m) => m.WhatItMakes), { ssr: false, loading: () => <div className="s-skel" style={{ height: 620 }} /> });
const ExampleGrid = dynamic(() => import("@/components/studio/motion/MotionGallery").then((m) => m.ExampleGrid), { ssr: false, loading: () => <div className="s-skel" style={{ height: 520 }} /> });
const LOOK_COUNT = LOOKS.length + 1;

/**
 * Motion graphics on their own (Kezie, 2026-10-20: "it needs its own place within Create"): the
 * same planner and templates as the video editor's Motion panel, with the shape picked here, and
 * the result saved to the Library to download or put in the video editor.
 */
const SHAPES: Array<{ id: MotionShape; label: string; line: string }> = [
  { id: "9:16", label: "9:16", line: "Reels, TikTok, Stories" },
  { id: "1:1", label: "1:1", line: "Feed posts" },
  { id: "16:9", label: "16:9", line: "YouTube, websites" },
];

/** Ask BlinkSpot can open this with a brief, screenshots and a shape (a walkthrough from a chat); the Library with a picture. */
function fromLink(params: URLSearchParams) {
  const brief = params.get("brief")?.slice(0, 600) || null;
  let screens: string[] = [];
  try { const s = JSON.parse(params.get("screens") ?? "[]"); if (Array.isArray(s)) screens = s.filter((u): u is string => typeof u === "string" && /^https:\/\/[^/]+\/storage\/v1\/object\/public\/assets\/images\//.test(u)).slice(0, 6); } catch { /* none */ }
  const shape = (["9:16", "1:1", "16:9"] as const).find((s) => s === params.get("shape")) ?? "9:16";
  const p = params.get("picture");
  const picture = p && /^[0-9a-f-]{36}$/i.test(p) ? p : null;
  return { brief, screens, shape, picture };
}

/** A plan handed over by Video Inspo (2026-10-21), used once and only while fresh. Read after mount (the server can't see it). */
type Handoff = { spec: MotionSpec; pictures: Array<{ url: string; title: string }>; concept?: string };
function takeHandoff(params: URLSearchParams): Handoff | null {
  if (params.get("from") !== "inspo" || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MOTION_INSPO_HANDOFF_KEY);
    const h = raw ? JSON.parse(raw) as Handoff & { at?: number } : null;
    return h?.spec && Array.isArray(h.spec.scenes) && Date.now() - (h.at ?? 0) < 30 * 60_000 ? { spec: h.spec, pictures: Array.isArray(h.pictures) ? h.pictures : [], concept: h.concept } : null;
  } catch { return null; }
}

function MotionPage() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const params = useSearchParams();
  const [link] = useState(() => fromLink(new URLSearchParams(params.toString())));
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [shape, setShape] = useState<MotionShape>(link.shape);
  useEffect(() => {
    const h = takeHandoff(new URLSearchParams(window.location.search));
    if (!h) return;
    try { sessionStorage.removeItem(MOTION_INSPO_HANDOFF_KEY); } catch { /* private mode */ }
    // A one-off read of the browser's storage after mount; the plan then remounts the form below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHandoff(h); setShape(h.spec.shape);
  }, []);
  // The page's choices (2026-10-28): a look from the fan, a length, a loop. "Start from this" and
  // "Use this" remount the brief with a starting line or a finished example.
  const [look, setLook] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [bin, setBin] = useState<{ n: number; prompt?: string; plan?: Handoff }>({ n: 0 });
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name ?? undefined);
  const brand: GalleryBrand = useMemo(() => ({ name: kit?.name || activeBrand?.brand_name || "Your brand", font: kit?.primaryFont ?? null, logoUrl: kit?.logoUrl ?? null, primary: kit?.primaryColor ?? null, secondary: kit?.secondaryColor ?? null }), [kit, activeBrand?.brand_name]);
  const brief = useRef<HTMLDivElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const toBrief = () => setTimeout(() => brief.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  const plan = bin.plan ?? (handoff && handoff.spec.shape === shape ? handoff : null);
  const pickedLook = look ? lookById(look) : null;

  return (
    <div className="max-w-[1180px] mx-auto pt-2 md:pt-6 pb-16 grid gap-10 grid-cols-[minmax(0,1fr)] w-full min-w-0">
      <header className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Motion graphics · for {activeBrand?.brand_name ?? "your brand"}</p>
          <h2 className="text-[28px] md:text-[40px] font-semibold tracking-tight leading-[1.05]">Motion that looks designed,<br className="hidden md:block" /> <span style={{ color: "var(--s-mute)" }}>not generated.</span></h2>
          <p className="text-[14.5px] mt-3 max-w-[620px]" style={{ color: "var(--s-soft)" }}>Pick a look, say what it&apos;s for, and BlinkSpot animates it in your brand&apos;s words and colours. Every word comes out exact. Previewing and changing it is free.</p>
        </div>
        <div className="s-seg" role="tablist" aria-label="Shape">
          {SHAPES.map((s) => <button key={s.id} role="tab" aria-selected={shape === s.id} onClick={() => setShape(s.id)} title={s.line}>{s.label} <span className="hidden sm:inline" style={{ color: "var(--s-mute)" }}>· {s.line}</span></button>)}
        </div>
      </header>

      <div ref={fan} className="grid gap-2 scroll-mt-24">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><b className="text-[15px]">1. Pick a look</b><span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>{LOOK_COUNT} looks, each shown with your name and colour. Drag or tap one.</span></div>
        <LooksFan shape={shape} brand={brand} clientId={clientId} picked={look} onPick={setLook} />
      </div>

      <section ref={brief} id="make" className="s-card p-4 md:p-5 grid gap-4 scroll-mt-24 md:grid-cols-[280px_minmax(0,1fr)]" aria-label="Make yours">
        <div className="mg-steps content-start">
          <b className="text-[16px]">Make yours</b>
          <div className="mg-step"><i>1</i><div className="grid gap-1"><b>Look</b><span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{pickedLook ? pickedLook.name : "Your brand's own"} · <button className="underline" onClick={() => fan.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>change</button></span></div></div>
          <div className="mg-step"><i>2</i><div className="grid gap-1"><b>What it&apos;s for</b><span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>Say it in a line, or start from one of the ideas.</span></div></div>
          <div className="mg-step"><i>3</i><div className="grid gap-1.5"><b>How long</b>
            <div className="s-seg" role="group" aria-label="How long">
              {([null, 5, 10, 15, 20, 30] as const).map((v) => <button key={String(v)} type="button" aria-pressed={seconds === v} onClick={() => setSeconds(v)}>{v === null ? "Auto" : `${v}s`}</button>)}
            </div></div></div>
          <div className="mg-step"><i>4</i><div className="grid gap-1"><b>Loop</b>
            <label className="flex items-start gap-2 text-[12.5px] cursor-pointer" style={{ color: "var(--s-soft)" }}><input type="checkbox" className="mt-0.5" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> <span>Make it loop: it ends the way it began, for websites, decks and backgrounds</span></label></div></div>
          <div className="mg-step"><i>5</i><div className="grid gap-1"><b>Your words, numbers and pictures</b><span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>Real numbers, screenshots or a video you like make it yours, not generic. Add them on the right.</span></div></div>
        </div>
        <div className="ve rounded-xl" style={{ minHeight: 0, border: "1px solid var(--s-line)" }}>
          <MotionBin key={`${shape}:${handoff ? "inspo" : ""}:${bin.n}`} clientId={clientId} shape={shape} standalone onAdded={() => {}} initialPrompt={bin.prompt ?? link.brief} initialScreens={link.screens.length ? link.screens : null} pictureId={link.picture} initialPlan={plan} look={look} seconds={seconds} loop={loop} brandColors={kit ? { primary: brand.primary, secondary: brand.secondary } : null} />
        </div>
      </section>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><b className="text-[15px]">What it can make</b><span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Scroll through. Each one plays in {pickedLook ? pickedLook.name : "its own look"}.</span></div>
        <WhatItMakes shape={shape} brand={brand} look={look} onStart={(_c, prompt) => { setBin((b) => ({ n: b.n + 1, prompt })); toBrief(); }} />
      </div>

      <div className="grid gap-3">
        <b className="text-[15px]">Examples to start from</b>
        <ExampleGrid shape={shape} brand={brand} look={look} onUse={(spec, name) => { setBin((b) => ({ n: b.n + 1, plan: { spec, pictures: [], concept: name } })); toBrief(); }} />
      </div>
    </div>
  );
}

export default function MotionRoute() {
  return <Suspense fallback={<div className="p-6"><div className="s-skel h-80" /></div>}><MotionPage /></Suspense>;
}
