"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adaptRecipePrompt } from "@/lib/examples/adapt";
import { toast } from "sonner";
import { LayoutTemplate, Sparkles, Wand2, ArrowLeft, Shuffle, GalleryHorizontal } from "lucide-react";
import { CarouselStudio } from "@/components/carousel/CarouselStudio";
import { slidesOf } from "@/lib/carousel";
import { InspoRemix } from "@/components/studio/InspoRemix";
import { StudioGenerate, type GenerateAutoRun } from "@/components/studio/StudioGenerate";
import { supabase } from "@/lib/supabase";
import { useBrandStore } from "@/app/store/useBrandStore";
import ClassicImageStudio from "@/app/dashboard/generate/page";
import { XrayEditor } from "@/components/studio/library/XrayEditor";
import dynamic from "next/dynamic";
import { ImagePicker, type PickedImage } from "@/components/studio/ImagePicker";
import { cleanCaption, resolveMedia } from "@/components/studio/media";
import type { Content } from "@/types/database";

// fabric.js is browser-only and heavy: load the editor on demand.
const ImageEditor = dynamic(() => import("@/components/studio/editor/ImageEditor").then((m) => m.ImageEditor), {
  ssr: false,
  loading: () => <div className="p-6"><div className="s-skel h-80" /></div>,
});

/**
 * Image Studio = one place for the image jobs:
 *   Inspo Remix  drop a design you love, get the same look for your brand (one click)
 *   Generate     idea → three ideas → brief → look, size, quality → images (simple by default)
 *   Pro controls the classic studio (modes, engines, styles, references), unchanged inside
 *   Edit      X-ray a photo into objects, change colours, materials and text, re-render with
 *             Nano Banana 2 or GPT Image 2 (the classic JSON editor)
 *   Editor       layers, shapes, pen, brush, eraser, text and AI on the canvas (remove background,
 *                swap a face, edit with words, vectorise, draw a vector/logo); Ask BlinkSpot can edit it
 */
type Mode = "remix" | "generate" | "carousel" | "edit" | "design" | "pro";
const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles; hint: string }> = [
  { id: "remix", label: "Inspo Remix", icon: Shuffle, hint: "Drop a design you love, get it for your brand" },
  { id: "generate", label: "Generate", icon: Sparkles, hint: "Make new images from an idea" },
  { id: "carousel", label: "Carousel", icon: GalleryHorizontal, hint: "Slides people swipe: from a topic, one wide picture, or your pictures" },
  { id: "edit", label: "Edit with AI", icon: Wand2, hint: "Change a photo you have" },
  { id: "design", label: "Editor", icon: LayoutTemplate, hint: "Layers, shapes, pen, text and AI edits" },
];

async function loadPicked(contentId: string, slide?: number): Promise<(PickedImage & { brandId: string | null }) | null> {
  const { data } = await supabase.from("content").select("id, brand_id, caption, image_urls, video_urls, reference_image_url").eq("id", contentId).maybeSingle();
  if (!data) return null;
  // A carousel's slide: that picture, and the Editor can save back to it (2026-10-16).
  const slides = slidesOf(data.image_urls);
  if (slide !== undefined && slides[slide]) return { url: slides[slide], contentId: data.id, title: `${cleanCaption(data.caption) || "Carousel"} · slide ${slide + 1}`, slide, brandId: (data.brand_id as string | null) ?? null };
  const m = resolveMedia(data as unknown as Content);
  return m.url && !m.isVideo ? { url: m.url, contentId: data.id, title: cleanCaption(data.caption) || "Image", brandId: (data.brand_id as string | null) ?? null } : null;
}

function ImageStudioInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { activeBrand } = useBrandStore();
  // No mode in the link: a typed idea opens Generate, otherwise Inspo Remix (the fastest way in).
  const initialMode = (["remix", "generate", "carousel", "edit", "design", "pro"] as const).find((m) => m === params.get("mode")) ?? (params.get("prompt") ? "generate" : "remix");
  // An idea from Create or Ask, read once (the query is cleared after arrival).
  // A recipe from an example is adapted to this brand (its brand rules and name taken out; QA-018).
  const [recipe] = useState(() => adaptRecipePrompt(params.get("prompt") ?? "", activeBrand?.brand_name));
  const initialIdea = recipe.text;
  // Ask BlinkSpot asked to make it now: count, quality and shape come with the idea (2026-10-17).
  const [autoRun] = useState<GenerateAutoRun | undefined>(() => {
    if (params.get("auto") !== "1" || !params.get("prompt")) return undefined;
    const q = params.get("quality");
    return { count: Number(params.get("count")) || 1, quality: q === "fast" || q === "draft" ? q : "best", format: params.get("format") ?? undefined };
  });
  useEffect(() => {
    if (recipe.from) toast.info(`This recipe was made for ${recipe.from}. We've put your brand in; change the product and the words to yours.`, { duration: 9000 });
  }, [recipe.from]);
  const [mode, setMode] = useState<Mode>(initialMode);
  // Links within Image Studio (a result's "Change colours or objects", "Add type") only change the
  // query; follow them (2026-10-14: the buttons on Generate's results did nothing).
  const linkedMode = (["remix", "generate", "carousel", "edit", "design", "pro"] as const).find((m) => m === params.get("mode"));
  const [seenMode, setSeenMode] = useState(linkedMode);
  if (linkedMode !== seenMode) {
    setSeenMode(linkedMode);
    if (linkedMode) setMode(linkedMode);
  }
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [loadingPick, setLoadingPick] = useState(!!params.get("content"));
  const [designKey, setDesignKey] = useState(0);

  // ?content= opens Edit or Design on a Library image.
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  useEffect(() => {
    const id = params.get("content");
    if (!id) return;
    const slideParam = params.get("slide");
    const slide = slideParam !== null && /^\d{1,2}$/.test(slideParam) ? Number(slideParam) : undefined;
    loadPicked(id, slide).then((p) => { setPickedBrand(p?.brandId ?? null); setPicked(p); setLoadingPick(false); setDesignKey((k) => k + 1); });
  }, [params]);
  // A post opens in its own brand, so AI edits use that brand's name, rules and logo (2026-10-13: a
  // NUF FARMS poster edited while "mama njeri kitchen" was active got Mama Njeri's name painted on).
  // Once per post: switching brand by hand afterwards is left alone.
  const availableBrands = useBrandStore((s) => s.availableBrands);
  const activeBrandId = useBrandStore((s) => s.activeBrand?.id ?? null);
  const switchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!pickedBrand || switchedFor.current === pickedBrand) return;
    const own = availableBrands.find((b) => b.id === pickedBrand);
    if (!own) return;
    switchedFor.current = pickedBrand;
    if (useBrandStore.getState().activeBrand?.id === own.id) return;
    useBrandStore.getState().setActiveBrand(own);
    toast.info(`Opened in ${own.brand_name}, the brand this post belongs to.`);
  }, [pickedBrand, availableBrands]);

  // Pictures picked in the Library for one carousel (2026-10-28), read once like the idea.
  const [pictureIds] = useState(() => (params.get("pictures") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 40));
  useEffect(() => {
    if (params.get("prompt")) router.replace("/studio/image", { scroll: false });
    else if (params.get("pictures")) router.replace("/studio/image?mode=carousel", { scroll: false });
  }, [params, router]);

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

      {mode === "generate" && <StudioGenerate initialIdea={initialIdea} autoIdeas={!!initialIdea && !autoRun} autoRun={autoRun} />}

      {mode === "carousel" && <CarouselStudio initialTopic={initialIdea} initialPictures={pictureIds} />}

      {mode === "pro" && (
        <div className="p-4 md:p-6 mx-auto w-full max-w-[1320px]">
          <button className="s-btn ghost sm mb-3" onClick={() => setMode("generate")}><ArrowLeft className="h-3.5 w-3.5" /> Back to simple Generate</button>
          <ClassicImageStudio />
        </div>
      )}

      {mode === "edit" && (
        loadingPick ? <div className="p-6"><div className="s-skel h-80" /></div> : picked?.contentId ? (
          <div className="p-4 md:p-6">
            {/* The rebuilt Edit with AI (2026-10-15); the classic SemanticImageEditor stays on /dashboard/content/[id]/edit. */}
            <XrayEditor
              key={picked.contentId} id={picked.contentId} onBack={() => setPicked(null)}
              onContinue={(contentId, url) => setPicked({ contentId, url, title: picked.title.startsWith("Edited · ") ? picked.title : `Edited · ${picked.title}` })}
            />
          </div>
        ) : (
          <div className="max-w-[980px] mx-auto p-4 md:p-8">
            <h2 className="text-xl font-semibold mb-1">Which photo?</h2>
            <p className="text-sm mb-5" style={{ color: "var(--s-soft)" }}>The AI scans the photo once (saved, so coming back is free). Then change the words, a colour or a material, swap a thing for a Library picture or a product, or remove it. The result is a new post; your original stays.</p>
            <ImagePicker allowUpload={false} onPick={setPicked} />
          </div>
        )
      )}

      {/* One editor per brand (2026-10-20): switching brand saves this brand's design and opens that brand's last one.
          A Library picture opens in its own brand; after a manual switch the other brand's work shows instead. */}
      {mode === "design" && (loadingPick ? <div className="p-6"><div className="s-skel h-80" /></div> : (
        <ImageEditor key={`${designKey}:${activeBrandId ?? "none"}`} initial={picked && (!pickedBrand || pickedBrand === activeBrandId) ? picked : null} />
      ))}
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
