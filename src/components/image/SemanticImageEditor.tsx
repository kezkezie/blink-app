"use client";

import { useState, useRef, } from "react";
import { useRouter } from "next/navigation";
import { useClient } from "@/hooks/useClient";
import {
    ScanSearch,
    Loader2,
    Wand2,
    Upload,
    X,
    Palette,
    Box,
    Type,
    Image as ImageIcon,
    ChevronDown,
    ChevronUp,
    ALargeSmall // ✨ NEW: Icon for text content
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ✨ UPDATED: SemanticObject schema to include text properties
export interface SemanticObject {
    id: string;
    name: string;
    color: string;
    material: string;
    type: string;
    text_content?: string; // ✨ NEW: The actual words
    font_style?: string; // ✨ NEW: Font style description (e.g., "Bold Sans Serif")
}

export interface SemanticSchema {
    scene_description: string;
    lighting_and_weather: string;
    objects: SemanticObject[];
}

interface SemanticImageEditorProps {
    contentId: string;
    initialImageUrl: string | null;
}

export function SemanticImageEditor({ contentId, initialImageUrl }: SemanticImageEditorProps) {
    const router = useRouter();
    const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
    const [schema, setSchema] = useState<SemanticSchema | null>(null);
    const { clientId } = useClient(); // ✨ Get the active user's ID

    const [isExtracting, setIsExtracting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const [expandedObjectId, setExpandedObjectId] = useState<string | null>(null);
    const [replacementImages, setReplacementImages] = useState<Record<string, File>>({});
    const [replacementPreviews, setReplacementPreviews] = useState<Record<string, string>>({});

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // 🧠 1. X-RAY FUNCTION (Calls updated n8n X-Ray flow)
    const handleExtractJSON = async () => {
        if (!imageUrl) return;
        setIsExtracting(true);

        try {
            const res = await fetch("/api/video/nano-banana", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: clientId,
                    mode: "scene_video_generator",
                    video_mode: "xray_image",
                    primary_image_url: imageUrl
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Failed to extract JSON schema.");

            if (data.schema && data.schema.objects) {
                setSchema(data.schema);
                if (data.schema.objects.length > 0) {
                    setExpandedObjectId(data.schema.objects[0].id);
                }
            } else {
                throw new Error("Invalid schema format returned from AI.");
            }

        } catch (err: any) {
            alert(`X-Ray Failed: ${err.message}`);
        } finally {
            setIsExtracting(false);
        }
    };

    const updateObject = (id: string, field: keyof SemanticObject, value: string) => {
        if (!schema) return;
        setSchema({
            ...schema,
            objects: schema.objects.map(obj =>
                obj.id === id ? { ...obj, [field]: value } : obj
            )
        });
    };

    const handleReplaceImageUpload = (id: string, file: File) => {
        if (!file) return;
        setReplacementImages(prev => ({ ...prev, [id]: file }));

        const reader = new FileReader();
        reader.onload = (e) => {
            setReplacementPreviews(prev => ({ ...prev, [id]: e.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const removeReplacementImage = (id: string) => {
        setReplacementImages(prev => {
            const newImages = { ...prev };
            delete newImages[id];
            return newImages;
        });
        setReplacementPreviews(prev => {
            const newPreviews = { ...prev };
            delete newPreviews[id];
            return newPreviews;
        });
    };

    // 🧠 2. APPLY EDITS (Sends updated text JSON to n8n)
    const handleApplyEdits = async () => {
        if (!schema || !imageUrl) return;
        setIsGenerating(true);

        try {
            const uploadedReplacementUrls: Record<string, string> = {};
            for (const [objId, file] of Object.entries(replacementImages)) {
                const path = `edits/replacement_${Date.now()}_${file.name}`;
                await supabase.storage.from("assets").upload(path, file);
                uploadedReplacementUrls[objId] = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
            }

            const res = await fetch("/api/video/nano-banana", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "scene_video_generator",
                    video_mode: "json_image_edit",
                    post_id: contentId,
                    primary_image_url: imageUrl,
                    json_schema: schema,
                    replacements: uploadedReplacementUrls
                })
            });

            if (!res.ok) throw new Error("Failed to trigger image edit");

            alert("✨ Image successfully updated! Redirecting to post...");
            router.push(`/dashboard/content/${contentId}`);

        } catch (err: any) {
            alert(`Edit generation failed: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!imageUrl) {
        return <div className="p-10 text-center text-[#57707A] font-bold uppercase tracking-widest text-xs">No image found to edit.</div>;
    }

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">

            {/* ─── LEFT PANEL: THE JSON SIDEBAR ─── */}
            <div className="w-[420px] shrink-0 bg-[#2A2F38] border border-[#57707A]/30 rounded-2xl shadow-xl flex flex-col overflow-hidden relative">
                {/* Subtle top glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#C5BAC4]/5 blur-[60px] rounded-full pointer-events-none" />

                <div className="p-5 border-b border-[#57707A]/20 bg-[#191D23]/40 relative z-10">
                    <h2 className="text-base font-bold text-[#DEDCDC] flex items-center gap-2.5 font-display">
                        <Box className="w-5 h-5 text-[#C5BAC4]" /> JSON Object Control
                    </h2>
                    <p className="text-xs text-[#989DAA] mt-1.5 font-medium leading-relaxed">Modify object properties to force deterministic edits.</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 relative z-10">

                    {!schema ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                            <div className="w-20 h-20 bg-[#191D23] border border-[#57707A]/30 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                                <ScanSearch className="w-10 h-10 text-[#C5BAC4]" />
                            </div>
                            <h3 className="font-bold text-[#DEDCDC] mb-2 font-display text-lg">Scan Image Geometry</h3>
                            <p className="text-xs text-[#989DAA] mb-8 max-w-[250px] leading-relaxed">Run an X-Ray on this image to break it down into editable JSON layers.</p>
                            <Button
                                onClick={handleExtractJSON}
                                disabled={isExtracting}
                                className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-lg shadow-[#C5BAC4]/10 h-12 rounded-xl transition-all"
                            >
                                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ScanSearch className="w-4 h-4 mr-2" />}
                                {isExtracting ? "Scanning Pixels..." : "X-Ray Image"}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">

                            <div className="p-5 bg-[#191D23] border border-[#57707A]/40 rounded-xl space-y-3 shadow-inner">
                                <h3 className="text-[10px] font-bold text-[#C5BAC4] uppercase tracking-widest flex items-center gap-1.5">
                                    <Wand2 className="w-3.5 h-3.5" /> Global Environment
                                </h3>
                                <div>
                                    <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Lighting & Weather</label>
                                    <Input
                                        value={schema.lighting_and_weather}
                                        onChange={(e) => setSchema({ ...schema, lighting_and_weather: e.target.value })}
                                        className="h-10 text-xs bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] focus-visible:ring-[#C5BAC4] rounded-lg shadow-inner"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest pl-1 mb-2">Detected Objects</h3>

                                {schema.objects.map((obj) => {
                                    const isExpanded = expandedObjectId === obj.id;
                                    const isTextObject = obj.type === "text"; // ✨ Check if this is text

                                    return (
                                        <div key={obj.id} className={cn("border rounded-xl transition-all duration-200 overflow-hidden", isExpanded ? "border-[#C5BAC4]/50 shadow-md bg-[#191D23]" : "border-[#57707A]/30 bg-[#191D23]/50 hover:border-[#57707A]/80 hover:bg-[#191D23]")}>

                                            <button
                                                onClick={() => setExpandedObjectId(isExpanded ? null : obj.id)}
                                                className="w-full p-4 flex items-center justify-between transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3.5 h-3.5 rounded-full border border-[#57707A]/50 shadow-inner" style={{ backgroundColor: obj.color }}></div>
                                                    <span className="text-sm font-bold text-[#DEDCDC] text-left">{obj.name}</span>
                                                    {isTextObject && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#C5BAC4]/10 text-[#C5BAC4] border border-[#C5BAC4]/30">Text</span>}
                                                </div>
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-[#C5BAC4]" /> : <ChevronDown className="w-4 h-4 text-[#57707A]" />}
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 border-t border-[#57707A]/20 bg-[#2A2F38]/30 space-y-4 animate-in slide-in-from-top-2">

                                                    {/* ✨ UPDATED: Logic to show Text Content and Font instead of Material for text types */}
                                                    {isTextObject ? (
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><ALargeSmall className="w-3.5 h-3.5 text-[#C5BAC4]" /> Text Content (Words)</label>
                                                                <Input
                                                                    value={obj.text_content || ""}
                                                                    onChange={(e) => updateObject(obj.id, "text_content", e.target.value)}
                                                                    className="h-10 text-xs bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-inner font-bold focus-visible:ring-[#C5BAC4] rounded-lg"
                                                                    placeholder="Type the text you want AI to render..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-[#C5BAC4]" /> Font Style Description</label>
                                                                <Input
                                                                    value={obj.font_style || ""}
                                                                    onChange={(e) => updateObject(obj.id, "font_style", e.target.value)}
                                                                    className="h-10 text-xs bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-inner focus-visible:ring-[#C5BAC4] rounded-lg"
                                                                    placeholder="e.g., Bold Serif, Technical Sans Serif..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-[#C5BAC4]" /> Text Color</label>
                                                                <div className="flex items-center gap-2 bg-[#2A2F38] border border-[#57707A]/50 rounded-lg p-1.5 shadow-inner focus-within:ring-1 focus-within:ring-[#C5BAC4]">
                                                                    <input
                                                                        type="color"
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="w-8 h-8 rounded-md cursor-pointer border-0 p-0 color-picker-custom"
                                                                    />
                                                                    <Input
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="h-8 border-0 text-xs font-mono p-0 focus-visible:ring-0 bg-transparent text-[#DEDCDC]"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Standard Object Controls */
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5 text-[#C5BAC4]" /> Hex Color</label>
                                                                <div className="flex items-center gap-2 bg-[#2A2F38] border border-[#57707A]/50 rounded-lg p-1.5 shadow-inner focus-within:ring-1 focus-within:ring-[#C5BAC4]">
                                                                    <input
                                                                        type="color"
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="w-8 h-8 rounded-md cursor-pointer border-0 p-0 color-picker-custom"
                                                                    />
                                                                    <Input
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="h-8 border-0 text-xs font-mono p-0 focus-visible:ring-0 bg-transparent text-[#DEDCDC]"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Type className="w-3.5 h-3.5 text-[#C5BAC4]" /> Material / Texture</label>
                                                                <Input
                                                                    value={obj.material}
                                                                    onChange={(e) => updateObject(obj.id, "material", e.target.value)}
                                                                    className="h-[44px] text-xs bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-inner focus-visible:ring-[#C5BAC4] rounded-lg"
                                                                    placeholder="e.g., Velvet, Matte"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Object Replacement Dropzone (V2 Critical) */}
                                                    <div className="pt-4 border-t border-[#57707A]/20 mt-4">
                                                        <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-[#C5BAC4]" /> Replace Object (Optional)</label>

                                                        {replacementPreviews[obj.id] ? (
                                                            <div className="relative h-28 rounded-xl border border-[#C5BAC4]/30 bg-[#C5BAC4]/5 p-1 flex items-center justify-center overflow-hidden group shadow-inner">
                                                                <img src={replacementPreviews[obj.id]} className="max-h-full max-w-full object-contain rounded-lg" />
                                                                <button onClick={() => removeReplacementImage(obj.id)} className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/90 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:scale-110">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                                <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-[#C5BAC4] font-bold uppercase tracking-widest text-center py-1">Replacement Set</div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                onClick={() => fileInputRefs.current[obj.id]?.click()}
                                                                className="h-24 border-2 border-dashed border-[#57707A]/50 rounded-xl flex flex-col items-center justify-center bg-[#2A2F38]/50 hover:bg-[#C5BAC4]/10 hover:border-[#C5BAC4]/50 cursor-pointer transition-all"
                                                            >
                                                                <Upload className="w-5 h-5 text-[#57707A] mb-1.5" />
                                                                <span className="text-[10px] font-bold text-[#989DAA] uppercase tracking-widest">Upload replacement image</span>
                                                            </div>
                                                        )}
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept="image/*"
                                                            ref={(el) => { fileInputRefs.current[obj.id] = el; }}
                                                            onChange={(e) => {
                                                                if (e.target.files?.[0]) handleReplaceImageUpload(obj.id, e.target.files[0]);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-[#57707A]/30 bg-[#191D23]/40 relative z-10 shrink-0">
                    <Button
                        onClick={handleApplyEdits}
                        disabled={!schema || isGenerating}
                        className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Wand2 className="w-5 h-5 mr-2" />}
                        {isGenerating ? "Rendering Edit..." : "Apply JSON Edits"}
                    </Button>
                </div>
            </div>

            {/* ─── RIGHT PANEL: THE CANVAS ─── */}
            <div className="flex-1 bg-[#0F1115] rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-[#57707A]/40 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-5 pointer-events-none"></div>
                <img src={imageUrl} className="absolute inset-0 w-full h-full object-cover blur-[50px] opacity-30 pointer-events-none scale-110" />
                <img src={imageUrl} className="relative z-10 max-w-full max-h-full object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.8)]" />

                {isGenerating && (
                    <div className="absolute inset-0 z-20 bg-[#191D23]/80 backdrop-blur-md animate-in fade-in flex flex-col items-center justify-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-xl bg-[#C5BAC4]/20 animate-pulse"></div>
                            <Loader2 className="w-12 h-12 text-[#C5BAC4] animate-spin relative z-10" />
                        </div>
                        <p className="text-sm font-bold text-[#DEDCDC] uppercase tracking-wider animate-pulse font-display">AI is modifying pixels...</p>
                    </div>
                )}
            </div>

        </div>
    );
}