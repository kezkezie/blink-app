"use client";

import { useRef, useState } from "react";
import { FolderOpen, ImagePlus, Loader2, MessageSquareQuote, Sparkles, X } from "lucide-react";
import type { VideoStudio } from "@/components/video/useVideoStudio";
import { ImagePicker } from "../ImagePicker";

/**
 * One setup for the single shots (Product shot / reveal, Creator talking, Try-on): what goes in
 * the shot (photos), what happens (a sentence, or "Write it for me", or a one-click example), and a
 * few tappable chips for camera, motion and sound. Format, length and quality live in the panel on
 * the right. Same state and engine as the classic setups (useVideoStudio).
 */

type Slot = { key: "primary" | "secondary"; label: string; hint: string; required: boolean };
type ShotConfig = { slots: Slot[]; placeholder: string; examples: string[]; chips: Record<string, string[]>; voice?: boolean };

export const SHOT_CONFIG: Record<string, ShotConfig> = {
  showcase: {
    slots: [{ key: "primary", label: "Your product", hint: "One clear photo. A plain or transparent background works best.", required: true }],
    placeholder: "What should the camera do? e.g. a slow orbit around the bottle on wet black stone, rim light, drops of water",
    examples: [
      "Slow 360° orbit around the product on a glossy black floor, soft rim light, light mist",
      "The camera pushes in slowly while warm morning light sweeps across the product",
      "Product on a marble kitchen counter, a hand reaches in and picks it up, shallow depth of field",
    ],
    chips: { Camera: ["Slow orbit", "Smooth dolly-in", "Top-down", "Macro close-up"], Motion: ["Slow motion", "Zero gravity", "Light sweep"], Sound: ["Whoosh", "Bass drop", "Soft ambience"] },
  },
  logo_reveal: {
    slots: [{ key: "primary", label: "Your product or logo", hint: "A PNG with a transparent background gives the cleanest reveal.", required: true }],
    placeholder: "How should it appear? e.g. the bottle rises out of liquid gold, then the camera settles on the label",
    examples: [
      "The product bursts out of a cloud of coloured powder and lands centre frame",
      "Dark studio; a cover slides off the product in one smooth pull; a light sweeps across it",
      "The product assembles from floating pieces and locks into place with a soft glow",
    ],
    chips: { Reveal: ["Cover pulls off", "Rises from liquid", "Builds from pieces", "Light sweep"], Camera: ["Heroic low angle", "Fast snap-zoom", "Slow push-in"], Sound: ["Whoosh", "Bass drop", "Shimmer"] },
  },
  ugc: {
    slots: [
      { key: "primary", label: "Your product", hint: "The thing they are holding or talking about.", required: true },
      { key: "secondary", label: "The creator (optional)", hint: "A clear, front-facing photo of the person. Leave it empty and BlinkSpot casts someone.", required: false },
    ],
    placeholder: "What do they do and say? e.g. she holds the jar to the camera and says: \"This is the only cream that works for me\"",
    examples: [
      "Selfie video in a bright bathroom; she holds the product up and says: \"Okay, I finally found the one.\"",
      "He unboxes the product at his desk, smiles at the camera and says: \"Look how small this is.\"",
      "Walking down a busy street, she taps the product and says: \"Three weeks in, still obsessed.\"",
    ],
    chips: { Camera: ["Selfie handheld", "Talking to camera", "Close-up on product"], Sound: ["Street noise", "Room tone", "Upbeat music"] },
    voice: true,
  },
  clothing: {
    slots: [
      { key: "primary", label: "The garment", hint: "A flat lay or a photo on a hanger or mannequin.", required: true },
      { key: "secondary", label: "The model (optional)", hint: "Full body or mid-shot. Leave it empty and BlinkSpot picks a model.", required: false },
    ],
    placeholder: "Where and how do they wear it? e.g. she walks towards the camera on a sunny street, the fabric moves in the wind",
    examples: [
      "Runway walk towards the camera, soft studio light, the fabric flows with every step",
      "Turns slowly on the spot in a minimal studio so we see the front, side and back",
      "Golden-hour street, walking past shop windows, wind catching the fabric",
    ],
    chips: { Camera: ["Full-body tracking", "Slow turn", "Drone flyover"], Motion: ["Wind in the fabric", "Slow motion"], Sound: ["Camera shutter", "City ambience"] },
  },
};

