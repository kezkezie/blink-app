"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, CalendarCheck, Check, ChevronUp, Coins, FileText, Loader2, MessageCircle, Paperclip, RotateCcw, Square, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { useClient } from "@/hooks/useClient";
import { EFFORTS, EFFORT_INFO, allowedEfforts, creditCapFor, type Effort } from "@/lib/assistant/effort";
import { useCredits } from "./hooks";
import { supabase } from "@/lib/supabase";
import { enabledPlatforms, placeOnCalendar } from "./plan/schedule";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useEditorBridge } from "@/components/video/editor-bridge";
import { useCanvasBridge } from "./editor/canvas-bridge";
import { summarizeTimeline } from "@/lib/editor-ops";
import { useAskStore, type AskAction, type AskMessage } from "./ask-store";
import { captureTimelineFrames } from "./capture-frames";
import { track } from "@/lib/analytics";

const EDITOR_STARTERS = [
  "Cut these clips into a 15 second Instagram reel with a hook and a call to action",
  "Pick the best 3 moments and make a 10 second teaser",
  "Add short captions in my brand's voice",
  "Tighten every clip so nothing drags",
];

const CANVAS_STARTERS = [
  "Design a launch poster layout here with my brand colours",
  "Draw a simple vector logo mark for my brand",
  "Add a bold headline and a call to action at the bottom",
  "Tidy this up: align everything and fix the spacing",
];

const STARTERS = [
  "Plan a 30 second launch video for my brand",
  "Make a poster for this weekend's offer",
  "Plan my ready posts on the calendar for next week",
  "How many credits would a 1080p 15 s video cost?",
];

