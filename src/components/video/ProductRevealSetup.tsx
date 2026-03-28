"use client";

import { useState } from "react";
import { Upload, X, Sparkles, Loader2, Info, Zap, FolderOpen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

export function ProductRevealSetup({
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
            {/* Primary Image (Product PNG) */}
            <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg space-y-4 hover:border-[#C5BAC4]/50 transition-colors group/card">
                <label className="text-sm font-bold text-[#DEDCDC] flex items-center justify-between font-display tracking-wide">
                    {activeModeConfig.primaryLabel}
                    <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md uppercase tracking-wider">
                        Required
                    </span>
                </label>
                {primaryPreview ? (
                    <div className="relative aspect-square rounded-xl border border-[#57707A]/40 bg-[#191D23] overflow-hidden group shadow-inner">
                        <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                        <img src={primaryPreview} alt="Product" className="w-full h-full object-contain p-4 relative z-10 drop-shadow-2xl" />
                        <button
                            onClick={() => { setPrimaryFile(null); setPrimaryPreview(null); }}
                            className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full shadow-md hover:bg-red-500 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all z-20"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div
                            onClick={() => primaryInputRef.current?.click()}
                            className="aspect-square rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer transition-all text-center p-6 shadow-inner"
                        >
                            <Zap className="h-10 w-10 text-[#57707A] mb-4 group-hover/card:text-[#C5BAC4] transition-colors" />
                            <p className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">Upload {activeModeConfig.primaryLabel}</p>
                            <p className="text-[10px] text-[#989DAA] mt-1.5 font-medium">Use a transparent PNG for the best 3D reveal effect</p>
                        </div>
                        <button
                            onClick={() => setLibraryOpen(true)}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4]/20 py-2.5 rounded-xl border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors shadow-sm"
                        >
                            <FolderOpen className="h-3.5 w-3.5" /> Select from Library
                        </button>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Product Reveal Tips Card */}
            <div className="bg-[#191D23]/50 border border-[#B3FF00]/20 rounded-2xl p-6 shadow-lg flex flex-col justify-center relative overflow-hidden">
                {/* Subtle corner glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#B3FF00]/5 blur-[40px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />

                <div className="flex items-center gap-2.5 text-[#B3FF00] mb-5 relative z-10">
                    <Info className="h-5 w-5" />
                    <span className="text-sm font-bold font-display tracking-wide uppercase">Product Reveal Tips</span>
                </div>
                <ul className="text-xs text-[#989DAA] space-y-3.5 relative z-10 font-medium">
                    <li className="flex items-start gap-2">
                        <span className="text-[#B3FF00] mt-0.5 text-[10px]">■</span>
                        <span>Use a transparent PNG for the cleanest 3D motion effect</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-[#B3FF00] mt-0.5 text-[10px]">■</span>
                        <span>The AI will create dynamic motion graphics around your product</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-[#B3FF00] mt-0.5 text-[10px]">■</span>
                        <span>Works best with centered, high-resolution product images</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-[#B3FF00] mt-0.5 text-[10px]">■</span>
                        <span>Describe the energy, style, and colour palette you want in your prompt</span>
                    </li>
                </ul>
            </div>

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg space-y-5 relative overflow-hidden">
                <div className="flex justify-between items-start">
                    <div>
                        <label className="text-sm font-bold text-[#DEDCDC] font-display tracking-wide">Reveal Vision</label>
                        <p className="text-xs text-[#989DAA] mt-1.5 max-w-md font-medium leading-relaxed">
                            Describe the style, energy, and motion you envision for your product reveal.
                        </p>
                    </div>
                    <button
                        onClick={handleAISuggest}
                        disabled={isSuggesting}
                        className="text-xs text-[#191D23] bg-[#C5BAC4] hover:bg-white font-bold flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-[#C5BAC4]/10 shrink-0"
                    >
                        {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                        {isSuggesting ? "Writing..." : "AI Suggest"}
                    </button>
                </div>

                <div className="relative">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        placeholder="e.g., An explosive 3D product reveal with glowing particles, neon light trails, and a dynamic camera zoom — high energy, premium feel..."
                        className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] text-sm p-4 rounded-xl shadow-inner custom-scrollbar"
                    />
                    <div className="absolute bottom-3 right-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#57707A]">
                        <Info className="h-3.5 w-3.5" /> Focus on style & energy
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