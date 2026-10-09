"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutTemplate, Sparkles, Wand2, ArrowLeft, X, Shuffle } from "lucide-react";
import { InspoRemix } from "@/components/studio/InspoRemix";
import { supabase } from "@/lib/supabase";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useAssistedCreationStore } from "@/app/store/useAssistedCreationStore";
import ClassicImageStudio from "@/app/dashboard/generate/page";
import { SemanticImageEditor } from "@/components/image/SemanticImageEditor";
import { PosterDesigner } from "@/components/studio/PosterDesigner";
import { ImagePicker, type PickedImage } from "@/components/studio/ImagePicker";
import { cleanCaption, resolveMedia } from "@/components/studio/media";
import type { Content } from "@/types/database";

/**
 * Image Studio = one place for the image jobs:
 *   Inspo Remix  drop a design you love, get the same look for your brand (one click)
 *   Generate  the classic studio (assisted creation, engines, styles, references), unchanged inside
 *   Edit      X-ray a photo into objects, change colours, materials and text, re-render with
 *             Nano Banana 2 or GPT Image 2 (the classic JSON editor)
 *   Design    set real type and the logo over a photo, pick colours from the photo, export sizes
 */
type Mode = "remix" | "generate" | "edit" | "design";
const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles; hint: string }> = [
  { id: "remix", label: "Inspo Remix", icon: Shuffle, hint: "Drop a design you love, get it for your brand" },
  { id: "generate", label: "Generate", icon: Sparkles, hint: "Make new images from an idea" },
  { id: "edit", label: "Edit with AI", icon: Wand2, hint: "Change a photo you have" },
  { id: "design", label: "Design", icon: LayoutTemplate, hint: "Type and logo on a photo · free" },
];

async function loadPicked(contentId: string): Promise<PickedImage | null> {
  const { data } = await supabase.from("content").select("id, caption, image_urls, video_urls, reference_image_url").eq("id", contentId).maybeSingle();
  if (!data) return null;
  const m = resolveMedia(data as unknown as Content);
  return m.url && !m.isVideo ? { url: m.url, contentId: data.id, title: cleanCaption(data.caption) || "Image" } : null;
}

function ImageStudioInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { activeBrand } = useBrandStore();
  const setIdea = useAssistedCreationStore((s) => s.setIdea);
  const requestAutoDevelop = useAssistedCreationStore((s) => s.requestAutoDevelop);
  const hydrated = useAssistedCreationStore((s) => s.hasHydrated);
  // No mode in the link: a typed idea opens Generate, otherwise Inspo Remix (the fastest way in).
  const initialMode = (["remix", "generate", "edit", "design"] as const).find((m) => m === params.get("mode")) ?? (params.get("prompt") ? "generate" : "remix");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [loadingPick, setLoadingPick] = useState(!!params.get("content"));
  const [designKey, setDesignKey] = useState(0);
  // Where the prompt came from, read once on arrival (the query is cleared after the hand-off).
  const [handoff, setHandoff] = useState<string | null>(() => (params.get("prompt") ? (params.get("from") === "ask" ? "Ask BlinkSpot" : "Create") : null));

  // ?content= opens Edit or Design on a Library image.
  useEffect(() => {
    const id = params.get("content");
    if (!id) return;
    loadPicked(id).then((p) => { setPicked(p); setLoadingPick(false); setDesignKey((k) => k + 1); });
  }, [params]);

  // ?prompt= (from Create or Ask BlinkSpot) becomes the idea in Generate's assisted creation.
  useEffect(() => {
    const prompt = params.get("prompt")?.slice(0, 1000);
    if (!prompt || !activeBrand || !hydrated) return;
    setIdea(activeBrand.id, prompt);
    requestAutoDevelop(activeBrand.id);
    router.replace("/studio/image", { scroll: false });
  }, [params, activeBrand, hydrated, setIdea, requestAutoDevelop, router]);

  if (!activeBrand) {
    return <div className="p-6"><div className="s-empty"><h3>Pick a brand first</h3><p className="text-sm">Image Studio works for one brand at a time. Use the switcher at the top right.</p></div></div>;
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 56px)" }}>
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderBottom: "1px solid var(--s-line)", minHeight: 53 }}>
        <div className="s-seg" role="tablist" aria-label="Image Studio mode">
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)} title={m.hint}>
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs hidden sm:inline" style={{ color: "var(--s-mute)" }}>{MODES.find((m) => m.id === mode)?.hint}</span>
      </div>

      {mode === "remix" && <InspoRemix />}

      {mode === "generate" && (
        <div className="p-4 md:p-6 mx-auto w-full max-w-[1320px]">
          {handoff && (
            <div className="s-card px-4 py-3 mb-4 flex flex-wrap items-center gap-2 text-sm" role="status" style={{ borderColor: "color-mix(in oklab, var(--s-accent) 35%, var(--s-line))" }}>
              <b className="font-medium">Working on your idea from {handoff}.</b>
              <span style={{ color: "var(--s-soft)" }}>BlinkSpot is writing three directions below. Pick one, or open <b>Customize advanced details</b> to set it up yourself.</span>
              <button className="s-btn ghost sm ml-auto" onClick={() => setHandoff(null)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <ClassicImageStudio />
        </div>
      )}

      {mode === "edit" && (
        loadingPick ? <div className="p-6"><div className="s-skel h-80" /></div> : picked?.contentId ? (
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <button className="s-btn ghost sm" onClick={() => setPicked(null)}><ArrowLeft className="h-3.5 w-3.5" /> Pick another</button>
              <span className="text-sm truncate" style={{ color: "var(--s-soft)" }}>{picked.title}</span>
            </div>
            <SemanticImageEditor key={picked.contentId} contentId={picked.contentId} initialImageUrl={picked.url} />
          </div>
        ) : (
          <div className="max-w-[980px] mx-auto p-4 md:p-8">
            <h2 className="text-xl font-semibold mb-1">Which photo?</h2>
            <p className="text-sm mb-5" style={{ color: "var(--s-soft)" }}>The AI reads the photo into objects (colour, material, text). Change what you want, then it re-renders with Nano Banana 2 or GPT Image 2.</p>
            <ImagePicker allowUpload={false} onPick={setPicked} />
          </div>
        )
      )}

      {mode === "design" && (loadingPick ? <div className="p-6"><div className="s-skel h-80" /></div> : <PosterDesigner key={designKey} initial={picked} />)}
    </div>
  );
}

export default function StudioImagePage() {
  return (
    <Suspense fallback={<div className="p-6"><div className="s-skel h-64" /></div>}>
      <ImageStudioInner />
    </Suspense>
  );
}
