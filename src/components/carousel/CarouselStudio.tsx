"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Thumbnail } from "@remotion/player";
import { ArrowLeft, ArrowRight, Check, GalleryHorizontal, ImagePlus, Images, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { Modal } from "@/components/studio/Modal";
import { ImagePicker } from "@/components/studio/ImagePicker";
import { useBrandKit, generateBrandImages, generationErrorMessage } from "@/components/studio/generate-image";
import { ensureMotionFont } from "@/components/studio/motion/MotionStudio";
import { CarouselSlide, type SlideBrand } from "./CarouselSlide";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { paletteFor, type Palette } from "@/lib/motion/spec";
import { routerTopic } from "@/lib/generate-prompt";
import { MAX_SLIDES, PLAN_CREDITS, SLIDE_SIZE, seamlessPlan, seamlessPrompt, sliceRects, type SlideShape, type TopicCarousel, type TopicSlide } from "@/lib/carousel";

/**
 * Make a carousel (2026-10-16). Seamless: one wide picture, cut into 2 or 3 slides so it flows as
 * you swipe. From a topic: Claude writes the outline (4 credits), our templates draw exact text in
 * the brand's font and colours (free, in this browser). From pictures: up to 10 from the Library or
 * this device, cropped to one shape. The result is one Library post with its slides in order.
 */
type Way = "topic" | "seamless" | "pictures";
const WAYS: Array<{ id: Way; label: string; line: string }> = [
  { id: "topic", label: "From a topic", line: "Tips, steps or a story, one idea per slide" },
  { id: "seamless", label: "Seamless", line: "One wide picture that flows across slides" },
  { id: "pictures", label: "From pictures", line: "Up to 10 of yours, in your order" },
];

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => resolve(im); im.onerror = () => reject(new Error("picture")); im.src = url;
});
const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.92));

