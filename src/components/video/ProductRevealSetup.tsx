"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, Sparkles, Loader2, Info, Zap, FolderOpen, MessageSquare, Search, ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

interface ExtendedSetupProps extends VideoSetupProps {
    aspectRatio?: string;
    setAspectRatio?: (val: string) => void;
    duration?: string;
    setDuration?: (val: string) => void;
}

// ✨ THE PRO-LEVEL VFX LIBRARY ✨
const VFX_CATEGORIES = [
    {
        name: "🌌 Motion & Physics",
        items: [
            { label: "Anti-gravity float", value: " Slow anti-gravity drift with orbital motion. " },
            { label: "Magnetic attraction", value: " Magnetic attraction, fragmented pieces violently snapping together to form the product. " },
            { label: "Elastic bounce", value: " Soft elastic bounce physics. " },
            { label: "Slow-motion drop impact", value: " Extreme slow-motion drop with a heavy floor impact. " },
            { label: "Zero-gravity spin", value: " Zero-gravity spin with realistic inertia. " },
            { label: "Orbiting fragments", value: " Orbiting rings of fragmented debris circling the product. " },
            { label: "Time-freeze", value: " Cinematic time-freeze, everything pauses perfectly while the camera moves. " },
            { label: "Reverse physics", value: " Reversed physics: explosive shatter reversing into a pristine product. " },
        ]
    },
    {
        name: "💥 Destruction / Transformation",
        items: [
            { label: "Explosive shatter", value: " Explosive glass and metal shatter revealing the core. " },
            { label: "Dissolve into particles", value: " Smoothly dissolving into glowing digital particles. " },
            { label: "Liquid transition", value: " Melting liquid transition. " },
            { label: "Burn / scorch reveal", value: " Scorching fire burn-away revealing the product underneath. " },
            { label: "Morphing", value: " Surreal morphing transition into the product shape. " },
            { label: "Energy burst shockwave", value: " Massive energy burst and shockwave upon reveal. " },
        ]
    },
    {
        name: "✨ Energy & Light",
        items: [
            { label: "Neon light trails", value: " Glowing neon light trails rapidly wrapping around the product. " },
            { label: "Electric arcs", value: " Volatile electric arcs and lightning striking the surface. " },
            { label: "Energy aura pulse", value: " A pulsating, premium energy aura glowing from within. " },
            { label: "Holographic projection", value: " Futuristic flickering holographic projection. " },
            { label: "Laser scan lines", value: " High-tech laser scan lines sweeping vertically over the product. " },
            { label: "Volumetric god rays", value: " Cinematic volumetric god rays piercing through darkness. " },
            { label: "Lens flares", value: " Anamorphic lens flares and optical light leaks. " },
        ]
    },
    {
        name: "🌊 Fluid & Natural",
        items: [
            { label: "Water splash", value: " Ultra slow-motion hyper-realistic water splash. " },
            { label: "Smoke / mist reveal", value: " Thick cinematic smoke and rolling ground mist. " },
            { label: "Fire / flame trails", value: " Aggressive fire and flame trails following the motion. " },
            { label: "Sand / dust swirl", value: " A majestic swirl of glowing sand and dust. " },
            { label: "Liquid metal flow", value: " Premium liquid metal flowing and coating the surface. " },
            { label: "Ice formation", value: " Rapid frost spreading and ice crystal formation. " },
        ]
    },
    {
        name: "🧲 Environmental Interaction",
        items: [
            { label: "Surface cracking", value: " The ground surface cracking under the sheer weight of the product. " },
            { label: "Shockwave ripple", value: " A visible shockwave ripple distorting the air and floor. " },
            { label: "Mirror reflection", value: " Perfect glossy mirror reflection with water ripples. " },
            { label: "Wind interaction", value: " Heavy wind physics interacting with floating particles. " },
        ]
    },
    {
        name: "🧠 Digital / Futuristic",
        items: [
            { label: "Glitch distortion", value: " Aggressive chromatic aberration and digital glitch distortion. " },
            { label: "Wireframe transition", value: " 3D wireframe mesh transitioning seamlessly into a full photoreal render. " },
            { label: "HUD overlays", value: " Futuristic sci-fi HUD (Heads Up Display) graphic overlays. " },
            { label: "Data streams", value: " Matrix-style glowing data streams and code flowing. " },
            { label: "Pixel sorting", value: " Digital pixel sorting and data-moshing effects. " },
        ]
    }
];

