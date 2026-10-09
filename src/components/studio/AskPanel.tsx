"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2, MessageCircle, RotateCcw, X } from "lucide-react";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useAskStore, type AskMessage } from "./ask-store";

const STARTERS = [
  "Plan a 30 second launch video for my brand",
  "Make a poster for this weekend's offer",
  "What did I make last week?",
  "How many credits would a 1080p 15 s video cost?",
];

/** Ask BlinkSpot: a chat panel that reads the account and proposes actions as buttons. It never spends. */
export function AskPanel() {
  const { open, setOpen, draft, setDraft, messages, push, reset } = useAskStore();
  const { activeBrand } = useBrandStore();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    if (!t || busy) return;
    const mine: AskMessage = { role: "user", text: t };
    push(mine);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const history = [...useAskStore.getState().messages].slice(-20).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, brandId: activeBrand?.id ?? null, page: pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The assistant could not answer just now.");
      push({ role: "assistant", text: data.reply, actions: data.actions });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
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
              Tell me what you want to make{activeBrand ? ` for ${activeBrand.brand_name}` : ""}. I&apos;ll read your brand, plan it, price it and open the right studio with everything filled in. I never spend credits; you press Generate.
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button key={s} className="s-btn justify-start text-left" style={{ height: "auto", padding: "10px 12px", whiteSpace: "normal" }} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={`msg ${m.role === "user" ? "me" : "ai"}`}>{m.text}</div>
            {m.actions?.map((a, j) => (
              <div key={j} className="act">
                <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--s-soft)" }}>
                  <span>{a.note}</span>
                  {typeof a.estimatedCredits === "number" && <span className="mono">~{a.estimatedCredits.toLocaleString("en-US")} cr</span>}
                </div>
                <Link href={a.href} className="s-btn primary" onClick={() => { if (window.innerWidth < 1200) setOpen(false); }}>{a.label}</Link>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs mono" style={{ color: "var(--s-mute)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking… {elapsed > 0 && `${elapsed} s`}{elapsed > 20 && " · the model is slow right now, hang on"}</div>}
        {error && <div className="text-xs" style={{ color: "var(--s-danger)" }}>{error}</div>}
      </div>

      <form
        className="p-3 shrink-0"
        style={{ borderTop: "1px solid var(--s-line)" }}
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <div className="flex items-end gap-2 rounded-xl p-2" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line-2)" }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
            rows={2}
            maxLength={4000}
            placeholder="Ask anything, or describe what to make"
            aria-label="Message"
            className="flex-1 bg-transparent outline-none resize-none text-sm px-1"
          />
          <button type="submit" className="s-btn primary" style={{ width: 34, padding: 0 }} disabled={busy || !draft.trim()} aria-label="Send">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[11px] mt-2 px-1" style={{ color: "var(--s-mute)" }}>Claude Opus 5.5 · reads your brand, library and credits · <span className="s-kbd">⌘K</span></p>
      </form>
    </aside>
  );
}