/** A picture cropped (centred) to the slide shape. */
async function cropTo(url: string, shape: SlideShape) {
  const im = await loadImage(url);
  const { w, h } = SLIDE_SIZE[shape];
  const [r] = sliceRects(im.naturalWidth, im.naturalHeight, 1, shape);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(im, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  return canvasBlob(c);
}

export function CarouselStudio({ initialTopic }: { initialTopic?: string }) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name ?? undefined);
  const name = activeBrand?.brand_name || "your brand";
  const [way, setWay] = useState<Way>("topic");
  const [shape, setShape] = useState<SlideShape>("4:5");
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [count, setCount] = useState(6);
  const [plan, setPlan] = useState<TopicCarousel | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [paletteEdit, setPaletteEdit] = useState<Palette | null>(null);
  const [brief, setBrief] = useState(initialTopic ?? "");
  const [panels, setPanels] = useState(3);
  const [pics, setPics] = useState<Array<{ url: string; title: string }>>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; slides: string[] } | null>(null);

  const palette = useMemo(() => paletteEdit ?? paletteFor({}, { primary: kit?.primaryColor, secondary: kit?.secondaryColor }), [paletteEdit, kit]);
  const brand: SlideBrand = { name: kit?.name || name, font: kit?.primaryFont ?? null, logoUrl: kit?.logoUrl ?? null, handle };
  const { w, h } = SLIDE_SIZE[shape];
  const seamless = seamlessPlan(panels, shape);
  const nb2 = IMAGE_ENGINE_REGISTRY.nb2.creditCost;

  async function upload(blob: Blob, i: number) {
    const path = `images/${clientId}/carousel_${Date.now()}_${i}.jpg`;
    const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw new Error("upload");
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }
  async function save(slides: string[], kind: Way, caption: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.from("content").insert({
      client_id: clientId, brand_id: activeBrand!.id, content_type: "carousel", status: "draft", image_urls: slides,
      caption: caption.slice(0, 2000) || "Carousel", ai_model: kind === "pictures" ? null : kind === "topic" ? "carousel-templates" : "nano-banana-2",
      creation_metadata: { operation: "carousel", kind, shape, slides: slides.length, ...extra },
    }).select("id").single();
    if (error || !data) throw new Error("save");
    setMade({ id: data.id as string, slides });
    toast.success(`Carousel ready: ${slides.length} slides in your Library`);
  }

  async function writeOutline() {
    if (!activeBrand || topic.trim().length < 4) return;
    setBusy("Writing the slides…");
    try {
      const res = await fetch("/api/carousel/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, topic, slides: count }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't write the carousel.");
      setPlan(d.carousel); setHandle(d.handle ?? null); setMade(null);
      await ensureMotionFont(kit?.primaryFont, clientId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't write the carousel."); }
    finally { setBusy(null); }
  }
  const setSlide = (i: number, patch: Partial<TopicSlide>) => setPlan((p) => (p ? { ...p, slides: p.slides.map((s, j) => (j === i ? ({ ...s, ...patch } as TopicSlide) : s)) } : p));

  async function renderTopic() {
    if (!plan || !clientId) return;
    try {
      await ensureMotionFont(kit?.primaryFont, clientId);
      const { renderStillOnWeb } = await import("@remotion/web-renderer");
      const urls: string[] = [];
      for (let i = 0; i < plan.slides.length; i++) {
        setBusy(`Drawing slide ${i + 1} of ${plan.slides.length}…`);
        const still = await renderStillOnWeb({
          composition: { id: "carousel-slide", component: CarouselSlide, width: w, height: h, fps: 30, durationInFrames: 1, defaultProps: { slide: plan.slides[i], index: i, total: plan.slides.length, palette, brand } },
          frame: 0, inputProps: { slide: plan.slides[i], index: i, total: plan.slides.length, palette, brand }, licenseKey: "free-license",
        });
        urls.push(await upload(await still.blob({ format: "jpeg", quality: 0.92 }), i));
      }
      setBusy("Saving…");
      await save(urls, "topic", plan.caption || topic, { topic, outline: plan.slides });
    } catch (e) { toast.error(e instanceof Error && e.message === "upload" ? "Couldn't save a slide. Try again." : "Couldn't draw the slides in this browser. Try Chrome or Edge."); }
    finally { setBusy(null); }
  }

  async function makeSeamless() {
    if (!clientId || !activeBrand || !kit || brief.trim().length < 8) return;
    setBusy("Making one wide picture…");
    try {
      const [wide] = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit, prompt: routerTopic(brief), assembledPrompt: seamlessPrompt(brief, seamless.slides),
        engine: "nb2", aspect: seamless.aspect, style: "plain", count: 1, caption: brief.slice(0, 120), save: false,
      });
      setBusy("Cutting it into slides…");
      const im = await loadImage(wide.url);
      const urls: string[] = [];
      for (const [i, r] of sliceRects(im.naturalWidth, im.naturalHeight, seamless.slides, shape).entries()) {
        const c = document.createElement("canvas"); c.width = r.out.w; c.height = r.out.h;
        c.getContext("2d")!.drawImage(im, r.sx, r.sy, r.sw, r.sh, 0, 0, r.out.w, r.out.h);
        urls.push(await upload(await canvasBlob(c), i));
      }
      setBusy("Saving…");
      await save(urls, "seamless", brief, { panorama: wide.url });
    } catch (e) { toast.error(e instanceof Error && e.message === "picture" ? "Couldn't cut the picture. Try again." : generationErrorMessage(e)); }
    finally { setBusy(null); }
  }

  async function addPicture(p: { url: string; title: string }) {
    setPicking(false);
    if (pics.length >= MAX_SLIDES) { toast.error(`Up to ${MAX_SLIDES} slides.`); return; }
    if (p.url.startsWith("blob:")) {
      try {
        const blob = await (await fetch(p.url)).blob();
        const path = `images/${clientId}/carousel_src_${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`;
        const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw error;
        p = { url: supabase.storage.from("assets").getPublicUrl(path).data.publicUrl, title: p.title };
      } catch { toast.error("Couldn't add that photo."); return; }
    }
    setPics((x) => [...x, p]);
  }
  const movePic = (i: number, by: number) => setPics((x) => { const n = [...x]; const [p] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, i + by)), 0, p); return n; });
  async function makeFromPictures() {
    if (pics.length < 2 || !clientId) return;
    try {
      const urls: string[] = [];
      for (const [i, p] of pics.entries()) { setBusy(`Fitting slide ${i + 1} of ${pics.length}…`); urls.push(await upload(await cropTo(p.url, shape), i)); }
      setBusy("Saving…");
      await save(urls, "pictures", pics.map((p) => p.title).filter(Boolean)[0] || "Carousel");
    } catch { toast.error("Couldn't fit one of the pictures. Try another."); }
    finally { setBusy(null); }
  }

  const field = (label: string, value: string | undefined, on: (v: string) => void, area = false) => (
    <label className="grid gap-1"><span className="text-[11px]" style={{ color: "var(--s-soft)" }}>{label}</span>
      {area ? <textarea className="s-input s-grow" style={{ ["--min-lines" as string]: 2, ["--max-lines" as string]: 5 }} value={value ?? ""} onChange={(e) => on(e.target.value)} aria-label={label} />
        : <input className="s-input" value={value ?? ""} onChange={(e) => on(e.target.value)} aria-label={label} />}
    </label>
  );

  if (!activeBrand) return <div className="s-empty"><h3>Pick a brand first</h3></div>;
  return (
    <div className="max-w-[1180px] mx-auto p-4 md:p-6 grid gap-5">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><GalleryHorizontal className="h-5 w-5" style={{ color: "var(--s-ai)" }} /> Carousel</h2>
        <p className="text-sm mt-1" style={{ color: "var(--s-soft)" }}>Slides people swipe through, in {name}&apos;s look. It lands in your Library as one post; open any slide to edit it on its own.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="s-seg" role="tablist" aria-label="How to make it">{WAYS.map((x) => <button key={x.id} role="tab" aria-selected={way === x.id} onClick={() => { setWay(x.id); setMade(null); }} title={x.line}>{x.label}</button>)}</div>
        <div className="s-seg" role="group" aria-label="Slide shape">{(["4:5", "1:1"] as const).map((s) => <button key={s} aria-pressed={shape === s} onClick={() => setShape(s)}>{s === "4:5" ? "Portrait 4:5" : "Square 1:1"}</button>)}</div>
        <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{WAYS.find((x) => x.id === way)!.line}</span>
      </div>

      {way === "topic" && (
        <div className="grid gap-4">
          <div className="s-card p-4 grid gap-3">
            <textarea className="s-input s-grow" style={{ ["--min-lines" as string]: 2, ["--max-lines" as string]: 5 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={`What's it about? e.g. 5 ways to keep oyster mushrooms fresh for longer`} aria-label="What the carousel is about" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Slides</span>
              {[4, 5, 6, 7, 8, 10].map((n) => <button key={n} className="s-chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}
              <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>cover and end card included</span>
              <div className="flex-1" />
              <button className="s-btn ai" disabled={!!busy || topic.trim().length < 4} onClick={writeOutline}>{busy === "Writing the slides…" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {plan ? "Write again" : "Write the slides"} <span className="cost">{PLAN_CREDITS} cr</span></button>
            </div>
          </div>
          {plan && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="s-label !mb-0">Colours</span>
                {(["background", "text", "accent"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>
                    <input type="color" value={palette[k]} onChange={(e) => setPaletteEdit(paletteFor({ ...palette, [k]: e.target.value.toUpperCase() }, { primary: kit?.primaryColor, secondary: kit?.secondaryColor }))} className="h-7 w-9 rounded-md cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} aria-label={`${k} colour`} />{k[0].toUpperCase() + k.slice(1)}
                  </label>
                ))}
                <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Change any words below; the preview follows. Drawing the slides is free.</span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
                {plan.slides.map((s, i) => (
                  <div key={i} className="s-card p-2 grid gap-2 content-start">
                    <div className="rounded-lg overflow-hidden" style={{ aspectRatio: `${w} / ${h}` }}>
                      <Thumbnail component={CarouselSlide} compositionWidth={w} compositionHeight={h} frameToDisplay={0} durationInFrames={1} fps={30}
                        inputProps={{ slide: s, index: i, total: plan.slides.length, palette, brand }} style={{ width: "100%", height: "100%" }} />
                    </div>
                    {s.kind === "cover" && <>{field("Headline", s.title, (v) => setSlide(i, { title: v }), true)}{field("Smaller line", s.sub, (v) => setSlide(i, { sub: v || undefined }))}</>}
                    {s.kind === "point" && <>{field("Point", s.title, (v) => setSlide(i, { title: v }), true)}{field("More", s.body, (v) => setSlide(i, { body: v || undefined }), true)}</>}
                    {s.kind === "stat" && <>{field("Number", s.value, (v) => setSlide(i, { value: v }))}{field("What it means", s.label, (v) => setSlide(i, { label: v }))}</>}
                    {s.kind === "quote" && <>{field("Quote", s.quote, (v) => setSlide(i, { quote: v }), true)}{field("Who said it", s.by, (v) => setSlide(i, { by: v || undefined }))}</>}
                    {s.kind === "end" && <>{field("Closing line", s.title, (v) => setSlide(i, { title: v }))}{field("Call to action", s.cta, (v) => setSlide(i, { cta: v || undefined }))}</>}
                  </div>
                ))}
              </div>
              <button className="s-btn primary lg w-fit" disabled={!!busy} onClick={renderTopic}>{busy && busy !== "Writing the slides…" ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><Check className="h-4 w-4" /> Make the carousel <span className="cost">free</span></>}</button>
            </>
          )}
        </div>
      )}

      {way === "seamless" && (
        <div className="s-card p-4 grid gap-3">
          <textarea className="s-input s-grow" style={{ ["--min-lines" as string]: 3, ["--max-lines" as string]: 6 }} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What does the wide picture show? e.g. our three mushroom kinds laid out on a long timber table, morning light, the kraft packs at the far right" aria-label="The wide picture" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Slides</span>
            {[2, 3].map((n) => <button key={n} className="s-chip" aria-pressed={panels === n} onClick={() => setPanels(n)}>{n}</button>)}
            <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>One {seamless.aspect} picture, cut into {seamless.slides} {shape} slides ({seamless.width}×{seamless.height}). Best quality, so your logo and products stay exact.</span>
            <div className="flex-1" />
            <button className="s-btn primary" disabled={!!busy || brief.trim().length < 8 || !kit} onClick={makeSeamless}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><Sparkles className="h-4 w-4" /> Make it <span className="cost">{nb2} cr</span></>}</button>
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>It's made as one continuous panorama (no panels), so the scene flows as people swipe. Add your words per slide afterwards: open a slide and use the Editor.</p>
        </div>
      )}

      {way === "pictures" && (
        <div className="s-card p-4 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {pics.map((p, i) => (
              <div key={`${p.url}-${i}`} className="grid gap-1 justify-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.title} className="rounded-lg object-cover" style={{ width: 110, aspectRatio: `${w} / ${h}`, border: "1px solid var(--s-line)" }} />
                <div className="flex gap-1">
                  <button className="s-btn ghost sm" disabled={i === 0} onClick={() => movePic(i, -1)} aria-label="Move left"><ArrowLeft className="h-3.5 w-3.5" /></button>
                  <button className="s-btn ghost sm" onClick={() => setPics((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                  <button className="s-btn ghost sm" disabled={i === pics.length - 1} onClick={() => movePic(i, 1)} aria-label="Move right"><ArrowRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {pics.length < MAX_SLIDES && (
              <button className="rounded-lg grid place-items-center gap-1 text-[12px]" style={{ width: 110, aspectRatio: `${w} / ${h}`, border: "1px dashed var(--s-line-2)", color: "var(--s-soft)" }} onClick={() => setPicking(true)}>
                <ImagePlus className="h-5 w-5" /> Add a picture
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{pics.length}/{MAX_SLIDES} slides · each is fitted to {shape}, centred.</span>
            <div className="flex-1" />
            <button className="s-btn primary" disabled={!!busy || pics.length < 2} onClick={makeFromPictures}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><Images className="h-4 w-4" /> Make the carousel <span className="cost">free</span></>}</button>
          </div>
        </div>
      )}

      {made && (
        <div className="s-card p-4 grid gap-3" style={{ borderColor: "color-mix(in oklab, var(--s-ok) 35%, var(--s-line))" }}>
          <div className="flex flex-wrap items-center gap-2"><b className="text-[14px]">Your carousel · {made.slides.length} slides</b><div className="flex-1" /><Link href={`/studio/library/${made.id}`} className="s-btn sm">Open the post</Link></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {made.slides.map((u, i) => (
              <div key={u} className="grid gap-1 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Slide ${i + 1}`} className="rounded-lg object-cover" style={{ width: 150, aspectRatio: `${w} / ${h}` }} />
                <Link href={`/studio/image?mode=design&content=${made.id}&slide=${i}`} className="s-btn ghost sm justify-center"><Pencil className="h-3.5 w-3.5" /> Edit slide {i + 1}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} label="Add a picture" width={860} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">Add a picture</b><button className="s-btn ghost sm" onClick={() => setPicking(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <ImagePicker onPick={(p) => void addPicture({ url: p.url, title: p.title })} />
      </Modal>
    </div>
  );
}
