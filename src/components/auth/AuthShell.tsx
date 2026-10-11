"use client";

import "@/app/studio/studio.css";
import Link from "next/link";
import { EXAMPLES } from "@/lib/examples";

/**
 * Login and sign-up in the studio look (2026-10-11): the form on the left, a slow wall of real
 * BlinkSpot examples on the right, so the first thing a new person sees is what they'll make.
 */
const WALL = EXAMPLES.filter((e) => e.kind === "image" || e.kind === "remix").map((e) => e.thumb ?? e.url);

function Column({ items, duration, reverse }: { items: string[]; duration: number; reverse?: boolean }) {
  const loop = [...items, ...items];
  return (
    <div className="flex flex-col gap-3 s-wall-col" style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}>
      {loop.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" loading={i < 3 ? "eager" : "lazy"} className="w-full rounded-2xl object-cover" style={{ aspectRatio: "4 / 5" }} />
      ))}
    </div>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const third = Math.ceil(WALL.length / 3);
  const cols = [WALL.slice(0, third), WALL.slice(third, third * 2), WALL.slice(third * 2)].map((c) => (c.length ? c : WALL));
  return (
    <div className="studio min-h-dvh grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]" style={{ background: "var(--s-bg)", color: "var(--s-text)" }}>
      <style>{`
        @keyframes s-wall { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        .s-wall-col { animation: s-wall linear infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .s-wall-col { animation: none; } }
      `}</style>
      <main className="flex flex-col px-6 sm:px-12 py-8 min-h-dvh">
        <Link href="/" className="flex items-center gap-2.5 w-fit" aria-label="BlinkSpot home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-lime.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-[17px] font-semibold tracking-tight">BlinkSpot</span>
        </Link>
        <div className="flex-1 grid place-items-center py-10">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[30px] font-semibold tracking-tight leading-tight">{title}</h1>
            <p className="text-[14px] mt-2 mb-8" style={{ color: "var(--s-soft)" }}>{subtitle}</p>
            {children}
            {footer && <div className="mt-6 text-[13px]" style={{ color: "var(--s-soft)" }}>{footer}</div>}
          </div>
        </div>
        <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>
          By continuing you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </main>
      <aside className="hidden lg:block relative overflow-hidden" aria-hidden>
        <div className="absolute inset-0 grid grid-cols-3 gap-3 p-3 -rotate-[4deg] scale-110 opacity-90">
          <Column items={cols[0]} duration={70} />
          <Column items={cols[1]} duration={90} reverse />
          <Column items={cols[2]} duration={80} />
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, var(--s-bg) 0%, rgba(12,13,15,.35) 30%, rgba(12,13,15,.1) 60%, rgba(12,13,15,.55) 100%)" }} />
        <div className="absolute left-10 bottom-10 right-10 max-w-[460px]">
          <p className="text-[12px] uppercase tracking-[.14em]" style={{ color: "var(--s-accent)" }}>Made with BlinkSpot</p>
          <p className="text-[26px] font-semibold leading-tight mt-2">Posters, product shots and videos for your brand, from one sentence.</p>
        </div>
      </aside>
    </div>
  );
}

export function AuthField({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-medium" style={{ color: "var(--s-soft)" }}>{label}</span>
      <input {...props} data-no-mic className="s-input" style={{ height: 44, fontSize: 14 }} />
    </label>
  );
}
