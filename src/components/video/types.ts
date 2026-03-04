import type { RefObject, ChangeEvent } from "react";

// The new, advanced Scene object that supports individual models and file uploads
export interface BRollScene {
  id: string;
  scene_number: number;
  mode: string; // "ugc" | "showcase" | "clothing" | "logo_reveal"
  primaryFile: File | null;
  primaryPreview: string | null;
  secondaryFile: File | null;
  secondaryPreview: string | null;
  duration?: string;
  prompt: string;
}

// ─── Mode Config (matches VIDEO_MODES entries) ───────────────────────────────
export interface VideoModeConfig {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  primaryLabel: string | null;
  secondaryLabel: string | null;
}

// ─── Shared props passed from page.tsx into every Setup component ─────────────
export interface VideoSetupProps {
  primaryFile?: File | null;
  setPrimaryFile: (file: File | null) => void;
  primaryPreview: string | null;
  setPrimaryPreview: (url: string | null) => void;
  primaryInputRef: RefObject<HTMLInputElement | null>; // ✨ FIXED: Added | null
  handleFileSelect: (
    e: ChangeEvent<HTMLInputElement>,
    type: "primary" | "secondary"
  ) => void;

  secondaryFile?: File | null;
  setSecondaryFile: (file: File | null) => void;
  secondaryPreview: string | null;
  setSecondaryPreview: (url: string | null) => void;
  secondaryInputRef: RefObject<HTMLInputElement | null>; // ✨ FIXED: Added | null

  prompt: string;
  setPrompt: (val: string) => void;

  isSuggesting: boolean;
  handleAISuggest: () => void;

  activeModeConfig: {
    id: string;
    title: string;
    primaryLabel: string | null;
    secondaryLabel: string | null;
  };
}

// ─── Extra props only for StorytellingSetup ──────────────────────────────────
export interface StorytellingSetupProps extends VideoSetupProps {
  bRollConcept: string;
  setBRollConcept: (s: string) => void;
  bRollScenes: BRollScene[];
  setBRollScenes: React.Dispatch<React.SetStateAction<BRollScene[]>>;
  handleGenerateScenes: () => void;
  addEmptyScene: () => void;
  updateScene: (id: string, field: keyof BRollScene, value: string) => void;
  removeScene: (id: string) => void;
}
