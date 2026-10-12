"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore } from "@/app/store/useBrandStore";

/**
 * Voice input for every text box in the studio, including the reused classic pages, without
 * touching them: a mic button sits inside whichever box has focus. Tap to record, tap to stop; the
 * words are inserted at the cursor as if typed (React state updates normally). Opt a field out with
 * data-no-mic.
 *
 * Live words (Kezie, 2026-10-12: "I like it when it shows the words as you're speaking"): where the
 * browser has speech recognition (Chrome, Edge, Safari), the words appear in the box while you
 * talk. When you stop, Whisper's transcript (more accurate, knows the brand name) replaces them;
 * if Whisper fails, the live words stay. Elsewhere it records and inserts at the end, as before.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;
const MAX_SECONDS = 120;

function isDictatable(el: Element | null): el is Field {
  if (!el || (el as HTMLElement).closest("[data-no-mic]")) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return ["text", "search", ""].includes(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** Set a box's value the way typing would, so React's onChange fires, and place the caret. */
function setFieldValue(el: Field, value: string, caret: number) {
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const next = value.slice(0, max);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const at = Math.min(next.length, caret);
  el.setSelectionRange?.(at, at);
}

/** Where dictated words go: between `before` and `after`, with a space if needed. */
type Slot = { before: string; after: string; spacer: string };
function slotAtCaret(el: Field): Slot {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  return { before, after: el.value.slice(end), spacer: before && !/\s$/.test(before) ? " " : "" };
}
function fillSlot(el: Field, slot: Slot, text: string) {
  const insert = text ? slot.spacer + text : "";
  setFieldValue(el, slot.before + insert + slot.after, slot.before.length + insert.length);
}

/** Insert text at the caret the way typing would, so React's onChange fires. */
export function insertAtCaret(el: Field, text: string) {
  fillSlot(el, slotAtCaret(el), text);
}

