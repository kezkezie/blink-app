"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Clapperboard, FileText, Film, ImagePlus, Loader2, Sparkles, Square, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { queueForEditor } from "@/components/studio/queue-clips";
import { useKept } from "@/lib/drafts";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useBrandKit } from "@/components/studio/generate-image";
import { MOTION_CREDITS, type MotionShape, type MotionSpec } from "@/lib/motion/spec";
import type { AddedMotion, MotionPlace } from "./MotionStudio";
import { track } from "@/lib/analytics";
import { readVideo } from "@/lib/video-inspo/analyze";

// The Player and the renderer load only when the studio opens.
const MotionStudio = dynamic(() => import("./MotionStudio").then((m) => m.MotionStudio), { ssr: false });

// The use cases of Claude's own motion graphics (2026-10-21), then the classics.
const STARTS: Array<{ label: string; prompt: string; source?: string }> = [
  { label: "Explainer", prompt: "A 20 second explainer of how our product works: a hook, one idea per scene, the key number, then an end card" },
  { label: "Numbers that move", prompt: "Our results as an animated bar chart, the best one highlighted, then the change as a before and after", source: "Paste your numbers here, e.g.\nJan 120\nFeb 180\nMar 260" },
  { label: "Post to video", prompt: "Turn this post into a 20 second video: a headline, the key points one by one, then an end card", source: "Paste the post, article or notes here." },
  { label: "Launch teaser", prompt: "A 15 second launch teaser: a bold hook, what's new, the price, then our logo and the call to action" },
  { label: "Intro", prompt: "A punchy 5 second intro with our main message" },
  { label: "Big number", prompt: "One big number that matters to our customers, with a short label" },
  { label: "Product reveal", prompt: "Reveal our main product with its name and price" },
  { label: "Logo sting", prompt: "A short logo sting with our tagline" },
  { label: "Lower third", prompt: "A lower third with a name and title, over my video" },
  { label: "End card", prompt: "An end card with a call to action, our handle and website" },
  { label: "App walkthrough", prompt: "A walkthrough of our app: one step per screenshot, pointing at the button and saying what it does" },
];

const MAX_SCREENS = 6;

/** A screenshot at most 1568 px on its long side (what Claude sees, so its pixel boxes land), as WebP. */
async function shrinkScreen(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/webp", 0.92));
  } finally { URL.revokeObjectURL(url); }
}

/**
 * The Motion panel in the video editor's rail (2026-10-15): say what it's for (or tap a start),
 * Claude plans it (4 credits), the studio opens with the live preview.
 */
