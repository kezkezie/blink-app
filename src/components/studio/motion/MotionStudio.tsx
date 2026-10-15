"use client";

import { useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/studio/Modal";
import { MotionVideo, type MotionBrand } from "@/components/motion/MotionVideo";
import {
  MOTION_FPS, MOTION_TEMPLATES, motionTitle, paletteFor, sizeFor, totalFrames, totalSeconds, validateMotionSpec,
  type MotionScene, type MotionSpec,
} from "@/lib/motion/spec";

/**
 * The motion studio (2026-10-15): the live preview (Remotion Player), every word, number, colour
 * and length editable for free, then "Add to timeline": rendered on this computer (Remotion's web
 * renderer), saved to the Library and placed on the timeline. A lower third renders see-through.
 */
export type AddedMotion = { url: string; name: string; seconds: number; kind: MotionSpec["kind"]; contentId: string | null };
export type MotionPlace = "start" | "end" | "playhead";

const fontsLoaded = new Map<string, Promise<void>>();
/** The brand font, from Google Fonts or one this account uploaded, loaded before preview and render. */
export function ensureMotionFont(family: string | null | undefined, clientId: string | null) {
  if (!family || typeof document === "undefined") return Promise.resolve();
  const known = fontsLoaded.get(family);
  if (known) return known;
  const p = (async () => {
    await new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    if (clientId) {
      const { data } = await supabase.storage.from("assets").list(`uploads/${clientId}/fonts`, { limit: 100 });
      const file = (data ?? []).find((f) => f.name.replace(/^\d+_/, "").replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ").trim().toLowerCase() === family.toLowerCase());
      if (file) {
        const url = supabase.storage.from("assets").getPublicUrl(`uploads/${clientId}/fonts/${file.name}`).data.publicUrl;
        try { const face = new FontFace(family, `url(${url})`); await face.load(); document.fonts.add(face); } catch { /* a broken file is skipped */ }
      }
    }
    await Promise.all(["500", "600", "700", "800"].map((w) => document.fonts.load(`${w} 64px "${family}"`).catch(() => [])));
  })();
  fontsLoaded.set(family, p);
  return p;
}

export function MotionStudio({ open, onClose, spec, onSpec, brand, pictures, clientId, brandId, onAdded, onRewrite, rewriting }: {
  open: boolean; onClose: () => void; spec: MotionSpec; onSpec: (s: MotionSpec) => void; brand: MotionBrand & { primary?: string | null; secondary?: string | null };
  pictures: Array<{ url: string; title: string }>; clientId: string | null; brandId: string | null;
  onAdded: (m: AddedMotion, where: MotionPlace) => void; onRewrite: () => void; rewriting: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const { width, height } = sizeFor(spec.shape);
  const frames = Math.max(1, totalFrames(spec));
  const props = useMemo(() => ({ spec, brand }), [spec, brand]);

  const setScene = (i: number, patch: Partial<MotionScene>) => onSpec({ ...spec, scenes: spec.scenes.map((s, j) => (j === i ? ({ ...s, ...patch } as MotionScene) : s)) });
  const move = (i: number, by: number) => {
    const next = [...spec.scenes];
    const [s] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, s);
    onSpec({ ...spec, scenes: next });
  };
  const remove = (i: number) => spec.scenes.length > 1 && onSpec({ ...spec, scenes: spec.scenes.filter((_, j) => j !== i) });
  const setColour = (k: keyof MotionSpec["palette"], v: string) => onSpec({ ...spec, palette: paletteFor({ ...spec.palette, [k]: v }, { primary: brand.primary, secondary: brand.secondary }) });

  async function add(where: MotionPlace) {
    // The browser's edits are checked the same way the server checked Claude's plan.
    const checked = validateMotionSpec(spec, { shape: spec.shape, brand: { primary: brand.primary, secondary: brand.secondary }, images: pictures.map((p) => p.url) });
    if (!checked) { toast.error("Each scene needs its words. Fill them in and try again."); return; }
    abort.current = new AbortController();
    setBusy("Getting the font ready…"); setProgress(0);
    try {
      await ensureMotionFont(brand.font, clientId);
      setBusy("Rendering on this computer…");
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const overlay = checked.kind === "overlay";
      const composition = { id: "blink-motion", component: MotionVideo, durationInFrames: totalFrames(checked), fps: MOTION_FPS, width, height, defaultProps: { spec: checked, brand } };
      const render = (container: "mp4" | "webm") => renderMediaOnWeb({
        // BlinkSpot qualifies for Remotion's free licence (up to 3 people; Kezie approved Remotion 2026-10-15).
        composition, inputProps: { spec: checked, brand }, container, muted: true, signal: abort.current!.signal, licenseKey: "free-license",
        ...(container === "webm" ? { videoCodec: "vp8" as const, transparent: overlay } : {}),
        onProgress: ({ progress: p }) => setProgress(Math.round(p * 100)),
      });
      let container: "mp4" | "webm" = overlay ? "webm" : "mp4";
      let result;
      try { result = await render(container); } catch (e) {
        if (overlay || abort.current.signal.aborted) throw e;
        container = "webm"; // no H.264 encoder in this browser: WebM plays and exports the same
        result = await render(container);
      }
      const blob = await result.getBlob();
      if (!blob.size) throw new Error("empty");
      setBusy("Saving to your Library…");
      const path = `videos/${clientId}/motion_${Date.now()}.${container}`;
      const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: `video/${container}` });
      if (error) throw new Error("upload");
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      const name = motionTitle(checked);
      const { data: row } = await supabase.from("content").insert({
        client_id: clientId, brand_id: brandId, content_type: "video", status: "draft", caption: name,
        video_urls: [url], image_urls: [], ai_model: "remotion",
        creation_metadata: { operation: "motion", kind: checked.kind, seconds: totalSeconds(checked), spec: checked },
      }).select("id").single();
      onAdded({ url, name, seconds: totalSeconds(checked), kind: checked.kind, contentId: (row?.id as string | undefined) ?? null }, where);
      toast.success(`${name.replace("Motion · ", "")}: on the timeline and in your Library`);
      onClose();
    } catch (e) {
      console.error("motion render failed", e);
      if (abort.current?.signal.aborted) toast.message("Render stopped.");
      else toast.error(e instanceof Error && e.message === "upload" ? "Couldn't save the clip. Try again." : "Couldn't render here. Motion renders in Chrome, Edge, Firefox or Safari 26 and newer.");
    } finally { setBusy(null); abort.current = null; }
  }

  const label = (s: MotionScene) => MOTION_TEMPLATES.find((t) => t.id === s.template)?.label ?? s.template;
  const field = (lab: string, value: string | undefined, on: (v: string) => void, opts: { area?: boolean; placeholder?: string } = {}) => (
    <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>{lab}</span>
      {opts.area
        ? <textarea className="s-input" rows={2} value={value ?? ""} onChange={(e) => on(e.target.value)} placeholder={opts.placeholder} aria-label={lab} />
        : <input className="s-input" value={value ?? ""} onChange={(e) => on(e.target.value)} placeholder={opts.placeholder} aria-label={lab} />}
    </label>
  );

  return (
    <Modal open={open} onClose={() => (busy ? abort.current?.abort() : onClose())} label="Motion" width={1080} padded>
      <div className="flex items-center gap-2 mb-3">
        <b className="text-sm">Motion</b>
        <span className="s-badge">{spec.kind === "overlay" ? "Over your video" : "Full frame"} · {spec.shape} · {totalSeconds(spec).toFixed(1)} s</span>
        <div className="flex-1" />
        <button className="s-btn ghost sm" disabled={!!busy || rewriting} onClick={onRewrite}>{rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Write again <span className="cost">4 cr</span></button>
        <button className="s-btn ghost sm" onClick={() => (busy ? abort.current?.abort() : onClose())} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] items-start">
        <div className="grid gap-2">
          <div className="relative grid place-items-center">
            {/* Sized to the shape: a 9:16 motion is as tall as the window allows, not a strip in a black box. */}
            <div className="rounded-xl overflow-hidden" style={{ background: spec.kind === "overlay" ? "linear-gradient(135deg,#3a4250,#1b1f26)" : "#000", aspectRatio: `${width} / ${height}`, ...(height > width ? { height: "min(72dvh, 820px)" } : { width: "100%" }), maxWidth: "100%" }}>
              <Player
                component={MotionVideo} inputProps={props} durationInFrames={frames} fps={MOTION_FPS}
                compositionWidth={width} compositionHeight={height} controls loop autoPlay acknowledgeRemotionLicense
                style={{ width: "100%", height: "100%" }}
              />
            </div>
            {busy && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(12,13,15,.7)" }}>
                <div className="grid justify-items-center gap-2 text-center">
                  <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--s-ai)" }} />
                  <b className="text-[14px]">{busy}</b>
                  {busy.startsWith("Rendering") && <span className="mono text-[12px]">{progress}% · keep this tab open</span>}
                  <button className="s-btn sm" onClick={() => abort.current?.abort()}>Stop</button>
                </div>
              </div>
            )}
          </div>
          <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Changes show straight away and are free. Every letter is drawn exactly, in your brand&apos;s font and colours.</span>
        </div>

        <div className="flex flex-col gap-3 min-h-0" style={{ maxHeight: "min(72dvh, 820px)" }}>
        <div className="grid gap-3 content-start overflow-y-auto pr-1 min-h-0 flex-1" style={{ maskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)" }}>
          <div className="grid gap-1.5">
            <span className="s-label" style={{ margin: 0 }}>Colours</span>
            <div className="flex items-center gap-3">
              {(["background", "text", "accent"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>
                  <input type="color" value={spec.palette[k]} onChange={(e) => setColour(k, e.target.value.toUpperCase())} className="h-7 w-9 rounded-md cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} aria-label={`${k} colour`} />
                  {k === "background" ? (spec.kind === "overlay" ? "Bar" : "Background") : k === "text" ? "Text" : "Accent"}
                </label>
              ))}
            </div>
          </div>
          {spec.scenes.map((s, i) => (
            <div key={i} className="rounded-xl p-3 grid gap-2" style={{ border: "1px solid var(--s-line)" }}>
              <div className="flex items-center gap-1.5">
                <b className="text-[13px]">{i + 1}. {label(s)}</b>
                <div className="flex-1" />
                <label className="flex items-center gap-1 text-[11.5px]" style={{ color: "var(--s-soft)" }}>
                  <input type="number" step={0.5} min={1} max={10} className="s-input" style={{ width: 64, height: 28 }} value={s.seconds} onChange={(e) => setScene(i, { seconds: Number(e.target.value) || s.seconds })} aria-label={`Scene ${i + 1} seconds`} /> s
                </label>
                {spec.scenes.length > 1 && (
                  <>
                    <button className="s-btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button className="s-btn ghost sm" disabled={i === spec.scenes.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button className="s-btn ghost sm" onClick={() => remove(i)} aria-label="Remove scene"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
              {s.template === "kinetic-headline" && (<>
                {field("Words", s.words, (v) => setScene(i, { words: v }), { area: true })}
                {field("Smaller line", s.sub, (v) => setScene(i, { sub: v || undefined }), { placeholder: "Optional" })}
                <div className="s-seg" role="group" aria-label="How words arrive">{(["word", "line", "slam"] as const).map((e) => <button key={e} aria-pressed={s.enter === e} onClick={() => setScene(i, { enter: e })}>{e === "word" ? "Word by word" : e === "line" ? "Line by line" : "Slam"}</button>)}</div>
              </>)}
              {s.template === "stat" && (<>
                <div className="grid grid-cols-[70px_minmax(0,1fr)_70px] gap-2">
                  {field("Before", s.prefix, (v) => setScene(i, { prefix: v || undefined }), { placeholder: "$" })}
                  <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>Number</span><input className="s-input" type="number" value={s.value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setScene(i, { value: v, decimals: Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 0) }); }} aria-label="Number" /></label>
                  {field("After", s.suffix, (v) => setScene(i, { suffix: v || undefined }), { placeholder: "%" })}
                </div>
                {field("Label", s.label, (v) => setScene(i, { label: v }))}
              </>)}
              {s.template === "product-reveal" && (<>
                {field("Name", s.name, (v) => setScene(i, { name: v }))}
                <div className="grid grid-cols-2 gap-2">{field("Price", s.price, (v) => setScene(i, { price: v || undefined }), { placeholder: "Optional" })}{field("Line", s.tagline, (v) => setScene(i, { tagline: v || undefined }), { placeholder: "Optional" })}</div>
                {pictures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pictures.slice(0, 10).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <button key={p.url} title={p.title} onClick={() => setScene(i, { image: p.url })} className="h-12 w-12 rounded-lg overflow-hidden" style={{ border: `2px solid ${s.image === p.url ? "var(--s-ai)" : "var(--s-line)"}` }}><img src={p.url} alt={p.title} className="h-full w-full object-cover" /></button>
                    ))}
                  </div>
                )}
              </>)}
              {s.template === "logo-sting" && field("Tagline", s.tagline, (v) => setScene(i, { tagline: v || undefined }), { placeholder: "Optional" })}
              {s.template === "lower-third" && (<>{field("Title", s.title, (v) => setScene(i, { title: v }))}{field("Smaller line", s.subtitle, (v) => setScene(i, { subtitle: v || undefined }), { placeholder: "Optional" })}</>)}
              {s.template === "end-card" && (<>
                {field("Call to action", s.cta, (v) => setScene(i, { cta: v }))}
                <div className="grid grid-cols-2 gap-2">{field("Handle", s.handle, (v) => setScene(i, { handle: v || undefined }), { placeholder: "@yourbrand" })}{field("Website", s.website, (v) => setScene(i, { website: v || undefined }), { placeholder: "Optional" })}</div>
              </>)}
            </div>
          ))}
        </div>
          <div className="grid gap-2 pt-1 shrink-0" style={{ borderTop: "1px solid var(--s-line)" }}>
            {spec.kind === "overlay" ? (
              <button className="s-btn primary justify-between" disabled={!!busy || !clientId} onClick={() => add("playhead")}><span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add over the video at the playhead</span><span className="cost">free</span></button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button className="s-btn primary" disabled={!!busy || !clientId} onClick={() => add("start")}><Plus className="h-4 w-4" /> Add at the start</button>
                <button className="s-btn" disabled={!!busy || !clientId} onClick={() => add("end")}><Plus className="h-4 w-4" /> Add at the end</button>
              </div>
            )}
            <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Renders on this computer in a few seconds, then lands on the timeline and in your Library.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
