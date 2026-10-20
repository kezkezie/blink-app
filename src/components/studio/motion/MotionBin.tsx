"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Clapperboard, Compass, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { styleLine, type MotionStyleIdea } from "@/lib/motion/inspo";
import { toast } from "sonner";
import { useKept } from "@/lib/drafts";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useBrandKit } from "@/components/studio/generate-image";
import { MOTION_CREDITS, type MotionShape, type MotionSpec } from "@/lib/motion/spec";
import type { AddedMotion, MotionPlace } from "./MotionStudio";

// The Player and the renderer load only when the studio opens.
const MotionStudio = dynamic(() => import("./MotionStudio").then((m) => m.MotionStudio), { ssr: false });

const STARTS: Array<{ label: string; prompt: string }> = [
  { label: "Intro", prompt: "A punchy 5 second intro with our main message" },
  { label: "Big number", prompt: "One big number that matters to our customers, with a short label" },
  { label: "Product reveal", prompt: "Reveal our main product with its name and price" },
  { label: "Logo sting", prompt: "A short logo sting with our tagline" },
  { label: "Lower third", prompt: "A lower third with a name and title, over my video" },
  { label: "End card", prompt: "An end card with a call to action, our handle and website" },
];

/**
 * The Motion panel in the video editor's rail (2026-10-15): say what it's for (or tap a start),
 * Claude plans it (4 credits), the studio opens with the live preview.
 */
