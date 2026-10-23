"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Code2, Copy, Download, ExternalLink, Eye, Globe, LayoutList, Laptop, Loader2, Maximize2, RefreshCw, Search, Smartphone, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore } from "@/app/store/useBrandStore";
import { MAX_LOOKS, SITE_CHANGE_CREDITS, SITE_LOOKS, SITE_PAGE_CREDITS, cleanSlug, downloadName, type SiteLook } from "@/lib/sites/code";
import type { FilmInput } from "@/lib/sites/scroll-film";
import { useKept } from "@/lib/drafts";
import { useClient } from "@/hooks/useClient";
import { Modal } from "../Modal";
import { FilmBox, InspirationBox } from "./DesignInputs";
import { SiteFullscreen, SitePreview, SiteThumb } from "./SitePreview";
import { SectionsEditor } from "./SectionsEditor";
import { track } from "@/lib/analytics";

const CodeEditor = dynamic(() => import("./CodeEditor").then((m) => m.CodeEditor), {
  ssr: false, loading: () => <div className="s-skel h-full" />,
});

/**
 * Website studio (Kezie, 2026-10-16): AI-written one-file websites with their code on the side.
 * Pick up to three looks and Claude writes a page for each, live (the code streams in); every page
 * is a card like the Library. Open one to read or edit its code, ask for changes (each makes a new
 * version), switch versions, download the .html, or publish it at blinkspot.io/w/<address>.
 */

type Page = { id: string; brand_id: string; name: string; html: string; brief: string | null; notes: string | null; parent_id: string | null; slug: string | null; published_at: string | null; created_at: string; updated_at: string };
/** What a page is written from besides the brief: designs the owner likes and a scroll film (2026-10-23). */
type Extras = { inspiration: string[]; film: FilmInput | null };
type Job = { key: string; look: SiteLook; code: string; error?: string; text: string; extras: Extras };
type Refs = { sites: Array<{ url: string; name: string; why: string; host: string }>; patterns: string; at: string };
type View = { kind: "gallery" } | { kind: "page"; id: string } | { kind: "job"; key: string };

