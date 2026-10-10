"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Film, ImagePlus, LayoutTemplate, Link2, Loader2, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { remixPrompt } from "@/lib/inspo";
import { ImagePicker } from "./ImagePicker";
import { thumbUrl } from "./media";
import { generateBrandImages, generationErrorMessage, useBrandKit, type GeneratedImage } from "./generate-image";

/**
 * Inspo Remix: drop (or paste a link to) a design you love, and BlinkSpot remakes it for the active
 * brand: same look, the brand's own name, colours and products. Uses the same image workflow, billing
 * and refunds as Image Studio (one call, nothing new on the backend).
 */

const ENGINES = [
  { id: "nb2", label: "Best", hint: "Nano Banana 2 · 4K" },
  { id: "gpt-image-2-image-to-image", label: "Fast", hint: "GPT Image 2" },
] as const;
const FORMATS = ["4:5", "1:1", "9:16", "16:9"] as const;

type Result = GeneratedImage;

export function InspoRemix() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [inspo, setInspo] = useState<{ url: string; file?: File; preview: string } | null>(null);
  const [link, setLink] = useState("");
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("4:5");
  const [engine, setEngine] = useState<(typeof ENGINES)[number]["id"]>("nb2");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cost = IMAGE_ENGINE_REGISTRY[engine].creditCost;

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(t); setElapsed(0); };
  }, [busy]);

  function takeFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use a JPG, PNG or WebP image."); return; }
    if (file.size > 12_000_000) { toast.error("That image is over 12 MB."); return; }
    setInspo({ url: "", file, preview: URL.createObjectURL(file) });
  }

  async function importLink() {
    const url = link.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await fetch("/api/inspo/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't use that link.");
      setInspo({ url: data.url, preview: data.url });
      setLink("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't use that link.");
    } finally { setImporting(false); }
  }

  async function remix() {
    if (!inspo || !clientId || !activeBrand || !kit) return;
    setBusy(true);
    try {
      let refUrl = inspo.url;
      if (!refUrl && inspo.file) {
        const ext = inspo.file.type.split("/")[1].replace("jpeg", "jpg");
        const path = `images/${clientId}/inspo_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("assets").upload(path, inspo.file, { contentType: inspo.file.type });
        if (error) throw new Error("Couldn't upload the image.");
        refUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        setInspo({ ...inspo, url: refUrl });
      }
      const saved = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit,
        prompt: purpose.trim() || `Remix for ${kit.name}`,
        assembledPrompt: remixPrompt(kit.name || activeBrand.brand_name, purpose),
        references: [refUrl], engine, aspect: format, style: "poster",
        caption: purpose.trim() || "Inspo Remix",
      });
      setResults((prev) => [...saved, ...prev]);
      toast.success("Remixed for your brand and saved to the Library.");
    } catch (e) {
      toast.error(generationErrorMessage(e), { duration: 10000 });
      console.error("Inspo Remix failed:", e);
    } finally {
      setBusy(false);
    }
  }

  const name = kit?.name || activeBrand?.brand_name || "your brand";

  return (
    <div className="max-w-[1180px] mx-auto p-4 md:p-8">
      <div className="mb-6">
        <span className="s-badge" style={{ background: "color-mix(in oklab, var(--s-accent) 16%, transparent)", color: "var(--s-accent)" }}>INSPO REMIX</span>
        <h2 className="text-[26px] md:text-[30px] font-semibold tracking-tight mt-3">Seen a post you love? Make it yours.</h2>
        <p className="text-sm mt-1.5 max-w-2xl" style={{ color: "var(--s-soft)" }}>
          Drop in any design from Pinterest, Instagram or anywhere. BlinkSpot keeps the look and layout and remakes it for {name}: your name, your colours, your products. No prompt needed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* 1. the inspo */}
        <div className="s-card p-4">
          <span className="s-label">1 · Your inspo</span>
          {inspo ? (
            <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4 / 5" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspo.preview} alt="Your inspiration" className="w-full h-full object-contain" />
              <button className="s-btn sm absolute top-2 right-2" onClick={() => setInspo(null)} aria-label="Remove the inspiration image"><X className="h-3.5 w-3.5" /> Change</button>
            </div>
          ) : (
            <>
              <button
                className="w-full rounded-xl grid place-items-center gap-2 text-sm transition-colors"
                style={{ aspectRatio: "4 / 3.2", border: `1.5px dashed ${dragOver ? "var(--s-accent)" : "var(--s-line-2)"}`, color: "var(--s-soft)", background: dragOver ? "color-mix(in oklab, var(--s-accent) 5%, transparent)" : "transparent" }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files[0]); }}
              >
                <span className="grid place-items-center gap-2">
                  <ImagePlus className="h-7 w-7" style={{ color: "var(--s-accent)" }} />
                  <b className="font-medium" style={{ color: "var(--s-text)" }}>Drop an image or click to upload</b>
                  <span className="text-xs">JPG, PNG or WebP, up to 12 MB</span>
                </span>
              </button>
              <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); void importLink(); }}>
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--s-mute)" }} />
                  <input className="s-input" style={{ paddingLeft: 30 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="…or paste a Pinterest pin or image link" aria-label="Inspiration link" />
                </div>
                <button className="s-btn" type="submit" disabled={!link.trim() || importing}>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use link"}</button>
              </form>
              <button className="s-btn ghost sm mt-2" onClick={() => setPicking((p) => !p)}><Upload className="h-3.5 w-3.5" /> {picking ? "Hide my Library" : "Pick from my Library"}</button>
              {picking && <div className="mt-3"><ImagePicker allowUpload={false} onPick={(p) => { setInspo({ url: p.url, preview: thumbUrl(p.url, 900) }); setPicking(false); }} /></div>}
            </>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {/* 2. options + go */}
        <div className="s-card p-4 flex flex-col gap-4">
          <div>
            <span className="s-label">2 · What&apos;s it for? (optional)</span>
            <input className="s-input" value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} placeholder={`e.g. Weekend offer: 20% off at ${name}`} aria-label="What is it for" />
            <p className="text-[11px] mt-1.5" style={{ color: "var(--s-mute)" }}>Leave it empty and BlinkSpot uses your brand profile.</p>
          </div>
          <div>
            <span className="s-label">Format</span>
            <div className="flex flex-wrap gap-1.5">{FORMATS.map((f) => <button key={f} className="s-chip" aria-pressed={format === f} onClick={() => setFormat(f)}>{f}</button>)}</div>
          </div>
          <div>
            <span className="s-label">Quality</span>
            <div className="grid grid-cols-2 gap-1.5">
              {ENGINES.map((e) => (
                <button key={e.id} onClick={() => setEngine(e.id)} className="text-left px-3 py-2.5 rounded-[10px]"
                  style={{ border: `1px solid ${engine === e.id ? "var(--s-accent)" : "var(--s-line-2)"}`, background: engine === e.id ? "color-mix(in oklab, var(--s-accent) 6%, var(--s-bg))" : "var(--s-bg)" }}>
                  <div className="flex justify-between"><b className="text-[13px]">{e.label}</b><span className="text-xs mono">{IMAGE_ENGINE_REGISTRY[e.id].creditCost} cr</span></div>
                  <div className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{e.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto grid gap-2">
            <button className="s-btn primary lg w-full" disabled={!inspo || busy || !kit} onClick={remix}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Remaking it for {name}… {elapsed > 0 && `${elapsed} s`}</> : <><Sparkles className="h-4 w-4" /> Remix for {name} <span className="cost">{cost} cr</span></>}
            </button>
            <p className="text-[11px] text-center" style={{ color: "var(--s-mute)" }}>
              {busy ? "Usually under a minute at 4K. It saves to your Library." : "Your inspo is only a reference. The result is a new design with your brand, never a copy of theirs."}
            </p>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <section className="mt-8">
          <h3 className="s-section-h">Your remixes</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((r) => (
              <div key={r.url} className="s-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="m" style={{ aspectRatio: format.replace(":", " / ") }}><img src={thumbUrl(r.url, 700)} alt="Remix" /></div>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {r.id && <Link href={`/studio/image?mode=design&content=${r.id}`} className="s-btn sm"><LayoutTemplate className="h-3.5 w-3.5" /> Add type</Link>}
                  <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(r.url)}`} className="s-btn sm"><Film className="h-3.5 w-3.5" /> Animate</Link>
                  {r.id && <Link href={`/studio/library/${r.id}`} className="s-btn ghost sm">Post</Link>}
                </div>
              </div>
            ))}
          </div>
          <button className="s-btn ghost sm mt-3" onClick={remix} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> Another version · {cost} cr</button>
        </section>
      )}
    </div>
  );
}
