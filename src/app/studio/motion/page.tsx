"use client";

import { useState } from "react";
import "@/components/layout/video-editor.css";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { MotionBin } from "@/components/studio/motion/MotionBin";
import type { MotionShape } from "@/lib/motion/spec";

/**
 * Motion graphics on their own (Kezie, 2026-10-20: "it needs its own place within Create"): the
 * same planner and templates as the video editor's Motion panel, with the shape picked here, and
 * the result saved to the Library to download or put in the video editor.
 */
const SHAPES: Array<{ id: MotionShape; label: string; line: string }> = [
  { id: "9:16", label: "9:16", line: "Reels, TikTok, Stories" },
  { id: "1:1", label: "1:1", line: "Feed posts" },
  { id: "16:9", label: "16:9", line: "YouTube, websites" },
];

export default function MotionPage() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [shape, setShape] = useState<MotionShape>("9:16");
  return (
    <div className="max-w-[760px] mx-auto pt-2 md:pt-6 pb-10">
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Motion graphics · for {activeBrand?.brand_name ?? "your brand"}</p>
      <h2 className="text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight">Animated titles, numbers and product reveals</h2>
      <p className="text-[14px] mt-2" style={{ color: "var(--s-soft)" }}>Say what it&apos;s for and BlinkSpot plans it in your brand&apos;s font and colours. Every word comes out exact. Preview and change it for free, then make it.</p>
      <div className="s-seg mt-5" role="tablist" aria-label="Shape">
        {SHAPES.map((s) => <button key={s.id} role="tab" aria-selected={shape === s.id} onClick={() => setShape(s.id)} title={s.line}>{s.label} <span className="hidden sm:inline" style={{ color: "var(--s-mute)" }}>· {s.line}</span></button>)}
      </div>
      <div className="s-card mt-4 py-2 ve" style={{ minHeight: 0 }}>
        <MotionBin key={shape} clientId={clientId} shape={shape} standalone onAdded={() => {}} />
      </div>
    </div>
  );
}
