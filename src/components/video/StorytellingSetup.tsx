"use client";

import { useState } from "react";
import { Upload, X, Sparkles, Loader2, GripVertical, Trash2, Plus, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, AlertCircle, Mic, Music } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { VideoSetupProps } from "./types";

const yellowLabBtnClass = "bg-[#f1c40f] hover:bg-[#d4ac0d] text-white shadow-md font-bold border-none";

export interface StorytellingSetupProps extends VideoSetupProps {
    bRollConcept: string;
    setBRollConcept: (val: string) => void;
    bRollScenes: any[];
    setBRollScenes: (scenes: any[]) => void;
    handleGenerateScenes: () => void;
    addEmptyScene: () => void;
    updateScene: (id: string, field: string, value: any) => void;
    removeScene: (id: string) => void;
}

const SCENE_MODES = [
    { id: "showcase", label: "Cinematic Pan" },
    { id: "logo_reveal", label: "3D Reveal" },
    { id: "ugc", label: "UGC Influencer" },
    { id: "clothing", label: "Clothing Try-On" },
    { id: "keyframe", label: "Keyframe (Start/End)" },
];

const VISUAL_STYLES = [
    { id: "cinematic", label: "Cinematic Realism" },
    { id: "3d_animation", label: "3D Animation (Pixar/Disney)" },
    { id: "anime", label: "2D Anime / Manga" },
    { id: "photoreal", label: "Photorealistic Photography" },
    { id: "claymation", label: "Stop-Motion Claymation" },
    { id: "cyberpunk", label: "Cyberpunk / Sci-Fi" },
    { id: "minimalist", label: "Minimalist Vector Art" }
];

