"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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

/** Ask BlinkSpot can open this with a brief, screenshots and a shape (a walkthrough from a chat). */
function fromLink(params: URLSearchParams) {
  const brief = params.get("brief")?.slice(0, 600) || null;
  let screens: string[] = [];
  try { const s = JSON.parse(params.get("screens") ?? "[]"); if (Array.isArray(s)) screens = s.filter((u): u is string => typeof u === "string" && /^https:\/\/[^/]+\/storage\/v1\/object\/public\/assets\/images\//.test(u)).slice(0, 6); } catch { /* none */ }
  const shape = (["9:16", "1:1", "16:9"] as const).find((s) => s === params.get("shape")) ?? "9:16";
  return { brief, screens, shape };
}

function MotionPage() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const params = useSearchParams();
  const [link] = useState(() => fromLink(new URLSearchParams(params.toString())));
  const [shape, setShape] = useState<MotionShape>(link.shape);
  return (
    <div className="max-w-[760px] mx-auto pt-2 md:pt-6 pb-10">
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Motion graphics · for {activeBrand?.brand_name ?? "your brand"}</p>
      <h2 className="text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight">Animated titles, numbers and product reveals</h2>
      <p className="text-[14px] mt-2" style={{ color: "var(--s-soft)" }}>Say what it&apos;s for and BlinkSpot plans it in your brand&apos;s font and colours. Every word comes out exact. Preview and change it for free, then make it.</p>
      <div className="s-seg mt-5" role="tablist" aria-label="Shape">
        {SHAPES.map((s) => <button key={s.id} role="tab" aria-selected={shape === s.id} onClick={() => setShape(s.id)} title={s.line}>{s.label} <span className="hidden sm:inline" style={{ color: "var(--s-mute)" }}>· {s.line}</span></button>)}
      </div>
      <div className="s-card mt-4 py-2 ve" style={{ minHeight: 0 }}>
        <MotionBin key={shape} clientId={clientId} shape={shape} standalone onAdded={() => {}} initialPrompt={link.brief} initialScreens={link.screens.length ? link.screens : null} />
      </div>
    </div>
  );
}

export default function MotionRoute() {
  return <Suspense fallback={<div className="p-6"><div className="s-skel h-80" /></div>}><MotionPage /></Suspense>;
}
