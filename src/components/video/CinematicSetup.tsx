"use client";

import { useState } from "react";
import { Upload, X, Sparkles, Loader2, Info, ShoppingBag, FolderOpen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

interface ExtendedSetupProps extends VideoSetupProps {
    aspectRatio?: string;
    setAspectRatio?: (val: string) => void;
}

export function CinematicSetup({
    primaryPreview,
    setPrimaryFile,
    setPrimaryPreview,
    primaryInputRef,
    handleFileSelect,
    prompt,
    setPrompt,
    aspectRatio = "16:9",
    setAspectRatio,
    isSuggesting,
    handleAISuggest,
    activeModeConfig,
}: ExtendedSetupProps) {
    const [libraryOpen, setLibraryOpen] = useState(false);

    const handleLibrarySelect = (url: string) => {
        setPrimaryFile(null);
        setPrimaryPreview(url);
        setLibraryOpen(false);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
            {/* Primary Image (Product) */}
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
                            <ShoppingBag className="h-10 w-10 text-[#57707A] mb-4 group-hover/card:text-[#C5BAC4] transition-colors" />
                            <p className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">Upload {activeModeConfig.primaryLabel}</p>
                            <p className="text-[10px] text-[#989DAA] mt-1.5 font-medium">Clean product shot on transparent background</p>
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

            {/* Cinematic Tips Card */}
            <div className="bg-[#191D23] rounded-2xl border border-[#C5BAC4]/30 p-6 shadow-inner space-y-4 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5BAC4]/5 blur-[50px] rounded-full pointer-events-none"></div>
                <div className="flex items-center gap-2 text-[#C5BAC4] relative z-10">
                    <Info className="h-5 w-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">Cinematic Tips</span>
                </div>
                <ul className="text-xs text-[#989DAA] space-y-3 list-disc list-inside relative z-10 font-medium leading-relaxed">
                    <li>Use a clean, high-res product image for best results.</li>
                    <li>The AI will create dynamic camera movement around your product.</li>
                    <li>Transparent PNG backgrounds give the cleanest cinematic look.</li>
                    <li>Describe the mood, lighting, and environment in your prompt.</li>
                </ul>
            </div>

            {/* Director's Prompt & Toolbar */}
            <div className="md:col-span-2 bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg relative overflow-hidden flex flex-col">

                {/* ✨ HEADER WITH NEW DROPDOWN PLACEMENT ✨ */}
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <label className="text-sm font-bold text-[#DEDCDC] font-display tracking-wide">Cinematic Vision</label>
                        <p className="text-xs text-[#989DAA] mt-1.5 max-w-md font-medium leading-relaxed">
                            Describe the camera movement, lighting, and atmosphere for your product showcase.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {/* Standalone Aspect Ratio Dropdown */}
                        {setAspectRatio && (
                            <select
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="text-xs font-bold text-[#f472b6] bg-[#191D23] border border-[#f472b6]/30 px-3 py-2 rounded-xl cursor-pointer hover:border-[#f472b6]/60 transition-colors appearance-none shadow-sm outline-none h-10"
                            >
                                <option value="16:9">📐 16:9 (Landscape)</option>
                                <option value="9:16">📐 9:16 (Vertical)</option>
                                <option value="1:1">📐 1:1 (Square)</option>
                                <option value="21:9">📐 21:9 (Cinematic)</option>
                            </select>
                        )}

                        <button
                            onClick={handleAISuggest}
                            disabled={isSuggesting}
                            className="text-xs text-[#191D23] bg-[#C5BAC4] hover:bg-white font-bold flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all shadow-md shadow-[#C5BAC4]/10 h-10"
                        >
                            {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
                            {isSuggesting ? "Writing..." : "AI Suggest Concept"}
                        </button>
                    </div>
                </div>

                <div className="relative flex-1 flex flex-col">
                    <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        placeholder="e.g., A dramatic 360° orbit around the product on a sleek reflective surface, moody studio lighting with volumetric fog..."
                        className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] text-sm p-4 rounded-t-xl rounded-b-none shadow-inner custom-scrollbar"
                    />

                    {/* DYNAMIC TOOLBAR (No Aspect Ratio) */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#191D23] border-x border-b border-[#57707A]/40 rounded-b-xl shrink-0">
                        <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>

                        {/* Camera Injection */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#C5BAC4] bg-[#2A2F38] border border-[#C5BAC4]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🎥 Camera</option>
                            <option value=" Cinematic tracking shot, ">Cinematic Tracking</option>
                            <option value=" Smooth dolly-in, ">Smooth Dolly-in</option>
                            <option value=" Slow orbit around, ">Slow Orbit</option>
                        </select>

                        {/* Sound FX Injection */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#B3FF00] bg-[#2A2F38] border border-[#B3FF00]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#B3FF00]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🔊 Sound FX</option>
                            <option value=" [cinematic bass drop] ">Bass Drop</option>
                            <option value=" [whoosh transition] ">Whoosh Transition</option>
                        </select>

                        {/* Physics Injection */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#00E5FF] bg-[#2A2F38] border border-[#00E5FF]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#00E5FF]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🌌 Physics</option>
                            <option value=" Zero-gravity environment, objects floating gracefully. ">Zero-Gravity</option>
                            <option value=" Epic slow-motion, 120fps. ">Slow-Motion</option>
                        </select>
                    </div>
                </div>
            </div>

            <AssetSelectionModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
        </div>
    );
}