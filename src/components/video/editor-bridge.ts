"use client";

import { create } from "zustand";
import type { EditOp, EditorState } from "@/lib/editor-ops";

/**
 * Lets Ask BlinkSpot read and edit the Video Editor timeline without owning its state. The editor
 * registers itself while mounted; the assistant panel reads a snapshot and applies an edit the user
 * approved. One level of undo per AI edit.
 */
type Bridge = {
  attached: boolean;
  getState: (() => EditorState) | null;
  apply: ((ops: EditOp[]) => void) | null;
  undo: (() => void) | null;
  canUndo: boolean;
};

export const useEditorBridge = create<Bridge>(() => ({ attached: false, getState: null, apply: null, undo: null, canUndo: false }));
