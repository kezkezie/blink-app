"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Film, Loader2, Mic, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";

/**
 * Upload in the studio look (2026-10-11; classic at /dashboard/upload). Drop several photos or
 * videos at once; each becomes a Library draft, with captions written by AI if you want (1 credit
 * each, the same caption route as the post page). Lip-sync and "animate a photo" live in Video Studio.
 */
type Item = { file: File; preview: string; isVideo: boolean; state: "ready" | "uploading" | "writing" | "done" | "error"; id?: string; error?: string };
const MAX_MB = 50;

export default function UploadPage() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [items, setItems] = useState<Item[]>([]);
  const [context, setContext] = useState("");
  const [captions, setCaptions] = useState(true);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (!/^(image|video)\//.test(f.type)) { toast.error(`${f.name}: only photos and videos.`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name} is over ${MAX_MB} MB. Trim or compress it first.`); continue; }
      next.push({ file: f, preview: URL.createObjectURL(f), isVideo: f.type.startsWith("video/"), state: "ready" });
    }
    setItems((x) => [...x, ...next].slice(0, 20));
  }
  const patch = (i: number, p: Partial<Item>) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...p } : it)));

  async function run() {
    if (!clientId || !activeBrand) return;
    setRunning(true);
    const { data: brand } = await supabase.from("brand_profiles").select("brand_name, brand_voice, dos, donts, description, industry").eq("id", activeBrand.id).maybeSingle();
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.state === "done") continue;
      try {
        patch(i, { state: "uploading", error: undefined });
        const ext = (it.file.name.split(".").pop() || (it.isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        // Storage rules: uploads/<brand id>/... is this account's own folder.
        const path = `uploads/${activeBrand.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("assets").upload(path, it.file, { contentType: it.file.type });
        if (upErr) throw new Error(/exceeded|too large|413/i.test(upErr.message) ? `Too large to upload (max ${MAX_MB} MB).` : "Upload failed.");
        const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        let text: { caption_long?: string; caption_short?: string; hashtags?: string; call_to_action?: string } = {};
        if (captions) {
          patch(i, { state: "writing" });
          const res = await fetch("/api/content/analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, mediaUrl: url, mediaType: it.file.type, brandVoice: brand?.brand_voice, dos: brand?.dos, donts: brand?.donts, context, lengthPreference: "long",
              brandContext: brand ? { name: brand.brand_name, description: brand.description, industry: brand.industry, brandVoice: brand.brand_voice } : null }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) text = data; else toast.error(data.error || "Captions couldn't be written; saved without them.");
        }
        const { data: row, error } = await supabase.from("content").insert({
          client_id: clientId, brand_id: activeBrand.id, content_type: it.isVideo ? "video" : "post_image", status: "draft",
          ...(it.isVideo ? { video_urls: [url] } : { image_urls: [url] }),
          caption: text.caption_long || context.trim() || null, caption_short: text.caption_short || null, hashtags: text.hashtags || null, call_to_action: text.call_to_action || null,
          ai_model: captions && text.caption_long ? "caption-ai" : null,
          caption_written: Boolean(text.caption_long || context.trim()),
        }).select("id").single();
        if (error || !row) throw new Error("Couldn't save it to your Library.");
        patch(i, { state: "done", id: row.id as string });
        ok++;
      } catch (e) { patch(i, { state: "error", error: e instanceof Error ? e.message : "Failed." }); }
    }
    setRunning(false);
    if (ok) toast.success(`${ok} added to your Library as drafts.`);
  }

  if (!activeBrand) return <div className="s-empty"><h3>No brand open</h3><p className="text-[13px]">Pick a brand in the top bar; uploads go into its Library.</p></div>;
  const pending = items.filter((i) => i.state !== "done").length;
  const done = items.filter((i) => i.state === "done");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] s-reading items-start">
      <div className="grid gap-4">
        <div>
          <h2 className="text-[18px] font-semibold">Upload to {activeBrand.brand_name}</h2>
          <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>Your own photos and videos. Each one becomes a draft you can caption, schedule or edit.</p>
        </div>
        <button
          type="button"
          className="s-drop rounded-2xl grid place-items-center text-center px-6 py-12"
          style={over ? { borderColor: "var(--s-accent)", background: "color-mix(in oklab, var(--s-accent) 6%, transparent)" } : undefined}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        >
          <span className="h-12 w-12 rounded-full grid place-items-center mb-3" style={{ background: "var(--s-raised)" }}><Upload className="h-5 w-5" /></span>
          <b className="text-[15px]">Drop photos or videos here</b>
          <span className="text-[12.5px] mt-1" style={{ color: "var(--s-mute)" }}>or click to choose · up to 20 at a time · {MAX_MB} MB each</span>
        </button>
        <input ref={input} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

        {items.length > 0 && (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {items.map((it, i) => (
              <div key={it.preview} className="s-card overflow-hidden">
                <div className="relative bg-black" style={{ aspectRatio: "1 / 1" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.isVideo ? <video src={it.preview} muted playsInline className="h-full w-full object-cover" /> : <img src={it.preview} alt="" className="h-full w-full object-cover" />}
                  {it.isVideo && <span className="s-badge absolute left-2 top-2" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>VIDEO</span>}
                  {(it.state === "uploading" || it.state === "writing") && <div className="absolute inset-0 grid place-items-center text-[12px] gap-1" style={{ background: "rgba(0,0,0,.55)" }}><Loader2 className="h-5 w-5 animate-spin" /><span>{it.state === "uploading" ? "Uploading" : "Writing caption"}</span></div>}
                  {it.state === "done" && <span className="absolute right-2 top-2 h-6 w-6 rounded-full grid place-items-center" style={{ background: "var(--s-ok)" }}><Check className="h-3.5 w-3.5" style={{ color: "#06210f" }} /></span>}
                  {it.state === "ready" && !running && <button className="absolute right-2 top-2 s-btn sm" style={{ width: 26, padding: 0, background: "rgba(0,0,0,.6)" }} onClick={() => setItems((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="px-2.5 py-2 text-[11.5px] truncate" style={{ color: it.state === "error" ? "var(--s-danger)" : "var(--s-mute)" }}>
                  {it.state === "done" && it.id ? <Link href={`/studio/library/${it.id}`} className="underline" style={{ color: "var(--s-text)" }}>Open</Link> : it.error ?? it.file.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="s-card p-4 grid gap-4 lg:sticky lg:top-20">
        <label className="grid gap-1.5">
          <span className="s-label" style={{ margin: 0 }}>What is it? (optional)</span>
          <textarea className="s-input" rows={3} value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Our new mango juice, launching Friday" aria-label="Context" />
          <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Helps the captions; the AI also looks at each photo.</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={captions} onChange={(e) => setCaptions(e.target.checked)} style={{ accentColor: "var(--s-accent)" }} />
          <span className="grid gap-0.5"><span className="text-[13px] flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} /> Write captions with AI</span><span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Long and short caption plus hashtags, in your brand&apos;s voice · 1 credit each</span></span>
        </label>
        <button className="s-btn primary justify-between" disabled={!pending || running || !clientId} onClick={run}>
          <span className="flex items-center gap-2">{running || (pending > 0 && !clientId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {pending && !clientId ? "Loading your account" : pending ? `Add ${pending} to Library` : "Add to Library"}</span>
          <span className="cost">{captions && pending ? `${pending} cr` : "free"}</span>
        </button>
        {done.length > 0 && !running && <Link href="/studio/library" className="s-btn">See them in the Library</Link>}
        <div className="grid gap-2 pt-3" style={{ borderTop: "1px solid var(--s-line)" }}>
          <span className="s-label" style={{ margin: 0 }}>More you can do</span>
          <Link href="/studio/video?mode=lipsync" className="s-btn ghost justify-start"><Mic className="h-4 w-4" /> Make a photo talk (Lip-sync)</Link>
          <Link href="/studio/video?mode=showcase" className="s-btn ghost justify-start"><Film className="h-4 w-4" /> Animate a photo</Link>
        </div>
      </aside>
    </div>
  );
}
