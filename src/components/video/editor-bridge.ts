"use client";

import { create } from "zustand";
import type { EditOp, EditorState } from "@/lib/editor-ops";

/**
 * Lets Ask BlinkSpot read and edit the Video Editor timeline without owning its state. The editor
 * registers itself while mounted; the assistant panel reads a snapshot and applies an edit the user
 * approved. One level of undo per AI edit.
 */
export type QueuedClip = { url: string; name: string; duration: number };

type Bridge = {
  attached: boolean;
  /** Clips to lay on the timeline, in order, the next time the editor is open (e.g. a rendered scene stack). */
  queue: QueuedClip[];
  enqueue: (clips: QueuedClip[]) => void;
  getState: (() => EditorState) | null;
  apply: ((ops: EditOp[]) => void) | null;
  undo: (() => void) | null;
  canUndo: boolean;
};

export const useEditorBridge = create<Bridge>((set) => ({
  attached: false, getState: null, apply: null, undo: null, canUndo: false,
  queue: [],
  enqueue: (clips) => set({ queue: clips.slice(0, 40) }),
}));
