"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, X, Sparkles, Loader2, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, Mic, FolderOpen, Wand2, Plus, Trash2, Video, Music, CheckCircle, Save, Users, Lock, UserPlus, MessageSquare, ChevronUp, ChevronDown, Layers, MonitorPlay, LayoutGrid, Send } from "lucide-react";
// Add this new import right below the standard imports:
import { PublishModal } from "@/components/publishing/PublishModal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

// ============================================================================
// ✨ 1. ACTOR PROFILE TYPES & CASTING ROOM MODAL
// ============================================================================

export interface ActorProfile {
  id: string;
  name: string;
  stitchedSheetUrl: string;
}

interface CastingRoomModalProps {
  open: boolean;
  onClose: () => void;
  onSaveActor: (actor: ActorProfile) => void;
  onDeleteActor: (id: string) => void;
  actors: ActorProfile[];
  selectedActorA: string;
  setSelectedActorA: (id: string) => void;
  callN8n: (mode: 'director' | 'generator' | 'manual' | 'scene_video_generator', body: any) => Promise<any>;
  clientId: string | null;
}

function CastingRoomModal({ open, onClose, onSaveActor, onDeleteActor, actors, selectedActorA, setSelectedActorA, callN8n, clientId }: CastingRoomModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isStitching, setIsStitching] = useState(false);

  const [actorName, setActorName] = useState("");
  const [angles, setAngles] = useState<(File | null)[]>(Array(6).fill(null));
  const [previews, setPreviews] = useState<(string | null)[]>(Array(6).fill(null));

  // AI Generation state
  const [creationMode, setCreationMode] = useState<"manual" | "ai">("manual");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);


  const CHARACTER_SHEET_INJECTION = "Character reference sheet, identical character, multiple angles, front view, side view, back profile, white background, hyper-realistic, highly detailed.";

  const ANGLE_LABELS = ["Front Face", "Left Profile", "Right Profile", "Front Body", "Side Body", "Back Body"];

  const handleAngleUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newAngles = [...angles];
    const newPreviews = [...previews];
    newAngles[index] = file;
    newPreviews[index] = URL.createObjectURL(file);
    setAngles(newAngles);
    setPreviews(newPreviews);
  };

  const removeAngle = (index: number) => {
    const newAngles = [...angles];
    const newPreviews = [...previews];
    newAngles[index] = null;
    newPreviews[index] = null;
    setAngles(newAngles);
    setPreviews(newPreviews);
  };

  // 🧠 The Magic Auto-Stitcher
  const handleSaveAndStitch = async () => {
    if (!actorName.trim()) return alert("Please name your actor.");
    if (angles.filter(a => a !== null).length === 0) return alert("Please upload at least one angle.");
    if (!clientId) return;

    setIsStitching(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1536; // 3 columns of 512
      canvas.height = 1024; // 2 rows of 512
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImage = (file: File): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      };

      for (let i = 0; i < 6; i++) {
        if (angles[i]) {
          const img = await loadImage(angles[i]!);
          const col = i % 3;
          const row = Math.floor(i / 3);

          // Draw image covering the 512x512 cell
          const size = 512;
          const scale = Math.max(size / img.width, size / img.height);
          const x = (size / 2) - (img.width / 2) * scale;
          const y = (size / 2) - (img.height / 2) * scale;

          ctx.save();
          ctx.beginPath();
          ctx.rect(col * size, row * size, size, size);
          ctx.clip();
          ctx.drawImage(img, (col * size) + x, (row * size) + y, img.width * scale, img.height * scale);
          ctx.restore();
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Failed to create stitched image");

      const path = `videos/${clientId}/actor_${Date.now()}.jpg`;
      await supabase.storage.from("assets").upload(path, blob);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;

      const newActor: ActorProfile = {
        id: crypto.randomUUID(),
        name: actorName,
        stitchedSheetUrl: publicUrl
      };

      onSaveActor(newActor);
      setIsCreating(false);
      setActorName("");
      setAngles(Array(6).fill(null));
      setPreviews(Array(6).fill(null));

    } catch (err: any) {
      console.error(err);
      alert("Failed to stitch actor sheet: " + err.message);
    } finally {
      setIsStitching(false);
    }
  };

  // 🧠 AI Character Sheet Generator
  const handleAIGenerate = async () => {
    if (!actorName.trim()) return alert("Please name your actor.");
    if (!aiPrompt.trim()) return alert("Please describe your character.");
    if (!clientId) return;

    setIsGeneratingAI(true);
    try {
      const augmentedPrompt = `${CHARACTER_SHEET_INJECTION} ${aiPrompt}`;
      const genData = await callN8n('generator', { prompt: augmentedPrompt });

      if (!genData.url) throw new Error("AI did not return an image URL.");

      const newActor: ActorProfile = {
        id: crypto.randomUUID(),
        name: actorName,
        stitchedSheetUrl: genData.url
      };

      onSaveActor(newActor);
      setIsCreating(false);
      setActorName("");
      setAiPrompt("");
      setCreationMode("manual");
    } catch (err: any) {
      console.error(err);
      alert("AI generation failed: " + err.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-pink-600"><Users className="w-5 h-5" /> Digital Casting Room</DialogTitle>
          <DialogDescription>Save actors to use consistently across all your video scenes.</DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Actor Name</label>
              <Input value={actorName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActorName(e.target.value)} placeholder="e.g., Emma (Lead)" className="bg-gray-50" />
            </div>

            {/* Tab Toggle: Manual Upload vs Generate with AI */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setCreationMode("manual")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "manual" ? "bg-white text-pink-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Upload className="w-3.5 h-3.5" /> Manual Upload (Stitch)
              </button>
              <button
                onClick={() => setCreationMode("ai")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "ai" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate with AI
              </button>
            </div>

            {creationMode === "manual" ? (
              /* Manual Upload View */
              <>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Upload Angles (The more, the better)</label>
                  <div className="grid grid-cols-3 gap-3">
                    {ANGLE_LABELS.map((label, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-center text-gray-400">{label}</span>
                        <div className="aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl relative overflow-hidden group hover:border-pink-300 hover:bg-pink-50 transition-colors">
                          {previews[i] ? (
                            <>
                              <img src={previews[i]!} className="w-full h-full object-cover" />
                              <button onClick={() => removeAngle(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                            </>
                          ) : (
                            <label className="w-full h-full flex items-center justify-center cursor-pointer">
                              <Upload className="w-4 h-4 text-gray-300 group-hover:text-pink-400" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAngleUpload(i, e)} />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <Button variant="outline" className="flex-1" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-pink-600 hover:bg-pink-700 text-white" onClick={handleSaveAndStitch} disabled={isStitching}>
                    {isStitching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    {isStitching ? "Stitching Sheet..." : "Save & Stitch Actor"}
                  </Button>
                </div>
              </>
            ) : (
              /* Generate with AI View */
              <>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Character Description</label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., A 30-year-old female astronaut with red hair, wearing a white NASA spacesuit"
                    className="h-28 resize-none bg-purple-50/30 border-purple-200 focus-visible:ring-purple-400 text-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5">We'll automatically generate a multi-angle character reference sheet from this description.</p>
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <Button variant="outline" className="flex-1" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleAIGenerate} disabled={isGeneratingAI}>
                    {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {isGeneratingAI ? "Generating Sheet..." : "Generate Character Sheet"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Button onClick={() => setIsCreating(true)} className="w-full bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 shadow-sm h-12">
              <UserPlus className="w-4 h-4 mr-2" /> Add New Actor
            </Button>

            {actors.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {actors.map(actor => {
                  const isSelected = selectedActorA === actor.id;
                  return (
                    <div key={actor.id} className={cn(
                      "rounded-xl p-2 bg-white shadow-sm flex flex-col gap-2 transition-all relative",
                      isSelected ? "border-2 border-pink-500 ring-2 ring-pink-200" : "border border-gray-200"
                    )}>
                      <button
                        onClick={() => confirm("Delete this actor?") && onDeleteActor(actor.id)}
                        className="absolute top-1.5 right-1.5 z-10 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        title="Delete Actor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 relative group">
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover" />
                        {isSelected && <div className="absolute top-1 left-1 bg-pink-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow">Locked</div>}
                      </div>
                      <span className="text-xs font-bold text-center text-gray-700 truncate px-1">{actor.name}</span>
                      <button
                        onClick={() => setSelectedActorA(isSelected ? "" : actor.id)}
                        className={cn(
                          "w-full text-[9px] font-bold py-1.5 rounded-md transition-colors",
                          isSelected ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200"
                        )}
                      >
                        {isSelected ? "✓ Locked" : "Select Actor"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


// ============================================================================
// ✨ 2. THE MAIN STORYTELLING SETUP COMPONENT
// ============================================================================

type StoryboardScene = any & {
  videoUrl?: string | null;
  isGeneratingVideo?: boolean;
  prompt?: string;
  aiModel?: string;
  useEndFrame?: boolean;

  audioPrompt?: string;
  sceneAudioUrl?: string | null;
  sceneAudioPublicUrl?: string | null;
  audioName?: string;
  isGeneratingAudio?: boolean;
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

  // ✨ STATE: Digital Casting Room
  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [isCastingOpen, setIsCastingOpen] = useState(false);
  const [enableCharacterLock, setEnableCharacterLock] = useState(false);
  const [isCharacterLockModalOpen, setIsCharacterLockModalOpen] = useState(false);

  // Global Actor selection
  const [selectedActorA, setSelectedActorA] = useState<string>("");

  useEffect(() => {
    const savedActors = localStorage.getItem('blink_saved_actors');
    if (savedActors) {
      try { setActors(JSON.parse(savedActors)); } catch (e) { }
    }
    const savedScenes = localStorage.getItem('blink_storyboard_scenes');
    if (savedScenes) {
      try { setBRollScenes(JSON.parse(savedScenes)); } catch (e) { }
    } else if (bRollScenes.length === 0) {
      const defaultScenes = Array.from({ length: 4 }).map((_, i) => ({
        id: crypto.randomUUID(),
        scene_number: i + 1,
        mode: "showcase",
        aiModel: "auto",
        useEndFrame: false,
        primaryFile: null,
        primaryPreview: null,
        secondaryFile: null,
        secondaryPreview: null,
        prompt: "",
        audioPrompt: "",
        sceneAudioUrl: null,
        sceneAudioPublicUrl: null,
        audioName: "",
        isGeneratingAudio: false,
        videoUrl: null,
        isGeneratingVideo: false
      }));
      setBRollScenes(defaultScenes);
    }
  }, []);

  useEffect(() => {
    if (bRollScenes.length > 0) localStorage.setItem('blink_storyboard_scenes', JSON.stringify(bRollScenes));
  }, [bRollScenes]);

  useEffect(() => {
    if (actors.length > 0) localStorage.setItem('blink_saved_actors', JSON.stringify(actors));
  }, [actors]);

  const [generatingSlot, setGeneratingSlot] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [suggestingPromptIndex, setSuggestingPromptIndex] = useState<number | null>(null);
  const [sendingAudioId, setSendingAudioId] = useState<string | null>(null);

  const [regenDialogState, setRegenDialogState] = useState<{ isOpen: boolean; sceneId: string | null; index: number | null; slotType: 'primary' | 'secondary'; promptText: string }>({
    isOpen: false, sceneId: null, index: null, slotType: 'primary', promptText: ""
  });

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [isWritingScript, setIsWritingScript] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const [frameReferenceFile, setFrameReferenceFile] = useState<File | null>(null);
  const [frameReferencePreview, setFrameReferencePreview] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");

  // ✨ Scene Reordering
  const moveSceneUp = (index: number) => {
    if (index <= 0) return;
    const newScenes = [...bRollScenes];
    [newScenes[index - 1], newScenes[index]] = [newScenes[index], newScenes[index - 1]];
    setBRollScenes(newScenes);
  };

  const moveSceneDown = (index: number) => {
    if (index >= bRollScenes.length - 1) return;
    const newScenes = [...bRollScenes];
    [newScenes[index], newScenes[index + 1]] = [newScenes[index + 1], newScenes[index]];
    setBRollScenes(newScenes);
  };

  // ✨ Apply AI Model to All Scenes
  const applyModelToAll = (targetModel: string) => {
    const newScenes = bRollScenes.map(s => ({ ...s, aiModel: targetModel }));
    setBRollScenes(newScenes);
  };


  const totalImageSlots = bRollScenes.reduce((count, scene) => count + 1 + (scene.useEndFrame ? 1 : 0), 0);
  const filledImageSlots = bRollScenes.reduce((count, scene) => count + (scene.primaryPreview ? 1 : 0) + (scene.useEndFrame && scene.secondaryPreview ? 1 : 0), 0);
  const hasAnyImages = filledImageSlots > 0;
  const allVideosGenerated = bRollScenes.length > 0 && bRollScenes.every(s => s.videoUrl);

  const getLabels = (mode: string) => {
    switch (mode) {
      case "keyframe": return { primary: "Start Frame", secondary: "End Frame" };
      case "ugc": return { primary: "Product Shot", secondary: "Influencer Face" };
      case "clothing": return { primary: "Garment Flatlay", secondary: "Model Reference" };
      case "logo_reveal": return { primary: "Logo/Product", secondary: "End State" };
      case "showcase":
      default: return { primary: "Start Frame", secondary: "End Frame" };
    }
  };

  const callN8n = async (mode: 'director' | 'generator' | 'manual' | 'scene_video_generator', body: any) => {
    const endpoint = "/api/video/nano-banana";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...body })
    });
    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch (e) { throw new Error(`Server returned an invalid response.`); }
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

  const base64ToBlob = (base64: string, mimeType: string) => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const generateScriptAndAudio = async (): Promise<string[]> => {
    setIsWritingScript(true);
    let generatedPrompts: string[] = [];
    try {
      const totalDuration = bRollScenes.length * 8;

      const sceneConfigs = bRollScenes.map(scene => ({
        mode: scene.mode,
        aiModel: scene.aiModel
      }));

      const directorData = await callN8n('director', {
        clientId: clientId,
        prompt: `Concept: ${bRollConcept}\n\nCRITICAL: Break this concept into ${bRollScenes.length} scenes. For each scene, you MUST write the "image_prompt" in a highly descriptive narrative script format. Example: "Outdoor terrace of a European villa... a young woman sits opposite a man. The camera zooms in, the woman smiles and says, 'These trees will turn yellow...' The man lowers his head and says, 'But they'll be green again.'" Include exact spoken dialogue in quotes!`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        sceneConfigs: sceneConfigs,
        totalDuration: totalDuration,
        sceneCount: bRollScenes.length
      });

      const scenesData = directorData.scenes || [];
      generatedPrompts = bRollScenes.map((scene, i) => {
        const newVisualPrompt = scenesData[i]?.video_prompt || scenesData[i]?.image_prompt || "";
        const newAudioPrompt = scenesData[i]?.audio_prompt || scenesData[i]?.narration || scenesData[i]?.script || "";
        if (!scene.prompt?.trim()) updateScene(scene.id, "prompt", newVisualPrompt);
        if (!scene.audioPrompt?.trim()) updateScene(scene.id, "audioPrompt", newAudioPrompt);
        return scene.prompt?.trim() || newVisualPrompt;
      });

      if (directorData.audioUrl) setGeneratedAudioUrl(directorData.audioUrl);
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
        prompt: `Write a visual image prompt for Scene ${index + 1} based on this concept: "${bRollConcept}". The camera movement is "${sceneMode}". CRITICAL: Write it in a highly descriptive narrative script format. Include setting, character actions, camera movements, and exact spoken dialogue in quotes (e.g., The camera zooms in, the woman says, 'Only about summers with you.').`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: "video_native",
        totalDuration: 8
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

  const handleCustomAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, sceneId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const localUrl = URL.createObjectURL(file);
      const defaultName = file.name.replace(/\.[^/.]+$/, "");

      updateScene(sceneId, "sceneAudioUrl", localUrl);
      updateScene(sceneId, "audioPrompt", `[Custom Upload] ${file.name}`);
      updateScene(sceneId, "audioName", defaultName);

      const audioPath = `videos/${clientId}/custom_audio_${Date.now()}_${file.name}`;
      await supabase.storage.from("assets").upload(audioPath, file);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

      updateScene(sceneId, "sceneAudioPublicUrl", publicUrl);

    } catch (err) {
      console.error("Audio upload failed:", err);
      alert("Failed to process uploaded audio file.");
    }
  };

  const handleGenerateSceneAudio = async (index: number) => {
    const scene = bRollScenes[index];
    const promptText = scene.audioPrompt;

    if (!promptText?.trim() || !clientId) return alert("Please write an audio script first.");

    updateScene(scene.id, "isGeneratingAudio", true);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: promptText })
      });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const localUrl = URL.createObjectURL(blob);
      const audioPath = `videos/${clientId}/scene_${index + 1}_audio_${Date.now()}.mp3`;

      await supabase.storage.from("assets").upload(audioPath, blob);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

      updateScene(scene.id, "sceneAudioUrl", localUrl);
      updateScene(scene.id, "audioName", `Scene ${index + 1} Voice`);
      updateScene(scene.id, "sceneAudioPublicUrl", publicUrl);

    } catch (err: any) {
      console.error("Audio generation failed:", err);
      alert(`Audio generation failed: ${err.message}`);
    } finally {
      updateScene(scene.id, "isGeneratingAudio", false);
    }
  };

  const handleRemoveSceneAudio = (sceneId: string) => {
    updateScene(sceneId, "sceneAudioUrl", null);
    updateScene(sceneId, "sceneAudioPublicUrl", null);
    updateScene(sceneId, "audioName", "");
  };

  const handleSendAudioToEditor = async (sceneId: string, audioName: string, localUrl: string, existingPublicUrl?: string | null) => {
    if (!clientId || !localUrl) return;
    setSendingAudioId(sceneId);

    try {
      let finalPublicUrl = existingPublicUrl;

      if (!finalPublicUrl) {
        const response = await fetch(localUrl);
        const blob = await response.blob();
        const audioPath = `videos/${clientId}/saved_audio_${Date.now()}.mp3`;
        await supabase.storage.from("assets").upload(audioPath, blob);
        finalPublicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;
      }

      const { error } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: "generated_audio",
        caption: audioName || "Unnamed Audio",
        status: "approved",
        video_urls: [finalPublicUrl],
        image_urls: [finalPublicUrl],
        ai_model: "audio_asset"
      });

      if (error) throw error;
      alert("✅ Audio saved to Video Editor Library!");

    } catch (err: any) {
      alert(`Failed to save audio: ${err.message}`);
    } finally {
      setSendingAudioId(null);
    }
  };

  // ✨ IMAGE GENERATION: Now injects the Stitched Actor Sheet if Lock is enabled
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

      // ✨ Inject Actor Sheet if Character Lock is enabled
      let characterSheetUrlA: string | null = null;
      if (enableCharacterLock && selectedActorA) {
        const actorA = actors.find(a => a.id === selectedActorA);
        if (actorA) characterSheetUrlA = actorA.stitchedSheetUrl;
      }

      const genData = await callN8n('generator', {
        prompt: promptToUse,
        refImage: styleRefUrl || previousUrl || null,
        styleRefImage: styleRefUrl || null,
        previousFrameImage: previousUrl,
        characterRefA: characterSheetUrlA
      });

      if (genData.url) {
        updateScene(scene.id, type === 'primary' ? "primaryPreview" : "secondaryPreview", genData.url);
        updateScene(scene.id, type === 'primary' ? "primaryFile" : "secondaryFile", null);
        updateScene(scene.id, "videoUrl", null);

        // ✨ Auto-save generated image to Supabase
        try {
          await supabase.from("content").insert({
            client_id: clientId,
            content_type: "generated_image",
            caption: `Storyboard: Scene ${slotIndex + 1} ${type === 'primary' ? 'Start' : 'End'} Frame`,
            status: "approved",
            image_urls: [genData.url],
            ai_model: "nano-banana-2"
          });
        } catch (e) { console.error("Auto-save image failed", e); }
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
      try { currentPrompts = await generateScriptAndAudio(); } catch (e) { setIsGeneratingAllImages(false); return; }
    }

    for (let i = 0; i < bRollScenes.length; i++) {
      if (!bRollScenes[i].primaryPreview && currentPrompts[i]) {
        await handleGenerateSlot(i, 'primary', currentPrompts[i]);
      }
      if (bRollScenes[i].useEndFrame && !bRollScenes[i].secondaryPreview && currentPrompts[i]) {
        await handleGenerateSlot(i, 'secondary', currentPrompts[i]);
      }
    }
    setIsGeneratingAllImages(false);
  };

  // ✨ VIDEO GENERATION: Now injects the Stitched Actor Sheet if Lock is enabled
  const handleGenerateSingleVideo = async (slotIndex: number) => {
    const scene = bRollScenes[slotIndex];
    if (!scene.primaryPreview || !clientId) return alert("Please generate or upload a primary image first.");
    if (scene.useEndFrame && !scene.secondaryPreview) return alert("You enabled the End Frame toggle. Please generate or upload an End Frame before animating.");

    updateScene(scene.id, "isGeneratingVideo", true);

    try {
      let finalPrimaryUrl = scene.primaryPreview;

      // ✨ Extract character sheet (NOT into End Frame)
      let characterSheetA = null;
      if (enableCharacterLock) {
        characterSheetA = actors.find(a => a.id === selectedActorA)?.stitchedSheetUrl || null;
      }

      let finalSecondaryUrl = scene.useEndFrame ? scene.secondaryPreview : null;

      if ((scene.mode === 'ugc' || scene.mode === 'clothing') && finalSecondaryUrl && !characterSheetA) {
        const mergePrompt = scene.mode === 'ugc'
          ? `A highly realistic, viral TikTok style smartphone photo of an influencer interacting with the product. ${scene.prompt || bRollConcept}`
          : `A highly realistic fashion editorial photo of a model wearing the clothing. ${scene.prompt || bRollConcept}`;

        const mergedImageData = await callN8n('generator', {
          prompt: mergePrompt,
          refImage: scene.primaryPreview,
          styleRefImage: scene.secondaryPreview,
        });

        if (mergedImageData.url) {
          finalPrimaryUrl = mergedImageData.url;
          finalSecondaryUrl = null;
          updateScene(scene.id, "primaryPreview", finalPrimaryUrl);
          updateScene(scene.id, "secondaryPreview", null);
          updateScene(scene.id, "useEndFrame", false);
        }
      }

      if (finalPrimaryUrl.startsWith('data:')) {
        const mimeMatch = finalPrimaryUrl.match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const blob = base64ToBlob(finalPrimaryUrl, mime);
        const path = `videos/${clientId}/scene_frame_1_${Date.now()}.png`;
        await supabase.storage.from("assets").upload(path, blob);
        finalPrimaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      }

      if (finalSecondaryUrl && finalSecondaryUrl.startsWith('data:')) {
        const mimeMatch = finalSecondaryUrl.match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const blob = base64ToBlob(finalSecondaryUrl, mime);
        const path = `videos/${clientId}/scene_frame_2_${Date.now()}.png`;
        await supabase.storage.from("assets").upload(path, blob);
        finalSecondaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      }

      const { data: insertData, error: insertError } = await supabase
        .from('content')
        .insert({
          client_id: clientId,
          content_type: "sequence_clip",
          caption: `🎬 Scene ${slotIndex + 1} Video`,
          status: "draft",
          ai_model: scene.aiModel || "auto"
        })
        .select('id')
        .single();

      if (insertError || !insertData) throw new Error(`Database Error: Failed to create placeholder row.`);
      const postId = insertData.id;

      await callN8n('scene_video_generator', {
        post_id: postId,
        client_id: clientId,
        ai_model_override: scene.aiModel || "auto",
        scene_data: {
          visual_prompt: scene.prompt || bRollConcept,
          video_mode: scene.mode,
          duration: "8",
          frames: {
            start_frame: finalPrimaryUrl,
            end_frame: finalSecondaryUrl
          },
          audio: {
            script: scene.audioPrompt || null,
            audio_url: scene.sceneAudioPublicUrl || null
          },
          casting: enableCharacterLock ? {
            actor_1_sheet: characterSheetA
          } : null
        }
      });

      let attempts = 0;
      const maxAttempts = 180;
      let foundVideoUrl = null;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        const { data } = await supabase.from('content').select('*').eq('id', postId).single();
        if (data) {
          if (data.status === 'failed') throw new Error("n8n Video Engine reported a failure. Check your n8n logs.");
          let urls = [];
          if (Array.isArray(data.video_urls) && data.video_urls.length > 0) urls = data.video_urls;
          else if (typeof data.video_urls === 'string') { try { urls = JSON.parse(data.video_urls); } catch (e) { urls = [data.video_urls]; } }

          if (urls.length === 0) {
            if (Array.isArray(data.image_urls)) urls = data.image_urls;
            else if (typeof data.image_urls === 'string') { try { urls = JSON.parse(data.image_urls); } catch (e) { urls = [data.image_urls]; } }
          }
          const mp4Url = urls.find((u: string) => typeof u === 'string' && u.includes('.mp4'));
          if (mp4Url) { foundVideoUrl = mp4Url; break; }
        }
      }

      if (foundVideoUrl) updateScene(scene.id, "videoUrl", foundVideoUrl);
      else throw new Error("Video generation timed out after 15 minutes.");

    } catch (err: any) {
      console.error(`Failed to generate video for scene ${slotIndex + 1}:`, err);
      alert(`Failed to retrieve video: ${err.message}`);
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
    if (confirm("Are you sure you want to delete this video and re-enable image editing?")) {
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

  const handleFrameReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrameReferenceFile(file);
    setFrameReferencePreview(URL.createObjectURL(file));
  };

  const handleRefDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      setFrameReferenceFile(file);
      setFrameReferencePreview(URL.createObjectURL(file));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  return (
    <div className="flex flex-row gap-6 animate-in fade-in w-full h-[calc(100vh-160px)] min-h-[600px] pb-4">

      {/* ✨ RENDER CASTING ROOM MODAL */}
      <CastingRoomModal
        open={isCastingOpen}
        onClose={() => setIsCastingOpen(false)}
        actors={actors}
        onSaveActor={(newActor) => setActors([...actors, newActor])}
        onDeleteActor={(id) => { setActors(actors.filter(a => a.id !== id)); if (selectedActorA === id) setSelectedActorA(""); }}
        selectedActorA={selectedActorA}
        setSelectedActorA={setSelectedActorA}
        callN8n={callN8n}
        clientId={clientId}
      />

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
              const isNativeAudio = scene.aiModel === 'bytedance/seedance-1.5-pro' || scene.aiModel === 'replicate:openai/sora-2';
              return (
                <div key={scene.id} className={cn(
                  "relative rounded-xl border-2 overflow-hidden flex flex-col transition-all duration-200 group bg-white",
                  scene.videoUrl ? "border-green-300 shadow-md" : (scene.primaryPreview ? "border-purple-300 shadow-sm" : "border-dashed border-gray-300")
                )}>
                  {/* ── Scene Header ── */}
                  <div className="bg-gray-50/80 border-b border-gray-100 px-4 py-2.5 flex flex-wrap gap-2 items-center justify-between shrink-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[11px] font-black text-gray-500 tracking-wider uppercase bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">
                        SCENE {index + 1}
                      </span>
                      <select value={scene.mode} onChange={(e) => updateScene(scene.id, "mode", e.target.value)} className="text-xs font-bold rounded border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-1 px-2 bg-white text-gray-700 cursor-pointer">
                        {SCENE_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>

                      <select value={scene.aiModel || "auto"} onChange={(e) => updateScene(scene.id, "aiModel", e.target.value)} className="text-xs font-bold rounded border-purple-200 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-1 px-2 bg-purple-50 text-purple-700 cursor-pointer">
                        <option value="auto">✨ Auto Engine</option>
                        <option value="replicate:openai/sora-2">Sora 2</option>
                        <option value="bytedance/seedance-1.5-pro">Seedance Pro</option>
                        <option value="replicate:prunaai/p-video">Pruna (Fast)</option>
                        <option value="kling-3.0/video">Kling 3.0</option>
                      </select>
                      {/* <button
                        onClick={() => applyModelToAll(scene.aiModel || "auto")}
                        title="Apply this model to all scenes"
                        className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-100 rounded transition-colors bg-white border border-purple-200 shadow-sm"
                      >
                        <Layers className="h-3.5 w-3.5" />
                      </button> */}
                    </div>
                    <div className="flex items-center gap-3">


                      <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 border border-gray-200 rounded shadow-sm hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={scene.useEndFrame || false}
                          onChange={(e) => updateScene(scene.id, "useEndFrame", e.target.checked)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Use End Frame</span>
                      </label>

                      <button
                        onClick={() => moveSceneUp(index)}
                        disabled={index === 0}
                        title="Move scene up"
                        className={cn("p-1.5 rounded transition-colors bg-white shadow-sm border border-gray-200", index === 0 ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50")}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveSceneDown(index)}
                        disabled={index === bRollScenes.length - 1}
                        title="Move scene down"
                        className={cn("p-1.5 rounded transition-colors bg-white shadow-sm border border-gray-200", index === bRollScenes.length - 1 ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50")}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
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
                            <label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-gray-400"><ImageIcon className="h-6 w-6 mb-1 opacity-30" /><p className="text-[9px] font-bold uppercase tracking-wider">Drop Start Frame</p><p className="text-[7px] font-medium text-gray-300 mt-0.5">OR leave blank for pure Text-to-Video</p></label>
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
                      <div className={cn("flex-1 flex flex-col gap-2 transition-opacity duration-300", !scene.useEndFrame && "opacity-40 grayscale pointer-events-none")}>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block truncate">{labels.secondary}</label>
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-lg overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50 flex items-center justify-center transition-colors group/upload">
                          {!scene.useEndFrame ? (
                            <div className="text-center p-2"><p className="text-[9px] font-bold text-gray-400 uppercase">Disabled</p><p className="text-[8px] text-gray-400 mt-1">Toggle "Use End Frame" to activate</p></div>
                          ) : generatingSlot?.index === index && generatingSlot.type === 'secondary' ? (
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

                    {/* Right Panel UI (Video + Audio) */}
                    <div className="w-full md:w-1/2 flex flex-col relative gap-2">
                      <div className="flex items-center justify-between shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                          {scene.videoUrl ? <><Video className="h-3 w-3 text-green-500" /> Generated Video & Audio</> : "Scene Director"}
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

                      <div className="flex-1 rounded-md overflow-hidden border border-gray-200 bg-gray-50 flex flex-col">
                        {scene.isGeneratingVideo ? (
                          <div className="flex-1 flex flex-col items-center justify-center bg-green-50/80 gap-2 p-4 min-h-[220px]">
                            <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
                            <span className="text-xs font-bold text-green-700 uppercase tracking-wider animate-pulse">Rendering Video...</span>
                            <span className="text-[10px] text-green-800 text-center px-4">Polling Supabase for the finished file...</span>
                            <button onClick={() => updateScene(scene.id, "isGeneratingVideo", false)} className="mt-3 text-[10px] font-bold text-red-600 hover:text-red-800 hover:underline px-3 py-1 bg-red-100/50 rounded-full transition-colors">Taking too long? Force Cancel</button>
                          </div>
                        ) : (
                          <div className="flex flex-col flex-1 h-full">

                            {scene.videoUrl ? (
                              <div className="w-full aspect-video bg-black relative shrink-0 border-b border-gray-200">
                                <video src={scene.videoUrl} controls className="w-full h-full object-contain" playsInline />
                              </div>
                            ) : (
                              <Textarea
                                value={scene.prompt}
                                onChange={(e) => updateScene(scene.id, "prompt", e.target.value)}
                                className="flex-1 w-full text-xs p-3 resize-none bg-white border-b border-gray-200 focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[120px]"
                                placeholder={
                                  scene.mode === 'ugc'
                                    ? "UGC Action: Describe the influencer (e.g., holding product, looking shocked, pointing at text)..."
                                    : isNativeAudio
                                      ? "Describe your scene...\n\nExample: Slow panning shot of a neon city. [sound of rain]. A man turns and says \"This is incredible!\""
                                      : "Describe your scene...\n\nExample: Cinematic tracking shot following a woman through a sunlit forest..."
                                }
                              />
                            )}

                            {/* ✨ PROMPT CHARACTER COUNTER */}
                            {!scene.videoUrl && (
                              <div className={cn("text-right text-[10px] px-3 py-1 border-b border-gray-100", (scene.prompt?.length || 0) > 500 ? "text-red-400 font-bold" : "text-gray-400")}>
                                {scene.prompt?.length || 0} / 500
                              </div>
                            )}

                            {/* ✨ QUICK INJECT PROMPT HELPERS */}
                            {!scene.videoUrl && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0">
                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mr-1">Inject:</span>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[9px] font-bold text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-full shadow-sm cursor-pointer hover:border-purple-200 hover:text-purple-600 transition-colors appearance-none"
                                >
                                  <option value="" disabled hidden>🎥 Add Camera...</option>
                                  <option value=" Cinematic tracking shot, ">Cinematic Tracking</option>
                                  <option value=" Slow drone flyover, ">Drone Flyover</option>
                                  <option value=" Handheld shaky cam, ">Handheld Shaky</option>
                                  <option value=" Extreme macro close-up, ">Macro Close-up</option>
                                  <option value=" Smooth dolly-in, ">Smooth Dolly-in</option>
                                </select>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[9px] font-bold text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-full shadow-sm cursor-pointer hover:border-blue-200 hover:text-blue-600 transition-colors appearance-none"
                                >
                                  <option value="" disabled hidden>🔊 Add Sound FX...</option>
                                  <option value=" [ambient street noise] ">Street Noise</option>
                                  <option value=" [heavy rain and thunder] ">Rain & Thunder</option>
                                  <option value=" [cinematic bass drop] ">Bass Drop</option>
                                  <option value=" [muffled cafe chatter] ">Cafe Chatter</option>
                                  <option value=" [whoosh transition] ">Whoosh Transition</option>
                                </select>
                                <button
                                  onClick={() => updateScene(scene.id, "prompt", (scene.prompt || "") + ' The character says "Type your script here..." ')}
                                  className="inline-flex items-center text-[9px] font-bold text-gray-500 hover:text-emerald-600 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 px-2 py-1 rounded-full transition-colors shadow-sm"
                                >
                                  <MessageSquare className="w-3 h-3 mr-1" /> Dialogue
                                </button>
                              </div>
                            )}

                            {/* ✨ DYNAMIC AUDIO UI */}
                            {(() => {
                              const isNativeAudioModel = scene.aiModel === 'bytedance/seedance-1.5-pro' || scene.aiModel === 'replicate:openai/sora-2';

                              return (
                                <div className="flex flex-col flex-1 bg-white">
                                  {!isNativeAudioModel && (
                                    <Textarea
                                      value={scene.audioPrompt || ""}
                                      onChange={(e) => updateScene(scene.id, "audioPrompt", e.target.value)}
                                      className="flex-1 w-full text-xs p-3 resize-none bg-blue-50/20 border-b border-blue-100 focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[70px]"
                                      placeholder="Optional Voiceover: Type English narration script or upload an audio file below..."
                                    />
                                  )}

                                  {isNativeAudioModel ? (
                                    <div className="p-3 bg-blue-50 border-b border-blue-100">
                                      <div className="flex items-start gap-2 bg-blue-100 text-blue-800 text-[10px] font-bold px-3 py-2.5 rounded-lg border border-blue-200">
                                        <Mic className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>Native Audio Engine Selected: Type exact dialogue in quotes within your visual prompt above. Custom audio uploads are not required/supported.</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 border-b border-blue-100 bg-blue-50 flex flex-col gap-2 shrink-0">
                                      {scene.sceneAudioUrl ? (
                                        <div className="flex flex-col gap-2 w-full">
                                          <div className="flex items-center gap-2">
                                            <audio controls src={scene.sceneAudioUrl} className="h-8 flex-1 w-full min-w-0" />
                                            <button onClick={() => handleRemoveSceneAudio(scene.id)} className="p-1.5 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors" title="Delete Track">
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                          <div className="flex gap-2 w-full items-center">
                                            <input type="text" value={scene.audioName || ""} onChange={(e) => updateScene(scene.id, "audioName", e.target.value)} className="flex-1 text-[11px] font-bold text-blue-900 px-2 py-1.5 rounded border border-blue-200 focus:outline-blue-400 bg-white min-w-0" placeholder="Name this clip..." />
                                            <Button size="sm" onClick={() => handleSendAudioToEditor(scene.id, scene.audioName || `Scene Audio`, scene.sceneAudioUrl!, scene.sceneAudioPublicUrl)} disabled={sendingAudioId === scene.id} className="h-8 px-2 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0">
                                              {sendingAudioId === scene.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                                          <span className="text-[9px] font-medium text-blue-500 uppercase tracking-wider truncate hidden xl:inline-block">
                                            {scene.audioPrompt ? "Ready for TTS" : "Add script"}
                                          </span>
                                          <div className="flex gap-1.5 shrink-0 w-full xl:w-auto justify-end">
                                            <label className="flex items-center justify-center h-8 px-3 bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 rounded-md text-[11px] font-bold cursor-pointer transition-colors shadow-sm flex-1 xl:flex-none">
                                              <Upload className="w-3 h-3 xl:mr-1.5" /> <span className="hidden xl:inline">Upload</span>
                                              <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleCustomAudioUpload(e, scene.id)} />
                                            </label>
                                            <Button size="sm" onClick={() => handleGenerateSceneAudio(index)} disabled={!scene.audioPrompt || scene.isGeneratingAudio || scene.audioPrompt.startsWith("[Custom Upload]")} className={cn("h-8 text-[11px] font-bold px-3 transition-colors flex-1 xl:flex-none", scene.audioPrompt && !scene.audioPrompt.startsWith("[Custom Upload]") ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" : "bg-blue-200 text-blue-400")}>
                                              {scene.isGeneratingAudio ? <Loader2 className="w-3.5 h-3.5 xl:mr-1.5 animate-spin" /> : <Mic className="w-3.5 h-3.5 xl:mr-1.5" />} <span className="hidden xl:inline">Generate TTS</span>
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* ONLY SHOW IF NO VIDEO YET: Video Generation Toolbar */}
                            {!scene.videoUrl && (
                              <div className="p-2 bg-gray-100 flex justify-between items-center shrink-0">
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
                            )}

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

          {/* ✨ NEW: GLOBAL ACTOR SELECTION & CASTING ROOM */}
          <div className="mb-5 pb-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Lock className="h-4 w-4 text-pink-500" /> Character Consistency Lock
              </label>
              <div className="flex items-center gap-3">
                <Button onClick={() => setIsCastingOpen(true)} size="sm" variant="outline" className="h-7 text-[10px] font-bold border-pink-200 text-pink-600 hover:bg-pink-50 px-3">
                  <Users className="w-3.5 h-3.5 mr-1.5" /> Open Casting Room
                </Button>
                <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 border border-gray-200 rounded shadow-sm hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={enableCharacterLock} onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableCharacterLock(checked);
                    if (checked && actors.length > 0) setIsCharacterLockModalOpen(true);
                  }} className="rounded text-pink-600 focus:ring-pink-500 cursor-pointer" />
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Enable Lock</span>
                </label>
              </div>
            </div>

            {enableCharacterLock && selectedActorA && (
              <div className="flex flex-wrap gap-2 mt-2 animate-in fade-in">
                {(() => {
                  const actorA = actors.find(a => a.id === selectedActorA);
                  return actorA ? (
                    <span className="inline-flex items-center gap-1.5 bg-pink-100 text-pink-800 text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 shadow-sm">
                      <Lock className="w-3 h-3" /> {actorA.name}
                    </span>
                  ) : null;
                })()}
                <button onClick={() => setIsCharacterLockModalOpen(true)} className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-pink-500 px-2 py-1 rounded-full hover:bg-pink-50 transition-colors">
                  <Settings2 className="w-3 h-3" /> Change
                </button>
              </div>
            )}

            {enableCharacterLock && !selectedActorA && (
              <button onClick={() => setIsCharacterLockModalOpen(true)} className="mt-2 w-full flex items-center justify-center gap-2 bg-pink-50 hover:bg-pink-100 text-pink-600 text-xs font-bold py-2.5 rounded-lg border border-dashed border-pink-200 transition-colors animate-in fade-in">
                <UserPlus className="w-3.5 h-3.5" /> Select Actor to Lock
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-2 mb-4">
            <div className="flex items-center gap-6"><span className="text-sm font-bold text-purple-700 flex items-center gap-2 border-b-2 border-purple-600 pb-1.5"><Settings2 className="w-4 h-4" /> Master Director</span></div>
            <div className="flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100"><Palette className="h-4 w-4 text-purple-500" /><select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="bg-transparent text-xs font-bold text-purple-700 focus:outline-none cursor-pointer">{VISUAL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
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
              if (scene.useEndFrame && scene.secondaryPreview) {
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

        <div className="shrink-0 border-t border-orange-200/50 pt-4"><label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 block flex items-center gap-1"><Upload className="h-3 w-3" /> Drop Style Reference</label><div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-orange-300 bg-white/60 hover:bg-white transition-colors overflow-hidden group/ref flex flex-col">{frameReferencePreview ? (<><img src={frameReferencePreview} className="w-full h-full object-cover" /><button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full shadow-sm opacity-0 group-hover/ref:opacity-100 transition-opacity"><X className="h-4 w-4" /></button><div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1 font-bold tracking-widest uppercase">Style Locked</div></>) : (<label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-orange-400 hover:text-orange-500"><ImageIcon className="h-6 w-6 mb-2 opacity-50" /><span className="text-[10px] font-bold text-center leading-tight uppercase">Click or Drop<br />Image Here</span></label>)}<input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} /></div></div>
      </div>

      <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} />
      {previewModalImg && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewModalImg(null)}><div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}><button onClick={() => setPreviewModalImg(null)} className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"><X className="h-6 w-6" /></button><img src={previewModalImg} className="w-full h-full object-contain rounded-lg shadow-2xl" alt="Preview Enlarged" /></div></div>)}
      {/* ✨ CHARACTER LOCK SELECTION MODAL */}
      <Dialog open={isCharacterLockModalOpen} onOpenChange={(open) => !open && setIsCharacterLockModalOpen(false)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-pink-600"><Lock className="w-5 h-5" /> Select Actor to Lock</DialogTitle>
            <DialogDescription>Click on an actor to lock their character consistency across all scenes.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {actors.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold">No actors yet</p>
                <p className="text-xs mt-1">Use the Casting Room to create actors first.</p>
                <Button size="sm" variant="outline" className="mt-3 border-pink-200 text-pink-600 hover:bg-pink-50" onClick={() => { setIsCharacterLockModalOpen(false); setIsCastingOpen(true); }}>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Open Casting Room
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {actors.map(actor => {
                  const isSelected = selectedActorA === actor.id;
                  return (
                    <button
                      key={actor.id}
                      onClick={() => setSelectedActorA(isSelected ? "" : actor.id)}
                      className={cn(
                        "rounded-xl p-2 flex flex-col gap-2 transition-all text-left",
                        isSelected ? "bg-pink-50 border-2 border-pink-500 ring-2 ring-pink-200 shadow-md" :
                          "bg-white border border-gray-200 hover:border-pink-300 hover:shadow-sm"
                      )}
                    >
                      <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 relative">
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover" />
                        {isSelected && <div className="absolute top-1 left-1 bg-pink-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow">Locked</div>}
                      </div>
                      <span className={cn(
                        "text-xs font-bold text-center truncate px-1",
                        isSelected ? "text-gray-800" : "text-gray-600"
                      )}>{actor.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedActorA("")}>Clear Selection</Button>
            <Button onClick={() => setIsCharacterLockModalOpen(false)} className="bg-pink-600 hover:bg-pink-700 text-white font-bold">
              <CheckCircle className="w-4 h-4 mr-2" /> Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenDialogState.isOpen} onOpenChange={(open) => !open && setRegenDialogState(prev => ({ ...prev, isOpen: false }))}><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle className="flex items-center gap-2 text-purple-700"><Wand2 className="h-5 w-5" /> Regenerate {regenDialogState.slotType === 'primary' ? 'Primary' : 'Secondary'} Image</DialogTitle><DialogDescription>Edit the prompt below to refine the generation for this specific slot in Scene {regenDialogState.index !== null ? regenDialogState.index + 1 : ''}.</DialogDescription></DialogHeader><div className="py-4"><Textarea value={regenDialogState.promptText} onChange={(e) => setRegenDialogState(prev => ({ ...prev, promptText: e.target.value }))} placeholder="Enter a detailed visual prompt..." className="h-32 resize-none bg-gray-50 border-gray-200 focus-visible:ring-purple-300" /></div><DialogFooter><Button variant="outline" onClick={() => setRegenDialogState(prev => ({ ...prev, isOpen: false }))}>Cancel</Button><Button onClick={handleConfirmRegen} className="bg-purple-600 hover:bg-purple-700 text-white font-bold"><Sparkles className="h-4 w-4 mr-2" /> Regenerate Slot</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}