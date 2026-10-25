"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Film, Loader2, Search, Trash2, Upload, Wand2, X, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { queueForEditor } from "@/components/studio/queue-clips";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content } from "@/types/database";
import { MediaCard, NOT_STORYBOARD_FRAME, PART_TYPES, VIDEO_TYPES, resolveMedia } from "@/components/studio/media";
import { LibraryViewer } from "@/components/studio/library/LibraryViewer";

type Kind = "all" | "videos" | "images" | "parts";
const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "videos", label: "Videos" },
  { id: "images", label: "Images" },
  { id: "parts", label: "Scenes & clips" },
];
const STATUSES = [
  { id: "", label: "Any status" },
  { id: "draft", label: "Drafts" },
  { id: "pending_approval", label: "Needs approval" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "posted", label: "Posted" },
];
const PAGE = 48;
// Made with BlinkSpot's AI, or brought in (uploads keep no model, or only the caption helper).
type Source = "" | "ai" | "uploaded";
const SOURCES: Array<{ id: Source; label: string }> = [{ id: "", label: "Any source" }, { id: "ai", label: "Made with AI" }, { id: "uploaded", label: "Uploaded" }];

/**
 * Library = the classic Content Grid + its "Story Sequences" tab + Upload, as one place.
 * Same queries and the same rules for what counts as a finished post; bigger media, quieter chrome.
 */
