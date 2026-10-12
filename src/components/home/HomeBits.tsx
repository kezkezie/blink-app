"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Menu, Pause, Play, X } from "lucide-react";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#examples", label: "Examples" },
  { href: "/#pricing", label: "Pricing" },
];

export function HomeNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    const id = requestAnimationFrame(on);
    window.addEventListener("scroll", on, { passive: true });
    return () => { cancelAnimationFrame(id); window.removeEventListener("scroll", on); };
  }, []);
  return (
    <header className="fixed top-0 inset-x-0 z-50 transition-colors duration-300" style={{ background: solid || open ? "color-mix(in oklab, var(--s-bg) 82%, transparent)" : "transparent", backdropFilter: solid || open ? "blur(14px)" : undefined, borderBottom: `1px solid ${solid ? "var(--s-line)" : "transparent"}` }}>
      <div className="h-wrap flex items-center gap-6 h-16">
        <Link href="/" className="flex items-center gap-2.5" aria-label="BlinkSpot home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-lime.png" alt="" className="h-7 w-7 object-contain" />
          <span className="text-[16px] font-semibold tracking-tight">BlinkSpot</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[14px]" aria-label="Main">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="h-muted hover:text-[var(--s-text)] transition-colors">{l.label}</a>)}
        </nav>
        <div className="flex-1" />
        <Link href="/login" className="hidden sm:inline text-[14px] h-muted hover:text-[var(--s-text)] transition-colors">Sign in</Link>
        <Link href="/get-started" className="h-btn whitespace-nowrap shrink-0" style={{ height: 40, fontSize: 14, padding: "0 6px 0 16px" }}>Start free <span className="h-ico" style={{ width: 28, height: 28 }}><ArrowRight className="h-3.5 w-3.5" /></span></Link>
        <button className="md:hidden h-9 w-9 grid place-items-center" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <nav className="md:hidden h-wrap pb-5 grid gap-1" aria-label="Mobile">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-3 text-[17px]" style={{ borderBottom: "1px solid var(--s-line)" }}>{l.label}</a>)}
          <Link href="/login" className="py-3 text-[17px]">Sign in</Link>
        </nav>
      )}
    </header>
  );
}

/** Plays only while on screen, so a page full of clips stays light. */
export function LazyVideo({ src, poster, className = "", style }: { src: string; poster?: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { v.preload = "auto"; void v.play().catch(() => {}); } else v.pause(); }, { rootMargin: "200px" });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" className={className} style={style} />;
}

/** Inspo on the left, the brand's version on the right; drag the line. */
export function BeforeAfter({ before, after, labelBefore, labelAfter }: { before: string; after: string; labelBefore: string; labelAfter: string }) {
  const [x, setX] = useState(52);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => { const r = box.current?.getBoundingClientRect(); if (r) setX(Math.min(96, Math.max(4, ((clientX - r.left) / r.width) * 100))); };
  return (
    <div ref={box} className="relative w-full h-full select-none touch-none cursor-ew-resize" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX); }} onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
      role="slider" aria-label="Compare the inspo and the brand's version" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") setX((v) => Math.max(4, v - 5)); if (e.key === "ArrowRight") setX((v) => Math.min(96, v + 5)); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={labelAfter} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={labelBefore} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      </div>
      <div className="absolute inset-y-0 w-px" style={{ left: `${x}%`, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.15)" }}>
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full grid place-items-center" style={{ background: "#fff", color: "#111" }}><ArrowLeftRight className="h-4 w-4" /></span>
      </div>
      <span className="absolute left-3 top-3 h-chip" style={{ background: "rgba(0,0,0,.6)", color: "#fff", border: 0 }}>{labelBefore}</span>
      <span className="absolute right-3 top-3 h-chip" style={{ background: "var(--s-accent)", color: "var(--s-accent-ink)", border: 0 }}>{labelAfter}</span>
    </div>
  );
}

export function VoiceRow({ src, title, script, voice }: { src: string; title: string; script: string; voice: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderTop: "1px solid var(--s-line)" }}>
      <audio ref={ref} src={src} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
      <button className="h-10 w-10 rounded-full grid place-items-center shrink-0" style={{ background: on ? "var(--s-accent)" : "var(--s-raised)", color: on ? "var(--s-accent-ink)" : "var(--s-text)" }}
        onClick={() => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }} aria-label={`${on ? "Pause" : "Play"} ${title}`}>
        {on ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title} <span className="h-muted font-normal">· voice “{voice}”</span></div>
        <div className="text-[12.5px] h-muted truncate">“{script}”</div>
      </div>
    </div>
  );
}
