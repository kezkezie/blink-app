"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, ImagePlus, Loader2, Package, RefreshCw, RotateCcw, ScanSearch, Trash2, Type, Undo2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { thumbUrl } from "@/components/studio/media";
import { Modal } from "@/components/studio/Modal";
import { ImagePicker } from "@/components/studio/ImagePicker";
import { useBrandKit } from "@/components/studio/generate-image";
import { EDIT_CREDITS, MAX_SWAPS, SCAN_CREDITS, changeCount, normalizeChanges, type EditEngine, type EditKind, type Scan, type ScanObject } from "@/lib/ai-edit";
import { DetailSkeleton } from "@/components/studio/Skeletons";

/**
 * Edit with AI in the studio look (rebuilt 2026-10-15; the classic X-ray page stays at
 * /dashboard/content/[id]/edit). Scan once (kept on the post, free to reopen), tap a thing in the
 * picture or the list, change its words, colour or material, swap it for a Library picture, a
 * product or a photo, remove it, or describe the change. The result is a new Library post that
 * starts pre-scanned, so editing it again costs only the edit. Unsent changes survive leaving.
 */
const ENGINES: Array<{ id: EditEngine; label: string; line: string }> = [
  { id: "nano-banana-2", label: "Precise", line: "Changes only what you edited" },
  { id: "gpt-image-2-image-to-image", label: "Clean text", line: "Best for signs, labels and logos" },
];
const GROUPS: Array<{ kind: EditKind; label: string }> = [
  { kind: "words", label: "Words" }, { kind: "thing", label: "Things" }, { kind: "person", label: "People" }, { kind: "background", label: "Background" },
];
const MATERIALS: Record<EditKind, string[]> = {
  words: [],
  thing: ["Matte", "Glossy", "Brushed metal", "Frosted glass", "Warm wood", "Marble"],
  person: ["Casual clothes", "Smart clothes", "Branded T-shirt"],
  background: ["Plain studio", "Soft gradient", "Marble", "Outdoor daylight", "Dark and moody"],
};
const HEX = /^#[0-9a-f]{6}$/i;

type Edit = { color?: string; material?: string; text?: string; font?: string; remove?: boolean; note?: string };
type Swap = { kind: "content" | "product"; id: string; preview: string } | { kind: "upload"; url: string; preview: string };
type Draft = { source: string; edits: Record<string, Edit>; swaps: Record<string, Swap>; light: string; instruction: string; engine: EditEngine };
type Product = { id: string; name: string; image_url: string };

const draftKey = (id: string) => `blink.aiEdit.v1.${id}`;
function readDraft(id: string, source: string): Draft | null {
  try { const d = JSON.parse(localStorage.getItem(draftKey(id)) || "null") as Draft | null; return d && d.source === source ? d : null; } catch { return null; }
}
function writeDraft(id: string, d: Draft | null) {
  try { if (d) localStorage.setItem(draftKey(id), JSON.stringify(d)); else localStorage.removeItem(draftKey(id)); } catch { /* private window */ }
}

/**
 * `onBack` / `onContinue`: embedded in Image Studio's Edit with AI tab (2026-10-15: that tab still
 * showed the classic "JSON Object Control" editor, so Kezie saw no change). Standalone otherwise.
 */
