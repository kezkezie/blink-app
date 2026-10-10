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
 */

type Field = HTMLInputElement | HTMLTextAreaElement;
const MAX_SECONDS = 120;

function isDictatable(el: Element | null): el is Field {
  if (!el || (el as HTMLElement).closest("[data-no-mic]")) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return ["text", "search", ""].includes(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** Insert text at the caret the way typing would, so React's onChange fires. */
export function insertAtCaret(el: Field, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const spacer = before && !/\s$/.test(before) ? " " : "";
  const insert = spacer + text;
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const next = (before + insert + after).slice(0, max);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = Math.min(next.length, before.length + insert.length);
  el.setSelectionRange?.(caret, caret);
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
    const tick = () => { setRect(field.isConnected ? field.getBoundingClientRect() : null); raf = requestAnimationFrame(tick); };
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
      if (data.text && el?.isConnected) { el.focus(); insertAtCaret(el, data.text); }
      else if (!data.text) toast.info("I didn't catch anything. Try again a little closer to the mic.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't transcribe that.");
    } finally {
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
    const mime = pickMime();
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: (rec.mimeType || mime || "audio/webm").split(";")[0] });
      if (blob.size < 2000) { setState("idle"); toast.info("That was too short. Hold on a moment longer."); return; }
      void transcribe(blob);
    };
    recorder.current = rec;
    rec.start(250);
    setState("recording");
  }

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
  return createPortal(
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
    </button>,
    document.body,
  );
}