export function MotionBin({ clientId, shape, initialPrompt, initialScreens, initialPlan, pictureId, onAdded, standalone = false }: {
  clientId: string | null; shape: MotionShape; initialPrompt?: string | null; pictureId?: string | null;
  /** A plan made elsewhere (Video Inspo's "Make it as motion graphics", 2026-10-21): opens straight in the studio. */
  initialPlan?: { spec: MotionSpec; pictures: Array<{ url: string; title: string }>; concept?: string } | null;
  /** Screenshots for a walkthrough, from Ask BlinkSpot's link (2026-10-20). */
  initialScreens?: string[] | null;
  onAdded: (m: AddedMotion, where: MotionPlace) => void;
  /** On its own page (Create → Motion graphics): saves to the Library instead of the timeline. */
  standalone?: boolean;
}) {
  const { activeBrand } = useBrandStore();
  const router = useRouter();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name ?? undefined);
  // Kept on this device per brand (2026-10-20): the brief and the plan (it cost credits).
  const keep = activeBrand ? `motion:${activeBrand.id}` : null;
  const fresh = !!initialPrompt || !!initialPlan;
  const [prompt, setPrompt] = useKept(keep && `${keep}:prompt`, initialPrompt ?? initialPlan?.concept ?? "", fresh);
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useKept<MotionSpec | null>(keep && `${keep}:spec`, initialPlan?.spec ?? null, fresh);
  const [pictures, setPictures] = useKept<Array<{ url: string; title: string }>>(keep && `${keep}:pictures`, initialPlan?.pictures ?? [], fresh);
  // Screenshots for an app walkthrough (2026-10-20: "motion graphics tutorials on what buttons do what").
  const [screens, setScreens] = useKept<string[]>(keep && `${keep}:screens`, initialScreens ?? [], fresh);
  const [uploading, setUploading] = useState(false);
  // Text or numbers to work from (a post, notes, a table), kept with the brief.
  const [source, setSource] = useKept<string>(keep && `${keep}:source`, "", fresh);
  const [showSource, setShowSource] = useState(false);
  async function addScreens(files: File[]) {
    if (!files.length || !clientId || !activeBrand) return;
    const list = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, MAX_SCREENS - screens.length);
    if (!list.length) { toast.error(screens.length >= MAX_SCREENS ? `Up to ${MAX_SCREENS} screenshots.` : "Use PNG, JPG or WebP screenshots."); return; }
    setUploading(true);
    const added: string[] = [];
    for (const f of list) {
      try {
        const blob = await shrinkScreen(f);
        const path = `images/${clientId}/screen_${Date.now()}_${added.length}.webp`;
        const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: "image/webp" });
        if (error) throw error;
        added.push(supabase.storage.from("assets").getPublicUrl(path).data.publicUrl);
      } catch { toast.error(`Couldn't upload ${f.name}.`); }
    }
    setScreens((x) => [...x, ...added].slice(0, MAX_SCREENS));
    setUploading(false);
    if (added.length && prompt.trim().length < 3) setPrompt(STARTS.find((x) => x.label === "App walkthrough")!.prompt);
  }
  const [open, setOpen] = useState(!!initialPlan);
  const [made, setMade] = useState<AddedMotion[]>([]);
  // Motion Inspo (Kezie, 2026-10-21: "copy the inspiration motion graphics video, create similar
  // things in the brand"): the video is read here, shot by shot; only one still per shot is sent.
  const videoRef = useRef<HTMLInputElement>(null);
  const [copying, setCopying] = useState<number | null>(null);
  // Stop (2026-10-25): ends the request; the server stops its call and nothing is charged.
  const stopRef = useRef<AbortController | null>(null);
  async function copyVideo(f: File | undefined) {
    if (!f || !activeBrand) return;
    if (!f.type.startsWith("video/")) { toast.error("That isn't a video file."); return; }
    if (f.size > 150 * 1024 * 1024) { toast.error("That video is over 150 MB. Trim it first."); return; }
    const url = URL.createObjectURL(f);
    setCopying(0);
    const ac = new AbortController();
    stopRef.current = ac;
    try {
      const r = await readVideo(url, (p) => setCopying(Math.min(0.99, p)));
      setCopying(1);
      const res = await fetch("/api/inspo/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "motion", shots: r.shots.map(({ start, end, data }) => ({ start, end, data })), duration: r.duration, width: r.width, height: r.height, brandId: activeBrand.id, purpose: prompt.trim().slice(0, 300), shape }), signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.spec) throw new Error(data.error || "Couldn't copy that video.");
      const plan = data.spec as MotionSpec;
      const toAdd = plan.scenes.filter((x) => x.template === "story" && x.placeholder && !x.picture).length;
      setSpec(plan); setPictures(data.pictures ?? []); setOpen(true);
      if (data.concept && prompt.trim().length < 3) setPrompt(String(data.concept));
      track("motion_inspo", { shots: r.shots.length, scenes: plan.scenes.length, placeholders: toAdd });
      toast.success(`Made like your video: ${plan.scenes.length} scenes · ${data.credits} credits${toAdd ? ` · ${toAdd} photo${toAdd === 1 ? "" : "s"} to add` : ""}`, { duration: 8000 });
    } catch (e) { if (ac.signal.aborted) toast.info("Stopped. Nothing was charged."); else toast.error(e instanceof Error ? e.message : "Couldn't copy that video."); }
    finally { URL.revokeObjectURL(url); setCopying(null); stopRef.current = null; }
  }
  const [picture, setPicture] = useState<string | null>(pictureId ?? null);
  async function write(text = prompt) {
    if (!activeBrand || text.trim().length < 3) { toast.info("Say what it's for first, e.g. a 6 second intro for our launch."); return; }
    setBusy(true);
    const ac = new AbortController();
    stopRef.current = ac;
    try {
      const brief = text;
      const res = await fetch("/api/editor/motion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, prompt: brief.slice(0, 600), shape, ...(picture ? { pictureId: picture } : {}), ...(screens.length ? { screens } : {}), ...(source.trim() ? { source: source.trim().slice(0, 8000) } : {}) }), signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't plan the motion.");
      setSpec(data.spec); setPictures(data.pictures ?? []); setOpen(true);
      track("motion_planned", { screens: screens.length, source: !!source.trim() });
    } catch (e) { if (ac.signal.aborted) toast.info(`Stopped. Your ${MOTION_CREDITS} credits are back.`); else toast.error(e instanceof Error ? e.message : "Couldn't plan the motion."); }
    finally { setBusy(false); stopRef.current = null; }
  }

  const brand = { name: kit?.name || activeBrand?.brand_name || "Brand", font: kit?.primaryFont ?? null, logoUrl: kit?.logoUrl ?? null, primary: kit?.primaryColor ?? null, secondary: kit?.secondaryColor ?? null };

  return (
    <>
      <div className="ve-bin-h"><b className="text-[13px]">Motion</b>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--s-ai)" }} />}</div>
      <div className="grid gap-2.5 px-3 pb-3">
        <p className="text-[12px]" style={{ color: "var(--s-soft)" }}>Animated titles, numbers, product reveals and end cards in your brand&apos;s font and colours. Every letter comes out exact.</p>
        <textarea className="s-input s-grow" rows={3} style={{ ["--min-lines" as string]: 3, ["--max-lines" as string]: 7 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What's it for? e.g. a 6 second intro for our USDT launch" aria-label="What the motion is for" />
        <div className="flex flex-wrap gap-1">{STARTS.map((s) => <button key={s.label} className="s-chip" aria-pressed={prompt === s.prompt} onClick={() => { setPrompt(s.prompt); if (s.source) setShowSource(true); }} title={s.prompt}>{s.label}</button>)}</div>
        {(showSource || !!source) ? (
          <div className="grid gap-1">
            <textarea className="s-input s-grow" rows={4} style={{ ["--min-lines" as string]: 4, ["--max-lines" as string]: 12 }} value={source} onChange={(e) => setSource(e.target.value.slice(0, 8000))}
              placeholder={STARTS.find((s) => s.prompt === prompt)?.source ?? "Paste a post, notes or numbers (one per line). BlinkSpot uses their words and numbers, nothing invented."} aria-label="Text or numbers to use" />
            <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{source.length ? `${source.length.toLocaleString()} of 8,000 characters. ` : ""}Its words and numbers are used exactly; nothing is invented.</span>
          </div>
        ) : (
          <button className="s-btn ghost sm justify-start" onClick={() => setShowSource(true)}><FileText className="h-3.5 w-3.5" /> Add text or numbers (a post, notes, a table)</button>
        )}
        <div className="grid gap-1.5">
          {!!screens.length && (
            <div className="flex flex-wrap gap-1.5" aria-label="Screenshots">
              {screens.map((u, i) => (
                <span key={u} className="relative block h-14 w-14 rounded-md overflow-hidden" style={{ border: "1px solid var(--s-line)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover object-top" />
                  <button className="absolute top-0.5 right-0.5 rounded-full p-0.5" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }} onClick={() => setScreens((x) => x.filter((y) => y !== u))} aria-label={`Remove screenshot ${i + 1}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          {screens.length < MAX_SCREENS && (
            <label className="s-btn ghost sm justify-start cursor-pointer" aria-disabled={uploading || !clientId || !activeBrand}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {uploading ? "Adding screenshots…" : screens.length ? "Add more screenshots" : "Add app screenshots (for a walkthrough)"}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={uploading || !clientId || !activeBrand} aria-label="Add app screenshots" onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void addScreens(files); }} />
            </label>
          )}
          {!!screens.length && <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>One step per screenshot, in this order. Claude finds the button and says what it does.</span>}
        </div>
        <div className="grid gap-1">
          <button className="s-btn ghost sm justify-between" disabled={copying !== null || !activeBrand} onClick={() => videoRef.current?.click()}>
            <span className="flex items-center gap-2">{copying !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              {copying === null ? "Copy a motion video you like" : copying < 1 ? `Reading its shots · ${Math.round(copying * 100)}%` : `Making it for ${activeBrand?.brand_name ?? "your brand"}…`}</span>
            <span className="cost">up to 30 cr</span>
          </button>
          <input ref={videoRef} type="file" accept="video/*" className="sr-only" aria-label="Motion video to copy" disabled={copying !== null || !activeBrand} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void copyVideo(f); }} />
          <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>The same beats, layout and shapes, in your colours and words. Your photos go in; where none fits, it leaves a space to add one. From TikTok or Instagram: Share, Save video, then pick the file.</span>
        </div>
        {picture && <span className="text-[11.5px] flex items-center gap-1" style={{ color: "var(--s-soft)" }}>Using the picture you picked <button className="underline" onClick={() => setPicture(null)}>(clear)</button></span>}
        <div className="flex gap-2">
          <button className="s-btn ai justify-between flex-1" disabled={busy || !activeBrand || prompt.trim().length < 3} onClick={() => write()}>
            <span className="flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Planning it…" : "Write it"}</span><span className="cost">{MOTION_CREDITS} cr</span>
          </button>
          {(busy || copying !== null) && <button className="s-btn" onClick={() => stopRef.current?.abort()} aria-label="Stop" title="Stop: nothing is charged"><Square className="h-3 w-3" fill="currentColor" /> Stop</button>}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{standalone ? `Shape: ${shape}.` : `Shape follows the editor (${shape}).`} The preview and any changes after that are free.</span>
        {spec && !open && <button className="s-btn sm justify-start" onClick={() => setOpen(true)}><Clapperboard className="h-3.5 w-3.5" /> Back to your motion</button>}
        {made.length > 0 && (
          <div className="grid gap-1 pt-1">
            <span className="s-label" style={{ margin: 0 }}>{standalone ? "Made" : "Added"}</span>
            {made.map((m, i) => standalone ? (
              <div key={i} className="flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>
                <span className="truncate flex-1 min-w-[120px]">{m.name.replace("Motion · ", "")} · {m.seconds.toFixed(1)} s</span>
                <a className="s-btn ghost sm" href={m.url} download target="_blank" rel="noreferrer">Download</a>
                <button className="s-btn ghost sm" onClick={async () => { await queueForEditor([{ caption: m.name, image_urls: [], video_urls: [m.url], reference_image_url: null }]); router.push("/studio/video?tab=editor"); }}>Open in the video editor</button>
              </div>
            ) : <span key={i} className="text-[12px] truncate" style={{ color: "var(--s-soft)" }}>{m.name.replace("Motion · ", "")} · {m.seconds.toFixed(1)} s</span>)}
          </div>
        )}
      </div>
      {spec && (
        <MotionStudio
          open={open} onClose={() => setOpen(false)} spec={spec} onSpec={setSpec} brand={brand} pictures={pictures}
          clientId={clientId} brandId={activeBrand?.id ?? null} rewriting={busy} onRewrite={() => write()} standalone={standalone}
          onAdded={(m, where) => { setMade((x) => [m, ...x]); onAdded(m, where); }}
        />
      )}
    </>
  );
}
