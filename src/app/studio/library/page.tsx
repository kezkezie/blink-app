"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Film, Loader2, Search, Trash2, Upload, Wand2, X, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content } from "@/types/database";
import { MediaCard, NOT_STORYBOARD_FRAME, PART_TYPES, VIDEO_TYPES, resolveMedia } from "@/components/studio/media";

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

/**
 * Library = the classic Content Grid + its "Story Sequences" tab + Upload, as one place.
 * Same queries and the same rules for what counts as a finished post; bigger media, quieter chrome.
 */
export default function LibraryPage() {
  const { clientId, loading: clientLoading } = useClient();
  const { activeBrand } = useBrandStore();
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // One key per view (brand + filters). Results and the selection belong to a key, so switching
  // filters shows the skeleton and clears the selection without resetting state inside an effect.
  const key = `${activeBrand?.id ?? ""}|${kind}|${status}`;
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
    const { data, error: err } = await query;
    // Never show a failed query as an empty library.
    if (err) return { rows: [] as Content[], more: false, error: err.message || "Could not load your library." };
    const page = (data ?? []) as unknown as Content[];
    return { rows: page, more: page.length === PAGE, error: null };
  }, [activeBrand, kind, status]);

  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!clientId || !activeBrand) return;
    let cancelled = false;
    fetchPage(0).then((r) => { if (!cancelled) setResult({ key, ...r }); });
    return () => { cancelled = true; };
  }, [clientId, activeBrand, fetchPage, key, reloads]);

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

  async function remove(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(ids.length === 1 ? "Delete this from your library?" : `Delete ${ids.length} items from your library?`)) return;
    setDeleting(true);
    const { error: err } = await supabase.from("content").delete().in("id", ids);
    setDeleting(false);
    if (err) { toast.error(err.message); return; }
    setResult((cur) => (cur ? { ...cur, rows: cur.rows.filter((r) => !ids.includes(r.id)) } : cur));
    setSelected(() => new Set());
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
            <button className="s-btn sm" style={{ color: "var(--s-danger)" }} disabled={selected.size === 0 || deleting} onClick={() => remove([...selected])}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
            <button className="s-btn ghost sm" onClick={() => { setSelecting(false); setSelected(() => new Set()); }}><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button className="s-btn ghost" onClick={() => setSelecting(true)}><CheckSquare className="h-4 w-4" /> Select</button>
        )}
        <Link href="/studio/library/upload" className="s-btn"><Upload className="h-4 w-4" /> Upload</Link>
        {kind === "parts" && <Link href="/studio/video?tab=editor" className="s-btn primary"><Film className="h-4 w-4" /> Put clips together</Link>}
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
    </div>
  );
}
