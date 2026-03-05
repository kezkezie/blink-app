"use client";

import { useState, useEffect } from "react";
import { Upload, X, Sparkles, Loader2, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, Mic, FolderOpen, Wand2, Plus, Trash2, Video } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

const yellowLabBtnClass = "bg-[#f1c40f] hover:bg-[#d4ac0d] text-white shadow-md font-bold border-none";

// ✨ Added audioPrompt to the scene state
type StoryboardScene = any & {
  videoUrl?: string | null;
  isGeneratingVideo?: boolean;
  audioPrompt?: string;
};

export interface StorytellingSetupProps extends VideoSetupProps {
  bRollConcept: string;
  setBRollConcept: (val: string) => void;
  bRollScenes: StoryboardScene[];
  setBRollScenes: (scenes: StoryboardScene[]) => void;
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

  useEffect(() => {
    if (bRollScenes.length === 0) {
      const defaultScenes = Array.from({ length: 4 }).map((_, i) => ({
        id: crypto.randomUUID(),
        scene_number: i + 1,
        mode: "showcase",
        primaryFile: null,
        primaryPreview: null,
        secondaryFile: null,
        secondaryPreview: null,
        prompt: "",
        audioPrompt: "", // ✨ Initialize empty audio prompt
        duration: "5",
        videoUrl: null,
        isGeneratingVideo: false
      }));
      setBRollScenes(defaultScenes);
    }
  }, []);

  const [generatingSlot, setGeneratingSlot] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [suggestingPromptIndex, setSuggestingPromptIndex] = useState<number | null>(null);