/** Ask BlinkSpot: a chat panel that reads the account and proposes actions as buttons. It never starts a paid generation itself; its own messages are included in the plan or use a few credits (shown under the reply). */
export function AskPanel() {
  const { open, setOpen, draft, setDraft, messages, push, reset, effort, setEffort } = useAskStore();
  // Pictures to send with the next message (2026-10-16: "Ask should let us upload images").
  const { clientId } = useClient();
  const [pics, setPics] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const picInput = useRef<HTMLInputElement>(null);
  // Files to read (2026-10-20): PDF, Word, text, CSV, JSON, up to 3.
  const [docs, setDocs] = useState<Array<{ url: string; name: string }>>([]);
  const DOC_TYPES = /\.(pdf|docx|txt|md|csv|tsv|json)$/i;
  async function addDocs(files: File[]) {
    const ok = files.filter((f) => DOC_TYPES.test(f.name)).slice(0, 3 - docs.length);
    if (!ok.length || !clientId) return;
    for (const f of ok) {
      if (f.size > (f.name.toLowerCase().endsWith(".pdf") ? 15 : 8) * 1024 * 1024) { toast.error(`${f.name} is too big (PDFs up to 15 MB, other files 8 MB).`); continue; }
      setUploading((n) => n + 1);
      try {
        const ext = f.name.split(".").pop()!.toLowerCase();
        const path = `images/${clientId}/askdoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from("assets").upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw error;
        setDocs((d) => [...d, { url: supabase.storage.from("assets").getPublicUrl(path).data.publicUrl, name: f.name.slice(0, 80) }].slice(0, 3));
      } catch { toast.error(`Couldn't add ${f.name}.`); }
      finally { setUploading((n) => n - 1); }
    }
  }
  function addAttachments(files: File[]) {
    const pictures = files.filter((f) => /^image\//.test(f.type));
    const rest = files.filter((f) => !/^image\//.test(f.type));
    const odd = rest.filter((f) => !DOC_TYPES.test(f.name));
    if (odd.length) toast.error("Add pictures, or a PDF, Word, text, CSV or JSON file.");
    if (pictures.length) void addPictures(pictures);
    if (rest.length) void addDocs(rest);
  }
  async function addPictures(files: File[]) {
    const ok = files.filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type)).slice(0, 4 - pics.length);
    if (!ok.length) { if (files.length) toast.error("Add a JPG, PNG, WebP or GIF picture (up to 4)."); return; }
    if (!clientId) return;
    for (const f of ok) {
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is over 5 MB.`); continue; }
      setUploading((n) => n + 1);
      try {
        const path = `images/${clientId}/ask_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${f.type.split("/")[1].replace("jpeg", "jpg")}`;
        const { error } = await supabase.storage.from("assets").upload(path, f, { contentType: f.type });
        if (error) throw error;
        const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        setPics((p) => [...p, url].slice(0, 4));
      } catch { toast.error("Couldn't add that picture."); }
      finally { setUploading((n) => n - 1); }
    }
  }
  const { plan } = useCredits();
  const [dialOpen, setDialOpen] = useState(false);
  // What the plan allows; the server clamps too.
  // Every level is open; the plan's levels are included, the rest use credits (2026-10-12).
  const included = allowedEfforts(plan);
  const level: Effort = effort;
  const { activeBrand } = useBrandStore();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  // Stop (2026-10-22, test users asked): cancels the request; the server stops its model call too.
  const stopRef = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [watch, setWatch] = useState(true);
  const [applied, setApplied] = useState<string | null>(null); // key of the edit currently applied
  const editorOpen = useEditorBridge((b) => b.attached);
  const canUndo = useEditorBridge((b) => b.canUndo);
  const canvasOpen = useCanvasBridge((b) => b.attached);
  const canvasCanUndo = useCanvasBridge((b) => b.canUndo);
  const [error, setError] = useState<string | null>(null);
  // apply_schedule results, per action: "placing" while it runs, then a one-line summary.
  const [placed, setPlaced] = useState<Record<string, string>>({});
  // done cards: "undoing" while it runs, "undone" after (2026-10-17).
  const [undone, setUndone] = useState<Record<string, "undoing" | "undone">>({});
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(t); setElapsed(0); };
  }, [busy]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  async function send(text: string) {
    const t = text.trim();
    track("ask_sent", { pictures: pics.length, files: docs.length });
    const images = pics;
    const files = docs;
    if ((!t && !images.length && !files.length) || busy || uploading) return;
    const mine: AskMessage = { role: "user", text: t || (files.length ? "Please read this." : "What do you think of this?"), ...(images.length ? { images } : {}), ...(files.length ? { files } : {}) };
    push(mine);
    setDraft("");
    setPics([]);
    setDocs([]);
    setBusy(true);
    setError(null);
    const ac = new AbortController();
    stopRef.current = ac;
    try {
      const history = [...useAskStore.getState().messages].slice(-20).map((m) => ({ role: m.role, text: m.text, ...(m.images?.length ? { images: m.images } : {}), ...(m.files?.length ? { files: m.files } : {}) }));
      // In the Video Editor, send the timeline (and a few frames per clip) so the AI can edit it.
      const bridge = useEditorBridge.getState();
      let editor: { timeline: ReturnType<typeof summarizeTimeline>; frames: Awaited<ReturnType<typeof captureTimelineFrames>> } | undefined;
      if (bridge.attached && bridge.getState) {
        const state = bridge.getState();
        if (watch && state.videoClips.length) setStage("Looking at your clips");
        editor = { timeline: summarizeTimeline(state), frames: watch && state.videoClips.length ? await captureTimelineFrames(state) : [] };
      }
      setStage(null);
      const cb = useCanvasBridge.getState();
      const canvas = cb.attached && cb.summary ? cb.summary() : undefined;
      if (canvas) setStage("Reading your canvas");
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history, brandId: activeBrand?.id ?? null, page: pathname, ...(editor ? { editor } : {}), ...(canvas ? { canvas } : {}),
          // The user's own clock, so "Tuesday 6 pm" is planned in their time.
          tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(), tzOffset: new Date().getTimezoneOffset(),
          effort: level,
        }),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The assistant could not answer just now.");
      push({ role: "assistant", text: data.reply, actions: data.actions, credits: typeof data.credits === "number" ? data.credits : undefined });
      // Do-it-now actions run as they arrive: a new brand opens, a studio opens and starts, a schedule goes on.
      const at = useAskStore.getState().messages.length - 1;
      (data.actions as AskAction[] | undefined)?.forEach((a, j) => {
        if (!a.auto) return;
        if (a.kind === "switch_brand" && a.brand) {
          const { availableBrands, setAvailableBrands, setActiveBrand } = useBrandStore.getState();
          const b = { id: a.brand.id, brand_name: a.brand.brand_name, logo_url: null, role: "owner" as const };
          if (!availableBrands.some((x) => x.id === b.id)) setAvailableBrands([...availableBrands, b]);
          setActiveBrand(b);
        } else if (a.kind === "apply_schedule") void applySchedule(a, `${at}:${j}`);
        else if (a.href) { router.push(a.href); if (window.innerWidth < 1200) setOpen(false); }
      });
    } catch (err) {
      if (ac.signal.aborted) push({ role: "assistant", text: "Stopped. Nothing else was done." });
      else setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      stopRef.current = null;
      setBusy(false);
      setStage(null);
    }
  }

  async function applySchedule(a: AskAction, key: string) {
    const items = a.schedule ?? [];
    if (!items.length) return;
    setPlaced((s) => ({ ...s, [key]: "placing" }));
    const { data } = await supabase.from("content").select("id, client_id, target_platforms, postforme_tracking_id").in("id", items.map((i) => i.id));
    let onCal = 0, queued = 0, noPlatforms = 0;
    const problems: string[] = [];
    for (const item of items) {
      const row = (data ?? []).find((r) => r.id === item.id);
      if (!row) { problems.push("a post that no longer exists"); continue; }
      const r = await placeOnCalendar(row.client_id as string, row as { id: string; target_platforms?: unknown; postforme_tracking_id?: string | null }, item.at);
      if (!r.ok) { problems.push(r.error || "one couldn't be saved"); continue; }
      onCal++;
      if (r.queued) queued++;
      else if (!enabledPlatforms(row.target_platforms).length) noPlatforms++;
      else problems.push(r.error || "one couldn't be queued");
    }
    window.dispatchEvent(new Event("blink:calendar-changed"));
    const parts = [`${onCal} on the calendar`, queued ? `${queued} queued to post` : "", noPlatforms ? `${noPlatforms} need platforms picked` : "", problems.length ? `problems: ${[...new Set(problems)].slice(0, 2).join("; ")}` : ""].filter(Boolean);
    setPlaced((s) => ({ ...s, [key]: parts.join(" · ") }));
  }

  function applyEdit(a: AskAction, key: string) {
    const bridge = useEditorBridge.getState();
    if (!bridge.apply || !a.ops) return;
    bridge.apply(a.ops);
    setApplied(key);
  }

  if (!open) return null;
  return (
    <aside className="s-ask" role="dialog" aria-label="Ask BlinkSpot">
      <header className="flex items-center gap-2 px-4 h-14 shrink-0" style={{ borderBottom: "1px solid var(--s-line)" }}>
        <MessageCircle className="h-4 w-4" style={{ color: "var(--s-ai)" }} />
        <b className="text-sm font-semibold">Ask BlinkSpot</b>
        <span className="s-badge ai">beta</span>
        <div className="flex-1" />
        {messages.length > 0 && (
          <button className="s-btn ghost sm" onClick={() => { reset(); setError(null); }} title="New conversation"><RotateCcw className="h-3.5 w-3.5" /></button>
        )}
        <button className="s-btn ghost sm" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--s-soft)" }}>
              {editorOpen
                ? "I can see your timeline and look at your clips. Tell me the cut you want; I'll show the changes and you press Apply. Undo is one click, and editing is free."
                : canvasOpen
                ? "I can see your canvas and its layers. Ask me to lay out a design, draw a vector or logo, add text, or tidy things up. You press Apply; Undo is one click."
                : <>Tell me what you want to make{activeBrand ? ` for ${activeBrand.brand_name}` : ""}. I&apos;ll read your brand, plan it, price it and open the right studio with everything filled in. I can also plan your posts on the calendar. I never spend credits; you press Generate or Apply.</>}
            </p>
            <div className="flex flex-col gap-2">
              {(editorOpen ? EDITOR_STARTERS : canvasOpen ? CANVAS_STARTERS : STARTERS).map((s) => (
                <button key={s} className="s-btn justify-start text-left" style={{ height: "auto", padding: "10px 12px", whiteSpace: "normal" }} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            {!!m.images?.length && (
              <div className={`flex flex-wrap gap-1.5 ${m.role === "user" ? "justify-end" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Attached" className="h-20 w-20 rounded-lg object-cover" style={{ border: "1px solid var(--s-line)" }} /></a>)}
              </div>
            )}
            {!!m.files?.length && (
              <div className="flex flex-wrap gap-1.5 justify-end">
                {m.files.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="text-[11.5px] rounded-lg px-2 py-1 flex items-center gap-1.5" style={{ border: "1px solid var(--s-line)" }}><FileText className="h-3.5 w-3.5" style={{ color: "var(--s-ai)" }} />{f.name}</a>)}
              </div>
            )}
            <div className={`msg ${m.role === "user" ? "me" : "ai"}`}>{m.text}</div>
            {m.role === "assistant" && !!m.credits && <span className="text-[10.5px] mono flex items-center gap-1 -mt-1 px-1" style={{ color: "var(--s-mute)" }}><Coins className="h-3 w-3" /> {m.credits} credit{m.credits === 1 ? "" : "s"}</span>}
            {m.actions?.map((a, j) => {
              const key = `${i}:${j}`;
              if (a.kind === "apply_canvas") {
                const isApplied = applied === key && canvasCanUndo;
                return (
                  <div key={j} className="act">
                    <div className="text-xs font-medium">{a.note}</div>
                    <ul className="text-xs grid gap-1" style={{ color: "var(--s-soft)" }}>{a.changes?.slice(0, 12).map((c, k) => <li key={k}>· {c}</li>)}</ul>
                    {isApplied ? (
                      <div className="flex items-center gap-2">
                        <span className="s-badge ok"><Check className="inline h-3 w-3 -mt-px" /> APPLIED</span>
                        <button className="s-btn sm" onClick={() => { useCanvasBridge.getState().undo?.(); setApplied(null); }}><Undo2 className="h-3.5 w-3.5" /> Undo</button>
                      </div>
                    ) : (
                      <button className="s-btn primary" disabled={!canvasOpen} onClick={async () => { await useCanvasBridge.getState().apply?.(a.canvasOps ?? []); setApplied(key); }}>
                        {canvasOpen ? a.label : "Open the Editor to apply"}
                      </button>
                    )}
                  </div>
                );
              }
              if (a.kind === "done" || a.kind === "switch_brand") {
                const u = undone[key];
                return (
                  <div key={j} className="act">
                    <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: u === "undone" ? "var(--s-mute)" : "var(--s-ok)" }}>{u === "undone" ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} {u === "undone" ? "Undone" : a.note}</div>
                    <ul className="text-xs grid gap-1" style={{ color: "var(--s-soft)", textDecoration: u === "undone" ? "line-through" : undefined }}>{a.changes?.slice(0, 14).map((c, k) => <li key={k}>· {c}</li>)}</ul>
                    <div className="flex items-center gap-2">
                      {a.kind === "switch_brand" ? <Link href="/studio/brand" className="s-btn sm" onClick={() => { if (window.innerWidth < 1200) setOpen(false); }}>Open the Brand page</Link>
                        : <Link href={(a.undo as { kind?: string } | undefined)?.kind === "posts" ? "/studio/library" : "/studio/brand"} className="s-btn sm" onClick={() => { if (window.innerWidth < 1200) setOpen(false); }}>{(a.undo as { kind?: string } | undefined)?.kind === "posts" ? "Open Library" : "See it"}</Link>}
                      {!!a.undo && u !== "undone" && (
                        <button className="s-btn ghost sm" disabled={u === "undoing"} onClick={async () => {
                          setUndone((x) => ({ ...x, [key]: "undoing" }));
                          const r = await fetch("/api/assistant/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: a.undo }) }).catch(() => null);
                          if (r?.ok) { setUndone((x) => ({ ...x, [key]: "undone" })); toast.success("Put back as it was."); }
                          else { setUndone((x) => { const n = { ...x }; delete n[key]; return n; }); toast.error("Couldn't undo that."); }
                        }}>{u === "undoing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Undo</button>
                      )}
                    </div>
                  </div>
                );
              }
              if (a.kind === "apply_schedule") {
                const state = placed[key];
                return (
                  <div key={j} className="act">
                    <div className="text-xs font-medium">{a.note}</div>
                    <ul className="text-xs grid gap-1" style={{ color: "var(--s-soft)" }}>{a.changes?.slice(0, 30).map((c, k) => <li key={k}>· {c}</li>)}</ul>
                    {state && state !== "placing" ? (
                      <div className="grid gap-2">
                        <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--s-ok)" }}><Check className="h-3.5 w-3.5" /> {state}</span>
                        <Link href="/studio/plan" className="s-btn sm" onClick={() => { if (window.innerWidth < 1200) setOpen(false); }}>Open the calendar</Link>
                      </div>
                    ) : (
                      <button className="s-btn primary" disabled={state === "placing"} onClick={() => void applySchedule(a, key)}>
                        {state === "placing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} {a.label}
                      </button>
                    )}
                  </div>
                );
              }
              if (a.kind === "apply_edit") {
                const isApplied = applied === key && canUndo;
                return (
                  <div key={j} className="act">
                    <div className="text-xs font-medium">{a.note}</div>
                    <ul className="text-xs grid gap-1" style={{ color: "var(--s-soft)" }}>
                      {a.changes?.slice(0, 12).map((c, k) => <li key={k}>· {c}</li>)}
                    </ul>
                    {isApplied ? (
                      <div className="flex items-center gap-2">
                        <span className="s-badge ok"><Check className="inline h-3 w-3 -mt-px" /> APPLIED</span>
                        <button className="s-btn sm" onClick={() => { useEditorBridge.getState().undo?.(); setApplied(null); }}><Undo2 className="h-3.5 w-3.5" /> Undo</button>
                      </div>
                    ) : (
                      <button className="s-btn primary" disabled={!editorOpen} onClick={() => applyEdit(a, key)}>
                        {editorOpen ? a.label : "Open the editor to apply"}
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div key={j} className="act">
                  <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--s-soft)" }}>
                    <span>{a.note}</span>
                    {typeof a.estimatedCredits === "number" && <span className="mono">~{a.estimatedCredits.toLocaleString("en-US")} cr</span>}
                  </div>
                  {a.href && <Link href={a.href} className="s-btn primary" onClick={() => { if (window.innerWidth < 1200) setOpen(false); }}>{a.label}</Link>}
                </div>
              );
            })}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs mono" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> {stage ?? "Thinking"}… {elapsed > 0 && `${elapsed} s`}{elapsed > 20 && " · the model is slow right now, hang on"}</div>}
        {error && <div className="text-xs" style={{ color: "var(--s-danger)" }}>{error}</div>}
      </div>

      <form
        className="p-3 shrink-0"
        style={{ borderTop: "1px solid var(--s-line)" }}
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        {(pics.length > 0 || docs.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {docs.map((d) => (
              <span key={d.url} className="relative h-14 max-w-[160px] rounded-lg px-2.5 flex items-center gap-1.5 text-[11.5px]" style={{ border: "1px solid var(--s-line)", background: "var(--s-bg)" }} title={d.name}>
                <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} /><span className="truncate">{d.name}</span>
                <button type="button" className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full grid place-items-center" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }} onClick={() => setDocs((p) => p.filter((x) => x.url !== d.url))} aria-label={`Remove ${d.name}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {pics.map((u) => (
              <span key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="To send" className="h-14 w-14 rounded-lg object-cover" style={{ border: "1px solid var(--s-line)" }} />
                <button type="button" className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full grid place-items-center" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }} onClick={() => setPics((p) => p.filter((x) => x !== u))} aria-label="Remove picture"><X className="h-3 w-3" /></button>
              </span>
            ))}
            {uploading > 0 && <span className="h-14 w-14 rounded-lg grid place-items-center s-skel"><Loader2 className="h-4 w-4 animate-spin" /></span>}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl p-2" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line-2)" }}>
          <button type="button" className="s-btn ghost" style={{ width: 34, padding: 0 }} onClick={() => picInput.current?.click()} disabled={(pics.length >= 4 && docs.length >= 3) || !clientId} aria-label="Add a picture or file" title="Add a picture or a file to read: PDF, Word, text, CSV (or paste a picture)"><Paperclip className="h-4 w-4" /></button>
          <input ref={picInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.docx,.txt,.md,.csv,.tsv,.json,application/pdf" multiple className="hidden" onChange={(e) => { addAttachments([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            onPaste={(e) => { const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); void addPictures(files); } }}
            rows={2}
            style={{ ["--min-lines" as string]: 1, ["--max-lines" as string]: 5 }}
            maxLength={4000}
            placeholder="Ask anything, or describe what to make"
            aria-label="Message"
            className="s-grow flex-1 bg-transparent outline-none resize-none text-sm px-1"
          />
          {busy ? (
            <button type="button" className="s-btn" style={{ width: 34, padding: 0 }} onClick={() => stopRef.current?.abort()} aria-label="Stop" title="Stop">
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          ) : <button type="submit" className="s-btn primary" style={{ width: 34, padding: 0 }} disabled={uploading > 0 || (!draft.trim() && !pics.length && !docs.length)} aria-label="Send">
            <ArrowUp className="h-4 w-4" />
          </button>}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 px-1">
          <div className="relative flex items-center gap-1.5 min-w-0">
            <button type="button" className="flex items-center gap-1.5 text-[11px] rounded-md px-1.5 py-0.5 hover:bg-[var(--s-raised)]" style={{ color: "var(--s-soft)" }} onClick={() => setDialOpen((v) => !v)} aria-haspopup="menu" aria-expanded={dialOpen} title="How hard Ask thinks">
              <EffortBars level={level} />
              <span>{EFFORT_INFO[level].label}</span>
              <span style={{ color: "var(--s-mute)" }}>· {editorOpen || canvasOpen || EFFORT_INFO[level].model === "opus" ? "Opus 5.5" : "Sonnet 5.5"}</span>
              <ChevronUp className="h-3 w-3" style={{ color: "var(--s-mute)" }} />
            </button>
            <span className="s-kbd hidden sm:inline">⌘K</span>
            {dialOpen && (
              <div role="menu" className="absolute bottom-7 left-0 z-10 w-[260px] rounded-xl p-1.5 grid gap-0.5" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)", boxShadow: "0 18px 40px rgba(0,0,0,.5)" }}>
                <span className="px-2 pt-1 pb-1.5 text-[10.5px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>How hard Ask thinks</span>
                {EFFORTS.map((e) => {
                  const ok = included.includes(e) && !(editorOpen || canvasOpen ? plan === "free" || plan === null : false);
                  const info = EFFORT_INFO[e];
                  return (
                    <button key={e} role="menuitemradio" aria-checked={level === e} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left" style={{ background: level === e ? "var(--s-hover)" : "transparent" }}
                      onClick={() => { setEffort(e); setDialOpen(false); }}>
                      <EffortBars level={e} />
                      <span className="flex-1 min-w-0">
                        <span className="text-[12.5px] font-medium flex items-center gap-1.5">{info.label}{level === e && <Check className="h-3 w-3" style={{ color: "var(--s-accent)" }} />}</span>
                        <span className="text-[11px] block truncate" style={{ color: "var(--s-mute)" }}>{info.line}</span>
                      </span>
                      <span className="text-[10.5px] mono text-right shrink-0" style={{ color: "var(--s-mute)" }}>{ok ? (info.weight === 1 ? "1 msg" : `${info.weight} msgs`) : <span className="flex items-center gap-1" title="Not included in your plan: paid with credits for what it uses"><Coins className="h-3 w-3" />≤{creditCapFor(e, editorOpen || canvasOpen)} cr</span>}</span>
                    </button>
                  );
                })}
                <span className="px-2 pt-1.5 pb-1 text-[10.5px] leading-snug" style={{ color: "var(--s-mute)" }}>Your plan includes the levels marked in messages; deeper ones count as more. The others, and messages after today&apos;s included ones, use credits for what they actually use.</span>
              </div>
            )}
          </div>
          {editorOpen && (
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--s-soft)" }}>
              <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} style={{ accentColor: "var(--s-accent)" }} /> Look at clips
            </label>
          )}
        </div>
      </form>
    </aside>
  );
}

/** Five little bars, filled up to the level (like a signal meter). */
function EffortBars({ level }: { level: Effort }) {
  const n = EFFORTS.indexOf(level) + 1;
  return (
    <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
      {EFFORTS.map((e, i) => <span key={e} className="w-[3px] rounded-sm" style={{ height: 4 + i * 2, background: i < n ? (i >= 2 ? "var(--s-ai)" : "var(--s-accent)") : "var(--s-line-2)" }} />)}
    </span>
  );
}
