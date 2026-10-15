"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Clapperboard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<MotionSpec | null>(null);
  const [pictures, setPictures] = useState<Array<{ url: string; title: string }>>([]);
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<AddedMotion[]>([]);
  const [picture, setPicture] = useState<string | null>(pictureId ?? null);

  async function write(text = prompt) {
    if (!activeBrand || text.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch("/api/editor/motion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, prompt: text, shape, ...(picture ? { pictureId: picture } : {}) }) });
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
        <textarea className="s-input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What's it for? e.g. a 6 second intro for our USDT launch" aria-label="What the motion is for" />
        <div className="flex flex-wrap gap-1">{STARTS.map((s) => <button key={s.label} className="s-chip" aria-pressed={prompt === s.prompt} onClick={() => setPrompt(s.prompt)}>{s.label}</button>)}</div>
        {picture && <span className="text-[11.5px] flex items-center gap-1" style={{ color: "var(--s-soft)" }}>Using the picture you picked <button className="underline" onClick={() => setPicture(null)}>(clear)</button></span>}
        <button className="s-btn ai justify-between" disabled={busy || !activeBrand || prompt.trim().length < 3} onClick={() => write()}>
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