export function MotionBin({ clientId, shape, initialPrompt, pictureId, onAdded }: {
  clientId: string | null; shape: MotionShape; initialPrompt?: string | null; pictureId?: string | null;
  onAdded: (m: AddedMotion, where: MotionPlace) => void;
}) {
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name ?? undefined);
  // Kept on this device per brand (2026-10-20): the brief and the plan (it cost credits).
  const keep = `motion:${activeBrand?.id ?? "none"}`;
  const [prompt, setPrompt] = useKept(`${keep}:prompt`, initialPrompt ?? "", !!initialPrompt);
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useKept<MotionSpec | null>(`${keep}:spec`, null, !!initialPrompt);
  const [pictures, setPictures] = useKept<Array<{ url: string; title: string }>>(`${keep}:pictures`, [], !!initialPrompt);
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<AddedMotion[]>([]);
  const [picture, setPicture] = useState<string | null>(pictureId ?? null);
  // Inspiration from whatships.com, only after the user says yes (2026-10-16).
  const [asking, setAsking] = useState(false);
  const [looking, setLooking] = useState(false);
  const [ideas, setIdeas] = useState<MotionStyleIdea[] | null>(null);
  const [style, setStyle] = useState<MotionStyleIdea | null>(null);
  const allowedKey = "blink.motionInspo.ok";
  function findInspiration() {
    let ok = false;
    try { ok = sessionStorage.getItem(allowedKey) === "1"; } catch { /* private window */ }
    if (ok) void look(); else setAsking(true);
  }
  async function look() {
    if (!activeBrand) return;
    setAsking(false); setLooking(true);
    try { sessionStorage.setItem(allowedKey, "1"); } catch { /* private window */ }
    try {
      const res = await fetch("/api/editor/motion-inspo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, brief: prompt }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't find ideas.");
      setIdeas(data.ideas ?? []);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't find ideas."); }
    finally { setLooking(false); }
  }

  async function write(text = prompt) {
    if (!activeBrand || (text.trim().length < 3 && !style)) { toast.info("Say what it's for first, e.g. a 6 second intro for our launch."); return; }
    setBusy(true);
    try {
      const said = text.trim().length >= 3 ? text : `${style!.title} for ${kit?.name || activeBrand.brand_name}`;
      const brief = style ? `${said}\n${styleLine(style)}` : said;
      const res = await fetch("/api/editor/motion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, prompt: brief.slice(0, 600), shape, ...(picture ? { pictureId: picture } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't plan the motion.");
      setSpec(data.spec); setPictures(data.pictures ?? []); setOpen(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't plan the motion."); }
    finally { setBusy(false); }
  }

  const brand = { name: kit?.name || activeBrand?.brand_name || "Brand", font: kit?.primaryFont ?? null, logoUrl: kit?.logoUrl ?? null, primary: kit?.primaryColor ?? null, secondary: kit?.secondaryColor ?? null };

  return (
    <>
      <div className="ve-bin-h"><b className="text-[13px]">Motion</b>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--s-ai)" }} />}</div>
      <div className="grid gap-2.5 px-3 pb-3">
        <p className="text-[12px]" style={{ color: "var(--s-soft)" }}>Animated titles, numbers, product reveals and end cards in your brand&apos;s font and colours. Every letter comes out exact.</p>
        <textarea className="s-input s-grow" rows={3} style={{ ["--min-lines" as string]: 3, ["--max-lines" as string]: 7 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What's it for? e.g. a 6 second intro for our USDT launch" aria-label="What the motion is for" />
        <div className="flex flex-wrap gap-1">{STARTS.map((s) => <button key={s.label} className="s-chip" aria-pressed={prompt === s.prompt} onClick={() => setPrompt(s.prompt)}>{s.label}</button>)}</div>
        {picture && <span className="text-[11.5px] flex items-center gap-1" style={{ color: "var(--s-soft)" }}>Using the picture you picked <button className="underline" onClick={() => setPicture(null)}>(clear)</button></span>}
        {style ? (
          <span className="text-[11.5px] flex items-center gap-1.5" style={{ color: "var(--s-soft)" }}><Compass className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> Style: {style.title} <button className="underline" onClick={() => setStyle(null)}>(clear)</button></span>
        ) : (
          <button className="s-btn ghost sm justify-start" disabled={looking || !activeBrand} onClick={findInspiration}>{looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Compass className="h-3.5 w-3.5" />} {looking ? "Looking at launch films…" : "Find inspiration"}</button>
        )}
        {asking && (
          <div className="s-card p-3 grid gap-2" role="dialog" aria-label="Look for inspiration">
            <p className="text-[12.5px]">Look at <b>whatships.com</b> for ideas? BlinkSpot reads its public gallery of launch films (titles and stills only) and suggests 3 styles for {kit?.name || activeBrand?.brand_name || "your brand"}. Nothing is copied; each idea links to the original.</p>
            <div className="flex gap-2"><button className="s-btn primary sm" onClick={() => void look()}>Yes, look</button><button className="s-btn ghost sm" onClick={() => setAsking(false)}>Not now</button></div>
          </div>
        )}
        {ideas && !style && (
          <div className="grid gap-2">
            <div className="flex items-center"><span className="s-label" style={{ margin: 0 }}>Styles from whatships.com</span><div className="flex-1" /><button className="s-btn ghost sm" onClick={() => setIdeas(null)} aria-label="Close ideas"><X className="h-3.5 w-3.5" /></button></div>
            {ideas.map((idea) => (
              <div key={idea.title} className="s-card p-2.5 grid gap-1.5">
                <b className="text-[12.5px]">{idea.title}</b>
                <span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>{idea.why}</span>
                {!!idea.refs.length && (
                  <div className="flex gap-1.5">
                    {idea.refs.map((r) => (
                      <a key={r.page} href={r.page} target="_blank" rel="noopener noreferrer" title={`${r.name} · ${r.meta}`} className="block h-10 w-16 rounded-md overflow-hidden" style={{ border: "1px solid var(--s-line)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.poster} alt={r.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      </a>
                    ))}
                    <ExternalLink className="h-3 w-3 self-end" style={{ color: "var(--s-mute)" }} />
                  </div>
                )}
                <button className="s-btn sm justify-start" onClick={() => {
                  // 2026-10-20: the style was kept but the brief stayed empty, and "Write it" did nothing.
                  setStyle(idea); setIdeas(null);
                  if (prompt.trim().length < 3) setPrompt(`${idea.title} for ${kit?.name || activeBrand?.brand_name || "our brand"}: ${idea.why || "a short brand intro"}`.slice(0, 300));
                  toast.success("Style added. Change the words above if you like, then Write it.");
                }}>Use this style</button>
              </div>
            ))}
          </div>
        )}
        <button className="s-btn ai justify-between" disabled={busy || !activeBrand || (prompt.trim().length < 3 && !style)} onClick={() => write()}>
          <span className="flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Planning it…" : "Write it"}</span><span className="cost">{MOTION_CREDITS} cr</span>
        </button>
        <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Shape follows the editor ({shape}). The preview and any changes after that are free.</span>
        {spec && !open && <button className="s-btn sm justify-start" onClick={() => setOpen(true)}><Clapperboard className="h-3.5 w-3.5" /> Back to your motion</button>}
        {made.length > 0 && (
          <div className="grid gap-1 pt-1">
            <span className="s-label" style={{ margin: 0 }}>Added</span>
            {made.map((m, i) => <span key={i} className="text-[12px] truncate" style={{ color: "var(--s-soft)" }}>{m.name.replace("Motion · ", "")} · {m.seconds.toFixed(1)} s</span>)}
          </div>
        )}
      </div>
      {spec && (
        <MotionStudio
          open={open} onClose={() => setOpen(false)} spec={spec} onSpec={setSpec} brand={brand} pictures={pictures}
          clientId={clientId} brandId={activeBrand?.id ?? null} rewriting={busy} onRewrite={() => write()}
          onAdded={(m, where) => { setMade((x) => [m, ...x]); onAdded(m, where); }}
        />
      )}
    </>
  );
}
