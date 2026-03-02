"use client";

import { Upload, X, Sparkles, Loader2, Info, Camera } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
            {/* Product Image */}
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
                        <p className="text-xs text-gray-400 mt-1">High-quality product photo</p>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Cinematic Engine Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-indigo-100 p-6 flex flex-col justify-center space-y-3 shadow-inner">
                <div className="h-12 w-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm mb-2">
                    <Camera className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-blink-dark">Cinematic Engine Active</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                    This mode generates a photorealistic 16:9 widescreen commercial.
                    <br /><br />
                    Describe the <b>Camera Movement</b> and <b>Lighting</b> you want (e.g., slow macro pan, dramatic studio lighting, soft morning sun).
                </p>
            </div>

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                    <div>
                        <label className="text-sm font-bold text-blink-dark">Camera & Lighting Setup</label>
                        <p className="text-xs text-gray-500 mt-1">Our AI Director will expand your short concept into a highly detailed 40-word prompt.</p>
                    </div>
                    <button
                        onClick={handleAISuggest}
                        disabled={isSuggesting}
                        className="text-xs text-indigo-600 hover:bg-indigo-50 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 transition-colors shadow-sm bg-white shrink-0"
                    >
                        {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                        {isSuggesting ? "Writing..." : "AI Suggest Setup"}
                    </button>
                </div>

                <div className="relative">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        placeholder="e.g., Slow macro pan around the product. Dramatic studio lighting with dark shadows. Voiceover: 'Pure comfort.'"
                        className="resize-none border-gray-300 focus-visible:ring-indigo-500 text-sm p-4 bg-gray-50"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-gray-400">
                        <Info className="h-3.5 w-3.5" /> Voiceovers must be 6 words or less
                    </div>
                </div>
            </div>
        </div>
    );
}