export default function LibraryPage() {
  const { clientId, loading: clientLoading } = useClient();
  const { activeBrand } = useBrandStore();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<Source>("");
  const [viewing, setViewing] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // One key per view (brand + filters). Results and the selection belong to a key, so switching
  // filters shows the skeleton and clears the selection without resetting state inside an effect.
  const key = `${activeBrand?.id ?? ""}|${kind}|${status}|${source}`;
  const [result, setResult] = useState<{ key: string; rows: Content[]; more: boolean; error: string | null } | null>(null);
  const [sel, setSel] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const selected = sel.key === key ? sel.ids : new Set<string>();
  const setSelected = (fn: (prev: Set<string>) => Set<string>) => setSel((cur) => ({ key, ids: fn(cur.key === key ? cur.ids : new Set()) }));

  const fetchPage = useCallback(async (offset: number) => {
    if (!activeBrand) return { rows: [] as Content[], more: false, error: null as string | null };
    let query = supabase
      .from("content")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (kind === "parts") {
      query = query.in("content_type", ["sequence_clip", "story_sequence", "storyboard", "story"]);
    } else {
      // Finished posts only: hide scene parts and the storyboard start/end frames (saved as post_image).
      query = query.not("content_type", "in", `(${PART_TYPES.join(",")})`).or(NOT_STORYBOARD_FRAME);
      if (kind === "videos") query = query.in("content_type", VIDEO_TYPES);
      if (kind === "images") query = query.not("content_type", "in", `(${VIDEO_TYPES.join(",")})`);
    }
    if (status) query = query.eq("status", status);
    if (source === "uploaded") query = query.or("ai_model.is.null,ai_model.eq.caption-ai");
    if (source === "ai") query = query.not("ai_model", "is", null).neq("ai_model", "caption-ai");
    const { data, error: err } = await query;
    // Never show a failed query as an empty library.
    if (err) return { rows: [] as Content[], more: false, error: err.message || "Could not load your library." };
    const page = (data ?? []) as unknown as Content[];
    return { rows: page, more: page.length === PAGE, error: null };
  }, [activeBrand, kind, status, source]);

  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!clientId || !activeBrand) return;
    let cancelled = false;
    fetchPage(0).then((r) => { if (!cancelled) setResult({ key, ...r }); });
    return () => { cancelled = true; };
  }, [clientId, activeBrand, fetchPage, key, reloads]);

  // Images still being made (2026-10-17): watch them here, so a picture that lands later (or is
  // rescued by a second image service) shows up without a reload. Polling also rescues stuck ones.
  const pendingIds = (result?.rows ?? []).filter((r) => r.generation_state === "generating" && !resolveMedia(r).url).map((r) => r.id).slice(0, 24).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const t = setInterval(() => {
      void fetch(`/api/images?ids=${pendingIds}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: { jobs?: Array<{ id: string; state: string; text: string | null; url: string | null }> } | null) => {
        const jobs = new Map((d?.jobs ?? []).map((j) => [j.id, j]));
        if (!jobs.size) return;
        setResult((cur) => cur && {
          ...cur,
          rows: cur.rows.map((row) => {
            const j = jobs.get(row.id);
            if (!j) return row;
            if (j.state === "done" && j.url) return { ...row, image_urls: [j.url], generation_state: "succeeded", generation_status_text: null } as Content;
            return { ...row, generation_state: j.state === "failed" ? "failed" : row.generation_state, generation_status_text: j.text } as Content;
          }),
        });
      }).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [pendingIds]);

  // A post stopped from its card (or anywhere else) leaves the grid at once.
  useEffect(() => {
    const onStopped = (e: Event) => {
      const gone = new Set((e as CustomEvent<string[]>).detail ?? []);
      setResult((cur) => cur && { ...cur, rows: cur.rows.filter((r) => !gone.has(r.id)) });
    };
    window.addEventListener("blink:stopped", onStopped);
    return () => window.removeEventListener("blink:stopped", onStopped);
  }, []);

  const current = result?.key === key ? result : null;
  const rows = useMemo(() => current?.rows ?? [], [current]);
  const more = current?.more ?? false;
  const error = current?.error ?? null;
  const loading = !current && (clientLoading || !!activeBrand);
  const reload = () => { setResult(null); setReloads((n) => n + 1); };
  async function loadMore() {
    setLoadingMore(true);
    const r = await fetchPage(rows.length);
    setLoadingMore(false);
    setResult((cur) => (cur && cur.key === key ? { key, rows: [...cur.rows, ...r.rows], more: r.more, error: r.error } : cur));
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => (r.caption || "").toLowerCase().includes(needle) || (r.hashtags || "").toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  const [stacking, setStacking] = useState(false);
  const selectedVideos = rows.filter((r) => selected.has(r.id) && resolveMedia(r).isVideo);
  async function editTogether() {
    setStacking(true);
    // Oldest first, so scenes keep their story order.
    const ordered = [...selectedVideos].sort((a, b) => a.created_at.localeCompare(b.created_at));
    await queueForEditor(ordered);
    setStacking(false);
    router.push("/studio/video?tab=editor");
  }

  async function remove(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    if (!confirm(ids.length === 1 ? "Delete this from your library?" : `Delete ${ids.length} items from your library?`)) return false;
    setDeleting(true);
    const { error: err } = await supabase.from("content").delete().in("id", ids);
    setDeleting(false);
    if (err) { toast.error(err.message); return false; }
    setResult((cur) => (cur ? { ...cur, rows: cur.rows.filter((r) => !ids.includes(r.id)) } : cur));
    setSelected(() => new Set());
    return true;
  }

  if (!activeBrand && !loading) {
    return (
      <div className="s-empty">
        <h3>Pick a brand first</h3>
        <p className="text-sm">Use the brand switcher at the top right, or create your first brand.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="s-seg" role="tablist" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k.id} role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
        {kind !== "parts" && (
          <select className="s-input" style={{ width: "auto", height: 34 }} value={source} onChange={(e) => setSource(e.target.value as Source)} aria-label="Source">
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        <select className="s-input" style={{ width: "auto", height: 34 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="relative" style={{ width: 220 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--s-mute)" }} />
          <input className="s-input" style={{ paddingLeft: 30, height: 34 }} placeholder="Search captions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <div className="flex-1" />
        {selecting ? (
          <>
            <span className="text-xs mono" style={{ color: "var(--s-soft)" }}>{selected.size} selected</span>
            <button className="s-btn sm" onClick={() => setSelected(() => (selected.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))))}>
              {selected.size === shown.length && shown.length > 0 ? "Clear" : "Select all"}
            </button>
            <button className="s-btn primary sm" disabled={!selectedVideos.length || stacking} onClick={editTogether} title="Open the selected clips in the editor, in order">
              {stacking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />} Edit together{selectedVideos.length ? ` (${selectedVideos.length})` : ""}
            </button>
            <button className="s-btn sm" style={{ color: "var(--s-danger)" }} disabled={selected.size === 0 || deleting} onClick={() => remove([...selected])}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
            <button className="s-btn ghost sm" onClick={() => { setSelecting(false); setSelected(() => new Set()); }}><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button className="s-btn ghost" onClick={() => setSelecting(true)}><CheckSquare className="h-4 w-4" /> Select</button>
        )}
        <Link href="/studio/library/upload" className="s-btn"><Upload className="h-4 w-4" /> Upload</Link>
        {kind === "parts" && !selecting && <button className="s-btn primary" onClick={() => setSelecting(true)}><Film className="h-4 w-4" /> Pick clips to edit together</button>}
      </div>

      {error && (
        <div className="s-card p-4 mb-4 flex items-center justify-between gap-3" role="alert">
          <span className="text-sm" style={{ color: "var(--s-danger)" }}>{error}</span>
          <button className="s-btn sm" onClick={reload}>Try again</button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="s-skel" style={{ aspectRatio: "4 / 3.6" }} />)}
        </div>
      ) : shown.length === 0 && !error ? (
        <div className="s-empty">
          <h3>{q ? "Nothing matches that search" : kind === "parts" ? "No scenes yet" : "Nothing here yet"}</h3>
          <p className="text-sm mb-4">Everything you make or upload for {activeBrand?.brand_name} lands here.</p>
          <div className="flex justify-center gap-2">
            <Link href="/studio" className="s-btn primary">Create something</Link>
            <Link href="/studio/library/upload" className="s-btn">Upload</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {shown.map((c) => {
              const media = resolveMedia(c);
              const image = !media.isVideo && media.url ? media.url : null;
              return (
                <div key={c.id} className="relative" onClickCapture={(e) => {
                  if (!selecting) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
                }}>
                  <MediaCard
                    content={c}
                    href={`/studio/library/${c.id}`}
                    onOpen={selecting ? undefined : () => setViewing(shown.indexOf(c))}
                    selected={selected.has(c.id)}
                    actions={!selecting && (
                      <>
                        {image && <Link href={`/studio/image?mode=design&content=${c.id}`} className="s-btn sm" title="Design with type and logo"><LayoutTemplate className="h-3.5 w-3.5" /></Link>}
                        {image && <Link href={`/studio/library/${c.id}/edit`} className="s-btn sm" title="Edit with AI"><Wand2 className="h-3.5 w-3.5" /></Link>}
                        {image && <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(image)}`} className="s-btn sm" title="Animate this image"><Film className="h-3.5 w-3.5" /></Link>}
                        <button className="s-btn sm" title="Delete" onClick={() => remove([c.id])}><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  />
                </div>
              );
            })}
          </div>
          {more && (
            <div className="flex justify-center mt-6">
              <button className="s-btn" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
              </button>
            </div>
          )}
        </>
      )}
      {viewing !== null && shown[viewing] && (
        <LibraryViewer
          items={shown} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)}
          onDelete={(id) => remove([id])} hasMore={more} onLoadMore={loadMore}
        />
      )}
    </div>
  );
}
