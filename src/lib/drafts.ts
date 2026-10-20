"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Work in progress that survives leaving the page (Kezie, 2026-10-20: "I leave to get an idea
 * somewhere in BlinkSpot, come back, and everything I've done is scraped off"). A small key-value
 * store in the browser: IndexedDB (canvases and timelines can be megabytes), falling back to
 * localStorage, and to nothing in a private window. Drafts are per device; they expire after
 * DRAFT_DAYS. Never throws.
 */
const DB = "blinkspot-drafts";
const STORE = "drafts";
export const DRAFT_DAYS = 14;

type Saved<T> = { at: number; value: T };

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then((d) => (d ? new Promise<T | null>((resolve) => {
    try {
      const r = run(d.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  }) : null));
}

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  const saved: Saved<T> = { at: Date.now(), value };
  const ok = await tx("readwrite", (s) => s.put(saved, key));
  if (ok === null) { try { localStorage.setItem(`draft:${key}`, JSON.stringify(saved)); } catch { /* full or private */ } }
}

export async function loadDraft<T>(key: string): Promise<{ at: number; value: T } | null> {
  let saved = (await tx<Saved<T>>("readonly", (s) => s.get(key))) ?? null;
  if (!saved) { try { const raw = localStorage.getItem(`draft:${key}`); saved = raw ? (JSON.parse(raw) as Saved<T>) : null; } catch { saved = null; } }
  if (!saved || Date.now() - saved.at > DRAFT_DAYS * 86_400_000) return null;
  return saved;
}

export async function clearDraft(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
  try { localStorage.removeItem(`draft:${key}`); } catch { /* private */ }
}

/** "5 minutes ago", "yesterday" for a draft's time. */
export function draftAge(at: number) {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * A few fields of a screen kept on this device (the brief, the chosen look, a plan that cost
 * credits), per key. Like useState, restored right after the page shows; skipped while `skip`
 * (e.g. a deep link brought its own idea).
 */
export function useKept<T>(key: string, initial: T, skip = false): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef<string | null>(null);
  const first = useRef(initial);
  useEffect(() => {
    if (loaded.current === key || skip) return;
    let saved: Saved<T> | null = null;
    try { const raw = localStorage.getItem(`kept:${key}`); saved = raw ? (JSON.parse(raw) as Saved<T>) : null; } catch { saved = null; }
    const fresh = saved && Date.now() - saved.at < DRAFT_DAYS * 86_400_000 ? saved : null;
    // Marked loaded when the timer fires (a dev re-run of this effect cancels the first timer).
    const t = setTimeout(() => { loaded.current = key; setValue(fresh ? fresh.value : first.current); }, 0);
    return () => clearTimeout(t);
  }, [key, skip]);
  const set = useCallback((v: T | ((p: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      try { localStorage.setItem(`kept:${key}`, JSON.stringify({ at: Date.now(), value: next })); } catch { /* full or private */ }
      return next;
    });
  }, [key]);
  return [value, set];
}
