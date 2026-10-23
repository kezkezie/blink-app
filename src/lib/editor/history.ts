/**
 * Undo and redo for the video editor's timeline (Kezie, 2026-10-23: "a shortcut for undo: Command Z
 * on Mac, Control Z on Windows"). Snapshots are the timeline arrays themselves (immutable updates),
 * so "same" is a reference check and nothing is copied. Pure, so the editor and the tests agree.
 */
export type History<T> = { past: T[]; present: T | null; future: T[] };
export const HISTORY_LIMIT = 100;

export const emptyHistory = <T,>(): History<T> => ({ past: [], present: null, future: [] });

/** A new state after an edit: the present goes onto the past, and redo is cleared. */
export function commit<T>(h: History<T>, next: T, same: (a: T, b: T) => boolean): History<T> {
  if (h.present === null) return { past: h.past, present: next, future: h.future };
  if (same(h.present, next)) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undoStep<T>(h: History<T>): History<T> {
  if (!h.past.length || h.present === null) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redoStep<T>(h: History<T>): History<T> {
  if (!h.future.length || h.present === null) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

type Key = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
/** Cmd+Z on a Mac, Ctrl+Z on Windows (either works on either). */
export const isUndoKey = (e: Key) => (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
/** Cmd+Shift+Z or Ctrl+Shift+Z, and Ctrl+Y on Windows. */
export const isRedoKey = (e: Key) => !e.altKey && (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") || (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "y"));