export function ShotSetup({ v }: { v: VideoStudio }) {
  const config = SHOT_CONFIG[v.selectedMode] ?? SHOT_CONFIG.showcase;
  const [picking, setPicking] = useState<"primary" | "secondary" | null>(null);
  const primaryRef = useRef<HTMLInputElement>(null);
  const secondaryRef = useRef<HTMLInputElement>(null);

  const preview = (key: Slot["key"]) => (key === "primary" ? v.primaryPreview : v.secondaryPreview);
  const clear = (key: Slot["key"]) => {
    if (key === "primary") { v.setPrimaryFile(null); v.setPrimaryPreview(null); } else { v.setSecondaryFile(null); v.setSecondaryPreview(null); }
  };
  const hasChip = (c: string) => v.prompt.toLowerCase().includes(c.toLowerCase());
  const toggleChip = (c: string) => {
    if (hasChip(c)) v.setPrompt(v.prompt.replace(new RegExp(`(,\\s*)?${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "").trim());
    else v.setPrompt(v.prompt.trim() ? `${v.prompt.trim().replace(/[.,]$/, "")}, ${c.toLowerCase()}` : c);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* what's in the shot */}
      <div className="grid gap-3 content-start" style={{ gridTemplateColumns: config.slots.length > 1 ? "1fr 1fr" : "1fr" }}>
        {config.slots.map((slot) => {
          const src = preview(slot.key);
          const ref = slot.key === "primary" ? primaryRef : secondaryRef;
          return (
            <div key={slot.key} className="s-card p-3 grid gap-2 content-start">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[13px]">{slot.label}</b>
                {slot.required && !src && <span className="s-badge warn">NEEDED</span>}
              </div>
              {src ? (
                <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "1 / 1" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={slot.label} className="w-full h-full object-contain" />
                  <button className="s-btn sm absolute top-2 right-2" onClick={() => clear(slot.key)} aria-label={`Remove ${slot.label}`}><X className="h-3.5 w-3.5" /> Change</button>
                </div>
              ) : (
                <button
                  className="s-drop rounded-xl grid place-items-center text-center p-4 gap-1.5"
                  style={{ aspectRatio: "1 / 1" }}
                  onClick={() => ref.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f && ref.current) { const dt = new DataTransfer(); dt.items.add(f); ref.current.files = dt.files; ref.current.dispatchEvent(new Event("change", { bubbles: true })); }
                  }}
                >
                  <span className="grid place-items-center gap-1.5">
                    <ImagePlus className="h-6 w-6" style={{ color: slot.required ? "var(--s-accent)" : "var(--s-soft)" }} />
                    <b className="text-[13px] font-medium" style={{ color: "var(--s-text)" }}>Drop or click to upload</b>
                    <span className="text-[11.5px] leading-snug" style={{ color: "var(--s-mute)" }}>{slot.hint}</span>
                  </span>
                </button>
              )}
              {!src && <button className="s-btn ghost sm" onClick={() => setPicking(slot.key)}><FolderOpen className="h-3.5 w-3.5" /> From my Library</button>}
              <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => v.handleFileSelect(e, slot.key)} />
            </div>
          );
        })}
      </div>

      {/* what happens */}
      <div className="s-card p-4 grid gap-3 content-start">
        <div className="flex items-center justify-between gap-2">
          <b className="text-[13px]">What happens in the shot</b>
          <button className="s-btn ai sm" onClick={v.handleAISuggest} disabled={v.isSuggesting}>
            {v.isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Write it for me
          </button>
        </div>
        <textarea className="s-input" rows={5} value={v.prompt} onChange={(e) => v.setPrompt(e.target.value)} placeholder={config.placeholder} aria-label="What happens in the shot" />
        <div>
          <span className="s-label">Or start from an example</span>
          <div className="grid gap-1.5">
            {config.examples.map((ex) => (
              <button key={ex} className="s-example text-left text-[12.5px] px-3 py-2 rounded-lg" onClick={() => v.setPrompt(ex)}>{ex}</button>
            ))}
          </div>
        </div>
        {Object.entries(config.chips).map(([group, chips]) => (
          <div key={group}>
            <span className="s-label">{group}</span>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => <button key={c} className="s-chip" aria-pressed={hasChip(c)} onClick={() => toggleChip(c)}>{c}</button>)}
            </div>
          </div>
        ))}
        {config.voice && (
          <button className="s-btn ghost sm justify-start" onClick={() => v.setPrompt(`${v.prompt.trim()}${v.prompt.trim() ? "\n" : ""}They say: "Type what they say here"`)}>
            <MessageSquareQuote className="h-3.5 w-3.5" /> Add a spoken line
          </button>
        )}
      </div>

      {picking && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setPicking(null)}>
          <div className="s-card p-4 w-full max-w-[860px] max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><b className="text-sm">Pick from your Library</b><button className="s-btn ghost sm" onClick={() => setPicking(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <ImagePicker allowUpload={false} onPick={(p) => {
              if (picking === "primary") { v.setPrimaryFile(null); v.setPrimaryPreview(p.url); } else { v.setSecondaryFile(null); v.setSecondaryPreview(p.url); }
              setPicking(null);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
