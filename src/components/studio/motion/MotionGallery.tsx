"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, Thumbnail } from "@remotion/player";
import { Check, Copy, Repeat, Sparkles } from "lucide-react";
import { MotionVideo, settleFrame, type MotionBrand } from "@/components/motion/MotionVideo";
import { MOTION_FPS, sizeFor, totalFrames, type MotionShape, type MotionSpec } from "@/lib/motion/spec";
import { LOOKS, lookById } from "@/lib/motion/looks";
import { CATEGORIES, EXAMPLES, exampleById, exampleSpec, lookSample, type MotionCategory } from "@/lib/motion/examples";
import { ensureMotionFont } from "./MotionStudio";
import "./motion-gallery.css";

/**
 * The Motion page's gallery (Kezie, 2026-10-28: "people need to really see what the capabilities
 * are", with two Pinterest picks: a pitch deck's slides fanned along a drifting curve, and service
 * cards that stack as you scroll). Every preview is the real thing: our templates in a look, with
 * the brand's own name and colour. Cards show a still (Remotion's Thumbnail) and play only when
 * they're the one in focus, so an iPad isn't playing fifteen videos at once.
 */
export type GalleryBrand = { name: string; font: string | null; logoUrl: string | null; primary: string | null; secondary: string | null };

const motionBrand = (b: GalleryBrand): MotionBrand => ({ name: b.name, font: b.font, logoUrl: b.logoUrl });

/** One preview: a still, or the clip playing on a loop (muted) when it's live. */
function Preview({ spec, brand, live, label }: { spec: MotionSpec; brand: MotionBrand; live: boolean; label: string }) {
  const { width, height } = sizeFor(spec.shape);
  const frames = Math.max(1, totalFrames(spec));
  const props = useMemo(() => ({ spec, brand }), [spec, brand]);
  const still = Math.min(frames - 1, Math.max(0, Math.round(settleFrame(spec.scenes[0]))));
  const style = { width: "100%", height: "100%" } as const;
  return (
    <div className="mg-preview" aria-label={label} role="img">
      {live
        ? <Player component={MotionVideo} inputProps={props} durationInFrames={frames} fps={MOTION_FPS} compositionWidth={width} compositionHeight={height} loop autoPlay initiallyMuted controls={false} clickToPlay={false} acknowledgeRemotionLicense style={style} />
        : <Thumbnail component={MotionVideo} inputProps={props} durationInFrames={frames} fps={MOTION_FPS} compositionWidth={width} compositionHeight={height} frameToDisplay={still} style={style} />}
    </div>
  );
}

/* ---------------- The fan of looks (pin 1: cards drifting along a curve) ---------------- */