const lookLabel = (v: string | null) => SITE_LOOKS.find((l) => l.id === v)?.label ?? "Page";
const kb = (s: string) => `${Math.max(1, Math.round(new Blob([s]).size / 1000))} KB`;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Versions of a page: every page with the same first version, oldest first. */
function families(pages: Page[]) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const rootOf = (p: Page) => { let at = p; const seen = new Set<string>(); while (at.parent_id && byId.has(at.parent_id) && !seen.has(at.id)) { seen.add(at.id); at = byId.get(at.parent_id)!; } return at.id; };
  const groups = new Map<string, Page[]>();
  for (const p of pages) { const r = rootOf(p); groups.set(r, [...(groups.get(r) ?? []), p]); }
  return [...groups.values()].map((list) => list.sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

export function CodeStudio({ initialBrief, initialLooks, autoStart, wantFilm }: { initialBrief?: string; initialLooks?: string; autoStart?: boolean; wantFilm?: boolean } = {}) {
  const { activeBrand } = useBrandStore();
  const brandId = activeBrand?.id;
  const { clientId } = useClient();
  // Kept on this device per brand: the pictures and frames are in the owner's storage.
  const [inspiration, setInspiration] = useKept<string[]>(brandId ? `sites:${brandId}:inspiration` : null, []);
  const [film, setFilm] = useKept<FilmInput | null>(brandId ? `sites:${brandId}:film` : null, null);
  const [filmBusy, setFilmBusy] = useState(false);
  const filmRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [view, setView] = useState<View>({ kind: "gallery" });
  // From Ask BlinkSpot (2026-10-17): the brief and looks come in the link, and "start now" writes at once.
  const [looks, setLooks] = useState<SiteLook[]>(() => {
    const asked = (initialLooks ?? "").split(",").filter((l): l is SiteLook => SITE_LOOKS.some((x) => x.id === l)).slice(0, MAX_LOOKS);
    return asked.length ? asked : ["cinematic", "editorial"];
  });
  const [brief, setBrief] = useState(initialBrief?.slice(0, 1500) ?? "");
  const autoStarted = useRef(false);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [studying, setStudying] = useState(false);
  const [studyFirst, setStudyFirst] = useState(true);
  const [showPatterns, setShowPatterns] = useState(false);
  const [fullPage, setFullPage] = useState<{ html: string; title: string } | null>(null);
  const codes = useRef(new Map<string, string>());
  const flushAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    void fetch(`/api/sites/pages?brandId=${brandId}`).then((r) => r.json()).then((d) => { if (alive) setPages(Array.isArray(d.pages) ? d.pages : []); }).catch(() => { if (alive) setPages([]); });
    void fetch("/api/sites/refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, cachedOnly: true }) })
      .then((r) => r.json()).then((d) => { if (alive && Array.isArray(d.sites)) setRefs(d); }).catch(() => {});
    return () => { alive = false; };
  }, [brandId]);

  const study = useCallback(async (refresh = false) => {
    if (!brandId) return null;
    setStudying(true);
    try {
      const r = await fetch("/api/sites/refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, refresh }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.sites)) { toast.error(d.error || "Couldn't study sites just now."); return null; }
      setRefs(d); return d as Refs;
    } finally { setStudying(false); }
  }, [brandId]);

  // Streamed code arrives token by token; the screen catches up a few times a second.
  const flush = () => {
    if (flushAt.current) return;
    flushAt.current = setTimeout(() => {
      flushAt.current = null;
      setJobs((list) => list.map((j) => (codes.current.has(j.key) ? { ...j, code: codes.current.get(j.key)! } : j)));
    }, 200);
  };

  const runJob = useCallback(async (key: string, look: SiteLook, text: string, extras: Extras) => {
    if (!brandId) return;
    codes.current.set(key, "");
    const fail = (error: string) => setJobs((list) => list.map((j) => (j.key === key ? { ...j, error } : j)));
    try {
      track("site_page_started", { look, designs: extras.inspiration.length, film: !!extras.film });
      const res = await fetch("/api/sites/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, look, brief: text, inspiration: extras.inspiration, film: extras.film }) });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); fail(d.error || "Couldn't write the page."); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, cut); buf = buf.slice(cut + 1);
          if (!line.trim()) continue;
          let e: { t: string; d?: string; page?: Page; error?: string };
          try { e = JSON.parse(line); } catch { continue; }
          if (e.t === "code" && e.d) { codes.current.set(key, (codes.current.get(key) ?? "") + e.d); flush(); }
          else if (e.t === "done" && e.page) {
            const page = e.page;
            setPages((list) => [page, ...(list ?? [])]);
            setJobs((list) => list.filter((j) => j.key !== key));
            setView((v) => (v.kind === "job" && v.key === key ? { kind: "page", id: page.id } : v));
            codes.current.delete(key);
            toast.success(`${lookLabel(look)} page ready.`);
          } else if (e.t === "error") fail(e.error || "The page didn't come back whole.");
        }
      }
    } catch { fail("The connection dropped. If the page finished, it's in your pages after a refresh."); }
    finally { window.dispatchEvent(new Event("blink:credits")); }
  }, [brandId]);

  async function write() {
    if (!brandId || !looks.length || filmBusy) return;
    if (!refs && studyFirst) await study();
    const text = brief.trim();
    const extras: Extras = { inspiration, film };
    const started: Job[] = looks.map((look) => ({ key: `${look}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, look, code: "", text, extras }));
    setJobs((list) => [...started, ...list]);
    started.forEach((j) => void runJob(j.key, j.look, text, extras));
  }

  // From Ask BlinkSpot with a scroll film: the video has to be picked here first, so no auto start without one.
  useEffect(() => {
    if (!autoStart || autoStarted.current || !brandId || pages === null) return;
    const t = setTimeout(() => {
      autoStarted.current = true;
      router.replace("/studio/sites", { scroll: false });
      if (wantFilm && !film) { filmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); toast("Pick the video for the scroll film, then press Write."); return; }
      void write();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, brandId, pages]);

  useEffect(() => {
    if (!wantFilm || autoStart) return;
    const t = setTimeout(() => filmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return () => clearTimeout(t);
  }, [wantFilm, autoStart]);

  const groups = useMemo(() => families(pages ?? []).sort((a, b) => b[b.length - 1].created_at.localeCompare(a[a.length - 1].created_at)), [pages]);

  if (!activeBrand) return <div className="s-card p-10 text-center max-w-[560px] mx-auto mt-10"><b>Pick a brand first</b><p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>Use the brand menu at the top.</p></div>;

  if (view.kind === "job") {
    const job = jobs.find((j) => j.key === view.key);
    if (job) return <JobView job={job} onBack={() => setView({ kind: "gallery" })} onRetry={() => { setJobs((l) => l.map((j) => (j.key === job.key ? { ...j, code: "", error: undefined } : j))); void runJob(job.key, job.look, job.text, job.extras); }} />;
  }
  if (view.kind === "page" && pages) {
    const family = groups.find((g) => g.some((p) => p.id === view.id));
    const page = family?.find((p) => p.id === view.id);
    if (family && page) {
      return (
        <PageWorkspace
          key={page.id} page={page} family={family}
          onBack={() => setView({ kind: "gallery" })}
          onOpen={(id) => setView({ kind: "page", id })}
          onSaved={(next) => setPages((list) => (list ?? []).map((p) => (p.id === next.id ? { ...p, ...next } : p)))}
          onVersion={(next) => { setPages((list) => [next, ...(list ?? [])]); setView({ kind: "page", id: next.id }); }}
          onPublished={(id, slug) => setPages((list) => (list ?? []).map((p) => (p.id === id ? { ...p, slug, published_at: slug ? new Date().toISOString() : null } : slug && p.slug === slug ? { ...p, slug: null, published_at: null } : p)))}
          onDeleted={(id) => { setPages((list) => (list ?? []).filter((p) => p.id !== id)); const rest = family.filter((p) => p.id !== id); setView(rest.length ? { kind: "page", id: rest[rest.length - 1].id } : { kind: "gallery" }); }}
        />
      );
    }
  }

  const n = looks.length;
  return (
    <div className="max-w-[1180px] mx-auto pt-2 md:pt-6 pb-10">
      {fullPage && <SiteFullscreen html={fullPage.html} title={fullPage.title} onClose={() => setFullPage(null)} />}
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Website · for {activeBrand.brand_name}</p>
      <h2 className="text-[26px] md:text-[34px] font-semibold tracking-tight leading-tight">Websites you can edit by sections or as code</h2>
      <p className="text-[14.5px] mt-2 max-w-[680px]" style={{ color: "var(--s-soft)" }}>Pick the looks you want and BlinkSpot writes a complete page for each, from your Brand page, products and Library pictures. Edit it by sections (click any words or picture) or as code, ask for changes, download the .html or publish it.</p>

      <div className="s-card p-4 mt-6 grid gap-4">
        <label className="grid gap-1.5">
          <span className="s-label !mb-0">What the site is for (optional)</span>
          <textarea className="s-input s-grow" rows={5} style={{ ["--min-lines" as string]: 3, ["--max-lines" as string]: 10 }} value={brief} onChange={(e) => setBrief(e.target.value.slice(0, 1500))}
            placeholder="e.g. a launch page for our new weekend menu: big food photos, a WhatsApp order button, our opening story" aria-label="What the site is for" />
        </label>
        <div>
          <span className="s-label">Looks (one page each, up to {MAX_LOOKS})</span>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {SITE_LOOKS.map((l) => {
              const on = looks.includes(l.id);
              return (
                <button key={l.id} type="button" aria-pressed={on} className="rounded-xl p-3 text-left" style={{ background: on ? "color-mix(in oklab, var(--s-accent) 10%, var(--s-bg))" : "var(--s-bg)", border: `1px solid ${on ? "var(--s-accent)" : "var(--s-line)"}` }}
                  onClick={() => setLooks((cur) => (on ? cur.filter((x) => x !== l.id) : cur.length >= MAX_LOOKS ? [...cur.slice(1), l.id] : [...cur, l.id]))}>
                  <b className="text-[13px] block">{l.label}</b><span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{l.line}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          <InspirationBox urls={inspiration} setUrls={setInspiration} clientId={clientId} />
          <div ref={filmRef} className="rounded-xl" style={wantFilm && !film ? { outline: "2px solid var(--s-ai)", outlineOffset: 2 } : undefined}>
            <FilmBox film={film} setFilm={setFilm} clientId={clientId} brandId={activeBrand.id} busy={filmBusy} setBusy={setFilmBusy} />
          </div>
        </div>
        <ResearchStrip refs={refs} studying={studying} studyFirst={studyFirst} setStudyFirst={setStudyFirst} showPatterns={showPatterns} setShowPatterns={setShowPatterns} onStudy={() => void study(!!refs)} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="s-btn primary" disabled={!n || studying || filmBusy} onClick={() => void write()}>
            {studying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {studying ? "Studying sites like yours…" : `Write ${n === 1 ? "the page" : `${n} pages`}`} <span className="cost">{n * SITE_PAGE_CREDITS} cr</span>
          </button>
          <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{filmBusy ? "Waiting for the film's frames…" : `About 1 to 3 minutes. Watch the code come in on each card.${inspiration.length || film ? ` Using ${[inspiration.length ? `${inspiration.length} design${inspiration.length === 1 ? "" : "s"} you like` : "", film ? "your scroll film" : ""].filter(Boolean).join(" and ")}.` : ""}`}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-8 mb-3">
        <b className="text-[15px]">Your pages</b>
        {pages && <span className="s-badge">{groups.length}</span>}
      </div>
      {!pages ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your pages">{[0, 1, 2].map((i) => <div key={i} className="s-skel" style={{ aspectRatio: "16 / 12" }} />)}</div>
      ) : !jobs.length && !groups.length ? (
        <div className="s-empty"><h3>No pages yet</h3><p className="text-sm">Pick a look or two above and press Write.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <button key={j.key} type="button" className="s-card overflow-hidden text-left" onClick={() => setView({ kind: "job", key: j.key })} aria-label={`${lookLabel(j.look)} page, ${j.error ? "failed" : "writing"}`}>
              <CodeTail code={j.code} error={j.error} />
              <div className="p-3 flex items-center gap-2">
                <div className="min-w-0 flex-1"><b className="text-[13.5px] block truncate">{lookLabel(j.look)} page</b>
                  <span className="text-[12px]" style={{ color: j.error ? "var(--s-danger)" : "var(--s-mute)" }}>{j.error ? "Didn't finish. Open to try again." : j.code ? `Writing… ${kb(j.code)}` : "Starting…"}</span></div>
                {!j.error && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--s-ai)" }} />}
              </div>
            </button>
          ))}
          {groups.map((family) => {
            const head = family[family.length - 1];
            const live = family.find((p) => p.slug && p.published_at);
            return (
              <div key={family[0].id} className="relative">
                <button type="button" className="s-card overflow-hidden text-left w-full" onClick={() => setView({ kind: "page", id: head.id })} title={head.name}>
                  <SiteThumb html={head.html} title={head.name} />
                  <div className="p-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--s-line)" }}>
                    <div className="min-w-0 flex-1"><b className="text-[13.5px] block truncate">{head.name}</b>
                      <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{lookLabel(head.notes)}{family.length > 1 ? ` · v${family.length}` : ""} · {when(head.created_at)}</span></div>
                    {live && <span className="s-badge ok">Live</span>}
                  </div>
                </button>
                <button type="button" aria-label={`${head.name}, full screen`} title="Full screen" onClick={() => setFullPage({ html: head.html, title: head.name })}
                  className="absolute top-2 right-2 grid place-items-center h-8 w-8 rounded-lg" style={{ background: "rgba(12,13,15,.72)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}><Maximize2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResearchStrip({ refs, studying, studyFirst, setStudyFirst, showPatterns, setShowPatterns, onStudy }: {
  refs: Refs | null; studying: boolean; studyFirst: boolean; setStudyFirst: (v: boolean) => void; showPatterns: boolean; setShowPatterns: (v: boolean) => void; onStudy: () => void;
}) {
  if (!refs) {
    return (
      <label className="flex items-start gap-2 text-[13px] cursor-pointer rounded-xl p-3" style={{ background: "var(--s-bg)" }}>
        <input type="checkbox" className="mt-0.5" checked={studyFirst} onChange={(e) => setStudyFirst(e.target.checked)} />
        <span><b>Study well-designed sites like yours first</b><span className="block text-[12px]" style={{ color: "var(--s-mute)" }}>BlinkSpot finds strong websites in your category and follows their structure (never their words or pictures). Free, about a minute, kept for 30 days.</span></span>
      </label>
    );
  }
  return (
    <div className="rounded-xl p-3 grid gap-2" style={{ background: "var(--s-bg)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Search className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} />
        <span className="text-[12.5px] font-medium mr-1">Following {refs.sites.length} sites like yours:</span>
        {refs.sites.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="s-chip" title={s.why}>{s.host}</a>)}
        <button type="button" className="s-btn ghost sm" onClick={() => setShowPatterns(!showPatterns)} aria-expanded={showPatterns}>{showPatterns ? "Hide" : "What we learned"}</button>
        <button type="button" className="s-btn ghost sm" onClick={onStudy} disabled={studying}>{studying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Study again</button>
      </div>
      {showPatterns && <pre className="text-[12px] whitespace-pre-wrap leading-relaxed m-0" style={{ color: "var(--s-soft)", fontFamily: "inherit" }}>{refs.patterns}</pre>}
    </div>
  );
}

/** A card while its page is being written: the last lines of code, as they arrive. */
function CodeTail({ code, error }: { code: string; error?: string }) {
  const lines = code.split("\n").slice(-16).join("\n");
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 10", background: "#1e2127" }}>
      {!code && !error && <div className="s-skel absolute inset-0" style={{ borderRadius: 0, opacity: 0.25 }} />}
      <pre className="absolute inset-x-0 bottom-0 m-0 p-3 text-[10.5px] leading-[1.5] whitespace-pre-wrap break-all" style={{ color: error ? "#e06c75" : "#abb2bf", fontFamily: "ui-monospace, Menlo, monospace" }}>{error || lines}</pre>
      <div className="absolute inset-x-0 top-0 h-16" style={{ background: "linear-gradient(#1e2127, transparent)" }} />
    </div>
  );
}

function JobView({ job, onBack, onRetry }: { job: Job; onBack: () => void; onRetry: () => void }) {
  const [tab, setTab] = useState<"preview" | "code">("code");
  const [full, setFull] = useState(false);
  // The half-written page, redrawn every few seconds (browsers draw unfinished HTML fine).
  const [partial, setPartial] = useState(job.code);
  const latest = useRef(job.code);
  useEffect(() => { latest.current = job.code; }, [job.code]);
  useEffect(() => { const t = setInterval(() => setPartial(latest.current), 3500); return () => clearInterval(t); }, []);
  return (
    <div className="grid gap-3" style={{ height: "calc(100dvh - 160px)", minHeight: 520, gridTemplateRows: "auto minmax(0,1fr)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="s-btn ghost sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> All pages</button>
        <b className="text-[14px]">{lookLabel(job.look)} page</b>
        {job.error ? <span className="text-[12.5px]" style={{ color: "var(--s-danger)" }}>{job.error}</span> : <span className="text-[12.5px] inline-flex items-center gap-1.5" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing… {kb(job.code)}</span>}
        {job.error && <button className="s-btn primary sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Try again <span className="cost">{SITE_PAGE_CREDITS} cr</span></button>}
        <div className="flex-1" />
        <PaneTabs tab={tab} setTab={setTab} />
        <button className="s-btn ghost sm" onClick={() => setFull(true)} disabled={!partial}><Maximize2 className="h-3.5 w-3.5" /> Full screen</button>
      </div>
      {full && <SiteFullscreen html={partial} title={`${lookLabel(job.look)} page (still writing)`} onClose={() => setFull(false)} />}
      <div className="grid gap-3 min-h-0 lg:grid-cols-2">
        <div className={`min-h-0 ${tab === "code" ? "" : "hidden lg:block"}`}><CodeEditor value={job.code} readOnly follow label="Code being written" /></div>
        <div className={`min-h-0 rounded-2xl p-2 ${tab === "preview" ? "" : "hidden lg:block"}`} style={{ background: "var(--s-raised)" }}>{partial ? <SitePreview html={partial} title="Page so far" /> : <div className="s-skel h-full" />}</div>
      </div>
    </div>
  );
}

function PaneTabs({ tab, setTab }: { tab: "preview" | "code"; setTab: (t: "preview" | "code") => void }) {
  return (
    <div className="s-seg lg:hidden" role="tablist" aria-label="Show">
      <button role="tab" aria-selected={tab === "preview"} aria-label="Show preview" onClick={() => setTab("preview")}><Eye className="h-3.5 w-3.5" /> Preview</button>
      <button role="tab" aria-selected={tab === "code"} aria-label="Show code" onClick={() => setTab("code")}><Code2 className="h-3.5 w-3.5" /> Code</button>
    </div>
  );
}

function PageWorkspace({ page, family, onBack, onOpen, onSaved, onVersion, onPublished, onDeleted }: {
  page: Page; family: Page[]; onBack: () => void; onOpen: (id: string) => void; onSaved: (p: Page) => void; onVersion: (p: Page) => void;
  onPublished: (id: string, slug: string | null) => void; onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState(page.html);
  const [shown, setShown] = useState(page.html);
  const [name, setName] = useState(page.name);
  const [saving, setSaving] = useState<"idle" | "unsaved" | "saving" | "saved">("idle");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  // Sections for everyone, Code for those who want it: the same page either way (2026-10-17).
  const [editMode, setEditMode] = useState<"sections" | "code">(() => { try { return localStorage.getItem("blink.siteEditMode") === "code" ? "code" : "sections"; } catch { return "sections"; } });
  const pickMode = (m: "sections" | "code") => { setEditMode(m); try { localStorage.setItem("blink.siteEditMode", m); } catch { /* private mode */ } };
  const [instruction, setInstruction] = useState("");
  const [changing, setChanging] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [full, setFull] = useState(false);
  const live = family.find((p) => p.slug && p.published_at);
  const [slug, setSlug] = useState(live?.slug ?? cleanSlug(page.name).slice(0, 40));
  const pending = useRef<string | null>(null);
  const version = family.findIndex((p) => p.id === page.id) + 1;

  const save = useCallback(async () => {
    const html = pending.current;
    if (html === null) return true;
    pending.current = null;
    setSaving("saving");
    const r = await fetch("/api/sites/pages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: page.id, html }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || "Couldn't save."); setSaving("unsaved"); return false; }
    onSaved(d.page); setSaving("saved"); return true;
  }, [page.id, onSaved]);

  // The preview follows the code a moment after typing stops; the code saves a little later.
  useEffect(() => {
    if (draft === page.html && pending.current === null) return;
    const a = setTimeout(() => setShown(draft), 600);
    const b = setTimeout(() => void save(), 1500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [draft, page.html, save]);

  const edit = (v: string) => { pending.current = v; setSaving("unsaved"); setDraft(v); };

  async function change(given?: string) {
    const text = (given ?? instruction).trim();
    if (!text) return;
    setChanging(true);
    try {
      if (!(await save())) return;
      const r = await fetch("/api/sites/code/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: page.id, instruction: text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.page) { toast.error(d.error || "Couldn't make that change."); return; }
      if (given === undefined) setInstruction("");
      toast.success(`Changed. This is v${family.length + 1}; v${version} is still there.`);
      onVersion(d.page);
    } finally { setChanging(false); window.dispatchEvent(new Event("blink:credits")); }
  }

  async function publish() {
    if (!(await save())) return;
    const r = await fetch("/api/sites/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", id: page.id, slug }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || "Couldn't publish."); return; }
    onPublished(page.id, d.slug);
    const url = `${window.location.origin}/w/${d.slug}`;
    void navigator.clipboard?.writeText(url).catch(() => {});
    toast.success(`Live at ${url.replace(/^https?:\/\//, "")} (link copied).`);
    setPublishing(false);
  }

  async function unpublish(id: string) {
    const r = await fetch("/api/sites/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unpublish", id }) });
    if (!r.ok) { toast.error("Couldn't take it offline."); return; }
    onPublished(id, null); toast.success("Taken offline."); setPublishing(false);
  }

  async function remove() {
    const r = await fetch("/api/sites/pages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: page.id }) });
    if (!r.ok) { toast.error("Couldn't delete it."); return; }
    toast.success(`v${version} deleted.`); onDeleted(page.id);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([draft], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url; a.download = downloadName(name); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const liveUrl = live?.slug ? `${typeof window !== "undefined" ? window.location.origin : "https://www.blinkspot.io"}/w/${live.slug}` : null;
  return (
    <div className="grid gap-3" style={{ height: "calc(100dvh - 160px)", minHeight: 520, gridTemplateRows: "auto minmax(0,1fr) auto" }}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="s-btn ghost sm" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> All pages</button>
        <input className="s-input" style={{ height: 32, width: 220, fontWeight: 600 }} value={name} aria-label="Page name" onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== page.name) void fetch("/api/sites/pages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: page.id, name }) }).then((r) => r.json()).then((d) => d.page && onSaved(d.page)); }} />
        {family.length > 1 && (
          <select className="s-input" style={{ height: 32, width: "auto", fontSize: 12.5 }} value={page.id} onChange={(e) => onOpen(e.target.value)} aria-label="Version">
            {family.map((p, i) => <option key={p.id} value={p.id}>v{i + 1}{i === 0 ? " · first" : p.brief ? ` · ${p.brief.slice(0, 40)}` : ""}{p.slug && p.published_at ? " · live" : ""}</option>)}
          </select>
        )}
        {live && <span className="s-badge ok" title={live.id === page.id ? "This version is live" : `v${family.findIndex((p) => p.id === live.id) + 1} is live`}>{live.id === page.id ? "Live" : `v${family.findIndex((p) => p.id === live.id) + 1} live`}</span>}
        <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "unsaved" ? "Unsaved" : ""}</span>
        <div className="flex-1" />
        <div className="s-seg" role="tablist" aria-label="Edit with">
          <button role="tab" aria-selected={editMode === "sections"} onClick={() => pickMode("sections")}><LayoutList className="h-3.5 w-3.5" /> Sections</button>
          <button role="tab" aria-selected={editMode === "code"} onClick={() => pickMode("code")}><Code2 className="h-3.5 w-3.5" /> Code</button>
        </div>
        {editMode === "code" && <PaneTabs tab={tab} setTab={setTab} />}
        <div className="hidden lg:flex gap-1" role="group" aria-label="Preview size">
          <button className="s-chip" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Laptop className="h-3.5 w-3.5 inline -mt-0.5" /> Desktop</button>
          <button className="s-chip" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone className="h-3.5 w-3.5 inline -mt-0.5" /> Phone</button>
        </div>
        <button className="s-btn ghost sm" onClick={() => setFull(true)}><Maximize2 className="h-3.5 w-3.5" /> Full screen</button>
        <button className="s-btn ghost sm" onClick={download}><Download className="h-3.5 w-3.5" /> Download .html</button>
        {liveUrl && <a href={liveUrl} target="_blank" rel="noopener" className="s-btn ghost sm"><ExternalLink className="h-3.5 w-3.5" /> Open live</a>}
        <button className="s-btn primary sm" onClick={() => setPublishing(true)}><Globe className="h-3.5 w-3.5" /> {live && live.id !== page.id ? "Publish this version" : live ? "Live settings" : "Publish"}</button>
      </div>

      {editMode === "sections" ? (
        <SectionsEditor html={draft} onChange={edit} device={device} onRewrite={(t) => change(t)} changing={changing} changeCost={SITE_CHANGE_CREDITS} />
      ) : (
        <div className="grid gap-3 min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className={`min-h-0 ${tab === "code" ? "" : "hidden lg:block"}`}><CodeEditor value={draft} onChange={edit} label="Page code" /></div>
          <div className={`min-h-0 rounded-2xl p-2 ${tab === "preview" ? "" : "hidden lg:block"}`} style={{ background: "var(--s-raised)" }}><SitePreview html={shown} device={device} /></div>
        </div>
      )}

      <div className="s-card p-2.5 flex flex-wrap items-end gap-2">
        <textarea className="s-input s-grow flex-1 min-w-[220px]" rows={2} style={{ ["--min-lines" as string]: 1, ["--max-lines" as string]: 5 }} value={instruction} onChange={(e) => setInstruction(e.target.value.slice(0, 1500))}
          placeholder="Change it: e.g. make the hero photo full screen, add a menu section with our three platters, warmer colours"
          aria-label="What to change" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void change(); }} />
        <button className="s-btn ai" disabled={changing || !instruction.trim()} onClick={() => void change()}>
          {changing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {changing ? "Changing…" : "Change it"} <span className="cost">{SITE_CHANGE_CREDITS} cr</span>
        </button>
        {confirmDelete
          ? <span className="inline-flex gap-1"><button className="s-btn sm" style={{ color: "var(--s-danger)" }} onClick={() => void remove()}>Delete v{version}</button><button className="s-btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button></span>
          : <button className="s-btn ghost sm" aria-label="Delete this version" title="Delete this version" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>

      {full && <SiteFullscreen html={shown} title={name} onClose={() => setFull(false)} />}
      <Modal open={publishing} onClose={() => setPublishing(false)} label="Publish your page" width={520} padded>
        <div className="flex items-center justify-between mb-2"><b className="text-[15px]">Publish v{version}</b><button className="s-btn ghost sm" onClick={() => setPublishing(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <p className="text-[13px] mb-4" style={{ color: "var(--s-soft)" }}>Anyone with the link can see it. It runs sandboxed: no forms or outside calls, just your page.{live && live.id !== page.id ? ` v${family.findIndex((p) => p.id === live.id) + 1} is live now; publishing moves the address to this version.` : ""}</p>
        <label className="s-label" htmlFor="code-slug">Address</label>
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--s-line-2)", background: "var(--s-bg)" }}>
          <span className="pl-3 text-[13px] whitespace-nowrap" style={{ color: "var(--s-mute)" }}>blinkspot.io/w/</span>
          <input id="code-slug" className="s-input" style={{ border: 0, background: "transparent", paddingLeft: 2 }} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80))} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="s-btn primary" onClick={() => void publish()} disabled={slug.replace(/-/g, "").length < 3}><Check className="h-4 w-4" /> {live?.id === page.id ? "Update address" : "Publish"}</button>
          {liveUrl && <button className="s-btn ghost" onClick={() => { void navigator.clipboard?.writeText(liveUrl); toast.success("Link copied."); }}><Copy className="h-4 w-4" /> Copy link</button>}
          {live && <button className="s-btn ghost" style={{ color: "var(--s-danger)" }} onClick={() => void unpublish(live.id)}>Take offline</button>}
        </div>
      </Modal>
    </div>
  );
}
