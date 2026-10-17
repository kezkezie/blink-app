"use client";

import { create } from "zustand";
import type { EditOp } from "@/lib/editor-ops";
import type { CanvasOp } from "@/lib/canvas-ops";
import type { Effort } from "@/lib/assistant/effort";

const EFFORT_KEY = "blink-ask-effort";
const readEffort = (): Effort => {
  try { const v = localStorage.getItem(EFFORT_KEY); return v === "low" || v === "medium" || v === "high" || v === "xhigh" || v === "max" ? v : "medium"; } catch { return "medium"; }
};

export type AskAction = {
  kind: "open_video_studio" | "open_image_studio" | "open_page" | "apply_edit" | "apply_canvas" | "apply_schedule" | "done" | "switch_brand";
  label: string;
  /** Run on arrival: the user asked Ask to do it now (2026-10-17). */
  auto?: boolean;
  /** done: what to send to /api/assistant/undo. */
  undo?: unknown;
  /** switch_brand: the brand Ask just created. */
  brand?: { id: string; brand_name: string };
  href?: string;
  /** apply_edit: the edit and what it changes, applied only when the user presses Apply. */
  ops?: EditOp[];
  changes?: string[];
  canvasOps?: CanvasOp[];
  /** apply_schedule: posts and UTC times, placed only when the user presses Apply. */
  schedule?: Array<{ id: string; at: string; label: string }>;
  /** Credits the action will cost when the user runs it in the studio (never spent by the assistant). */
  estimatedCredits?: number;
  note?: string;
};

export type AskMessage = { role: "user" | "assistant"; text: string; actions?: AskAction[]; /** Credits this reply used (0 or absent: included in the plan). */ credits?: number; /** Pictures the user attached (2026-10-16). */ images?: string[] };

type AskState = {
  open: boolean;
  draft: string;
  messages: AskMessage[];
  setOpen: (open: boolean) => void;
  /** Open the panel with a question already typed (e.g. "Help me plan a 30 s launch video"). */
  ask: (draft?: string) => void;
  setDraft: (draft: string) => void;
  push: (m: AskMessage) => void;
  reset: () => void;
  /** The thinking dial (remembered in this browser). */
  effort: Effort;
  setEffort: (e: Effort) => void;
};

export const useAskStore = create<AskState>((set) => ({
  open: false,
  draft: "",
  messages: [],
  setOpen: (open) => set({ open }),
  ask: (draft) => set((s) => ({ open: true, draft: draft ?? s.draft })),
  setDraft: (draft) => set({ draft }),
  push: (m) => set((s) => ({ messages: [...s.messages, m].slice(-40) })),
  reset: () => set({ messages: [], draft: "" }),
  effort: typeof window === "undefined" ? "medium" : readEffort(),
  setEffort: (effort) => { try { localStorage.setItem(EFFORT_KEY, effort); } catch { /* private mode */ } set({ effort }); },
}));
