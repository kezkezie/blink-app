"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Canvas, Rect, Ellipse, Line, Polygon, Textbox, FabricImage, Path, PencilBrush, loadSVGFromString, util,
  FabricObject, Group, filters, Circle as FabricCircle, Point, cache as fabricCache, type TPointerEventInfo, type TPointerEvent,
} from "fabric";
import { EraserBrush } from "@erase2d/fabric";
import {
  MousePointer2, Hand, Type, Square, Circle, Minus, Star, Hexagon, PenTool, Brush, Eraser, ImagePlus, Sparkles,
  Undo2, Redo2, Download, Save, Trash2, Copy, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Loader2,
  Scissors, Wand2, Shapes, ZoomIn, Upload as UploadIcon, LayoutTemplate, ZoomOut, Maximize, Layers as LayersIcon, Ungroup, X, UserRound, Film,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { GOOGLE_FONTS_REGISTRY, loadCustomFont } from "@/lib/fonts";
import { CLEAN_PLATE_PROMPT, CLEAN_PLATE_TOPIC, alphaBounds, measureInk, samePicture, spacingToMatch, type Box, type DesignLayers } from "@/lib/editor/layers";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import type { CanvasLayer, CanvasOp, CanvasSummary } from "@/lib/canvas-ops";
import { ImagePicker, type PickedImage } from "../ImagePicker";
import { useBrandKit, generateBrandImages, generationErrorMessage, nearestImageAspect } from "../generate-image";
import { useAskStore } from "../ask-store";
import { useCredits } from "../hooks";
import { AI_NEEDS_CREDITS } from "@/lib/plans";
import { useCanvasBridge } from "./canvas-bridge";
import { canvasSafe, loadImage, originalUrl, paletteOf, penPath, shrinkToBlob, starPoints, type PenAnchor } from "./util";

import { Overlay } from "../Modal";
/**
 * The image Editor: Photoshop/Pixlr-style layers on a canvas. Shapes, pen, brush and eraser, real
 * text, photos, and AI on the canvas (remove background, swap a face, edit with words, turn a photo
 * into vectors, draw a vector or logo from a sentence). Ask BlinkSpot can edit it too.
 * Built on fabric.js; layers are canvas objects with an id and a name.
 */

FabricObject.customProperties = ["id", "name", "erasable", "srcUrl", "anchors", "closed"];
// fabric 7 positions objects by their centre by default; this editor (and Ask BlinkSpot's
// coordinates) use the top-left corner, like Photoshop, Figma and SVG.
FabricObject.ownDefaults.originX = "left";
FabricObject.ownDefaults.originY = "top";
type FObj = FabricObject & { id?: string; name?: string; srcUrl?: string; anchors?: PenAnchor[]; closed?: boolean; /** The font a split design really used (2026-10-13). */ wantedFont?: string };
type Handle = FabricCircle & { penIndex?: number; penKind?: "anchor" | "handle" };

type Tool = "select" | "hand" | "text" | "rect" | "ellipse" | "line" | "star" | "polygon" | "pen" | "brush" | "eraser";
const SHAPES: Tool[] = ["rect", "ellipse", "line", "star", "polygon"];
const TOOL_INFO: Record<Tool, { label: string; key: string; tip: string; icon: typeof Square }> = {
  select: { label: "Move & select", key: "V", tip: "Click a layer to select it. Drag to move, pull the corners to resize, the top dot to rotate.", icon: MousePointer2 },
  hand: { label: "Hand", key: "H", tip: "Drag to look around when you are zoomed in.", icon: Hand },
  text: { label: "Text", key: "T", tip: "Click where the words should go, then type.", icon: Type },
  rect: { label: "Rectangle", key: "R", tip: "Drag to draw a rectangle. Hold Shift for a square.", icon: Square },
  ellipse: { label: "Ellipse", key: "O", tip: "Drag to draw an ellipse. Hold Shift for a circle.", icon: Circle },
  line: { label: "Line", key: "L", tip: "Drag to draw a straight line.", icon: Minus },
  star: { label: "Star", key: "S", tip: "Drag to draw a star.", icon: Star },
  polygon: { label: "Polygon", key: "G", tip: "Drag to draw a hexagon.", icon: Hexagon },
  pen: { label: "Pen", key: "P", tip: "Click to add points, drag to curve. Click the first point to close the shape; Enter to finish.", icon: PenTool },
  brush: { label: "Brush", key: "B", tip: "Draw freehand.", icon: Brush },
  eraser: { label: "Eraser", key: "E", tip: "Rub out parts of any layer, including photos.", icon: Eraser },
};
const SIZES = [
  { id: "post", label: "Post 4:5", w: 1080, h: 1350 },
  { id: "square", label: "Square", w: 1080, h: 1080 },
  { id: "story", label: "Story 9:16", w: 1080, h: 1920 },
  { id: "wide", label: "Wide 16:9", w: 1920, h: 1080 },
  { id: "logo", label: "Logo 1:1", w: 1000, h: 1000 },
] as const;
// Every font in the registry (56 Google Fonts), favourites first (2026-10-13: "we need more fonts").
const FAVOURITE_FONTS = ["Inter", "Plus Jakarta Sans", "DM Sans", "Montserrat", "Syne", "Space Grotesk", "Playfair Display", "Bebas Neue", "Anton", "Archivo Black"];
const FONTS = [...new Set([...FAVOURITE_FONTS, ...GOOGLE_FONTS_REGISTRY.map((f) => f.family).sort()])];
const uid = () => Math.random().toString(36).slice(2, 10);

const loadedFonts = new Map<string, Promise<void>>();
/** Load a Google Font's stylesheet once; resolves when the stylesheet (not the font) has arrived. */
function ensureFont(family: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const known = loadedFonts.get(family);
  if (known) return known;
  const p = new Promise<void>((resolve) => {
    const reg = GOOGLE_FONTS_REGISTRY.find((f) => f.family === family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${reg?.weights?.join(";") || "400;700"}&display=swap`;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // an uploaded or system font: nothing to fetch
    document.head.appendChild(link);
  });
  loadedFonts.set(family, p);
  return p;
}
/**
 * Re-draw once a web font has arrived (fabric measures text with whatever font is loaded). The
 * font is only fetched once the stylesheet is in and the face is asked for in its weight
 * (2026-10-13: split designs drew in a serif fallback because this ran before the stylesheet).
 */
function whenFontReady(family: string, redraw: () => void, weight: number | string = 700) {
  // fabric keeps each letter's width per font; widths measured with the fallback font before the
  // real one arrived gave uneven gaps ("M ushr oom", 2026-10-13), so they are dropped first.
  const ready = () => { fabricCache.clearFontCache(family); redraw(); };
  void ensureFont(family)
    .then(() => Promise.all([document.fonts?.load(`${weight} 40px "${family}"`), document.fonts?.load(`400 40px "${family}"`)]))
    .then(ready, ready);
}

/** A greyscale 32x40 thumbnail, to tell whether an edit is still the same picture. */
function thumb(src: CanvasImageSource) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 40;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(src, 0, 0, 32, 40);
  const d = x.getImageData(0, 0, 32, 40).data;
  const g = new Array<number>(32 * 40);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return g;
}

/** Where a text layer's letters are drawn, in canvas units (rendered alone, read from its pixels). */
function renderedInk(tb: Textbox) {
  const m = 2;
  const el = tb.toCanvasElement({ multiplier: m });
  const data = el.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, el.width, el.height).data;
  const b = data && alphaBounds(data, el.width, el.height);
  if (!b) return null;
  const c = tb.getCenterPoint();
  const ox = c.x - el.width / (2 * m), oy = c.y - el.height / (2 * m);
  return { x: ox + b[0] / m, y: oy + b[1] / m, w: b[2] / m, h: b[3] / m };
}

/**
 * Size, space and place a text layer so its letters cover the original's (2026-10-13: sizes from
 * the AI's boxes came out too big or too small). Height sets the size, letter spacing makes up a
 * substitute font's different width, then the ink is lined up by the text's alignment.
 */
function fitTextToInk(tb: Textbox, target: { x: number; y: number; w: number; h: number }) {
  const start = { width: tb.width, fontSize: tb.fontSize, charSpacing: tb.charSpacing, left: tb.left, top: tb.top };
  const giveUp = () => { tb.set(start); tb.initDimensions(); tb.setCoords(); return false; };
  const unwrap = () => { tb.set({ width: 10_000 }); tb.initDimensions(); tb.set({ width: Math.ceil(tb.calcTextWidth()) + 2 }); tb.initDimensions(); };
  unwrap();
  for (let pass = 0; pass < 3; pass++) {
    const ink = renderedInk(tb);
    if (!ink || ink.h < 1) return giveUp();
    const r = target.h / ink.h;
    if (r < 0.2 || r > 5) return giveUp();
    if (Math.abs(r - 1) < 0.015) break;
    tb.set({ fontSize: Math.max(4, (tb.fontSize ?? 20) * r) });
    unwrap();
  }
  // Same height but far off in width means the lines aren't the original's (a paragraph read as
  // one line, say): letter spacing can't make that up, so keep the box-based size instead.
  const sized = renderedInk(tb);
  if (!sized || sized.w > target.w * 1.3 || sized.w < target.w * 0.6) return giveUp();
  const longest = Math.max(1, ...String(tb.text ?? "").split("\n").map((l) => l.length));
  for (let pass = 0; pass < 2; pass++) {
    const ink = renderedInk(tb);
    if (!ink) break;
    if (Math.abs(target.w - ink.w) / target.w < 0.02) break;
    tb.set({ charSpacing: spacingToMatch(tb.charSpacing ?? 0, ink.w, target.w, longest, tb.fontSize ?? 20) });
    unwrap();
  }
  const ink = renderedInk(tb);
  if (!ink) return false;
  const dx = tb.textAlign === "center" ? target.x + target.w / 2 - (ink.x + ink.w / 2) : tb.textAlign === "right" ? target.x + target.w - (ink.x + ink.w) : target.x - ink.x;
  tb.set({ left: (tb.left ?? 0) + dx, top: (tb.top ?? 0) + (target.y - ink.y) });
  tb.setCoords();
  return true;
}

function typeLabel(o: FObj) {
  if (o instanceof FabricImage) return "Photo";
  if (o instanceof Textbox) return "Text";
  if (o instanceof Group) return "Vector";
  if (o instanceof Path) return "Drawing";
  if (o instanceof Rect) return "Rectangle";
  if (o instanceof Ellipse) return "Ellipse";
  if (o instanceof Line) return "Line";
  if (o instanceof Polygon) return "Shape";
  return "Layer";
}

export function ImageEditor({ initial }: { initial?: PickedImage | null }) {
  const { clientId } = useClient();
  // Every plan keeps every manual tool; the AI buttons use credits (the routes check the balance).
  // AI needs credits, not a plan (2026-10-12): the buttons wait only when the balance is 0.
  const { balance } = useCredits();
  const aiLocked = balance !== null && balance <= 0;
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name);
  const { ask } = useAskStore();
  const elRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cv = useRef<Canvas | null>(null);
  const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[0]);
  const [bg, setBg] = useState("#FFFFFF");
  const [zoom, setZoom] = useState(0.5);
  const [tool, setTool] = useState<Tool>("select");
  const toolRef = useRef<Tool>("select");
  const [shapeMenu, setShapeMenu] = useState(false);
  const [lastShape, setLastShape] = useState<Tool>("rect");
  const [paint, setPaint] = useState("#111111");
  const [brushSize, setBrushSize] = useState(12);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [started, setStarted] = useState(!!initial);
  const pendingPhoto = useRef<PickedImage | null>(initial ?? null);
  const [picking, setPicking] = useState<null | "photo" | "face">(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [vectorPrompt, setVectorPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useRef<{ stack: string[]; index: number; restoring: boolean; timer?: ReturnType<typeof setTimeout> }>({ stack: [], index: -1, restoring: false });
  const pen = useRef<{ anchors: PenAnchor[]; preview: Path | null; dragging: boolean } | null>(null);
  const drawing = useRef<{ obj: FObj; x: number; y: number } | null>(null);

  const canvas = () => cv.current!;
  const active = cv.current?.getActiveObject() as FObj | undefined;
  const brandColors = useMemo(() => [kit?.primaryColor, kit?.secondaryColor].filter((c): c is string => !!c && /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c.startsWith("#") ? c : `#${c}`).toUpperCase()), [kit]);

  // ---------- history
  const snapshot = useCallback(() => JSON.stringify(cv.current!.toObject(["id", "name", "erasable", "srcUrl", "anchors", "closed", "wantedFont"])), []);
  const record = useCallback(() => {
    const h = history.current;
    if (h.restoring || !cv.current) return;
    clearTimeout(h.timer);
    h.timer = setTimeout(() => {
      const snap = snapshot();
      if (h.stack[h.index] === snap) return;
      h.stack = [...h.stack.slice(0, h.index + 1), snap].slice(-60);
      h.index = h.stack.length - 1;
      bump();
    }, 120);
  }, [snapshot, bump]);
  const restore = useCallback(async (to: number) => {
    const h = history.current;
    if (to < 0 || to >= h.stack.length || !cv.current) return;
    h.restoring = true;
    await cv.current.loadFromJSON(h.stack[to]);
    cv.current.requestRenderAll();
    h.index = to;
    h.restoring = false;
    bump();
  }, [bump]);
  const undo = useCallback(() => void restore(history.current.index - 1), [restore]);
  const redo = useCallback(() => void restore(history.current.index + 1), [restore]);

  // ---------- canvas lifecycle
  useEffect(() => {
    if (!started || !elRef.current || cv.current) return;
    const c = new Canvas(elRef.current, { preserveObjectStacking: true, backgroundColor: "#FFFFFF", selectionColor: "rgba(198,244,50,0.08)", selectionBorderColor: "#C6F432" });
    cv.current = c;
    // Handle for automated browser tests (read-only use; the editor never reads it).
    (window as unknown as { __blinkEditorCanvas?: Canvas }).__blinkEditorCanvas = c;
    FabricObject.ownDefaults.borderColor = "#C6F432";
    FabricObject.ownDefaults.cornerColor = "#C6F432";
    FabricObject.ownDefaults.cornerStrokeColor = "#0C0D0F";
    FabricObject.ownDefaults.cornerStyle = "circle";
    FabricObject.ownDefaults.transparentCorners = false;
    const onChange = () => { record(); bump(); };
    c.on("object:added", onChange);
    c.on("object:removed", onChange);
    c.on("object:modified", onChange);
    c.on("path:created", (e) => {
      const p = e.path as FObj;
      p.set({ id: uid(), name: "Drawing", erasable: true } as Partial<FObj>);
      onChange();
    });
    c.on("selection:created", bump);
    c.on("selection:updated", bump);
    c.on("selection:cleared", bump);
    c.on("text:changed", onChange);
    record();
    return () => { void c.dispose(); cv.current = null; };
    // the starting photo is added by the effect below, once the canvas exists
  }, [started, record, bump]);

  // ---------- size + zoom
  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const z = Math.max(0.05, Math.min((wrap.clientWidth - 64) / size.w, (wrap.clientHeight - 64) / size.h, 2));
    setZoom(z);
  }, [size]);
  useEffect(() => { if (started) fit(); }, [started, size, fit]);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    c.setDimensions({ width: Math.round(size.w * zoom), height: Math.round(size.h * zoom) });
    c.setZoom(zoom);
    c.requestRenderAll();
    // The canvas is centred in its area, so a resize moves it on screen: fabric must re-measure
    // where it is, or every click lands offset from the pointer.
    requestAnimationFrame(() => c.calcOffset());
  }, [zoom, size, started]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!started || !wrap) return;
    const sync = () => cv.current?.calcOffset();
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    wrap.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("scroll", sync, { passive: true, capture: true });
    return () => { ro.disconnect(); wrap.removeEventListener("scroll", sync); window.removeEventListener("scroll", sync, { capture: true }); };
  }, [started]);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    c.backgroundColor = bg === "transparent" ? "" : bg;
    c.requestRenderAll();
  }, [bg, started]);
  useEffect(() => {
    if (!started) return;
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started, fit]);

  // ---------- adding layers
  const add = useCallback((o: FObj, name: string, select = true) => {
    o.set({ id: o.id ?? uid(), name: o.name ?? name, erasable: true } as Partial<FObj>);
    canvas().add(o);
    if (select) canvas().setActiveObject(o);
    canvas().requestRenderAll();
    return o;
  }, []);

  const addImage = useCallback(async (url: string, name = "Photo", cover = false) => {
    const img = (await FabricImage.fromURL(canvasSafe(url), { crossOrigin: "anonymous" })) as FabricImage & FObj;
    const s = cover ? Math.max(size.w / img.width, size.h / img.height) : Math.min((size.w * 0.8) / img.width, (size.h * 0.8) / img.height, 1);
    img.set({ scaleX: s, scaleY: s, left: (size.w - img.width * s) / 2, top: (size.h - img.height * s) / 2, srcUrl: originalUrl(url) } as Partial<FObj>);
    add(img, name);
    return img;
  }, [add, size]);

  const addSvg = useCallback(async (svg: string, opts: { x?: number; y?: number; w?: number; name?: string; quiet?: boolean } = {}) => {
    const clean = sanitizeSvg(svg);
    if (!clean) { if (!opts.quiet) toast.error("That's too detailed to turn into vectors. For a whole poster, use Split into layers."); return null; }
    const { objects, options } = await loadSVGFromString(clean);
    const parts = objects.filter((o): o is FabricObject => !!o);
    if (!parts.length) return null;
    const g = util.groupSVGElements(parts, options) as FObj;
    const targetW = opts.w ?? size.w * 0.5;
    const s = targetW / (g.width || targetW);
    g.set({ scaleX: s, scaleY: s, left: opts.x ?? (size.w - targetW) / 2, top: opts.y ?? (size.h - (g.height || 0) * s) / 2 });
    add(g, opts.name ?? "Vector");
    return g;
  }, [add, size]);

  function makeShape(kind: Tool, x: number, y: number, w: number, h: number, fill = paint): FObj {
    const common = { left: x, top: y, fill, stroke: undefined as string | undefined, strokeWidth: 0 };
    switch (kind) {
      case "rect": return new Rect({ ...common, width: w, height: h, rx: 0, ry: 0 }) as FObj;
      case "ellipse": return new Ellipse({ ...common, rx: w / 2, ry: h / 2 }) as FObj;
      case "line": return new Line([x, y, x + w, y + h], { stroke: fill, strokeWidth: Math.max(2, brushSize / 2), strokeLineCap: "round" }) as FObj;
      case "star": return new Polygon(starPoints(w, h, 5, 0.45, true), common) as FObj;
      default: return new Polygon(starPoints(w, h, 6, 1, false), common) as FObj;
    }
  }

  // ---------- tools
  const setToolSafe = useCallback((t: Tool) => {
    const c = cv.current;
    toolRef.current = t;
    setTool(t);
    if (SHAPES.includes(t)) setLastShape(t);
    setShapeMenu(false);
    if (!c) return;
    if (pen.current && t !== "pen") { if (pen.current.preview) c.remove(pen.current.preview); pen.current = null; }
    c.isDrawingMode = t === "brush" || t === "eraser";
    c.selection = t === "select";
    c.skipTargetFind = t !== "select";
    c.defaultCursor = t === "hand" ? "grab" : t === "select" ? "default" : "crosshair";
    if (t === "brush") { const b = new PencilBrush(c); b.color = paint; b.width = brushSize; c.freeDrawingBrush = b; }
    if (t === "eraser") {
      const er = new EraserBrush(c);
      er.width = brushSize * 2;
      er.on("end", () => setTimeout(() => { record(); bump(); }, 50));
      c.freeDrawingBrush = er;
    }
    if (t !== "select") c.discardActiveObject();
    c.requestRenderAll();
  }, [paint, brushSize, record, bump]);

  useEffect(() => {
    const c = cv.current;
    if (!c || !c.freeDrawingBrush) return;
    if (tool === "brush") { c.freeDrawingBrush.color = paint; c.freeDrawingBrush.width = brushSize; }
    if (tool === "eraser") c.freeDrawingBrush.width = brushSize * 2;
  }, [paint, brushSize, tool]);

  const finishPen = useCallback((closed: boolean) => {
    const c = cv.current;
    const p = pen.current;
    if (!c || !p) return;
    if (p.preview) c.remove(p.preview);
    pen.current = null;
    if (p.anchors.length < 2) return;
    const path = new Path(penPath(p.anchors, closed), { fill: closed ? paint : "", stroke: closed ? undefined : paint, strokeWidth: closed ? 0 : Math.max(2, brushSize / 3), strokeLineCap: "round", strokeLineJoin: "round" }) as FObj;
    path.set({ anchors: p.anchors.map((a) => ({ ...a })), closed } as Partial<FObj>);
    add(path, closed ? "Shape" : "Path");
    setToolSafe("select");
  }, [add, paint, brushSize, setToolSafe]);

  // ---------- edit the points of a pen shape (drag points and curve handles; Esc or Done to finish)
  const pointEdit = useRef<{ path: FObj; anchors: PenAnchor[]; handles: Handle[]; lines: Line[] } | null>(null);
  const [editingPoints, setEditingPoints] = useState(false);
  const toCanvasAnchors = (p: FObj) => {
    const m = p.calcTransformMatrix();
    const off = (p as unknown as Path).pathOffset;
    const t = (x: number, y: number) => util.transformPoint(new Point(x - off.x, y - off.y), m);
    return (p.anchors ?? []).map((a) => {
      const c = t(a.x, a.y);
      const h = a.hx !== undefined && a.hy !== undefined ? t(a.hx, a.hy) : null;
      return { x: c.x, y: c.y, ...(h ? { hx: h.x, hy: h.y } : {}) };
    });
  };
  const rebuildEditedPath = useCallback(() => {
    const c = cv.current, e = pointEdit.current;
    if (!c || !e) return;
    const old = e.path;
    const next = new Path(penPath(e.anchors, !!old.closed), {
      fill: old.fill, stroke: old.stroke, strokeWidth: old.strokeWidth, strokeLineCap: "round", strokeLineJoin: "round", opacity: old.opacity,
      selectable: false, evented: false,
    }) as FObj;
    next.set({ id: old.id, name: old.name, erasable: true, anchors: e.anchors.map((a) => ({ ...a })), closed: old.closed } as Partial<FObj>);
    const index = c.getObjects().indexOf(old);
    history.current.restoring = true;
    c.remove(old);
    c.insertAt(Math.max(0, index), next);
    history.current.restoring = false;
    e.path = next;
    // curve-handle lines follow
    e.lines.forEach((l) => c.remove(l));
    e.lines = e.anchors.flatMap((a) => (a.hx !== undefined ? [new Line([a.x, a.y, a.hx, a.hy!], { stroke: "#8B7CFF", strokeWidth: 1 / zoom, selectable: false, evented: false, excludeFromExport: true })] : []));
    e.lines.forEach((l) => c.add(l));
    e.handles.forEach((h) => c.bringObjectToFront(h));
    c.requestRenderAll();
  }, [zoom]);
  const startPointEdit = useCallback((p: FObj) => {
    const c = cv.current;
    if (!c || !p.anchors?.length || pointEdit.current) return;
    c.discardActiveObject();
    pointEdit.current = { path: p, anchors: toCanvasAnchors(p), handles: [], lines: [] };
    rebuildEditedPath();
    const e = pointEdit.current;
    const r = 6 / zoom;
    e.anchors.forEach((a, i) => {
      const mk = (x: number, y: number, kind: "anchor" | "handle") => {
        const h = new FabricCircle({ left: x - r, top: y - r, radius: r, fill: kind === "anchor" ? "#FFFFFF" : "#8B7CFF", stroke: "#0C0D0F", strokeWidth: 1.5 / zoom,
          hasControls: false, hasBorders: false, excludeFromExport: true, hoverCursor: "move" }) as Handle;
        h.penIndex = i; h.penKind = kind;
        history.current.restoring = true; c.add(h); history.current.restoring = false;
        e.handles.push(h);
      };
      mk(a.x, a.y, "anchor");
      if (a.hx !== undefined) mk(a.hx, a.hy!, "handle");
    });
    c.selection = false;
    setEditingPoints(true);
    c.requestRenderAll();
  }, [rebuildEditedPath, zoom]);
  const finishPointEdit = useCallback(() => {
    const c = cv.current, e = pointEdit.current;
    if (!c || !e) return;
    history.current.restoring = true;
    e.handles.forEach((h) => c.remove(h));
    e.lines.forEach((l) => c.remove(l));
    history.current.restoring = false;
    e.path.set({ selectable: true, evented: true });
    pointEdit.current = null;
    setEditingPoints(false);
    c.selection = toolRef.current === "select";
    c.setActiveObject(e.path);
    c.requestRenderAll();
    record(); bump();
  }, [record, bump]);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const moving = (opt: { target?: FabricObject }) => {
      const h = opt.target as Handle | undefined;
      const e = pointEdit.current;
      if (!h || !e || h.penIndex === undefined) return;
      const a = e.anchors[h.penIndex];
      const cx = (h.left ?? 0) + (h.radius ?? 0), cy = (h.top ?? 0) + (h.radius ?? 0);
      if (h.penKind === "anchor") {
        const dx = cx - a.x, dy = cy - a.y;
        a.x = cx; a.y = cy;
        if (a.hx !== undefined) {
          a.hx += dx; a.hy! += dy;
          const twin = e.handles.find((x) => x.penIndex === h.penIndex && x.penKind === "handle");
          twin?.set({ left: a.hx - (twin.radius ?? 0), top: a.hy! - (twin.radius ?? 0) }); twin?.setCoords();
        }
      } else { a.hx = cx; a.hy = cy; }
      rebuildEditedPath();
    };
    const dbl = (opt: TPointerEventInfo<TPointerEvent>) => {
      const t = opt.target as FObj | undefined;
      if (toolRef.current === "select" && t?.anchors?.length) startPointEdit(t);
    };
    c.on("object:moving", moving);
    c.on("mouse:dblclick", dbl);
    return () => { c.off("object:moving", moving); c.off("mouse:dblclick", dbl); };
  }, [started, rebuildEditedPath, startPointEdit]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const down = (opt: TPointerEventInfo<TPointerEvent>) => {
      const t = toolRef.current;
      const pt = c.getScenePoint(opt.e);
      if (t === "text") {
        const tb = new Textbox("Your text", { left: pt.x, top: pt.y, width: Math.min(600, size.w * 0.6), fontSize: Math.round(size.w / 14), fontFamily: kit?.primaryFont || "Inter", fontWeight: 700, fill: paint }) as FObj;
        add(tb, "Text");
        whenFontReady(String(tb.get("fontFamily")), () => c.requestRenderAll());
        setToolSafe("select");
        (tb as unknown as Textbox).enterEditing();
        (tb as unknown as Textbox).selectAll();
        return;
      }
      if (SHAPES.includes(t)) {
        const o = makeShape(t, pt.x, pt.y, 1, 1);
        o.set({ id: uid(), name: TOOL_INFO[t].label, erasable: true } as Partial<FObj>);
        history.current.restoring = true; c.add(o); history.current.restoring = false;
        drawing.current = { obj: o, x: pt.x, y: pt.y };
        return;
      }
      if (t === "pen") {
        const p = (pen.current ??= { anchors: [], preview: null, dragging: false });
        const first = p.anchors[0];
        if (first && p.anchors.length > 2 && Math.hypot(first.x - pt.x, first.y - pt.y) < 12 / zoom) { finishPen(true); return; }
        p.anchors.push({ x: pt.x, y: pt.y });
        p.dragging = true;
      }
    };
    const move = (opt: TPointerEventInfo<TPointerEvent>) => {
      const pt = c.getScenePoint(opt.e);
      const d = drawing.current;
      if (d) {
        const shift = (opt.e as MouseEvent).shiftKey;
        let w = pt.x - d.x, h = pt.y - d.y;
        if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        const kind = toolRef.current;
        history.current.restoring = true; c.remove(d.obj); history.current.restoring = false;
        const o = makeShape(kind, Math.min(d.x, d.x + w), Math.min(d.y, d.y + h), Math.max(1, Math.abs(w)), Math.max(1, Math.abs(h)));
        if (kind === "line") (o as unknown as Line).set({ x1: d.x, y1: d.y, x2: d.x + w, y2: d.y + h });
        o.set({ id: d.obj.id, name: d.obj.name, erasable: true } as Partial<FObj>);
        history.current.restoring = true; c.add(o); history.current.restoring = false;
        d.obj = o;
        c.requestRenderAll();
        return;
      }
      const p = pen.current;
      if (p && toolRef.current === "pen") {
        const last = p.anchors[p.anchors.length - 1];
        if (p.dragging && last && Math.hypot(pt.x - last.x, pt.y - last.y) > 3 / zoom) { last.hx = pt.x; last.hy = pt.y; }
        history.current.restoring = true;
        if (p.preview) c.remove(p.preview);
        history.current.restoring = false;
        const ghost = [...p.anchors, ...(p.dragging ? [] : [{ x: pt.x, y: pt.y }])];
        p.preview = new Path(penPath(ghost, false) || `M ${pt.x} ${pt.y}`, { fill: "", stroke: "#C6F432", strokeWidth: 1.5 / zoom, selectable: false, evented: false, excludeFromExport: true });
        history.current.restoring = true; c.add(p.preview); history.current.restoring = false;
        c.requestRenderAll();
      }
    };
    const up = () => {
      const d = drawing.current;
      if (d) {
        drawing.current = null;
        const r = d.obj.getBoundingRect();
        if (r.width < 4 && r.height < 4) {
          // A click without a drag: drop a nicely sized shape there.
          history.current.restoring = true; c.remove(d.obj); history.current.restoring = false;
          const s = Math.round(Math.min(size.w, size.h) / 4);
          const o = makeShape(toolRef.current, d.x - s / 2, d.y - s / 2, s, s);
          add(o, TOOL_INFO[toolRef.current].label);
        } else {
          c.setActiveObject(d.obj);
          record(); bump();
        }
        setToolSafe("select");
      }
      if (pen.current) pen.current.dragging = false;
    };
    const dbl = () => { if (toolRef.current === "pen") finishPen(false); };
    c.on("mouse:down", down);
    c.on("mouse:move", move);
    c.on("mouse:up", up);
    c.on("mouse:dblclick", dbl);
    return () => { c.off("mouse:down", down); c.off("mouse:move", move); c.off("mouse:up", up); c.off("mouse:dblclick", dbl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, size, zoom, paint, brushSize, kit?.primaryFont]);

  // keyboard
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable]") || (cv.current?.getActiveObject() as Textbox | undefined)?.isEditing;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (typing) return;
      if (pen.current && e.key === "Enter") { finishPen(false); return; }
      if (e.key === "Escape" && pointEdit.current) { finishPointEdit(); return; }
      if (e.key === "Escape") {
        if (pen.current) { if (pen.current.preview) canvas().remove(pen.current.preview); pen.current = null; }
        // Esc also deselects (like Figma), which brings back the canvas panel and "Make a vector".
        canvas().discardActiveObject(); canvas().requestRenderAll(); bump();
        setToolSafe("select");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && cv.current?.getActiveObject()) { e.preventDefault(); removeActive(); return; }
      const map: Record<string, Tool> = { v: "select", h: "hand", t: "text", r: "rect", o: "ellipse", l: "line", s: "star", g: "polygon", p: "pen", b: "brush", e: "eraser" };
      const next = map[e.key.toLowerCase()];
      if (next && !e.metaKey && !e.ctrlKey) setToolSafe(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, undo, redo, finishPen, setToolSafe, finishPointEdit]);

  // paste: an image or SVG code from the clipboard becomes a layer
  useEffect(() => {
    if (!started) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (file) { e.preventDefault(); void onFile(file); return; }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (/^\s*<svg[\s>]/i.test(text)) { e.preventDefault(); void addSvg(text, { name: "Pasted vector" }); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, addSvg]);

  // hand tool: drag the scroll area
  const panning = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  // ---------- starting points
  async function begin(kind: "blank" | "transparent" | "photo" | "logo", photo?: PickedImage) {
    if (kind === "logo") { setSize(SIZES[4]); setBg("transparent"); }
    if (kind === "transparent") setBg("transparent");
    if (kind === "blank") setBg("#FFFFFF");
    if (photo) pendingPhoto.current = photo;
    setStarted(true);
  }
  useEffect(() => {
    const p = pendingPhoto.current;
    if (!started || !p || !cv.current) return;
    pendingPhoto.current = null;
    void addImage(p.url, "Photo", true).catch(() => toast.error("Couldn't load that photo."));
  }, [started, addImage]);

  // ---------- selection actions
  function removeActive() {
    const c = canvas();
    const objs = c.getActiveObjects();
    objs.forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
  }
  async function duplicateActive() {
    const o = active;
    if (!o) return;
    const copy = (await o.clone(["id", "name", "erasable", "srcUrl", "anchors", "closed"])) as FObj;
    copy.set({ left: (o.left ?? 0) + 24, top: (o.top ?? 0) + 24, id: uid(), name: `${o.name ?? "Layer"} copy` } as Partial<FObj>);
    add(copy, copy.name ?? "Layer");
  }
  function arrange(o: FObj, to: "front" | "back" | "forward" | "backward") {
    const c = canvas();
    if (to === "front") c.bringObjectToFront(o);
    if (to === "back") c.sendObjectToBack(o);
    if (to === "forward") c.bringObjectForward(o);
    if (to === "backward") c.sendObjectBackwards(o);
    c.requestRenderAll(); record(); bump();
  }
  function setProp(o: FObj, props: Record<string, unknown>) {
    o.set(props);
    o.setCoords();
    canvas().requestRenderAll();
    record(); bump();
  }
  function ungroup(g: Group & FObj) {
    const c = canvas();
    const items = g.removeAll() as FObj[];
    c.remove(g);
    items.forEach((it, i) => { it.set({ id: uid(), name: it.name || `${g.name ?? "Vector"} part ${i + 1}`, erasable: true } as Partial<FObj>); c.add(it); });
    c.discardActiveObject();
    c.requestRenderAll();
  }
  function alignActive(where: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    const o = active;
    if (!o) return;
    const r = o.getBoundingRect();
    const dx = where === "left" ? -r.left : where === "right" ? size.w - (r.left + r.width) : where === "hcenter" ? size.w / 2 - (r.left + r.width / 2) : 0;
    const dy = where === "top" ? -r.top : where === "bottom" ? size.h - (r.top + r.height) : where === "vcenter" ? size.h / 2 - (r.top + r.height / 2) : 0;
    setProp(o, { left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
  }

  // ---------- uploads
  async function uploadBlob(blob: Blob, prefix: string) {
    if (!clientId) throw new Error("Not signed in");
    const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
    const path = `images/${clientId}/${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: blob.type || "image/png" });
    if (error) throw new Error("Couldn't upload the image.");
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }
  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      if (!started) await begin("transparent");
      setTimeout(async () => { await addSvg(await file.text(), { name: file.name.replace(/\.svg$/i, "").slice(0, 30) || "Vector" }); }, started ? 0 : 120);
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use a JPG, PNG, WebP or SVG file."); return; }
    try {
      const url = await uploadBlob(file, "editor");
      if (!started) { await begin("photo", { url, contentId: null, title: file.name }); return; }
      await addImage(url, file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Photo");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
  }

  // ---------- AI on the selected photo
  const activeImage = active instanceof FabricImage ? (active as FabricImage & FObj) : null;
  const photoColors = useMemo(() => {
    if (!activeImage) return [] as string[];
    try { return paletteOf(activeImage.getElement() as HTMLImageElement); } catch { return []; }
  }, [activeImage]);

  async function replaceImageSrc(img: FabricImage & FObj, url: string) {
    const keep = { left: img.left, top: img.top, angle: img.angle, opacity: img.opacity };
    const prevW = img.getScaledWidth();
    await img.setSrc(canvasSafe(url), { crossOrigin: "anonymous" });
    const s = prevW / img.width;
    img.set({ ...keep, scaleX: s, scaleY: s, srcUrl: url } as Partial<FObj>);
    img.setCoords();
    canvas().requestRenderAll();
    record(); bump();
  }
  /** A storage URL for the image as it is now (AI tools need an owned, reasonably sized file). */
  async function imageForAi(img: FabricImage & FObj) {
    const blob = await shrinkToBlob(canvasSafe(img.srcUrl || (img.getSrc() as string)), 2048);
    return uploadBlob(blob, "editor_ai");
  }
  async function removeBackground() {
    if (!activeImage) return;
    setAiBusy("Removing the background…");
    try {
      const url = await imageForAi(activeImage);
      const res = await fetch("/api/editor/remove-bg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, brandId: activeBrand?.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't remove the background.");
      await replaceImageSrc(activeImage, data.url);
      toast.success("Background removed · 1 credit");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove the background."); }
    finally { setAiBusy(null); }
  }
  async function swapFace(faceUrl: string) {
    if (!activeImage) return;
    setAiBusy("Swapping the face…");
    try {
      const url = await imageForAi(activeImage);
      const res = await fetch("/api/editor/face-swap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, face: faceUrl, brandId: activeBrand?.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't swap the face.");
      await replaceImageSrc(activeImage, data.url);
      toast.success("Face swapped · 3 credits");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't swap the face."); }
    finally { setAiBusy(null); }
  }
  async function aiEdit(instruction: string, extraRef?: string) {
    if (!activeImage || !clientId || !activeBrand || !kit) return;
    if (aiLocked) { toast.info(AI_NEEDS_CREDITS); return; }
    setAiBusy("Editing with AI…");
    try {
      const url = await imageForAi(activeImage);
      // Keep the photo's own shape: a fixed 4:5 squashed portraits and left a gap on the canvas.
      const aspect = nearestImageAspect(`${activeImage.width || 4}:${activeImage.height || 5}`);
      const [out] = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit, prompt: instruction, references: extraRef ? [url, extraRef] : [url],
        engine: "nb2", aspect, style: "studio", caption: instruction, mode: "edit", save: false,
      });
      await replaceImageSrc(activeImage, out.url);
      toast.success("Done · 18 credits");
    } catch (e) { toast.error(generationErrorMessage(e), { duration: 9000 }); }
    finally { setAiBusy(null); }
  }
  // Any font that finishes loading re-measures and re-draws the text that uses it.
  useEffect(() => {
    const onFonts = () => {
      const c = cv.current;
      if (!c) return;
      fabricCache.clearFontCache(); // letter widths measured before the font arrived are wrong
      for (const o of c.getObjects()) if (o instanceof Textbox) { o.initDimensions(); o.set({ dirty: true }); }
      c.requestRenderAll();
    };
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    return () => document.fonts?.removeEventListener?.("loadingdone", onFonts);
  }, []);

  // ---------- split a flat design into layers (2026-10-13)
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [fontAsk, setFontAsk] = useState<Array<{ font: string; using: string }>>([]);
  const fontInput = useRef<HTMLInputElement>(null);
  const fontFor = useRef<string | null>(null);
  // Fonts this account uploaded come back in every design.
  useEffect(() => {
    if (!clientId) return;
    supabase.storage.from("assets").list(`uploads/${clientId}/fonts`, { limit: 100 }).then(async ({ data }) => {
      for (const f of data ?? []) {
        if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) continue;
        const name = f.name.replace(/^\d+_/, "").replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ").trim();
        const url = supabase.storage.from("assets").getPublicUrl(`uploads/${clientId}/fonts/${f.name}`).data.publicUrl;
        try { const face = new FontFace(name, `url(${url})`); await face.load(); document.fonts.add(face); setCustomFonts((p) => (p.includes(name) ? p : [...p, name])); } catch { /* a broken file is skipped */ }
      }
    }, () => {});
  }, [clientId]);

  /** Add a font file; if a split design asked for it, its text layers switch to it. */
  async function uploadFont(file: File | undefined) {
    if (!file || !clientId) return;
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { toast.error("Use a font file: .ttf, .otf, .woff or .woff2."); return; }
    try {
      const name = await loadCustomFont(file);
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      await supabase.storage.from("assets").upload(`uploads/${clientId}/fonts/${Date.now()}_${safe}`, file, { contentType: "font/" + (file.name.split(".").pop() || "ttf") }).catch(() => null);
      setCustomFonts((p) => (p.includes(name) ? p : [...p, name]));
      const wanted = fontFor.current;
      let switched = 0;
      for (const o of canvas().getObjects() as FObj[]) {
        if (o instanceof Textbox && (wanted ? (o as FObj).wantedFont === wanted : o === active)) { o.set({ fontFamily: name, dirty: true }); switched++; }
      }
      canvas().requestRenderAll(); record(); bump();
      if (wanted) setFontAsk((a) => a.filter((x) => x.font !== wanted));
      toast.success(`${name} added${switched ? ` and used on ${switched} text layer${switched === 1 ? "" : "s"}` : ""}. It's saved for your next designs.`);
    } catch { toast.error("Couldn't read that font file."); }
    finally { fontFor.current = null; }
  }

  /** A flat poster into layers: real text in the matched font, a traced logo, the photo without its words. */
  async function splitIntoLayers() {
    if (!activeImage || !clientId || !activeBrand || !kit) return;
    if (aiLocked) { toast.info(AI_NEEDS_CREDITS); return; }
    const img = activeImage;
    setAiBusy("Reading the design…");
    try {
      const el = await loadImage(canvasSafe(img.srcUrl || (img.getSrc() as string)));
      const sc = Math.min(1, 1400 / Math.max(el.naturalWidth, el.naturalHeight));
      const small = document.createElement("canvas");
      small.width = Math.round(el.naturalWidth * sc); small.height = Math.round(el.naturalHeight * sc);
      small.getContext("2d")!.drawImage(el, 0, 0, small.width, small.height);
      const res = await fetch("/api/editor/layers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: small.toDataURL("image/jpeg", 0.85).split(",")[1], width: el.naturalWidth, height: el.naturalHeight, brandId: activeBrand?.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.layers) throw new Error(data.error || "Couldn't read the design.");
      const layers = data.layers as DesignLayers;
      let spent = Number(data.credits) || 0;
      const L = img.left ?? 0, T = img.top ?? 0, W = img.getScaledWidth(), H = img.getScaledHeight();
      // Where each text's letters really are, measured on the original before anything changes.
      const px = small.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height).data;
      const inks: Array<Box | null> = layers.texts.map((t) => measureInk(px, small.width, small.height, t.box, t.color));
      const before = thumb(small);

      // The logo, traced from its own small area (or kept as a cut-out if it's too detailed).
      setAiBusy("Tracing the logo…");
      const { default: ImageTracer } = await import("imagetracerjs");
      for (const lg of layers.logos) {
        const [bx, by, bw, bh] = lg.box;
        const cw = Math.max(8, Math.round(bw * el.naturalWidth)), ch = Math.max(8, Math.round(bh * el.naturalHeight));
        const k = Math.min(1, 600 / Math.max(cw, ch));
        const crop = document.createElement("canvas");
        crop.width = Math.round(cw * k); crop.height = Math.round(ch * k);
        const cx = crop.getContext("2d")!;
        cx.drawImage(el, bx * el.naturalWidth, by * el.naturalHeight, cw, ch, 0, 0, crop.width, crop.height);
        const svg: string = ImageTracer.imagedataToSVG(cx.getImageData(0, 0, crop.width, crop.height), { numberofcolors: 4, ltres: 1, qtres: 1, pathomit: 10, blurradius: 0, strokewidth: 0, viewbox: true, roundcoords: 1 });
        const g = await addSvg(svg, { x: L + bx * W, y: T + by * H, w: bw * W, name: lg.label, quiet: true });
        if (!g) {
          const cut = (await FabricImage.fromURL(crop.toDataURL("image/png"))) as FabricImage & FObj;
          cut.set({ left: L + bx * W, top: T + by * H, scaleX: (bw * W) / cut.width, scaleY: (bh * H) / cut.height } as Partial<FObj>);
          add(cut, lg.label, false);
        }
      }

      // The photo without its words: a plain edit (no brand rules or logo, which fought the instruction).
      // If it fails, or comes back as a different picture, the original stays and we say so.
      setAiBusy("Taking the old words off the photo…");
      try {
        const url = await imageForAi(img);
        const aspect = nearestImageAspect(`${img.width || 4}:${img.height || 5}`);
        const [out] = await generateBrandImages({ clientId, brandId: activeBrand.id, kit, prompt: CLEAN_PLATE_TOPIC, assembledPrompt: CLEAN_PLATE_PROMPT, plain: true, references: [url], engine: "nb2", aspect, style: "studio", caption: "Clean plate", mode: "edit", save: false });
        spent += 18;
        const plate = await loadImage(canvasSafe(out.url));
        if (!samePicture(before, thumb(plate))) {
          toast.error("The photo without words came back as a different picture, so your original stays under the new text. Hide the photo layer, or try Split again.", { duration: 12_000 });
        } else {
          await replaceImageSrc(img, out.url);
          img.set({ name: `${img.name ?? "Photo"} (no text)`, dirty: true } as Partial<FObj>);
          canvas().requestRenderAll();
        }
      } catch (e) {
        console.error("clean plate", e);
        toast.error("Couldn't take the old words off the photo, so they show under the new text. Hide the photo layer, or try Split again.", { duration: 12_000 });
      }

      // Real text, in the closest free font, sized to its box.
      const asks = new Map<string, string>();
      // One undo step once every font has arrived and every text is fitted.
      let toFit = layers.texts.length;
      const fittedOne = () => { if (--toFit === 0) record(); };
      for (const [ti, t] of layers.texts.entries()) {
        const [bx, by, bw, bh] = t.box;
        const ink = inks[ti];
        const lines = t.text.split("\n").length;
        const family = customFonts.find((f) => f.toLowerCase() === t.font.toLowerCase()) ?? t.freeFont;
        void ensureFont(family);
        const fromBox = (bh * H) / (lines * 1.13 * 1.05);
        const tb = new Textbox(t.text, {
          left: L + bx * W, top: T + by * H, width: Math.max(40, bw * W * 1.08), fontSize: Math.max(8, Math.round(fromBox || (t.sizePct / 100) * H)),
          fill: t.color, fontWeight: t.weight, fontStyle: t.italic ? "italic" : "normal", textAlign: t.align, charSpacing: Math.round(t.spacing * 1000), fontFamily: family, lineHeight: 1.05,
        }) as Textbox & FObj;
        tb.set({ wantedFont: t.font } as Partial<FObj>);
        add(tb, `Text: ${t.text.split("\n")[0].slice(0, 24)}`, false);
        whenFontReady(family, () => {
          tb.initDimensions();
          // Matched to the original's measured letters; without a measurement, shrink until it fits
          // on the same number of lines as the original.
          const fitted = ink && fitTextToInk(tb, { x: L + ink[0] * W, y: T + ink[1] * H, w: ink[2] * W, h: ink[3] * H });
          if (!fitted) for (let i = 0; i < 10 && (tb.textLines?.length ?? lines) > lines; i++) tb.set({ fontSize: Math.round((tb.fontSize ?? 20) * 0.92) });
          tb.set({ dirty: true }); canvas().requestRenderAll(); fittedOne();
        }, t.weight);
        if (family.toLowerCase() !== t.font.toLowerCase() && !customFonts.some((f) => f.toLowerCase() === t.font.toLowerCase())) asks.set(t.font, family);
      }
      canvas().requestRenderAll(); record(); bump();
      setFontAsk([...asks].map(([font, using]) => ({ font, using })));
      toast.success(`Split into ${layers.texts.length} text layer${layers.texts.length === 1 ? "" : "s"}${layers.logos.length ? `, ${layers.logos.length === 1 ? "the logo" : `${layers.logos.length} logos`}` : ""} and the photo · ${spent} credits`, { duration: 8000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't split this design."); }
    finally { setAiBusy(null); }
  }

  async function vectorizeActive() {
    if (!activeImage) return;
    setAiBusy("Turning the photo into vectors…");
    try {
      const { default: ImageTracer } = await import("imagetracerjs");
      const img = await loadImage(canvasSafe(activeImage.srcUrl || (activeImage.getSrc() as string)));
      const s = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const svg: string = ImageTracer.imagedataToSVG(data, { numberofcolors: 12, ltres: 1, qtres: 1, pathomit: 16, blurradius: 0, strokewidth: 0, viewbox: true, roundcoords: 1 });
      const w = activeImage.getScaledWidth();
      const g = await addSvg(svg, { x: activeImage.left, y: activeImage.top, w, name: `${activeImage.name ?? "Photo"} (vector)`, quiet: true });
      if (!g) { toast.info("This photo is too detailed to trace (that works for logos and icons). Split into layers instead: real text, a vector logo and the photo.", { duration: 9000 }); return; }
      if (g) { activeImage.set({ visible: false }); canvas().requestRenderAll(); toast.success("Vector layer added above. The photo is hidden, not deleted."); }
    } catch (e) { console.error(e); toast.error("Couldn't vectorise this image."); }
    finally { setAiBusy(null); }
  }
  async function makeVector(prompt = vectorPrompt, style?: "flat" | "outline") {
    if (prompt.trim().length < 3) { toast.info("Describe what to draw, e.g. a minimal coffee cup icon."); return; }
    setAiBusy("Drawing your vector…");
    try {
      const res = await fetch("/api/editor/vector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, brandId: activeBrand?.id, style }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.svg) throw new Error(data.error || "Couldn't draw that.");
      await addSvg(data.svg, { name: prompt.slice(0, 28) });
      setVectorPrompt("");
      if (data.credits) toast.success(`Drawn · ${data.credits} credit${data.credits === 1 ? "" : "s"}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't draw that."); }
    finally { setAiBusy(null); }
  }
  function applyFilter(img: FabricImage, kind: "brightness" | "contrast" | "saturation", value: number) {
    const others = (img.filters ?? []).filter((f) => !(kind === "brightness" ? f instanceof filters.Brightness : kind === "contrast" ? f instanceof filters.Contrast : f instanceof filters.Saturation));
    const f = kind === "brightness" ? new filters.Brightness({ brightness: value }) : kind === "contrast" ? new filters.Contrast({ contrast: value }) : new filters.Saturation({ saturation: value });
    img.filters = [...others, f];
    img.applyFilters();
    canvas().requestRenderAll();
  }
  const filterValue = (img: FabricImage, kind: "brightness" | "contrast" | "saturation") => {
    const f = (img.filters ?? []).find((x) => (kind === "brightness" ? x instanceof filters.Brightness : kind === "contrast" ? x instanceof filters.Contrast : x instanceof filters.Saturation)) as unknown as Record<string, number> | undefined;
    return f ? f[kind] : 0;
  };

  // ---------- export / save
  async function render(format: "png" | "jpeg") {
    const c = canvas();
    c.discardActiveObject();
    c.requestRenderAll();
    return c.toDataURL({ format, quality: 0.95, multiplier: 1 / zoom });
  }
  async function exportFile(kind: "png" | "jpeg" | "svg") {
    try {
      const a = document.createElement("a");
      const base = `${(kit?.name || "design").replace(/\W+/g, "-").toLowerCase()}-${size.id}`;
      if (kind === "svg") {
        const blob = new Blob([canvas().toSVG({ width: `${size.w}`, height: `${size.h}`, viewBox: { x: 0, y: 0, width: size.w, height: size.h } })], { type: "image/svg+xml" });
        a.href = URL.createObjectURL(blob); a.download = `${base}.svg`;
      } else { a.href = await render(kind); a.download = `${base}.${kind === "jpeg" ? "jpg" : "png"}`; }
      a.click();
    } catch (e) { console.error(e); toast.error("Export failed. A photo from another site may be blocking it; re-add it from your Library."); }
  }
  async function saveToLibrary() {
    if (!clientId || !activeBrand) return;
    setAiBusy("Saving to your Library…");
    try {
      const dataUrl = await render("png");
      const blob = await (await fetch(dataUrl)).blob();
      const url = await uploadBlob(blob, "design");
      const first = canvas().getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
      const { data, error } = await supabase.from("content").insert({ client_id: clientId, brand_id: activeBrand.id, content_type: "post_image", image_urls: [url], caption: first?.text?.split("\n")[0]?.slice(0, 120) || "Design", status: "draft" }).select("id").single();
      if (error) throw error;
      toast.success("Saved to your Library", { action: { label: "Open", onClick: () => { window.location.href = `/studio/library/${data.id}`; } } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the design."); }
    finally { setAiBusy(null); }
  }

  // ---------- Ask BlinkSpot bridge
  useEffect(() => {
    if (!started) return;
    useCanvasBridge.setState({
      attached: true,
      summary: (): CanvasSummary => {
        const c = cv.current!;
        let preview: string | undefined;
        try {
          const active = c.getActiveObject();
          c.discardActiveObject();
          preview = c.toDataURL({ format: "jpeg", quality: 0.7, multiplier: 640 / Math.max(size.w, size.h) / zoom }).split(",")[1];
          if (active) c.setActiveObject(active);
        } catch { /* a cross-origin photo can block the preview; the layers still go */ }
        return {
          width: size.w, height: size.h, background: bg, brandColors, ...(preview ? { preview } : {}),
          layers: (c.getObjects() as FObj[]).filter((o) => !o.excludeFromExport).map((o): CanvasLayer => {
            const r = o.getBoundingRect();
            return {
              id: o.id ?? "", name: o.name ?? typeLabel(o), type: typeLabel(o), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
              angle: Math.round(o.angle ?? 0), fill: typeof o.fill === "string" ? o.fill : undefined, stroke: typeof o.stroke === "string" ? o.stroke : undefined,
              text: o instanceof Textbox ? o.text?.slice(0, 120) : undefined, opacity: o.opacity ?? 1, visible: o.visible !== false,
            };
          }),
        };
      },
      apply: async (ops: CanvasOp[]) => {
        const c = cv.current!;
        const byId = (id: string) => (c.getObjects() as FObj[]).find((o) => o.id === id);
        for (const op of ops) {
          if (op.op === "add_shape") {
            const kind: Tool = op.shape;
            const o = makeShape(kind, op.x, op.y, op.w, op.h, op.fill ?? paint);
            if (op.stroke) o.set({ stroke: op.stroke, strokeWidth: op.strokeWidth ?? 4 });
            if (op.radius && o instanceof Rect) o.set({ rx: op.radius, ry: op.radius });
            add(o, op.name ?? TOOL_INFO[kind].label, false);
          } else if (op.op === "add_text") {
            const font = op.font && FONTS.includes(op.font) ? op.font : kit?.primaryFont || "Inter";
            whenFontReady(font, () => c.requestRenderAll());
            add(new Textbox(op.text, { left: op.x, top: op.y, width: op.w ?? size.w * 0.7, fontSize: op.size ?? Math.round(size.w / 14), fill: op.color ?? "#111111", fontWeight: op.weight ?? 700, fontFamily: font, textAlign: op.align ?? "left" }) as FObj, op.name ?? "Text", false);
          } else if (op.op === "add_svg") {
            await addSvg(op.svg, { x: op.x, y: op.y, w: op.w, name: op.name });
          } else if (op.op === "update") {
            const o = byId(op.id);
            if (!o) continue;
            const patch: Record<string, unknown> = {};
            if (op.x !== undefined) patch.left = op.x;
            if (op.y !== undefined) patch.top = op.y;
            if (op.w !== undefined) patch.scaleX = op.w / (o.width || 1);
            if (op.h !== undefined) patch.scaleY = op.h / (o.height || 1);
            if (op.angle !== undefined) patch.angle = op.angle;
            if (op.fill !== undefined) patch.fill = op.fill;
            if (op.stroke !== undefined) patch.stroke = op.stroke;
            if (op.strokeWidth !== undefined) patch.strokeWidth = op.strokeWidth;
            if (op.opacity !== undefined) patch.opacity = op.opacity;
            if (op.text !== undefined && o instanceof Textbox) patch.text = op.text;
            if (op.size !== undefined && o instanceof Textbox) patch.fontSize = op.size;
            o.set(patch); o.setCoords();
          } else if (op.op === "remove") {
            const o = byId(op.id); if (o) c.remove(o);
          } else if (op.op === "arrange") {
            const o = byId(op.id); if (o) arrange(o, op.to);
          } else if (op.op === "background") {
            setBg(op.color);
          }
        }
        c.requestRenderAll();
        record(); bump();
        useCanvasBridge.setState({ canUndo: true });
      },
      undo: () => { undo(); useCanvasBridge.setState({ canUndo: false }); },
    });
    return () => useCanvasBridge.setState({ attached: false, summary: null, apply: null, undo: null, canUndo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, size, bg, brandColors, paint, zoom, kit?.primaryFont]);

  // ---------- start screen
  if (!started) {
    return (
      <div className="max-w-[1000px] mx-auto p-4 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Editor</h2>
        <p className="text-sm mb-6" style={{ color: "var(--s-soft)" }}>Layers, shapes, pen and brush, real text, and AI right on the canvas: remove a background, swap a face, turn a photo into vectors, or ask for a logo.</p>
        <div className="grid gap-3 sm:grid-cols-3 mb-8">
          <button className="s-card p-5 text-left flex flex-col gap-2" onClick={() => setPicking("photo")}><ImagePlus className="h-5 w-5" style={{ color: "var(--s-accent)" }} /><b className="text-sm">Start from a photo</b><span className="text-xs" style={{ color: "var(--s-mute)" }}>From your Library or your device</span></button>
          <div className="s-card p-5 text-left flex flex-col gap-2">
            <Square className="h-5 w-5" /><b className="text-sm">Blank canvas</b><span className="text-xs" style={{ color: "var(--s-mute)" }}>Post, story, square or wide</span>
            <div className="flex gap-1.5 mt-1">
              <button className="s-btn sm flex-1" onClick={() => void begin("blank")} aria-label="Blank canvas, white"><span className="h-3 w-3 rounded-sm bg-white" /> White</button>
              <button className="s-btn sm flex-1" onClick={() => void begin("transparent")} aria-label="Blank canvas, transparent"><span className="h-3 w-3 rounded-sm" style={{ background: "repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 6px 6px" }} /> Transparent</button>
            </div>
          </div>
          <button className="s-card p-5 text-left flex flex-col gap-2" onClick={() => void begin("logo")}><Shapes className="h-5 w-5" style={{ color: "var(--s-ai)" }} /><b className="text-sm">Design a logo</b><span className="text-xs" style={{ color: "var(--s-mute)" }}>Transparent square; ask AI for a vector mark</span></button>
        </div>
        {picking === "photo" && <ImagePicker onPick={(p) => { setPicking(null); void begin("photo", p); }} />}
      </div>
    );
  }

  // ---------- editor UI
  const ShapeIcon = TOOL_INFO[lastShape].icon;
  const toolButton = (t: Tool, extra?: React.ReactNode) => {
    const info = TOOL_INFO[t];
    return (
      <button key={t} onClick={() => setToolSafe(t)} aria-pressed={tool === t} aria-label={`${info.label} (${info.key})`} className="s-tool group relative">
        <info.icon className="h-[18px] w-[18px]" />
        {extra}
        <span className="s-tip"><b>{info.label}</b> <span className="s-kbd">{info.key}</span><br /><span>{info.tip}</span></span>
      </button>
    );
  };
  const layers = (cv.current?.getObjects() ?? []).filter((o) => !(o as FObj).excludeFromExport).slice().reverse() as FObj[];
  const swatches = (onPick: (c: string) => void, current?: unknown) => (
    <div className="flex flex-wrap gap-1.5">
      {[...new Set(["#FFFFFF", "#111111", ...brandColors, ...photoColors])].slice(0, 12).map((c) => (
        <button key={c} onClick={() => onPick(c)} title={c} aria-label={`Colour ${c}`} className="h-6 w-6 rounded-md" style={{ background: c, border: `2px solid ${String(current).toUpperCase() === c ? "var(--s-accent)" : "var(--s-line-2)"}` }} />
      ))}
      <label className="h-6 w-6 rounded-md grid place-items-center cursor-pointer text-xs" style={{ border: "1px dashed var(--s-line-2)", color: "var(--s-mute)" }} title="Any colour">
        +<input type="color" className="sr-only" value={typeof current === "string" && current.startsWith("#") ? current.slice(0, 7) : "#111111"} onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
  const num = (label: string, value: number, onChange: (n: number) => void, step = 1) => (
    <label className="text-[11px] grid gap-1 min-w-0" style={{ color: "var(--s-mute)" }}>{label}
      <input className="s-input" data-no-mic type="number" step={step} value={Math.round(value * 100) / 100} onChange={(e) => onChange(Number(e.target.value))} style={{ height: 30, minWidth: 0, paddingRight: 8 }} />
    </label>
  );

  return (
    // minmax(0, 1fr): the canvas column is always "the space left", never sized by its contents, so a
    // toolbar change can't widen it and slide the canvas sideways under the pointer.
    <div className="grid min-h-0" style={{ gridTemplateColumns: "52px minmax(0, 1fr) 300px", height: "calc(100dvh - 56px - 53px)" }}>
      {/* tools */}
      <nav className="flex flex-col items-center gap-1 py-2" aria-label="Tools" style={{ background: "var(--s-panel)", borderRight: "1px solid var(--s-line)" }}>
        {toolButton("select")}
        {toolButton("hand")}
        <span className="s-tool-sep" />
        {toolButton("text")}
        <div className="relative">
          <button onClick={() => (SHAPES.includes(tool) ? setShapeMenu((m) => !m) : setToolSafe(lastShape))} onContextMenu={(e) => { e.preventDefault(); setShapeMenu(true); }}
            aria-pressed={SHAPES.includes(tool)} aria-label="Shapes" className="s-tool group relative">
            <ShapeIcon className="h-[18px] w-[18px]" />
            <span className="absolute right-1 bottom-1 h-0 w-0" style={{ borderLeft: "4px solid transparent", borderTop: "4px solid var(--s-mute)" }} />
            <span className="s-tip"><b>Shapes</b><br /><span>Rectangle, ellipse, line, star, polygon. Click again for more shapes.</span></span>
          </button>
          {shapeMenu && (
            <div className="absolute left-12 top-0 z-40 p-1 rounded-xl grid gap-0.5" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)", boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>
              {SHAPES.map((t) => { const I = TOOL_INFO[t].icon; return (
                <button key={t} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap hover:bg-[var(--s-hover)]" onClick={() => setToolSafe(t)}><I className="h-4 w-4" />{TOOL_INFO[t].label}<span className="s-kbd ml-auto">{TOOL_INFO[t].key}</span></button>
              ); })}
            </div>
          )}
        </div>
        {toolButton("pen")}
        {toolButton("brush")}
        {toolButton("eraser")}
        <span className="s-tool-sep" />
        <button className="s-tool group relative" onClick={() => setPicking("photo")} aria-label="Add a photo">
          <ImagePlus className="h-[18px] w-[18px]" />
          <span className="s-tip"><b>Add a photo</b><br /><span>From your Library or your device. Each photo is its own layer.</span></span>
        </button>
        <div className="flex-1" />
        <button className="s-tool group relative" style={{ color: "var(--s-ai)" }} onClick={() => ask("")} aria-label="Ask BlinkSpot to edit">
          <Sparkles className="h-[18px] w-[18px]" />
          <span className="s-tip"><b>Ask BlinkSpot</b><br /><span>Describe a change and the AI edits the canvas for you.</span></span>
        </button>
      </nav>

      {/* canvas */}
      <div className="flex flex-col min-h-0 min-w-0" style={{ background: "repeating-conic-gradient(#121315 0 25%, #0e0f11 0 50%) 0 0 / 24px 24px" }}>
        {/* one line, always: a wrapping toolbar would move the canvas whenever a tool shows its options */}
        <div className="flex flex-nowrap items-center gap-2 px-3 py-2 min-w-0 overflow-hidden" style={{ borderBottom: "1px solid var(--s-line)", background: "var(--s-bg)", height: 46 }}>
          <select className="s-input shrink-0" data-no-mic style={{ width: "auto", height: 30, fontSize: 12 }} value={size.id} onChange={(e) => setSize(SIZES.find((s) => s.id === e.target.value) ?? SIZES[0])} aria-label="Canvas size">
            {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.w}×{s.h}</option>)}
          </select>
          <button className="s-btn ghost sm" onClick={undo} disabled={history.current.index <= 0} aria-label="Undo" title="Undo (⌘Z)"><Undo2 className="h-3.5 w-3.5" /></button>
          <button className="s-btn ghost sm" onClick={redo} disabled={history.current.index >= history.current.stack.length - 1} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 className="h-3.5 w-3.5" /></button>
          <span className="flex items-center gap-0.5">
            <button className="s-btn ghost sm" onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))} aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button>
            <button className="s-btn ghost sm mono" onClick={fit} title="Fit to screen"><Maximize className="h-3.5 w-3.5" /> {Math.round(zoom * 100)}%</button>
            <button className="s-btn ghost sm" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button>
          </span>
          {(tool === "brush" || tool === "eraser" || tool === "pen" || SHAPES.includes(tool) || tool === "text") && (
            <span className="flex items-center gap-2 text-xs px-2 min-w-0 shrink" style={{ color: "var(--s-soft)" }}>
              {tool !== "eraser" && <label className="flex items-center gap-1.5">Colour <input type="color" value={paint} onChange={(e) => setPaint(e.target.value.toUpperCase())} className="h-6 w-8 rounded cursor-pointer" style={{ background: "none", border: "1px solid var(--s-line-2)" }} /></label>}
              {(tool === "brush" || tool === "eraser" || tool === "pen" || tool === "line") && <label className="flex items-center gap-1.5">Size <input type="range" min={1} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ accentColor: "var(--s-accent)" }} /> <span className="mono w-6">{brushSize}</span></label>}
              <span className="truncate hidden 2xl:inline max-w-[340px]" style={{ color: "var(--s-mute)" }}>{TOOL_INFO[tool].tip}</span>
            </span>
          )}
          <div className="flex-1 min-w-0" />
          {editingPoints && (
            <span className="s-pill" style={{ borderColor: "color-mix(in oklab, var(--s-ai) 50%, var(--s-line))" }}>
              Drag the white points; violet dots bend the curve
              <button className="s-btn primary sm" onClick={finishPointEdit}>Done</button>
            </span>
          )}
          {aiBusy && <span className="s-pill"><Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--s-ai)" }} /> {aiBusy}</span>}
          <div className="relative group shrink-0">
            <button className="s-btn sm"><Download className="h-3.5 w-3.5" /> Export</button>
            <div className="absolute right-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-40">
              <div className="p-1 rounded-xl grid" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }}>
                <button className="px-3 py-1.5 text-left text-xs rounded-lg hover:bg-[var(--s-hover)]" onClick={() => exportFile("png")}>PNG (transparent ok)</button>
                <button className="px-3 py-1.5 text-left text-xs rounded-lg hover:bg-[var(--s-hover)]" onClick={() => exportFile("jpeg")}>JPG (smaller)</button>
                <button className="px-3 py-1.5 text-left text-xs rounded-lg hover:bg-[var(--s-hover)]" onClick={() => exportFile("svg")}>SVG (vectors, for print)</button>
              </div>
            </div>
          </div>
          <button className="s-btn primary sm shrink-0" onClick={saveToLibrary} disabled={!!aiBusy}><Save className="h-3.5 w-3.5" /> Save to Library</button>
        </div>
        <div
          ref={wrapRef}
          className="flex-1 min-h-0 overflow-auto grid place-items-center p-8"
          style={{ cursor: tool === "hand" ? (panning.current ? "grabbing" : "grab") : undefined }}
          onPointerDown={(e) => { if (tool !== "hand" || !wrapRef.current) return; panning.current = { x: e.clientX, y: e.clientY, sl: wrapRef.current.scrollLeft, st: wrapRef.current.scrollTop }; }}
          onPointerMove={(e) => { const p = panning.current; if (!p || !wrapRef.current) return; wrapRef.current.scrollLeft = p.sl - (e.clientX - p.x); wrapRef.current.scrollTop = p.st - (e.clientY - p.y); }}
          onPointerUp={() => { panning.current = null; }}
          // Re-measure where the canvas sits before fabric reads the pointer (capture runs first). Any layout
          // shift (panels, banners, scrollbars) would otherwise make clicks land beside the pointer.
          onPointerDownCapture={() => cv.current?.calcOffset()}
          onPointerMoveCapture={() => cv.current?.calcOffset()}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); Array.from(e.dataTransfer.files).slice(0, 10).forEach((f) => void onFile(f)); }}
        >
          <div style={{ boxShadow: "0 30px 80px rgba(0,0,0,.55)", background: bg === "transparent" ? "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 16px 16px" : undefined, pointerEvents: tool === "hand" ? "none" : undefined }}>
            <canvas ref={elRef} />
          </div>
        </div>
        <div className="px-3 py-1.5 text-[11px] mono flex gap-3" style={{ color: "var(--s-mute)", borderTop: "1px solid var(--s-line)", background: "var(--s-bg)" }}>
          <span>{size.w} × {size.h}</span><span>{layers.length} layer{layers.length === 1 ? "" : "s"}</span><span className="hidden md:inline">Drop or paste images and SVGs · hover a tool to see what it does · ⌘Z undo · Esc back to Move</span>
        </div>
      </div>

      {/* properties + layers */}
      <aside className="flex flex-col min-h-0 min-w-0" style={{ background: "var(--s-panel)", borderLeft: "1px solid var(--s-line)" }}>
        <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" aria-label="Font file" onChange={(e) => { void uploadFont(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {fontAsk.length > 0 && (
            <div className="m-3 rounded-lg p-3 grid gap-2 text-[12px] min-w-0 break-words" style={{ background: "color-mix(in oklab, var(--s-ai) 10%, transparent)", border: "1px solid color-mix(in oklab, var(--s-ai) 30%, var(--s-line))", color: "var(--s-soft)" }}>
              <b className="text-[12.5px]" style={{ color: "var(--s-text)" }}>Fonts in this design</b>
              {fontAsk.map((f) => (
                <div key={f.font} className="grid gap-1">
                  <span>Looks like <b>{f.font}</b>, which isn&apos;t free to load. Showing <b>{f.using}</b> for now.</span>
                  <button type="button" className="s-btn ai sm justify-self-start max-w-full h-auto py-1.5 whitespace-normal text-left" onClick={() => { fontFor.current = f.font; fontInput.current?.click(); }}><UploadIcon className="h-3.5 w-3.5 shrink-0" /> Upload the font file</button>
                </div>
              ))}
              <button type="button" className="text-[11px] justify-self-start underline" style={{ color: "var(--s-mute)" }} onClick={() => setFontAsk([])}>Keep the free fonts</button>
            </div>
          )}
          {!active ? (
            <div className="p-3.5 grid gap-4 grid-cols-[minmax(0,1fr)]">
              <div>
                <b className="text-[13px]">Canvas</b>
                <span className="s-label mt-3">Background</span>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <button onClick={() => setBg("transparent")} title="Transparent" className="h-6 w-6 rounded-md" style={{ background: "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px", border: `2px solid ${bg === "transparent" ? "var(--s-accent)" : "var(--s-line-2)"}` }} />
                  {swatches(setBg, bg)}
                </div>
              </div>
              <div className="s-card p-3 grid gap-2" style={{ borderColor: "color-mix(in oklab, var(--s-ai) 35%, var(--s-line))" }}>
                <b className="text-[13px] flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> Make a vector with AI</b>
                <textarea className="s-input" rows={2} value={vectorPrompt} onChange={(e) => setVectorPrompt(e.target.value)} placeholder="e.g. a minimal leaf logo mark, a sale badge, a coffee cup icon" aria-label="Describe a vector" />
                {aiLocked ? <CreditsNote /> : (
                  <div className="flex gap-1.5">
                    <button className="s-btn ai sm flex-1 justify-between" onClick={() => makeVector()} disabled={!!aiBusy} title="Priced on what the drawing takes: usually about 5 credits, never more than 25"><span>Draw it</span><span className="cost">~5 cr</span></button>
                    <button className="s-btn ghost sm" onClick={() => makeVector(vectorPrompt, "outline")} disabled={!!aiBusy} title="Line-art version">Outline</button>
                  </div>
                )}
                <p className="text-[11px]" style={{ color: "var(--s-mute)" }}>Comes in as editable layers you can recolour, resize and ungroup. Priced on what it takes, usually about 5 credits. Logos in the Brand builder are free.</p>
              </div>
              {kit?.logoUrl && <button className="s-btn justify-start" onClick={() => void addImage(kit.logoUrl!, "Logo")}><ImagePlus className="h-4 w-4" /> Add your logo</button>}
              <p className="text-xs leading-relaxed" style={{ color: "var(--s-mute)" }}>Pick a tool on the left. Hover any tool to learn what it does. Click a layer to change it; AI tools appear when a photo is selected.</p>
            </div>
          ) : (
            <div className="p-3.5 grid gap-3 grid-cols-[minmax(0,1fr)]">
              <div className="flex items-center gap-2">
                <b className="text-[13px] truncate flex-1 min-w-0">{active.name ?? typeLabel(active)}</b>
                <button className="s-btn ghost sm" onClick={() => { canvas().discardActiveObject(); canvas().requestRenderAll(); bump(); }} title="Deselect (Esc)">Done</button>
                <button className="s-btn ghost sm" onClick={duplicateActive} aria-label="Duplicate" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                <button className="s-btn ghost sm" onClick={removeActive} aria-label="Delete layer" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {([
                  ["left", AlignStartVertical, "Align left"], ["hcenter", AlignCenterVertical, "Centre horizontally"], ["right", AlignEndVertical, "Align right"],
                  ["top", AlignStartHorizontal, "Align top"], ["vcenter", AlignCenterHorizontal, "Centre vertically"], ["bottom", AlignEndHorizontal, "Align bottom"],
                ] as const).map(([a, Icon, label]) => (
                  <button key={a} className="s-btn ghost sm" onClick={() => alignActive(a)} title={`${label} on the canvas`} aria-label={label} style={{ padding: 0 }}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {num("X", active.left ?? 0, (n) => setProp(active, { left: n }))}
                {num("Y", active.top ?? 0, (n) => setProp(active, { top: n }))}
                {num("W", active.getScaledWidth(), (n) => setProp(active, { scaleX: n / (active.width || 1) }))}
                {num("H", active.getScaledHeight(), (n) => setProp(active, { scaleY: n / (active.height || 1) }))}
                {num("Rotate °", active.angle ?? 0, (n) => setProp(active, { angle: n }))}
                <label className="text-[11px] grid gap-1 min-w-0" style={{ color: "var(--s-mute)" }}>Opacity
                  <input type="range" min={0} max={1} step={0.05} value={active.opacity ?? 1} onChange={(e) => setProp(active, { opacity: Number(e.target.value) })} style={{ accentColor: "var(--s-accent)" }} />
                </label>
              </div>

              {active instanceof Textbox && (
                <div className="grid gap-2 grid-cols-[minmax(0,1fr)]">
                  <span className="s-label">Text</span>
                  <select className="s-input min-w-0 w-full" data-no-mic aria-label="Font" value={String(active.fontFamily)} onChange={(e) => { const f = e.target.value; setProp(active, { fontFamily: f }); whenFontReady(f, () => { active.set({ dirty: true }); canvas().requestRenderAll(); }); }}>
                    {[...new Set([kit?.primaryFont, ...customFonts, String(active.fontFamily), ...FONTS].filter(Boolean) as string[])].map((f) => <option key={f} value={f}>{f}{f === kit?.primaryFont ? " (brand)" : customFonts.includes(f) ? " (yours)" : ""}</option>)}
                  </select>
                  {(active as FObj).wantedFont && (active as FObj).wantedFont!.toLowerCase() !== String(active.fontFamily).toLowerCase() && (
                    <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>The original looks like <b>{(active as FObj).wantedFont}</b>. Showing the closest free font.</p>
                  )}
                  <button type="button" className="s-btn ghost sm justify-start" onClick={() => { fontFor.current = (active as FObj).wantedFont ?? null; fontInput.current?.click(); }}><UploadIcon className="h-3.5 w-3.5" /> Upload a font file</button>
                  <div className="grid grid-cols-2 gap-2">
                    {num("Size", active.fontSize ?? 40, (n) => setProp(active, { fontSize: n }))}
                    <label className="text-[11px] grid gap-1 min-w-0" style={{ color: "var(--s-mute)" }}>Weight
                      <select className="s-input min-w-0 w-full" data-no-mic aria-label="Weight" style={{ height: 30 }} value={String(active.fontWeight)} onChange={(e) => setProp(active, { fontWeight: Number(e.target.value) })}>
                        {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </label>
                    {num("Line height", active.lineHeight ?? 1.16, (n) => setProp(active, { lineHeight: n }), 0.05)}
                    {num("Spacing", active.charSpacing ?? 0, (n) => setProp(active, { charSpacing: n }), 10)}
                  </div>
                  <div className="s-seg w-fit">{(["left", "center", "right"] as const).map((a) => <button key={a} aria-pressed={active.textAlign === a} onClick={() => setProp(active, { textAlign: a })}>{a}</button>)}</div>
                  <span className="s-label">Colour</span>
                  {swatches((c) => setProp(active, { fill: c }), active.fill)}
                </div>
              )}

              {!(active instanceof Textbox) && !(active instanceof FabricImage) && (
                <div className="grid gap-2 grid-cols-[minmax(0,1fr)]">
                  {!(active instanceof Line) && <><span className="s-label">Fill</span>{swatches((c) => setProp(active, { fill: c }), active.fill)}</>}
                  <span className="s-label">Outline</span>
                  {swatches((c) => setProp(active, { stroke: c, strokeWidth: active.strokeWidth || 4 }), active.stroke)}
                  <label className="text-[11px] flex items-center gap-2" style={{ color: "var(--s-mute)" }}>Outline width
                    <input type="range" min={0} max={60} value={active.strokeWidth ?? 0} onChange={(e) => setProp(active, { strokeWidth: Number(e.target.value) })} className="flex-1" style={{ accentColor: "var(--s-accent)" }} />
                  </label>
                  {active instanceof Rect && (
                    <label className="text-[11px] flex items-center gap-2" style={{ color: "var(--s-mute)" }}>Corners
                      <input type="range" min={0} max={Math.round(Math.min(active.width, active.height) / 2)} value={active.rx ?? 0} onChange={(e) => setProp(active, { rx: Number(e.target.value), ry: Number(e.target.value) })} className="flex-1" style={{ accentColor: "var(--s-accent)" }} />
                    </label>
                  )}
                  {active instanceof Group && <button className="s-btn sm justify-start" onClick={() => ungroup(active as Group & FObj)}><Ungroup className="h-3.5 w-3.5" /> Ungroup into layers</button>}
                  {active.anchors?.length ? <button className="s-btn sm justify-start" onClick={() => startPointEdit(active)}><PenTool className="h-3.5 w-3.5" /> Edit points (or double-click the shape)</button> : null}
                </div>
              )}

              {activeImage && (
                <div className="grid gap-2 grid-cols-[minmax(0,1fr)]">
                  <span className="s-label">AI on this photo</span>
                  {aiLocked ? <CreditsNote /> : (
                    <>
                      <button className="s-btn ai justify-between" onClick={removeBackground} disabled={!!aiBusy}><span className="flex items-center gap-2"><Scissors className="h-4 w-4" /> Remove background</span><span className="cost">1 cr</span></button>
                      <button className="s-btn ai justify-between" onClick={() => setPicking("face")} disabled={!!aiBusy}><span className="flex items-center gap-2"><UserRound className="h-4 w-4" /> Swap the face</span><span className="cost">3 cr</span></button>
                      <div className="flex gap-1.5">
                        <input className="s-input" style={{ height: 34 }} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Change it: e.g. make the sky sunset orange" aria-label="Describe an edit" onKeyDown={(e) => { if (e.key === "Enter" && editPrompt.trim()) void aiEdit(editPrompt.trim()); }} />
                        <button className="s-btn ai" onClick={() => editPrompt.trim() && aiEdit(editPrompt.trim())} disabled={!!aiBusy || !editPrompt.trim()} title="18 credits"><Wand2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  )}
                  <button className="s-btn ai justify-between" onClick={splitIntoLayers} disabled={!!aiBusy} title="For posters and flyers: the words become real text in the closest font, the logo becomes a vector, the photo loses its old words"><span className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4" /> Split into layers</span><span className="cost">~20 cr</span></button>
                  <button className="s-btn justify-between" onClick={vectorizeActive} disabled={!!aiBusy} title="Best for logos, icons and flat graphics"><span className="flex items-center gap-2"><Shapes className="h-4 w-4" /> Trace as vectors (logos, icons)</span><span className="cost">free</span></button>
                  <Link className="s-btn justify-start" href={`/studio/video?mode=showcase&start=${encodeURIComponent(activeImage.srcUrl ?? "")}`}><Film className="h-4 w-4" /> Animate this photo</Link>
                  <span className="s-label mt-2">Adjust</span>
                  {(["brightness", "contrast", "saturation"] as const).map((k) => (
                    <label key={k} className="text-[11px] flex items-center gap-2 capitalize" style={{ color: "var(--s-mute)" }}>{k}
                      <input type="range" min={-0.6} max={0.6} step={0.02} defaultValue={filterValue(activeImage, k)} onChange={(e) => applyFilter(activeImage, k, Number(e.target.value))} onPointerUp={() => record()} className="flex-1" style={{ accentColor: "var(--s-accent)" }} />
                    </label>
                  ))}
                  {photoColors.length > 0 && (
                    <>
                      <span className="s-label mt-2">Colours in this photo</span>
                      <div className="flex flex-wrap gap-1.5">{photoColors.map((c) => <button key={c} className="h-6 w-6 rounded-md" style={{ background: c, border: "1px solid var(--s-line-2)" }} title={`Use ${c} for new shapes`} onClick={() => { setPaint(c); toast.success(`${c} is now your drawing colour`); }} />)}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* layers */}
        <div className="shrink-0 max-h-[38%] overflow-y-auto overflow-x-hidden" style={{ borderTop: "1px solid var(--s-line)" }}>
          <div className="flex items-center gap-2 px-3.5 py-2 sticky top-0" style={{ background: "var(--s-panel)" }}>
            <LayersIcon className="h-3.5 w-3.5" style={{ color: "var(--s-mute)" }} /><b className="text-[12px]">Layers</b>
          </div>
          <div className="px-2 pb-2 grid gap-0.5 grid-cols-[minmax(0,1fr)]">
            {layers.length === 0 && <p className="text-xs px-2 py-2" style={{ color: "var(--s-mute)" }}>Nothing yet. Add text, a shape or a photo.</p>}
            {layers.map((o) => {
              const sel = cv.current?.getActiveObjects().includes(o);
              const locked = o.selectable === false;
              return (
                <div key={o.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12.5px] cursor-pointer"
                  style={{ background: sel ? "var(--s-raised)" : "transparent", boxShadow: sel ? "inset 2px 0 0 var(--s-accent)" : "none", color: sel ? "var(--s-text)" : "var(--s-soft)", opacity: o.visible === false ? 0.5 : 1 }}
                  onClick={() => { if (locked) return; setToolSafe("select"); canvas().setActiveObject(o); canvas().requestRenderAll(); bump(); }}>
                  <span className="text-[10px] mono w-14 shrink-0" style={{ color: "var(--s-mute)" }}>{typeLabel(o)}</span>
                  <input data-no-mic className="bg-transparent outline-none flex-1 min-w-0 w-0 truncate" value={o.name ?? ""} onChange={(e) => { o.set({ name: e.target.value } as Partial<FObj>); bump(); record(); }} onBlur={() => record()} aria-label="Layer name" />
                  <button onClick={(e) => { e.stopPropagation(); setProp(o, { visible: o.visible === false }); }} aria-label={o.visible === false ? "Show layer" : "Hide layer"} className="p-0.5">{o.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  <button onClick={(e) => { e.stopPropagation(); setProp(o, { selectable: locked, evented: locked }); if (!locked) canvas().discardActiveObject(); }} aria-label={locked ? "Unlock layer" : "Lock layer"} className="p-0.5">{locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-40" />}</button>
                  <button onClick={(e) => { e.stopPropagation(); arrange(o, "forward"); }} aria-label="Move up" className="p-0.5"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); arrange(o, "backward"); }} aria-label="Move down" className="p-0.5"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* pickers */}
      {picking && (
        <Overlay onClose={() => setPicking(null)}>
          <div className="s-card p-4 w-full max-w-[860px] max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <b className="text-sm">{picking === "face" ? "Pick the face to use" : "Add a photo"}</b>
              <button className="s-btn ghost sm" onClick={() => setPicking(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            {picking === "photo" && <button className="s-btn mb-3" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> From this device</button>}
            <ImagePicker
              allowUpload={picking === "face"}
              onPick={async (p) => {
                const mode = picking;
                setPicking(null);
                if (mode === "photo") { await addImage(p.url, p.title || "Photo"); return; }
                // face: needs a storage/library URL the workflow trusts
                let faceUrl = p.url;
                if (faceUrl.startsWith("blob:")) faceUrl = await uploadBlob(await (await fetch(faceUrl)).blob(), "editor_face");
                void swapFace(faceUrl);
              }}
            />
          </div>
        </Overlay>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg" className="hidden" onChange={(e) => { setPicking(null); void onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/** Shown in place of the Editor's AI buttons when the balance is 0. */
function CreditsNote() {
  return (
    <div className="rounded-lg p-3 grid gap-2 text-[12px] leading-relaxed" style={{ background: "color-mix(in oklab, var(--s-ai) 10%, transparent)", border: "1px solid color-mix(in oklab, var(--s-ai) 30%, var(--s-line))", color: "var(--s-soft)" }}>
      <span>{AI_NEEDS_CREDITS}</span>
      <Link href="/studio/account/billing" className="s-btn ai sm justify-center">Get credits</Link>
    </div>
  );
}
