"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { EXAMPLES, EXAMPLE_FILTERS, type Example } from "@/lib/examples";

import { Overlay } from "../Modal";
/**
 * "Made with BlinkSpot": click any example to see exactly how it was made (the prompt, the
 * settings, the photo or voice it started from) and start your own from it. Like Pixlr's
 * template gallery, but every piece shows its recipe. Kezie asked for this 2026-10-10.
 */

const KIND_LABEL: Record<Example["kind"], string> = { image: "Image", remix: "Inspo Remix", video: "Video", story: "Scene by scene", voice: "Voice", logo: "Logo" };
const CHECKER = "repeating-conic-gradient(#2a2c31 0% 25%, #1f2125 0% 50%) 50% / 18px 18px";

function HoverVideo({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  return (
    <video
      src={src} poster={poster} muted loop playsInline preload="metadata" className={className}
      onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
      onFocus={(e) => { void e.currentTarget.play().catch(() => {}); }}
    />
  );
}

function VoiceButton({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <audio ref={ref} src={src} preload="none" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <span
        role="button" tabIndex={0} aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className="h-12 w-12 rounded-full grid place-items-center cursor-pointer" style={{ background: "var(--s-accent)", color: "var(--s-accent-ink)" }}
        onClick={(e) => { e.stopPropagation(); const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); const a = ref.current; if (a) { if (a.paused) void a.play(); else a.pause(); } } }}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </span>
    </>
  );
}

function CardMedia({ e }: { e: Example }) {
  if (e.kind === "image" || e.kind === "remix") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.thumb ?? e.url} alt={e.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        {e.kind === "remix" && e.before && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.before} alt="The inspo it came from" loading="lazy" className="absolute left-2 bottom-2 w-[30%] rounded-md border-2 border-white/80 shadow-lg" />
        )}
      </>
    );
  }
  if (e.kind === "video" || e.kind === "story") return <HoverVideo src={e.url} poster={e.input} className="absolute inset-0 w-full h-full object-cover" />;
  if (e.kind === "logo") {
    return (
      <span className="absolute inset-0 grid place-items-center p-6" style={{ background: "#F5F3EF" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.url} alt={e.title} loading="lazy" className="max-w-full max-h-full object-contain" />
      </span>
    );
  }
  return (
    <span className="absolute inset-0 grid place-items-center gap-2 p-5 text-center" style={{ background: "radial-gradient(120% 90% at 20% 10%, color-mix(in oklab, var(--s-ai) 30%, transparent), transparent 60%), #111317" }}>
      <VoiceButton src={e.url} label={e.title} />
      <span className="text-[12px] leading-snug line-clamp-3" style={{ color: "var(--s-soft)" }}>&ldquo;{e.prompt}&rdquo;</span>
    </span>
  );
}

function ratioFor(e: Example) {
  if (e.kind === "voice" || e.kind === "logo") return "1 / 1";
  const a = e.settings.aspect ?? "4:5";
  return a.replace(":", " / ");
}

export function ExampleCard({ e, onOpen }: { e: Example; onOpen: (e: Example) => void }) {
  return (
    <button className="s-pick text-left w-full break-inside-avoid mb-3" onClick={() => onOpen(e)} aria-label={`${e.title} for ${e.brand}: see how it was made`}>
      <div className="s-pick-media" style={{ aspectRatio: ratioFor(e), background: CHECKER }}>
        <CardMedia e={e} />
        <span className="s-badge absolute left-2 top-2" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>{KIND_LABEL[e.kind]}</span>
      </div>
      <div className="px-3 py-2.5 grid gap-0.5">
        <b className="text-[13px] font-semibold truncate">{e.title}</b>
        <span className="text-[11.5px] truncate" style={{ color: "var(--s-mute)" }}>{e.brand} · {e.settings.credits ? `${e.settings.credits} cr` : "free"}</span>
      </div>
    </button>
  );
}

function StoryPlayer({ e }: { e: Example }) {
  const [i, setI] = useState(0);
  const scenes = e.scenes ?? [];
  return (
    <div className="grid gap-2">
      <video key={scenes[i]?.url} src={scenes[i]?.url} autoPlay controls playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: ratioFor(e) }}
        onEnded={() => setI((n) => (n + 1 < scenes.length ? n + 1 : n))} />
      <div className="flex gap-1.5">
        {scenes.map((_, n) => <button key={n} className="s-chip" aria-pressed={n === i} onClick={() => setI(n)}>Scene {n + 1}</button>)}
      </div>
      <div className="flex gap-3 items-start">
        {scenes[i]?.frame && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scenes[i].frame} alt={`Scene ${i + 1} first frame`} className="h-16 rounded-md object-cover shrink-0" />
        )}
        <p className="text-[12px] leading-snug" style={{ color: "var(--s-soft)" }}>
          <b style={{ color: "var(--s-text)" }}>Scene {i + 1}.</b> First frame: {scenes[i]?.framePrompt?.replace(/^Photographic first frame of a video, sharp, ready to animate\. /, "")} <b style={{ color: "var(--s-text)" }}>Motion:</b> {scenes[i]?.prompt}
        </p>
      </div>
    </div>
  );
}

