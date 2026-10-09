"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlignCenter, AlignLeft, AlignRight, Download, Film, ImageIcon, Loader2, Plus, Save, Trash2, Type, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { GOOGLE_FONTS_REGISTRY } from "@/lib/fonts";
import { ImagePicker, type PickedImage } from "./ImagePicker";
import { thumbUrl } from "./media";

/**
 * Poster designer: the AI makes the photograph, the type and logo are set for real on top (crisp,
 * editable, spelled right), the way the KYRA and Nuf Farms posters were made. Free: nothing here
 * spends credits. Exports a PNG at the platform size and can save it to the Library.
 */

type Layer = {
  id: string;
  kind: "text" | "logo";
  x: number; y: number; w: number; // percent of the artboard
  text?: string; size?: number; font?: string; weight?: number; color?: string;
  align?: "left" | "center" | "right"; lh?: number; ls?: number;
  invert?: boolean;
};

const FORMATS = [
  { id: "4:5", label: "Post 4:5", w: 1080, h: 1350 },
  { id: "1:1", label: "Square", w: 1080, h: 1080 },
  { id: "9:16", label: "Story 9:16", w: 1080, h: 1920 },
  { id: "16:9", label: "Wide 16:9", w: 1920, h: 1080 },
] as const;
type FormatId = (typeof FORMATS)[number]["id"];

type Slot = Pick<Layer, "x" | "y" | "w"> & { size?: number; align?: Layer["align"]; lh?: number };
/** Layouts that move the headline, the line and the logo; the user's words and colours stay. */
const TEMPLATES: Array<{ id: string; label: string; head: Slot; sub: Slot; logo: Slot; shade: "none" | "top" | "bottom"; shadeAmt: number }> = [
  { id: "top", label: "Headline top", head: { x: 7, y: 6, w: 86, size: 104, align: "left", lh: 0.95 }, sub: { x: 7, y: 27, w: 70, size: 36, align: "left" }, logo: { x: 73, y: 88, w: 20 }, shade: "top", shadeAmt: 50 },
  { id: "band", label: "Bottom band", head: { x: 7, y: 64, w: 86, size: 88, align: "left", lh: 0.95 }, sub: { x: 7, y: 82, w: 70, size: 32, align: "left" }, logo: { x: 76, y: 5, w: 17 }, shade: "bottom", shadeAmt: 65 },
  { id: "center", label: "Centred statement", head: { x: 8, y: 36, w: 84, size: 96, align: "center", lh: 0.95 }, sub: { x: 15, y: 58, w: 70, size: 34, align: "center" }, logo: { x: 41, y: 87, w: 18 }, shade: "bottom", shadeAmt: 35 },
  { id: "minimal", label: "Minimal corner", head: { x: 7, y: 83, w: 62, size: 48, align: "left", lh: 1.05 }, sub: { x: 7, y: 91, w: 62, size: 24, align: "left" }, logo: { x: 81, y: 6, w: 13 }, shade: "bottom", shadeAmt: 40 },
];

const DESIGN_FONTS = ["Plus Jakarta Sans", "Inter", "DM Sans", "Syne", "Space Grotesk", "Montserrat", "Playfair Display", "Bebas Neue", "Anton", "Archivo Black"];
const PROXY_HOSTS = ["res.cloudinary.com", "supabase.co", "tempfile.aiquickdraw.com"];
const uid = () => Math.random().toString(36).slice(2, 9);

