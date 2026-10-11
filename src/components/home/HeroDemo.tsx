"use client";

import { memo, useEffect, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { EXAMPLES } from "@/lib/examples";

/**
 * The hero's live demo: a prompt types itself, BlinkSpot "makes" it, the real result appears with
 * what it cost. Every frame is a real example from the gallery, never a mock-up.
 */
type Scene = { say: string; id: string; meta: string };
const SCENES: Scene[] = [
  { say: "A launch poster for our cold-pressed mango juice. Fresh, premium, cream background.", id: "mavuno-poster", meta: "Nano Banana 2 · 4K · 18 cr" },
  { say: "Show our kitenge dress on a real street, turning so you see the back.", id: "kitenge-tryon", meta: "Video · 5 s · 20 cr" },
  { say: "Sneaker drop on Friday. Bold orange poster, the shoe floating.", id: "kasi-poster", meta: "Nano Banana 2 · 4K · 18 cr" },
  { say: "Open the box, the sneaker rises into the spotlight.", id: "kasi-reveal", meta: "Video · 5 s · 38 cr" },
];

function useScene() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<"typing" | "making" | "done">("typing");
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const say = SCENES[i].say;
    let t: ReturnType<typeof setTimeout>;
    if (reduce) { t = setTimeout(() => { setTyped(say.length); setPhase("done"); }, 0); return () => clearTimeout(t); }
    if (phase === "typing") t = setTimeout(() => (typed < say.length ? setTyped(typed + 1) : setPhase("making")), typed === 0 ? 500 : 26);
    else if (phase === "making") t = setTimeout(() => setPhase("done"), 1100);
    else t = setTimeout(() => { setI((i + 1) % SCENES.length); setTyped(0); setPhase("typing"); }, 4200);
    return () => clearTimeout(t);
  }, [i, typed, phase]);
  return { i, typed, phase };
}

export const HeroDemo = memo(function HeroDemo() {
  const { i, typed, phase } = useScene();
  const scene = SCENES[i];
  const prev = SCENES[(i + SCENES.length - 1) % SCENES.length];
  const ex = (id: string) => EXAMPLES.find((e) => e.id === id);
  const now = ex(scene.id);
  const before = ex(prev.id);
  const media = (e: ReturnType<typeof ex>, on: boolean) => !e ? null : e.kind === "video" || e.kind === "story"
    ? <video key={e.id} src={e.url} poster={e.input} muted loop playsInline autoPlay={on} preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img key={e.id} src={e.thumb ?? e.url} alt={e.title} className="absolute inset-0 w-full h-full object-cover" />;

  return (
    <div className="h-bezel relative">
      <div className="relative" style={{ background: "var(--s-panel)" }}>
        {/* window bar */}
        <div className="flex items-center gap-2 px-4 h-11" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <span className="flex gap-1.5">{["#3A3D42", "#3A3D42", "#3A3D42"].map((c, k) => <span key={k} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
          <span className="text-[12px] ml-2 h-muted">BlinkSpot · Create</span>
          <span className="ml-auto h-chip" style={{ height: 22, fontSize: 11 }}><Sparkles className="h-3 w-3" style={{ color: "var(--s-accent)" }} /> Brand kit on</span>
        </div>
        <div className="p-4 md:p-5 grid gap-4">
          {/* prompt */}
          <div className="rounded-2xl p-4" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line-2)" }}>
            <p className="text-[15px] leading-relaxed min-h-[48px]" aria-live="polite" data-testid="hero-prompt">
              {scene.say.slice(0, typed)}{phase === "typing" && <span className="h-caret" />}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="h-chip" style={{ height: 24, fontSize: 11 }}>{now?.kind === "video" ? "Video" : "Image"}</span>
              <span className="h-chip" style={{ height: 24, fontSize: 11 }}>{now?.settings.aspect ?? "4:5"}</span>
              <span className="ml-auto h-9 w-9 rounded-full grid place-items-center" style={{ background: "var(--s-accent)", color: "var(--s-accent-ink)" }}><ArrowUp className="h-4 w-4" /></span>
            </div>
          </div>
          {/* output stage */}
          <div className="relative" style={{ aspectRatio: "16 / 11" }}>
            <div className="absolute inset-y-6 left-0 w-[46%] rounded-2xl overflow-hidden -rotate-[5deg] opacity-60" style={{ background: "var(--s-raised)" }}>{media(before, false)}</div>
            <div className="absolute inset-y-0 right-0 w-[62%] rounded-2xl overflow-hidden shadow-2xl" style={{ background: "var(--s-raised)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.7)" }}>
              {phase !== "done" && <div className="absolute inset-0 h-shimmer grid place-items-center"><span className="text-[12px] h-muted">{phase === "making" ? "Making it with your brand…" : ""}</span></div>}
              <div className="h-out absolute inset-0" data-on={phase === "done"}>{media(now, phase === "done")}</div>
              <span className="absolute left-3 bottom-3 h-chip" style={{ background: "rgba(0,0,0,.62)", color: "#fff", border: 0, backdropFilter: "blur(8px)", opacity: phase === "done" ? 1 : 0, transition: "opacity .5s" }}>{scene.meta}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
