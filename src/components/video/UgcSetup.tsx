"use client";

import { Upload, X, UserCircle, Sparkles, Loader2, Info } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { VideoSetupProps } from "./types";

export function UgcSetup({
    primaryPreview,
    setPrimaryFile,
    setPrimaryPreview,
    primaryInputRef,
    handleFileSelect,
    secondaryPreview,
    setSecondaryFile,
    setSecondaryPreview,
    secondaryInputRef,
    prompt,
    setPrompt,
    isSuggesting,
    handleAISuggest,
    activeModeConfig,
}: VideoSetupProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
            {/* Primary Image (Product) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-purple-200 transition-colors">
                <label className="text-sm font-bold text-blink-dark flex items-center justify-between">
                    {activeModeConfig.primaryLabel}
                    <span className="text-xs font-normal text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        Required
                    </span>
                </label>
                {primaryPreview ? (
                    <div className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                        <img src={primaryPreview} alt="Primary" className="w-full h-full object-contain p-2" />
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
                        className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                    >
                        <Upload className="h-8 w-8 text-gray-400 mb-3" />
                        <p className="text-sm font-medium text-blink-dark">Upload {activeModeConfig.primaryLabel}</p>
                        <p className="text-xs text-gray-400 mt-1">PNG or JPG of the product</p>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Secondary Image (Influencer Face) */}
            {activeModeConfig.secondaryLabel && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-purple-200 transition-colors">
                    <label className="text-sm font-bold text-blink-dark flex items-center justify-between">
                        {activeModeConfig.secondaryLabel}
                        <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            Optional
                        </span>
                    </label>
                    {secondaryPreview ? (
                        <div className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                            <img src={secondaryPreview} alt="Secondary" className="w-full h-full object-cover" />
                            <button
                                onClick={() => { setSecondaryFile(null); setSecondaryPreview(null); }}
                                className="absolute top-2 right-2 p-2 bg-white/90 text-red-500 rounded-full shadow-sm hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => secondaryInputRef.current?.click()}
                            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                        >
                            <UserCircle className="h-8 w-8 text-gray-400 mb-3" />
                            <p className="text-sm font-medium text-blink-dark">Upload {activeModeConfig.secondaryLabel}</p>
                            <p className="text-xs text-gray-400 mt-1">Clear, front-facing portrait</p>
                        </div>
                    )}
                    <input ref={secondaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "secondary")} />
                </div>
            )}

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                    <div>
                        <label className="text-sm font-bold text-blink-dark">Visual Anchor (Action)</label>
                        <p className="text-xs text-gray-500 mt-1 max-w-md">
                            Describe what the influencer is doing with the product in a few words. Our AI Director will handle the cinematic lighting, background, and spoken script automatically.
                        </p>
                    </div>
                    <button
                        onClick={handleAISuggest}
                        disabled={isSuggesting}
                        className="text-xs text-purple-600 hover:bg-purple-50 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-200 transition-colors shadow-sm bg-white shrink-0"
                    >
                        {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                        {isSuggesting ? "Writing..." : "AI Suggest Concept"}
                    </button>
                </div>

                <div className="relative">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g., A diverse influencer smiling and applying the sunscreen in a sunny bathroom..."
                        className="resize-none border-gray-300 focus-visible:ring-purple-500 text-sm p-4 bg-gray-50"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-gray-400">
                        <Info className="h-3.5 w-3.5" /> Keep it under 15 words
                    </div>
                </div>
            </div>
        </div>
    );
}