"use client";

import { useState } from "react";
import { Upload, X, UserCircle, Sparkles, Loader2, Info, FolderOpen, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

interface ExtendedSetupProps extends VideoSetupProps {
    aspectRatio?: string;
    setAspectRatio?: (val: string) => void;
}

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
    aspectRatio = "9:16",
    setAspectRatio,
    isSuggesting,
    handleAISuggest,
    activeModeConfig,
}: ExtendedSetupProps) {
    const [libraryTarget, setLibraryTarget] = useState<"primary" | "secondary" | null>(null);

    const handleLibrarySelect = (url: string) => {
        if (libraryTarget === "primary") {
            setPrimaryFile(null);
            setPrimaryPreview(url);
        } else if (libraryTarget === "secondary") {
            setSecondaryFile(null);
            setSecondaryPreview(url);
        }
        setLibraryTarget(null);
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
                        <img src={primaryPreview} alt="Primary" className="w-full h-full object-contain p-4 relative z-10 drop-shadow-2xl" />
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
                            <Upload className="h-10 w-10 text-[#57707A] mb-4 group-hover/card:text-[#C5BAC4] transition-colors" />
                            <p className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">Upload {activeModeConfig.primaryLabel}</p>
                            <p className="text-[10px] text-[#989DAA] mt-1.5 font-medium">PNG or JPG of the product</p>
                        </div>
                        <button
                            onClick={() => setLibraryTarget("primary")}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4]/20 py-2.5 rounded-xl border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors shadow-sm"
                        >
                            <FolderOpen className="h-3.5 w-3.5" /> Select from Library
                        </button>
                    </div>
                )}
                <input ref={primaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Secondary Image (Influencer Face) */}
            {activeModeConfig.secondaryLabel && (
                <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg space-y-4 hover:border-[#C5BAC4]/50 transition-colors group/card">
                    <label className="text-sm font-bold text-[#DEDCDC] flex items-center justify-between font-display tracking-wide">
                        {activeModeConfig.secondaryLabel}
                        <span className="text-[10px] font-bold text-[#989DAA] bg-[#191D23] border border-[#57707A]/40 px-2.5 py-1 rounded-md uppercase tracking-wider">
                            Optional
                        </span>
                    </label>
                    {secondaryPreview ? (
                        <div className="relative aspect-square rounded-xl border border-[#57707A]/40 bg-[#191D23] overflow-hidden group shadow-inner">
                            <img src={secondaryPreview} alt="Secondary" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                            <button
                                onClick={() => { setSecondaryFile(null); setSecondaryPreview(null); }}
                                className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full shadow-md hover:bg-red-500 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all z-20"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div
                                onClick={() => secondaryInputRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer transition-all text-center p-6 shadow-inner"
                            >
                                <UserCircle className="h-10 w-10 text-[#57707A] mb-4 group-hover/card:text-[#C5BAC4] transition-colors" />
                                <p className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">Upload {activeModeConfig.secondaryLabel}</p>
                                <p className="text-[10px] text-[#989DAA] mt-1.5 font-medium">Clear, front-facing portrait</p>
                            </div>
                            <button
                                onClick={() => setLibraryTarget("secondary")}
                                className="w-full flex items-center justify-center gap-2 text-xs font-bold text-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4]/20 py-2.5 rounded-xl border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors shadow-sm"
                            >
                                <FolderOpen className="h-3.5 w-3.5" /> Select from Library
                            </button>
                        </div>
                    )}
                    <input ref={secondaryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, "secondary")} />
                </div>
            )}

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg relative overflow-hidden flex flex-col">
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <label className="text-sm font-bold text-[#DEDCDC] font-display tracking-wide">Viral Hook & Action</label>
                        <p className="text-xs text-[#989DAA] mt-1.5 max-w-md font-medium leading-relaxed">
                            Describe the action, camera movement, and spoken dialogue. Our AI will automatically combine your Product and Influencer into a seamless video.
                        </p>
                    </div>

                    {/* ✨ STANDALONE ASPECT RATIO & SUGGEST BUTTON ✨ */}
                    <div className="flex items-center gap-3 shrink-0">
                        {setAspectRatio && (
                            <select
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="text-xs font-bold text-[#f472b6] bg-[#191D23] border border-[#f472b6]/30 px-3 py-2 rounded-xl cursor-pointer hover:border-[#f472b6]/60 transition-colors appearance-none shadow-sm outline-none h-10"
                            >
                                <option value="9:16">📐 9:16 (TikTok/Reels)</option>
                                <option value="16:9">📐 16:9 (YouTube)</option>
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
                        placeholder="e.g., 'Stop scrolling! If you struggle with organizing your messy room, you need to see this...'"
                        className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] text-sm p-4 rounded-t-xl rounded-b-none shadow-inner custom-scrollbar"
                    />

                    {/* DYNAMIC TOOLBAR (Without Aspect Ratio) */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#191D23] border-x border-b border-[#57707A]/40 rounded-b-xl shrink-0">
                        <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>

                        {/* Camera */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#C5BAC4] bg-[#2A2F38] border border-[#C5BAC4]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🎥 Camera</option>
                            <option value=" Cinematic tracking shot, ">Cinematic Tracking</option>
                            <option value=" Handheld shaky cam, ">Handheld Shaky</option>
                            <option value=" Extreme macro close-up, ">Macro Close-up</option>
                        </select>

                        {/* Sound FX */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#B3FF00] bg-[#2A2F38] border border-[#B3FF00]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#B3FF00]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🔊 Sound FX</option>
                            <option value=" [ambient street noise] ">Street Noise</option>
                            <option value=" [cinematic bass drop] ">Bass Drop</option>
                            <option value=" [whoosh transition] ">Whoosh Transition</option>
                        </select>

                        {/* Physics */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#00E5FF] bg-[#2A2F38] border border-[#00E5FF]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#00E5FF]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🌌 Physics</option>
                            <option value=" Zero-gravity environment, objects floating gracefully. ">Zero-Gravity</option>
                            <option value=" Extreme slow-motion, 120fps. ">Epic Slow-Motion</option>
                        </select>

                        <div className="flex-1"></div>

                        {/* Dialogue Helper */}
                        <button
                            onClick={() => setPrompt((prompt || "") + '\nInfluencer (excited, English): "Type exact dialogue here" ')}
                            className="inline-flex items-center text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-sm text-[#DEDCDC] bg-[#2A2F38] hover:bg-[#57707A]/30 border border-[#57707A]/50 hover:border-[#DEDCDC]/50"
                            title="Inserts TTS dialogue format"
                        >
                            <MessageSquare className="w-3 h-3 mr-1.5 text-[#57707A]" /> TTS Dialogue
                        </button>
                    </div>
                </div>
            </div>

            <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} />
        </div>
    );
}