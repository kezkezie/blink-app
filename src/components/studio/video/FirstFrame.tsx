"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { generateBrandImages, generationErrorMessage, nearestImageAspect, useBrandKit, type ImageEngine } from "../generate-image";
import { thumbUrl } from "../media";
import { supabase } from "@/lib/supabase";
import { canvasSafe } from "../editor/util";

/** The image workflow only trusts the user's own storage and Library; copy anything else in first. */
async function ownedRef(url: string, clientId: string) {
  if (url.includes(`/storage/v1/object/public/assets/images/${clientId}/`)) return url;
  const blob = await (await fetch(canvasSafe(url))).blob();
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  const path = `images/${clientId}/firstframe_ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (error) throw new Error("Couldn't prepare your photo for the preview.");
  return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
}

/**
 * "See the first frame before you pay for the video": a cheap still of the shot (6 credits fast,
 * 18 best) built from the user's photos and description. Approving it makes it the start frame of
 * the render, so the video begins exactly where the user agreed. Kezie approved 2026-10-10.
 */

export { nearestImageAspect } from "../generate-image";

export type FirstFrameState = { url: string | null; approved: boolean };

export function FirstFrame({
  references, describe, aspect, onApprove, state, setState, compact = false,
}: {
  /** The user's photos, product first (and the person/model second when there is one). */
  references: string[];
  /** What the shot is, written for a still: subject, setting, light, camera. */
  describe: string;
  aspect: string;
  onApprove: (url: string) => void;
  state: FirstFrameState;
  setState: (s: FirstFrameState) => void;
  compact?: boolean;
}) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name);
  const [busy, setBusy] = useState<null | "fast" | "best" | "edit">(null);
  const [tweak, setTweak] = useState("");

  const ready = references.length > 0 && describe.trim().length > 3 && !!kit && !!clientId && !!activeBrand;
  async function make(kind: "fast" | "best" | "edit") {
    if (!ready || !clientId || !activeBrand || !kit) return;
    setBusy(kind);
    try {
      const engine: ImageEngine = kind === "best" ? "nb2" : "gpt-image-2-image-to-image";
      const editing = kind === "edit" && state.url;
      const refs = editing ? [await ownedRef(state.url!, clientId)] : await Promise.all(references.map((r) => ownedRef(r, clientId)));
      const [out] = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit,
        prompt: editing
          ? tweak.trim()
          : `The first frame of a video. ${describe.trim()} Image 1 is the exact product; keep its shape, colours and label exactly.${references.length > 1 ? " Image 2 is the person; keep their face and look." : ""} Photographic, sharp, ready to animate.`,
        references: refs,
        engine: editing ? "nb2" : engine,
        aspect: nearestImageAspect(aspect),
        style: "lifestyle",
        caption: "First frame preview",
        mode: editing ? "edit" : "standard",
        save: false,
      });
      setState({ url: out.url, approved: false });
      setTweak("");
    } catch (e) {
      toast.error(generationErrorMessage(e), { duration: 9000 });
    } finally { setBusy(null); }
  }

  const fast = IMAGE_ENGINE_REGISTRY["gpt-image-2-image-to-image"].creditCost;
  const best = IMAGE_ENGINE_REGISTRY.nb2.creditCost;

  if (!state.url) {
    return (
      <div className="grid gap-2">
        <div className="text-[12px] leading-snug" style={{ color: "var(--s-soft)" }}>
          <b style={{ color: "var(--s-text)" }}>Step 1 · See the first frame.</b> A still of your shot costs a few credits; you only pay for the video once it looks right.
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button className="s-btn primary" disabled={!ready || !!busy} onClick={() => make("fast")}>
            {busy === "fast" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Preview · {fast} cr
          </button>
          <button className="s-btn" disabled={!ready || !!busy} onClick={() => make("best")} title="Nano Banana 2 at 4K">
            {busy === "best" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Best · {best} cr
          </button>
        </div>
        {!ready && <p className="text-[11px]" style={{ color: "var(--s-mute)" }}>Add your photo and describe the shot first.</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: nearestImageAspect(aspect).replace(":", " / "), maxHeight: compact ? 220 : 320 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(state.url, 900)} alt="First frame preview" className="w-full h-full object-cover" />
        {state.approved && <span className="s-badge ok absolute left-2 top-2"><Check className="inline h-3 w-3 -mt-px" /> START FRAME</span>}
      </div>
      {!state.approved ? (
        <>
          <button className="s-btn primary" onClick={() => { onApprove(state.url!); setState({ ...state, approved: true }); }}>
            <Check className="h-4 w-4" /> Use this frame
          </button>
          <div className="flex gap-1.5">
            <input className="s-input" style={{ height: 32 }} value={tweak} onChange={(e) => setTweak(e.target.value)} placeholder="Change it: e.g. warmer light, closer" aria-label="Change the first frame" onKeyDown={(e) => { if (e.key === "Enter" && tweak.trim()) void make("edit"); }} />
            <button className="s-btn ai" disabled={!tweak.trim() || !!busy} onClick={() => make("edit")} title={`${best} credits`}>{busy === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}</button>
          </div>
          <button className="s-btn ghost sm" disabled={!!busy} onClick={() => make("fast")}>
            {busy === "fast" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Another version · {fast} cr
          </button>
        </>
      ) : (
        <button className="s-btn ghost sm" onClick={() => setState({ url: null, approved: false })}><RotateCcw className="h-3.5 w-3.5" /> Make a different first frame</button>
      )}
    </div>
  );
}