export function LooksFan({ shape, brand, clientId, picked, onPick }: { shape: MotionShape; brand: GalleryBrand; clientId: string | null; picked: string | null; onPick: (id: string | null) => void }) {
  const looks = useMemo(() => [{ id: null as string | null, name: "Your brand", line: "Your colours and font, as you set them." }, ...LOOKS.map((l) => ({ id: l.id as string | null, name: l.name, line: l.line }))], []);
  const specs = useMemo(() => looks.map((l) => lookSample(l.id, { shape, brand: brand.name, primary: brand.primary, secondary: brand.secondary })), [looks, shape, brand]);
  const mb = useMemo(() => motionBrand(brand), [brand]);
  // Every look's typeface, and the brand's own (the Your brand card).
  useEffect(() => { LOOKS.forEach((l) => void ensureMotionFont(l.font, clientId)); if (brand.font) void ensureMotionFont(brand.font, clientId); }, [clientId, brand.font]);

  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLButtonElement | null>>([]);
  const offset = useRef(0), target = useRef<number | null>(null), paused = useRef(false), drag = useRef<{ x: number; o: number; moved: boolean } | null>(null);
  const [center, setCenter] = useState(0);
  const n = looks.length;
  const dims = shape === "9:16" ? { w: 168, h: 299 } : shape === "1:1" ? { w: 220, h: 220 } : { w: 300, h: 169 };
  const gap = dims.w + 34;

  useEffect(() => {
    let raf = 0, last = performance.now(), shown = -1;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const total = n * gap;
      if (target.current !== null) {
        // Ease the picked card to the middle, the short way round.
        let d = ((target.current - offset.current) % total + total * 1.5) % total - total / 2;
        if (Math.abs(d) < 0.5) { offset.current = target.current; target.current = null; d = 0; }
        offset.current += d * Math.min(1, dt * 7);
      } else if (!paused.current && !drag.current && !reduce) offset.current += dt * 26;
      const W = (stage.current?.clientWidth ?? 1200) / 2;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const el = cards.current[i];
        if (!el) continue;
        const x = (((i * gap - offset.current) % total) + total * 1.5) % total - total / 2;
        const u = Math.max(-1.4, Math.min(1.4, x / Math.max(300, W)));
        const y = u * u * 70, rot = u * 9, scale = 1 - Math.min(0.22, Math.abs(u) * 0.16);
        el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        el.style.zIndex = String(1000 - Math.round(Math.abs(x)));
        el.style.opacity = Math.abs(u) > 1.25 ? String(Math.max(0, 1 - (Math.abs(u) - 1.25) * 6)) : "1";
        if (Math.abs(x) < bestD) { bestD = Math.abs(x); best = i; }
      }
      if (best !== shown) { shown = best; setCenter(best); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, gap]);

  const bring = (i: number) => { target.current = i * gap; onPick(looks[i].id); };
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, o: offset.current, moved: false }; };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 6) d.moved = true; offset.current = d.o - dx; target.current = null; };
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.moved) { const i = Math.round(offset.current / gap); target.current = i * gap; } };
  const live = looks[center];
  const pickedLook = picked ? lookById(picked) : null;

  return (
    <section className="mg-fan" aria-label="Looks">
      <div ref={stage} className="mg-fan-stage" style={{ height: dims.h + 150 }}
        onPointerEnter={() => { paused.current = true; }} onPointerLeave={() => { paused.current = false; onUp(); }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {looks.map((l, i) => {
          const on = l.id === picked;
          return (
            <button key={l.id ?? "brand"} ref={(el) => { cards.current[i] = el; }} type="button" className={`mg-card${on ? " on" : ""}`} style={{ width: dims.w, height: dims.h }}
              aria-pressed={on} aria-label={`${l.name}: ${l.line}`} onClick={(e) => { if (drag.current?.moved) { e.preventDefault(); return; } bring(i); }}>
              <Preview spec={specs[i]} brand={mb} live={i === center} label={`${l.name} preview`} />
              <span className="mg-card-name">{on && <Check className="h-3 w-3" />}{l.name}</span>
            </button>
          );
        })}
      </div>
      <div className="mg-fan-caption" aria-live="polite">
        <b>{live.name}</b><span>{live.line}</span>
        {live.id !== picked
          ? <button type="button" className="s-btn sm" onClick={() => bring(center)}><Sparkles className="h-3.5 w-3.5" /> Use this look</button>
          : <span className="mg-picked"><Check className="h-3.5 w-3.5" /> {pickedLook ? `${pickedLook.name} is your look` : "Your brand's look"}</span>}
      </div>
    </section>
  );
}

/* ---------------- What it can make (pin 2: cards that stack as you scroll) ---------------- */

