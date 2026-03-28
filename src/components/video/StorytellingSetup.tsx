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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl custom-scrollbar">
        <DialogHeader className="border-b border-[#57707A]/20 pb-4">
          <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl"><Users className="w-5 h-5" /> Digital Casting Room</DialogTitle>
          <DialogDescription className="text-[#989DAA] font-medium">Save actors to use consistently across all your video scenes.</DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4">
            <div>
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Actor Name</label>
              <Input value={actorName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActorName(e.target.value)} placeholder="e.g., Emma (Lead)" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-lg shadow-inner h-11" />
            </div>

            {/* Tab Toggle: Manual Upload vs Generate with AI */}
            <div className="flex gap-1 p-1 bg-[#191D23] border border-[#57707A]/30 rounded-lg shadow-inner">
              <button
                onClick={() => setCreationMode("manual")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "manual" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/40" : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
                )}
              >
                <Upload className="w-3.5 h-3.5" /> Manual Upload (Stitch)
              </button>
              <button
                onClick={() => setCreationMode("ai")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "ai" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/40" : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate with AI
              </button>
            </div>

            {creationMode === "manual" ? (
              /* Manual Upload View */
              <>
                <div>
                  <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 block">Upload Angles (The more, the better)</label>
                  <div className="grid grid-cols-3 gap-4">
                    {ANGLE_LABELS.map((label, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-center text-[#DEDCDC]/50 uppercase tracking-widest">{label}</span>
                        <div className="aspect-square bg-[#191D23] border-2 border-dashed border-[#57707A]/40 rounded-xl relative overflow-hidden group hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 transition-all shadow-inner">
                          {previews[i] ? (
                            <>
                              <img src={previews[i]!} className="w-full h-full object-cover" />
                              <button onClick={() => removeAngle(i)} className="absolute top-1.5 right-1.5 bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:scale-110 transition-all shadow-md"><X className="w-3 h-3" /></button>
                            </>
                          ) : (
                            <label className="w-full h-full flex items-center justify-center cursor-pointer">
                              <Upload className="w-5 h-5 text-[#57707A] group-hover:text-[#C5BAC4] transition-colors" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAngleUpload(i, e)} />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-5 border-t border-[#57707A]/20">
                  <Button variant="outline" className="flex-1 bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 h-11 font-bold rounded-lg" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-11 rounded-lg shadow-lg shadow-[#C5BAC4]/10 transition-all" onClick={handleSaveAndStitch} disabled={isStitching}>
                    {isStitching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    {isStitching ? "Stitching Sheet..." : "Save & Stitch Actor"}
                  </Button>
                </div>
              </>
            ) : (
              /* Generate with AI View */
              <>
                <div>
                  <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Character Description</label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., A 30-year-old female astronaut with red hair, wearing a white NASA spacesuit"
                    className="h-32 resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-lg shadow-inner text-sm custom-scrollbar"
                  />
                  <p className="text-[10px] text-[#989DAA] mt-2 font-medium">We'll automatically generate a multi-angle character reference sheet from this description.</p>
                </div>

                <div className="flex gap-3 pt-5 border-t border-[#57707A]/20">
                  <Button variant="outline" className="flex-1 bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 h-11 font-bold rounded-lg" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-11 rounded-lg shadow-lg shadow-[#C5BAC4]/10 transition-all" onClick={handleAIGenerate} disabled={isGeneratingAI}>
                    {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {isGeneratingAI ? "Generating Sheet..." : "Generate Character Sheet"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <Button onClick={() => setIsCreating(true)} className="w-full bg-[#191D23] hover:bg-[#57707A]/20 text-[#C5BAC4] border border-[#57707A]/40 hover:border-[#C5BAC4]/50 shadow-sm h-12 rounded-xl font-bold transition-all">
              <UserPlus className="w-4 h-4 mr-2" /> Add New Actor
            </Button>

            {actors.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
                {actors.map(actor => {
                  const isSelected = selectedActorA === actor.id;
                  return (
                    <div key={actor.id} className={cn(
                      "rounded-xl p-2.5 bg-[#191D23] shadow-inner flex flex-col gap-3 transition-all relative border",
                      isSelected ? "border-[#C5BAC4] ring-1 ring-[#C5BAC4]/50" : "border-[#57707A]/30 hover:border-[#57707A]/80"
                    )}>
                      <button
                        onClick={() => confirm("Delete this actor?") && onDeleteActor(actor.id)}
                        className="absolute top-1.5 right-1.5 z-10 p-1.5 bg-red-500/90 hover:bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:opacity-100 transition-all scale-90 hover:scale-100"
                        title="Delete Actor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="aspect-video rounded-lg overflow-hidden bg-[#0F1115] border border-[#57707A]/20 relative group">
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        {isSelected && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-md">Locked</div>}
                      </div>
                      <span className="text-xs font-bold text-center text-[#DEDCDC] truncate px-1">{actor.name}</span>
                      <button
                        onClick={() => setSelectedActorA(isSelected ? "" : actor.id)}
                        className={cn(
                          "w-full text-[10px] font-bold py-2 rounded-lg transition-colors uppercase tracking-wider",
                          isSelected ? "bg-[#C5BAC4] text-[#191D23] shadow-md" : "bg-[#2A2F38] text-[#989DAA] hover:bg-[#57707A]/40 hover:text-[#DEDCDC] border border-[#57707A]/30"
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

    // ✅ FUNCTIONAL FIX: Inject strict no-text constraint to prevent burn-in text on images
    const NO_TEXT_CONSTRAINT = " CRITICAL: The generated image MUST NOT contain any overlay text, watermarks, burned-in captions, subtitles, or typographic elements unless explicitly requested in the prompt.";
    const safePrompt = promptToUse + NO_TEXT_CONSTRAINT;

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
        prompt: safePrompt,
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
          // ✅ FUNCTIONAL FIX: Always pass the current edited scene.prompt directly
          visual_prompt: scene.prompt?.trim() || bRollConcept,
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
    <div className="flex flex-row gap-6 animate-in fade-in duration-500 w-full h-[calc(100vh-160px)] min-h-[600px] pb-4">

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

        {/* Storyboard scroll area */}
        <div className="flex-1 bg-[#191D23]/60 rounded-2xl border border-[#57707A]/30 p-5 shadow-inner overflow-y-auto custom-scrollbar relative">
          <div className="flex items-center justify-between mb-5 sticky top-0 bg-[#191D23]/95 backdrop-blur-md z-10 py-3 border-b border-[#57707A]/20 -mx-2 px-2 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-[#DEDCDC] flex items-center gap-2 uppercase tracking-widest font-display">
                <Film className="h-5 w-5 text-[#C5BAC4]" /> Visual Storyboard
              </h3>
              <p className="text-xs text-[#989DAA] mt-0.5 font-medium">Write prompts, pick images, and generate videos.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-md border uppercase tracking-wider",
                hasAnyImages ? "bg-[#B3FF00]/10 border-[#B3FF00]/30 text-[#B3FF00]" : "bg-[#2A2F38] border-[#57707A]/30 text-[#57707A]"
              )}>
                {filledImageSlots}/{totalImageSlots} Images
              </span>
            </div>
          </div>

          <div className="flex flex-col space-y-8">
            {bRollScenes.map((scene, index) => {
              const labels = getLabels(scene.mode);
              const isNativeAudio = scene.aiModel === 'bytedance/seedance-1.5-pro' || scene.aiModel === 'replicate:openai/sora-2';
              return (
                <div key={scene.id} className={cn(
                  "relative rounded-xl border overflow-hidden flex flex-col transition-all duration-300 group bg-[#2A2F38] shadow-lg",
                  scene.videoUrl ? "border-[#B3FF00]/40 shadow-[0_0_20px_rgba(179,255,0,0.1)]" : (scene.primaryPreview ? "border-[#C5BAC4]/30 hover:border-[#C5BAC4]/50" : "border-dashed border-[#57707A]/40 hover:border-[#57707A]/60")
                )}>
                  {/* ── Scene Header ── */}
                  <div className="bg-[#191D23]/80 border-b border-[#57707A]/20 px-4 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[10px] font-black text-[#C5BAC4] tracking-widest uppercase bg-[#191D23] border border-[#C5BAC4]/30 px-2.5 py-1 rounded-md shadow-sm">
                        SCENE {index + 1}
                      </span>
                      <select value={scene.mode} onChange={(e) => updateScene(scene.id, "mode", e.target.value)} className="text-[11px] font-bold rounded-lg border border-[#57707A]/40 shadow-sm py-1.5 px-3 bg-[#2A2F38] text-[#DEDCDC] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C5BAC4]/50 hover:bg-[#57707A]/20 transition-colors appearance-none">
                        {SCENE_MODES.map((m) => <option key={m.id} value={m.id} className="bg-[#191D23]">{m.label}</option>)}
                      </select>

                      <select value={scene.aiModel || "auto"} onChange={(e) => updateScene(scene.id, "aiModel", e.target.value)} className="text-[11px] font-bold rounded-lg border border-[#57707A]/40 shadow-sm py-1.5 px-3 bg-[#2A2F38] text-[#B3FF00] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3FF00]/50 hover:bg-[#57707A]/20 transition-colors appearance-none">
                        <option value="auto" className="bg-[#191D23]">✨ Auto Engine</option>
                        <option value="replicate:openai/sora-2" className="bg-[#191D23]">Sora 2</option>
                        <option value="bytedance/seedance-1.5-pro" className="bg-[#191D23]">Seedance Pro</option>
                        <option value="replicate:prunaai/p-video" className="bg-[#191D23]">Pruna (Fast)</option>
                        <option value="kling-3.0/video" className="bg-[#191D23]">Kling 3.0</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">


                      <label className="flex items-center gap-2 cursor-pointer bg-[#2A2F38] px-2.5 py-1.5 border border-[#57707A]/40 rounded-lg hover:bg-[#57707A]/30 hover:border-[#C5BAC4]/40 transition-all shadow-sm group/check">
                        <input
                          type="checkbox"
                          checked={scene.useEndFrame || false}
                          onChange={(e) => updateScene(scene.id, "useEndFrame", e.target.checked)}
                          className="rounded border-[#57707A]/50 bg-[#191D23] text-[#C5BAC4] focus:ring-[#C5BAC4] cursor-pointer"
                        />
                        <span className="text-[9px] font-bold text-[#989DAA] group-hover/check:text-[#DEDCDC] uppercase tracking-widest transition-colors">Use End Frame</span>
                      </label>

                      <div className="flex gap-1 bg-[#191D23] rounded-lg p-0.5 border border-[#57707A]/30">
                        <button
                          onClick={() => moveSceneUp(index)}
                          disabled={index === 0}
                          title="Move scene up"
                          className={cn("p-1 rounded-md transition-colors", index === 0 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveSceneDown(index)}
                          disabled={index === bRollScenes.length - 1}
                          title="Move scene down"
                          className={cn("p-1 rounded-md transition-colors", index === bRollScenes.length - 1 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {bRollScenes.length > 1 && (
                        <button onClick={() => removeScene(scene.id)} title="Delete Scene" className="text-[#57707A] hover:text-white p-1.5 rounded-lg transition-colors bg-[#191D23] border border-[#57707A]/30 hover:bg-red-500/80 hover:border-red-500 shadow-sm ml-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Scene Content (Row Layout) ── */}
                  <div className="flex flex-col lg:flex-row p-5 gap-6">

                    {/* Image Area (Left) */}
                    <div className="w-full lg:w-1/2 flex gap-4 lg:border-r border-[#57707A]/20 lg:pr-6 relative">
                      {scene.videoUrl && <div className="absolute inset-0 bg-[#191D23]/80 backdrop-blur-[2px] z-30 cursor-not-allowed rounded-lg" title="Delete video to edit images"></div>}

                      {/* PRIMARY SLOT */}
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.primary}</label>
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "primary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                          {generatingSlot?.index === index && generatingSlot.type === 'primary' ? (
                            <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                          ) : scene.primaryPreview ? (
                            <><img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                              <div className="absolute top-2 right-2 flex gap-1.5 z-20">
                                <button type="button" onClick={() => setPreviewModalImg(scene.primaryPreview)} className="p-1.5 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-md shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => clearSlot(scene.id, "primary")} className="p-1.5 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-md shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-3.5 w-3.5" /></button>
                              </div></>
                          ) : (
                            <label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop Start Frame</p><p className="text-[8px] font-medium mt-1 text-[#57707A]/70">OR leave blank for Text-to-Video</p></label>
                          )}
                          <input id={`primary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "primary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                        </div>
                        <div className="flex gap-2 shrink-0 mt-1">
                          {scene.primaryPreview ? (
                            <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><Wand2 className="h-3 w-3 mr-1.5" /> Re-Gen</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><Wand2 className="h-3 w-3 mr-1.5" /> Generate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><FolderOpen className="h-3 w-3 mr-1.5" /> Library</Button>
                        </div>
                      </div>

                      {/* SECONDARY SLOT */}
                      <div className={cn("flex-1 flex flex-col gap-2 transition-all duration-300", !scene.useEndFrame && "opacity-40 grayscale pointer-events-none")}>
                        <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.secondary}</label>
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                          {!scene.useEndFrame ? (
                            <div className="text-center p-3"><p className="text-[10px] font-bold text-[#57707A]/50 uppercase tracking-widest">Disabled</p><p className="text-[8px] text-[#57707A]/40 mt-1.5 font-medium">Toggle "Use End Frame" to activate</p></div>
                          ) : generatingSlot?.index === index && generatingSlot.type === 'secondary' ? (
                            <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                          ) : scene.secondaryPreview ? (
                            <><img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                              <div className="absolute top-2 right-2 flex gap-1.5 z-20">
                                <button type="button" onClick={() => setPreviewModalImg(scene.secondaryPreview)} className="p-1.5 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-md shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => clearSlot(scene.id, "secondary")} className="p-1.5 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-md shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-3.5 w-3.5" /></button>
                              </div></>
                          ) : (
                            <label htmlFor={`secondary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop File</p></label>
                          )}
                          <input id={`secondary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "secondary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                        </div>
                        <div className="flex gap-2 shrink-0 mt-1">
                          {scene.secondaryPreview ? (
                            <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><Wand2 className="h-3 w-3 mr-1.5" /> Re-Gen</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><Wand2 className="h-3 w-3 mr-1.5" /> Generate</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'secondary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-2 rounded-lg transition-colors"><FolderOpen className="h-3 w-3 mr-1.5" /> Library</Button>
                        </div>
                      </div>
                    </div>

                    {/* Right Panel UI (Video + Audio) */}
                    <div className="w-full lg:w-1/2 flex flex-col relative gap-3">
                      <div className="flex items-center justify-between shrink-0 mb-1">
                        <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider flex items-center gap-1.5">
                          {scene.videoUrl ? <><Video className="h-4 w-4 text-[#B3FF00]" /> <span className="text-[#B3FF00]">Generated Video & Audio</span></> : <span className="text-[#DEDCDC]">Scene Director</span>}
                        </label>
                        {!scene.videoUrl && (
                          <button onClick={() => handleSuggestPrompt(scene.id, index)} disabled={suggestingPromptIndex === index} className="text-[#191D23] bg-[#C5BAC4] hover:bg-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-md shadow-[#C5BAC4]/10 border-none">
                            {suggestingPromptIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggest
                          </button>
                        )}
                        {scene.videoUrl && (
                          <button onClick={() => handleDeleteVideo(scene.id)} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 border border-red-500/30 hover:border-red-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-sm">
                            <Trash2 className="h-3.5 w-3.5" /> Delete Video
                          </button>
                        )}
                      </div>

                      <div className="flex-1 rounded-xl overflow-hidden border border-[#57707A]/30 bg-[#191D23] flex flex-col shadow-inner">
                        {scene.isGeneratingVideo ? (
                          <div className="flex-1 flex flex-col items-center justify-center bg-[#191D23]/90 backdrop-blur-sm gap-4 p-6 min-h-[220px]">
                            <Loader2 className="h-10 w-10 text-[#B3FF00] animate-spin" />
                            <span className="text-[11px] font-bold text-[#DEDCDC] uppercase tracking-widest animate-pulse">Rendering Video...</span>
                            <span className="text-[10px] text-[#989DAA] text-center font-medium">Polling for the finished file...</span>
                            {/* ✅ STEP 3: Friendly Force Cancel button */}
                            <button
                              onClick={() => updateScene(scene.id, "isGeneratingVideo", false)}
                              className="mt-4 text-[10px] font-bold text-[#57707A] hover:text-red-400 px-5 py-2.5 bg-[#2A2F38] border border-[#57707A]/40 hover:border-red-400/50 rounded-lg transition-colors shadow-sm"
                            >
                              Taking too long? Click here to cancel.
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col flex-1 h-full">

                            {scene.videoUrl ? (
                              <div className="w-full aspect-video bg-[#0F1115] relative shrink-0 border-b border-[#57707A]/30">
                                <video src={scene.videoUrl} controls className="w-full h-full object-contain" playsInline />
                              </div>
                            ) : (
                              <Textarea
                                value={scene.prompt}
                                onChange={(e) => updateScene(scene.id, "prompt", e.target.value)}
                                className="flex-1 w-full text-xs p-4 resize-none bg-transparent border-b border-[#57707A]/30 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[120px]"
                                placeholder={
                                  scene.mode === 'ugc'
                                    ? "UGC Action: Describe the influencer (e.g., holding product, looking shocked, pointing at text)..."
                                    : isNativeAudio
                                      ? "Describe your scene...\n\nExample: Slow panning shot of a neon city. [sound of rain]. A man turns and says \"This is incredible!\""
                                      : "Describe your scene...\n\nExample: Cinematic tracking shot following a woman through a sunlit forest..."
                                }
                              />
                            )}

                            {/* PROMPT CHARACTER COUNTER */}
                            {!scene.videoUrl && (
                              <div className={cn("text-right text-[9px] font-mono px-4 py-1.5 border-b border-[#57707A]/30 bg-[#2A2F38]/50", (scene.prompt?.length || 0) > 500 ? "text-red-400 font-bold" : "text-[#57707A]")}>
                                {scene.prompt?.length || 0} / 500
                              </div>
                            )}

                            {/* ✨ QUICK INJECT PROMPT HELPERS */}
                            {!scene.videoUrl && (
                              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#2A2F38] border-b border-[#57707A]/30 shrink-0">
                                <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[10px] font-bold text-[#C5BAC4] bg-[#191D23] border border-[#C5BAC4]/30 px-3 py-1.5 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 hover:bg-[#C5BAC4]/10 transition-colors appearance-none shadow-sm"
                                >
                                  <option value="" disabled hidden>🎥 Add Camera...</option>
                                  <option value=" Cinematic tracking shot, " className="bg-[#191D23]">Cinematic Tracking</option>
                                  <option value=" Slow drone flyover, " className="bg-[#191D23]">Drone Flyover</option>
                                  <option value=" Handheld shaky cam, " className="bg-[#191D23]">Handheld Shaky</option>
                                  <option value=" Extreme macro close-up, " className="bg-[#191D23]">Macro Close-up</option>
                                  <option value=" Smooth dolly-in, " className="bg-[#191D23]">Smooth Dolly-in</option>
                                </select>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[10px] font-bold text-[#B3FF00] bg-[#191D23] border border-[#B3FF00]/30 px-3 py-1.5 rounded-lg cursor-pointer hover:border-[#B3FF00]/60 hover:bg-[#B3FF00]/10 transition-colors appearance-none shadow-sm"
                                >
                                  <option value="" disabled hidden>🔊 Add Sound FX...</option>
                                  <option value=" [ambient street noise] " className="bg-[#191D23]">Street Noise</option>
                                  <option value=" [heavy rain and thunder] " className="bg-[#191D23]">Rain & Thunder</option>
                                  <option value=" [cinematic bass drop] " className="bg-[#191D23]">Bass Drop</option>
                                  <option value=" [muffled cafe chatter] " className="bg-[#191D23]">Cafe Chatter</option>
                                  <option value=" [whoosh transition] " className="bg-[#191D23]">Whoosh Transition</option>
                                </select>
                                <button
                                  onClick={() => updateScene(scene.id, "prompt", (scene.prompt || "") + ' The character says "Type your script here..." ')}
                                  className="inline-flex items-center text-[10px] font-bold text-[#DEDCDC] bg-[#191D23] hover:bg-[#57707A]/30 border border-[#57707A]/50 hover:border-[#DEDCDC]/50 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                                >
                                  <MessageSquare className="w-3 h-3 mr-1.5 text-[#57707A]" /> Dialogue
                                </button>
                              </div>
                            )}

                            {/* DYNAMIC AUDIO UI */}
                            {(() => {
                              const isNativeAudioModel = scene.aiModel === 'bytedance/seedance-1.5-pro' || scene.aiModel === 'replicate:openai/sora-2';

                              return (
                                <div className="flex flex-col flex-1 bg-[#191D23]">
                                  {!isNativeAudioModel && (
                                    <Textarea
                                      value={scene.audioPrompt || ""}
                                      onChange={(e) => updateScene(scene.id, "audioPrompt", e.target.value)}
                                      className="flex-1 w-full text-xs p-4 resize-none bg-transparent border-b border-[#57707A]/30 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[80px]"
                                      placeholder="Optional Voiceover: Type English narration script or upload an audio file below..."
                                    />
                                  )}

                                  {isNativeAudioModel ? (
                                    <div className="p-4 bg-[#2A2F38]/50 border-b border-[#57707A]/30">
                                      <div className="flex items-start gap-2.5 bg-[#191D23] text-[#989DAA] text-[10px] font-bold px-4 py-3 rounded-lg border border-[#57707A]/40 shadow-inner">
                                        <Mic className="w-4 h-4 shrink-0 text-[#C5BAC4]" />
                                        <span className="leading-relaxed">Native Audio Engine Selected: Type exact dialogue in quotes within your visual prompt above.</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 border-b border-[#57707A]/30 bg-[#2A2F38] flex flex-col gap-3 shrink-0 shadow-inner">
                                      {scene.sceneAudioUrl ? (
                                        <div className="flex flex-col gap-2.5 w-full">
                                          <div className="flex items-center gap-2">
                                            <audio controls src={scene.sceneAudioUrl} className="h-9 flex-1 w-full min-w-0 rounded-md opacity-90" />
                                            <button onClick={() => handleRemoveSceneAudio(scene.id)} className="p-2 text-[#57707A] hover:text-white bg-[#191D23] hover:bg-red-500/80 border border-[#57707A]/50 hover:border-red-500 rounded-lg transition-colors shadow-sm" title="Delete Track">
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                          <div className="flex gap-2 w-full items-center">
                                            <input type="text" value={scene.audioName || ""} onChange={(e) => updateScene(scene.id, "audioName", e.target.value)} className="flex-1 text-xs font-bold text-[#DEDCDC] px-3 py-2 rounded-lg border border-[#57707A]/50 bg-[#191D23] min-w-0 focus:outline-none focus:ring-1 focus:ring-[#C5BAC4]/50 shadow-inner" placeholder="Name this clip..." />
                                            <Button size="sm" onClick={() => handleSendAudioToEditor(scene.id, scene.audioName || `Scene Audio`, scene.sceneAudioUrl!, scene.sceneAudioPublicUrl)} disabled={sendingAudioId === scene.id} className="h-9 px-3 text-[10px] font-bold bg-[#C5BAC4] hover:bg-white text-[#191D23] shrink-0 rounded-lg shadow-md transition-all">
                                              {sendingAudioId === scene.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                                          <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider truncate hidden xl:inline-block">
                                            {scene.audioPrompt ? "Ready for TTS" : "Add script"}
                                          </span>
                                          <div className="flex gap-2 shrink-0 w-full xl:w-auto justify-end">
                                            <label className="flex items-center justify-center h-9 px-4 bg-[#191D23] border border-[#57707A]/50 text-[#DEDCDC]/80 hover:text-white hover:border-[#C5BAC4]/50 rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex-1 xl:flex-none shadow-sm">
                                              <Upload className="w-3.5 h-3.5 xl:mr-2 text-[#57707A]" /> <span className="hidden xl:inline">Upload</span>
                                              <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleCustomAudioUpload(e, scene.id)} />
                                            </label>
                                            <Button size="sm" onClick={() => handleGenerateSceneAudio(index)} disabled={!scene.audioPrompt || scene.isGeneratingAudio || scene.audioPrompt.startsWith("[Custom Upload]")} className={cn("h-9 text-[10px] font-bold px-4 rounded-lg shadow-sm transition-all flex-1 xl:flex-none", scene.audioPrompt && !scene.audioPrompt.startsWith("[Custom Upload]") ? "bg-[#B3FF00] hover:bg-white text-[#191D23] shadow-[0_0_10px_rgba(179,255,0,0.2)]" : "bg-[#191D23] border border-[#57707A]/30 text-[#57707A] hover:bg-[#191D23]")}>
                                              {scene.isGeneratingAudio ? <Loader2 className="w-3.5 h-3.5 xl:mr-2 animate-spin" /> : <Mic className="w-3.5 h-3.5 xl:mr-2" />} <span className="hidden xl:inline">Generate TTS</span>
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Video Generation Toolbar */}
                            {!scene.videoUrl && (
                              <div className="p-3 bg-[#191D23]/80 border-t border-[#57707A]/30 flex justify-between items-center shrink-0">
                                <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider pl-1">
                                  {scene.primaryPreview ? "Ready for animation" : "Requires an image"}
                                </span>
                                <Button
                                  size="sm"
                                  onClick={() => handleGenerateSingleVideo(index)}
                                  disabled={!scene.primaryPreview || scene.isGeneratingVideo}
                                  className={cn("h-9 text-[10px] font-bold px-4 rounded-lg transition-all shadow-md", scene.primaryPreview ? "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] border-none" : "bg-[#2A2F38] border border-[#57707A]/40 text-[#57707A]")}
                                >
                                  <Film className="w-3.5 h-3.5 mr-2" /> Generate Scene Video
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

          <Button onClick={addEmptyScene} variant="outline" className="w-full mt-8 border-dashed border-2 border-[#57707A]/50 bg-[#191D23]/50 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/50 hover:bg-[#2A2F38]/80 py-8 rounded-xl font-bold transition-all shadow-inner">
            <Plus className="mr-2 h-5 w-5" /> Add Another Scene
          </Button>
        </div>

        {/* ── RIGHT PANE: DIRECTOR & PREVIEW ── */}
        <div className="w-[360px] shrink-0 h-full flex flex-col bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl relative overflow-hidden z-20">

          {/* GLOBAL ACTOR SELECTION & CASTING ROOM */}
          <div className="mb-6 pb-6 border-b border-[#57707A]/20">
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide">
                <Lock className="h-4 w-4 text-[#C5BAC4]" /> Character Consistency Lock
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer bg-[#191D23] px-2.5 py-1.5 border border-[#57707A]/50 rounded-lg hover:bg-[#57707A]/30 hover:border-[#C5BAC4]/40 transition-all shadow-sm">
                  <input type="checkbox" checked={enableCharacterLock} onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableCharacterLock(checked);
                    if (checked && actors.length > 0) setIsCharacterLockModalOpen(true);
                  }} className="rounded cursor-pointer border-[#57707A]/50 bg-[#2A2F38] text-[#C5BAC4] focus:ring-[#C5BAC4]" />
                  <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider">Enable</span>
                </label>
              </div>
            </div>

            {enableCharacterLock && selectedActorA && (
              <div className="flex flex-col gap-3 mt-3 animate-in fade-in">
                <div className="flex items-center justify-between bg-[#191D23] border border-[#C5BAC4]/30 rounded-xl p-2 shadow-inner">
                  {(() => {
                    const actorA = actors.find(a => a.id === selectedActorA);
                    return actorA ? (
                      <div className="flex items-center gap-3 pl-2">
                        <div className="w-8 h-8 rounded-md overflow-hidden border border-[#57707A]/50">
                          <img src={actorA.stitchedSheetUrl} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[#C5BAC4] text-xs font-bold">
                          {actorA.name}
                        </span>
                      </div>
                    ) : null;
                  })()}
                  <button onClick={() => setIsCharacterLockModalOpen(true)} className="inline-flex items-center justify-center h-8 w-8 bg-[#2A2F38] text-[#DEDCDC] hover:text-[#C5BAC4] rounded-lg border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors shadow-sm" title="Change Actor">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {enableCharacterLock && !selectedActorA && (
              <button onClick={() => setIsCharacterLockModalOpen(true)} className="mt-3 w-full flex items-center justify-center gap-2 bg-[#191D23] hover:bg-[#57707A]/30 text-[#DEDCDC]/60 hover:text-[#C5BAC4] text-xs font-bold py-3 rounded-xl border border-dashed border-[#57707A]/50 hover:border-[#C5BAC4]/50 transition-all animate-in fade-in shadow-inner">
                <UserPlus className="w-4 h-4" /> Select Actor to Lock
              </button>
            )}

            <Button onClick={() => setIsCastingOpen(true)} variant="outline" className="w-full mt-4 h-10 text-[10px] font-bold border-[#57707A]/40 text-[#DEDCDC] hover:text-[#191D23] hover:bg-[#C5BAC4] hover:border-[#C5BAC4] bg-[#191D23] transition-all rounded-lg shadow-sm">
              <Users className="w-4 h-4 mr-2" /> Open Casting Room
            </Button>
          </div>

          <div className="flex flex-col gap-4 mb-6 pb-6 border-b border-[#57707A]/20">
            <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide"><Settings2 className="w-4 h-4 text-[#C5BAC4]" /> Master Director</h3>
            <div className="flex items-center gap-3 bg-[#191D23] p-2 rounded-xl border border-[#57707A]/40 shadow-inner">
              <div className="p-2 bg-[#2A2F38] rounded-lg border border-[#57707A]/30"><Palette className="h-4 w-4 text-[#C5BAC4]" /></div>
              <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="bg-transparent text-xs font-bold text-[#DEDCDC] focus:outline-none cursor-pointer flex-1 appearance-none">
                {VISUAL_STYLES.map(s => <option key={s.id} value={s.id} className="bg-[#191D23]">{s.label}</option>)}
              </select>
            </div>

            <div className="relative mt-2">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Master Story Concept</label>
              <Textarea value={bRollConcept} onChange={(e) => setBRollConcept(e.target.value)} placeholder="Describe the full story flow AND dialogue..." className="flex-1 w-full resize-none h-32 text-sm p-4 bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar" />
            </div>

            <div className="flex flex-col gap-3 mt-2">
              <Button onClick={handleWriteScript} disabled={isWritingScript || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4] h-11 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
                {isWritingScript ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />} Write Prompts &amp; Audio
              </Button>

              <Button onClick={handleGenerateAllImages} disabled={isGeneratingAllImages || generatingSlot !== null || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#B3FF00] bg-[#191D23] hover:bg-[#B3FF00] h-11 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
                {isGeneratingAllImages ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Images className="h-4 w-4 mr-2" />} Generate Images ({filledImageSlots}/{totalImageSlots})
              </Button>

              <Button onClick={handleGenerateSceneVideos} disabled={!hasAnyImages || isGeneratingVideos} className={cn("w-full h-12 justify-center text-sm font-bold rounded-xl transition-all shadow-md mt-2 border-none", hasAnyImages ? "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23]" : "bg-[#191D23]/80 text-[#57707A] cursor-not-allowed border border-[#57707A]/30")}>
                {isGeneratingVideos ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Film className="h-5 w-5 mr-2" />} Generate Scene Videos
              </Button>
            </div>
          </div>

          <div className="shrink-0 flex flex-col flex-1 min-h-0">
            <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide mb-4"><Images className="h-4 w-4 text-[#C5BAC4]" /> Scene Previews</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
              <div className="grid grid-cols-2 gap-3">
                {bRollScenes.flatMap((scene, index) => {
                  const previews = [];
                  if (scene.primaryPreview) {
                    previews.push(
                      <div key={`preview-${index}-1`} className="relative aspect-square w-full rounded-xl border border-[#57707A]/40 bg-[#191D23] overflow-hidden group animate-in zoom-in duration-300 shadow-sm">
                        <img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90" />
                        <div className="absolute top-0 right-0 bg-[#C5BAC4] text-[#191D23] text-[9px] px-2 py-1 rounded-bl-lg font-black shadow-md pointer-events-none">#{index + 1}.1</div>
                      </div>
                    );
                  }
                  if (scene.useEndFrame && scene.secondaryPreview) {
                    previews.push(
                      <div key={`preview-${index}-2`} className="relative aspect-square w-full rounded-xl border border-[#57707A]/40 bg-[#191D23] overflow-hidden group animate-in zoom-in duration-300 shadow-sm">
                        <img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90" />
                        <div className="absolute top-0 right-0 bg-[#C5BAC4] text-[#191D23] text-[9px] px-2 py-1 rounded-bl-lg font-black shadow-md pointer-events-none">#{index + 1}.2</div>
                      </div>
                    );
                  }
                  return previews;
                })}
                {!hasAnyImages && (<div className="col-span-2 h-32 flex flex-col items-center justify-center text-[#57707A] border-2 border-dashed border-[#57707A]/40 rounded-xl bg-[#191D23]/50 shadow-inner"><ImageIcon className="h-8 w-8 mb-3 opacity-50" /><span className="text-[10px] font-bold uppercase tracking-widest text-center">Add images to<br />see previews!</span></div>)}
              </div>
            </div>

            <div className="shrink-0 border-t border-[#57707A]/20 pt-5 mt-2">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-[#C5BAC4]" /> Drop Global Style Reference</label>
              <div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-24 relative w-full rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 transition-all overflow-hidden group/ref flex flex-col shadow-inner">
                {frameReferencePreview ? (
                  <>
                    <img src={frameReferencePreview} className="w-full h-full object-cover opacity-90" />
                    <button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/90 text-white rounded-full shadow-md opacity-0 group-hover/ref:opacity-100 transition-all hover:scale-110 hover:bg-red-500 z-20"><X className="h-3 w-3" /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-[#C5BAC4] text-center py-1.5 font-bold tracking-widest uppercase z-10">Style Locked</div>
                  </>
                ) : (
                  <label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors">
                    <ImageIcon className="h-6 w-6 mb-2" />
                    <span className="text-[9px] font-bold text-center uppercase tracking-widest">Click or Drop<br />Image Here</span>
                  </label>
                )}
                <input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} />

      {previewModalImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191D23]/90 backdrop-blur-md animate-in fade-in" onClick={() => setPreviewModalImg(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewModalImg(null)} className="absolute -top-14 right-0 p-2.5 bg-[#2A2F38] border border-[#57707A]/50 hover:bg-red-500 hover:border-red-400 hover:text-white text-[#DEDCDC] rounded-full transition-all shadow-lg z-50">
              <X className="h-5 w-5" />
            </button>
            <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none rounded-2xl"></div>
            <img src={previewModalImg} className="w-full h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#57707A]/30 relative z-10 bg-black" alt="Preview Enlarged" />
          </div>
        </div>
      )}

      {/* ✨ CHARACTER LOCK SELECTION MODAL */}
      <Dialog open={isCharacterLockModalOpen} onOpenChange={(open) => !open && setIsCharacterLockModalOpen(false)}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl custom-scrollbar">
          <DialogHeader className="border-b border-[#57707A]/20 pb-4">
            <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl"><Lock className="w-5 h-5" /> Select Actor to Lock</DialogTitle>
            <DialogDescription className="text-[#989DAA] font-medium mt-1">Click on an actor to lock their character consistency across all scenes.</DialogDescription>
          </DialogHeader>
          <div className="py-5">
            {actors.length === 0 ? (
              <div className="text-center py-12 text-[#57707A] bg-[#191D23]/50 rounded-2xl border border-dashed border-[#57707A]/40">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-bold text-[#DEDCDC]">No actors yet</p>
                <p className="text-xs mt-1 text-[#989DAA]">Use the Casting Room to create actors first.</p>
                <Button size="sm" className="mt-5 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-md rounded-xl h-10 px-6 transition-all" onClick={() => { setIsCharacterLockModalOpen(false); setIsCastingOpen(true); }}>
                  <UserPlus className="w-4 h-4 mr-2" /> Open Casting Room
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {actors.map(actor => {
                  const isSelected = selectedActorA === actor.id;
                  return (
                    <button
                      key={actor.id}
                      onClick={() => setSelectedActorA(isSelected ? "" : actor.id)}
                      className={cn(
                        "rounded-2xl p-2.5 flex flex-col gap-3 transition-all text-left border relative overflow-hidden group",
                        isSelected ? "bg-[#191D23] border-[#C5BAC4] ring-2 ring-[#C5BAC4]/50 shadow-lg" :
                          "bg-[#191D23]/60 border-[#57707A]/40 hover:border-[#C5BAC4]/60 hover:bg-[#191D23] hover:shadow-md"
                      )}
                    >
                      <div className="aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-[#57707A]/30 relative">
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        {isSelected && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black px-2 py-0.5 uppercase tracking-widest rounded shadow-md">Locked</div>}
                      </div>
                      <span className={cn(
                        "text-xs font-bold text-center truncate px-2 w-full",
                        isSelected ? "text-[#DEDCDC]" : "text-[#989DAA] group-hover:text-[#DEDCDC] transition-colors"
                      )}>{actor.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-[#57707A]/20 pt-4">
            <Button variant="outline" onClick={() => setSelectedActorA("")} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 font-bold rounded-xl h-11 px-6">Clear Selection</Button>
            <Button onClick={() => setIsCharacterLockModalOpen(false)} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl h-11 px-8 shadow-lg transition-all border-none">
              <CheckCircle className="w-4 h-4 mr-2" /> Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenDialogState.isOpen} onOpenChange={(open) => !open && setRegenDialogState(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="sm:max-w-[600px] bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl">
          <DialogHeader className="border-b border-[#57707A]/20 pb-4">
            <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl"><Wand2 className="h-5 w-5" /> Regenerate {regenDialogState.slotType === 'primary' ? 'Primary' : 'Secondary'} Image</DialogTitle>
            <DialogDescription className="text-[#989DAA] font-medium mt-1.5">Edit the prompt below to refine the generation for this specific slot in Scene {regenDialogState.index !== null ? regenDialogState.index + 1 : ''}.</DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Refined Prompt</label>
            <Textarea
              value={regenDialogState.promptText}
              onChange={(e) => setRegenDialogState(prev => ({ ...prev, promptText: e.target.value }))}
              placeholder="Enter a detailed visual prompt..."
              className="h-40 resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm custom-scrollbar"
            />
          </div>
          <DialogFooter className="border-t border-[#57707A]/20 pt-4">
            <Button variant="outline" onClick={() => setRegenDialogState(prev => ({ ...prev, isOpen: false }))} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 font-bold rounded-xl h-11 px-6">Cancel</Button>
            <Button onClick={handleConfirmRegen} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl h-11 px-6 shadow-lg transition-all border-none">
              <Sparkles className="h-4 w-4 mr-2" /> Regenerate Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}