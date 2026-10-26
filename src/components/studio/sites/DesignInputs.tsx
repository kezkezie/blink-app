"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, ExternalLink, Globe, ImagePlus, Link2, Loader2, Palette, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { MAX_INSPIRATION } from "@/lib/sites/code";
import type { FilmInput } from "@/lib/sites/scroll-film";
import { MAX_SITES_YOU_LIKE, SITE_GALLERIES, cleanSiteAddress, type SiteRefs } from "@/lib/sites/site-refs";
import type { Content } from "@/types/database";
import { ImagePicker } from "../ImagePicker";
import { PART_TYPES, cleanCaption, resolveMedia, thumbUrl } from "../media";
import { filmFrameUrl, makeFilm, type FilmProgress } from "./film-frames";

/**
 * The website studio's extra inputs (Kezie, 2026-10-23; websites you like, 2026-10-27):
 * - Designs you like: "for people to put up a design that they really want, you know, from
 *   Pinterest". Uploads, Pinterest pins (imported to the owner's storage) or Library pictures;
 *   Claude follows them (app/api/sites/code).
 * - Scroll film: "we split the video into a sequence, and as we're scrolling... the video plays
 *   back", as on the Nuf Farms site. A Library video or an upload, cut into frames here.
 */

/** The sites the owner likes, as the studio shows them (lib/sites/site-refs.ts). */
export type SitesYouLike = Pick<SiteRefs, "sites" | "patterns">;

/**
 * Websites you like (Kezie, 2026-10-27: "let them go look for those particular type of websites
 * then pick the websites and give us as inspiration"): links to galleries to browse, then the
 * addresses they paste. Each change studies the whole list again (a few seconds, free); the pages
 * follow what was learned. Nothing is searched for them any more.
 */
