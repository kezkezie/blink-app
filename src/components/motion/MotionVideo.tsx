"use client";

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MOTION_FPS, contrast, sceneFrames, type MotionScene, type MotionSpec, type Palette } from "@/lib/motion/spec";

/**
 * BlinkSpot's motion kit (2026-10-15): six Remotion templates drawn from a spec Claude writes
 * (lib/motion/spec.ts). Only what the browser renderer draws: flex, transforms, opacity, linear
 * gradients, border-radius, clip-path, text-shadow; no z-index (later elements draw on top).
 * Everything is a function of the frame, so the preview and the rendered clip are identical.
 */
export type MotionBrand = { name: string; font?: string | null; logoUrl?: string | null };
export type MotionProps = { spec: MotionSpec; brand: MotionBrand };

const EXIT = 8; // frames each scene takes to leave

function useUnit() {
  const { width, height } = useVideoConfig();
  return { u: Math.min(width, height) / 100, width, height, tall: height > width * 1.2, wide: width > height * 1.2 };
}
const fontStack = (font?: string | null) => `${font ? `"${font}", ` : ""}Inter, "Helvetica Neue", Arial, sans-serif`;
/** 0 → 1 as the scene leaves in its last frames. */
function useExit(frames: number) {
  const f = useCurrentFrame();
  return interpolate(f, [frames - EXIT, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
}
const pop = (frame: number, fps: number, delay = 0, damping = 14) => spring({ frame: frame - delay, fps, config: { damping, stiffness: 140, mass: 0.7 } });

function Frame({ palette, transparent, children }: { palette: Palette; transparent: boolean; children: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: transparent ? "transparent" : `linear-gradient(160deg, ${palette.background} 0%, ${palette.background} 55%, ${shade(palette.background, 0.12)} 100%)` }}>
      {children}
    </AbsoluteFill>
  );
}