function Detail({ e, onClose }: { e: Example; onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const s = e.settings;
  const chips = [s.model, s.aspect, s.duration ? `${s.duration} s` : "", s.voice ? `voice: ${s.voice}` : "", s.font ? `font: ${s.font}` : "", s.credits ? `${s.credits} credits` : "free"].filter(Boolean);
  return (
    <Overlay onClose={onClose} dim={0.72}>
      <div className="s-card w-full max-w-[1080px] max-h-[92dvh] overflow-y-auto grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={`How "${e.title}" was made`}>
        <div className="p-3 md:p-4 min-w-0" style={{ background: "var(--s-bg)" }}>
          {e.kind === "story" ? <StoryPlayer e={e} />
            : e.kind === "video" ? <video src={e.url} poster={e.input} autoPlay controls playsInline loop className="w-full max-h-[78dvh] rounded-xl bg-black object-contain" style={{ aspectRatio: ratioFor(e) }} />
            : e.kind === "voice" ? <div className="grid place-items-center gap-4 py-16"><VoiceButton src={e.url} label={e.title} /><p className="text-center max-w-[420px] text-[15px]">&ldquo;{e.prompt}&rdquo;</p></div>
            : e.kind === "logo" ? (
              <div className="rounded-xl grid place-items-center p-8" style={{ background: "#F5F3EF" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.url} alt={e.title} className="max-h-[60dvh] object-contain" />
              </div>
            )
            : (
              <div className="grid gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.url} alt={e.title} className="w-full max-h-[78dvh] object-contain rounded-xl" />
              </div>
            )}
        </div>
        <div className="p-4 md:p-5 grid content-start gap-4 min-w-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>{KIND_LABEL[e.kind]}{e.tab ? ` · ${e.tab}` : ""} · {e.brand} (made-up brand)</p>
              <h3 className="text-[19px] font-semibold leading-tight mt-1">{e.title}</h3>
              <p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>{e.short}</p>
            </div>
            <button className="s-btn ghost sm ml-auto shrink-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>

          {(e.before || e.input) && (
            <div>
              <span className="s-label">{e.before ? "Started from this inspo" : e.firstFrame || e.kind === "story" ? "Step 1 · the first frame (approved before paying for video)" : "Started from this photo"}</span>
              <div className="flex gap-3 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.before ?? e.input} alt="" className="h-28 min-w-[84px] rounded-lg object-cover shrink-0" style={{ background: "var(--s-line)" }} />
                {e.framePrompt && <p className="text-[11.5px] leading-snug" style={{ color: "var(--s-mute)" }}>{e.framePrompt.replace(/^Photographic first frame of a video, sharp, ready to animate\. /, "")}</p>}
              </div>
            </div>
          )}
          {e.script && (
            <div>
              <span className="s-label">What they say</span>
              <p className="text-[13px]">&ldquo;{e.script}&rdquo;</p>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="s-label !mb-0">{e.kind === "voice" ? "The script" : e.kind === "story" ? "The idea" : e.firstFrame ? "Step 2 · the motion" : "The prompt"}</span>
              <button className="s-btn ghost sm ml-auto" onClick={() => { void navigator.clipboard.writeText(e.prompt).then(() => toast.success("Prompt copied")); }}><Copy className="h-3.5 w-3.5" /> Copy</button>
            </div>
            <pre className="text-[12px] leading-relaxed whitespace-pre-wrap break-words rounded-lg p-3 max-h-[260px] overflow-y-auto" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)", fontFamily: "var(--s-mono)", color: "var(--s-soft)" }}>{e.prompt}</pre>
          </div>
          <div>
            <span className="s-label">Settings</span>
            <div className="flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="s-badge">{c}</span>)}</div>
            {s.colors && <div className="flex gap-1.5 mt-2">{s.colors.map((c) => <span key={c} className="h-6 w-6 rounded-md border" style={{ background: c, borderColor: "var(--s-line-2)" }} title={c} />)}</div>}
          </div>
          <Link href={e.use.href} className="s-btn primary justify-center" onClick={onClose}>
            {e.kind === "logo" ? "Make a logo like this" : e.kind === "remix" ? "Remix your own inspo" : e.kind === "voice" ? "Make a talking video" : "Use this prompt"} <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-[11px] -mt-2" style={{ color: "var(--s-mute)" }}>Opens with your brand. You see the price before anything is spent.</p>
        </div>
      </div>
    </Overlay>
  );
}

export function ExamplesGallery({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const [filter, setFilter] = useState<(typeof EXAMPLE_FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<Example | null>(null);
  const kinds = EXAMPLE_FILTERS.find((f) => f.id === filter)!.kinds;
  const list = EXAMPLES.filter((e) => kinds.includes(e.kind)).slice(0, limit);
  if (EXAMPLES.length === 0) return null;
  return (
    <>
      {!compact && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {EXAMPLE_FILTERS.map((f) => <button key={f.id} className="s-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      )}
      <div className={compact ? "columns-2 md:columns-4 gap-3" : "columns-2 md:columns-3 xl:columns-4 gap-3"}>
        {list.map((e) => <ExampleCard key={e.id} e={e} onOpen={setOpen} />)}
      </div>
      {open && <Detail e={open} onClose={() => setOpen(null)} />}
    </>
  );
}