export function SitesYouLikeBox({ brandId, refs, setRefs, setBusy }: { brandId: string; refs: SitesYouLike | null; setRefs: (r: SitesYouLike) => void; setBusy: (b: boolean) => void }) {
  const [link, setLink] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [showPatterns, setShowPatterns] = useState(false);
  const sites = refs?.sites ?? [];
  const room = MAX_SITES_YOU_LIKE - sites.length;

  async function study(next: string[], adding?: string) {
    setPending(adding ?? ""); setBusy(true);
    try {
      const r = await fetch("/api/sites/refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, sites: next }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.sites)) { toast.error(d.error || "Couldn't study those websites just now."); return false; }
      setRefs({ sites: d.sites, patterns: d.patterns ?? "" });
      if (Array.isArray(d.skipped) && d.skipped.length) toast(`Couldn't open ${d.skipped.join(", ")}, so it's left out. Some sites block visitors like us.`);
      return true;
    } catch { toast.error("Couldn't study those websites just now."); return false; }
    finally { setPending(null); setBusy(false); }
  }

  async function add() {
    const c = cleanSiteAddress(link);
    if ("error" in c) { toast.error(c.error); return; }
    if (sites.some((x) => x.host === c.host)) { toast("That website is already on your list."); setLink(""); return; }
    if (await study([...sites.map((x) => x.url), c.url], c.host)) setLink("");
  }

  return (
    <div className="rounded-xl p-3 grid gap-2.5" style={{ background: "var(--s-bg)" }} role="group" aria-label="Websites you like">
      <div className="flex items-start gap-2">
        <Globe className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--s-ai)" }} />
        <span className="text-[13px]"><b>Websites you like</b> <span style={{ color: "var(--s-mute)" }}>(optional, up to {MAX_SITES_YOU_LIKE})</span>
          <span className="block text-[12px]" style={{ color: "var(--s-mute)" }}>
            Find sites you love, then paste their address. The page follows how they&apos;re built (sections, type, light or dark), in your colours, words and pictures, never theirs.{" "}
            Browse: {SITE_GALLERIES.map((g, n) => <span key={g.url}>{n ? ", " : ""}<a href={g.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--s-soft)" }}>{g.name}</a></span>)}.
          </span></span>
      </div>
      {(sites.length > 0 || pending) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Your websites">
          {sites.map((x) => (
            <span key={x.url} className="s-chip inline-flex items-center gap-1" style={{ paddingRight: 4 }}>
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" title={`Open ${x.host}`}>{x.host}<ExternalLink className="h-3 w-3 opacity-60" /></a>
              <button type="button" aria-label={`Remove ${x.host}`} disabled={pending !== null} onClick={() => void study(sites.filter((y) => y.url !== x.url).map((y) => y.url))}
                className="grid place-items-center h-5 w-5 rounded-full" style={{ color: "var(--s-mute)" }}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {pending !== null && <span className="s-chip inline-flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3 w-3 animate-spin" /> {pending ? `Studying ${pending}…` : "Updating…"}</span>}
          {sites.length > 0 && pending === null && <button type="button" className="s-btn ghost sm" onClick={() => setShowPatterns(!showPatterns)} aria-expanded={showPatterns}>{showPatterns ? "Hide" : "What we learned"}</button>}
        </div>
      )}
      {showPatterns && refs?.patterns && <pre className="text-[12px] whitespace-pre-wrap leading-relaxed m-0" style={{ color: "var(--s-soft)", fontFamily: "inherit" }}>{refs.patterns}</pre>}
      {room > 0 && (
        <div className="flex items-center gap-1.5 max-w-[560px]">
          <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-mute)" }} />
          <input className="s-input min-w-0 flex-1" style={{ height: 34 }} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="Paste a website address, e.g. stripe.com" aria-label="Website address" disabled={!refs || pending !== null} />
          <button type="button" className="s-btn sm" disabled={!link.trim() || pending !== null || !refs} onClick={() => void add()}>Add</button>
        </div>
      )}
    </div>
  );
}

/** A picture no larger than 1600 px as a JPEG (Claude reads pictures up to 5 MB). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * s); c.height = Math.round(bitmap.height * s);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("picture"))), "image/jpeg", 0.85));
}

export function InspirationBox({ urls, setUrls, clientId }: { urls: string[]; setUrls: (next: string[]) => void; clientId: string | null }) {
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const room = MAX_INSPIRATION - urls.length;
  const add = (more: string[]) => setUrls([...new Set([...urls, ...more])].slice(0, MAX_INSPIRATION));

  async function upload(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, room);
    if (!list.length || !clientId) { if (files?.length) toast.error("Use JPG, PNG or WebP pictures."); return; }
    setAdding(true);
    try {
      const out: string[] = [];
      for (const [n, f] of list.entries()) {
        const path = `images/${clientId}/site_ref_${Date.now()}_${n}.jpg`;
        const { error } = await supabase.storage.from("assets").upload(path, await shrink(f), { contentType: "image/jpeg" });
        if (error) throw new Error("Couldn't upload that picture.");
        out.push(supabase.storage.from("assets").getPublicUrl(path).data.publicUrl);
      }
      add(out);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't upload that picture."); }
    finally { setAdding(false); }
  }

  async function importLink() {
    const url = link.trim();
    if (!url || room <= 0) return;
    setAdding(true);
    try {
      const res = await fetch("/api/inspo/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, web: true }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error || "Couldn't use that link.");
      add([d.url]); setLink("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't use that link."); }
    finally { setAdding(false); }
  }

  return (
    <div className="rounded-xl p-3 grid gap-2.5" style={{ background: "var(--s-bg)" }} role="group" aria-label="Designs you like">
      <div className="flex items-start gap-2">
        <Palette className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--s-ai)" }} />
        <span className="text-[13px]"><b>Designs you like</b> <span style={{ color: "var(--s-mute)" }}>(optional, up to {MAX_INSPIRATION})</span>
          <span className="block text-[12px]" style={{ color: "var(--s-mute)" }}>Screenshots, Pinterest pins or Library pictures. The page follows their layout and style, in your colours, words and pictures.</span></span>
      </div>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, n) => (
          <div key={u} className="relative h-[76px] w-[76px] rounded-lg overflow-hidden" style={{ border: "1px solid var(--s-line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(u, 240)} alt={`Design ${String.fromCharCode(65 + n)}`} className="h-full w-full object-cover" />
            <button type="button" aria-label={`Remove design ${String.fromCharCode(65 + n)}`} onClick={() => setUrls(urls.filter((x) => x !== u))}
              className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full" style={{ background: "rgba(12,13,15,.75)", color: "#fff" }}><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {room > 0 && (
          <button type="button" className="h-[76px] w-[76px] rounded-lg grid place-items-center text-[11.5px] gap-0.5" style={{ border: "1px dashed var(--s-line-2)", color: "var(--s-soft)" }} onClick={() => fileRef.current?.click()} disabled={adding || !clientId}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
        )}
      </div>
      {room > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
            <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-mute)" }} />
            <input className="s-input min-w-0 flex-1" style={{ height: 34 }} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void importLink(); }}
              placeholder="Paste a Pinterest pin or picture link" aria-label="Design link" />
            <button type="button" className="s-btn sm" disabled={adding || !link.trim()} onClick={() => void importLink()}>Add</button>
          </div>
          <button type="button" className="s-btn ghost sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking}><ImagePlus className="h-3.5 w-3.5" /> {picking ? "Hide my Library" : "From my Library"}</button>
        </div>
      )}
      {picking && room > 0 && <ImagePicker allowUpload={false} onPick={(p) => { add([p.url]); setPicking(false); }} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" aria-label="Design picture files" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function LibraryVideos({ brandId, onPick }: { brandId: string; onPick: (url: string) => void }) {
  const [items, setItems] = useState<Array<{ id: string; url: string; poster?: string; title: string }> | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.from("content").select("id, caption, image_urls, video_urls, reference_image_url, content_type, created_at")
      .eq("brand_id", brandId).not("content_type", "in", `(${PART_TYPES.join(",")})`).order("created_at", { ascending: false }).limit(80)
      .then(({ data }) => {
        if (!alive) return;
        setItems(((data ?? []) as unknown as Content[]).map((c) => ({ c, m: resolveMedia(c) })).filter((x) => x.m.url && x.m.isVideo).slice(0, 18)
          .map(({ c, m }) => ({ id: c.id, url: m.url!, poster: m.poster, title: cleanCaption(c.caption) || "Video" })));
      });
    return () => { alive = false; };
  }, [brandId]);
  if (items === null) return <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>{[0, 1, 2, 3].map((i) => <div key={i} className="s-skel" style={{ aspectRatio: "16 / 10" }} />)}</div>;
  if (!items.length) return <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>No videos in this brand&apos;s Library yet. Upload one instead.</p>;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }} role="list" aria-label="Library videos">
      {items.map((v) => (
        <button key={v.id} type="button" role="listitem" className="s-media text-left" title={v.title} aria-label={`Use video: ${v.title}`} onClick={() => onPick(v.url)}>
          <div className="m" style={{ aspectRatio: "16 / 10", background: "#111" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.poster ? <img src={v.poster} alt="" loading="lazy" decoding="async" /> : <video src={v.url} preload="metadata" muted playsInline />}
          </div>
        </button>
      ))}
    </div>
  );
}

export function FilmBox({ film, setFilm, clientId, brandId, busy, setBusy }: {
  film: FilmInput | null; setFilm: (f: FilmInput | null) => void; clientId: string | null; brandId: string; busy: boolean; setBusy: (b: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<FilmProgress | null>(null);
  const [at, setAt] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  async function make(src: string | File) {
    if (!clientId) return;
    setPicking(false); setBusy(true);
    const ac = new AbortController();
    stop.current = ac;
    try {
      const made = await makeFilm(src, clientId, setProgress, ac.signal);
      setFilm(made); setAt(0);
      toast.success(`Scroll film ready: ${made.count} frames.`);
    } catch (e) { if (!ac.signal.aborted) toast.error(e instanceof Error ? e.message : "Couldn't make the film."); }
    finally { setBusy(false); setProgress(null); stop.current = null; }
  }

  const pct = progress && progress.step === "cutting" ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <div className="rounded-xl p-3 grid gap-2.5" style={{ background: "var(--s-bg)" }} role="group" aria-label="Scroll film">
      <div className="flex items-start gap-2">
        <Clapperboard className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--s-ai)" }} />
        <span className="text-[13px] flex-1"><b>Scroll film</b> <span style={{ color: "var(--s-mute)" }}>(optional)</span>
          <span className="block text-[12px]" style={{ color: "var(--s-mute)" }}>A video that plays as visitors scroll, frame by frame, with your words over it. Best with 5 to 15 seconds of smooth camera movement. Free.</span></span>
        {film && !busy && <button type="button" className="s-btn ghost sm" onClick={() => setFilm(null)}><X className="h-3.5 w-3.5" /> Remove</button>}
      </div>

      {busy ? (
        <div className="grid gap-1.5" aria-live="polite">
          <div className="flex items-center gap-2 text-[12.5px]"><Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress?.step === "cutting" ? `Cutting and saving frames… ${progress.done} of ${progress.total}` : "Reading the video…"}
            <button type="button" className="s-btn ghost sm ml-auto" onClick={() => stop.current?.abort()}>Stop</button></div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s-line)" }}><div className="h-full" style={{ width: `${pct}%`, background: "var(--s-ai)", transition: "width .2s" }} /></div>
        </div>
      ) : film ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={filmFrameUrl(film, at)} alt="Scroll film frame" className="rounded-lg object-cover" style={{ width: 168, aspectRatio: String(film.ratio), maxHeight: 200, background: "#111" }} />
          <label className="grid gap-1 flex-1 min-w-[180px]">
            <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Try the scroll: {film.count} frames</span>
            <input type="range" min={0} max={film.phoneCount - 1} value={at} onChange={(e) => setAt(Number(e.target.value))} aria-label="Try the scroll film" />
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="s-btn sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking} disabled={!clientId}><Clapperboard className="h-3.5 w-3.5" /> {picking ? "Hide my videos" : "Pick a Library video"}</button>
          <button type="button" className="s-btn ghost sm" onClick={() => fileRef.current?.click()} disabled={!clientId}><Upload className="h-3.5 w-3.5" /> Upload a video</button>
        </div>
      )}
      {picking && !busy && !film && <LibraryVideos brandId={brandId} onPick={(u) => void make(u)} />}
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" aria-label="Scroll film video file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void make(f); e.target.value = ""; }} />
    </div>
  );
}
