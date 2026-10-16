"use client";

import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import type { TopicSlide } from "@/lib/carousel";
import { contrast, type Palette } from "@/lib/motion/spec";

/**
 * One slide of a topic carousel (2026-10-16), drawn as a still by Remotion so every word is exact,
 * in the brand's font, colours and logo. Same drawing rules as the motion kit (no z-index, no
 * backdrop blur; text gets line-height so descenders aren't clipped).
 */
export type SlideBrand = { name: string; font?: string | null; logoUrl?: string | null; handle?: string | null };
export type SlideProps = { slide: TopicSlide; index: number; total: number; palette: Palette; brand: SlideBrand };

const stack = (font?: string | null) => `${font ? `"${font}", ` : ""}Inter, "Helvetica Neue", Arial, sans-serif`;
const on = (bg: string) => (contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF");
/** a mixed toward b by t, as hex (the still renderer draws plain colours and gradients). */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function CarouselSlide({ slide, index, total, palette, brand }: SlideProps) {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 100;
  const font = stack(brand.font);
  const base = { fontFamily: font, color: palette.text, lineHeight: 1.25, paddingBottom: u * 0.4 } as const;
  const last = index === total - 1;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${palette.background} 0%, ${palette.background} 60%, ${mix(palette.background, palette.accent, 0.18)} 100%)`, padding: u * 8, display: "flex", flexDirection: "column" }}>
      {/* top row: logo, slide number */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: u * 7 }}>
        {brand.logoUrl
          ? <Img src={brand.logoUrl} crossOrigin="anonymous" style={{ height: u * 6.5, width: u * 18, objectFit: "contain", objectPosition: "left" }} />
          : <div style={{ ...base, fontWeight: 800, fontSize: u * 3.6 }}>{brand.name}</div>}
        <div style={{ ...base, fontWeight: 700, fontSize: u * 3.6, opacity: 0.85 }}>{index + 1}/{total}</div>
      </div>

      {/* Points, numbers and quotes start at the same height on every slide, so nothing jumps as
          you swipe; the cover and end card sit in the middle. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: slide.kind === "cover" || slide.kind === "end" ? "center" : "flex-start", paddingTop: slide.kind === "cover" || slide.kind === "end" ? 0 : u * 12, gap: u * 3, textWrap: "balance" }}>
        {slide.kind === "cover" && (<>
          <div style={{ height: u * 1.4, width: u * 16, background: palette.accent, borderRadius: u }} />
          <div style={{ ...base, fontWeight: 800, fontSize: u * (slide.title.length > 40 ? 8.6 : 10.5), lineHeight: 1.1, letterSpacing: -u * 0.2 }}>{slide.title}</div>
          {slide.sub && <div style={{ ...base, fontWeight: 500, fontSize: u * 4.4, opacity: 0.85 }}>{slide.sub}</div>}
        </>)}
        {slide.kind === "point" && (<>
          <div style={{ ...base, fontWeight: 800, fontSize: u * 13, lineHeight: 1.05, color: palette.accent }}>{String(slide.number ?? index).padStart(2, "0")}</div>
          <div style={{ ...base, fontWeight: 800, fontSize: u * (slide.title.length > 45 ? 6.4 : 7.6), lineHeight: 1.15 }}>{slide.title}</div>
          {slide.body && <div style={{ ...base, fontWeight: 500, fontSize: u * 4.2, lineHeight: 1.4, opacity: 0.88 }}>{slide.body}</div>}
        </>)}
        {slide.kind === "stat" && (<>
          <div style={{ ...base, fontWeight: 800, fontSize: u * (slide.value.length > 6 ? 17 : 23), lineHeight: 1.05, color: palette.accent, letterSpacing: -u * 0.4 }}>{slide.value}</div>
          <div style={{ ...base, fontWeight: 600, fontSize: u * 5.4 }}>{slide.label}</div>
        </>)}
        {slide.kind === "quote" && (<>
          <div style={{ ...base, fontWeight: 800, fontSize: u * 20, lineHeight: 0.8, color: palette.accent, paddingBottom: 0 }}>&ldquo;</div>
          <div style={{ ...base, fontWeight: 700, fontSize: u * (slide.quote.length > 120 ? 5.2 : 6.4), lineHeight: 1.3 }}>{slide.quote}</div>
          {slide.by && <div style={{ ...base, fontWeight: 500, fontSize: u * 3.8, opacity: 0.8 }}>{slide.by}</div>}
        </>)}
        {slide.kind === "end" && (<div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: u * 4 }}>
          {brand.logoUrl && <Img src={brand.logoUrl} crossOrigin="anonymous" style={{ height: u * 16, width: u * 40, objectFit: "contain" }} />}
          <div style={{ ...base, fontWeight: 800, fontSize: u * 8, lineHeight: 1.15 }}>{slide.title}</div>
          {slide.cta && <div style={{ padding: `${u * 2.4}px ${u * 6}px`, borderRadius: u * 10, background: palette.accent, color: on(palette.accent), fontFamily: font, fontWeight: 800, fontSize: u * 4.6, lineHeight: 1.3 }}>{slide.cta}</div>}
          {(slide.handle || brand.handle) && <div style={{ ...base, fontWeight: 600, fontSize: u * 4, opacity: 0.85 }}>{slide.handle || brand.handle}</div>}
        </div>)}
      </div>

      {/* bottom row: swipe cue on every slide but the last */}
      <div style={{ display: "flex", justifyContent: "flex-end", height: u * 6, alignItems: "center" }}>
        {!last && <div style={{ ...base, fontWeight: 800, fontSize: u * 3.9, color: palette.accent }}>Swipe →</div>}
      </div>
    </AbsoluteFill>
  );
}