/** Same-origin URL for canvas work (a cross-origin pixel read would taint the export). */
function canvasSafe(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  try {
    const host = new URL(url).hostname;
    return PROXY_HOSTS.some((h) => host.endsWith(h)) ? `/api/fetch-media?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image"));
    img.src = src;
  });
}

const loadedFonts = new Set<string>();
function ensureFont(family: string) {
  if (loadedFonts.has(family) || typeof document === "undefined") return;
  loadedFonts.add(family);
  const reg = GOOGLE_FONTS_REGISTRY.find((f) => f.family === family);
  const weights = reg?.weights?.length ? reg.weights.join(";") : "400;700";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
}

/** The dominant colours of a photo, most common first, skipping near-duplicates. */
function paletteOf(img: HTMLImageElement, max = 6): string[] {
  const c = document.createElement("canvas");
  c.width = 48; c.height = 48;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 48, 48);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, 48, 48).data; } catch { return []; }
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
    buckets.set(key, e);
  }
  const out: Array<[number, number, number]> = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb: [number, number, number] = [e.r / e.n, e.g / e.n, e.b / e.n].map(Math.round) as [number, number, number];
    if (out.every((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]) > 48)) out.push(rgb);
    if (out.length >= max) break;
  }
  return out.map(([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase());
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

type BrandKit = { name: string; logo: string | null; colors: string[]; font: string | null; loaded: boolean };

export function PosterDesigner({ initial }: { initial?: PickedImage | null }) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [photo, setPhoto] = useState<PickedImage | null>(initial ?? null);
  const [picking, setPicking] = useState(!initial);
  const [format, setFormat] = useState<FormatId>("4:5");
  const [layers, setLayers] = useState<Layer[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [light, setLight] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [shade, setShade] = useState<"none" | "top" | "bottom">("bottom");
  const [shadeAmt, setShadeAmt] = useState(45);
  const [photoColors, setPhotoColors] = useState<string[]>([]);
  const [kit, setKit] = useState<BrandKit>({ name: "", logo: null, colors: [], font: null, loaded: false });
  const [busy, setBusy] = useState<"export" | "save" | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: 600 });
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const f = FORMATS.find((x) => x.id === format)!;
  const scale = Math.min(box.w / f.w, box.h / f.h);
  const art = { w: Math.round(f.w * scale), h: Math.round(f.h * scale) };
  const selected = layers.find((l) => l.id === sel) ?? null;

  // Brand kit: logo, colours, font from Brand DNA.
  useEffect(() => {
    if (!activeBrand) return;
    supabase
      .from("brand_profiles")
      .select("brand_name, logo_url, primary_color, secondary_color, primary_font")
      .eq("id", activeBrand.id)
      .maybeSingle()
      .then(({ data }) => {
        const colors = [data?.primary_color, data?.secondary_color].filter((c): c is string => typeof c === "string" && /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c.startsWith("#") ? c : `#${c}`));
        const font = typeof data?.primary_font === "string" && data.primary_font ? data.primary_font : null;
        setKit({ name: data?.brand_name || activeBrand.brand_name || "", logo: data?.logo_url || activeBrand.logo_url || null, colors, font, loaded: true });
      });
  }, [activeBrand]);

  const fonts = useMemo(() => (kit.font && !DESIGN_FONTS.includes(kit.font) ? [kit.font, ...DESIGN_FONTS] : DESIGN_FONTS), [kit.font]);
  useEffect(() => { layers.forEach((l) => l.font && ensureFont(l.font)); }, [layers]);

  // Starting layout (three zones: headline top, line under it, logo bottom corner) once the kit is known.
  useEffect(() => {
    if (layers.length || !kit.loaded) return;
    const font = kit.font || "Plus Jakarta Sans";
    const next: Layer[] = [
      { id: uid(), kind: "text", x: 7, y: 6, w: 86, text: "Your headline here", size: 104, font, weight: 800, color: "#FFFFFF", align: "left", lh: 0.95, ls: -2 },
      { id: uid(), kind: "text", x: 7, y: 27, w: 70, text: "One line that says why it matters", size: 36, font, weight: 500, color: "#FFFFFF", align: "left", lh: 1.2, ls: 0 },
    ];
    if (kit.logo) next.push({ id: uid(), kind: "logo", x: 73, y: 88, w: 20 });
    setLayers(next);
    setSel(next[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.loaded]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.max(200, e.contentRect.width - 40), h: Math.max(200, e.contentRect.height - 40) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [picking]);

  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    loadImage(canvasSafe(thumbUrl(photo.url, 200))).then((img) => { if (!cancelled) setPhotoColors(paletteOf(img)); }).catch(() => setPhotoColors([]));
    return () => { cancelled = true; };
  }, [photo]);

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setLayers((ls) => {
      let textIndex = 0;
      const next = ls.map((l) => {
        if (l.kind === "logo") return { ...l, ...t.logo };
        const slot = textIndex++ === 0 ? t.head : t.sub;
        return textIndex <= 2 ? { ...l, ...slot } : l;
      });
      if (kit.logo && !next.some((l) => l.kind === "logo")) next.push({ id: uid(), kind: "logo", ...t.logo });
      return next;
    });
    setShade(t.shade);
    setShadeAmt(t.shadeAmt);
  }

  const update = useCallback((id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))), []);
  const remove = useCallback((id: string) => { setLayers((ls) => ls.filter((l) => l.id !== id)); setSel(null); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(sel); }
      const step = e.shiftKey ? 2 : 0.5;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); setLayers((ls) => ls.map((l) => (l.id === sel ? { ...l, x: l.x + d[0], y: l.y + d[1] } : l))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, remove]);

  async function render(): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = f.w; canvas.height = f.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.w, f.h);
    if (photo) {
      const img = await loadImage(canvasSafe(photo.url));
      const s = Math.max(f.w / img.naturalWidth, f.h / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.filter = `brightness(${light}%) contrast(${contrast}%)`;
      ctx.drawImage(img, (f.w - dw) / 2, (f.h - dh) / 2, dw, dh);
      ctx.filter = "none";
    }
    if (shade !== "none") {
      const g = ctx.createLinearGradient(0, shade === "top" ? 0 : f.h, 0, shade === "top" ? f.h * 0.6 : f.h * 0.4);
      g.addColorStop(0, `rgba(0,0,0,${shadeAmt / 100})`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, f.w, f.h);
    }
    for (const l of layers) {
      const x = (l.x / 100) * f.w, y = (l.y / 100) * f.h, w = (l.w / 100) * f.w;
      if (l.kind === "text" && l.text) {
        const size = l.size ?? 48;
        const font = `${l.weight ?? 700} ${size}px "${l.font ?? "Inter"}"`;
        await document.fonts.load(font).catch(() => {});
        ctx.font = font;
        ctx.fillStyle = l.color ?? "#fff";
        ctx.textBaseline = "top";
        if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.ls ?? 0}px`;
        const lines = wrapLines(ctx, l.text, w);
        const lh = size * (l.lh ?? 1.15);
        lines.forEach((line, i) => {
          const lw = ctx.measureText(line).width;
          const lx = l.align === "center" ? x + (w - lw) / 2 : l.align === "right" ? x + w - lw : x;
          ctx.fillText(line, lx, y + i * lh + (lh - size) / 2);
        });
      }
      if (l.kind === "logo" && kit.logo) {
        const img = await loadImage(canvasSafe(kit.logo));
        const h = (img.naturalHeight / img.naturalWidth) * w;
        if (l.invert) {
          const o = document.createElement("canvas"); o.width = Math.ceil(w); o.height = Math.ceil(h);
          const octx = o.getContext("2d")!;
          octx.drawImage(img, 0, 0, w, h);
          octx.globalCompositeOperation = "source-in"; octx.fillStyle = "#fff"; octx.fillRect(0, 0, w, h);
          ctx.drawImage(o, x, y);
        } else ctx.drawImage(img, x, y, w, h);
      }
    }
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"));
  }

  async function onExport() {
    setBusy("export");
    try {
      const blob = await render();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(kit.name || "design").replace(/\W+/g, "-").toLowerCase()}-${format.replace(":", "x")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally { setBusy(null); }
  }

  async function onSave() {
    if (!clientId || !activeBrand) return;
    setBusy("save");
    try {
      const blob = await render();
      const path = `designs/${clientId}/${Date.now()}_${format.replace(":", "x")}.png`;
      const { error: upErr } = await supabase.storage.from("assets").upload(path, blob, { contentType: "image/png" });
      if (upErr) throw upErr;
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      const headline = layers.find((l) => l.kind === "text")?.text?.split("\n")[0]?.slice(0, 120) || "Design";
      const { data, error } = await supabase
        .from("content")
        .insert({ client_id: clientId, brand_id: activeBrand.id, content_type: "post_image", image_urls: [url], caption: headline, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Saved to your Library", { action: { label: "Open", onClick: () => { window.location.href = `/studio/library/${data.id}`; } } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the design");
    } finally { setBusy(null); }
  }

  const swatches = (onPick: (c: string) => void, current?: string) => (
    <div className="flex flex-wrap gap-1.5">
      {[...new Set(["#FFFFFF", "#0B0B0C", ...kit.colors, ...photoColors])].map((c) => (
        <button key={c} onClick={() => onPick(c)} title={c} aria-label={`Colour ${c}`} className="h-7 w-7 rounded-md"
          style={{ background: c, border: `2px solid ${current?.toUpperCase() === c.toUpperCase() ? "var(--s-accent)" : "var(--s-line-2)"}` }} />
      ))}
      <label className="h-7 w-7 rounded-md grid place-items-center cursor-pointer text-xs" style={{ border: "1px dashed var(--s-line-2)", color: "var(--s-mute)" }} title="Any colour">
        +<input type="color" className="sr-only" value={current ?? "#ffffff"} onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </div>
  );

  if (picking || !photo) {
    return (
      <div className="max-w-[980px] mx-auto p-4 md:p-8">
        <h2 className="text-xl font-semibold mb-1">Pick the photo</h2>
        <p className="text-sm mb-5" style={{ color: "var(--s-soft)" }}>Start from something you generated, or upload one. Your headline, line and logo go on top as real, editable type.</p>
        <ImagePicker onPick={(p) => { setPhoto(p); setPicking(false); }} />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] min-h-0" style={{ height: "calc(100dvh - 56px - 53px)" }}>
      <div className="flex flex-col min-h-0" style={{ background: "repeating-conic-gradient(#121315 0 25%, #0e0f11 0 50%) 0 0 / 24px 24px" }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--s-line)", background: "var(--s-bg)" }}>
          <div className="s-seg" role="tablist" aria-label="Format">
            {FORMATS.map((x) => <button key={x.id} role="tab" aria-selected={format === x.id} onClick={() => setFormat(x.id)}>{x.label}</button>)}
          </div>
          <select className="s-input" style={{ width: "auto", height: 28, fontSize: 12 }} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }} aria-label="Layout">
            <option value="" disabled>Layout…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button className="s-btn sm" onClick={() => {
            const l: Layer = { id: uid(), kind: "text", x: 10, y: 45, w: 60, text: "New text", size: 48, font: kit.font || "Plus Jakarta Sans", weight: 700, color: "#FFFFFF", align: "left", lh: 1.1, ls: 0 };
            setLayers((ls) => [...ls, l]); setSel(l.id);
          }}><Type className="h-3.5 w-3.5" /> Text</button>
          {kit.logo && !layers.some((l) => l.kind === "logo") && (
            <button className="s-btn sm" onClick={() => { const l: Layer = { id: uid(), kind: "logo", x: 73, y: 88, w: 20 }; setLayers((ls) => [...ls, l]); setSel(l.id); }}><Plus className="h-3.5 w-3.5" /> Logo</button>
          )}
          <button className="s-btn sm" onClick={() => setPicking(true)}><ImageIcon className="h-3.5 w-3.5" /> Photo</button>
          <div className="flex-1" />
          <button className="s-btn sm" onClick={onExport} disabled={!!busy}>{busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PNG</button>
          <button className="s-btn primary sm" onClick={onSave} disabled={!!busy}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save to Library</button>
        </div>
        <div ref={stageRef} className="flex-1 min-h-[360px] grid place-items-center p-5" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="relative overflow-hidden select-none" style={{ width: art.w, height: art.h, boxShadow: "0 30px 80px rgba(0,0,0,.6)", background: "#000" }}
            onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.photo) setSel(null); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-photo="1" src={thumbUrl(photo.url, 1600)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" style={{ filter: `brightness(${light}%) contrast(${contrast}%)` }} />
            {shade !== "none" && (
              <div className="absolute inset-0 pointer-events-none" style={{ background: shade === "top" ? `linear-gradient(to bottom, rgba(0,0,0,${shadeAmt / 100}), transparent 60%)` : `linear-gradient(to top, rgba(0,0,0,${shadeAmt / 100}), transparent 60%)` }} />
            )}
            {layers.map((l) => (
              <div
                key={l.id}
                role="button"
                tabIndex={0}
                aria-label={l.kind === "logo" ? "Logo" : `Text: ${l.text}`}
                className="absolute cursor-move"
                style={{
                  left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`,
                  outline: sel === l.id ? "1.5px solid var(--s-accent)" : "none", outlineOffset: 4,
                  ...(l.kind === "text" ? {
                    fontFamily: `"${l.font}"`, fontWeight: l.weight, fontSize: (l.size ?? 48) * scale, lineHeight: l.lh ?? 1.15,
                    letterSpacing: (l.ls ?? 0) * scale, color: l.color, textAlign: l.align, whiteSpace: "pre-wrap", overflowWrap: "break-word",
                  } : {}),
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel(l.id);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.id !== l.id) return;
                  update(l.id, { x: d.ox + ((e.clientX - d.sx) / art.w) * 100, y: d.oy + ((e.clientY - d.sy) / art.h) * 100 });
                }}
                onPointerUp={() => { drag.current = null; }}
              >
                {l.kind === "text" ? l.text : kit.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kit.logo} alt="" draggable={false} className="w-full h-auto" style={l.invert ? { filter: "brightness(0) invert(1)" } : undefined} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 py-2 text-[11px] mono" style={{ color: "var(--s-mute)", borderTop: "1px solid var(--s-line)", background: "var(--s-bg)" }}>
          {f.w} × {f.h} · drag to move · arrows nudge · delete removes · free, no credits
        </div>
      </div>

      <aside className="overflow-y-auto" style={{ background: "var(--s-panel)", borderLeft: "1px solid var(--s-line)" }}>
        <div className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <span className="s-label">Layers</span>
          <div className="grid gap-1">
            {[...layers].reverse().map((l) => (
              <button key={l.id} onClick={() => setSel(l.id)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[13px]"
                style={{ background: sel === l.id ? "var(--s-raised)" : "transparent", boxShadow: sel === l.id ? "inset 2px 0 0 var(--s-accent)" : "none", color: sel === l.id ? "var(--s-text)" : "var(--s-soft)" }}>
                {l.kind === "logo" ? <ImageIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                <span className="truncate">{l.kind === "logo" ? "Logo" : l.text || "Text"}</span>
              </button>
            ))}
            <button onClick={() => setSel(null)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[13px]"
              style={{ background: !sel ? "var(--s-raised)" : "transparent", boxShadow: !sel ? "inset 2px 0 0 var(--s-accent)" : "none", color: !sel ? "var(--s-text)" : "var(--s-soft)" }}>
              <ImageIcon className="h-3.5 w-3.5" /> Photo
            </button>
          </div>
        </div>

        {selected?.kind === "text" && (
          <div className="px-3.5 py-3 grid gap-3">
            <div className="flex items-center justify-between"><b className="text-[13px]">Text</b><button className="s-btn ghost sm" onClick={() => remove(selected.id)} aria-label="Delete layer"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <textarea className="s-input" rows={3} value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} aria-label="Text" />
            <div>
              <span className="s-label">Font</span>
              <select className="s-input" value={selected.font} onChange={(e) => update(selected.id, { font: e.target.value })}>
                {fonts.map((ff) => <option key={ff} value={ff}>{ff}{ff === kit.font ? " (brand)" : ""}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs" style={{ color: "var(--s-mute)" }}>Size<input className="s-input mt-1" type="number" min={10} max={400} value={selected.size} onChange={(e) => update(selected.id, { size: Number(e.target.value) || 10 })} /></label>
              <label className="text-xs" style={{ color: "var(--s-mute)" }}>Weight
                <select className="s-input mt-1" value={selected.weight} onChange={(e) => update(selected.id, { weight: Number(e.target.value) })}>
                  {[400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              <label className="text-xs" style={{ color: "var(--s-mute)" }}>Line height<input className="s-input mt-1" type="number" step={0.05} min={0.7} max={2} value={selected.lh} onChange={(e) => update(selected.id, { lh: Number(e.target.value) || 1 })} /></label>
              <label className="text-xs" style={{ color: "var(--s-mute)" }}>Width %<input className="s-input mt-1" type="number" min={10} max={100} value={Math.round(selected.w)} onChange={(e) => update(selected.id, { w: Number(e.target.value) || 50 })} /></label>
            </div>
            <div className="s-seg w-fit">
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return <button key={a} aria-pressed={selected.align === a} onClick={() => update(selected.id, { align: a })} aria-label={`Align ${a}`}><Icon className="h-3.5 w-3.5" /></button>;
              })}
            </div>
            <div><span className="s-label">Colour · brand and photo</span>{swatches((c) => update(selected.id, { color: c }), selected.color)}</div>
          </div>
        )}

        {selected?.kind === "logo" && (
          <div className="px-3.5 py-3 grid gap-3">
            <div className="flex items-center justify-between"><b className="text-[13px]">Logo</b><button className="s-btn ghost sm" onClick={() => remove(selected.id)} aria-label="Delete layer"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <label className="text-xs" style={{ color: "var(--s-mute)" }}>Size
              <input type="range" min={6} max={60} value={selected.w} onChange={(e) => update(selected.id, { w: Number(e.target.value) })} className="w-full" style={{ accentColor: "var(--s-accent)" }} />
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!selected.invert} onChange={(e) => update(selected.id, { invert: e.target.checked })} style={{ accentColor: "var(--s-accent)" }} /> White version
            </label>
            <div className="flex gap-1.5">
              <button className="s-btn sm" onClick={() => update(selected.id, { x: 100 - selected.w - 7, y: 88 })}>Bottom right</button>
              <button className="s-btn sm" onClick={() => update(selected.id, { x: 7, y: 88 })}>Bottom left</button>
              <button className="s-btn sm" onClick={() => update(selected.id, { x: 100 - selected.w - 7, y: 5 })}>Top right</button>
            </div>
          </div>
        )}

        {!selected && (
          <div className="px-3.5 py-3 grid gap-3">
            <b className="text-[13px]">Photo</b>
            <div><span className="s-label">Colours in this photo</span>
              {photoColors.length ? (
                <div className="flex flex-wrap gap-1.5">{photoColors.map((c) => (
                  <button key={c} title={`Copy ${c}`} className="h-7 w-7 rounded-md" style={{ background: c, border: "1px solid var(--s-line-2)" }}
                    onClick={() => { void navigator.clipboard?.writeText(c); toast.success(`${c} copied`); }} />
                ))}</div>
              ) : <p className="text-xs" style={{ color: "var(--s-mute)" }}>Reading colours…</p>}
              <p className="text-[11px] mt-1.5" style={{ color: "var(--s-mute)" }}>Pick a text layer to use these on your type.</p>
            </div>
            {kit.colors.length > 0 && <div><span className="s-label">Brand colours</span><div className="flex gap-1.5">{kit.colors.map((c) => <span key={c} title={c} className="h-7 w-7 rounded-md" style={{ background: c, border: "1px solid var(--s-line-2)" }} />)}</div></div>}
            <label className="text-xs" style={{ color: "var(--s-mute)" }}>Light {light}
              <input type="range" min={60} max={140} value={light} onChange={(e) => setLight(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--s-accent)" }} />
            </label>
            <label className="text-xs" style={{ color: "var(--s-mute)" }}>Contrast {contrast}
              <input type="range" min={60} max={140} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--s-accent)" }} />
            </label>
            <div>
              <span className="s-label">Shade for legible type</span>
              <div className="s-seg">{(["none", "top", "bottom"] as const).map((s) => <button key={s} aria-pressed={shade === s} onClick={() => setShade(s)}>{s === "none" ? "Off" : s === "top" ? "Top" : "Bottom"}</button>)}</div>
              {shade !== "none" && <input type="range" min={10} max={85} value={shadeAmt} onChange={(e) => setShadeAmt(Number(e.target.value))} className="w-full mt-2" style={{ accentColor: "var(--s-accent)" }} aria-label="Shade strength" />}
            </div>
            <div className="grid gap-1.5 pt-1">
              <span className="s-label">AI on this photo</span>
              {photo.contentId ? (
                <Link href={`/studio/image?mode=edit&content=${photo.contentId}`} className="s-btn ai justify-start"><Wand2 className="h-4 w-4" /> Edit colours and objects with AI</Link>
              ) : <p className="text-xs" style={{ color: "var(--s-mute)" }}>Save it to the Library first to edit it with AI.</p>}
              {photo.contentId && <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(photo.url)}`} className="s-btn justify-start"><Film className="h-4 w-4" /> Animate this photo</Link>}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