export function WhatItMakes({ shape, brand, look, onStart }: { shape: MotionShape; brand: GalleryBrand; look: string | null; onStart: (category: MotionCategory, prompt: string) => void }) {
  const mb = useMemo(() => motionBrand(brand), [brand]);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const io = new IntersectionObserver((entries) => setInView((cur) => {
      const next = new Set(cur);
      for (const e of entries) { const id = (e.target as HTMLElement).dataset.cat!; if (e.isIntersecting) next.add(id); else next.delete(id); }
      return next;
    }), { threshold: 0.45 });
    refs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section className="mg-stack" aria-label="What it can make">
      {CATEGORIES.map((c, i) => {
        const ex = exampleById(c.example);
        const spec = ex ? exampleSpec(ex, { shape, brand: brand.name, primary: brand.primary, secondary: brand.secondary, look }) : null;
        return (
          <article key={c.id} data-cat={c.id} ref={(el) => { if (el) refs.current.set(c.id, el); }} className="mg-stack-card" style={{ top: 72 + i * 18, ["--shade" as string]: `${6 + i * 3}%` }}>
            <div className="mg-stack-text">
              <h3><span>{c.title[0]}</span><span>{c.title[1]}</span></h3>
              <div className="mg-tags">{c.tags.map((t) => <span key={t}>{t}</span>)}</div>
              <p>{c.line}</p>
              <button type="button" className="s-btn sm primary justify-self-start" onClick={() => onStart(c.id, c.start)}>Start from this</button>
            </div>
            <div className={`mg-stack-preview ${shape === "16:9" ? "wide" : shape === "1:1" ? "square" : "tall"}`}>
              {spec ? <Preview spec={spec} brand={mb} live={inView.has(c.id)} label={`${c.title.join(" ")} example`} /> : <div className="mg-stack-empty"><Copy className="h-5 w-5" /><span>Add your app&apos;s screenshots below and each becomes a step.</span></div>}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ---------------- Examples to start from (free to open) ---------------- */

export function ExampleGrid({ shape, brand, look, onUse }: { shape: MotionShape; brand: GalleryBrand; look: string | null; onUse: (spec: MotionSpec, name: string) => void }) {
  const mb = useMemo(() => motionBrand(brand), [brand]);
  const [hover, setHover] = useState<string | null>(null);
  const [cat, setCat] = useState<MotionCategory | "all">("all");
  const list = EXAMPLES.filter((e) => cat === "all" || e.category === cat);
  return (
    <section className="grid gap-3" aria-label="Examples to start from">
      <div className="flex flex-wrap items-center gap-2">
        <div className="s-seg mg-seg-wrap" role="group" aria-label="Show examples">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
          {CATEGORIES.filter((c) => EXAMPLES.some((e) => e.category === c.id)).map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.title[0]}</button>)}
        </div>
        <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{look ? `Shown in ${lookById(look)?.name}. ` : "Each in its own look. "}Opening one is free: change the words, then make it.</span>
      </div>
      <div className={`mg-grid ${shape === "16:9" ? "wide" : ""}`}>
        {list.map((e) => {
          const spec = exampleSpec(e, { shape, brand: brand.name, primary: brand.primary, secondary: brand.secondary, look });
          return (
            <div key={e.id} className="mg-ex" onPointerEnter={() => setHover(e.id)} onPointerLeave={() => setHover((h) => (h === e.id ? null : h))}>
              <button type="button" className={`mg-ex-media ${shape === "16:9" ? "wide" : shape === "1:1" ? "square" : "tall"}`} onClick={() => onUse(spec, e.name)} onFocus={() => setHover(e.id)} aria-label={`Use the ${e.name} example`}>
                <Preview spec={spec} brand={mb} live={hover === e.id} label={`${e.name} example`} />
                {e.loop && <span className="mg-badge"><Repeat className="h-3 w-3" /> Loops</span>}
              </button>
              <div className="grid gap-0.5 px-0.5">
                <b className="text-[13.5px]">{e.name}</b>
                <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>For: &ldquo;{e.forLine}&rdquo;</span>
                <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{lookById(look ?? e.look)?.name} · {e.tags.join(" · ")}</span>
              </div>
              <button type="button" className="s-btn sm" onClick={() => onUse(spec, e.name)}>Use this <span className="cost">free</span></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
