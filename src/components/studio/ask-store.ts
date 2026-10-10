"use client";

import { create } from "zustand";
import type { EditOp } from "@/lib/editor-ops";
import type { CanvasOp } from "@/lib/canvas-ops";

export type AskAction = {
  kind: "open_video_studio" | "open_image_studio" | "open_page" | "apply_edit" | "apply_canvas";
  label: string;
  href?: string;
  /** apply_edit: the edit and what it changes, applied only when the user presses Apply. */
  ops?: EditOp[];
  changes?: string[];
  canvasOps?: CanvasOp[];
  /** Credits the action will cost when the user runs it in the studio (never spent by the assistant). */
  estimatedCredits?: number;
  note?: string;
};

export type AskMessage = { role: "user" | "assistant"; text: string; actions?: AskAction[] };

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
}));
