"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Link2, Loader2, MousePointerClick, Trash2, Undo2, Wand2, X } from "lucide-react";
import { previewDoc } from "@/lib/sites/code";
import { clean, deleteSection, duplicateSection, editorDoc, linkOf, moveSection, prepare, sectionsOf, setImage, setLink, setText, setTheme, themeOf, toggleSection } from "@/lib/sites/sections";
import { GOOGLE_FONTS_REGISTRY } from "@/lib/fonts";
import { Modal } from "../Modal";
import { ImagePicker } from "../ImagePicker";

/**
 * Sections mode for a website studio page (2026-10-17, lib/sites/sections.ts): no code needed.
 * Click words on the page to type over them, click a picture to swap it from the Library, and
 * move, hide, copy, delete or rewrite whole sections with AI. Colours and fonts on the side.
 * It edits the same HTML as the Code tab, so both stay in step.
 */
export function SectionsEditor({ html, onChange, device, onRewrite, changing, changeCost }: {
  html: string; onChange: (html: string) => void; device: "desktop" | "phone";
  onRewrite: (instruction: string) => Promise<void>; changing: boolean; changeCost: number;
}) {
  const [work, setWork] = useState(() => prepare(html));
  const latest = useRef(work);
  const emitted = useRef(html);
  const scrollY = useRef(0);
  const [frame, setFrame] = useState(() => previewDoc(editorDoc(work)));
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [selected, setSelected] = useState<{ section: string | null; link: string | null; href: string | null }>({ section: null, link: null, href: null });
  const [picking, setPicking] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const showAfterLoad = useRef<string | null>(null);

  // Something outside changed the page (the Code tab, an AI change, another version): start from it.
  useEffect(() => {
    if (html === emitted.current) return;
    emitted.current = html;
    const next = prepare(html);
    latest.current = next;
    const t = setTimeout(() => { setWork(next); setFrame(previewDoc(editorDoc(next, scrollY.current))); setHistory([]); }, 0);
    return () => clearTimeout(t);
  }, [html]);

  /** Keep the change, save it, and (for structure, colours, fonts) redraw the page where you were. */
  const commit = useCallback((next: string, redraw: boolean) => {
    if (next === latest.current) return;
    setHistory((h) => [...h.slice(-29), latest.current]);
    latest.current = next;
    setWork(next);
    const out = clean(next);
    emitted.current = out;
    onChange(out);
    if (redraw) setFrame(previewDoc(editorDoc(next, scrollY.current)));
  }, [onChange]);

  const post = (m: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ blinkParent: 1, ...m }, "*");

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const m = e.data as { blink?: number; t?: string; id?: string; html?: string; y?: number; section?: string | null; link?: string | null; href?: string | null };
      if (m?.blink !== 1) return;
      if (m.t === "text" && typeof m.id === "string" && typeof m.html === "string") commit(setText(latest.current, m.id, m.html), false);
      else if (m.t === "image" && typeof m.id === "string") setPicking(m.id);
      else if (m.t === "select") setSelected({ section: m.section ?? null, link: m.link ?? null, href: m.href ?? null });
      else if (m.t === "scroll" && typeof m.y === "number") scrollY.current = m.y;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [commit]);

  const sections = useMemo(() => sectionsOf(work), [work]);
  const theme = useMemo(() => themeOf(work), [work]);
  const current = sections.find((s) => s.id === selected.section) ?? null;
  const focus = (id: string) => { setSelected((s) => ({ ...s, section: id })); post({ t: "show", id }); };
  const structural = (next: string, show?: string) => { showAfterLoad.current = show ?? null; commit(next, true); };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    latest.current = prev;
    setWork(prev);
    const out = clean(prev);
    emitted.current = out;
    onChange(out);
    setFrame(previewDoc(editorDoc(prev, scrollY.current)));
  };

  return (
    <div className="grid gap-3 min-h-0 h-full lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="s-card min-h-0 overflow-y-auto p-3 grid gap-4 content-start order-2 lg:order-1">
        <p className="text-[12.5px] flex items-start gap-1.5" style={{ color: "var(--s-soft)" }}><MousePointerClick className="h-4 w-4 shrink-0 mt-px" style={{ color: "var(--s-ai)" }} /> Click any words on the page to change them, or a picture to swap it.</p>

        <div>
          <div className="flex items-center justify-between mb-1.5"><span className="s-label !mb-0">Sections</span>
            <button type="button" className="s-btn ghost sm" disabled={!history.length} onClick={undo} title="Undo the last change"><Undo2 className="h-3.5 w-3.5" /> Undo</button></div>
          <div className="grid gap-1" role="list" aria-label="Sections">
            {sections.map((s, i) => (
              <div key={`${s.key}-${s.id}`} role="listitem" className="rounded-lg flex items-center gap-1 px-2 py-1" style={{ background: current?.id === s.id ? "var(--s-bg)" : "transparent", border: `1px solid ${current?.id === s.id ? "var(--s-line-2)" : "transparent"}` }}>
                <button type="button" className="flex-1 text-left text-[13px] py-1 truncate" style={{ opacity: s.hidden ? 0.45 : 1 }} onClick={() => focus(s.id)}>{s.name}</button>
                {i > 0 && <button type="button" className="s-btn ghost sm" aria-label={`Move ${s.name} up`} onClick={() => structural(moveSection(work, s.id, -1), s.id)}><ArrowUp className="h-3.5 w-3.5" /></button>}
                {i < sections.length - 1 && <button type="button" className="s-btn ghost sm" aria-label={`Move ${s.name} down`} onClick={() => structural(moveSection(work, s.id, 1), s.id)}><ArrowDown className="h-3.5 w-3.5" /></button>}
                <button type="button" className="s-btn ghost sm" aria-label={s.hidden ? `Show ${s.name}` : `Hide ${s.name}`} onClick={() => structural(toggleSection(work, s.id), s.id)}>{s.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
              </div>
            ))}
          </div>
        </div>

        {current && (
          <div className="grid gap-2 rounded-xl p-2.5" style={{ background: "var(--s-bg)" }}>
            <div className="flex items-center gap-1"><b className="text-[13px] flex-1 truncate">{current.name}</b>
              <button type="button" className="s-btn ghost sm" aria-label={`Copy ${current.name}`} title="Duplicate" onClick={() => structural(duplicateSection(work, current.id))}><Copy className="h-3.5 w-3.5" /></button>
              <button type="button" className="s-btn ghost sm" aria-label={`Delete ${current.name}`} title="Delete" disabled={sections.length <= 1} onClick={() => { structural(deleteSection(work, current.id)); setSelected({ section: null, link: null, href: null }); }}><Trash2 className="h-3.5 w-3.5" /></button>
              <button type="button" className="s-btn ghost sm" aria-label="Close" onClick={() => setSelected({ section: null, link: null, href: null })}><X className="h-3.5 w-3.5" /></button></div>
            <textarea className="s-input s-grow" rows={2} style={{ ["--min-lines" as string]: 2, ["--max-lines" as string]: 5 }} value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))}
              placeholder="Rewrite this section with AI: e.g. three menu cards with our prices, warmer words" aria-label={`Rewrite ${current.name} with AI`} />
            <button type="button" className="s-btn ai sm w-fit" disabled={changing || !note.trim()} onClick={async () => { await onRewrite(`Only in the section marked data-section="${current.key}" ("${current.name}"): ${note.trim()}. Keep its data-section attribute.`); setNote(""); }}>
              {changing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Rewrite it <span className="cost">{changeCost} cr</span>
            </button>
          </div>
        )}

        {selected.link && (
          <label className="grid gap-1.5">
            <span className="s-label !mb-0 flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Where this button goes</span>
            <input key={selected.link} className="s-input" defaultValue={linkOf(work, selected.link) || selected.href || ""} placeholder="https://wa.me/…, tel:…, mailto:… or #section" aria-label="Button link"
              onBlur={(e) => { const next = setLink(latest.current, selected.link!, e.target.value); if (next !== latest.current) commit(next, false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
        )}

        {!!theme.length && (
          <div>
            <span className="s-label">Colours and fonts</span>
            <div className="grid gap-1.5">
              {theme.map((t) => (
                <label key={t.name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="flex-1 truncate" style={{ color: "var(--s-soft)" }}>{t.name.replace(/^--(color-|font-)?/, "").replace(/-/g, " ") || t.name}</span>
                  {t.kind === "color"
                    ? <input type="color" value={t.value.toLowerCase()} aria-label={`${t.name} colour`} className="h-7 w-10 rounded" onChange={(e) => commit(setTheme(latest.current, t.name, e.target.value.toUpperCase()), true)} />
                    : <select className="s-input" style={{ height: 30, width: 150, fontSize: 12 }} value={t.value} aria-label={`${t.name} font`} onChange={(e) => commit(setTheme(latest.current, t.name, e.target.value), true)}>
                        {[t.value, ...GOOGLE_FONTS_REGISTRY.map((f) => f.family).filter((f) => f !== t.value)].map((f) => <option key={f}>{f}</option>)}
                      </select>}
                </label>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="min-h-[420px] lg:min-h-0 rounded-2xl p-2 order-1 lg:order-2" style={{ background: "var(--s-raised)" }}>
        <iframe ref={frameRef} title="Website preview (click to edit)" srcDoc={frame} sandbox="allow-scripts" referrerPolicy="no-referrer"
          onLoad={() => { if (showAfterLoad.current) { post({ t: "show", id: showAfterLoad.current }); showAfterLoad.current = null; } }}
          className="block mx-auto bg-white transition-[width] duration-300" style={{ width: device === "phone" ? 390 : "100%", maxWidth: "100%", height: "100%", minHeight: 400, border: 0, borderRadius: device === "phone" ? 28 : 12 }} />
      </div>

      <Modal open={!!picking} onClose={() => setPicking(null)} label="Pick a picture" width={760} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-[15px]">Swap this picture</b><button className="s-btn ghost sm" onClick={() => setPicking(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <ImagePicker onPick={(img) => {
          const id = picking;
          setPicking(null);
          if (!id) return;
          const next = setImage(latest.current, id, img.url, img.title);
          if (next === latest.current) return;
          post({ t: "img", id, src: img.url });
          commit(next, false);
        }} />
      </Modal>
    </div>
  );
}
