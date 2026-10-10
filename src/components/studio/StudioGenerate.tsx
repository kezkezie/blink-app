"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Film, ImagePlus, LayoutTemplate, Lightbulb, Loader2, RotateCcw, SlidersHorizontal, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { IMAGE_STUDIO_ALLOWED_FORMATS, type AssistedCreativeDirection, type CreativeConcept } from "@/lib/assisted-creation";
import { thumbUrl } from "./media";
import { generateBrandImages, generationErrorMessage, useBrandKit, type GeneratedImage, type ImageEngine } from "./generate-image";

/**
 * Generate, simple by default: say what you want → (optionally) three ideas → pick one → choose the
 * look, size and quality → Generate. Every power control of the classic studio is still one click
 * away under "Pro controls".
 */

const LOOKS = [
  { id: "poster", label: "Ad / poster" },
  { id: "studio", label: "Product shot" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "cinematic", label: "Cinematic" },
  { id: "flatlay", label: "Flat lay" },
  { id: "brand", label: "Logo in scene" },
  { id: "abstract", label: "3D / abstract" },
] as const;
type Look = (typeof LOOKS)[number]["id"];
const FORMATS = ["4:5", "1:1", "9:16", "16:9"] as const;

async function assisted<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/ai/assisted-creation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedFormats: IMAGE_STUDIO_ALLOWED_FORMATS, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "BlinkSpot couldn't think of ideas just now.");
  return data as T;
}

