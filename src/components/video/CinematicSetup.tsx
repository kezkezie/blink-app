"use client";

import { useState } from "react";
import { Upload, X, Sparkles, Loader2, Info, ShoppingBag, FolderOpen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

export function CinematicSetup({
    primaryPreview,
    setPrimaryFile,
    setPrimaryPreview,
    primaryInputRef,
    handleFileSelect,
    prompt,
    setPrompt,
    isSuggesting,
    handleAISuggest,
    activeModeConfig,
}: VideoSetupProps) {
    const [libraryOpen, setLibraryOpen] = useState(false);

    const handleLibrarySelect = (url: string) => {
        setPrimaryFile(null);
        setPrimaryPreview(url);
        setLibraryOpen(false);
    };

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
                        <img src={primaryPreview} alt="Product" className="w-full h-full object-contain p-2" />
                        <button
                            onClick={() => { setPrimaryFile(null); setPrimaryPreview(null); }}
                            className="absolute top-2 right-2 p-2 bg-white/90 text-red-500 rounded-full shadow-sm hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div
                            onClick={() => primaryInputRef.current?.click()}
                            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                        >
                            <ShoppingBag className="h-8 w-8 text-gray-400 mb-3" />
                            <p className="text-sm font-medium text-blink-dark">Upload {activeModeConfig.primaryLabel}</p>
                            <p className="text-xs text-gray-400 mt-1">Clean product shot on white or transparent background</p>
                        </div>
                        <button
                            onClick={() => setLibraryOpen(true)}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50 py-2 rounded-lg border border-blue-200 transition-colors"
                        >
                            <FolderOpen className="h-3.5 w-3.5" /> Select from Library
                        </button>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Cinematic Tips Card */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100 p-5 shadow-sm space-y-4 flex flex-col justify-center">
                <div className="flex items-center gap-2 text-purple-700">
                    <Info className="h-5 w-5" />
                    <span className="text-sm font-bold">Cinematic Showcase Tips</span>
                </div>
                <ul className="text-xs text-gray-600 space-y-2 list-disc list-inside">
                    <li>Use a clean, high-res product image for best results</li>
                    <li>The AI will create dynamic camera movement around your product</li>
                    <li>Transparent PNG backgrounds give the cleanest cinematic look</li>
                    <li>Describe the mood, lighting, and environment in your prompt</li>
                </ul>
            </div>

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                    <div>
                        <label className="text-sm font-bold text-blink-dark">Cinematic Vision</label>
                        <p className="text-xs text-gray-500 mt-1 max-w-md">
                            Describe the camera movement, lighting, and atmosphere for your product showcase.
                        </p>
                    </div>
                    <button
                        onClick={handleAISuggest}
                        disabled={isSuggesting}
                        className="text-xs text-purple-600 hover:bg-purple-50 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-200 transition-colors shadow-sm bg-white shrink-0"
                    >
                        {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                        {isSuggesting ? "Writing..." : "AI Suggest"}
                    </button>
                </div>

                <div className="relative">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g., A dramatic 360° orbit around the product on a sleek reflective surface, moody studio lighting with volumetric fog..."
                        className="resize-none border-gray-300 focus-visible:ring-purple-500 text-sm p-4 bg-gray-50"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-gray-400">
                        <Info className="h-3.5 w-3.5" /> Focus on camera & lighting
                    </div>
                </div>
            </div>

            <AssetSelectionModal
                open={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                onSelect={handleLibrarySelect}
            />
        </div>
    );
}