/** A little lighter (or darker, for light colours) version of a colour. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
  const mix = (c: number) => Math.round(light ? c * (1 - amount) : c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function KineticHeadline({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "kinetic-headline" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, tall } = useUnit();
  const exit = useExit(frames);
  const words = scene.words.split(" ");
  const size = u * (words.length <= 3 ? (tall ? 22 : 19) : words.length <= 6 ? (tall ? 16.5 : 14) : tall ? 13 : 11);
  const lines = scene.enter === "line" ? splitLines(words, words.length <= 4 ? 2 : 3) : [words];
  const stagger = scene.enter === "slam" ? 6 : 4;
  let index = 0;
  const allIn = (words.length - 1) * stagger + 14;
  const bar = interpolate(frame, [allIn, allIn + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const subIn = interpolate(frame, [allIn + 6, allIn + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${u * 9}px`, opacity: 1 - exit, transform: `translateY(${-exit * u * 6}px)` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u * 1.2, maxWidth: "100%" }}>
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.28, rowGap: size * 0.05 }}>
            {line.map((w) => {
              const i = index++;
              const p = pop(frame, fps, i * stagger, scene.enter === "slam" ? 9 : 14);
              const style: CSSProperties = scene.enter === "slam"
                ? { opacity: Math.min(1, p * 1.4), transform: `scale(${interpolate(p, [0, 1], [1.8, 1])})` }
                : { opacity: Math.min(1, p * 1.3), transform: `translateY(${interpolate(p, [0, 1], [size * 0.6, 0])}px)` };
              return <span key={i} style={{ ...style, display: "inline-block", fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: size, lineHeight: 1.12, paddingBottom: size * 0.06, letterSpacing: -size * 0.02, color: palette.text }}>{w}</span>;
            })}
          </div>
        ))}
        <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", marginTop: u * 1.5 }}>
          <div style={{ height: u * 1.4, width: `${bar * 100}%`, background: palette.accent, borderRadius: u }} />
        </div>
        {scene.sub && <div style={{ opacity: subIn, transform: `translateY(${(1 - subIn) * u * 2}px)`, fontFamily: fontStack(brand.font), fontWeight: 500, fontSize: Math.max(u * 4.6, size * 0.3), color: palette.text, marginTop: u * 1.2, textAlign: "center" }}>{scene.sub}</div>}
      </div>
    </AbsoluteFill>
  );
}

function splitLines(words: string[], n: number) {
  const per = Math.ceil(words.length / n);
  return Array.from({ length: n }, (_, i) => words.slice(i * per, (i + 1) * per)).filter((l) => l.length);
}

function formatNumber(v: number, decimals: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Stat({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "stat" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useUnit();
  const exit = useExit(frames);
  const count = interpolate(frame, [4, Math.max(20, frames * 0.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const shown = `${scene.prefix ?? ""}${formatNumber(scene.value * count, scene.decimals)}${scene.suffix ?? ""}`;
  const final = `${scene.prefix ?? ""}${formatNumber(scene.value, scene.decimals)}${scene.suffix ?? ""}`;
  const size = u * Math.min(26, 150 / Math.max(3, final.length));
  const enter = pop(frame, fps, 0);
  const label = interpolate(frame, [Math.max(20, frames * 0.6) - 6, Math.max(20, frames * 0.6) + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - exit, transform: `scale(${1 - exit * 0.06})` }}>
      <div style={{ width: u * 70, height: u * 1.6, borderRadius: u, background: shade(palette.background, 0.18), marginBottom: u * 5, overflow: "hidden" }}>
        <div style={{ width: `${count * 100}%`, height: "100%", background: palette.accent }} />
      </div>
      <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * u * 4}px)`, fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: size, lineHeight: 1.1, paddingBottom: size * 0.05, letterSpacing: -size * 0.03, color: palette.accent }}>{shown}</div>
      <div style={{ opacity: label, transform: `translateY(${(1 - label) * u * 2}px)`, fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: u * 5.2, color: palette.text, marginTop: u * 3.5, textAlign: "center", maxWidth: u * 80 }}>{scene.label}</div>
    </AbsoluteFill>
  );
}

function ProductReveal({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "product-reveal" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, wide } = useUnit();
  const exit = useExit(frames);
  const card = pop(frame, fps, 0, 16);
  const pic = pop(frame, fps, 6, 13);
  const info = interpolate(frame, [16, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const tag = pop(frame, fps, 26, 10);
  const side = wide;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - exit }}>
      <div style={{ display: "flex", flexDirection: side ? "row" : "column", alignItems: "center", gap: u * 5, width: side ? "82%" : "80%", padding: u * 5, borderRadius: u * 5, background: shade(palette.background, 0.1), transform: `translateY(${(1 - card) * u * 30}px)`, opacity: Math.min(1, card * 1.5) }}>
        <div style={{ width: side ? u * 46 : "100%", height: side ? u * 46 : u * 62, borderRadius: u * 3.5, background: shade(palette.background, 0.2), overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", transform: `scale(${interpolate(pic, [0, 1], [0.85, 1])})` }}>
          {scene.image
            ? <Img src={scene.image} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 800, fontSize: u * 14, color: palette.accent }}>{scene.name.slice(0, 1)}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: side ? "flex-start" : "center", gap: u * 1.6, opacity: info, transform: `translateY(${(1 - info) * u * 3}px)` }}>
          <div style={{ fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 7.5, lineHeight: 1.15, paddingBottom: u * 0.5, color: palette.text, textAlign: side ? "left" : "center" }}>{scene.name}</div>
          {scene.tagline && <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 500, fontSize: u * 4.2, color: palette.text, opacity: 0.85, textAlign: side ? "left" : "center" }}>{scene.tagline}</div>}
          {scene.price && <div style={{ marginTop: u * 1.5, padding: `${u * 1.4}px ${u * 3.6}px`, borderRadius: u * 10, background: palette.accent, color: readableOn(palette.accent), fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 5, transform: `scale(${tag})` }}>{scene.price}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Black or white, whichever has the higher contrast on a colour. */
function readableOn(hex: string) {
  return contrast("#111111", hex) >= contrast("#FFFFFF", hex) ? "#111111" : "#FFFFFF";
}

