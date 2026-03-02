"use client";

import { Upload, X, Sparkles, Loader2, Info, Shirt, UserCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { VideoSetupProps } from "./types";

export function ClothingSetup({
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
            {/* Primary Image (The Garment) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-pink-200 transition-colors">
                <label className="text-sm font-bold text-blink-dark flex items-center justify-between">
                    {activeModeConfig.primaryLabel}
                    <span className="text-xs font-normal text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        Required
                    </span>
                </label>
                {primaryPreview ? (
                    <div className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                        <img src={primaryPreview} alt="Garment" className="w-full h-full object-contain p-2" />
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
                        className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-pink-400 hover:bg-pink-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                    >
                        <Shirt className="h-8 w-8 text-gray-400 mb-3" />
                        <p className="text-sm font-medium text-blink-dark">Upload {activeModeConfig.primaryLabel}</p>
                        <p className="text-xs text-gray-400 mt-1">Flat lay or ghost mannequin works best</p>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Secondary Image (The Model) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 hover:border-pink-200 transition-colors">
                <label className="text-sm font-bold text-blink-dark flex items-center justify-between">
                    {activeModeConfig.secondaryLabel}
                    <span className="text-xs font-normal text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        Required
                    </span>
                </label>
                {secondaryPreview ? (
                    <div className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
                        <img src={secondaryPreview} alt="Model" className="w-full h-full object-cover" />
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
                        className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-pink-400 hover:bg-pink-50 flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-6"
                    >
                        <UserCircle className="h-8 w-8 text-gray-400 mb-3" />
                        <p className="text-sm font-medium text-blink-dark">Upload {activeModeConfig.secondaryLabel}</p>
                        <p className="text-xs text-gray-400 mt-1">Full body or mid-shot of the model</p>
                    </div>
                )}
                <input ref={secondaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "secondary")} />
            </div>

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                    <div>
                        <label className="text-sm font-bold text-blink-dark">Editorial Vibe</label>
                        <p className="text-xs text-gray-500 mt-1 max-w-md">
                            Describe the setting and the model's movement (e.g., walking down a runway, natural street style).
                        </p>
                    </div>
                    <button
                        onClick={handleAISuggest}
                        disabled={isSuggesting}
                        className="text-xs text-pink-600 hover:bg-pink-50 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-pink-200 transition-colors shadow-sm bg-white shrink-0"
                    >
                        {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                        {isSuggesting ? "Writing..." : "AI Suggest Vibe"}
                    </button>
                </div>

                <div className="relative">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g., A cinematic shot of the model walking confidently down a sunlit city street, fabric flowing beautifully..."
                        className="resize-none border-gray-300 focus-visible:ring-pink-500 text-sm p-4 bg-gray-50"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-gray-400">
                        <Info className="h-3.5 w-3.5" /> Focus on environment and fabric motion
                    </div>
                </div>
            </div>
        </div>
    );
}