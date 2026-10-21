"use client";

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MOTION_FPS, contrast, sceneFrames, type MotionScene, type MotionSpec, type Palette } from "@/lib/motion/spec";

/**
 * BlinkSpot's motion kit (2026-10-15; the walkthrough step 2026-10-20): Remotion templates drawn from a spec Claude writes
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

/**
 * One app walkthrough step (2026-10-20): the screenshot in a device, the camera easing in to the box,
 * a tap with a ripple, a ring around the spot and the label beside it. All in the device's own
 * coordinates, so the ring and the tap ride the zoom.
 */
function Screen({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "screen" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height, tall } = useUnit();
  const exit = useExit(frames);
  const [bx, by, bw, bh] = scene.box;
  // The device: the screenshot's shape, as large as the frame allows (room left for the label).
  const bezel = scene.device === "none" ? 0 : u * (scene.device === "phone" ? 1.8 : 1.2);
  const maxW = width * (scene.device === "laptop" ? 0.8 : 0.86), maxH = height * (tall ? 0.7 : 0.74);
  let devW = Math.min(maxW, maxH * scene.aspect);
  let devH = devW / scene.aspect;
  if (devH > maxH) { devH = maxH; devW = devH * scene.aspect; }
  const cy = height * (tall ? 0.42 : 0.46);
  // The zoom: the box grows to about 40% of the device, centred.
  const zoom = Math.min(2.4, Math.max(1.25, 0.4 / Math.max(bw, bh)));
  const z = interpolate(frame, [14, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const s = 1 + (zoom - 1) * z;
  // translate(t) scale(s) about the device's centre puts a point p at t + s·p: at full zoom the box centre sits where the device centre was,
  // unless that would pull the device's edge into the frame (a button in a corner left half the frame empty): then the edge stops at the frame's.
  const outW = (devW + bezel * 2) * s, outH = (devH + bezel * 2) * s;
  const range = (a: number, b: number, v: number) => Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
  const tx = range(-Math.abs(outW - width) / 2, Math.abs(outW - width) / 2, (0.5 - (bx + bw / 2)) * devW * s * z);
  const ty = range(height - cy - outH / 2, outH / 2 - cy, (0.5 - (by + bh / 2)) * devH * s * z);
  const enter = pop(frame, fps, 0, 15);
  // Where the box is on screen now (for the label).
  const boxBottom = cy + ((by + bh) - 0.5) * devH * s + ty;
  const boxTop = cy + (by - 0.5) * devH * s + ty;
  const below = boxBottom + u * 26 < height * 0.95;
  const labelY = below ? boxBottom + u * 4 : boxTop - u * 4;
  // The tap: arrives, presses, ripples; the ring pulses once.
  const tap = interpolate(frame, [30, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const press = interpolate(frame, [46, 50, 56], [1, 0.82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ripple = interpolate(frame, [48, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const ring = interpolate(frame, [40, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const label = pop(frame, fps, 52, 13);
  const dot = u * 7 / s;
  return (
    <AbsoluteFill style={{ opacity: (1 - exit) * Math.min(1, enter * 1.4) }}>
      <div style={{ position: "absolute", left: width / 2 - devW / 2 - bezel, top: cy - devH / 2 - bezel, width: devW + bezel * 2, height: devH + bezel * 2, transform: `translate(${tx}px, ${ty}px) scale(${s * interpolate(enter, [0, 1], [0.94, 1])})`, transformOrigin: "50% 50%" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: scene.device === "phone" ? u * 7 : scene.device === "laptop" ? u * 2 : u * 2.5, background: scene.device === "none" ? "transparent" : "#0B0C0F", boxShadow: `0 ${u * 3}px ${u * 8}px rgba(0,0,0,0.35)` }} />
        <div style={{ position: "absolute", left: bezel, top: bezel, width: devW, height: devH, borderRadius: scene.device === "phone" ? u * 5.4 : u * 1.2, overflow: "hidden", background: "#FFFFFF" }}>
          <Img src={scene.image} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ position: "absolute", left: bezel + bx * devW - u * 0.8 / s, top: bezel + by * devH - u * 0.8 / s, width: bw * devW + u * 1.6 / s, height: bh * devH + u * 1.6 / s, borderRadius: u * 1.4 / s, border: `${u * 0.6 / s}px solid ${palette.accent}`, opacity: ring * (1 - ripple * 0.35), transform: `scale(${interpolate(ring, [0, 1], [1.15, 1])})` }} />
        <div style={{ position: "absolute", left: bezel + (bx + bw / 2) * devW - dot * 1.5 * ripple, top: bezel + (by + bh / 2) * devH - dot * 1.5 * ripple, width: dot * 3 * ripple, height: dot * 3 * ripple, borderRadius: "50%", border: `${u * 0.5 / s}px solid ${palette.accent}`, opacity: ripple > 0 ? 1 - ripple : 0 }} />
        <div style={{ position: "absolute", left: bezel + (bx + bw / 2) * devW - dot / 2 + (1 - tap) * devW * 0.35, top: bezel + (by + bh / 2) * devH - dot / 2 + (1 - tap) * devH * 0.35, width: dot, height: dot, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: `${u * 0.45 / s}px solid #111111`, opacity: tap, transform: `scale(${press})`, boxShadow: `0 ${u * 0.6 / s}px ${u * 2 / s}px rgba(0,0,0,0.35)` }} />
      </div>
      <div style={{ position: "absolute", left: width * 0.08, right: width * 0.08, top: below ? labelY : undefined, bottom: below ? undefined : height - labelY, display: "flex", justifyContent: "center", opacity: Math.min(1, label * 1.4), transform: `translateY(${(1 - label) * u * (below ? 3 : -3)}px)` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u * 0.8, padding: `${u * 2.4}px ${u * 4.4}px`, borderRadius: u * 3, background: palette.background, border: `${u * 0.4}px solid ${palette.accent}`, maxWidth: "100%", boxShadow: `0 ${u * 1.5}px ${u * 4}px rgba(0,0,0,0.3)` }}>
          <div style={{ fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 5.6, lineHeight: 1.2, paddingBottom: u * 0.3, color: palette.text, textAlign: "center" }}>{scene.label}</div>
          {scene.sub && <div style={{ fontFamily: fontStack(brand.font), fontWeight: 500, fontSize: u * 3.8, lineHeight: 1.3, paddingBottom: u * 0.3, color: palette.text, opacity: 0.85, textAlign: "center" }}>{scene.sub}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Numbers that move (2026-10-21): bars grow one after another, each value counting up; one can be the accent. */
function Bars({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "bars" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height, tall } = useUnit();
  const exit = useExit(frames);
  const n = scene.bars.length;
  const max = Math.max(...scene.bars.map((b) => Math.abs(b.value)), 1e-9);
  const title = pop(frame, fps, 0);
  const chartW = width * (tall ? 0.84 : 0.78), chartH = height * (tall ? 0.42 : 0.5);
  const gap = chartW * 0.04, barW = (chartW - gap * (n - 1)) / n;
  const per = Math.max(4, Math.min(10, (frames * 0.55) / n));
  const labelSize = Math.min(u * 3.6, barW * 0.22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - exit, transform: `translateY(${-exit * u * 4}px)` }}>
      <div style={{ opacity: title, transform: `translateY(${(1 - title) * u * 3}px)`, fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * (tall ? 7 : 6), lineHeight: 1.15, paddingBottom: u * 0.4, color: palette.text, textAlign: "center", maxWidth: chartW, marginBottom: u * 5 }}>{scene.title}</div>
      <div style={{ width: chartW, height: chartH, display: "flex", alignItems: "flex-end", gap }}>
        {scene.bars.map((b, i) => {
          const grow = interpolate(frame, [10 + i * per, 10 + i * per + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          const hot = scene.highlight === i;
          const h = Math.max(u * 0.8, (Math.abs(b.value) / max) * (chartH - labelSize * 4.4) * grow);
          return (
            <div key={i} style={{ width: barW, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: labelSize * 1.15, lineHeight: 1.2, color: hot ? palette.accent : palette.text, opacity: Math.min(1, grow * 1.5), marginBottom: u * 1 }}>{`${scene.prefix ?? ""}${formatNumber(b.value * grow, scene.decimals)}${scene.suffix ?? ""}`}</div>
              <div style={{ width: "100%", height: h, borderRadius: `${u * 1.2}px ${u * 1.2}px ${u * 0.4}px ${u * 0.4}px`, background: hot || scene.highlight === undefined ? palette.accent : shade(palette.background, 0.28) }} />
              <div style={{ fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: labelSize, lineHeight: 1.25, color: palette.text, opacity: 0.85, marginTop: u * 1.2, textAlign: "center", width: "100%" }}>{b.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Before and after (2026-10-21): the first number, then it counts to the second; the change is the accent. */
function Compare({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "compare" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, tall } = useUnit();
  const exit = useExit(frames);
  const enter = pop(frame, fps, 0);
  const turn = interpolate(frame, [Math.round(frames * 0.3), Math.round(frames * 0.62)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const value = scene.from + (scene.to - scene.from) * turn;
  const fmt = (v: number) => `${scene.prefix ?? ""}${formatNumber(v, scene.decimals)}${scene.suffix ?? ""}`;
  const final = fmt(scene.to);
  const size = u * Math.min(tall ? 30 : 26, 160 / Math.max(3, final.length));
  const down = scene.to < scene.from;
  const tag = interpolate(frame, [Math.round(frames * 0.62), Math.round(frames * 0.62) + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - exit, transform: `scale(${1 - exit * 0.05})` }}>
      <div style={{ opacity: enter * 0.9, fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: u * 5.4, color: palette.text, marginBottom: u * 2.5, textAlign: "center", maxWidth: u * 84 }}>{scene.label}</div>
      <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * u * 4}px)`, fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: size, lineHeight: 1.1, paddingBottom: size * 0.05, letterSpacing: -size * 0.03, color: turn > 0.98 ? palette.accent : palette.text }}>{fmt(value)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: u * 2, marginTop: u * 3, opacity: tag, transform: `translateY(${(1 - tag) * u * 2}px)` }}>
        <span style={{ fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: u * 3.8, color: palette.text, opacity: 0.6, textDecoration: "line-through" }}>{scene.fromLabel ? `${scene.fromLabel}: ` : ""}{fmt(scene.from)}</span>
        <span style={{ fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 3.8, padding: `${u * 0.6}px ${u * 1.8}px`, borderRadius: u * 3, background: palette.accent, color: readableOn(palette.accent) }}>{down ? "▼" : "▲"} {scene.toLabel ?? fmt(Math.abs(scene.to - scene.from))}</span>
      </div>
    </AbsoluteFill>
  );
}

/** Key points (2026-10-21, a post or notes into a video): a headline, then each point slides in with an accent marker. */
function Points({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "points" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, tall } = useUnit();
  const exit = useExit(frames);
  const title = pop(frame, fps, 0);
  const per = Math.max(8, Math.min(22, (frames * 0.6) / scene.points.length));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${u * 8}px`, opacity: 1 - exit, transform: `translateY(${-exit * u * 4}px)` }}>
      <div style={{ width: Math.min(width * 0.86, u * 150), display: "flex", flexDirection: "column", gap: u * (tall ? 2.6 : 2) }}>
        <div style={{ opacity: title, transform: `translateY(${(1 - title) * u * 3}px)`, fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * (tall ? 8 : 6.6), lineHeight: 1.12, paddingBottom: u * 0.5, color: palette.text, marginBottom: u * 2 }}>{scene.title}</div>
        {scene.points.map((p, i) => {
          const inn = pop(frame, fps, 12 + i * per, 15);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: u * 2.4, opacity: Math.min(1, inn * 1.3), transform: `translateX(${(1 - inn) * u * 10}px)`, padding: `${u * 2.2}px ${u * 2.8}px`, borderRadius: u * 2.4, background: shade(palette.background, 0.1) }}>
              <div style={{ width: u * 5.4, height: u * 5.4, borderRadius: u * 2.7, background: palette.accent, color: readableOn(palette.accent), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(brand.font), fontWeight: 800, fontSize: u * 3, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontFamily: fontStack(brand.font), fontWeight: 700, fontSize: u * (tall ? 4.6 : 4), lineHeight: 1.25, paddingBottom: u * 0.2, color: palette.text }}>{p}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/**
 * A story card (2026-10-21, motion quotes): soft shapes first (they draw underneath), then the
 * picture, the hill over the picture's foot, and the words last. Words blur in one line at a time
 * (CSS blur, which the web renderer draws with the canvas filter) and blur out as the card leaves.
 */
const STORY_SIZE = { s: 5.2, m: 8, l: 14, xl: 19 } as const;
function Story({ scene, palette, brand, frames }: { scene: Extract<MotionScene, { template: "story" }>; palette: Palette; brand: MotionBrand; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height, tall, wide } = useUnit();
  const exit = useExit(frames);
  const second = palette.second ?? shade(palette.accent, 0.35);
  const ease = (a: number, b: number) => interpolate(frame, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const hilly = scene.backdrop === "hill" || scene.backdrop === "sunrise";
  const hillTop = height * (tall ? 0.7 : 0.72);
  const hillW = width * (wide ? 1.5 : 2.4);
  const hillIn = ease(0, 18);
  const sunD = Math.min(width, height) * 0.6;
  const sunIn = ease(8, 34);
  // The picture: in a circle (sitting on the hill when there is one), a card, or as it is.
  const hasPic = !!scene.picture || !!scene.placeholder;
  const textAt = scene.place;
  const picD = Math.min(width, height) * 0.62;
  const picW = scene.frame === "card" ? picD * 0.9 : picD, picH = scene.frame === "card" ? picD * 1.12 : picD;
  const picCy = hilly ? hillTop - picH * 0.38 : textAt === "top" ? height * 0.6 : textAt === "bottom" ? height * 0.38 : height * 0.36;
  const picIn = pop(frame, fps, 4, 15);
  // The words: a column, each line its own size, the key words in the accent.
  const onHill = hilly && textAt === "bottom";
  const plain = onHill ? readableOn(palette.accent) : palette.text;
  const key = onHill ? (contrast(second, palette.accent) >= 2.2 ? second : readableOn(palette.accent)) : palette.accent;
  const colW = width * (wide ? 0.62 : 0.8);
  const n = scene.lines.length;
  const per = Math.max(5, Math.min(14, (frames * 0.45) / Math.max(1, n)));
  const blockTop = textAt === "top" ? height * 0.1 : textAt === "bottom" ? (hilly ? hillTop + height * 0.06 : height * 0.62) : hasPic ? height * 0.66 : null;
  const gone = scene.enter === "blur" ? `blur(${exit * u * 3}px)` : "none";
  // Circles in the accent, unless that is the text colour (words over them would vanish): then the second colour.
  const dot = contrast(palette.accent, palette.text) < 2 ? second : palette.accent;
  // The words shrink together to fit the room they have (above the picture, on the hill, or the middle).
  const room = textAt === "top" ? (hasPic ? picCy - picH / 2 - height * 0.12 : height * 0.75) : textAt === "bottom" ? height * 0.96 - (blockTop ?? 0) : hasPic ? height * 0.3 : height * 0.8;
  const natural = scene.lines.reduce((sum, l) => sum + Math.min(u * STORY_SIZE[l.size] * (wide ? 0.8 : 1), colW / Math.max(3, l.text.length * 0.56)) * (l.size === "l" || l.size === "xl" ? 1.04 : 1.2), 0);
  const fit = natural > 0 ? Math.min(1, Math.max(0.4, room / natural)) : 1;
  return (
    <AbsoluteFill style={{ opacity: 1 - exit * 0.9, filter: gone }}>
      {scene.backdrop === "dots" && ([[0.08, tall ? 0.03 : 0.06, 0.3], [0.72, tall ? 0.6 : 0.55, 0.2], [-0.14, tall ? 0.8 : 0.66, 0.62]] as const).map(([x, y, d], i) => {
        const g = pop(frame, fps, i * 4, 16);
        const drift = Math.sin((frame + i * 40) / 45) * u * 1.2;
        const size = Math.min(width, height) * d;
        return <div key={i} style={{ position: "absolute", left: width * x, top: height * y + drift, width: size, height: size, borderRadius: "50%", background: dot, filter: `blur(${u * 0.5}px)`, transform: `scale(${g})` }} />;
      })}
      {scene.backdrop === "sunrise" && <div style={{ position: "absolute", left: width / 2 - sunD / 2, top: hillTop - sunD * 0.78 + (1 - sunIn) * sunD * 0.8, width: sunD, height: sunD, borderRadius: "50%", background: second, filter: `blur(${u * 0.25}px)` }} />}
      {hasPic && (
        <div style={{ position: "absolute", left: width / 2 - picW / 2, top: picCy - picH / 2, width: picW, height: picH, borderRadius: scene.frame === "circle" ? "50%" : scene.frame === "card" ? u * 4 : 0, overflow: "hidden",
          background: scene.frame === "none" ? "transparent" : scene.picture ? second : shade(palette.background, 0.08), opacity: Math.min(1, picIn * 1.4), transform: `scale(${interpolate(picIn, [0, 1], [0.8, 1])})`,
          boxShadow: scene.frame === "card" ? `0 ${u * 2}px ${u * 6}px rgba(0,0,0,0.25)` : undefined, display: "flex", alignItems: "center", justifyContent: "center", border: scene.picture ? undefined : `${u * 0.5}px dashed ${palette.accent}` }}>
          {scene.picture
            ? <Img src={scene.picture} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: scene.frame === "none" ? "contain" : "cover" }} />
            : <div style={{ fontFamily: fontStack(brand.font), fontWeight: 600, fontSize: u * 3.6, lineHeight: 1.3, color: palette.text, opacity: 0.75, textAlign: "center", padding: u * 6 }}>Your photo here:<br />{scene.placeholder}</div>}
        </div>
      )}
      {hilly && <div style={{ position: "absolute", left: width / 2 - hillW / 2, top: hillTop + (1 - hillIn) * height * 0.35, width: hillW, height: hillW, borderRadius: "50%", background: palette.accent }} />}
      {n > 0 && (
        <AbsoluteFill style={{ justifyContent: blockTop === null ? "center" : "flex-start", alignItems: "center", paddingTop: blockTop ?? 0 }}>
          <div style={{ width: colW, display: "flex", flexDirection: "column" }}>
            {scene.lines.map((l, i) => {
              const big = l.size === "l" || l.size === "xl";
              const size = Math.min(u * STORY_SIZE[l.size] * (wide ? 0.8 : 1), colW / Math.max(3, l.text.length * 0.56)) * fit;
              const p = ease(6 + i * per, 6 + i * per + 12);
              const sp = pop(frame, fps, 6 + i * per, 12);
              const style: CSSProperties = scene.enter === "blur"
                ? { opacity: p, filter: `blur(${(1 - p) * u * 2.4}px)`, transform: `scale(${1.06 - 0.06 * p})` }
                : scene.enter === "rise" ? { opacity: p, transform: `translateY(${(1 - p) * size * 0.5}px)` }
                : { opacity: Math.min(1, sp * 1.4), transform: `scale(${interpolate(sp, [0, 1], [0.6, 1])})` };
              return <div key={i} style={{ ...style, alignSelf: l.align === "left" ? "flex-start" : l.align === "right" ? "flex-end" : "center", fontFamily: fontStack(brand.font), fontWeight: big ? 800 : 600, fontSize: size, lineHeight: big ? 1 : 1.15, paddingBottom: size * 0.06, marginTop: i && big ? -size * 0.08 : 0, letterSpacing: big ? -size * 0.02 : 0, color: l.accent ? key : plain, whiteSpace: "nowrap" }}>{l.text}</div>;
            })}
          </div>
        </AbsoluteFill>
      )}
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
    case "screen": return <Screen scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "bars": return <Bars scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "compare": return <Compare scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "points": return <Points scene={scene} palette={palette} brand={brand} frames={frames} />;
    case "story": return <Story scene={scene} palette={palette} brand={brand} frames={frames} />;
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