  const [regenDialogState, setRegenDialogState] = useState<{ isOpen: boolean; sceneId: string | null; index: number | null; slotType: 'primary' | 'secondary'; promptText: string }>({
    isOpen: false,
    sceneId: null,
    index: null,
    slotType: 'primary',
    promptText: ""
  });

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);

  const [isWritingScript, setIsWritingScript] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);

  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const [frameReferenceFile, setFrameReferenceFile] = useState<File | null>(null);
  const [frameReferencePreview, setFrameReferencePreview] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [audioEngine, setAudioEngine] = useState<"video_native" | "openai_tts">("openai_tts");

  const totalImageSlots = bRollScenes.length * 2;
  const filledImageSlots = bRollScenes.reduce((count, scene) => count + (scene.primaryPreview ? 1 : 0) + (scene.secondaryPreview ? 1 : 0), 0);
  const hasAnyImages = filledImageSlots > 0;
  const allVideosGenerated = bRollScenes.length > 0 && bRollScenes.every(s => s.videoUrl);

  const getLabels = (mode: string) => {
    switch (mode) {
      case "keyframe": return { primary: "Start Frame", secondary: "End Frame" };
      case "ugc": return { primary: "Product Shot", secondary: "Influencer Face" };
      case "clothing": return { primary: "Garment Flatlay", secondary: "Model Reference" };
      case "logo_reveal": return { primary: "Logo/Product", secondary: "End State (Opt)" };
      case "showcase":
      default: return { primary: "Start Frame", secondary: "End Frame (Opt)" };
    }
  };

  const callN8n = async (mode: 'director' | 'generator' | 'manual' | 'scene_video_generator', body: any) => {
    const res = await fetch("/api/video/nano-banana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...body })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error from ${mode} generator.`);
    return data;
  };

  const uploadRefImage = async (): Promise<string | null> => {
    if (!frameReferenceFile || !clientId) return null;
    const ext = frameReferenceFile.name.split(".").pop();
    const path = `videos/${clientId}/story_ref_${Date.now()}.${ext}`;
    await supabase.storage.from("assets").upload(path, frameReferenceFile);
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  };

  const generateScriptAndAudio = async (): Promise<string[]> => {
    setIsWritingScript(true);
    let generatedPrompts: string[] = [];
    try {
      const totalDuration = bRollScenes.reduce((sum, scene) => sum + parseInt(scene.duration || "5"), 0);

      const directorData = await callN8n('director', {
        prompt: bRollConcept,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: audioEngine,
        totalDuration: totalDuration,
        sceneCount: bRollScenes.length
      });

      const scenesData = directorData.scenes || [];

      // Extract new prompts and update UI state
      generatedPrompts = bRollScenes.map((scene, i) => {
        const newVisualPrompt = scenesData[i]?.video_prompt || scenesData[i]?.image_prompt || "";
        const newAudioPrompt = scenesData[i]?.audio_prompt || `English narration about ${bRollConcept}`; // Fallback to English to prevent Chinese

        if (!scene.prompt?.trim()) updateScene(scene.id, "prompt", newVisualPrompt);
        if (!scene.audioPrompt?.trim()) updateScene(scene.id, "audioPrompt", newAudioPrompt);

        return scene.prompt?.trim() || newVisualPrompt;
      });

      // Master Audio Voiceover
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
            caption: `🎙️ AI Voiceover: ${bRollConcept.substring(0, 30)}...`,
            status: "success",
            image_urls: [audioPublicUrl],
            ai_model: "openai-tts"
          });
        } catch (audioErr) {
          console.error("Failed to save voiceover:", audioErr);
        }
      }
    } catch (err: any) {
      alert(`Script generation failed: ${err.message}`);
      throw err;
    } finally {
      setIsWritingScript(false);
    }
    return generatedPrompts;
  };

  const handleWriteScript = async () => {
    if (!bRollConcept.trim()) return alert("Please enter a concept first.");
    await generateScriptAndAudio();
  };

  const handleSuggestPrompt = async (sceneId: string, index: number) => {
    if (!bRollConcept.trim()) return alert("Please enter a master concept first.");
    setSuggestingPromptIndex(index);
    try {
      const sceneMode = SCENE_MODES.find(m => m.id === bRollScenes[index].mode)?.label || "Cinematic Pan";
      const directorData = await callN8n('director', {
        prompt: `Write a visual image prompt AND an english audio narration script for Scene ${index + 1} based on this concept: "${bRollConcept}". The camera movement/style is "${sceneMode}".`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: "video_native",
        totalDuration: 5
      });
      const suggestedPrompt = directorData.scenes?.[0]?.image_prompt || "Cinematic shot. Highly detailed.";
      const suggestedAudio = directorData.scenes?.[0]?.audio_prompt || "Inspiring background music with english narration.";
      updateScene(sceneId, "prompt", suggestedPrompt);
      updateScene(sceneId, "audioPrompt", suggestedAudio);
    } catch (err) {
      console.error(err);
    } finally {
      setSuggestingPromptIndex(null);
    }
  };

  const handleGenerateSlot = async (slotIndex: number, type: 'primary' | 'secondary' = 'primary', overridePrompt?: string) => {
    const scene = bRollScenes[slotIndex];
    const promptToUse = overridePrompt || scene.prompt || bRollConcept;

    if (!promptToUse.trim()) return alert("Please write a visual prompt for this scene first.");

    setGeneratingSlot({ index: slotIndex, type });
    try {
      const styleRefUrl = await uploadRefImage();
      let previousUrl = null;
      if (slotIndex > 0) {
        previousUrl = bRollScenes[slotIndex - 1].secondaryPreview || bRollScenes[slotIndex - 1].primaryPreview;
      }

      const genData = await callN8n('generator', {
        prompt: promptToUse,
        refImage: styleRefUrl || previousUrl || null,
        styleRefImage: styleRefUrl,
        previousFrameImage: previousUrl
      });

      if (genData.url) {
        updateScene(scene.id, type === 'primary' ? "primaryPreview" : "secondaryPreview", genData.url);
        updateScene(scene.id, type === 'primary' ? "primaryFile" : "secondaryFile", null);
        updateScene(scene.id, "videoUrl", null);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Generation failed for Scene ${slotIndex + 1}: ${err.message}`);
    } finally {
      setGeneratingSlot(null);
    }
  };

  const handleGenerateAllImages = async () => {
    if (!bRollConcept.trim()) return alert("Please enter a concept first.");
    setIsGeneratingAllImages(true);

    let currentPrompts = bRollScenes.map(s => s.prompt);

    if (currentPrompts.every(p => !p?.trim())) {
      try {
        currentPrompts = await generateScriptAndAudio();
      } catch (e) {
        setIsGeneratingAllImages(false);
        return;
      }
    }

    for (let i = 0; i < bRollScenes.length; i++) {
      if (!bRollScenes[i].primaryPreview && currentPrompts[i]) {
        await handleGenerateSlot(i, 'primary', currentPrompts[i]);
      }
    }
    setIsGeneratingAllImages(false);
  };

  // ✨ NEW: Sending audioPrompt to the Video Generator 
  const handleGenerateSingleVideo = async (slotIndex: number) => {
    const scene = bRollScenes[slotIndex];
    if (!scene.primaryPreview) return alert("Please generate or upload a primary image first.");

    updateScene(scene.id, "isGeneratingVideo", true);

    try {
      const videoData = await callN8n('scene_video_generator', {
        primaryImage: scene.primaryPreview,
        secondaryImage: scene.secondaryPreview,
        prompt: scene.prompt || bRollConcept,
        audioPrompt: scene.audioPrompt || "English language narration", // Stops the default Chinese!
        duration: scene.duration,
        mode: scene.mode,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
      });

      if (videoData.url) {
        updateScene(scene.id, "videoUrl", videoData.url);
      } else {
        throw new Error("No video URL returned");
      }
    } catch (err: any) {
      console.error(`Failed to generate video for scene ${slotIndex + 1}:`, err);
      alert(`Failed to generate video: ${err.message}`);
    } finally {
      updateScene(scene.id, "isGeneratingVideo", false);
    }
  };

  const handleGenerateSceneVideos = async () => {
    if (!hasAnyImages) return alert("Please generate some images first.");
    setIsGeneratingVideos(true);

    for (let i = 0; i < bRollScenes.length; i++) {
      const scene = bRollScenes[i];
      if (!scene.primaryPreview || scene.videoUrl) continue;
      await handleGenerateSingleVideo(i);
    }

    setIsGeneratingVideos(false);
  };

  const handleDeleteVideo = (sceneId: string) => {
    if (confirm("Are you sure you want to delete this video and re-enable editing?")) {
      updateScene(sceneId, "videoUrl", null);
    }
  };

  const openRegenModal = (scene: any, index: number, slotType: 'primary' | 'secondary') => {
    setRegenDialogState({ isOpen: true, sceneId: scene.id, index: index, slotType: slotType, promptText: scene.prompt || bRollConcept || "" });
  };

  const handleConfirmRegen = () => {
    const { sceneId, index, slotType, promptText } = regenDialogState;
    if (sceneId && index !== null) {
      updateScene(sceneId, "prompt", promptText);
      handleGenerateSlot(index, slotType, promptText);
    }
    setRegenDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const handleLibrarySelect = (url: string) => {
    if (!libraryTarget) return;
    const scene = bRollScenes[libraryTarget.index];
    const targetField = libraryTarget.type === "primary" ? "primaryPreview" : "secondaryPreview";
    updateScene(scene.id, targetField, url);
    updateScene(scene.id, libraryTarget.type === "primary" ? "primaryFile" : "secondaryFile", null);
    updateScene(scene.id, "videoUrl", null);
    setLibraryTarget(null);
  };

  const clearSlot = (sceneId: string, type: 'primary' | 'secondary') => {
    updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", null);
    updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
    updateScene(sceneId, "videoUrl", null);
  };

  const handleSceneFile = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, type: "primary" | "secondary") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
      updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
      updateScene(sceneId, "videoUrl", null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, sceneId: string, type: "primary" | "secondary") => {
    e.preventDefault(); e.stopPropagation();
    updateScene(sceneId, "videoUrl", null);

    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
      reader.readAsDataURL(file);
      updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
      return;
    }
    const url = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("URL");
    if (url) {
      updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", url);
      updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
    }
  };

  const handleFrameReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setFrameReferenceFile(file); setFrameReferencePreview(URL.createObjectURL(file)); };
  const handleRefDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.length > 0) { const file = e.dataTransfer.files[0]; setFrameReferenceFile(file); setFrameReferencePreview(URL.createObjectURL(file)); } };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; };

  return (
    <div className="flex flex-row gap-6 animate-in fade-in w-full h-[calc(100vh-160px)] min-h-[600px] pb-4">

      {/* ── LEFT PANE: STORYBOARD ROWS ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full gap-6 relative">

        <div className="flex-1 bg-gray-50/50 rounded-2xl border border-gray-200 p-5 shadow-inner overflow-y-auto custom-scrollbar relative">
          <div className="flex items-center justify-between mb-5 sticky top-0 bg-gray-50/95 backdrop-blur-md z-10 py-2 border-b border-gray-200/60 -mx-2 px-2">
            <div>
              <h3 className="text-xl font-bold text-blink-dark flex items-center gap-2">
                <Film className="h-6 w-6 text-purple-600" /> Visual Storyboard
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Write prompts, pick images, and generate videos.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-bold px-3 py-1 rounded-full border shadow-sm",
                hasAnyImages ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-500"
              )}>
                {filledImageSlots}/{totalImageSlots} Images Filled
              </span>
            </div>
          </div>

          <div className="flex flex-col space-y-6">
            {bRollScenes.map((scene, index) => {
              const labels = getLabels(scene.mode);

              return (
                <div key={scene.id} className={cn(
                  "relative rounded-xl border-2 overflow-hidden flex flex-col transition-all duration-200 group bg-white",
                  scene.videoUrl ? "border-green-300 shadow-md" : (scene.primaryPreview ? "border-purple-300 shadow-sm" : "border-dashed border-gray-300")
                )}>
                  {/* ── Scene Header ── */}
                  <div className="bg-gray-50/80 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-black text-gray-500 tracking-wider uppercase bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">
                        SCENE {index + 1}
                      </span>
                      <select value={scene.mode} onChange={(e) => updateScene(scene.id, "mode", e.target.value)} className="text-xs font-bold rounded border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-1 px-2 bg-white text-gray-700 cursor-pointer">
                        {SCENE_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <select value={scene.duration || "5"} onChange={(e) => updateScene(scene.id, "duration", e.target.value)} className="text-xs bg-purple-50 font-black text-purple-600 focus:outline-none focus:ring-0 border border-purple-100 rounded px-2 py-1 cursor-pointer">
                        <option value="5">5 SEC</option>
                        <option value="10">10 SEC</option>
                      </select>
                      {bRollScenes.length > 1 && (
                        <button onClick={() => removeScene(scene.id)} className="text-gray-400 hover:text-red-500 p-1.5 rounded transition-colors bg-white shadow-sm border border-gray-200 hover:border-red-200 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Scene Content (Row Layout) ── */}
                  <div className="flex flex-col md:flex-row p-4 gap-4">

                    {/* Image Area (Left) */}
                    <div className="w-full md:w-1/2 flex gap-3 border-r border-gray-100 pr-4 relative">
                      {scene.videoUrl && <div className="absolute inset-0 bg-gray-50/50 z-30 cursor-not-allowed" title="Delete video to edit images"></div>}

                      {/* PRIMARY SLOT */}
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block truncate">{labels.primary}</label>
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "primary")} className="relative aspect-video rounded-lg overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-center justify-center transition-colors group/upload">
                          {generatingSlot?.index === index && generatingSlot.type === 'primary' ? (
                            <div className="flex flex-col items-center justify-center gap-2 bg-purple-50/50 w-full h-full"><Loader2 className="h-6 w-6 text-purple-500 animate-spin" /><span className="text-[9px] font-bold text-purple-600 uppercase tracking-wider">Generating...</span></div>
                          ) : scene.primaryPreview ? (
                            <><img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none" />
                              <div className="absolute top-1.5 right-1.5 flex gap-1 z-20">
                                <button type="button" onClick={() => setPreviewModalImg(scene.primaryPreview)} className="p-1.5 bg-white/90 hover:bg-blue-50 text-gray-500 hover:text-blue-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><Maximize2 className="h-3 w-3" /></button>
                                <button type="button" onClick={() => clearSlot(scene.id, "primary")} className="p-1.5 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                              </div></>
                          ) : (
                            <label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-gray-400"><ImageIcon className="h-6 w-6 mb-1 opacity-30" /><p className="text-[9px] font-medium uppercase tracking-wider">Drop File</p></label>
                          )}
                          <input id={`primary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "primary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {scene.primaryPreview ? (
                            <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 px-1"><Wand2 className="h-3 w-3 mr-1" /> Re-Gen</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 px-1"><Wand2 className="h-3 w-3 mr-1" /> Generate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 text-[10px] font-bold border-blue-200 text-blue-600 hover:bg-blue-50 px-1"><FolderOpen className="h-3 w-3 mr-1" /> Library</Button>
                        </div>
                      </div>

                      {/* SECONDARY SLOT */}
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block truncate">{labels.secondary}</label>
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-lg overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-center justify-center transition-colors group/upload">
                          {generatingSlot?.index === index && generatingSlot.type === 'secondary' ? (
                            <div className="flex flex-col items-center justify-center gap-2 bg-purple-50/50 w-full h-full"><Loader2 className="h-6 w-6 text-purple-500 animate-spin" /><span className="text-[9px] font-bold text-purple-600 uppercase tracking-wider">Generating...</span></div>
                          ) : scene.secondaryPreview ? (
                            <><img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none" />
                              <div className="absolute top-1.5 right-1.5 flex gap-1 z-20">
                                <button type="button" onClick={() => setPreviewModalImg(scene.secondaryPreview)} className="p-1.5 bg-white/90 hover:bg-blue-50 text-gray-500 hover:text-blue-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><Maximize2 className="h-3 w-3" /></button>
                                <button type="button" onClick={() => clearSlot(scene.id, "secondary")} className="p-1.5 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-full shadow-md opacity-0 group-hover/upload:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                              </div></>
                          ) : (
                            <label htmlFor={`secondary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-gray-400"><ImageIcon className="h-6 w-6 mb-1 opacity-30" /><p className="text-[9px] font-medium uppercase tracking-wider">Drop File</p></label>
                          )}
                          <input id={`secondary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "secondary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {scene.secondaryPreview ? (
                            <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 px-1"><Wand2 className="h-3 w-3 mr-1" /> Re-Gen</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 px-1"><Wand2 className="h-3 w-3 mr-1" /> Generate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'secondary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 text-[10px] font-bold border-blue-200 text-blue-600 hover:bg-blue-50 px-1"><FolderOpen className="h-3 w-3 mr-1" /> Library</Button>
                        </div>
                      </div>
                    </div>

                    {/* Text Prompts OR Video Player (Right) */}
                    <div className="w-full md:w-1/2 flex flex-col relative gap-2">
                      <div className="flex items-center justify-between shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                          {scene.videoUrl ? <><Video className="h-3 w-3 text-green-500" /> Generated Video</> : "Scene Director"}
                        </label>
                        {!scene.videoUrl && (
                          <button onClick={() => handleSuggestPrompt(scene.id, index)} disabled={suggestingPromptIndex === index} className="text-purple-500 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-md flex items-center gap-1 transition-colors text-xs font-bold border border-purple-100">
                            {suggestingPromptIndex === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Suggest
                          </button>
                        )}
                        {scene.videoUrl && (
                          <button onClick={() => handleDeleteVideo(scene.id)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md flex items-center gap-1 transition-colors text-xs font-bold border border-red-100">
                            <Trash2 className="h-3 w-3" /> Delete Video
                          </button>
                        )}
                      </div>

                      {/* ✨ THE BIG SWITCH: Prompts vs Video Player vs Loader ✨ */}
                      <div className="flex-1 min-h-[140px] relative rounded-md overflow-hidden border border-gray-200 bg-gray-50 flex flex-col">
                        {scene.isGeneratingVideo ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-50/80 gap-2 z-20">
                            <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
                            <span className="text-xs font-bold text-green-700 uppercase tracking-wider animate-pulse">Rendering Video...</span>
                          </div>
                        ) : scene.videoUrl ? (
                          <video src={scene.videoUrl} controls className="w-full h-full object-cover absolute inset-0 bg-black" playsInline />
                        ) : (
                          <div className="flex flex-col h-full absolute inset-0">
                            {/* Visual Prompt */}
                            <Textarea
                              value={scene.prompt}
                              onChange={(e) => updateScene(scene.id, "prompt", e.target.value)}
                              className="flex-1 w-full text-xs p-3 resize-none bg-white border-b border-gray-200 focus-visible:ring-0 leading-snug custom-scrollbar rounded-none"
                              placeholder="Visual prompt: Describe the camera movement and aesthetics..."
                            />
                            {/* ✨ Audio/Narration Prompt ✨ */}
                            <Textarea
                              value={scene.audioPrompt || ""}
                              onChange={(e) => updateScene(scene.id, "audioPrompt", e.target.value)}
                              className="flex-1 w-full text-xs p-3 resize-none bg-blue-50/30 border-none focus-visible:ring-0 leading-snug custom-scrollbar rounded-none"
                              placeholder="Audio prompt: Enter the english narration or sound effects..."
                            />
                            <div className="p-2 border-t border-gray-200 bg-gray-100 flex justify-between items-center shrink-0">
                              <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">
                                {scene.primaryPreview ? "Ready for animation" : "Requires an image"}
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateSingleVideo(index)}
                                disabled={!scene.primaryPreview || scene.isGeneratingVideo}
                                className={cn("h-7 text-[10px] font-bold px-3 transition-colors", scene.primaryPreview ? "bg-green-600 hover:bg-green-700 text-white shadow-sm" : "bg-gray-200 text-gray-400")}
                              >
                                <Film className="w-3 h-3 mr-1.5" /> Generate Scene Video
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Button onClick={addEmptyScene} variant="outline" className="w-full mt-6 border-dashed border-2 border-gray-300 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 py-8">
            <Plus className="mr-2 h-5 w-5" /> Add Another Scene
          </Button>
        </div>

        <div className="shrink-0 bg-white rounded-2xl border border-gray-200 p-5 shadow-lg flex flex-col z-20 relative">
          <div className="flex items-center justify-between px-2 mb-4">
            <div className="flex items-center gap-6"><span className="text-sm font-bold text-purple-700 flex items-center gap-2 border-b-2 border-purple-600 pb-1.5"><Settings2 className="w-4 h-4" /> Master Director</span></div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"><Mic className="h-4 w-4 text-blue-500" /><select value={audioEngine} onChange={(e) => setAudioEngine(e.target.value as any)} className="bg-transparent text-xs font-bold text-blue-700 focus:outline-none cursor-pointer"><option value="video_native">Video AI Audio (Seedance)</option><option value="openai_tts">Dedicated TTS (OpenAI Voice)</option></select></div>
              <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100"><Palette className="h-4 w-4 text-purple-500" /><select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="bg-transparent text-xs font-bold text-purple-700 focus:outline-none cursor-pointer">{VISUAL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            </div>
          </div>

          <div className="flex gap-4">
            <Textarea value={bRollConcept} onChange={(e) => setBRollConcept(e.target.value)} placeholder="Describe the full story flow AND dialogue..." className="flex-1 resize-none h-32 text-sm p-4 bg-purple-50/30 border-purple-200 focus-visible:ring-purple-400" />
            <div className="w-72 shrink-0 flex flex-col gap-2 justify-end">

              <Button onClick={handleWriteScript} disabled={isWritingScript || !bRollConcept.trim()} variant="outline" className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 h-10 text-xs font-bold justify-start px-4">
                {isWritingScript ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />} Write Prompts & Audio
              </Button>

              <Button onClick={handleGenerateAllImages} disabled={isGeneratingAllImages || generatingSlot !== null || !bRollConcept.trim()} variant="outline" className="w-full border-orange-200 text-orange-600 hover:bg-orange-50 h-10 text-xs font-bold justify-start px-4">
                {isGeneratingAllImages ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Images className="h-3.5 w-3.5 mr-2" />} Generate Images ({filledImageSlots}/{totalImageSlots})
              </Button>

              <Button onClick={handleGenerateSceneVideos} disabled={!hasAnyImages || isGeneratingVideos} className={cn("w-full h-11 mt-1 justify-start px-4 text-sm", hasAnyImages ? "bg-green-600 hover:bg-green-700 text-white shadow-md font-bold border-none" : "bg-gray-200 text-gray-500 cursor-not-allowed")}>
                {isGeneratingVideos ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Film className="h-5 w-5 mr-2" />} Generate Scene Videos {allVideosGenerated ? '(Complete!)' : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANE: VISUAL ASSETS (Preview) ── */}
      <div className="w-[320px] shrink-0 h-full flex flex-col bg-gradient-to-b from-yellow-50 to-orange-50/50 rounded-2xl border border-yellow-200 p-5 shadow-inner relative">
        <div className="shrink-0 mb-4 flex items-center justify-between"><h3 className="text-sm font-black text-orange-800 uppercase tracking-wider flex items-center gap-2"><Images className="h-4 w-4" /> Preview</h3></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {bRollScenes.flatMap((scene, index) => {
              const previews = [];
              if (scene.primaryPreview) {
                previews.push(
                  <div key={`preview-${index}-1`} className="relative aspect-square w-full rounded-xl border-2 border-transparent bg-white shadow-sm overflow-hidden group animate-in zoom-in duration-300">
                    <img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none" />
                    <div className="absolute bottom-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-tl-lg font-black shadow-sm pointer-events-none">#{index + 1}.1</div>
                  </div>
                );
              }
              if (scene.secondaryPreview) {
                previews.push(
                  <div key={`preview-${index}-2`} className="relative aspect-square w-full rounded-xl border-2 border-transparent bg-white shadow-sm overflow-hidden group animate-in zoom-in duration-300">
                    <img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none" />
                    <div className="absolute bottom-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-tl-lg font-black shadow-sm pointer-events-none">#{index + 1}.2</div>
                  </div>
                );
              }
              return previews;
            })}
            {!hasAnyImages && (<div className="col-span-2 h-32 flex flex-col items-center justify-center text-orange-300 border-2 border-dashed border-orange-200 rounded-xl bg-white/50"><ImageIcon className="h-8 w-8 mb-2 opacity-50" /><span className="text-xs font-bold uppercase tracking-wider text-center">Add images to<br />see previews!</span></div>)}
          </div>
        </div>
        {generatedAudioUrl && (<div className="shrink-0 border-t border-orange-200/50 pt-4 pb-2 animate-in slide-in-from-bottom-2"><label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1"><Mic className="h-3 w-3" /> Generated Voiceover</label><div className="bg-white/60 rounded-xl p-2 border border-orange-300 shadow-sm relative group/audio"><audio controls src={generatedAudioUrl} className="w-full h-8" /><button onClick={() => setGeneratedAudioUrl(null)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/audio:opacity-100 transition-opacity shadow-md z-10"><X className="h-3 w-3" /></button></div></div>)}
        <div className="shrink-0 border-t border-orange-200/50 pt-4"><label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 block flex items-center gap-1"><Upload className="h-3 w-3" /> Drop Style Reference</label><div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-orange-300 bg-white/60 hover:bg-white transition-colors overflow-hidden group/ref flex flex-col">{frameReferencePreview ? (<><img src={frameReferencePreview} className="w-full h-full object-cover" /><button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full shadow-sm opacity-0 group-hover/ref:opacity-100 transition-opacity"><X className="h-4 w-4" /></button><div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1 font-bold tracking-widest uppercase">Style Locked</div></>) : (<label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-orange-400 hover:text-orange-500"><ImageIcon className="h-6 w-6 mb-2 opacity-50" /><span className="text-[10px] font-bold text-center leading-tight uppercase">Click or Drop<br />Image Here</span></label>)}<input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} /></div></div>
      </div>

      <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} />
      {previewModalImg && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewModalImg(null)}><div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}><button onClick={() => setPreviewModalImg(null)} className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"><X className="h-6 w-6" /></button><img src={previewModalImg} className="w-full h-full object-contain rounded-lg shadow-2xl" alt="Preview Enlarged" /></div></div>)}
      <Dialog open={regenDialogState.isOpen} onOpenChange={(open) => !open && setRegenDialogState(prev => ({ ...prev, isOpen: false }))}><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle className="flex items-center gap-2 text-purple-700"><Wand2 className="h-5 w-5" /> Regenerate {regenDialogState.slotType === 'primary' ? 'Primary' : 'Secondary'} Image</DialogTitle><DialogDescription>Edit the prompt below to refine the generation for this specific slot in Scene {regenDialogState.index !== null ? regenDialogState.index + 1 : ''}.</DialogDescription></DialogHeader><div className="py-4"><Textarea value={regenDialogState.promptText} onChange={(e) => setRegenDialogState(prev => ({ ...prev, promptText: e.target.value }))} placeholder="Enter a detailed visual prompt..." className="h-32 resize-none bg-gray-50 border-gray-200 focus-visible:ring-purple-300" /></div><DialogFooter><Button variant="outline" onClick={() => setRegenDialogState(prev => ({ ...prev, isOpen: false }))}>Cancel</Button><Button onClick={handleConfirmRegen} className="bg-purple-600 hover:bg-purple-700 text-white font-bold"><Sparkles className="h-4 w-4 mr-2" /> Regenerate Slot</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}