/** The browser's live speech recognition (Chrome/Edge/Safari), typed minimally. */
type LiveResult = { isFinal: boolean; 0: { transcript: string } };
type LiveRecognizer = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<LiveResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
function liveRecognizer(): LiveRecognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => LiveRecognizer; webkitSpeechRecognition?: new () => LiveRecognizer };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  try { return Ctor ? new Ctor() : null; } catch { return null; }
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function Dictation() {
  const { activeBrand } = useBrandStore();
  const [field, setField] = useState<Field | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const target = useRef<Field | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // Live words: where they go, what has been said so far, and the recognizer.
  const slot = useRef<Slot | null>(null);
  const live = useRef("");
  const recognizer = useRef<LiveRecognizer | null>(null);
  const [hearing, setHearing] = useState(false);

  // Follow focus: the button belongs to the focused text box.
  useEffect(() => {
    const onFocus = (e: FocusEvent) => { if (isDictatable(e.target as Element)) setField(e.target as Field); };
    const onBlur = () => setTimeout(() => {
      if (state === "idle" && !isDictatable(document.activeElement)) setField(null);
    }, 120);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => { document.removeEventListener("focusin", onFocus); document.removeEventListener("focusout", onBlur); };
  }, [state]);

  // Keep the button inside the box as the page scrolls or the box grows.
  useEffect(() => {
    if (!field) return;
    let raf = 0;
    const tick = () => {
      // Only the box that has focus right now gets the mic (a closed panel's box must not keep it).
      const live = field.isConnected && field.offsetParent !== null && (document.activeElement === field || recorder.current?.state === "recording");
      setRect(live ? field.getBoundingClientRect() : null);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [field]);

  useEffect(() => {
    if (state !== "recording") return;
    const t0 = Date.now();
    const t = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => { clearInterval(t); setSeconds(0); };
  }, [state]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("working");
    try {
      const form = new FormData();
      form.append("audio", blob, "voice");
      form.append("hint", `${activeBrand?.brand_name ? `The brand is ${activeBrand.brand_name}. ` : ""}BlinkSpot, Instagram, TikTok, reel, poster, launch.`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't transcribe that.");
      const el = target.current;
      const text = String(data.text || "").trim() || live.current.trim();
      if (text && el?.isConnected) { el.focus(); if (slot.current) fillSlot(el, slot.current, text); else insertAtCaret(el, text); }
      else if (!text) toast.info("I didn't catch anything. Try again a little closer to the mic.");
    } catch (e) {
      // The live words are already in the box; only say something if there are none.
      if (!live.current.trim()) toast.error(e instanceof Error ? e.message : "Couldn't transcribe that.");
    } finally {
      slot.current = null;
      live.current = "";
      setState("idle");
    }
  }, [activeBrand?.brand_name]);

  async function start() {
    if (!field) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("This browser can't record audio."); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was blocked. Allow it in the browser's address bar to use voice input.");
      return;
    }
    target.current = field;
    chunks.current = [];
    slot.current = slotAtCaret(field);
    live.current = "";
    startLiveWords(field);
    const mime = pickMime();
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      stopLiveWords();
      const blob = new Blob(chunks.current, { type: (rec.mimeType || mime || "audio/webm").split(";")[0] });
      if (blob.size < 2000) {
        // Too short for Whisper; keep any live words, otherwise put the box back.
        if (!live.current.trim() && target.current && slot.current) fillSlot(target.current, slot.current, "");
        slot.current = null; live.current = ""; setState("idle");
        toast.info("That was too short. Hold on a moment longer.");
        return;
      }
      void transcribe(blob);
    };
    recorder.current = rec;
    rec.start(250);
    setState("recording");
  }

  /** Show the words in the box as they're said (where the browser can). */
  function startLiveWords(el: Field) {
    const r = liveRecognizer();
    if (!r) return;
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    let finals = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals = `${finals} ${t}`.replace(/\s+/g, " ").trim();
        else interim += t;
      }
      live.current = `${finals} ${interim}`.replace(/\s+/g, " ").trim();
      if (el.isConnected && slot.current) fillSlot(el, slot.current, live.current);
      setHearing(true);
    };
    // "no-speech" or a blocked service just means no live words; the recording carries on.
    r.onerror = () => {};
    r.onend = () => {
      // Chrome ends a session after a pause; keep listening while we're still recording.
      if (recorder.current?.state === "recording" && recognizer.current === r) { try { r.start(); } catch { /* already started */ } }
    };
    recognizer.current = r;
    try { r.start(); } catch { recognizer.current = null; }
  }
  function stopLiveWords() {
    const r = recognizer.current;
    recognizer.current = null;
    setHearing(false);
    try { r?.stop(); } catch { /* not started */ }
  }

  // Leaving the page mid-recording: stop the mic and the recognizer.
  useEffect(() => () => { try { recognizer.current?.abort(); } catch { /* none */ } stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  if (!field || !rect || rect.width < 120) return null;
  const tall = rect.height > 48;
  const size = 28;
  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 70,
    left: rect.right - size - 6,
    top: tall ? rect.bottom - size - 6 : rect.top + (rect.height - size) / 2,
    width: size, height: size,
  };
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return createPortal(
    <>
    {state !== "idle" && (
      <span
        aria-live="polite"
        className="rounded-full flex items-center gap-1.5 text-[11px] mono"
        style={{ position: "fixed", zIndex: 70, top: (style.top as number) + 3, left: (style.left as number) - 8, transform: "translateX(-100%)", height: size - 6, padding: "0 9px", background: "var(--s-raised)", border: "1px solid var(--s-line-2)", color: "var(--s-soft)", pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        {state === "recording" ? <><span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--s-danger)" }} />{hearing ? "Listening" : "Recording"} {mm}</> : "Tidying the words"}
      </span>
    )}
    <button
      type="button"
      // Keep focus (and the caret) in the text box.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (state === "recording" ? recorder.current?.stop() : state === "idle" ? void start() : undefined)}
      aria-label={state === "recording" ? "Stop and transcribe" : "Speak instead of typing"}
      title={state === "recording" ? `Recording ${seconds}s · tap to stop` : "Speak instead of typing"}
      className="rounded-full grid place-items-center transition-colors"
      style={{
        ...style,
        background: state === "recording" ? "var(--s-danger)" : "var(--s-raised)",
        color: state === "recording" ? "#fff" : "var(--s-soft)",
        border: "1px solid var(--s-line-2)",
        boxShadow: state === "recording" ? "0 0 0 4px color-mix(in oklab, var(--s-danger) 25%, transparent)" : "none",
      }}
    >
      {state === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "recording" ? <Square className="h-3 w-3" fill="currentColor" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
    </>,
    document.body,
  );
}
