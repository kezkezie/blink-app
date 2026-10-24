"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, ImagePlus, Layers as LayersIcon, Loader2, Lock, Palette as PaletteIcon, Pause, Play, Plus,
  Move, RefreshCw, Shapes, Sparkles, Trash2, Type, Undo2, Unlock, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/studio/Modal";
import { MotionVideo, settleFrame, type MotionBrand } from "@/components/motion/MotionVideo";
import {
  ADDABLE_TEMPLATES, MOTION_FPS, MOTION_TEMPLATES, PART_NAMES, blankScene, motionTitle, paletteFor, sceneFrames, sizeFor, totalFrames, totalSeconds, validateMotionSpec,
  type MotionScene, type MotionSpec, type PartNudge, type StoryLine,
} from "@/lib/motion/spec";
import { LAYER_ENTERS, LAYER_LIMIT, LAYER_SHAPES, duplicateLayer, newLayer, reorderLayer, type MotionLayer } from "@/lib/motion/layers";
import { LOOKS, applyLook, lookById } from "@/lib/motion/looks";
import { track } from "@/lib/analytics";
import "./motion-studio.css";

/**
 * The motion studio, rebuilt as a canvas editor (2026-10-23; Kezie: "enlarging images, or placing
 * images in various locations while editing ... revamp the UI for the motion graphics part, it's one
 * of my most selling points"; layout after a Pinterest story-editor reference). Tools on the left,
 * the canvas in the middle with every free layer selectable, movable and resizable, a Design /
 * Animation inspector on the right, the scenes as a filmstrip below. Looks adapted from
 * Lemo-Opuscar (MIT) restyle the whole clip. Still the live preview (Remotion Player) and a render
 * on this computer (Remotion's web renderer); every edit is free.
 */
export type AddedMotion = { url: string; name: string; seconds: number; kind: MotionSpec["kind"]; contentId: string | null };
export type MotionPlace = "start" | "end" | "playhead" | "library";

