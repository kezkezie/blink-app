"use client";

import { create } from "zustand";
import type { CanvasOp, CanvasSummary } from "@/lib/canvas-ops";

/** Lets Ask BlinkSpot read and edit the image Editor's canvas while it is open (like the video editor bridge). */
type CanvasBridge = {
  attached: boolean;
  summary: (() => CanvasSummary) | null;
  apply: ((ops: CanvasOp[]) => Promise<void>) | null;
  undo: (() => void) | null;
  canUndo: boolean;
};

export const useCanvasBridge = create<CanvasBridge>(() => ({ attached: false, summary: null, apply: null, undo: null, canUndo: false }));
