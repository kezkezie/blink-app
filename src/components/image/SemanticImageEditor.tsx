"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
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
        return <div className="p-10 text-center text-gray-500">No image found to edit.</div>;
    }

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-300">

            {/* ─── LEFT PANEL: THE JSON SIDEBAR ─── */}
            <div className="w-[380px] shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-base font-bold text-blink-dark flex items-center gap-2">
                        <Box className="w-5 h-5 text-purple-600" /> JSON Object Control
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Modify object properties to force deterministic edits.</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">

                    {!schema ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                            <ScanSearch className="w-12 h-12 text-purple-200 mb-4" />
                            <h3 className="font-bold text-gray-700 mb-2">Scan Image Geometry</h3>
                            <p className="text-xs text-gray-500 mb-6">Run an X-Ray on this image to break it down into editable JSON layers.</p>
                            <Button
                                onClick={handleExtractJSON}
                                disabled={isExtracting}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md"
                            >
                                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ScanSearch className="w-4 h-4 mr-2" />}
                                X-Ray Image
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">

                            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                                <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1">
                                    <Wand2 className="w-3 h-3" /> Global Environment
                                </h3>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 mb-1 block">Lighting & Weather</label>
                                    <Input
                                        value={schema.lighting_and_weather}
                                        onChange={(e) => setSchema({ ...schema, lighting_and_weather: e.target.value })}
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1 mb-2">Detected Objects</h3>

                                {schema.objects.map((obj) => {
                                    const isExpanded = expandedObjectId === obj.id;
                                    const isTextObject = obj.type === "text"; // ✨ Check if this is text

                                    return (
                                        <div key={obj.id} className={cn("border rounded-xl transition-all duration-200 bg-white overflow-hidden", isExpanded ? "border-purple-300 shadow-md" : "border-gray-200 hover:border-purple-200")}>

                                            <button
                                                onClick={() => setExpandedObjectId(isExpanded ? null : obj.id)}
                                                className="w-full p-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-3 h-3 rounded-full border border-gray-200 shadow-inner" style={{ backgroundColor: obj.color }}></div>
                                                    <span className="text-sm font-bold text-gray-700 text-left">{obj.name}</span>
                                                    {isTextObject && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">Text</span>}
                                                </div>
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 border-t border-gray-100 bg-gray-50/30 space-y-4 animate-in slide-in-from-top-2">

                                                    {/* ✨ UPDATED: Logic to show Text Content and Font instead of Material for text types */}
                                                    {isTextObject ? (
                                                        <div className="space-y-3">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><ALargeSmall className="w-3 h-3" /> Text Content (Words)</label>
                                                                <Input
                                                                    value={obj.text_content || ""}
                                                                    onChange={(e) => updateObject(obj.id, "text_content", e.target.value)}
                                                                    className="h-9 text-xs bg-white shadow-sm font-bold"
                                                                    placeholder="Type the text you want AI to render..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Wand2 className="w-3 h-3" /> Font Style Description</label>
                                                                <Input
                                                                    value={obj.font_style || ""}
                                                                    onChange={(e) => updateObject(obj.id, "font_style", e.target.value)}
                                                                    className="h-8 text-xs bg-white shadow-sm"
                                                                    placeholder="e.g., Bold Serif, Technical Sans Serif..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Palette className="w-3 h-3" /> Text Color</label>
                                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md p-1 shadow-sm">
                                                                    <input
                                                                        type="color"
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                                                                    />
                                                                    <Input
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="h-6 border-0 text-xs font-mono p-0 focus-visible:ring-0"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Standard Object Controls */
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Palette className="w-3 h-3" /> Hex Color</label>
                                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md p-1 shadow-sm">
                                                                    <input
                                                                        type="color"
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                                                                    />
                                                                    <Input
                                                                        value={obj.color}
                                                                        onChange={(e) => updateObject(obj.id, "color", e.target.value)}
                                                                        className="h-6 border-0 text-xs font-mono p-0 focus-visible:ring-0"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><Type className="w-3 h-3" /> Material / Texture</label>
                                                                <Input
                                                                    value={obj.material}
                                                                    onChange={(e) => updateObject(obj.id, "material", e.target.value)}
                                                                    className="h-8 text-xs bg-white shadow-sm"
                                                                    placeholder="e.g., Velvet, Matte"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Object Replacement Dropzone (V2 Critical) */}
                                                    <div className="pt-2 border-t border-gray-100">
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 block flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Replace Object (Optional)</label>

                                                        {replacementPreviews[obj.id] ? (
                                                            <div className="relative h-24 rounded-lg border border-purple-200 bg-purple-50 p-1 flex items-center justify-center overflow-hidden group">
                                                                <img src={replacementPreviews[obj.id]} className="max-h-full max-w-full object-contain rounded" />
                                                                <button onClick={() => removeReplacementImage(obj.id)} className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center py-0.5 font-bold">Replacement Set</div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                onClick={() => fileInputRefs.current[obj.id]?.click()}
                                                                className="h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-white hover:bg-purple-50 hover:border-purple-300 cursor-pointer transition-colors"
                                                            >
                                                                <Upload className="w-4 h-4 text-gray-400 mb-1" />
                                                                <span className="text-[9px] font-medium text-gray-500">Upload replacement image</span>
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

                <div className="p-4 border-t border-gray-200 bg-white">
                    <Button
                        onClick={handleApplyEdits}
                        disabled={!schema || isGenerating}
                        className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white font-bold h-11 shadow-md"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                        {isGenerating ? "Rendering Edit..." : "Apply JSON Edits"}
                    </Button>
                </div>
            </div>

            {/* ─── RIGHT PANEL: THE CANVAS ─── */}
            <div className="flex-1 bg-gray-900 rounded-2xl shadow-inner border border-gray-200 relative overflow-hidden flex items-center justify-center">
                <img src={imageUrl} className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 pointer-events-none scale-110" />
                <img src={imageUrl} className="relative z-10 max-w-full max-h-full object-contain drop-shadow-2xl" />

                {isGenerating && (
                    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-purple-500 rounded-full blur-xl animate-pulse opacity-50"></div>
                            <Loader2 className="w-12 h-12 text-white animate-spin relative z-10" />
                        </div>
                        <p className="text-white font-bold tracking-widest uppercase text-sm animate-pulse">Applying JSON Control Hack...</p>
                    </div>
                )}
            </div>

        </div>
    );
}