function LogoSting({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "logo-sting" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useUnit();
  const exit = useExit(frames);
  const ring = interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const mark = pop(frame, fps, 6, 11);
  const line = interpolate(frame, [22, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - exit, transform: `scale(${1 + exit * 0.08})` }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: u * 62, height: u * 62, borderRadius: "50%", border: `${u * 0.9}px solid ${palette.accent}`, opacity: (1 - ring) * 0.9 + 0.1, transform: `scale(${0.4 + ring * 0.8})` }} />
      </AbsoluteFill>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u * 4 }}>
        <div style={{ transform: `scale(${interpolate(mark, [0, 1], [0.6, 1])})`, opacity: Math.min(1, mark * 1.4) }}>
          {brand.logoUrl
            ? <Img src={brand.logoUrl} crossOrigin="anonymous" style={{ width: u * 38, height: u * 38, objectFit: "contain" }} />
            : <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 800, fontSize: u * 11, color: palette.text }}>{brand.name}</div>}
        </div>
        {scene.tagline && <div style={{ opacity: line, transform: `translateY(${(1 - line) * u * 2}px)`, fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: u * 4.6, color: palette.text, letterSpacing: u * 0.2, textTransform: "uppercase" }}>{scene.tagline}</div>}
      </div>
    </AbsoluteFill>
  );
}

function LowerThird({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "lower-third" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { u, height, tall } = useUnit();
  const open = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const close = interpolate(frame, [frames - 12, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const reveal = open * (1 - close);
  const textIn = interpolate(frame, [8, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (1 - close);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: `0 ${u * 9}px ${height * (tall ? 0.21 : 0.1)}px` }}>
      <div style={{ display: "flex", alignItems: "stretch", clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)` }}>
        <div style={{ width: u * 1.6, background: palette.accent }} />
        <div style={{ display: "flex", flexDirection: "column", gap: u * 0.6, padding: `${u * 2.2}px ${u * 4}px`, background: palette.background }}>
          <div style={{ opacity: textIn, fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 5.6, lineHeight: 1.2, paddingBottom: u * 0.4, color: palette.text }}>{scene.title}</div>
          {scene.subtitle && <div style={{ opacity: textIn, fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 500, fontSize: u * 3.6, color: palette.text }}>{scene.subtitle}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function EndCard({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "end-card" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useUnit();
  const exit = useExit(frames);
  const logo = pop(frame, fps, 0, 14);
  const cta = pop(frame, fps, 8, 11);
  const meta = interpolate(frame, [20, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: u * 6, opacity: 1 - exit }}>
      {scene.logo && brand.logoUrl && <Img src={brand.logoUrl} crossOrigin="anonymous" style={{ width: u * 22, height: u * 22, objectFit: "contain", opacity: logo, transform: `translateY(${(1 - logo) * u * 3}px)` }} />}
      {scene.logo && !brand.logoUrl && <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 800, fontSize: u * 7, color: palette.text, opacity: logo }}>{brand.name}</div>}
      <div style={{ padding: `${u * 3}px ${u * 7}px`, borderRadius: u * 12, background: palette.accent, color: readableOn(palette.accent), fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 6.4, textAlign: "center", maxWidth: u * 86, transform: `scale(${cta})` }}>{scene.cta}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u * 1.2, opacity: meta }}>
        {scene.handle && <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 700, fontSize: u * 4.4, color: palette.text }}>{scene.handle}</div>}
        {scene.website && <div style={{ fontFamily: fontStack(brand.font), lineHeight: 1.3, paddingBottom: u * 0.4, fontWeight: 500, fontSize: u * 3.8, color: palette.text, opacity: 0.85 }}>{scene.website}</div>}
      </div>
    </AbsoluteFill>
  );
}

function Scene({ scene, palette, brand }: { scene: MotionScene; palette: Palette; brand: MotionBrand }) {
  const frames = sceneFrames(scene);
  switch (scene.template) {
    case "kinetic-headline": return <KineticHeadline scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "stat": return <Stat scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "product-reveal": return <ProductReveal scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "logo-sting": return <LogoSting scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "lower-third": return <LowerThird scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "end-card": return <EndCard scene={scene} palette={palette} brand={brand} frames={frames} />;
  }
}

export function MotionVideo({ spec, brand }: MotionProps) {
  return (
    <Frame palette={spec.palette} transparent={spec.kind === "overlay"}>
      <Series>
        {spec.scenes.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={sceneFrames(s)}>
            <Scene scene={s} palette={spec.palette} brand={brand} />
          </Series.Sequence>
        ))}
      </Series>
    </Frame>
  );
}

export { MOTION_FPS };