export function StorytellingSetup({
    bRollConcept,
    setBRollConcept,
    bRollScenes,
    setBRollScenes,
    handleGenerateScenes,
    addEmptyScene,
    updateScene,
    removeScene,
    isSuggesting,
}: StorytellingSetupProps) {
    const { clientId } = useClient();

    const [framePrompt, setFramePrompt] = useState("");
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [loadingIndices, setLoadingIndices] = useState<number[]>([]);
    const [generatedFrames, setGeneratedFrames] = useState<string[]>([]);
    const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);

    const [frameReferenceFile, setFrameReferenceFile] = useState<File | null>(null);
    const [frameReferencePreview, setFrameReferencePreview] = useState<string | null>(null);
    const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
    const [isSuggestingFrame, setIsSuggestingFrame] = useState(false);
    const [inputMode, setInputMode] = useState<"master" | "manual">("master");
    const [selectedStyle, setSelectedStyle] = useState("cinematic");
    const [audioEngine, setAudioEngine] = useState<"video_native" | "openai_tts">("openai_tts");

    const getLabels = (mode: string) => {
        switch (mode) {
            case "keyframe": return { primary: "Start Frame", secondary: "End Frame" };
            case "ugc": return { primary: "Product Shot", secondary: "Influencer Face" };
            case "clothing": return { primary: "Garment Flatlay", secondary: "Model Reference" };
            case "logo_reveal": return { primary: "Logo/Product (PNG)", secondary: "End State (Opt)" };
            case "showcase":
            default: return { primary: "Start Frame", secondary: "End Frame (Opt)" };
        }
    };

    const uploadRefImage = async (): Promise<string | null> => {
        if (!frameReferenceFile || !clientId) return null;
        const ext = frameReferenceFile.name.split(".").pop();
        const path = `videos/${clientId}/story_ref_${Date.now()}.${ext}`;
        await supabase.storage.from("assets").upload(path, frameReferenceFile);
        return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
    };

    const callN8n = async (mode: 'director' | 'generator' | 'manual', body: any) => {
        const res = await fetch("/api/video/nano-banana", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, ...body })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error from ${mode} generator.`);
        return data;
    };

    const handleGenerateVisualStory = async () => {
        if (!bRollConcept.trim()) return alert("Please enter a concept first.");
        setIsGeneratingImages(true);

        setGeneratedFrames([]);
        setGeneratedAudioUrl(null);
        setLoadingIndices([0, 1, 2, 3]);

        try {
            let styleRefUrl = await uploadRefImage();
            let previousFrameUrl = null;

            // ✨ Calculate Total Sequence Duration for the AI Director
            let totalDuration = 0;
            if (bRollScenes.length > 0) {
                totalDuration = bRollScenes.reduce((sum, scene) => sum + parseInt(scene.duration || "5"), 0);
            } else {
                totalDuration = 20; // Default to 4 scenes x 5 seconds
            }

            const directorData = await callN8n('director', {
                prompt: bRollConcept,
                style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
                audioEngine: audioEngine,
                totalDuration: totalDuration // Pass it to n8n
            });

            if (directorData.audioUrl && clientId) {
                try {
                    const audioRes = await fetch(directorData.audioUrl);
                    const audioBlob = await audioRes.blob();
                    const localAudioUrl = URL.createObjectURL(audioBlob);
                    setGeneratedAudioUrl(localAudioUrl);

                    const audioPath = `audios/${clientId}/ai_voiceover_${Date.now()}.mp3`;
                    await supabase.storage.from("assets").upload(audioPath, audioBlob);
                    const audioPublicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

                    await supabase.from("content").insert({
                        client_id: clientId,
                        content_type: "generated_audio",
                        caption: `🎙️ AI Voiceover: ${bRollConcept.substring(0, 20)}...`,
                        status: "success",
                        image_urls: [audioPublicUrl],
                        ai_model: "openai-tts"
                    });
                } catch (audioErr) {
                    console.error("Failed to save AI Voiceover:", audioErr);
                }
            }

            const scenesData = directorData.scenes || [];
            if (scenesData.length < 4) throw new Error("AI Director failed to map out 4 scenes.");

            const newScenes = scenesData.map((sceneObj: any, idx: number) => ({
                id: crypto.randomUUID(),
                scene_number: idx + 1,
                mode: "showcase",
                primaryFile: null,
                primaryPreview: null,
                secondaryFile: null,
                secondaryPreview: null,
                prompt: sceneObj.video_prompt,
                duration: "5",
            }));
            setBRollScenes(newScenes);

            const newFrames: string[] = [];

            for (let i = 0; i < 4; i++) {
                let attempts = 0;
                let successUrl = null;

                while (attempts < 2 && !successUrl) {
                    attempts++;
                    try {
                        const refImagesToSend = [];
                        if (styleRefUrl) refImagesToSend.push(styleRefUrl);
                        if (previousFrameUrl) refImagesToSend.push(previousFrameUrl);

                        const genData = await callN8n('generator', {
                            prompt: scenesData[i].image_prompt,
                            refImage: refImagesToSend.length > 0 ? refImagesToSend[0] : null,
                            styleRefImage: styleRefUrl,
                            previousFrameImage: previousFrameUrl
                        });

                        if (genData.url) {
                            successUrl = genData.url;
                        }
                    } catch (e) {
                        console.warn(`Attempt ${attempts} failed for Frame ${i + 1}`);
                    }
                }

                if (successUrl) {
                    newFrames.push(successUrl);
                    previousFrameUrl = successUrl;
                } else {
                    newFrames.push("FAILED");
                }

                setGeneratedFrames([...newFrames]);
                setLoadingIndices(prev => prev.filter(idx => idx !== i));
            }

        } catch (err: any) {
            console.error(err);
            alert(`Generation Error: ${err.message}`);
            setLoadingIndices([]);
        } finally {
            setIsGeneratingImages(false);
        }
    };

    const handleFrameReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setFrameReferenceFile(file); setFrameReferencePreview(URL.createObjectURL(file)); };
    const handleRefDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length > 0) { const file = e.dataTransfer.files[0]; setFrameReferenceFile(file); setFrameReferencePreview(URL.createObjectURL(file)); } };
    const removeGeneratedFrame = (indexToRemove: number) => { setGeneratedFrames((prev) => prev.filter((_, index) => index !== indexToRemove)); };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; };
    const handleSceneFile = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, type: "primary" | "secondary") => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file); updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string); }; reader.readAsDataURL(file); };
    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, sceneId: string, type: "primary" | "secondary") => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length > 0) { const file = e.dataTransfer.files[0]; const reader = new FileReader(); reader.onload = (event) => updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string); reader.readAsDataURL(file); updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file); return; } const url = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("URL"); if (url) { updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", url); updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null); } };

    return (
        <div className="flex flex-row gap-6 animate-in fade-in w-full h-[calc(100vh-160px)] min-h-[600px] pb-4">

            {/* ── LEFT PANE ── */}
            <div className="flex-1 flex flex-col min-w-0 h-full gap-6 relative">
                <div className="flex-1 bg-gray-50/50 rounded-2xl border border-gray-200 p-6 shadow-inner overflow-y-auto custom-scrollbar relative">
                    <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-50/95 backdrop-blur-md z-10 py-2 border-b border-gray-200/60 -mx-2 px-2">
                        <div><h3 className="text-xl font-bold text-blink-dark flex items-center gap-2"><Film className="h-6 w-6 text-purple-600" /> Sequence Timeline</h3></div>
                        <span className="text-sm font-bold bg-white px-3 py-1 rounded-full border border-gray-200 text-gray-500 shadow-sm">{bRollScenes.length} {bRollScenes.length === 1 ? 'Scene' : 'Scenes'}</span>
                    </div>
                    {bRollScenes.length === 0 ? (
                        <div className="h-48 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 bg-white">
                            <Film className="h-10 w-10 mb-3 opacity-30" /><p className="text-base font-medium">Timeline is empty.</p><p className="text-sm">Use the Chat Bar below to start generating.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 pb-6">
                            {bRollScenes.map((scene, idx) => {
                                const labels = getLabels(scene.mode);
                                return (
                                    <div key={scene.id} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden group hover:border-purple-300 transition-colors">
                                        <div className="bg-gray-50/80 border-b border-gray-100 p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3"><GripVertical className="h-5 w-5 cursor-grab text-gray-400 hover:text-gray-600" /><span className="text-xs font-black text-gray-500 tracking-wider bg-white border border-gray-200 px-3 py-1 rounded-md shadow-sm">SCENE {idx + 1}</span><select value={scene.mode} onChange={(e) => updateScene(scene.id, "mode", e.target.value)} className="text-sm font-medium rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-1.5">{SCENE_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
                                            <button onClick={() => removeScene(scene.id)} className="text-gray-400 hover:bg-red-50 hover:text-red-500 p-2 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                            <div className="lg:col-span-5 flex gap-3">
                                                <div className="flex-1"><label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wider">{labels.primary}</label><div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "primary")} className="relative aspect-video rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50 transition-colors overflow-hidden group/upload">{scene.primaryPreview ? (<><img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none" /><button onClick={() => { updateScene(scene.id, "primaryFile", null); updateScene(scene.id, "primaryPreview", null); }} className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><X className="h-3 w-3" /></button></>) : (<label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer"><span className="text-[11px] text-gray-400 font-semibold">Drag & Drop Image</span></label>)}<input id={`primary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "primary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} /></div></div>
                                                <div className="flex-1"><label className="text-[11px] font-bold text-gray-500 mb-1.5 block uppercase tracking-wider">{labels.secondary}</label><div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50 transition-colors overflow-hidden group/upload">{scene.secondaryPreview ? (<><img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none" /><button onClick={() => { updateScene(scene.id, "secondaryFile", null); updateScene(scene.id, "secondaryPreview", null); }} className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><X className="h-3 w-3" /></button></>) : (<label htmlFor={`secondary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer"><span className="text-[11px] text-gray-400 font-semibold">Drag & Drop Image</span></label>)}<input id={`secondary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "secondary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} /></div></div>
                                            </div>
                                            <div className="lg:col-span-7 flex flex-col"><div className="flex items-center justify-between mb-1.5"><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Director's Motion & Audio Prompt</label><div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md"><span className="text-[11px] font-bold text-gray-400 uppercase">Time:</span><select value={scene.duration || "5"} onChange={(e) => updateScene(scene.id, "duration", e.target.value)} className="text-[11px] bg-transparent font-black text-purple-600 focus:outline-none focus:ring-0 border-none p-0 cursor-pointer"><option value="5">5 SEC</option><option value="10">10 SEC</option></select></div></div><Textarea value={scene.prompt} onChange={(e) => updateScene(scene.id, "prompt", e.target.value)} placeholder="Describe camera motion AND any dialogue..." className="flex-1 text-sm resize-none focus-visible:ring-purple-400 border-gray-200 min-h-[80px]" /></div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    <Button onClick={addEmptyScene} variant="outline" className="w-full mt-2 border-dashed border-2 border-gray-300 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 py-8"><Plus className="mr-2 h-5 w-5" /> Add Empty Scene</Button>
                </div>

                {/* Chat-Style Input Bar */}
                <div className="shrink-0 bg-white rounded-2xl border border-gray-200 p-5 shadow-lg flex flex-col">
                    <div className="flex items-center justify-between px-2 mb-4">
                        <div className="flex items-center gap-6">
                            <button onClick={() => setInputMode("master")} className={cn("text-sm font-bold transition-all border-b-2 pb-1.5 flex items-center gap-2", inputMode === "master" ? "border-purple-600 text-purple-700" : "border-transparent text-gray-400 hover:text-gray-600")}><Settings2 className="w-4 h-4" /> Master Director</button>
                        </div>

                        {inputMode === "master" && (
                            <div className="flex items-center gap-3">
                                {/* Audio Engine Dropdown */}
                                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                                    <Mic className="h-4 w-4 text-blue-500" />
                                    <select
                                        value={audioEngine}
                                        onChange={(e) => setAudioEngine(e.target.value as any)}
                                        className="bg-transparent text-xs font-bold text-blue-700 focus:outline-none cursor-pointer"
                                    >
                                        <option value="video_native">Video AI Audio (Seedance)</option>
                                        <option value="openai_tts">Dedicated TTS (OpenAI Voice)</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100">
                                    <Palette className="h-4 w-4 text-purple-500" />
                                    <select
                                        value={selectedStyle}
                                        onChange={(e) => setSelectedStyle(e.target.value)}
                                        className="bg-transparent text-xs font-bold text-purple-700 focus:outline-none cursor-pointer"
                                    >
                                        {VISUAL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4">
                        <Textarea value={bRollConcept} onChange={(e) => setBRollConcept(e.target.value)} placeholder="Describe the full story flow AND dialogue..." className="flex-1 resize-none h-24 text-sm p-4 bg-purple-50/30 border-purple-200 focus-visible:ring-purple-400" />
                        <div className="w-64 shrink-0 flex flex-col gap-3 justify-end">
                            <Button onClick={handleGenerateScenes} disabled={isSuggesting || isGeneratingImages || !bRollConcept.trim()} variant="outline" className="w-full border-purple-200 text-purple-700 hover:bg-purple-50">{isSuggesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />} Prompts Only</Button>
                            <Button onClick={handleGenerateVisualStory} disabled={isGeneratingImages || !bRollConcept.trim()} className={cn("w-full", yellowLabBtnClass)}>
                                {isGeneratingImages ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Images className="h-4 w-4 mr-2" />} Visual Story (4 Images)
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── RIGHT PANE: VISUAL ASSETS ── */}
            <div className="w-[320px] shrink-0 h-full flex flex-col bg-gradient-to-b from-yellow-50 to-orange-50/50 rounded-2xl border border-yellow-200 p-5 shadow-inner relative">
                <div className="shrink-0 mb-4 flex items-center justify-between"><div><h3 className="text-sm font-black text-orange-800 uppercase tracking-wider flex items-center gap-2"><Images className="h-4 w-4" /> Visual Assets</h3></div></div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
                    <div className="grid grid-cols-2 gap-3 pb-4">
                        {generatedFrames.map((frameUrl, index) => {
                            if (frameUrl === "FAILED") {
                                return (
                                    <div key={`failed-${index}`} className="relative aspect-square w-full rounded-xl border-2 border-red-300 bg-red-50 shadow-sm flex flex-col items-center justify-center text-red-500 animate-in zoom-in duration-300">
                                        <AlertCircle className="h-8 w-8 mb-2" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Timed<br />Out</span>
                                        <div className="absolute bottom-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 rounded-tl-lg font-black shadow-sm">#{index + 1}</div>
                                    </div>
                                );
                            }
                            return (
                                <div key={`frame-${index}`} draggable="true" onDragStart={(e) => { e.dataTransfer.setData("text/plain", frameUrl); }} className="relative aspect-square w-full rounded-xl border-2 border-transparent bg-white shadow-sm overflow-hidden cursor-grab group animate-in zoom-in duration-300">
                                    <img src={frameUrl} className="w-full h-full object-cover pointer-events-none" />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewModalImg(frameUrl); }} className="absolute top-1.5 left-1.5 p-1.5 bg-white/90 hover:bg-blue-50 text-gray-500 hover:text-blue-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"><Maximize2 className="h-3.5 w-3.5" /></button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); removeGeneratedFrame(index); }} className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 hover:bg-red-100 text-gray-500 hover:text-red-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"><X className="h-3.5 w-3.5" /></button>
                                    <div className="absolute bottom-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-tl-lg font-black shadow-sm pointer-events-none">#{index + 1}</div>
                                </div>
                            )
                        })}
                        {loadingIndices.map((idx) => (
                            <div key={`loading-${idx}`} className="relative aspect-square w-full rounded-xl overflow-hidden border border-orange-200/50 shadow-sm">
                                <Skeleton className="w-full h-full bg-orange-100/30" />
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                                    <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
                                    <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Generating</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {generatedFrames.length === 0 && loadingIndices.length === 0 && (
                        <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-orange-300 border-2 border-dashed border-orange-200 rounded-xl bg-white/50"><ImageIcon className="h-8 w-8 mb-2 opacity-50" /><span className="text-xs font-bold uppercase tracking-wider text-center">No images yet.<br />Generate below!</span></div>
                    )}
                </div>

                {generatedAudioUrl && (
                    <div className="shrink-0 border-t border-orange-200/50 pt-4 pb-2 animate-in slide-in-from-bottom-2">
                        <label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Mic className="h-3 w-3" /> Generated Voiceover
                        </label>
                        <div className="bg-white/60 rounded-xl p-2 border border-orange-300 shadow-sm relative group/audio">
                            <audio controls src={generatedAudioUrl} className="w-full h-8" />
                            <button
                                onClick={() => setGeneratedAudioUrl(null)}
                                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/audio:opacity-100 transition-opacity shadow-md z-10"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                )}

                <div className="shrink-0 border-t border-orange-200/50 pt-4">
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 block flex items-center gap-1"><Upload className="h-3 w-3" /> Drop Style Reference</label>
                    <div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-orange-300 bg-white/60 hover:bg-white transition-colors overflow-hidden group/ref flex flex-col">
                        {frameReferencePreview ? (
                            <><img src={frameReferencePreview} className="w-full h-full object-cover" /><button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full shadow-sm opacity-0 group-hover/ref:opacity-100 transition-opacity"><X className="h-4 w-4" /></button><div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1 font-bold tracking-widest uppercase">Style Locked</div></>
                        ) : (
                            <label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-orange-400 hover:text-orange-500"><ImageIcon className="h-6 w-6 mb-2 opacity-50" /><span className="text-[10px] font-bold text-center leading-tight uppercase">Click or Drop<br />Image Here</span></label>
                        )}
                        <input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                    </div>
                </div>
            </div>
            {previewModalImg && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewModalImg(null)}><div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}><button onClick={() => setPreviewModalImg(null)} className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"><X className="h-6 w-6" /></button><img src={previewModalImg} className="w-full h-full object-contain rounded-lg shadow-2xl" alt="Preview Enlarged" /></div></div>)}
        </div>
    );
}