const fontsLoaded = new Map<string, Promise<void>>();
/** The brand font, from Google Fonts or one this account uploaded, loaded before preview and render. */
export function ensureMotionFont(family: string | null | undefined, clientId: string | null) {
  if (!family || typeof document === "undefined") return Promise.resolve();
  const known = fontsLoaded.get(family);
  if (known) return known;
  const p = (async () => {
    await new Promise<void>((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    if (clientId) {
      const { data } = await supabase.storage.from("assets").list(`uploads/${clientId}/fonts`, { limit: 100 });
      const file = (data ?? []).find((f) => f.name.replace(/^\d+_/, "").replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ").trim().toLowerCase() === family.toLowerCase());
      if (file) {
        const url = supabase.storage.from("assets").getPublicUrl(`uploads/${clientId}/fonts/${file.name}`).data.publicUrl;
        try { const face = new FontFace(family, `url(${url})`); await face.load(); document.fonts.add(face); } catch { /* a broken file is skipped */ }
      }
    }
    await Promise.all(["500", "600", "700", "800"].map((w) => document.fonts.load(`${w} 64px "${family}"`).catch(() => [])));
  })();
  fontsLoaded.set(family, p);
  return p;
}


const LAYER_ENTER_LABEL: Record<MotionLayer["enter"], string> = { none: "None", fade: "Fade", rise: "Rise", pop: "Pop", wipe: "Wipe", draw: "Draw on" };
const SHAPE_LABEL: Record<(typeof LAYER_SHAPES)[number], string> = { rect: "Box", circle: "Circle", pill: "Pill", line: "Line" };
const FONT_CHOICES = ["Inter", "Archivo", "Space Grotesk", "Poppins", "Montserrat", "Playfair Display", "DM Serif Display", "Bebas Neue", "Oswald", "Kalam", "Special Elite", "Fredoka"];
const layerName = (l: MotionLayer) => (l.kind === "image" ? "Picture" : l.kind === "text" ? (l.text.length > 22 ? `${l.text.slice(0, 22)}…` : l.text) : SHAPE_LABEL[l.shape]);
type Drag = { id: string; mode: "move" | "nw" | "ne" | "sw" | "se"; sx: number; sy: number; start: MotionLayer; rect: DOMRect };
/** A part of what the AI made, as found on the canvas (fractions of the frame). */
type PartBox = { id: string; name: string; x: number; y: number; w: number; h: number };
type PartDrag = { id: string; mode: Drag["mode"]; sx: number; sy: number; start: PartNudge; box: PartBox; rect: DOMRect };
const NO_NUDGE: PartNudge = { dx: 0, dy: 0, scale: 1 };

export function MotionStudio({ open, onClose, spec, onSpec, brand, pictures, clientId, brandId, onAdded, onRewrite, rewriting, standalone = false }: {
  open: boolean; onClose: () => void; spec: MotionSpec; onSpec: (s: MotionSpec) => void; brand: MotionBrand & { primary?: string | null; secondary?: string | null };
  pictures: Array<{ url: string; title: string }>; clientId: string | null; brandId: string | null;
  onAdded: (m: AddedMotion, where: MotionPlace) => void; onRewrite: () => void; rewriting: boolean;
  /** Motion graphics on their own (Create → Motion graphics, 2026-10-20): saved to the Library, no timeline. */
  standalone?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // Photos added here (story cards, layers, the background), offered next to the brand's own.
  const [extra, setExtra] = useState<Array<{ url: string; title: string }>>([]);
  const allPictures = useMemo(() => [...pictures, ...extra], [pictures, extra]);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  async function uploadFile(f: File | undefined, prefix: string): Promise<string | null> {
    if (!f || !clientId) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast.error("Use a JPG, PNG or WebP photo."); return null; }
    try {
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      const path = `images/${clientId}/${prefix}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, f, { contentType: f.type });
      if (error) throw error;
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      setExtra((x) => [...x, { url, title: f.name.slice(0, 60) }]);
      return url;
    } catch { toast.error("Couldn't upload that photo."); return null; }
  }
  async function uploadPicture(i: number, f: File | undefined) {
    setUploadingFor(i);
    const url = await uploadFile(f, "motion_photo");
    if (url) setScene(i, { picture: url, placeholder: undefined } as Partial<MotionScene>);
    setUploadingFor(null);
  }
  // A picture to play the clip over (2026-10-22). -1 marks the background uploader.
  async function uploadBackground(f: File | undefined) {
    setUploadingFor(-1);
    const url = await uploadFile(f, "motion_bg");
    if (url) onSpec({ ...spec, background: url });
    setUploadingFor(null);
  }

  // While a layer is dragged, the canvas shows a live copy; it's kept (and saved) on release.
  const [live, setLiveState] = useState<MotionSpec | null>(null);
  // The latest live copy, so letting go saves it outside any state update (saving inside one updated
  // the parent while this component rendered).
  const liveRef = useRef<MotionSpec | null>(null);
  const setLive = (v: MotionSpec | null) => { liveRef.current = v; setLiveState(v); };
  const keepLive = () => { const v = liveRef.current; setLive(null); if (v) onSpec(v); };
  const view = live ?? spec;
  const abort = useRef<AbortController | null>(null);
  const { width, height } = sizeFor(view.shape);
  const tall = height > width;
  const frames = Math.max(1, totalFrames(view));
  const props = useMemo(() => ({ spec: view, brand }), [view, brand]);
  useEffect(() => { void ensureMotionFont(view.font ?? brand.font, clientId); }, [view.font, brand.font, clientId]);

  // Scenes on the clip's timeline, and the one being edited.
  const starts = useMemo(() => { let t = 0; return view.scenes.map((s) => { const at = t; t += sceneFrames(s); return at; }); }, [view.scenes]);
  const [sceneIx, setSceneIx] = useState(0);
  const si = Math.min(sceneIx, view.scenes.length - 1);
  const scene = view.scenes[si];
  const [layerId, setLayerId] = useState<string | null>(null);
  const layers = scene?.layers ?? [];
  const layer = layers.find((l) => l.id === layerId) ?? null;
  // The AI's own parts on this scene (words, pictures, labels...), found on the canvas.
  const [partId, setPartId] = useState<string | null>(null);
  const [partBoxes, setPartBoxes] = useState<PartBox[]>([]);
  const frameEl = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"design" | "animation">("design");

  // The player: paused on a scene's settled frame while editing, so what you see is what you move.
  const player = useRef<PlayerRef>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const stopAt = useRef<number | null>(null);
  const settled = useCallback((i: number) => {
    const s = view.scenes[i];
    if (!s) return 0;
    const n = sceneFrames(s);
    // When the template's own parts have all arrived, or the last layer has (whichever is later).
    const lastIn = Math.max(...(s.layers ?? []).map((l) => l.delay + (l.enter === "draw" ? 1 : 0.6)), 0);
    return starts[i] + Math.min(n - 10, Math.max(settleFrame(s), Math.round(lastIn * MOTION_FPS)));
  }, [view.scenes, starts]);
  const goTo = useCallback((i: number) => {
    setSceneIx(i); setPartId(null); stopAt.current = null;
    player.current?.pause();
    player.current?.seekTo(Math.max(0, settled(i)));
  }, [settled]);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      if (stopAt.current !== null && e.detail.frame >= stopAt.current) { stopAt.current = null; p.pause(); }
      // While playing, the scene under the playhead is the one in the inspector.
      if (p.isPlaying()) { const i = starts.findLastIndex((st) => st <= e.detail.frame); if (i >= 0) setSceneIx(i); }
    };
    const onPlay = () => setPlaying(true), onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame); p.addEventListener("play", onPlay); p.addEventListener("pause", onPause);
    return () => { p.removeEventListener("frameupdate", onFrame); p.removeEventListener("play", onPlay); p.removeEventListener("pause", onPause); };
  }, [starts, open]);
  const playScene = () => { stopAt.current = starts[si] + sceneFrames(scene) - 1; player.current?.seekTo(starts[si]); player.current?.play(); };
  const at = frame ?? Math.min(frames - 1, settled(0)); // the player starts on scene 1's settled frame
  const playAll = () => { stopAt.current = null; if (at >= frames - 2) player.current?.seekTo(0); player.current?.play(); };

  const setScene = (i: number, patch: Partial<MotionScene>) => onSpec({ ...spec, scenes: spec.scenes.map((s, j) => (j === i ? ({ ...s, ...patch } as MotionScene) : s)) });
  const move = (i: number, by: number) => {
    const next = [...spec.scenes];
    const [s] = next.splice(i, 1);
    const to = Math.max(0, Math.min(next.length, i + by));
    next.splice(to, 0, s);
    onSpec({ ...spec, scenes: next });
    setSceneIx(to);
  };
  const remove = (i: number) => { if (spec.scenes.length <= 1) return; onSpec({ ...spec, scenes: spec.scenes.filter((_, j) => j !== i) }); setSceneIx(Math.max(0, i - 1)); setLayerId(null); };
  const duplicateScene = (i: number) => { const s = spec.scenes[i]; const copy = { ...s, layers: s.layers?.map(duplicateLayer) } as MotionScene; const next = [...spec.scenes]; next.splice(i + 1, 0, copy); onSpec({ ...spec, scenes: next }); setSceneIx(i + 1); };
  const addScene = (template: (typeof ADDABLE_TEMPLATES)[number]) => { const next = [...spec.scenes]; next.splice(si + 1, 0, blankScene(template, brand.name)); onSpec({ ...spec, scenes: next }); setSceneIx(si + 1); setLayerId(null); setAdding(false); };
  const [adding, setAdding] = useState(false);
  const setColour = (k: keyof MotionSpec["palette"], v: string) => onSpec({ ...spec, palette: paletteFor({ ...spec.palette, [k]: v }, { primary: brand.primary, secondary: brand.secondary }) });

  // Layers on the scene being edited.
  const setLayers = (next: MotionLayer[], base = spec) => {
    const s = base.scenes[si];
    return { ...base, scenes: base.scenes.map((x, j) => (j === si ? ({ ...s, layers: next } as MotionScene) : x)) };
  };
  const patchLayer = (id: string, patch: Partial<MotionLayer>) => onSpec(setLayers(layers.map((l) => (l.id === id ? ({ ...l, ...patch } as MotionLayer) : l))));
  const addLayer = (l: MotionLayer) => {
    if (layers.length >= LAYER_LIMIT) { toast.info(`Up to ${LAYER_LIMIT} layers on a scene.`); return; }
    onSpec(setLayers([...layers, l])); setLayerId(l.id); setTab("design"); goTo(si);
  };
  const removeLayer = (id: string) => { onSpec(setLayers(layers.filter((l) => l.id !== id))); setLayerId(null); };
  const [picking, setPicking] = useState(false);
  const addPicture = (url: string) => {
    const im = new Image();
    im.onload = () => addLayer(newLayer("image", { src: url, aspect: im.naturalWidth / Math.max(1, im.naturalHeight) }));
    im.onerror = () => addLayer(newLayer("image", { src: url }));
    im.src = url;
    setPicking(false);
  };

  // The AI's parts: moves and sizes kept on the scene (spec.ts PartNudge), drawn by MotionVideo.
  const nudgeOf = (id: string) => scene?.parts?.[id] ?? NO_NUDGE;
  const setPart = (id: string, p: PartNudge | null, base = spec) => {
    const s = base.scenes[si];
    const rest = { ...(s.parts ?? {}) };
    if (p && (Math.abs(p.dx) > 1e-4 || Math.abs(p.dy) > 1e-4 || Math.abs(p.scale - 1) > 1e-3)) rest[id] = p; else delete rest[id];
    const parts = Object.keys(rest).length ? rest : undefined;
    return { ...base, scenes: base.scenes.map((x, j) => (j === si ? ({ ...s, parts } as MotionScene) : x)) };
  };
  const part = partBoxes.find((b) => b.id === partId) ?? null;

  // Where each part is: measured from the preview itself, on the frame being edited.
  const measure = useCallback(() => {
    const root = frameEl.current;
    if (!root || playing) { setPartBoxes([]); return; }
    const fr = root.getBoundingClientRect();
    if (!fr.width || !scene) return;
    const names = PART_NAMES[scene.template] ?? {};
    const seen = new Set<string>();
    const boxes: PartBox[] = [];
    root.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => {
      const id = el.dataset.part!;
      const r = el.getBoundingClientRect();
      if (seen.has(id) || !(id in names) || r.width < 4 || r.height < 4) return;
      seen.add(id);
      boxes.push({ id, name: names[id], x: (r.left - fr.left) / fr.width, y: (r.top - fr.top) / fr.height, w: r.width / fr.width, h: r.height / fr.height });
    });
    setPartBoxes((was) => (JSON.stringify(was) === JSON.stringify(boxes) ? was : boxes));
  }, [playing, scene]);
  useEffect(() => {
    // After the preview has drawn this frame (twice: pictures and fonts can settle a moment later).
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(measure); });
    const late = setTimeout(measure, 350);
    return () => { cancelAnimationFrame(a); clearTimeout(late); };
  }, [measure, view, at, open]);
  useEffect(() => {
    const root = frameEl.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  }, [measure, open]);

  const partDrag = useRef<PartDrag | null>(null);
  function startPartDrag(e: React.PointerEvent, b: PartBox, mode: Drag["mode"]) {
    e.stopPropagation(); e.preventDefault();
    setPartId(b.id); setLayerId(null); setMenu(null);
    if (!canvas.current) return;
    player.current?.pause();
    partDrag.current = { id: b.id, mode, sx: e.clientX, sy: e.clientY, start: nudgeOf(b.id), box: b, rect: canvas.current.getBoundingClientRect() };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPartDrag(e: React.PointerEvent) {
    const d = partDrag.current;
    if (!d) return;
    const fx = (e.clientX - d.sx) / d.rect.width, fy = (e.clientY - d.sy) / d.rect.height;
    const s0 = d.start, b = d.box;
    let next: PartNudge;
    let gx = false, gy = false;
    if (d.mode === "move") {
      let ox = fx, oy = fy;
      // Snap the part's middle to the frame's middle, with a guide line.
      const cx = b.x + b.w / 2 + ox, cy = b.y + b.h / 2 + oy;
      if (Math.abs(cx - 0.5) < 0.012) { ox += 0.5 - cx; gx = true; }
      if (Math.abs(cy - 0.5) < 0.012) { oy += 0.5 - cy; gy = true; }
      next = { ...s0, dx: s0.dx + ox, dy: s0.dy + oy };
    } else {
      // A corner: bigger or smaller, keeping its shape; the opposite corner stays put.
      const sx = d.mode === "ne" || d.mode === "se" ? 1 : -1, sy = d.mode === "sw" || d.mode === "se" ? 1 : -1;
      const ratio = Math.max((b.w + sx * fx) / b.w, (b.h + sy * fy) / b.h);
      const scale = Math.min(4, Math.max(0.2, s0.scale * ratio));
      const r = scale / s0.scale;
      next = { scale, dx: s0.dx + (sx * (b.w * r - b.w)) / 2, dy: s0.dy + (sy * (b.h * r - b.h)) / 2 };
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { setLive(setPart(d.id, next)); setGuide({ x: gx, y: gy }); });
  }
  function endPartDrag() {
    if (!partDrag.current) return;
    partDrag.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    setGuide({ x: false, y: false });
    keepLive();
  }

  // Moving and resizing on the canvas. Pictures keep their shape; words and shapes stretch freely.
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const raf = useRef<number | null>(null);
  const [guide, setGuide] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  function startDrag(e: React.PointerEvent, l: MotionLayer, mode: Drag["mode"]) {
    e.stopPropagation(); e.preventDefault();
    setLayerId(l.id); setPartId(null);
    if (l.locked || !canvas.current) return;
    player.current?.pause();
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, start: l, rect: canvas.current.getBoundingClientRect() };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rect.width, dy = (e.clientY - d.sy) / d.rect.height;
    const s = d.start;
    let next: Partial<MotionLayer>;
    let gx = false, gy = false;
    if (d.mode === "move") {
      let x = s.x + dx, y = s.y + dy;
      // Snap to the middle of the frame, with a guide line.
      if (Math.abs(x - 0.5) < 0.012) { x = 0.5; gx = true; }
      if (Math.abs(y - 0.5) < 0.012) { y = 0.5; gy = true; }
      next = { x, y };
    } else {
      const sx = d.mode === "ne" || d.mode === "se" ? 1 : -1, sy = d.mode === "sw" || d.mode === "se" ? 1 : -1;
      const w = Math.max(0.03, s.w + sx * dx);
      let h = Math.max(0.03, s.h + sy * dy);
      if (s.kind === "image" && !e.altKey) h = w * (s.h / s.w); // keep the picture's shape (Alt to stretch)
      next = { w, h, x: s.x + (sx * (w - s.w)) / 2, y: s.y + (sy * (h - s.h)) / 2 };
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      setLive(setLayers(layers.map((l) => (l.id === d.id ? ({ ...l, ...next } as MotionLayer) : l))));
      setGuide({ x: gx, y: gy });
    });
  }
  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    setGuide({ x: false, y: false });
    keepLive();
  }

  // Keys: Delete removes the layer, arrows nudge it (Shift: further), Escape lets go of it.
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape" && (menu || layerId || partId)) { e.stopPropagation(); setMenu(null); setLayerId(null); setPartId(null); return; }
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (part && !layer && arrow) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.005, n = nudgeOf(part.id);
        onSpec(setPart(part.id, { ...n, dx: n.dx + arrow[0] * step, dy: n.dy + arrow[1] * step }));
        return;
      }
      if (!layer) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeLayer(layer.id); return; }
      const step = e.shiftKey ? 0.02 : 0.005;
      const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (by && !layer.locked) { e.preventDefault(); patchLayer(layer.id, { x: layer.x + by[0], y: layer.y + by[1] }); }
    };
    window.addEventListener("keydown", onKey, true); // before the dialog's own Escape
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const [looksOpen, setLooksOpen] = useState(false);
  const look = lookById(view.look);

    async function add(where: MotionPlace) {
    // The browser's edits are checked the same way the server checked Claude's plan.
    const checked = validateMotionSpec(spec, { shape: spec.shape, brand: { primary: brand.primary, secondary: brand.secondary }, images: [...allPictures.map((p) => p.url), ...(spec.background ? [spec.background] : [])] });
    if (!checked) { toast.error("Each scene needs its words. Fill them in and try again."); return; }
    const empty = checked.scenes.filter((x) => x.template === "story" && !x.picture && x.placeholder).length;
    if (empty) toast.info(`${empty} story card${empty === 1 ? " still has its" : "s still have their"} photo space empty; it shows as "Your photo here".`, { duration: 7000 });
    abort.current = new AbortController();
    setBusy("Getting the font ready…"); setProgress(0);
    try {
      await ensureMotionFont(spec.font ?? brand.font, clientId);
      setBusy("Rendering on this computer…");
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const overlay = checked.kind === "overlay";
      const composition = { id: "blink-motion", component: MotionVideo, durationInFrames: totalFrames(checked), fps: MOTION_FPS, width, height, defaultProps: { spec: checked, brand } };
      const render = (container: "mp4" | "webm") => renderMediaOnWeb({
        // BlinkSpot qualifies for Remotion's free licence (up to 3 people; Kezie approved Remotion 2026-10-15).
        composition, inputProps: { spec: checked, brand }, container, muted: true, signal: abort.current!.signal, licenseKey: "free-license",
        ...(container === "webm" ? { videoCodec: "vp8" as const, transparent: overlay } : {}),
        onProgress: ({ progress: p }) => setProgress(Math.round(p * 100)),
      });
      let container: "mp4" | "webm" = overlay ? "webm" : "mp4";
      let result;
      try { result = await render(container); } catch (e) {
        if (overlay || abort.current.signal.aborted) throw e;
        container = "webm"; // no H.264 encoder in this browser: WebM plays and exports the same
        result = await render(container);
      }
      const blob = await result.getBlob();
      if (!blob.size) throw new Error("empty");
      setBusy("Saving to your Library…");
      const path = `videos/${clientId}/motion_${Date.now()}.${container}`;
      const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: `video/${container}` });
      if (error) throw new Error("upload");
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      const name = motionTitle(checked);
      const { data: row } = await supabase.from("content").insert({
        client_id: clientId, brand_id: brandId, content_type: "video", status: "draft", caption: name,
        video_urls: [url], image_urls: [], ai_model: "remotion",
        creation_metadata: { operation: "motion", kind: checked.kind, seconds: totalSeconds(checked), spec: checked },
      }).select("id").single();
      onAdded({ url, name, seconds: totalSeconds(checked), kind: checked.kind, contentId: (row?.id as string | undefined) ?? null }, where);
      track("motion_made", { seconds: Math.round(totalSeconds(checked)), scenes: checked.scenes.length, walkthrough: checked.scenes.some((x) => x.template === "screen") });
      toast.success(where === "library" ? `${name.replace("Motion · ", "")}: saved to your Library` : `${name.replace("Motion · ", "")}: on the timeline and in your Library`);
      onClose();
    } catch (e) {
      console.error("motion render failed", e);
      if (abort.current?.signal.aborted) toast.message("Render stopped.");
      else toast.error(e instanceof Error && e.message === "upload" ? "Couldn't save the clip. Try again." : "Couldn't render here. Motion renders in Chrome, Edge, Firefox or Safari 26 and newer.");
    } finally { setBusy(null); abort.current = null; }
  }


  const label = (s: MotionScene) => MOTION_TEMPLATES.find((t) => t.id === s.template)?.label ?? s.template;
  const field = (lab: string, value: string | undefined, on: (v: string) => void, opts: { area?: boolean; placeholder?: string } = {}) => (
    <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>{lab}</span>
      {opts.area
        ? <textarea className="s-input" rows={2} value={value ?? ""} onChange={(e) => on(e.target.value)} placeholder={opts.placeholder} aria-label={lab} />
        : <input className="s-input" value={value ?? ""} onChange={(e) => on(e.target.value)} placeholder={opts.placeholder} aria-label={lab} />}
    </label>
  );
  const range = (lab: string, value: number, min: number, max: number, step: number, on: (v: number) => void, fmt?: (v: number) => string) => (
    <label className="ms-row"><span>{lab}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => on(Number(e.target.value))} aria-label={lab} /><b className="mono">{fmt ? fmt(value) : value}</b></label>
  );
  const pct = (lab: string, value: number, on: (v: number) => void) => (
    <label className="grid gap-1 min-w-0"><span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{lab}</span>
      <input className="s-input" type="number" step={1} value={Math.round(value * 1000) / 10} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v / 100); }} aria-label={lab} />
    </label>
  );
  const swatches = (current: string, on: (c: string) => void) => {
    const cs = [...new Set([view.palette.text, view.palette.accent, view.palette.second, view.palette.background, "#FFFFFF", "#111111"].filter((c): c is string => !!c).map((c) => c.toUpperCase()))];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {cs.map((c) => <button key={c} type="button" onClick={() => on(c)} aria-label={`Colour ${c}`} title={c} className="h-6 w-6 rounded-md" style={{ background: c, border: `2px solid ${current.toUpperCase() === c ? "var(--s-ai)" : "var(--s-line-2)"}` }} />)}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#FFFFFF"} onChange={(e) => on(e.target.value.toUpperCase())} className="h-6 w-8 rounded-md cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} aria-label="Any colour" />
      </div>
    );
  };

  // The editors for each template's own words and numbers (unchanged from the earlier studio).
  const sceneFields = (s: MotionScene, i: number) => (
    <>
              {s.template === "kinetic-headline" && (<>
                {field("Words", s.words, (v) => setScene(i, { words: v }), { area: true })}
                {field("Smaller line", s.sub, (v) => setScene(i, { sub: v || undefined }), { placeholder: "Optional" })}
                <div className="s-seg" role="group" aria-label="How words arrive">{(["word", "line", "slam"] as const).map((e) => <button key={e} aria-pressed={s.enter === e} onClick={() => setScene(i, { enter: e })}>{e === "word" ? "Word by word" : e === "line" ? "Line by line" : "Slam"}</button>)}</div>
              </>)}
              {s.template === "stat" && (<>
                <div className="grid grid-cols-[70px_minmax(0,1fr)_70px] gap-2">
                  {field("Before", s.prefix, (v) => setScene(i, { prefix: v || undefined }), { placeholder: "$" })}
                  <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>Number</span><input className="s-input" type="number" value={s.value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setScene(i, { value: v, decimals: Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 0) }); }} aria-label="Number" /></label>
                  {field("After", s.suffix, (v) => setScene(i, { suffix: v || undefined }), { placeholder: "%" })}
                </div>
                {field("Label", s.label, (v) => setScene(i, { label: v }))}
              </>)}
              {s.template === "bars" && (<>
                {field("Title", s.title, (v) => setScene(i, { title: v }))}
                <div className="grid grid-cols-[70px_minmax(0,1fr)_70px] gap-2">
                  {field("Before", s.prefix, (v) => setScene(i, { prefix: v || undefined }), { placeholder: "$" })}
                  <span />
                  {field("After", s.suffix, (v) => setScene(i, { suffix: v || undefined }), { placeholder: "%" })}
                </div>
                {s.bars.map((b, j) => (
                  <div key={j} className="grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2 items-end">
                    {field(`Bar ${j + 1}`, b.label, (v) => setScene(i, { bars: s.bars.map((x, k) => (k === j ? { ...x, label: v } : x)) }))}
                    <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>Value</span><input className="s-input" type="number" value={b.value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setScene(i, { bars: s.bars.map((x, k) => (k === j ? { ...x, value: v } : x)) }); }} aria-label={`Bar ${j + 1} value`} /></label>
                    <button className="s-chip" aria-pressed={s.highlight === j} onClick={() => setScene(i, { highlight: s.highlight === j ? undefined : j })} title="Make this the bar that stands out">Star</button>
                  </div>
                ))}
              </>)}
              {s.template === "compare" && (<>
                {field("Label", s.label, (v) => setScene(i, { label: v }))}
                <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)_70px] gap-2">
                  {field("Before", s.prefix, (v) => setScene(i, { prefix: v || undefined }), { placeholder: "$" })}
                  <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>From</span><input className="s-input" type="number" value={s.from} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setScene(i, { from: v }); }} aria-label="From" /></label>
                  <label className="grid gap-1"><span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>To</span><input className="s-input" type="number" value={s.to} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setScene(i, { to: v }); }} aria-label="To" /></label>
                  {field("After", s.suffix, (v) => setScene(i, { suffix: v || undefined }), { placeholder: "%" })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {field("Old label", s.fromLabel, (v) => setScene(i, { fromLabel: v || undefined }), { placeholder: "Last year" })}
                  {field("Change label", s.toLabel, (v) => setScene(i, { toLabel: v || undefined }), { placeholder: "Optional" })}
                </div>
              </>)}
              {s.template === "points" && (<>
                {field("Title", s.title, (v) => setScene(i, { title: v }))}
                {s.points.map((pt, j) => <div key={j}>{field(`Point ${j + 1}`, pt, (v) => setScene(i, { points: s.points.map((x, k) => (k === j ? v : x)) }))}</div>)}
              </>)}
              {s.template === "product-reveal" && (<>
                {field("Name", s.name, (v) => setScene(i, { name: v }))}
                <div className="grid grid-cols-2 gap-2">{field("Price", s.price, (v) => setScene(i, { price: v || undefined }), { placeholder: "Optional" })}{field("Line", s.tagline, (v) => setScene(i, { tagline: v || undefined }), { placeholder: "Optional" })}</div>
                {pictures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pictures.slice(0, 10).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <button key={p.url} title={p.title} onClick={() => setScene(i, { image: p.url })} className="h-12 w-12 rounded-lg overflow-hidden" style={{ border: `2px solid ${s.image === p.url ? "var(--s-ai)" : "var(--s-line)"}` }}><img src={p.url} alt={p.title} className="h-full w-full object-cover" /></button>
                    ))}
                  </div>
                )}
              </>)}
              {s.template === "story" && (<>
                {s.lines.map((l, j) => {
                  const setLine = (patch: Partial<StoryLine>) => setScene(i, { lines: s.lines.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                  return (
                    <div key={j} className="grid gap-1">
                      <div className="flex gap-1.5 items-end">
                        <div className="flex-1 min-w-0">{field(`Line ${j + 1}`, l.text, (v) => setLine({ text: v }))}</div>
                        <button className="s-btn ghost sm" onClick={() => setScene(i, { lines: s.lines.filter((_, k) => k !== j) })} aria-label={`Remove line ${j + 1}`}><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <div className="s-seg" role="group" aria-label={`Line ${j + 1} size`}>{(["s", "m", "l", "xl"] as const).map((z) => <button key={z} aria-pressed={l.size === z} onClick={() => setLine({ size: z })}>{z.toUpperCase()}</button>)}</div>
                        <div className="s-seg" role="group" aria-label={`Line ${j + 1} side`}>{(["left", "center", "right"] as const).map((z) => <button key={z} aria-pressed={l.align === z} onClick={() => setLine({ align: z })}>{z === "left" ? "Left" : z === "center" ? "Mid" : "Right"}</button>)}</div>
                        <button className="s-chip" aria-pressed={l.accent} onClick={() => setLine({ accent: !l.accent })} title="In the accent colour">Accent</button>
                      </div>
                    </div>
                  );
                })}
                {s.lines.length < 6 && <button className="s-btn ghost sm justify-self-start" onClick={() => setScene(i, { lines: [...s.lines, { text: "", size: "m", accent: false, align: "center" }] })}><Plus className="h-3.5 w-3.5" /> Add a line</button>}
                <div className="flex flex-wrap gap-1">
                  <div className="s-seg" role="group" aria-label="Shapes">{(["plain", "dots", "hill", "sunrise"] as const).map((b) => <button key={b} aria-pressed={s.backdrop === b} onClick={() => setScene(i, { backdrop: b })}>{b === "plain" ? "Plain" : b === "dots" ? "Circles" : b === "hill" ? "Hill" : "Sunrise"}</button>)}</div>
                  <div className="s-seg" role="group" aria-label="Words at">{(["top", "center", "bottom"] as const).map((b) => <button key={b} aria-pressed={s.place === b} onClick={() => setScene(i, { place: b })}>{b === "top" ? "Top" : b === "center" ? "Middle" : "Bottom"}</button>)}</div>
                  <div className="s-seg" role="group" aria-label="Words arrive">{(["blur", "rise", "pop"] as const).map((b) => <button key={b} aria-pressed={s.enter === b} onClick={() => setScene(i, { enter: b })}>{b === "blur" ? "Blur in" : b === "rise" ? "Rise" : "Pop"}</button>)}</div>
                </div>
                {(s.picture || s.placeholder) && (
                  <div className="grid gap-1.5">
                    <span className="text-[11.5px]" style={{ color: s.picture ? "var(--s-soft)" : "var(--s-warn)" }}>{s.picture ? "Picture" : `Add a photo here: ${s.placeholder}`}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {allPictures.slice(0, 12).map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <button key={p.url} title={p.title} onClick={() => setScene(i, { picture: p.url, placeholder: undefined })} className="h-12 w-12 rounded-lg overflow-hidden" style={{ border: `2px solid ${s.picture === p.url ? "var(--s-ai)" : "var(--s-line)"}` }}><img src={p.url} alt={p.title} className="h-full w-full object-cover" /></button>
                      ))}
                      <label className="h-12 w-12 rounded-lg grid place-items-center cursor-pointer" style={{ border: "1.5px dashed var(--s-line-2)" }} title="Upload a photo" aria-label="Upload a photo">
                        {uploadingFor === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" style={{ color: "var(--s-soft)" }} />}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void uploadPicture(i, f); }} />
                      </label>
                    </div>
                    <div className="s-seg" role="group" aria-label="Picture shape">{(["circle", "card", "none"] as const).map((f) => <button key={f} aria-pressed={s.frame === f} onClick={() => setScene(i, { frame: f })}>{f === "circle" ? "Circle" : f === "card" ? "Card" : "As it is"}</button>)}</div>
                  </div>
                )}
                {!s.picture && !s.placeholder && <button className="s-btn ghost sm justify-self-start" onClick={() => setScene(i, { placeholder: "a photo", frame: "circle" })}><ImagePlus className="h-3.5 w-3.5" /> Add a picture</button>}
              </>)}
              {s.template === "logo-sting" && field("Tagline", s.tagline, (v) => setScene(i, { tagline: v || undefined }), { placeholder: "Optional" })}
              {s.template === "lower-third" && (<>{field("Title", s.title, (v) => setScene(i, { title: v }))}{field("Smaller line", s.subtitle, (v) => setScene(i, { subtitle: v || undefined }), { placeholder: "Optional" })}</>)}
              {s.template === "screen" && (<>
                {field("Label", s.label, (v) => setScene(i, { label: v }))}
                {field("Smaller line", s.sub, (v) => setScene(i, { sub: v || undefined }), { placeholder: "Optional" })}
                <div className="flex gap-1" role="group" aria-label="Device">
                  {(["phone", "laptop", "none"] as const).map((d) => <button key={d} type="button" className="s-chip" aria-pressed={s.device === d} onClick={() => setScene(i, { device: d })}>{d === "none" ? "No frame" : d === "phone" ? "Phone" : "Laptop"}</button>)}
                </div>
                <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>Click the screenshot where it should point.</span>
                <div className="relative w-full overflow-hidden rounded-lg cursor-crosshair" style={{ aspectRatio: String(s.aspect), maxHeight: 260 }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const cx = (e.clientX - r.left) / r.width, cy = (e.clientY - r.top) / r.height;
                    const [, , w, h] = s.box;
                    setScene(i, { box: [Math.min(1 - w, Math.max(0, cx - w / 2)), Math.min(1 - h, Math.max(0, cy - h / 2)), w, h] });
                  }} role="button" aria-label="Where this step points">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt="" className="w-full h-full object-cover" />
                  <span className="absolute pointer-events-none rounded" style={{ left: `${s.box[0] * 100}%`, top: `${s.box[1] * 100}%`, width: `${s.box[2] * 100}%`, height: `${s.box[3] * 100}%`, border: "2px solid var(--s-accent)" }} />
                </div>
                <div className="flex gap-1">
                  <button type="button" className="s-btn ghost sm" onClick={() => { const [x, y, w, h] = s.box; const nw = Math.min(1 - x, w * 1.25), nh = Math.min(1 - y, h * 1.25); setScene(i, { box: [x, y, nw, nh] }); }}>Bigger</button>
                  <button type="button" className="s-btn ghost sm" onClick={() => { const [x, y, w, h] = s.box; setScene(i, { box: [x, y, Math.max(0.03, w * 0.8), Math.max(0.03, h * 0.8)] }); }}>Smaller</button>
                </div>
              </>)}
              {s.template === "end-card" && (<>
                {field("Call to action", s.cta, (v) => setScene(i, { cta: v }))}
                <div className="grid grid-cols-2 gap-2">{field("Handle", s.handle, (v) => setScene(i, { handle: v || undefined }), { placeholder: "@yourbrand" })}{field("Website", s.website, (v) => setScene(i, { website: v || undefined }), { placeholder: "Optional" })}</div>
              </>)}
    </>
  );

  return (
    <Modal open={open} onClose={() => (busy ? abort.current?.abort() : onClose())} label="Motion" width={1680} className="ms-modal">
      <div className="ms" onPointerMove={(e) => { onDrag(e); onPartDrag(e); }} onPointerUp={() => { endDrag(); endPartDrag(); }} onPointerCancel={() => { endDrag(); endPartDrag(); }} onClick={() => setMenu(null)}>
        {/* Top bar */}
        <div className="ms-top">
          <b className="text-[14px]">Motion</b>
          <span className="s-badge">{view.kind === "overlay" ? "Over your video" : "Full frame"} · {view.shape} · {totalSeconds(view).toFixed(1)} s</span>
          {look && <span className="s-badge ai" title={`Adapted from Lemo-Opuscar's ${look.from}`}>{look.name}</span>}
          <div className="flex-1" />
          <button className="s-btn ghost sm" onClick={() => setLooksOpen(true)}><Sparkles className="h-3.5 w-3.5" /> Looks</button>
          <button className="s-btn ghost sm" disabled={!!busy || rewriting} onClick={onRewrite}>{rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Write again <span className="cost">4 cr</span></button>
          {standalone ? (
            <button className="s-btn primary sm" disabled={!!busy || !clientId} onClick={() => add("library")}><Plus className="h-3.5 w-3.5" /> {view.kind === "overlay" ? "Make the see-through clip" : "Make it"} <span className="cost">free</span></button>
          ) : view.kind === "overlay" ? (
            <button className="s-btn primary sm" disabled={!!busy || !clientId} onClick={() => add("playhead")}><Plus className="h-3.5 w-3.5" /> Add over the video at the playhead</button>
          ) : (
            <>
              <button className="s-btn primary sm" disabled={!!busy || !clientId} onClick={() => add("start")}><Plus className="h-3.5 w-3.5" /> Add at the start</button>
              <button className="s-btn sm" disabled={!!busy || !clientId} onClick={() => add("end")}><Plus className="h-3.5 w-3.5" /> Add at the end</button>
            </>
          )}
          <button className="s-btn ghost sm" onClick={() => (busy ? abort.current?.abort() : onClose())} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="ms-body">
          {/* Tools */}
          <nav className="ms-rail" aria-label="Motion tools">
            <button type="button" onClick={() => addLayer(newLayer("text", { color: view.palette.text }))} title="Add words"><Type className="h-4 w-4" /><span>Text</span></button>
            <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} title="Add a picture"><ImagePlus className="h-4 w-4" /><span>Picture</span></button>
            <button type="button" onClick={() => addLayer(newLayer("shape", { fill: view.palette.accent }))} title="Add a shape"><Shapes className="h-4 w-4" /><span>Shape</span></button>
            <button type="button" onClick={() => setLooksOpen(true)} title="Restyle the whole clip"><Sparkles className="h-4 w-4" /><span>Looks</span></button>
            <button type="button" onClick={() => { setLayerId(null); setTab("design"); document.getElementById("ms-clip")?.scrollIntoView({ behavior: "smooth" }); }} title="Colours, font and background"><PaletteIcon className="h-4 w-4" /><span>Style</span></button>
            {picking && (
              <div className="ms-pop" role="dialog" aria-label="Add a picture">
                <b className="text-[12px]">Add a picture</b>
                <div className="grid grid-cols-3 gap-1.5">
                  {allPictures.slice(0, 15).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <button key={p.url} type="button" onClick={() => addPicture(p.url)} title={p.title} className="aspect-square rounded-lg overflow-hidden" style={{ border: "1px solid var(--s-line)" }}><img src={p.url} alt={p.title} className="h-full w-full object-cover" /></button>
                  ))}
                  <label className="aspect-square rounded-lg grid place-items-center cursor-pointer" style={{ border: "1.5px dashed var(--s-line-2)" }} title="Upload a picture">
                    {uploadingFor === -2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" style={{ color: "var(--s-soft)" }} />}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Picture layer file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; setUploadingFor(-2); const url = await uploadFile(f, "motion_layer"); setUploadingFor(null); if (url) addPicture(url); }} />
                  </label>
                </div>
                {!allPictures.length && <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>Upload one, or make pictures in Create first.</span>}
              </div>
            )}
          </nav>

          {/* Canvas */}
          <div className="ms-stage">
            <div className="ms-canvas-wrap">
              <div className="ms-canvas" style={{ aspectRatio: `${width} / ${height}`, ...(tall ? { height: "100%" } : { width: "100%" }), background: view.kind === "overlay" ? "linear-gradient(135deg,#3a4250,#1b1f26)" : "#000" }}>
                {/* Only the picture is clipped to the frame; a layer hanging off the edge keeps its handles. */}
                <div className="ms-frame" ref={frameEl}>
                  <Player
                    ref={player} component={MotionVideo} inputProps={props} durationInFrames={frames} fps={MOTION_FPS}
                    compositionWidth={width} compositionHeight={height} controls={false} clickToPlay={false} loop={false} autoPlay={false}
                    initialFrame={Math.min(frames - 1, settled(0))} acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }}
                  />
                </div>
                {/* What you can grab: this scene's layers, shown while the preview is still. */}
                <div ref={canvas} className="ms-overlay" style={{ pointerEvents: playing ? "none" : "auto" }} onPointerDown={() => { setLayerId(null); setPartId(null); setMenu(null); }}>
                  {/* The AI's own parts first (your layers draw over them, so they're on top here too). */}
                  {!playing && partBoxes.map((b) => {
                    const sel = b.id === partId;
                    return (
                      <div key={`part-${b.id}`} className={`ms-box part${sel ? " sel" : ""}`} role="button" tabIndex={0} aria-label={`Part: ${b.name}`} aria-pressed={sel}
                        style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                        onFocus={() => { setPartId(b.id); setLayerId(null); }}
                        onPointerDown={(e) => startPartDrag(e, b, "move")}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setPartId(b.id); setLayerId(null); setMenu({ x: e.clientX, y: e.clientY, id: `part:${b.id}` }); }}>
                        {sel && <span className="ms-tag">{b.name}</span>}
                        {sel && (["nw", "ne", "sw", "se"] as const).map((h) => <i key={h} className={`ms-h ${h}`} onPointerDown={(e) => startPartDrag(e, b, h)} />)}
                      </div>
                    );
                  })}
                  {!playing && layers.map((l) => {
                    const sel = l.id === layerId;
                    return (
                      <div key={l.id} className={`ms-box${sel ? " sel" : ""}${l.locked ? " locked" : ""}`} role="button" aria-label={`Layer: ${layerName(l)}`} aria-pressed={sel}
                        style={{ left: `${(l.x - l.w / 2) * 100}%`, top: `${(l.y - l.h / 2) * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%`, transform: `rotate(${l.rotate}deg)` }}
                        onPointerDown={(e) => startDrag(e, l, "move")}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setLayerId(l.id); setMenu({ x: e.clientX, y: e.clientY, id: l.id }); }}>
                        {sel && !l.locked && (["nw", "ne", "sw", "se"] as const).map((h) => <i key={h} className={`ms-h ${h}`} onPointerDown={(e) => startDrag(e, l, h)} />)}
                        {l.locked && sel && <Lock className="ms-lock h-3 w-3" />}
                      </div>
                    );
                  })}
                  {guide.x && <i className="ms-guide v" />}
                  {guide.y && <i className="ms-guide h" />}
                </div>
                {busy && (
                  <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(12,13,15,.7)", zIndex: 5 }}>
                    <div className="grid justify-items-center gap-2 text-center">
                      <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--s-ai)" }} />
                      <b className="text-[14px]">{busy}</b>
                      {busy.startsWith("Rendering") && <span className="mono text-[12px]">{progress}% · keep this tab open</span>}
                      <button className="s-btn sm" onClick={() => abort.current?.abort()}>Stop</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Transport */}
            <div className="ms-transport">
              <button className="s-btn sm" onClick={() => (playing ? player.current?.pause() : playAll())} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
              <button className="s-btn ghost sm" onClick={playScene} title="Play just this scene">Play scene {si + 1}</button>
              <input type="range" className="flex-1 min-w-0" min={0} max={frames - 1} value={at} onChange={(e) => { stopAt.current = null; player.current?.pause(); player.current?.seekTo(Number(e.target.value)); const f = Number(e.target.value); const i = starts.findLastIndex((st) => st <= f); if (i >= 0) setSceneIx(i); }} aria-label="Time" />
              <span className="mono text-[11.5px]" style={{ color: "var(--s-mute)" }}>{(at / MOTION_FPS).toFixed(1)} / {totalSeconds(view).toFixed(1)} s</span>
            </div>

            {/* Scenes */}
            <div className="ms-strip" role="list" aria-label="Scenes">
              {view.scenes.map((s, i) => (
                <div key={i} role="listitem" className={`ms-card${i === si ? " sel" : ""}`} onClick={() => { setLayerId(null); goTo(i); }}>
                  <span className="mono text-[10.5px]" style={{ color: "var(--s-mute)" }}>{i + 1} · {s.seconds.toFixed(1)} s{s.layers?.length ? ` · ${s.layers.length} layer${s.layers.length === 1 ? "" : "s"}` : ""}</span>
                  <b className="text-[12.5px] truncate">{label(s)}</b>
                  {i === si && (
                    <span className="flex gap-0.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                      <button className="s-btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move scene earlier"><ArrowLeft className="h-3 w-3" /></button>
                      <button className="s-btn ghost sm" disabled={i === view.scenes.length - 1} onClick={() => move(i, 1)} aria-label="Move scene later"><ArrowRight className="h-3 w-3" /></button>
                      <button className="s-btn ghost sm" onClick={() => duplicateScene(i)} aria-label="Duplicate scene"><Copy className="h-3 w-3" /></button>
                      {view.scenes.length > 1 && <button className="s-btn ghost sm" onClick={() => remove(i)} aria-label="Remove scene"><Trash2 className="h-3 w-3" /></button>}
                    </span>
                  )}
                </div>
              ))}
              {view.kind !== "overlay" && (
                <div className="relative">
                  <button className="ms-card add" onClick={(e) => { e.stopPropagation(); setAdding((a) => !a); }} aria-expanded={adding}><Plus className="h-4 w-4" /><span className="text-[12px]">Scene</span></button>
                  {adding && (
                    <div className="ms-pop up" role="menu" aria-label="Add a scene" onClick={(e) => e.stopPropagation()}>
                      {ADDABLE_TEMPLATES.map((t) => <button key={t} type="button" role="menuitem" className="ms-menuitem" onClick={() => addScene(t)}>{MOTION_TEMPLATES.find((x) => x.id === t)?.label}<small>{MOTION_TEMPLATES.find((x) => x.id === t)?.line}</small></button>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inspector */}
          <aside className="ms-insp" aria-label="Inspector">
            <div className="s-seg w-full grid grid-cols-2" role="tablist" aria-label="Inspector">
              <button role="tab" aria-selected={tab === "design"} onClick={() => setTab("design")}>Design</button>
              <button role="tab" aria-selected={tab === "animation"} onClick={() => setTab("animation")}>Animation</button>
            </div>
            <div className="ms-insp-body">
              {layer ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <button className="s-btn ghost sm -ml-1" onClick={() => setLayerId(null)} aria-label="Back to the scene"><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <b className="text-[13px] truncate flex-1 min-w-0">{layerName(layer)}</b>
                    <button className="s-btn ghost sm" onClick={() => patchLayer(layer.id, { locked: layer.locked ? undefined : true })} aria-label={layer.locked ? "Unlock layer" : "Lock layer"}>{layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button>
                    <button className="s-btn ghost sm" onClick={() => addLayer(duplicateLayer(layer))} aria-label="Duplicate layer"><Copy className="h-3.5 w-3.5" /></button>
                    <button className="s-btn ghost sm" onClick={() => removeLayer(layer.id)} aria-label="Delete layer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {tab === "design" ? (
                    <>
                      <div className="ms-sec"><span className="s-label">Layout</span>
                        <div className="grid grid-cols-2 gap-2">{pct("X %", layer.x, (v) => patchLayer(layer.id, { x: v }))}{pct("Y %", layer.y, (v) => patchLayer(layer.id, { y: v }))}{pct("Width %", layer.w, (v) => patchLayer(layer.id, { w: Math.max(0.02, v) }))}{pct("Height %", layer.h, (v) => patchLayer(layer.id, { h: Math.max(0.02, v) }))}</div>
                        {range("Turn", layer.rotate, -180, 180, 1, (v) => patchLayer(layer.id, { rotate: v }), (v) => `${v}°`)}
                        {range("Opacity", Math.round(layer.opacity * 100), 0, 100, 1, (v) => patchLayer(layer.id, { opacity: v / 100 }), (v) => `${v}%`)}
                        <div className="flex gap-1.5"><button className="s-btn ghost sm" onClick={() => onSpec(setLayers(reorderLayer(layers, layer.id, 1)))} aria-label="Bring forward"><ArrowUp className="h-3.5 w-3.5" /> Forward</button><button className="s-btn ghost sm" onClick={() => onSpec(setLayers(reorderLayer(layers, layer.id, -1)))} aria-label="Send backward"><ArrowDown className="h-3.5 w-3.5" /> Back</button><button className="s-btn ghost sm" onClick={() => patchLayer(layer.id, { x: 0.5, y: 0.5 })}>Centre</button></div>
                      </div>
                      {layer.kind === "text" && (
                        <div className="ms-sec"><span className="s-label">Text</span>
                          <textarea className="s-input" rows={2} value={layer.text} onChange={(e) => patchLayer(layer.id, { text: e.target.value })} aria-label="Layer words" />
                          {range("Size", Math.round(layer.size * 1000), 15, 300, 1, (v) => patchLayer(layer.id, { size: v / 1000 }))}
                          <div className="flex gap-2 items-center flex-wrap">
                            <div className="s-seg" role="group" aria-label="Weight">{[400, 600, 800, 900].map((w) => <button key={w} aria-pressed={layer.weight === w} onClick={() => patchLayer(layer.id, { weight: w })}>{w === 400 ? "Regular" : w === 600 ? "Semi" : w === 800 ? "Bold" : "Black"}</button>)}</div>
                            <div className="s-seg" role="group" aria-label="Align">{(["left", "center", "right"] as const).map((a) => <button key={a} aria-pressed={layer.align === a} onClick={() => patchLayer(layer.id, { align: a })}>{a === "left" ? "Left" : a === "center" ? "Mid" : "Right"}</button>)}</div>
                          </div>
                          {swatches(layer.color, (c) => patchLayer(layer.id, { color: c }))}
                        </div>
                      )}
                      {layer.kind === "image" && (
                        <div className="ms-sec"><span className="s-label">Picture</span>
                          <div className="s-seg" role="group" aria-label="Fit">{(["cover", "contain"] as const).map((f) => <button key={f} aria-pressed={layer.fit === f} onClick={() => patchLayer(layer.id, { fit: f })}>{f === "cover" ? "Fill the box" : "Show it all"}</button>)}</div>
                          {range("Corners", Math.round(layer.radius * 100), 0, 50, 1, (v) => patchLayer(layer.id, { radius: v / 100 }))}
                          <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>Drag a corner to make it bigger or smaller; it keeps its shape (hold Alt to stretch).</span>
                          <div className="flex flex-wrap gap-1.5">{allPictures.slice(0, 10).map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <button key={p.url} onClick={() => patchLayer(layer.id, { src: p.url } as Partial<MotionLayer>)} title={`Swap for ${p.title}`} className="h-10 w-10 rounded-md overflow-hidden" style={{ border: `2px solid ${layer.src === p.url ? "var(--s-ai)" : "var(--s-line)"}` }}><img src={p.url} alt="" className="h-full w-full object-cover" /></button>
                          ))}</div>
                        </div>
                      )}
                      {layer.kind === "shape" && (
                        <div className="ms-sec"><span className="s-label">Shape</span>
                          <div className="s-seg" role="group" aria-label="Shape kind">{LAYER_SHAPES.map((sh) => <button key={sh} aria-pressed={layer.shape === sh} onClick={() => patchLayer(layer.id, { shape: sh } as Partial<MotionLayer>)}>{SHAPE_LABEL[sh]}</button>)}</div>
                          {layer.shape === "rect" && range("Corners", Math.round(layer.radius * 100), 0, 50, 1, (v) => patchLayer(layer.id, { radius: v / 100 }))}
                          {swatches(layer.fill, (c) => patchLayer(layer.id, { fill: c } as Partial<MotionLayer>))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ms-sec"><span className="s-label">How it arrives</span>
                      <div className="grid grid-cols-3 gap-1">{LAYER_ENTERS.map((en) => <button key={en} className="s-chip justify-center" aria-pressed={layer.enter === en} onClick={() => patchLayer(layer.id, { enter: en })}>{LAYER_ENTER_LABEL[en]}</button>)}</div>
                      {range("After", layer.delay, 0, Math.max(0.5, scene.seconds - 0.5), 0.1, (v) => patchLayer(layer.id, { delay: v }), (v) => `${v.toFixed(1)} s`)}
                      <button className="s-btn sm justify-self-start" onClick={playScene}><Play className="h-3.5 w-3.5" /> Play this scene</button>
                    </div>
                  )}
                </>
              ) : scene ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <b className="text-[13px] flex-1 min-w-0 truncate">Scene {si + 1} · {label(scene)}</b>
                    <label className="flex items-center gap-1 text-[11.5px]" style={{ color: "var(--s-soft)" }}>
                      <input type="number" step={0.5} min={1} max={10} className="s-input" style={{ width: 64, height: 28 }} value={scene.seconds} onChange={(e) => setScene(si, { seconds: Number(e.target.value) || scene.seconds })} aria-label={`Scene ${si + 1} seconds`} /> s
                    </label>
                  </div>
                  {part && (() => {
                    const n = nudgeOf(part.id);
                    return (
                      <div className="ms-sec ms-part-sec" role="group" aria-label={`${part.name}, moved`}>
                        <span className="s-label flex items-center gap-1"><Move className="h-3 w-3" /> {part.name}</span>
                        {range("Size", Math.round(n.scale * 100), 20, 400, 1, (v) => onSpec(setPart(part.id, { ...n, scale: v / 100 })), (v) => `${v}%`)}
                        <div className="flex gap-1.5 flex-wrap">
                          <button className="s-btn ghost sm" onClick={() => onSpec(setPart(part.id, { ...n, dx: n.dx + 0.5 - (part.x + part.w / 2), dy: n.dy + 0.5 - (part.y + part.h / 2) }))}>Centre it</button>
                          <button className="s-btn ghost sm" disabled={!scene.parts?.[part.id]} onClick={() => onSpec(setPart(part.id, null))}><Undo2 className="h-3.5 w-3.5" /> Put it back</button>
                        </div>
                        <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>Drag it on the canvas, pull a corner to resize it, or use the arrow keys (Shift for bigger steps). It still animates the same way, from where you put it. Its words are below.</span>
                      </div>
                    );
                  })()}
                  <div className="ms-sec"><span className="s-label flex items-center gap-1"><LayersIcon className="h-3 w-3" /> Layers</span>
                    {layers.length ? (
                      <div className="grid gap-1">{[...layers].reverse().map((l) => (
                        <button key={l.id} type="button" className="ms-layer" onClick={() => { setLayerId(l.id); goTo(si); }}>
                          {l.kind === "image" ? <ImagePlus className="h-3.5 w-3.5" /> : l.kind === "text" ? <Type className="h-3.5 w-3.5" /> : <Shapes className="h-3.5 w-3.5" />}
                          <span className="flex-1 min-w-0 truncate text-left">{layerName(l)}</span>
                          {l.locked && <Lock className="h-3 w-3" />}
                        </button>
                      ))}</div>
                    ) : <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>None yet. Add words, a picture or a shape from the left. Anything on the canvas can be dragged, including what the AI made.</span>}
                  </div>
                  {tab === "design" ? (
                    <>
                      <div className="ms-sec"><span className="s-label">{label(scene)}</span>{sceneFields(scene, si)}</div>
                      <div className="ms-sec" id="ms-clip"><span className="s-label">The whole clip</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] flex-1 min-w-0" style={{ color: "var(--s-soft)" }}>Look: <b style={{ color: "var(--s-text)" }}>{look ? look.name : "Your brand"}</b></span>
                          <button className="s-btn sm" onClick={() => setLooksOpen(true)}><Sparkles className="h-3.5 w-3.5" /> Change</button>
                        </div>
                        <label className="ms-row"><span>Font</span>
                          <select className="s-input" value={view.font ?? ""} onChange={(e) => onSpec({ ...spec, font: e.target.value || undefined })} aria-label="Font">
                            <option value="">{brand.font ? `${brand.font} (brand)` : "Brand font"}</option>
                            {[...new Set([...(look ? [look.font] : []), ...FONT_CHOICES])].map((f) => <option key={f} value={f}>{f}{look?.font === f ? " (look)" : ""}</option>)}
                          </select>
                        </label>
                        <div className="flex items-center gap-3 flex-wrap">
                          {(["background", "text", "accent", "second"] as const).map((k) => (
                            <label key={k} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>
                              <input type="color" value={view.palette[k] ?? view.palette.accent} onChange={(e) => setColour(k, e.target.value.toUpperCase())} className="h-7 w-9 rounded-md cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} aria-label={`${k} colour`} />
                              {k === "background" ? (view.kind === "overlay" ? "Bar" : "Background") : k === "text" ? "Text" : k === "accent" ? "Accent" : "Second"}
                            </label>
                          ))}
                        </div>
                        {view.kind !== "overlay" && (
                          <div className="grid gap-1.5">
                            <span className="text-[11.5px]" style={{ color: "var(--s-soft)" }}>Background picture: the words and shapes play over it, drifting slowly with a soft fade.</span>
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => onSpec({ ...spec, background: undefined })} className="h-11 w-11 rounded-lg grid place-items-center text-[10px]" style={{ border: `2px solid ${!view.background ? "var(--s-ai)" : "var(--s-line)"}`, color: "var(--s-soft)" }} title="No background picture">None</button>
                              {[...new Set([...(view.background ? [view.background] : []), ...allPictures.map((p) => p.url)])].slice(0, 11).map((url) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <button key={url} onClick={() => onSpec({ ...spec, background: url })} className="h-11 w-11 rounded-lg overflow-hidden" style={{ border: `2px solid ${view.background === url ? "var(--s-ai)" : "var(--s-line)"}` }} title="Use as the background"><img src={url} alt="" className="h-full w-full object-cover" /></button>
                              ))}
                              <label className="h-11 w-11 rounded-lg grid place-items-center cursor-pointer" style={{ border: "1.5px dashed var(--s-line-2)" }} title="Upload a background picture" aria-label="Upload a background picture">
                                {uploadingFor === -1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" style={{ color: "var(--s-soft)" }} />}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Background picture file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void uploadBackground(f); }} />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="ms-sec"><span className="s-label">Animation</span>
                      <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Pick a layer to choose how it arrives and when. The {label(scene).toLowerCase()} animates by itself; its words arrive the way set under Design.</span>
                      <button className="s-btn sm justify-self-start" onClick={playScene}><Play className="h-3.5 w-3.5" /> Play this scene</button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <span className="text-[11px] px-1" style={{ color: "var(--s-mute)" }}>{standalone ? "Renders on this computer in a few seconds and goes to your Library." : "Renders on this computer in a few seconds, then lands on the timeline and in your Library."} Every edit is free.</span>
          </aside>
        </div>

        {/* Right-click menu on a layer */}
        {menu && (() => {
          const item = (text: string, on: () => void, danger = false) => <button type="button" role="menuitem" className="ms-menuitem" style={danger ? { color: "var(--s-danger)" } : undefined} onClick={() => { on(); setMenu(null); }}>{text}</button>;
          if (menu.id.startsWith("part:")) {
            const b = partBoxes.find((x) => `part:${x.id}` === menu.id);
            if (!b) return null;
            const n = nudgeOf(b.id);
            return (
              <div className="ms-ctx" role="menu" aria-label={b.name} style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
                {item("Bigger", () => onSpec(setPart(b.id, { ...n, scale: Math.min(4, n.scale * 1.15) })))}
                {item("Smaller", () => onSpec(setPart(b.id, { ...n, scale: Math.max(0.2, n.scale / 1.15) })))}
                {item("Centre it", () => onSpec(setPart(b.id, { ...n, dx: n.dx + 0.5 - (b.x + b.w / 2), dy: n.dy + 0.5 - (b.y + b.h / 2) })))}
                <hr />
                {item("Put it back", () => onSpec(setPart(b.id, null)))}
              </div>
            );
          }
          const l = layers.find((x) => x.id === menu.id);
          if (!l) return null;
          return (
            <div className="ms-ctx" role="menu" aria-label="Layer" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
              {item("Bring forward", () => onSpec(setLayers(reorderLayer(layers, l.id, 1))))}
              {item("Bring to front", () => onSpec(setLayers(reorderLayer(layers, l.id, layers.length))))}
              {item("Send backward", () => onSpec(setLayers(reorderLayer(layers, l.id, -1))))}
              {item("Send to back", () => onSpec(setLayers(reorderLayer(layers, l.id, -layers.length))))}
              <hr />
              {item("Duplicate", () => addLayer(duplicateLayer(l)))}
              {item(l.locked ? "Unlock" : "Lock", () => patchLayer(l.id, { locked: l.locked ? undefined : true }))}
              {item("Centre it", () => patchLayer(l.id, { x: 0.5, y: 0.5 }))}
              <hr />
              {item("Delete", () => removeLayer(l.id), true)}
            </div>
          );
        })()}
      </div>

      <LooksModal open={looksOpen} onClose={() => setLooksOpen(false)} spec={spec} brand={brand} clientId={clientId} onUse={(s) => { onSpec(s); setLooksOpen(false); }} />
    </Modal>
  );
}

/**
 * Looks (2026-10-23): twelve design grammars adapted from Lemo-Opuscar's style sheets, previewed on
 * this very clip before they're used. The brand's colour stays the accent unless switched off.
 */
function LooksModal({ open, onClose, spec, brand, clientId, onUse }: {
  open: boolean; onClose: () => void; spec: MotionSpec; brand: MotionBrand & { primary?: string | null; secondary?: string | null }; clientId: string | null; onUse: (s: MotionSpec) => void;
}) {
  const [pick, setPick] = useState<string | null>(spec.look ?? null);
  const [brandAccent, setBrandAccent] = useState(true);
  useEffect(() => { if (open) LOOKS.forEach((l) => void ensureMotionFont(l.font, clientId)); }, [open, clientId]);
  const preview = useMemo(() => applyLook(spec, pick, brand, brandAccent), [spec, pick, brand, brandAccent]);
  const { width, height } = sizeFor(spec.shape);
  const tall = height > width;
  const props = useMemo(() => ({ spec: preview, brand }), [preview, brand]);
  return (
    <Modal open={open} onClose={onClose} label="Looks" width={1180} padded>
      <div className="flex items-center gap-2 mb-3">
        <b className="text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Looks</b>
        <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Restyle the whole clip: page, ink, typeface, texture and how things arrive.</span>
        <div className="flex-1" />
        <button className="s-btn ghost sm" onClick={onClose} aria-label="Close looks"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }} role="listbox" aria-label="Looks">
          <button type="button" role="option" aria-selected={pick === null} onClick={() => setPick(null)} className={`ms-look${pick === null ? " sel" : ""}`} style={{ background: "linear-gradient(150deg, #1b1f26, #0C0D0F)" }}>
            <b style={{ color: "#ECEDEE" }}>Your brand</b>
            <span className="flex gap-1">{[brand.primary, brand.secondary].filter(Boolean).map((c) => <i key={c!} style={{ background: c! }} />)}</span>
            <small style={{ color: "#A9AEB6" }}>Your colours and font, as planned.</small>
          </button>
          {LOOKS.map((l) => (
            <button key={l.id} type="button" role="option" aria-selected={pick === l.id} onClick={() => setPick(l.id)} className={`ms-look${pick === l.id ? " sel" : ""}`} style={{ background: l.palette.background }}>
              <b style={{ color: l.palette.text, fontFamily: `"${l.font}", Inter, sans-serif` }}>{l.name}</b>
              <span className="flex gap-1">{[l.palette.text, brandAccent && brand.primary ? brand.primary : l.palette.accent, l.palette.second].map((c, k) => <i key={k} style={{ background: c }} />)}</span>
              <small style={{ color: l.palette.text, opacity: 0.75 }}>{l.line}</small>
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:sticky md:top-0">
          <div className="grid place-items-center rounded-xl overflow-hidden" style={{ background: "#000", height: tall ? 460 : undefined }}>
            <div style={{ aspectRatio: `${width} / ${height}`, ...(tall ? { height: "100%" } : { width: "100%" }) }}>
              <Player component={MotionVideo} inputProps={props} durationInFrames={Math.max(1, totalFrames(preview))} fps={MOTION_FPS} compositionWidth={width} compositionHeight={height} loop autoPlay controls acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--s-soft)" }}><input type="checkbox" checked={brandAccent} onChange={(e) => setBrandAccent(e.target.checked)} /> Use my brand colour as the accent</label>
          {pick && <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>Adapted from the {lookById(pick)?.from} style in Lemo-Opuscar by LemoLab (MIT).</span>}
          <button className="s-btn primary justify-center" onClick={() => onUse(applyLook(spec, pick, brand, brandAccent))}>{pick ? `Use ${lookById(pick)?.name}` : "Use my brand look"}</button>
        </div>
      </div>
    </Modal>
  );
}
