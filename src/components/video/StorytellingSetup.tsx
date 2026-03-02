"use client";

import { useState } from "react";
import { Upload, X, Sparkles, Loader2, Info, Clock, GripVertical, Trash2, Plus, Film } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VideoSetupProps } from "./types";

// Extend the base props to include the Storytelling specific states passed from page.tsx
export interface StorytellingSetupProps extends VideoSetupProps {
    bRollConcept: string;
    setBRollConcept: (val: string) => void;
    bRollScenes: any[];
    setBRollScenes: (scenes: any[]) => void;
    handleGenerateScenes: () => void;
    addEmptyScene: () => void;
    updateScene: (id: string, field: string, value: string) => void;
    removeScene: (id: string) => void;
}

export function StorytellingSetup({
    primaryPreview,
    setPrimaryFile,
    setPrimaryPreview,
    primaryInputRef,
    handleFileSelect,
    bRollConcept,
    setBRollConcept,
    bRollScenes,
    handleGenerateScenes,
    addEmptyScene,
    updateScene,
    removeScene,
    isSuggesting,
}: StorytellingSetupProps) {

    // Local state for the Target Duration UI
    const [targetDuration, setTargetDuration] = useState<number>(16);

    return (
        <div className="space-y-6 animate-in fade-in">

            {/* ── TOP SECTION: THE MASTER SETUP ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Anchor Image Upload */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                    <div>
                        <label className="text-sm font-bold text-blink-dark flex items-center justify-between">
                            Base Anchor Image
                            <span className="text-xs font-normal text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                                Required
                            </span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                            Upload the starting frame. We use Last-Frame Vision to seamlessly connect subsequent scenes to this.
                        </p>
                    </div>

                    {primaryPreview ? (
                        <div className="relative aspect-video rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                            <img src={primaryPreview} alt="Anchor" className="w-full h-full object-contain p-2" />
                            <button
                                onClick={() => { setPrimaryFile(null); setPrimaryPreview(null); }}
                                className="absolute top-2 right-2 p-2 bg-white/90 text-red-500 rounded-full shadow-sm hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => primaryInputRef.current?.click()}
                            className="aspect-video rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                        >
                            <Upload className="h-8 w-8 text-gray-400 mb-3" />
                            <p className="text-sm font-medium text-blink-dark">Upload Anchor Image</p>
                        </div>
                    )}
                    <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
                </div>

                {/* Story Concept & Duration */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-blink-dark">The Storyboard Director</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                Tell us the overarching story. Our AI will break it down into perfectly timed 8-second cinematic scenes.
                            </p>
                        </div>
                    </div>

                    {/* Target Duration Selector */}
                    <div className="mb-4 space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Target Duration</label>
                        <div className="flex gap-2">
                            {[
                                { val: 8, label: "Short (8s)", scenes: "1 Scene" },
                                { val: 16, label: "Medium (16s)", scenes: "2 Scenes" },
                                { val: 24, label: "Long (24s)", scenes: "3 Scenes" },
                            ].map((dur) => (
                                <button
                                    key={dur.val}
                                    onClick={() => setTargetDuration(dur.val)}
                                    className={cn(
                                        "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                                        targetDuration === dur.val
                                            ? "border-purple-500 bg-purple-50 text-purple-700 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                    )}
                                >
                                    <span className="block">{dur.label}</span>
                                    <span className="text-[10px] opacity-70 font-normal">{dur.scenes}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Master Prompt Input */}
                    <div className="flex-1 flex gap-3">
                        <Textarea
                            value={bRollConcept}
                            onChange={(e) => setBRollConcept(e.target.value)}
                            placeholder="e.g. A cinematic journey of my product starting in a dark warehouse, then transitioning into a bright modern living room..."
                            className="resize-none flex-1 border-gray-300 focus-visible:ring-purple-500 text-sm p-3 bg-gray-50"
                        />
                        <Button
                            onClick={handleGenerateScenes}
                            disabled={isSuggesting || !bRollConcept.trim()}
                            className="bg-purple-600 hover:bg-purple-700 text-white h-auto w-32 flex-col gap-2 shadow-sm"
                        >
                            {isSuggesting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                            <span className="text-xs text-center leading-tight">
                                {isSuggesting ? "Writing..." : "Generate Storyboard"}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── BOTTOM SECTION: THE EDITABLE TIMELINE ── */}
            {bRollScenes.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-gray-200 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-blink-dark flex items-center gap-2">
                            <Film className="h-5 w-5 text-purple-600" /> Sequence Timeline
                        </h3>
                        <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-bold">
                            <Clock className="h-4 w-4" />
                            Total: {bRollScenes.length * 8}s
                        </div>
                    </div>

                    <div className="space-y-4">
                        {bRollScenes.map((scene, idx) => (
                            <div key={scene.id} className="bg-white rounded-xl border border-gray-200 shadow-sm flex overflow-hidden group hover:border-purple-300 transition-colors">
                                {/* Scene Number Drag Handle */}
                                <div className="w-12 bg-gray-50 border-r border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400">
                                    <span className="text-xs font-bold text-gray-500">#{idx + 1}</span>
                                    <GripVertical className="h-4 w-4 cursor-grab hover:text-gray-600" />
                                </div>

                                {/* Editable Prompts */}
                                <div className="flex-1 p-5 space-y-4">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-1 flex-1">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                                <span>Visual & Camera Prompt</span>
                                                <span className="text-purple-500 font-normal normal-case">8s duration</span>
                                            </label>
                                            <Textarea
                                                value={scene.image_prompt}
                                                onChange={(e) => updateScene(scene.id, "image_prompt", e.target.value)}
                                                className="h-20 text-sm resize-none focus-visible:ring-purple-400 border-gray-200"
                                            />
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                Action / Context
                                            </label>
                                            <Textarea
                                                value={scene.video_action}
                                                onChange={(e) => updateScene(scene.id, "video_action", e.target.value)}
                                                className="h-20 text-sm resize-none focus-visible:ring-purple-400 border-gray-200"
                                            />
                                        </div>

                                        {/* Delete Scene Button */}
                                        <button
                                            onClick={() => removeScene(scene.id)}
                                            className="mt-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        onClick={addEmptyScene}
                        variant="outline"
                        className="w-full border-dashed border-2 border-gray-300 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 py-6"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add Custom Scene (+8s)
                    </Button>
                </div>
            )}
        </div>
    );
}