export function XrayEditor({ id, onBack, onContinue }: { id: string; onBack?: () => void; onContinue?: (contentId: string, url: string) => void }) {
  const router = useRouter();
  const { clientId } = useClient();
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [brandId, setBrandId] = useState<string | null>(null);
  const kit = useBrandKit(brandId);
  const [scan, setScan] = useState<Scan | null | undefined>(undefined);
  const [scanFrom, setScanFrom] = useState<"scan" | "edit">("scan");
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [swaps, setSwaps] = useState<Record<string, Swap>>({});
  const [light, setLight] = useState("");
  const [instruction, setInstruction] = useState("");
  const [engine, setEngine] = useState<EditEngine>("nano-banana-2");
  const [picking, setPicking] = useState<{ objectId: string; tab: "library" | "products" } | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ contentId: string; url: string } | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const restored = useRef(false);

  // The post's picture, then its kept scan (free) and any unsent changes.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    supabase.from("content").select("image_urls, brand_id").eq("id", id).maybeSingle().then(async ({ data }) => {
      if (cancelled) return;
      let urls: unknown = data?.image_urls;
      if (typeof urls === "string") { try { urls = JSON.parse(urls); } catch { urls = [urls]; } }
      const src = Array.isArray(urls) && typeof urls[0] === "string" ? (urls[0] as string) : null;
      setImage(src);
      setBrandId((data?.brand_id as string | null) ?? null);
      if (!src) return;
      const res = await fetch(`/api/ai-edit/scan?content=${id}`).catch(() => null);
      const kept = res?.ok ? await res.json().catch(() => null) : null;
      if (cancelled) return;
      setScan(kept?.scan ?? null);
      setScanFrom(kept?.from === "edit" ? "edit" : "scan");
      const draft = readDraft(id, src);
      if (draft && kept?.scan) {
        setEdits(draft.edits ?? {}); setSwaps(draft.swaps ?? {}); setLight(draft.light ?? ""); setInstruction(draft.instruction ?? ""); setEngine(draft.engine ?? "nano-banana-2");
        if (Object.keys(draft.edits ?? {}).length || Object.keys(draft.swaps ?? {}).length) toast.message("Your unsent changes to this picture are back. Reset clears them.");
      }
      restored.current = true;
    });
    return () => { cancelled = true; };
  }, [id, clientId]);

  // Keep unsent changes, so leaving the page doesn't lose them.
  useEffect(() => {
    if (!restored.current || !image || !scan) return;
    const empty = !Object.keys(edits).length && !Object.keys(swaps).length && !light && !instruction;
    writeDraft(id, empty ? null : { source: image, edits, swaps, light, instruction, engine });
  }, [id, image, scan, edits, swaps, light, instruction, engine]);

  useEffect(() => {
    if (!applying) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(t); setElapsed(0); };
  }, [applying]);

  useEffect(() => {
    if (!picking || picking.tab !== "products" || products || !brandId) return;
    supabase.from("products").select("id, name, image_url").eq("brand_id", brandId).not("image_url", "is", null).order("created_at", { ascending: false }).limit(40)
      .then(({ data }) => setProducts(((data ?? []) as Product[]).filter((p) => !!p.image_url)));
  }, [picking, products, brandId]);

  const payload = useMemo(() => ({ objects: Object.entries(edits).map(([oid, e]) => ({ id: oid, ...e })), light: light || undefined, instruction: instruction || undefined }), [edits, light, instruction]);
  const normalized = useMemo(() => (scan ? normalizeChanges(scan, payload, Object.keys(swaps)) : null), [scan, payload, swaps]);
  const count = normalized ? changeCount(normalized) : 0;
  const changed = useMemo(() => new Set(normalized?.objects.map((c) => c.id) ?? []), [normalized]);
  const wordsChanged = !!normalized?.objects.some((c) => c.text !== undefined || c.font);
  const palette = useMemo(() => [...new Set([kit?.primaryColor, kit?.secondaryColor, "#FFFFFF", "#111111"].filter((c): c is string => !!c && HEX.test(c)).map((c) => c.toUpperCase()))], [kit]);

  async function runScan(refresh = false) {
    setScanning(true);
    try {
      const res = await fetch("/api/ai-edit/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId: id, refresh }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The scan didn't work.");
      setScan(data.scan); setScanFrom(data.from === "edit" ? "edit" : "scan");
      if (refresh) { setEdits({}); setSwaps({}); }
      setOpen(data.scan.objects[0]?.id ?? null);
      toast.success(data.cached ? "Your saved scan is back · free" : `Found ${data.scan.objects.length} things you can change · ${data.credits} credits, kept for next time`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The scan didn't work."); }
    finally { setScanning(false); }
  }

  const setEdit = (oid: string, patch: Partial<Edit>) => setEdits((x) => {
    const next = { ...(x[oid] ?? {}), ...patch };
    // Empty words stay empty while typing (and mean "take the words out"); other empty fields go.
    for (const k of Object.keys(next) as Array<keyof Edit>) if (next[k] === undefined || next[k] === false || (next[k] === "" && k !== "text" && k !== "font")) delete next[k];
    const all = { ...x, [oid]: next };
    if (!Object.keys(next).length) delete all[oid];
    return all;
  });
  const clearObject = (oid: string) => { setEdits((x) => { const n = { ...x }; delete n[oid]; return n; }); setSwaps((x) => { const n = { ...x }; delete n[oid]; return n; }); };

  async function pickSwap(objectId: string, p: { url: string; contentId: string | null; title: string } | { product: Product }) {
    setPicking(null);
    if (Object.keys(swaps).length >= MAX_SWAPS && !swaps[objectId]) { toast.error(`Swap up to ${MAX_SWAPS} things at a time.`); return; }
    if ("product" in p) { setSwaps((x) => ({ ...x, [objectId]: { kind: "product", id: p.product.id, preview: p.product.image_url } })); return; }
    if (p.contentId) { setSwaps((x) => ({ ...x, [objectId]: { kind: "content", id: p.contentId!, preview: p.url } })); return; }
    // From this device: upload now, so the swap survives leaving the page.
    if (!clientId) return;
    try {
      const blob = await (await fetch(p.url)).blob();
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) { toast.error("Use a JPG, PNG or WebP picture."); return; }
      const ext = blob.type.split("/")[1].replace("jpeg", "jpg");
      const path = `edits/${clientId}/${id}/replacement_${Date.now()}_${objectId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32)}.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: blob.type });
      if (error) throw error;
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      setSwaps((x) => ({ ...x, [objectId]: { kind: "upload", url, preview: url } }));
    } catch { toast.error("Couldn't upload that photo."); }
  }

  async function apply() {
    if (!scan || !count) return;
    setApplying(true); setResult(null);
    try {
      const body = {
        contentId: id, engine, changes: payload,
        swaps: Object.fromEntries(Object.entries(swaps).map(([oid, s]) => [oid, s.kind === "upload" ? { upload: s.url } : s.kind === "product" ? { productId: s.id } : { contentId: s.id }])),
      };
      const res = await fetch("/api/ai-edit/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setScan(null); throw new Error(data.error || "Scan the picture first."); }
      if (!res.ok) throw new Error(data.error || (res.status === 504 ? "The edit took longer than the connection allowed. It may still land in your Library in a minute." : "The edit didn't work."));
      // Show it once it has loaded (the old picture stays on screen until the new one decodes).
      await new Promise<void>((resolve) => { const im = new Image(); im.onload = () => resolve(); im.onerror = () => resolve(); im.src = thumbUrl(data.url, 1600); setTimeout(resolve, 15_000); });
      setResult({ contentId: data.contentId, url: data.url }); setShowBefore(false);
      writeDraft(id, null);
      toast.success("Edit ready · saved as a new post, your original is untouched");
    } catch (e) { toast.error(e instanceof Error ? e.message : "The edit didn't work."); }
    finally { setApplying(false); }
  }

  if (image === undefined) return <DetailSkeleton />;
  if (!image) return <div className="s-empty"><h3>No picture to edit</h3><p className="text-[13px]">Edit with AI works on images. Open an image post from your Library.</p><Link href="/studio/library" className="s-btn sm mt-3">Library</Link></div>;

  const shown = result && !showBefore ? result.url : image;
  const spots = !result && scan ? scan.objects.filter((o) => o.box && o.kind !== "background" && o.box[2] * o.box[3] < 640_000) : [];

  return (
    <div className="grid gap-4 mx-auto w-full max-w-[1600px]">
      <div className="flex flex-wrap items-center gap-2">
        {onBack
          ? <button className="s-btn ghost sm -ml-2" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> Pick another</button>
          : <Link href={`/studio/library/${id}`} className="s-btn ghost sm -ml-2"><ArrowLeft className="h-3.5 w-3.5" /> Back to the post</Link>}
        <h2 className="text-[16px] font-semibold">Edit with AI</h2>
        <span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Change one thing, keep the rest. Your original is never overwritten.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:grid-cols-[minmax(0,1fr)_460px] items-start">
        <div className="grid gap-2 min-w-0">
          {/* The frame hugs the picture (no wide black bars around a portrait shot), and the image
              gets the extra width on bigger screens. The hotspots sit on the image's own box. */}
          <div className="relative grid place-items-center min-w-0" style={{ minHeight: 360 }}>
            <div className="relative inline-block max-w-full rounded-2xl overflow-hidden" style={{ border: "1px solid var(--s-line)", background: "#0b0c0e" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(shown, 1600)} alt={result && !showBefore ? "Your edited picture" : "The picture you're editing"} className="block max-w-full object-contain" style={{ maxHeight: "82dvh" }} />
              {spots.map((o) => {
                const [x, y, w, h] = o.box!;
                const on = open === o.id || hover === o.id;
                return (
                  <button
                    key={o.id} type="button" aria-label={`Edit ${o.name}`} title={o.name}
                    onClick={() => setOpen(o.id)} onMouseEnter={() => setHover(o.id)} onMouseLeave={() => setHover(null)}
                    className="absolute rounded-md transition-[box-shadow,background] duration-150"
                    style={{ left: `${x / 10}%`, top: `${y / 10}%`, width: `${w / 10}%`, height: `${h / 10}%`, boxShadow: on ? "0 0 0 2px var(--s-ai), 0 0 0 9999px rgba(0,0,0,.25)" : changed.has(o.id) ? "0 0 0 1.5px var(--s-ai)" : "none", background: on ? "color-mix(in oklab, var(--s-ai) 10%, transparent)" : "transparent", zIndex: on ? 2 : 1 }}
                  />
                );
              })}
            </div>
            {(scanning || applying) && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(12,13,15,.62)", backdropFilter: "blur(4px)", zIndex: 5 }}>
                <div className="grid justify-items-center gap-2 text-center px-6">
                  <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--s-ai)" }} />
                  <b className="text-[14px]">{scanning ? "Looking at every part of the picture…" : `Making your edit… ${elapsed > 0 ? `${elapsed} s` : ""}`}</b>
                  {applying && <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Usually 30 to 60 seconds. You can leave: it lands in your Library as a new post.</span>}
                </div>
              </div>
            )}
          </div>
          {result ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="s-seg" role="group" aria-label="Compare"><button aria-pressed={!showBefore} onClick={() => setShowBefore(false)}>After</button><button aria-pressed={showBefore} onClick={() => setShowBefore(true)}>Before</button></div>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Saved as a new post. The original is untouched.</span>
            </div>
          ) : scan && <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Tap anything in the picture, or pick it from the list.</span>}
        </div>

        <aside className="s-card overflow-hidden flex flex-col min-w-0 lg:sticky lg:top-4" style={{ maxHeight: "calc(100dvh - 120px)" }}>
          {result ? (
            <div className="p-5 grid gap-3">
              <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "color-mix(in oklab, var(--s-ai) 14%, transparent)" }}><Check className="h-5 w-5" style={{ color: "var(--s-ai)" }} /></span>
              <b className="text-[15px]">Your edit is ready</b>
              <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>It&apos;s a new post in your Library, already scanned, so you can keep editing it without paying for another scan.</p>
              <button className="s-btn ai justify-between" onClick={() => (onContinue ? onContinue(result.contentId, result.url) : router.push(`/studio/library/${result.contentId}/edit`))}><span className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Keep editing this one</span><ChevronRight className="h-4 w-4" /></button>
              <Link href={`/studio/library/${result.contentId}`} className="s-btn justify-between"><span>Open the new post</span><ChevronRight className="h-4 w-4" /></Link>
              <button className="s-btn ghost justify-start" onClick={() => setResult(null)}><Undo2 className="h-4 w-4" /> Back to the original and try again</button>
            </div>
          ) : scan === undefined ? (
            <div className="p-5 grid gap-2"><div className="s-skel h-5 w-40" /><div className="s-skel h-24" /></div>
          ) : !scan ? (
            <div className="p-5 grid gap-3">
              <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "color-mix(in oklab, var(--s-ai) 14%, transparent)" }}><ScanSearch className="h-5 w-5" style={{ color: "var(--s-ai)" }} /></span>
              <b className="text-[15px]">Step 1 · Scan the picture</b>
              <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>The AI finds everything in it (the product, the words, the people, the background) so you can change one thing and keep the rest.</p>
              <button className="s-btn ai justify-between" disabled={scanning} onClick={() => runScan(false)}><span className="flex items-center gap-2">{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Scan it</span><span className="cost">{SCAN_CREDITS} cr</span></button>
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Saved on the post: you only pay once per picture, even if you leave and come back.</span>
            </div>
          ) : (
            <>
              <div className="p-4 grid gap-1.5" style={{ borderBottom: "1px solid var(--s-line)" }}>
                <div className="flex items-center gap-2">
                  <b className="text-[14px]">Change what you want</b>
                  <span className="s-badge" title={scanFrom === "edit" ? "This picture came from an edit, so it was scanned for free" : "Kept on the post, free to reopen"}>{scanFrom === "edit" ? "From your edit" : "Saved scan"}</span>
                  <div className="flex-1" />
                  {count > 0 && <button className="s-btn ghost sm" onClick={() => { setEdits({}); setSwaps({}); setLight(""); setInstruction(""); }}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
                </div>
                {scan.scene && <p className="text-[12.5px] line-clamp-2" style={{ color: "var(--s-mute)" }}>{scan.scene}</p>}
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 grid gap-2 content-start min-w-0">
                {GROUPS.map((g) => {
                  const items = scan.objects.filter((o) => o.kind === g.kind);
                  if (!items.length) return null;
                  return (
                    <div key={g.kind} className="grid gap-1">
                      <span className="s-label px-2 pt-1" style={{ margin: 0 }}>{g.label}</span>
                      {items.map((o) => (
                        <ObjectRow
                          key={o.id} o={o} isOpen={open === o.id} edited={changed.has(o.id)} edit={edits[o.id] ?? {}} swap={swaps[o.id]} palette={palette}
                          onToggle={() => setOpen(open === o.id ? null : o.id)} onHover={(on) => setHover(on ? o.id : null)}
                          onEdit={(p) => setEdit(o.id, p)} onClear={() => clearObject(o.id)}
                          onPick={(tab) => setPicking({ objectId: o.id, tab })}
                          onUnswap={() => setSwaps((x) => { const n = { ...x }; delete n[o.id]; return n; })}
                        />
                      ))}
                    </div>
                  );
                })}
                <div className="grid gap-2 px-2 pt-2 pb-1" style={{ borderTop: "1px solid var(--s-line)" }}>
                  <span className="s-label" style={{ margin: 0 }}>The whole picture</span>
                  <label className="grid gap-1"><span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Light{scan.light ? ` (now: ${scan.light})` : ""}</span><input className="s-input" value={light} onChange={(e) => setLight(e.target.value)} placeholder="e.g. golden hour, soft studio light" aria-label="Light" /></label>
                  <label className="grid gap-1"><span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Anything else?</span><textarea className="s-input" rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. make it feel like evening, add a little steam to the cup" aria-label="Anything else" /></label>
                  <button className="s-btn ghost sm justify-start" disabled={scanning} onClick={() => runScan(true)} title="Scan again from scratch"><RefreshCw className="h-3.5 w-3.5" /> Scan again <span className="cost">{SCAN_CREDITS} cr</span></button>
                </div>
              </div>

              <div className="p-3 grid gap-2" style={{ borderTop: "1px solid var(--s-line)" }}>
                <div className="s-seg" role="group" aria-label="How to render">{ENGINES.map((e) => <button key={e.id} aria-pressed={engine === e.id} onClick={() => setEngine(e.id)} title={e.line}>{e.label}</button>)}</div>
                {wordsChanged && engine === "nano-banana-2" ? (
                  <button className="text-[11.5px] text-left underline" style={{ color: "var(--s-ai)" }} onClick={() => setEngine("gpt-image-2-image-to-image")}>Changing words? Switch to Clean text, best for signs, labels and logos.</button>
                ) : (
                  <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{ENGINES.find((e) => e.id === engine)!.line}.</span>
                )}
                <button className="s-btn primary justify-between" disabled={!count || applying} onClick={apply}>
                  <span className="flex items-center gap-2">{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {count ? `Apply ${count} change${count === 1 ? "" : "s"}` : "Change something first"}</span><span className="cost">{EDIT_CREDITS} cr</span>
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      <Modal open={!!picking} onClose={() => setPicking(null)} label="Pick a replacement" width={860} padded>
        {picking && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <b className="text-sm">Replace {scan?.objects.find((o) => o.id === picking.objectId)?.name ?? "it"} with…</b>
              <div className="s-seg ml-2" role="group" aria-label="Where from"><button aria-pressed={picking.tab === "library"} onClick={() => setPicking({ ...picking, tab: "library" })}>Library</button><button aria-pressed={picking.tab === "products"} onClick={() => setPicking({ ...picking, tab: "products" })}>Products</button></div>
              <div className="flex-1" />
              <button className="s-btn ghost sm" onClick={() => setPicking(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            {picking.tab === "library" ? (
              <ImagePicker onPick={(p) => pickSwap(picking.objectId, p)} />
            ) : products === null ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="s-skel aspect-square" />)}</div>
            ) : products.length ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                {products.map((p) => (
                  <button key={p.id} className="s-media" title={p.name} onClick={() => pickSwap(picking.objectId, { product: p })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="m" style={{ aspectRatio: "1 / 1" }}><img src={thumbUrl(p.image_url, 320)} alt={p.name} loading="lazy" /></div>
                    <span className="text-[11.5px] block truncate px-1 pt-1">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--s-mute)" }}>No product photos for this brand yet. Add them on the Brand page, or pick from the Library.</p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function ObjectRow({ o, isOpen, edited, edit, swap, palette, onToggle, onHover, onEdit, onClear, onPick, onUnswap }: {
  o: ScanObject; isOpen: boolean; edited: boolean; edit: Edit; swap?: Swap; palette: string[];
  onToggle: () => void; onHover: (on: boolean) => void; onEdit: (p: Partial<Edit>) => void; onClear: () => void;
  onPick: (tab: "library" | "products") => void; onUnswap: () => void;
}) {
  const words = o.kind === "words" || !!o.text;
  const color = edit.color ?? o.color;
  const sub = edit.remove ? "Will be removed" : swap ? "Swapped" : edit.text === "" ? "Words taken out" : words && o.text ? `“${edit.text ?? o.text}”` : edit.material ?? o.material;
  return (
    <div className="rounded-xl" style={{ background: isOpen ? "var(--s-bg)" : "transparent", border: `1px solid ${isOpen ? "var(--s-line-2)" : "transparent"}` }} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left" onClick={onToggle} aria-expanded={isOpen}>
        {swap
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={thumbUrl(swap.preview, 64)} alt="" className="h-5 w-5 rounded-md object-cover shrink-0" />
          : <span className="h-4 w-4 rounded-full shrink-0" style={{ background: HEX.test(color) ? color : "var(--s-line-2)", border: "1px solid var(--s-line-2)" }} />}
        <span className="flex-1 min-w-0"><span className="text-[13px] font-medium block truncate" style={edit.remove ? { textDecoration: "line-through", color: "var(--s-mute)" } : undefined}>{o.name}</span><span className="text-[11px] block truncate" style={{ color: "var(--s-mute)" }}>{sub}</span></span>
        {edited && <span className="s-badge ai">changed</span>}
        <ChevronRight className="h-3.5 w-3.5 transition-transform shrink-0" style={{ color: "var(--s-mute)", transform: isOpen ? "rotate(90deg)" : "none" }} />
      </button>
      {isOpen && (
        <div className="px-2.5 pb-3 grid gap-2.5">
          {edit.remove ? (
            <div className="flex items-center gap-2"><span className="text-[12.5px] flex-1" style={{ color: "var(--s-soft)" }}>This will be taken out and the space filled in naturally.</span><button className="s-btn sm" onClick={() => onEdit({ remove: undefined })}><Undo2 className="h-3.5 w-3.5" /> Keep it</button></div>
          ) : (
            <>
              {words && (
                <>
                  <label className="grid gap-1"><span className="s-label flex items-center gap-1" style={{ margin: 0 }}><Type className="h-3 w-3" /> The words</span><textarea className="s-input" rows={2} value={edit.text ?? o.text ?? ""} onChange={(e) => onEdit({ text: e.target.value === (o.text ?? "") ? undefined : e.target.value })} aria-label={`${o.name} words`} /></label>
                  <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Lettering</span><input className="s-input" value={edit.font ?? o.font ?? ""} onChange={(e) => onEdit({ font: e.target.value === (o.font ?? "") ? undefined : e.target.value })} placeholder="e.g. bold rounded sans-serif" aria-label={`${o.name} lettering`} /></label>
                </>
              )}
              <div className="grid gap-1">
                <span className="s-label" style={{ margin: 0 }}>Colour</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {palette.map((c) => (
                    <button key={c} className="h-7 w-7 rounded-full grid place-items-center" style={{ background: c, border: `2px solid ${color.toUpperCase() === c ? "var(--s-ai)" : "var(--s-line-2)"}` }} onClick={() => onEdit({ color: c === o.color ? undefined : c })} aria-label={`Use ${c}`} title={c}>
                      {color.toUpperCase() === c && <Check className="h-3.5 w-3.5" style={{ color: c === "#FFFFFF" ? "#111" : "#fff" }} />}
                    </button>
                  ))}
                  <input type="color" className="h-7 w-9 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} value={HEX.test(color) ? color : "#888888"} onChange={(e) => onEdit({ color: e.target.value.toUpperCase() === o.color ? undefined : e.target.value.toUpperCase() })} aria-label={`${o.name} colour picker`} />
                  <span className="text-[11.5px] font-mono" style={{ color: "var(--s-mute)" }}>{HEX.test(color) ? color.toUpperCase() : ""}</span>
                </div>
              </div>
              {!words && (
                <div className="grid gap-1">
                  <span className="s-label" style={{ margin: 0 }}>{o.kind === "background" ? "Make the background" : o.kind === "person" ? "Clothing" : "Material or finish"}</span>
                  <div className="flex flex-wrap gap-1">{MATERIALS[o.kind].map((m) => <button key={m} className="s-chip" aria-pressed={edit.material === m} onClick={() => onEdit({ material: edit.material === m ? undefined : m })}>{m}</button>)}</div>
                  <input className="s-input" value={edit.material ?? ""} onChange={(e) => onEdit({ material: e.target.value })} placeholder={o.material ? `Now: ${o.material}` : "Describe it"} aria-label={`${o.name} material`} />
                </div>
              )}
              <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Anything else about it?</span><input className="s-input" value={edit.note ?? ""} onChange={(e) => onEdit({ note: e.target.value })} placeholder={words ? "e.g. make it bigger, move it to the top" : "e.g. make it bigger, turn it to face us"} aria-label={`${o.name} note`} /></label>
              {o.kind !== "background" && (
                <div className="flex flex-wrap items-center gap-2">
                  {swap ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbUrl(swap.preview, 120)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      <span className="text-[12px] flex-1" style={{ color: "var(--s-soft)" }}>Swapped for this picture</span>
                      <button className="s-btn ghost sm" onClick={onUnswap} aria-label="Remove swap"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button className="s-btn sm" onClick={() => onPick("library")}><ImagePlus className="h-3.5 w-3.5" /> Replace with…</button>
                      <button className="s-btn ghost sm" onClick={() => onPick("products")}><Package className="h-3.5 w-3.5" /> A product</button>
                    </>
                  )}
                  <div className="flex-1" />
                  <button className="s-btn ghost sm" onClick={() => onEdit({ remove: true })} title="Take it out of the picture"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                </div>
              )}
              {edited && <button className="s-btn ghost sm justify-start" onClick={onClear}><RotateCcw className="h-3.5 w-3.5" /> Undo changes to this</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