export function ProductRevealSetup({
    primaryPreview,
    setPrimaryFile,
    setPrimaryPreview,
    primaryInputRef,
    handleFileSelect,
    prompt,
    setPrompt,
    aspectRatio = "16:9",
    setAspectRatio,
    duration = "5",
    setDuration,
    isSuggesting,
    handleAISuggest,
    activeModeConfig,
    aiEnhance: aiEnhanceProp,
    setAiEnhance: setAiEnhanceProp,
}: ExtendedSetupProps) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [aiEnhanceLocal, setAiEnhanceLocal] = useState(true);
    const aiEnhance = aiEnhanceProp ?? aiEnhanceLocal;
    const setAiEnhance = setAiEnhanceProp ?? setAiEnhanceLocal;

    // Custom Searchable Dropdown State
    const [vfxSearch, setVfxSearch] = useState("");
    const [vfxOpen, setVfxOpen] = useState(false);
    const vfxRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (vfxRef.current && !vfxRef.current.contains(event.target as Node)) {
                setVfxOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleLibrarySelect = (url: string) => {
        setPrimaryFile(null);
        setPrimaryPreview(url);
        setLibraryOpen(false);
    };

    // Filter VFX Categories based on search
    const filteredVFX = VFX_CATEGORIES.map(cat => ({
        ...cat,
        items: cat.items.filter(item => item.label.toLowerCase().includes(vfxSearch.toLowerCase()))
    })).filter(cat => cat.items.length > 0);

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
                <input ref={primaryInputRef} type="file" accept="image/png, image/webp" className="hidden" onChange={(e) => handleFileSelect(e, "primary")} />
            </div>

            {/* Product Reveal Tips Card */}
            <div className="bg-[#191D23]/50 border border-[#B3FF00]/20 rounded-2xl p-6 shadow-lg flex flex-col justify-center relative overflow-hidden">
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
                        <span>Combine VFX tags below to create complex cinematic sequences</span>
                    </li>
                </ul>
            </div>

            {/* Director's Prompt */}
            <div className="md:col-span-2 bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-lg space-y-5 relative overflow-hidden flex flex-col">

                {/* ✨ HEADER WITH DURATION & ASPECT RATIO ✨ */}
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <label className="text-sm font-bold text-[#DEDCDC] font-display tracking-wide">Reveal Vision</label>
                        <p className="text-xs text-[#989DAA] mt-1.5 max-w-md font-medium leading-relaxed">
                            Combine effects from the VFX library below to compose your shot.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0 justify-end">
                        {/* Duration Dropdown */}
                        {setDuration && (
                            <select
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className="text-xs font-bold text-[#FFB300] bg-[#191D23] border border-[#FFB300]/30 px-3 py-2 rounded-xl cursor-pointer hover:border-[#FFB300]/60 transition-colors appearance-none shadow-sm outline-none h-10"
                            >
                                <option value="5">⏱️ 5 Secs</option>
                                <option value="10">⏱️ 10 Secs</option>
                                <option value="15">⏱️ 15 Secs</option>
                            </select>
                        )}

                        {/* Aspect Ratio Dropdown */}
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
                        placeholder="e.g., A cinematic tracking shot. Explosive glass shatter reveals the product, followed by glowing neon light trails wrapping around it..."
                        className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] text-sm p-4 rounded-t-xl rounded-b-none shadow-inner custom-scrollbar"
                    />

                    {/* ✨ VFX DYNAMIC TOOLBAR ✨ */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#191D23] border-x border-b border-[#57707A]/40 rounded-b-xl shrink-0">
                        <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>

                        {/* Camera */}
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) { setPrompt((prompt || "") + e.target.value); e.target.value = ""; } }}
                            className="text-[10px] font-bold text-[#C5BAC4] bg-[#2A2F38] border border-[#C5BAC4]/30 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 transition-colors appearance-none shadow-sm"
                        >
                            <option value="" disabled hidden>🎥 Camera</option>
                            <option value=" Fast dynamic snap-zoom, ">Fast Snap-Zoom</option>
                            <option value=" Smooth 360-degree orbit, ">360 Orbit</option>
                            <option value=" Low-angle heroic tilt, ">Heroic Angle</option>
                        </select>

                        {/* ✨ THE CUSTOM SEARCHABLE VFX DROPDOWN ✨ */}
                        <div className="relative" ref={vfxRef}>
                            <button
                                type="button"
                                onClick={() => setVfxOpen(!vfxOpen)}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-[#00E5FF] bg-[#2A2F38] border border-[#00E5FF]/30 px-2.5 py-1.5 rounded-lg hover:border-[#00E5FF]/60 hover:bg-[#00E5FF]/10 transition-colors shadow-sm"
                            >
                                🌌 VFX/Physics <ChevronDown className="w-3 h-3 opacity-70" />
                            </button>

                            {vfxOpen && (
                                <div className="absolute bottom-full mb-2 left-0 w-[280px] sm:w-[320px] bg-[#191D23] border border-[#00E5FF]/40 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in slide-in-from-bottom-2 duration-200">
                                    <div className="p-2.5 border-b border-[#57707A]/40 flex items-center gap-2 bg-[#2A2F38]">
                                        <Search className="w-3.5 h-3.5 text-[#00E5FF]" />
                                        <input
                                            type="text"
                                            placeholder="Search pro effects..."
                                            autoFocus
                                            className="bg-transparent border-none text-[10px] font-bold text-[#DEDCDC] placeholder:text-[#57707A] focus:outline-none w-full"
                                            value={vfxSearch}
                                            onChange={(e) => setVfxSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5">
                                        {filteredVFX.length === 0 ? (
                                            <p className="text-center text-[10px] text-[#57707A] py-4">No effects found.</p>
                                        ) : (
                                            filteredVFX.map((category, idx) => (
                                                <div key={idx} className="mb-2">
                                                    <div className="px-2 py-1.5 text-[9px] font-black text-[#57707A] uppercase tracking-widest bg-[#191D23] sticky top-0 z-10">
                                                        {category.name}
                                                    </div>
                                                    {category.items.map((item, iIdx) => (
                                                        <button
                                                            key={iIdx}
                                                            type="button"
                                                            onClick={() => {
                                                                setPrompt((prompt || "") + item.value);
                                                                setVfxOpen(false);
                                                                setVfxSearch("");
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-[#DEDCDC] hover:bg-[#00E5FF]/10 hover:text-[#00E5FF] rounded-md transition-colors"
                                                        >
                                                            {item.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex-1"></div>

                        <button
                            onClick={() => setPrompt((prompt || "") + '\nVoiceover (confident, English): "Type exact slogan here" ')}
                            className="inline-flex items-center text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-sm text-[#DEDCDC] bg-[#2A2F38] hover:bg-[#57707A]/30 border border-[#57707A]/50 hover:border-[#DEDCDC]/50"
                            title="Inserts TTS Voiceover format"
                        >
                            <MessageSquare className="w-3 h-3 mr-1.5 text-[#57707A]" /> Add Voiceover
                        </button>
                    </div>
                </div>

                {/* ✨ AI PROMPT HELPER TOGGLE ✨ */}
                <div className="flex items-center justify-between p-4 bg-[#191D23] rounded-xl border border-[#57707A]/30 mb-6 mt-4 shadow-inner">
                  <div>
                    <h4 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display">
                      <Sparkles className="h-4 w-4 text-[#C5BAC4]" /> AI Prompt Helper
                    </h4>
                    <p className="text-xs text-[#989DAA] mt-1 leading-relaxed">
                      Let AI enhance your prompt for the engine, or turn OFF for raw manual control.
                    </p>
                  </div>
                  <Switch 
                    checked={aiEnhance} 
                    onCheckedChange={setAiEnhance} 
                    className="data-[state=checked]:bg-[#C5BAC4] data-[state=unchecked]:bg-[#57707A]"
                  />
                </div>
            </div>

            <AssetSelectionModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
        </div>
    );
}