import type { RefObject } from "react";

// ─── B-Roll Scene ─────────────────────────────────────────────────────────────
export interface BRollScene {
    id: string;
    scene_number: number;
    image_prompt: string;
    video_action: string;
    duration: string;
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
    // Primary image
    primaryFile: File | null;
    setPrimaryFile: (f: File | null) => void;
    primaryPreview: string | null;
    setPrimaryPreview: (s: string | null) => void;
    primaryInputRef: RefObject<HTMLInputElement | null>;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>, type: "primary" | "secondary") => void;

    // Secondary image
    secondaryFile: File | null;
    setSecondaryFile: (f: File | null) => void;
    secondaryPreview: string | null;
    setSecondaryPreview: (s: string | null) => void;
    secondaryInputRef: RefObject<HTMLInputElement | null>;

    // Prompt
    prompt: string;
    setPrompt: (s: string) => void;

    // AI Suggest
    isSuggesting: boolean;
    handleAISuggest: () => void;

    // Mode config (labels etc.)
    activeModeConfig: VideoModeConfig;
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
