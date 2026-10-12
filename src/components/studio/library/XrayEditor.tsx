"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, ImagePlus, Loader2, RotateCcw, ScanSearch, Type, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { thumbUrl } from "@/components/studio/media";
import type { SemanticObject, SemanticSchema } from "@/components/image/SemanticImageEditor";

/**
 * Edit with AI in the studio look (2026-10-11; classic at /dashboard/content/[id]/edit).
 * Step 1 scans the picture into a list of objects (1 credit). Step 2: change a colour, a material,
 * the words on a sign, or swap an object for one of your photos, then apply (18 credits, like other Nano Banana 2 edits; was 3 until 2026-10-12). Same
 * routes as the classic X-ray; the result lands on the post page, which waits for the new image.
 */
type Engine = "nano-banana-2" | "gpt-image-2-image-to-image";
const ENGINES: Array<{ id: Engine; label: string; line: string }> = [
  { id: "nano-banana-2", label: "Precise", line: "Changes only what you edited" },
  { id: "gpt-image-2-image-to-image", label: "Clean text", line: "Best for signs, labels, logos" },
];
const isText = (o: SemanticObject) => /text|logo|sign|label|typo|word/i.test(`${o.type} ${o.name}`) || !!o.text_content;

export function XrayEditor({ id }: { id: string }) {
  const router = useRouter();
  const { clientId } = useClient();
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [original, setOriginal] = useState<SemanticSchema | null>(null);
  const [schema, setSchema] = useState<SemanticSchema | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>("nano-banana-2");
  const [swaps, setSwaps] = useState<Record<string, { file: File; preview: string }>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!clientId) return;
    supabase.from("content").select("image_urls").eq("id", id).eq("client_id", clientId).maybeSingle().then(({ data }) => {
      let urls: unknown = data?.image_urls;
      if (typeof urls === "string") { try { urls = JSON.parse(urls); } catch { urls = [urls]; } }
      setImage(Array.isArray(urls) && typeof urls[0] === "string" ? (urls[0] as string) : null);
    });
  }, [id, clientId]);

  const changes = useMemo(() => {
    if (!schema || !original) return 0;
    let n = schema.lighting_and_weather !== original.lighting_and_weather ? 1 : 0;
    for (const o of schema.objects) {
      const was = original.objects.find((x) => x.id === o.id);
      if (!was || o.color !== was.color || o.material !== was.material || o.text_content !== was.text_content || o.font_style !== was.font_style) n++;
    }
    return n + Object.keys(swaps).length;
  }, [schema, original, swaps]);

  async function scan() {
    setScanning(true);
    try {
      const res = await fetch("/api/video/nano-banana", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scene_video_generator", video_mode: "xray_image", content_id: id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The scan didn't work.");
      if (!data.schema?.objects) throw new Error("The scan came back empty. Try again.");
      setSchema(data.schema); setOriginal(data.schema); setOpen(data.schema.objects[0]?.id ?? null);
      toast.success(`Found ${data.schema.objects.length} things you can change · 1 credit`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The scan didn't work."); }
    finally { setScanning(false); }
  }
  const setObj = (oid: string, field: keyof SemanticObject, value: string) => setSchema((s) => (s ? { ...s, objects: s.objects.map((o) => (o.id === oid ? { ...o, [field]: value } : o)) } : s));

  async function apply() {
    if (!schema || !clientId) return;
    try {
      setApplying("Uploading your photos…");
      const replacements: Record<string, string> = {};
      for (const [oid, s] of Object.entries(swaps)) {
        const ext = (s.file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `edits/${clientId}/${id}/replacement_${Date.now()}_${oid.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 64)}.${ext}`;
        const { error } = await supabase.storage.from("assets").upload(path, s.file);
        if (error) throw new Error("Couldn't upload a replacement photo.");
        replacements[oid] = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      }
      setApplying("Sending your changes…");
      const res = await fetch("/api/video/nano-banana", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scene_video_generator", video_mode: "json_image_edit", content_id: id, json_schema: schema, replacements, kie_model: engine }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The edit didn't start.");
      router.push(`/studio/library/${id}?processing=true`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The edit didn't start."); setApplying(null); }
  }

  if (image === undefined) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;
  if (!image) return <div className="s-empty"><h3>No picture to edit</h3><p className="text-[13px]">Edit with AI works on images. Open an image post from your Library.</p><Link href="/studio/library" className="s-btn sm mt-3">Library</Link></div>;

  return (
    <div className="grid gap-4 s-reading">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/studio/library/${id}`} className="s-btn ghost sm -ml-2"><ArrowLeft className="h-3.5 w-3.5" /> Back to the post</Link>
        <h2 className="text-[16px] font-semibold">Edit with AI</h2>
        <span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Change colours, materials or words without redoing the whole picture.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)] items-start">
        <div className="relative rounded-2xl overflow-hidden grid place-items-center" style={{ background: "#000", border: "1px solid var(--s-line)", minHeight: 360, maxHeight: "76dvh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(image, 1600)} alt="The picture you're editing" className="max-w-full object-contain" style={{ maxHeight: "76dvh" }} />
          {(scanning || applying) && (
            <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(12,13,15,.6)", backdropFilter: "blur(4px)" }}>
              <div className="grid justify-items-center gap-2 text-center"><Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--s-ai)" }} /><b className="text-[14px]">{scanning ? "Looking at every part of the picture…" : applying}</b></div>
            </div>
          )}
        </div>

        <aside className="s-card overflow-hidden flex flex-col" style={{ maxHeight: "calc(100dvh - 150px)" }}>
          {!schema ? (
            <div className="p-5 grid gap-3">
              <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "color-mix(in oklab, var(--s-ai) 14%, transparent)" }}><ScanSearch className="h-5 w-5" style={{ color: "var(--s-ai)" }} /></span>
              <b className="text-[15px]">Step 1 · Scan the picture</b>
              <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>The AI lists everything in it (the product, the background, any words) so you can change one thing and keep the rest.</p>
              <button className="s-btn ai justify-between" disabled={scanning} onClick={scan}><span className="flex items-center gap-2">{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Scan it</span><span className="cost">1 cr</span></button>
            </div>
          ) : (
            <>
              <div className="p-4 grid gap-2" style={{ borderBottom: "1px solid var(--s-line)" }}>
                <div className="flex items-center gap-2"><b className="text-[14px]">Step 2 · Change what you want</b><div className="flex-1" />{changes > 0 && <button className="s-btn ghost sm" onClick={() => { setSchema(original); setSwaps({}); }}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}</div>
                <p className="text-[12.5px] line-clamp-3" style={{ color: "var(--s-mute)" }}>{schema.scene_description}</p>
                <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Light and weather</span><input className="s-input" value={schema.lighting_and_weather} onChange={(e) => setSchema({ ...schema, lighting_and_weather: e.target.value })} aria-label="Light and weather" /></label>
              </div>
              <div className="flex-1 overflow-y-auto p-2 grid gap-1 content-start">
                {schema.objects.map((o) => {
                  const was = original?.objects.find((x) => x.id === o.id);
                  const edited = !!was && (o.color !== was.color || o.material !== was.material || o.text_content !== was.text_content || o.font_style !== was.font_style) || !!swaps[o.id];
                  const text = isText(o);
                  return (
                    <div key={o.id} className="rounded-xl" style={{ background: open === o.id ? "var(--s-bg)" : "transparent", border: `1px solid ${open === o.id ? "var(--s-line-2)" : "transparent"}` }}>
                      <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
                        <span className="h-4 w-4 rounded-full shrink-0" style={{ background: /^#[0-9a-f]{3,8}$/i.test(o.color) ? o.color : "var(--s-line-2)", border: "1px solid var(--s-line-2)" }} />
                        <span className="flex-1 min-w-0"><span className="text-[13px] font-medium block truncate">{o.name}</span><span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{text ? "Words" : o.type}</span></span>
                        {edited && <span className="s-badge ai">changed</span>}
                        <ChevronRight className="h-3.5 w-3.5 transition-transform" style={{ color: "var(--s-mute)", transform: open === o.id ? "rotate(90deg)" : "none" }} />
                      </button>
                      {open === o.id && (
                        <div className="px-2.5 pb-3 grid gap-2.5">
                          {text && (
                            <>
                              <label className="grid gap-1"><span className="s-label flex items-center gap-1" style={{ margin: 0 }}><Type className="h-3 w-3" /> The words</span><input className="s-input" value={o.text_content ?? ""} onChange={(e) => setObj(o.id, "text_content", e.target.value)} aria-label={`${o.name} words`} /></label>
                              <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Lettering</span><input className="s-input" value={o.font_style ?? ""} onChange={(e) => setObj(o.id, "font_style", e.target.value)} placeholder="e.g. bold rounded sans-serif" aria-label={`${o.name} lettering`} /></label>
                            </>
                          )}
                          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-end">
                            <input type="color" className="h-9 w-10 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--s-line-2)" }} value={/^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#888888"} onChange={(e) => setObj(o.id, "color", e.target.value.toUpperCase())} aria-label={`${o.name} colour picker`} />
                            <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Colour</span><input className="s-input" value={o.color} onChange={(e) => setObj(o.id, "color", e.target.value)} aria-label={`${o.name} colour`} /></label>
                          </div>
                          {!text && <label className="grid gap-1"><span className="s-label" style={{ margin: 0 }}>Material or finish</span><input className="s-input" value={o.material} onChange={(e) => setObj(o.id, "material", e.target.value)} placeholder="e.g. matte glass, brushed metal" aria-label={`${o.name} material`} /></label>}
                          <div className="flex items-center gap-2">
                            {swaps[o.id] ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={swaps[o.id].preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
                                <span className="text-[12px] flex-1" style={{ color: "var(--s-soft)" }}>Swapped for your photo</span>
                                <button className="s-btn ghost sm" onClick={() => setSwaps((x) => { const n = { ...x }; delete n[o.id]; return n; })} aria-label="Remove swap"><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <button className="s-btn sm" onClick={() => files.current[o.id]?.click()}><ImagePlus className="h-3.5 w-3.5" /> Swap for my photo</button>
                            )}
                            <input ref={(el) => { files.current[o.id] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSwaps((x) => ({ ...x, [o.id]: { file: f, preview: URL.createObjectURL(f) } })); e.target.value = ""; }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-3 grid gap-2" style={{ borderTop: "1px solid var(--s-line)" }}>
                <div className="s-seg" role="group" aria-label="How to render">{ENGINES.map((e) => <button key={e.id} aria-pressed={engine === e.id} onClick={() => setEngine(e.id)} title={e.line}>{e.label}</button>)}</div>
                <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{ENGINES.find((e) => e.id === engine)!.line}.</span>
                <button className="s-btn primary justify-between" disabled={!changes || !!applying} onClick={apply}>
                  <span className="flex items-center gap-2">{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {changes ? `Apply ${changes} change${changes === 1 ? "" : "s"}` : "Change something first"}</span><span className="cost">18 cr</span>
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