export function StudioGenerate({ initialIdea, autoIdeas, onPro }: { initialIdea?: string; autoIdeas?: boolean; onPro: () => void }) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name);
  const [idea, setIdea] = useState(initialIdea ?? "");
  const [concepts, setConcepts] = useState<CreativeConcept[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [look, setLook] = useState<Look>("poster");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("4:5");
  const [quality, setQuality] = useState<"best" | "fast">("best");
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<Array<{ url: string; preview: string }>>([]);
  const [thinking, setThinking] = useState<"ideas" | "brief" | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  const engine: ImageEngine = quality === "best" ? "nb2" : refs.length ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image";
  const cost = IMAGE_ENGINE_REGISTRY[engine].creditCost * count;
  const ready = brief.trim().length >= 8;

  async function getIdeas(text = idea) {
    if (!activeBrand || text.trim().length < 8) { toast.info("Tell me a bit more first (a few words is enough)."); return; }
    setThinking("ideas");
    setConcepts([]); setPicked(null);
    try {
      const data = await assisted<{ concepts: CreativeConcept[] }>({ operation: "concepts", brandId: activeBrand.id, idea: text.trim() });
      setConcepts((data.concepts ?? []).filter((c) => c.format === "image").slice(0, 3));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No ideas this time.");
    } finally { setThinking(null); }
  }

  // Arriving from Create (or Ask) with an idea: ideas straight away, no second prompt.
  useEffect(() => {
    if (!autoIdeas || autoRan.current || !activeBrand || !initialIdea || initialIdea.trim().length < 8) return;
    autoRan.current = true;
    const t = setTimeout(() => { void getIdeas(initialIdea); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIdeas, activeBrand?.id, initialIdea]);

  async function chooseConcept(c: CreativeConcept) {
    if (!activeBrand) return;
    setPicked(c.id);
    setBrief(`${c.title}. ${c.idea}`);
    setThinking("brief");
    try {
      const data = await assisted<{ direction: AssistedCreativeDirection }>({ operation: "direction", brandId: activeBrand.id, idea: idea.trim() || c.idea, concept: c });
      if (data.direction?.summary) setBrief(data.direction.summary);
      if (data.direction?.style && LOOKS.some((l) => l.id === data.direction.style)) setLook(data.direction.style as Look);
    } catch {
      // the concept text is a fine brief on its own
    } finally {
      setThinking(null);
      setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  }

  function makeItNow() {
    if (idea.trim().length < 3) { toast.info("Type or say what you want first."); return; }
    setBrief(idea.trim());
    setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  async function addRef(file: File | undefined) {
    if (!file || !clientId) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use a JPG, PNG or WebP image."); return; }
    const preview = URL.createObjectURL(file);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `images/${clientId}/studio_ref_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type });
    if (error) { toast.error("Couldn't upload that photo."); return; }
    setRefs((r) => [...r, { url: supabase.storage.from("assets").getPublicUrl(path).data.publicUrl, preview }].slice(0, 3));
  }

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(t); setElapsed(0); };
  }, [busy]);

  async function generate() {
    if (!clientId || !activeBrand || !kit || !ready) return;
    setBusy(true);
    try {
      const saved = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit,
        prompt: brief.trim(), references: refs.map((r) => r.url), engine, aspect: format, style: look, count,
        caption: brief.trim().split(/[.!?]/)[0].slice(0, 120),
      });
      setResults((prev) => [...saved, ...prev]);
      toast.success(`${saved.length} image${saved.length === 1 ? "" : "s"} made and saved to your Library.`);
    } catch (e) {
      toast.error(generationErrorMessage(e), { duration: 10000 });
    } finally { setBusy(false); }
  }

  const name = kit?.name || activeBrand?.brand_name || "your brand";

  return (
    <div className="max-w-[1080px] mx-auto p-4 md:p-8">
      {/* 1 · the idea */}
      <div className="s-card p-3.5" style={{ borderColor: "var(--s-line-2)" }}>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void getIdeas(); }}
          rows={3}
          maxLength={1200}
          placeholder={`What do you want to make for ${name}? e.g. a poster for our weekend lunch special`}
          aria-label="Your idea"
          className="w-full bg-transparent outline-none resize-none text-base leading-relaxed px-1"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button className="s-btn ghost sm" onClick={() => fileRef.current?.click()} title="Your product or a photo to work from">
            <ImagePlus className="h-3.5 w-3.5" /> Add your product photo
          </button>
          {refs.map((r, i) => (
            <span key={r.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.preview} alt="" className="h-8 w-8 rounded-md object-cover" style={{ border: "1px solid var(--s-line-2)" }} />
              <button className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full grid place-items-center" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }} onClick={() => setRefs((x) => x.filter((_, j) => j !== i))} aria-label="Remove photo"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          <div className="flex-1" />
          <button className="s-btn" onClick={() => getIdeas()} disabled={thinking !== null}>
            {thinking === "ideas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" style={{ color: "var(--s-ai)" }} />} Get 3 ideas <span className="cost">free</span>
          </button>
          <button className="s-btn primary" onClick={makeItNow}>Use my words <ArrowRight className="h-4 w-4" /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void addRef(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-xs mt-2 px-1" style={{ color: "var(--s-mute)" }}>
        Have a design you love instead? <Link href="/studio/image?mode=remix" className="underline">Inspo Remix</Link> remakes it for {name}.
      </p>

      {/* 2 · three ideas */}
      {(thinking === "ideas" || concepts.length > 0) && (
        <section className="mt-6">
          <h3 className="s-section-h">Three ideas for {name}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {thinking === "ideas"
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="s-skel" style={{ height: 150 }} />)
              : concepts.map((c) => (
                <button key={c.id} onClick={() => chooseConcept(c)} disabled={thinking === "brief"} className="s-card p-4 text-left flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors"
                  style={picked === c.id ? { borderColor: "var(--s-accent)" } : undefined}>
                  <b className="text-sm font-semibold">{c.title}</b>
                  <span className="text-[13px] leading-relaxed" style={{ color: "var(--s-soft)" }}>{c.idea}</span>
                  <span className="text-xs mt-auto pt-1 flex items-center gap-1" style={{ color: picked === c.id ? "var(--s-accent)" : "var(--s-mute)" }}>
                    {picked === c.id ? (thinking === "brief" ? <><Loader2 className="h-3 w-3 animate-spin" /> Writing the brief…</> : <><Check className="h-3 w-3" /> Using this</>) : "Use this idea →"}
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* 3 · brief + simple settings */}
      {brief && (
        <section ref={briefRef} className="mt-6 s-card p-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="s-label">Your brief</span>
            <textarea className="s-input" rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Your brief" />
            <span className="s-label mt-3">Look</span>
            <div className="flex flex-wrap gap-1.5">{LOOKS.map((l) => <button key={l.id} className="s-chip" aria-pressed={look === l.id} onClick={() => setLook(l.id)}>{l.label}</button>)}</div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <span className="s-label">Size</span>
              <div className="flex flex-wrap gap-1.5">{FORMATS.map((f) => <button key={f} className="s-chip" aria-pressed={format === f} onClick={() => setFormat(f)}>{f}</button>)}</div>
            </div>
            <div>
              <span className="s-label">Quality</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(["best", "fast"] as const).map((q) => {
                  const e: ImageEngine = q === "best" ? "nb2" : refs.length ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image";
                  return (
                    <button key={q} onClick={() => setQuality(q)} className="text-left px-3 py-2 rounded-[10px]"
                      style={{ border: `1px solid ${quality === q ? "var(--s-accent)" : "var(--s-line-2)"}`, background: quality === q ? "color-mix(in oklab, var(--s-accent) 6%, var(--s-bg))" : "var(--s-bg)" }}>
                      <div className="flex justify-between"><b className="text-[13px]">{q === "best" ? "Best" : "Fast"}</b><span className="text-xs mono">{IMAGE_ENGINE_REGISTRY[e].creditCost} cr</span></div>
                      <div className="text-[11px]" style={{ color: "var(--s-mute)" }}>{q === "best" ? "Nano Banana 2 · 4K" : "GPT Image 2"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="s-label">How many</span>
              <div className="flex gap-1.5">{[1, 2, 3, 4].map((n) => <button key={n} className="s-chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}</div>
            </div>
            <button className="s-btn primary lg w-full mt-auto" disabled={!ready || busy || !kit} onClick={generate}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Making it… {elapsed > 0 && `${elapsed} s`}</> : <><Sparkles className="h-4 w-4" /> Generate <span className="cost">{cost} cr</span></>}
            </button>
            <p className="text-[11px] text-center" style={{ color: "var(--s-mute)" }}>Uses your logo, colours and voice automatically. Failed images are refunded.</p>
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="mt-8">
          <h3 className="s-section-h">Made just now</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((r) => (
              <div key={r.url} className="s-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="m" style={{ aspectRatio: "4 / 5" }}><img src={thumbUrl(r.url, 700)} alt="Generated" /></div>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {r.id && <Link href={`/studio/image?mode=design&content=${r.id}`} className="s-btn sm" title="Add your type and logo"><LayoutTemplate className="h-3.5 w-3.5" /> Add type</Link>}
                  {r.id && <Link href={`/studio/image?mode=edit&content=${r.id}`} className="s-btn sm" title="Change colours or objects"><Wand2 className="h-3.5 w-3.5" /></Link>}
                  <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(r.url)}`} className="s-btn sm" title="Animate"><Film className="h-3.5 w-3.5" /></Link>
                  {r.id && <Link href={`/studio/library/${r.id}`} className="s-btn ghost sm">Post</Link>}
                </div>
              </div>
            ))}
          </div>
          <button className="s-btn ghost sm mt-3" onClick={generate} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> More like this · {cost} cr</button>
        </section>
      )}

      <div className="mt-10 pt-4 flex items-center gap-2 text-xs" style={{ borderTop: "1px solid var(--s-line)", color: "var(--s-mute)" }}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Need product drop, grids, style transfer or custom lettering?
        <button className="underline" onClick={onPro}>Pro controls</button>
      </div>
    </div>
  );
}
