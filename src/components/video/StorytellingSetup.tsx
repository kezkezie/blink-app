"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, X, Sparkles, Loader2, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, Mic, FolderOpen, Wand2, Plus, Trash2, Video, CheckCircle, Save, Users, Lock, UserPlus, MessageSquare, ChevronUp, ChevronDown, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";
import { useRouter } from "next/navigation";

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
  onPreviewActor: (url: string) => void;
}

function CastingRoomModal({ open, onClose, onSaveActor, onDeleteActor, actors, selectedActorA, setSelectedActorA, callN8n, clientId, onPreviewActor }: CastingRoomModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isStitching, setIsStitching] = useState(false);

  const [actorName, setActorName] = useState("");
  const [angles, setAngles] = useState<(File | null)[]>(Array(6).fill(null));
  const [previews, setPreviews] = useState<(string | null)[]>(Array(6).fill(null));

  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [modelConsistency, setModelConsistency] = useState<"dynamic" | "consistent">("dynamic"); // ✨ NEW STATE
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

  const handleSaveAndStitch = async () => {
    if (!actorName.trim()) return alert("Please name your actor.");
    if (angles.filter(a => a !== null).length === 0) return alert("Please upload at least one angle.");
    if (!clientId) return;

    setIsStitching(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1536;
      canvas.height = 1024;
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

  const handleAIGenerate = async () => {
    if (!actorName.trim()) return alert("Please name your actor.");
    if (!aiPrompt.trim()) return alert("Please describe your character.");
    if (!clientId) return;

    setIsGeneratingAI(true);
    try {
      const augmentedPrompt = `${CHARACTER_SHEET_INJECTION} ${aiPrompt}`;
      const genData = await callN8n('generator', { prompt: augmentedPrompt, client_id: clientId });

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
                        className="absolute top-1.5 right-1.5 z-20 p-1.5 bg-red-500/90 hover:bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:opacity-100 transition-all scale-90 hover:scale-100"
                        title="Delete Actor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div
                        className="aspect-video rounded-lg overflow-hidden bg-[#0F1115] border border-[#57707A]/20 relative group cursor-pointer"
                        onClick={() => onPreviewActor(actor.stitchedSheetUrl)}
                      >
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                        {isSelected && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-md z-10">Locked</div>}
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
  duration?: string;
  prunaDraft?: boolean;
  audioPrompt?: string;
  seedanceImages?: (File | null)[];
  seedancePreviews?: (string | null)[];
  referenceVideoFile?: File | null;
  referenceVideoPreview?: string | null;
};

// ✨ We extend the props locally to safely accept the universal Aspect Ratio
export interface StorytellingSetupProps extends VideoSetupProps {
  bRollConcept: string;
  setBRollConcept: (val: string) => void;
  bRollScenes: StoryboardScene[];
  setBRollScenes: (scenes: StoryboardScene[] | ((prev: StoryboardScene[]) => StoryboardScene[])) => void;
  handleGenerateScenes: () => void;
  addEmptyScene: () => void;
  updateScene: (id: string, field: string, value: any) => void;
  removeScene: (id: string) => void;
  aspectRatio?: string;
  setAspectRatio?: (val: string) => void;
}

const VISUAL_STYLES = [
  { id: "none", label: "None (Follow Prompt Directly)" },
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
  aspectRatio = "16:9",
  setAspectRatio,
  isSuggesting,
}: StorytellingSetupProps) {
  const { clientId } = useClient();
  const router = useRouter();

  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [isCastingOpen, setIsCastingOpen] = useState(false);
  const [enableCharacterLock, setEnableCharacterLock] = useState(false);
  const [isCharacterLockModalOpen, setIsCharacterLockModalOpen] = useState(false);
  const [selectedActorA, setSelectedActorA] = useState<string>("");

  const [modelConsistency, setModelConsistency] = useState<"dynamic" | "consistent">("dynamic"); // ✨ NEW STATE
  const [aiEnhance, setAiEnhance] = useState(true);
  const [localAspectRatio, setLocalAspectRatio] = useState("16:9");

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
        aiModel: "auto",
        useEndFrame: false,
        primaryFile: null,
        primaryPreview: null,
        secondaryFile: null,
        secondaryPreview: null,
        seedanceImages: [null],
        seedancePreviews: [null],
        referenceVideoFile: null,
        referenceVideoPreview: null,
        prompt: "",
        videoUrl: null,
        isGeneratingVideo: false
      }));
      setBRollScenes(defaultScenes);
    }
  }, []);

  useEffect(() => {
    if (bRollScenes.length > 0) {
      try {
        // ✨ THE FIX: Create a "lightweight" copy of the scenes to save.
        // We strip out the heavy Base64 previews and File objects to prevent QuotaExceeded errors.
        const lightScenesToSave = bRollScenes.map(scene => ({
          ...scene,
          // Clear out heavy Base64 strings from manual uploads
          primaryPreview: scene.primaryPreview?.startsWith('data:') ? null : scene.primaryPreview,
          secondaryPreview: scene.secondaryPreview?.startsWith('data:') ? null : scene.secondaryPreview,
          seedancePreviews: Array.isArray(scene.seedancePreviews)
            ? scene.seedancePreviews.map((p: string | null) => p?.startsWith('data:') ? null : p)
            : [null],
          referenceVideoPreview: scene.referenceVideoPreview?.startsWith('blob:') || scene.referenceVideoPreview?.startsWith('data:') ? null : scene.referenceVideoPreview,

          // Never try to stringify File objects
          primaryFile: null,
          secondaryFile: null,
          seedanceImages: [null],
          referenceVideoFile: null
        }));

        localStorage.setItem('blink_storyboard_scenes', JSON.stringify(lightScenesToSave));
      } catch (e) {
        console.error("Failed to save scenes to localStorage. It might still be too large:", e);
      }
    }
  }, [bRollScenes]);

  useEffect(() => {
    if (actors.length > 0) localStorage.setItem('blink_saved_actors', JSON.stringify(actors));
  }, [actors]);

  const [generatingSlot, setGeneratingSlot] = useState<{ index: number, type: 'primary' | 'secondary', seedanceIndex?: number } | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<{ index: number, type: 'primary' | 'secondary', seedanceIndex?: number } | null>(null);
  const [suggestingPromptIndex, setSuggestingPromptIndex] = useState<number | null>(null);

  const [regenDialogState, setRegenDialogState] = useState<{ isOpen: boolean; sceneId: string | null; index: number | null; slotType: 'primary' | 'secondary'; promptText: string; seedanceIndex?: number }>({
    isOpen: false, sceneId: null, index: null, slotType: 'primary', promptText: ""
  });

  const [isWritingScript, setIsWritingScript] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const [frameReferenceFile, setFrameReferenceFile] = useState<File | null>(null);
  const [frameReferencePreview, setFrameReferencePreview] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");

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

  const ensureArray = (val: any) => Array.isArray(val) ? val : [val || null];

  const totalImageSlots = bRollScenes.reduce((count, scene) => {
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    if (isSeedance2) {
      return count + ensureArray(scene.seedancePreviews || [null]).length;
    }
    return count + 1 + (scene.useEndFrame ? 1 : 0);
  }, 0);

  const filledImageSlots = bRollScenes.reduce((count, scene) => {
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    if (isSeedance2) {
      return count + ensureArray(scene.seedancePreviews || [null]).filter(p => p !== null).length;
    }
    return count + (scene.primaryPreview ? 1 : 0) + (scene.useEndFrame && scene.secondaryPreview ? 1 : 0);
  }, 0);

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

  const generateScript = async (): Promise<string[]> => {
    setIsWritingScript(true);
    let generatedPrompts: string[] = [];
    try {
      const directorData = await callN8n('director', {
        clientId: clientId,
        prompt: `Concept: ${bRollConcept}\n\nCRITICAL: Break this concept into a dynamic sequence of scenes. For each scene, write the "image_prompt" and "video_prompt". ALSO, intelligently select the best 'aiModel' ('bytedance/seedance-2', 'kling-3.0/video', 'replicate:openai/sora-2', or 'replicate:prunaai/p-video'), a 'duration' (5, 10, or 15), and whether to 'useEndFrame' (true/false) based on the specific action required.`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        sceneConfigs: bRollScenes.map(scene => ({ aiModel: scene.aiModel })),
        consistencyMode: modelConsistency // ✨ PASS PREFERENCE TO AI
      });

      const scenesData = directorData.scenes || [];
      let currentScenes = [...bRollScenes];

      if (scenesData.length > currentScenes.length) {
        const scenesToAdd = scenesData.length - currentScenes.length;
        for (let i = 0; i < scenesToAdd; i++) {
          const aiData = scenesData[currentScenes.length + i] || {};
          currentScenes.push({
            id: crypto.randomUUID(),
            scene_number: currentScenes.length + i + 1,
            // ✨ FIX: Safely catch snake_case or camelCase keys from the AI
            aiModel: aiData.aiModel || aiData.ai_model || "auto",
            useEndFrame: aiData.useEndFrame !== undefined ? aiData.useEndFrame : (aiData.use_end_frame !== undefined ? aiData.use_end_frame : false),
            primaryFile: null,
            primaryPreview: null,
            secondaryFile: null,
            secondaryPreview: null,
            seedanceImages: [null],
            seedancePreviews: [null],
            referenceVideoFile: null,
            referenceVideoPreview: null,
            prompt: "",
            videoUrl: null,
            isGeneratingVideo: false,
            duration: String(aiData.duration || "5")
          });
        }
      }

      const updatedScenes = currentScenes.map((scene, i) => {
        const aiData = scenesData[i] || {};
        const newVisualPrompt = aiData.video_prompt || aiData.image_prompt || "";
        const finalPrompt = scene.prompt?.trim() || newVisualPrompt;

        return {
          ...scene,
          prompt: finalPrompt,
          // ✨ FIX: Safely catch snake_case or camelCase keys from the AI
          aiModel: aiData.aiModel || aiData.ai_model ? (aiData.aiModel || aiData.ai_model) : scene.aiModel,
          duration: aiData.duration ? String(aiData.duration) : scene.duration,
          useEndFrame: aiData.useEndFrame !== undefined ? aiData.useEndFrame : (aiData.use_end_frame !== undefined ? aiData.use_end_frame : scene.useEndFrame)
        };
      });

      setBRollScenes(updatedScenes);
      generatedPrompts = updatedScenes.map(s => s.prompt);

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
    await generateScript();
  };

  const handleSuggestPrompt = async (sceneId: string, index: number) => {
    const scene = bRollScenes[index];
    const currentScenePrompt = scene.prompt || "";
    const fallbackConcept = bRollConcept.trim();

    if (!currentScenePrompt.trim() && !fallbackConcept) {
      return alert("Please write a rough idea in this scene's prompt box, or fill out the Master Story Concept first.");
    }

    setSuggestingPromptIndex(index);
    try {
      let aiInstruction = "";

      if (currentScenePrompt.trim()) {
        aiInstruction = `Refine and enhance the following rough scene idea into a highly descriptive, professional cinematic visual prompt (maximum 500 characters). \n\nRough idea to refine: "${currentScenePrompt.trim()}". \n\nCRITICAL: Write it in a highly descriptive narrative script format. Include setting, character actions, lighting, and exact spoken dialogue in quotes if applicable. Output ONLY the prompt.`;
      } else {
        aiInstruction = `Write a visual image prompt for Scene ${index + 1} based on this master concept: "${fallbackConcept}". CRITICAL: Write it in a highly descriptive narrative script format (maximum 500 characters). Include setting, character actions, camera movements, and exact spoken dialogue in quotes. Output ONLY the prompt.`;
      }

      const directorData = await callN8n('director', {
        prompt: aiInstruction,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: "video_native",
        totalDuration: 8
      });

      const suggestedPrompt = directorData.scenes?.[0]?.image_prompt || directorData.scenes?.[0]?.video_prompt || "Cinematic shot. Highly detailed.";
      updateScene(sceneId, "prompt", suggestedPrompt);

    } catch (err) {
      console.error(err);
      alert("Failed to suggest prompt. Check console for details.");
    } finally {
      setSuggestingPromptIndex(null);
    }
  };


  const handleGenerateSlot = async (slotIndex: number, type: 'primary' | 'secondary' = 'primary', overridePrompt?: string, seedanceIndex: number = 0) => {
    const scene = bRollScenes[slotIndex];
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    const promptToUse = overridePrompt || scene.prompt || bRollConcept;

    if (!promptToUse.trim()) return alert("Please write a visual prompt for this scene first.");

    const NO_TEXT_CONSTRAINT = " CRITICAL: Do NOT output a character reference sheet, split screen, or multiple angles. Output a SINGLE, unified, cinematic scene featuring this exact character integrated naturally into the described environment.";
    const safePrompt = promptToUse + NO_TEXT_CONSTRAINT;

    setGeneratingSlot({ index: slotIndex, type, seedanceIndex });
    try {
      const styleRefUrl = await uploadRefImage();
      let previousUrl = null;
      if (slotIndex > 0) {
        previousUrl = bRollScenes[slotIndex - 1].secondaryPreview || bRollScenes[slotIndex - 1].primaryPreview;
      }

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
        characterRefA: characterSheetUrlA,
        client_id: clientId
      });

      if (genData.url) {
        if (isSeedance2) {
          setBRollScenes(currentScenes => {
            const newScenes = [...currentScenes];
            const oldScene = newScenes[slotIndex];

            const currentPreviews = ensureArray(oldScene.seedancePreviews || [null]);
            const currentFiles = ensureArray(oldScene.seedanceImages || [null]);

            const newPreviews = [...currentPreviews];
            const newFiles = [...currentFiles];

            newPreviews[seedanceIndex] = genData.url;
            newFiles[seedanceIndex] = null;

            newScenes[slotIndex] = {
              ...oldScene,
              seedancePreviews: newPreviews,
              seedanceImages: newFiles,
              primaryPreview: seedanceIndex === 0 ? genData.url : oldScene.primaryPreview,
              primaryFile: seedanceIndex === 0 ? null : oldScene.primaryFile,
              videoUrl: null
            };

            return newScenes;
          });

        } else {
          updateScene(scene.id, type === 'primary' ? "primaryPreview" : "secondaryPreview", genData.url);
          updateScene(scene.id, type === 'primary' ? "primaryFile" : "secondaryFile", null);
          updateScene(scene.id, "videoUrl", null);
        }

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
      try { currentPrompts = await generateScript(); } catch (e) { setIsGeneratingAllImages(false); return; }
    }

    // ✨ THIS IS THE SECRET TO PREVENTING SERVER CRASHES
    // We process them sequentially (one by one) to keep CPU usage low
    for (let i = 0; i < bRollScenes.length; i++) {
      const isSeedance2 = bRollScenes[i].aiModel === 'bytedance/seedance-2' || bRollScenes[i].aiModel === 'bytedance/seedance-2-fast';

      if (isSeedance2) {
        const previews = ensureArray(bRollScenes[i].seedancePreviews || [null]);
        for (let sIdx = 0; sIdx < previews.length; sIdx++) {
          if (!previews[sIdx] && currentPrompts[i]) {
            // AWAIT pauses the loop until this specific image is finished
            await handleGenerateSlot(i, 'primary', currentPrompts[i], sIdx);
          }
        }
      } else {
        if (!bRollScenes[i].primaryPreview && currentPrompts[i]) {
          await handleGenerateSlot(i, 'primary', currentPrompts[i]);
        }
        if (bRollScenes[i].useEndFrame && !bRollScenes[i].secondaryPreview && currentPrompts[i]) {
          await handleGenerateSlot(i, 'secondary', currentPrompts[i]);
        }
      }
    }

    setIsGeneratingAllImages(false);
  };

  const handleGenerateSingleVideo = async (slotIndex: number) => {
    const scene = bRollScenes[slotIndex];
    if (!clientId) return;

    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';

    if (scene.useEndFrame && !scene.secondaryPreview && !isSeedance2) {
      return alert("You enabled the End Frame toggle. Please generate or upload an End Frame before animating.");
    }

    updateScene(scene.id, "isGeneratingVideo", true);

    try {
      let finalPrimaryUrl = null;
      if (isSeedance2 && scene.seedancePreviews && scene.seedancePreviews[0]) {
        finalPrimaryUrl = scene.seedancePreviews[0];
      } else {
        finalPrimaryUrl = scene.primaryPreview || null;
      }

      let finalSecondaryUrl = null;
      if (isSeedance2 && scene.seedancePreviews && scene.seedancePreviews[1]) {
        finalSecondaryUrl = scene.seedancePreviews[1];
      } else if (scene.useEndFrame) {
        finalSecondaryUrl = scene.secondaryPreview || null;
      }

      let finalReferenceVideoUrl = null;
      if (scene.referenceVideoFile) {
        const mimeExt = scene.referenceVideoFile.name.split('.').pop() || 'mp4';
        const vidPath = `videos/${clientId}/scene_ref_video_${Date.now()}.${mimeExt}`;
        await supabase.storage.from("assets").upload(vidPath, scene.referenceVideoFile);
        finalReferenceVideoUrl = supabase.storage.from("assets").getPublicUrl(vidPath).data.publicUrl;
      }

      let characterSheetA = null;
      if (enableCharacterLock) {
        characterSheetA = actors.find(a => a.id === selectedActorA)?.stitchedSheetUrl || null;
      }

      if (finalPrimaryUrl && finalPrimaryUrl.startsWith('data:')) {
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
        content_type: "sequence_clip", // ✨ THIS IS THE MISSING LINK
        ai_model_override: scene.aiModel || "auto",
        aspect_ratio: scene.aspectRatio || "16:9",
        referenceVideoUrl: finalReferenceVideoUrl,
        scene_data: {
          visual_prompt: scene.prompt?.trim() || bRollConcept,
          ai_enhance: aiEnhance,
          video_mode: scene.mode,
          duration: scene.duration || "5",
          prunaDraft: scene.prunaDraft || false,
          referenceVideoUrl: finalReferenceVideoUrl,
          frames: {
            start_frame: finalPrimaryUrl,
            end_frame: finalSecondaryUrl
          },
          audio: {
            script: scene.audioPrompt || null,
            audio_url: null
          },
          casting: enableCharacterLock ? {
            actor_1_sheet: characterSheetA
          } : null
        }
      });

      let attempts = 0;
      const maxAttempts = 180; // 15 minutes
      let foundVideoUrl = null;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        console.log(`[Scene ${slotIndex + 1}] Polling attempt ${attempts}...`);

        const { data, error } = await supabase.from('content').select('*').eq('id', postId).single();

        if (error) {
          console.error(`[Scene ${slotIndex + 1}] Supabase error:`, error);
          continue; // Ignore network blips and keep trying
        }

        if (data) {
          if (data.status === 'failed') {
            throw new Error(data.error_message || "n8n Video Engine reported a failure.");
          }

          let urls: string[] = [];
          if (Array.isArray(data.video_urls) && data.video_urls.length > 0) {
            urls = data.video_urls;
          } else if (typeof data.video_urls === 'string') {
            try { urls = JSON.parse(data.video_urls); } catch (e) { urls = [data.video_urls]; }
          }

          // Safely find the first valid HTTP URL
          const validUrl = urls.find((u: string) => typeof u === 'string' && u.startsWith('http'));

          if (validUrl) {
            console.log(`[Scene ${slotIndex + 1}] SUCCESS! Video found:`, validUrl);
            foundVideoUrl = validUrl;
            break; // Exit the loop!
          }
        }
      }

      if (!foundVideoUrl) {
        throw new Error("Video generation timed out after 15 minutes.");
      }

      // 1. Update the URL first
      updateScene(scene.id, "videoUrl", foundVideoUrl);

      // 2. Give React 50ms to flush the state batch before turning off the loader
      setTimeout(() => {
        updateScene(scene.id, "isGeneratingVideo", false);
      }, 50);

    } catch (err: any) {
      console.error(`Failed to generate video for scene ${slotIndex + 1}:`, err);
      alert(`Failed to retrieve video: ${err.message}`);
      updateScene(scene.id, "isGeneratingVideo", false);
    }
    // No finally block — success and failure are handled cleanly above!
  };

  const handleGenerateSceneVideos = async () => {
    setIsGeneratingVideos(true);
    for (let i = 0; i < bRollScenes.length; i++) {
      const scene = bRollScenes[i];
      if (scene.videoUrl) continue;
      await handleGenerateSingleVideo(i);
    }
    setIsGeneratingVideos(false);
  };

  const handleDeleteVideo = (sceneId: string) => {
    if (confirm("Are you sure you want to delete this video and re-enable image editing?")) {
      updateScene(sceneId, "videoUrl", null);
    }
  };

  const openRegenModal = (scene: any, index: number, slotType: 'primary' | 'secondary', seedanceIndex?: number) => {
    setRegenDialogState({ isOpen: true, sceneId: scene.id, index: index, slotType: slotType, promptText: scene.prompt || bRollConcept || "", seedanceIndex });
  };

  const handleConfirmRegen = () => {
    const { sceneId, index, slotType, promptText, seedanceIndex } = regenDialogState;
    if (sceneId && index !== null) {
      updateScene(sceneId, "prompt", promptText);
      handleGenerateSlot(index, slotType, promptText, seedanceIndex || 0);
    }
    setRegenDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const handleLibrarySelect = (url: string) => {
    if (!libraryTarget) return;
    const scene = bRollScenes[libraryTarget.index];

    if (libraryTarget.seedanceIndex !== undefined) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);
      const newPreviews = [...currentPreviews];
      const newFiles = [...currentFiles];
      newPreviews[libraryTarget.seedanceIndex] = url;
      newFiles[libraryTarget.seedanceIndex] = null;
      updateScene(scene.id, "seedancePreviews", newPreviews);
      updateScene(scene.id, "seedanceImages", newFiles);
      if (libraryTarget.seedanceIndex === 0) updateScene(scene.id, "primaryPreview", url);
    } else {
      const targetField = libraryTarget.type === "primary" ? "primaryPreview" : "secondaryPreview";
      updateScene(scene.id, targetField, url);
      updateScene(scene.id, libraryTarget.type === "primary" ? "primaryFile" : "secondaryFile", null);
    }
    updateScene(scene.id, "videoUrl", null);
    setLibraryTarget(null);
  };

  const removeSeedanceSlot = (sceneId: string, seedanceIndex: number) => {
    const scene = bRollScenes.find(s => s.id === sceneId);
    if (scene) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);

      const newPreviews = currentPreviews.filter((_, idx) => idx !== seedanceIndex);
      const newFiles = currentFiles.filter((_, idx) => idx !== seedanceIndex);

      if (newPreviews.length === 0) {
        updateScene(sceneId, "seedancePreviews", [null]);
        updateScene(sceneId, "seedanceImages", [null]);
        updateScene(sceneId, "primaryPreview", null);
      } else {
        updateScene(sceneId, "seedancePreviews", newPreviews);
        updateScene(sceneId, "seedanceImages", newFiles);
        updateScene(sceneId, "primaryPreview", newPreviews[0] || null);
      }
    }
    updateScene(sceneId, "videoUrl", null);
  };

  const clearSlot = (sceneId: string, type: 'primary' | 'secondary', seedanceIndex?: number) => {
    if (seedanceIndex !== undefined) {
      const scene = bRollScenes.find(s => s.id === sceneId);
      if (scene) {
        const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
        const currentFiles = ensureArray(scene.seedanceImages || [null]);
        const newPreviews = [...currentPreviews];
        const newFiles = [...currentFiles];
        newPreviews[seedanceIndex] = null;
        newFiles[seedanceIndex] = null;

        updateScene(sceneId, "seedancePreviews", newPreviews);
        updateScene(sceneId, "seedanceImages", newFiles);

        if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", null);
      }
    } else {
      updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", null);
      updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
    }
    updateScene(sceneId, "videoUrl", null);
  };

  const handleSceneFile = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, type: "primary" | "secondary", seedanceIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (seedanceIndex !== undefined) {
        const scene = bRollScenes.find(s => s.id === sceneId);
        if (scene) {
          const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
          const currentFiles = ensureArray(scene.seedanceImages || [null]);
          const newPreviews = [...currentPreviews];
          const newFiles = [...currentFiles];
          newPreviews[seedanceIndex] = event.target?.result as string;
          newFiles[seedanceIndex] = file;
          updateScene(sceneId, "seedancePreviews", newPreviews);
          updateScene(sceneId, "seedanceImages", newFiles);
          if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", event.target?.result as string);
        }
      } else {
        updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
        updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
      }
      updateScene(sceneId, "videoUrl", null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>, sceneId: string, type: "primary" | "secondary", seedanceIndex?: number) => {
    e.preventDefault(); e.stopPropagation();
    updateScene(sceneId, "videoUrl", null);

    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (seedanceIndex !== undefined) {
          const scene = bRollScenes.find(s => s.id === sceneId);
          if (scene) {
            const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
            const currentFiles = ensureArray(scene.seedanceImages || [null]);
            const newPreviews = [...currentPreviews];
            const newFiles = [...currentFiles];
            newPreviews[seedanceIndex] = event.target?.result as string;
            newFiles[seedanceIndex] = file;
            updateScene(sceneId, "seedancePreviews", newPreviews);
            updateScene(sceneId, "seedanceImages", newFiles);
            if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", event.target?.result as string);
          }
        } else {
          updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
          updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
    const url = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("URL");
    if (url) {
      if (seedanceIndex !== undefined) {
        const scene = bRollScenes.find(s => s.id === sceneId);
        if (scene) {
          const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
          const currentFiles = ensureArray(scene.seedanceImages || [null]);
          const newPreviews = [...currentPreviews];
          const newFiles = [...currentFiles];
          newPreviews[seedanceIndex] = url;
          newFiles[seedanceIndex] = null;
          updateScene(sceneId, "seedancePreviews", newPreviews);
          updateScene(sceneId, "seedanceImages", newFiles);
          if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", url);
        }
      } else {
        updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", url);
        updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
      }
    }
  };

  const handleRefVideoDrop = async (e: React.DragEvent<HTMLDivElement>, sceneId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files?.length > 0 && e.dataTransfer.files[0].type.startsWith("video")) {
      const file = e.dataTransfer.files[0];
      updateScene(sceneId, "referenceVideoFile", file);
      updateScene(sceneId, "referenceVideoPreview", URL.createObjectURL(file));
    }
  };
  const handleRefVideoSelect = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateScene(sceneId, "referenceVideoFile", file);
    updateScene(sceneId, "referenceVideoPreview", URL.createObjectURL(file));
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

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const addSeedanceSlot = (sceneId: string) => {
    const scene = bRollScenes.find(s => s.id === sceneId);
    if (scene) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);
      if (currentPreviews.length < 5) {
        updateScene(sceneId, "seedancePreviews", [...currentPreviews, null]);
        updateScene(sceneId, "seedanceImages", [...currentFiles, null]);
      } else {
        alert("Seedance 2 supports a maximum of 5 reference images.");
      }
    }
  };

  return (
    <div className="flex flex-row gap-6 animate-in fade-in duration-500 w-full items-start pb-10">

      {/* ✨ RENDER CASTING ROOM MODAL */}
      <CastingRoomModal
        open={isCastingOpen}
        onClose={() => setIsCastingOpen(false)}
        actors={actors}
        onSaveActor={(newActor) => setActors([...actors, newActor])}
        onDeleteActor={(id) => { setActors(actors.filter(a => a.id !== id)); if (selectedActorA === id) setSelectedActorA(""); }}
        selectedActorA={selectedActorA}
        setSelectedActorA={setSelectedActorA}
        callN8n={callN8n as any}
        clientId={clientId}
        onPreviewActor={setPreviewModalImg}
      />

      {/* ── LEFT PANE: STORYBOARD ROWS ── */}
      <div className="flex-1 w-full flex flex-col gap-6 relative">

        {/* Storyboard Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-[#DEDCDC] flex items-center gap-2 font-display">
              <Film className="h-5 w-5 text-[#C5BAC4]" /> Visual Storyboard
            </h3>
            <p className="text-sm text-[#989DAA] mt-1 font-medium">Write prompts, pick images, and generate videos.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-bold px-3.5 py-1.5 rounded-lg border uppercase tracking-wider",
              hasAnyImages ? "bg-[#B3FF00]/10 border-[#B3FF00]/30 text-[#B3FF00] shadow-sm" : "bg-[#2A2F38] border-[#57707A]/30 text-[#57707A]"
            )}>
              {filledImageSlots}/{totalImageSlots} Images
            </span>
          </div>
        </div>

        {/* Scenes List */}
        <div className="flex flex-col space-y-8">
          {bRollScenes.map((scene, index) => {
            const labels = getLabels(scene.mode || "showcase");
            const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
            const isNativeAudio = isSeedance2 || scene.aiModel === 'replicate:openai/sora-2' || scene.aiModel === 'kling-3.0/video' || scene.aiModel === 'replicate:prunaai/p-video' || scene.aiModel === 'auto';
            const isPruna = scene.aiModel === 'replicate:prunaai/p-video';
            const isKling = scene.aiModel === 'kling-3.0/video' || scene.aiModel === 'auto';

            const seedancePreviews = ensureArray(scene.seedancePreviews || [scene.primaryPreview || null]);

            return (
              <div key={scene.id} className={cn(
                "relative rounded-[2rem] border overflow-hidden flex flex-col transition-all duration-300 group bg-[#2A2F38] shadow-lg",
                scene.videoUrl ? "border-[#B3FF00]/40 shadow-[0_0_30px_rgba(179,255,0,0.1)]" : (scene.primaryPreview || seedancePreviews[0] ? "border-[#C5BAC4]/30 hover:border-[#C5BAC4]/50" : "border-dashed border-[#57707A]/40 hover:border-[#57707A]/60")
              )}>
                {/* ── Scene Header ── */}
                <div className="bg-[#191D23]/80 border-b border-[#57707A]/30 px-6 py-4 flex flex-wrap gap-4 items-center justify-between shrink-0">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-xs font-black text-[#C5BAC4] tracking-widest uppercase bg-[#191D23] border border-[#C5BAC4]/30 px-3 py-1.5 rounded-lg shadow-inner">
                      SCENE {index + 1}
                    </span>

                    <select value={scene.aiModel || "auto"} onChange={(e) => updateScene(scene.id, "aiModel", e.target.value)} className="text-xs font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-2 px-3 bg-[#2A2F38] text-[#B3FF00] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3FF00]/50 hover:bg-[#57707A]/20 transition-colors appearance-none">
                      <option value="auto" className="bg-[#191D23]">✨ Auto Engine</option>
                      <option value="replicate:openai/sora-2" className="bg-[#191D23]">Sora 2</option>
                      <option value="kling-3.0/video" className="bg-[#191D23]">Kling 3.0</option>
                      <option value="bytedance/seedance-2" className="bg-[#191D23]">Seedance 2 (Cinematic)</option>
                      <option value="bytedance/seedance-2-fast" className="bg-[#191D23]">Seedance 2 (Fast)</option>
                      <option value="replicate:prunaai/p-video" className="bg-[#191D23]">Pruna (Fast)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">

                    {/* ✨ RESTORED PER-SCENE ASPECT RATIO */}
                    <select
                      value={scene.aspectRatio || "16:9"}
                      onChange={(e) => updateScene(scene.id, "aspectRatio", e.target.value)}
                      className="text-[10px] font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-2.5 px-3 bg-[#2A2F38] text-[#f472b6] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#f472b6]/50 hover:bg-[#57707A]/20 transition-colors appearance-none uppercase tracking-wider"
                    >
                      <option value="16:9" className="bg-[#191D23]">📐 16:9</option>
                      <option value="9:16" className="bg-[#191D23]">📐 9:16</option>
                      <option value="1:1" className="bg-[#191D23]">📐 1:1</option>
                      <option value="21:9" className="bg-[#191D23]">📐 21:9</option>
                    </select>

                    <select
                      value={scene.duration || "5"}
                      onChange={(e) => updateScene(scene.id, "duration", e.target.value)}
                      className="text-[10px] font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-2.5 px-3 bg-[#2A2F38] text-[#DEDCDC] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C5BAC4]/50 hover:bg-[#57707A]/20 transition-colors appearance-none uppercase tracking-wider"
                    >
                      <option value="5" className="bg-[#191D23]">5 Secs</option>
                      <option value="10" className="bg-[#191D23]">10 Secs</option>
                      {(isKling || isSeedance2 || scene.aiModel === 'replicate:openai/sora-2') && (
                        <option value="15" className="bg-[#191D23]">15 Secs</option>
                      )}
                    </select>

                    {isPruna && (
                      <label className="flex items-center gap-2.5 cursor-pointer bg-[#2A2F38] px-3 py-2 border border-[#B3FF00]/30 rounded-xl hover:bg-[#B3FF00]/10 hover:border-[#B3FF00]/60 transition-all shadow-sm group/draft" title="4x Faster rendering for quick previews">
                        <input
                          type="checkbox"
                          checked={scene.prunaDraft || false}
                          onChange={(e) => updateScene(scene.id, "prunaDraft", e.target.checked)}
                          className="rounded border-[#57707A]/50 bg-[#191D23] text-[#B3FF00] focus:ring-[#B3FF00] cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-[#B3FF00] uppercase tracking-widest transition-colors mt-0.5">Draft Mode</span>
                      </label>
                    )}

                    {!isSeedance2 && (
                      <label className="flex items-center gap-2.5 cursor-pointer bg-[#2A2F38] px-3 py-2 border border-[#57707A]/40 rounded-xl hover:bg-[#57707A]/30 hover:border-[#C5BAC4]/40 transition-all shadow-sm group/check">
                        <input
                          type="checkbox"
                          checked={scene.useEndFrame || false}
                          onChange={(e) => updateScene(scene.id, "useEndFrame", e.target.checked)}
                          className="rounded border-[#57707A]/50 bg-[#191D23] text-[#C5BAC4] focus:ring-[#C5BAC4] cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-[#989DAA] group-hover/check:text-[#DEDCDC] uppercase tracking-widest transition-colors mt-0.5">End Frame</span>
                      </label>
                    )}

                    <div className="flex gap-1.5 bg-[#191D23] rounded-xl p-1 border border-[#57707A]/30 shadow-inner">
                      <button
                        onClick={() => moveSceneUp(index)}
                        disabled={index === 0}
                        title="Move scene up"
                        className={cn("p-1.5 rounded-lg transition-colors", index === 0 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveSceneDown(index)}
                        disabled={index === bRollScenes.length - 1}
                        title="Move scene down"
                        className={cn("p-1.5 rounded-lg transition-colors", index === bRollScenes.length - 1 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    {bRollScenes.length > 1 && (
                      <button onClick={() => removeScene(scene.id)} title="Delete Scene" className="text-[#57707A] hover:text-white p-2.5 rounded-xl transition-colors bg-[#191D23] border border-[#57707A]/30 hover:bg-red-500/80 hover:border-red-500 shadow-sm ml-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row p-6 gap-8">

                  <div className="w-full lg:w-1/2 flex flex-col gap-6 lg:border-r border-[#57707A]/20 lg:pr-8 relative">
                    {scene.videoUrl && <div className="absolute inset-0 bg-[#191D23]/80 backdrop-blur-md z-30 cursor-not-allowed rounded-xl border border-[#57707A]/30 flex flex-col items-center justify-center" title="Delete video to edit images">
                      <Lock className="w-8 h-8 text-[#57707A] mb-2" />
                      <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Images Locked</span>
                    </div>}

                    {isSeedance2 ? (
                      <div className="flex-1 flex flex-col gap-5">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block">
                              Visual Reference Tray <span className="text-[#57707A]/60 normal-case ml-1">(Optional)</span>
                            </label>
                            {seedancePreviews.length < 5 && (
                              <button
                                onClick={() => addSeedanceSlot(scene.id)}
                                className="text-[9px] font-bold text-[#C5BAC4] hover:text-white flex items-center gap-1 bg-[#191D23] border border-[#57707A]/40 hover:border-[#C5BAC4]/50 px-2 py-1 rounded shadow-sm transition-all"
                              >
                                <Plus className="w-3 h-3" /> Add Image
                              </button>
                            )}
                          </div>

                          <div className={cn("grid gap-4", seedancePreviews.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                            {seedancePreviews.map((preview: string | null, sIdx: number) => (
                              <div key={sIdx} className="flex flex-col gap-1">
                                <div className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex flex-col items-center justify-center transition-all group/upload shadow-inner">
                                  <div className="absolute top-2 left-2 z-20 bg-[#C5BAC4] text-[#191D23] px-2 py-1 text-[10px] font-black rounded uppercase shadow-lg border border-[#191D23]/20">@Image{sIdx + 1}</div>

                                  {seedancePreviews.length > 1 && (
                                    <button
                                      onClick={() => removeSeedanceSlot(scene.id, sIdx)}
                                      className="absolute -top-2 -right-2 z-30 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover/upload:opacity-100 transition-opacity hover:scale-110 shadow-xl border-2 border-[#191D23]"
                                      title="Remove this slot entirely"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {generatingSlot?.index === index && generatingSlot.type === 'primary' && generatingSlot.seedanceIndex === sIdx ? (
                                    <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                                  ) : preview ? (
                                    <><img src={preview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                      <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                                        <button type="button" onClick={() => setPreviewModalImg(preview)} className="p-2 bg-[#191D23] border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#DEDCDC] rounded-lg shadow-lg opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-4 w-4" /></button>
                                        <button type="button" onClick={() => clearSlot(scene.id, 'primary', sIdx)} className="p-2 bg-[#191D23] border border-[#57707A]/50 hover:bg-red-500 hover:border-red-400 text-white rounded-lg shadow-lg opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Trash2 className="h-4 w-4" /></button>
                                      </div></>
                                  ) : (
                                    <div
                                      className="absolute inset-0 z-20 flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors bg-transparent"
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, scene.id, "primary", sIdx)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const fileInput = document.getElementById(`seedance-${scene.id}-${sIdx}`);
                                        if (fileInput) fileInput.click();
                                      }}
                                    >
                                      <ImageIcon className="h-6 w-6 mb-1.5 pointer-events-none" />
                                      <p className="text-[9px] font-bold uppercase tracking-wider pointer-events-none">Drop or Click</p>
                                    </div>
                                  )}
                                  <input
                                    id={`seedance-${scene.id}-${sIdx}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleSceneFile(e, scene.id, "primary", sIdx)}
                                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                  />
                                </div>

                                <div className="flex gap-2 shrink-0 mt-1">
                                  {preview ? (
                                    <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary', sIdx)} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-Gen</Button>
                                  ) : (
                                    <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'primary', scene.prompt, sIdx)} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate</Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary', seedanceIndex: sIdx })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-[#57707A] mt-2 font-medium">Add up to 5 images and tag them using <strong className="text-[#C5BAC4]">@Image1</strong>, <strong className="text-[#C5BAC4]">@Image2</strong>, etc. in your prompt.</p>
                        </div>

                        <div className="mt-2">
                          <label className="text-[10px] font-bold text-[#b488d4] uppercase tracking-wider block mb-3">
                            Motion Reference Video <span className="text-[#57707A]/60 normal-case ml-1">(Optional)</span>
                          </label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleRefVideoDrop(e, scene.id)} className="relative h-28 rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#b488d4]/40 hover:border-[#b488d4]/80 hover:bg-[#b488d4]/5 flex flex-col items-center justify-center transition-all group/upload shadow-inner">
                            <div className="absolute top-1.5 left-1.5 z-20 bg-[#b488d4] text-[#191D23] px-1.5 py-0.5 text-[9px] font-black rounded uppercase shadow-md">@Video1</div>

                            {scene.referenceVideoPreview ? (
                              <>
                                <video src={scene.referenceVideoPreview} className="w-full h-full object-cover opacity-80" muted loop autoPlay playsInline />
                                <button type="button" onClick={() => { updateScene(scene.id, "referenceVideoFile", null); updateScene(scene.id, "referenceVideoPreview", null); }} className="absolute top-2 right-2 p-2 bg-[#191D23]/80 border border-[#b488d4]/50 hover:bg-red-500/90 hover:border-red-400 text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100 z-20"><X className="h-4 w-4" /></button>
                              </>
                            ) : (
                              <label htmlFor={`refvideo-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#b488d4]/70 hover:text-[#b488d4] transition-colors">
                                <Video className="h-6 w-6 mb-1.5" />
                                <p className="text-[10px] font-bold uppercase tracking-wider">Drop Video File</p>
                              </label>
                            )}
                            <input id={`refvideo-${scene.id}`} type="file" accept="video/mp4, video/quicktime" className="hidden" onChange={(e) => handleRefVideoSelect(e, scene.id)} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <p className="text-[9px] text-[#57707A] mt-2 font-medium">Upload a video to guide camera and character movement. Use <strong className="text-[#b488d4]">@Video1</strong> in your prompt.</p>
                        </div>
                      </div>
                    ) : (
                      // STANDARD LAYOUT
                      <div className="flex flex-col sm:flex-row gap-5 w-full">
                        <div className="flex-1 flex flex-col gap-3">
                          <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.primary}</label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "primary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                            {generatingSlot?.index === index && generatingSlot.type === 'primary' ? (
                              <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                            ) : scene.primaryPreview ? (
                              <><img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                <div className="absolute top-2 right-2 flex gap-2 z-20">
                                  <button type="button" onClick={() => setPreviewModalImg(scene.primaryPreview)} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-4 w-4" /></button>
                                  <button type="button" onClick={() => clearSlot(scene.id, "primary")} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-4 w-4" /></button>
                                </div></>
                            ) : (
                              <label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop Start Frame</p><p className="text-[8px] font-medium mt-1 text-[#57707A]/70">OR leave blank for Text-to-Video</p></label>
                            )}
                            <input id={`primary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "primary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <div className="flex gap-2 shrink-0 mt-1">
                            {scene.primaryPreview ? (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-Gen</Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library</Button>
                          </div>
                        </div>

                        <div className={cn("flex-1 flex flex-col gap-3 transition-all duration-300", !scene.useEndFrame && "opacity-40 grayscale pointer-events-none")}>
                          <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.secondary}</label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                            {!scene.useEndFrame ? (
                              <div className="text-center p-3"><p className="text-[10px] font-bold text-[#57707A]/50 uppercase tracking-widest">Disabled</p><p className="text-[8px] text-[#57707A]/40 mt-1.5 font-medium">Toggle "Use End Frame" to activate</p></div>
                            ) : generatingSlot?.index === index && generatingSlot.type === 'secondary' ? (
                              <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                            ) : scene.secondaryPreview ? (
                              <><img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                <div className="absolute top-2 right-2 flex gap-2 z-20">
                                  <button type="button" onClick={() => setPreviewModalImg(scene.secondaryPreview)} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-4 w-4" /></button>
                                  <button type="button" onClick={() => clearSlot(scene.id, "secondary")} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-4 w-4" /></button>
                                </div></>
                            ) : (
                              <label htmlFor={`secondary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop File</p></label>
                            )}
                            <input id={`secondary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "secondary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <div className="flex gap-2 shrink-0 mt-1">
                            {scene.secondaryPreview ? (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-Gen</Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleGenerateSlot(index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'secondary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full lg:w-1/2 flex flex-col relative gap-4">
                    <div className="flex items-center justify-between shrink-0 mb-1">
                      <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider flex items-center gap-1.5">
                        {scene.videoUrl ? <><Video className="h-4 w-4 text-[#B3FF00]" /> <span className="text-[#B3FF00]">Generated Video</span></> : <span className="text-[#DEDCDC]">Scene Director</span>}
                      </label>
                      {!scene.videoUrl && (
                        <button onClick={() => handleSuggestPrompt(scene.id, index)} disabled={suggestingPromptIndex === index} className="text-[#191D23] bg-[#C5BAC4] hover:bg-white px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-md shadow-[#C5BAC4]/10 border-none">
                          {suggestingPromptIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggest
                        </button>
                      )}
                      {scene.videoUrl && (
                        <button onClick={() => handleDeleteVideo(scene.id)} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 border border-red-500/30 hover:border-red-500 px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-sm">
                          <Trash2 className="h-3.5 w-3.5" /> Delete Video
                        </button>
                      )}
                    </div>

                    <div className="flex-1 rounded-xl overflow-hidden border border-[#57707A]/30 bg-[#191D23] flex flex-col shadow-inner">
                      {scene.isGeneratingVideo ? (
                        <div className="flex-1 flex flex-col items-center justify-center bg-[#191D23]/90 backdrop-blur-sm gap-4 p-8 min-h-[250px]">
                          <div className="relative">
                            <div className="absolute inset-0 bg-[#B3FF00]/20 blur-xl rounded-full animate-pulse"></div>
                            <Loader2 className="h-12 w-12 text-[#B3FF00] animate-spin relative z-10" />
                          </div>
                          <span className="text-xs font-bold text-[#DEDCDC] uppercase tracking-widest animate-pulse font-display mt-2">Rendering Video...</span>
                          <span className="text-[10px] text-[#989DAA] text-center font-medium">Media generation runs in the background.<br />It is safe to navigate away from this page.</span>
                          <button
                            onClick={() => updateScene(scene.id, "isGeneratingVideo", false)}
                            className="mt-6 text-[10px] font-bold text-[#57707A] hover:text-red-400 px-5 py-2.5 bg-[#2A2F38] border border-[#57707A]/40 hover:border-red-400/50 rounded-lg transition-colors shadow-sm"
                          >
                            Taking too long? Click here to cancel.
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col flex-1 h-full">

                          {scene.videoUrl ? (
                            <div className="w-full flex-1 bg-[#0F1115] relative shrink-0 border-b border-[#57707A]/30 flex items-center justify-center">
                              <video key={scene.videoUrl} src={scene.videoUrl} controls className="w-full h-full max-h-[300px] object-contain" playsInline />
                            </div>
                          ) : (
                            <div className="flex flex-col flex-1 relative">
                              <Textarea
                                value={scene.prompt}
                                onChange={(e) => updateScene(scene.id, "prompt", e.target.value)}
                                className="flex-1 w-full text-sm p-5 resize-none bg-transparent border-b border-[#57707A]/30 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[140px]"
                                placeholder={
                                  scene.mode === 'ugc'
                                    ? "UGC Action: Describe the influencer (e.g., holding product, looking shocked, pointing at text)..."
                                    : isNativeAudio
                                      ? "Describe your scene...\n\nExample: A wide shot of a neon city. A man turns and says \"This is incredible!\""
                                      : "Describe your scene...\n\nExample: Cinematic tracking shot following a woman through a sunlit forest..."
                                }
                              />
                            </div>
                          )}

                          {/* PROMPT CHARACTER COUNTER */}
                          {!scene.videoUrl && (
                            <div className={cn("text-right text-[10px] font-mono px-5 py-2 border-b border-[#57707A]/30 bg-[#2A2F38]/50", (scene.prompt?.length || 0) > 500 ? "text-red-400 font-bold" : "text-[#57707A]")}>
                              {scene.prompt?.length || 0} / 500
                            </div>
                          )}

                          {/* ✨ DYNAMIC INJECTION TOOLBAR (NO ASPECT RATIO HERE) */}
                          {!scene.videoUrl && (
                            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 bg-[#2A2F38] border-b border-[#57707A]/30 shrink-0">
                              <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>

                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                className="text-[10px] font-bold text-[#C5BAC4] bg-[#191D23] border border-[#C5BAC4]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 hover:bg-[#C5BAC4]/10 transition-colors appearance-none shadow-sm"
                              >
                                <option value="" disabled hidden>🎥 Camera...</option>
                                <option value=" Cinematic tracking shot, " className="bg-[#191D23]">Cinematic Tracking</option>
                                <option value=" Slow drone flyover, " className="bg-[#191D23]">Drone Flyover</option>
                                <option value=" Handheld shaky cam, " className="bg-[#191D23]">Handheld Shaky</option>
                                <option value=" Medium close-up, " className="bg-[#191D23]">Medium Close-up</option>
                                <option value=" Extreme macro close-up, " className="bg-[#191D23]">Macro Close-up</option>
                                <option value=" Smooth dolly-in, " className="bg-[#191D23]">Smooth Dolly-in</option>
                                <option value=" Slow orbit around, " className="bg-[#191D23]">Slow Orbit</option>
                              </select>

                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                className="text-[10px] font-bold text-[#B3FF00] bg-[#191D23] border border-[#B3FF00]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#B3FF00]/60 hover:bg-[#B3FF00]/10 transition-colors appearance-none shadow-sm"
                              >
                                <option value="" disabled hidden>🔊 Sound FX...</option>
                                <option value=" [ambient street noise] " className="bg-[#191D23]">Street Noise</option>
                                <option value=" [heavy rain and thunder] " className="bg-[#191D23]">Rain & Thunder</option>
                                <option value=" [cinematic bass drop] " className="bg-[#191D23]">Bass Drop</option>
                                <option value=" [muffled cafe chatter] " className="bg-[#191D23]">Cafe Chatter</option>
                                <option value=" [whoosh transition] " className="bg-[#191D23]">Whoosh Transition</option>
                              </select>

                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                className="text-[10px] font-bold text-[#00E5FF] bg-[#191D23] border border-[#00E5FF]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#00E5FF]/60 hover:bg-[#00E5FF]/10 transition-colors appearance-none shadow-sm"
                              >
                                <option value="" disabled hidden>🌌 Physics...</option>
                                <option value=" Zero-gravity environment, objects floating gracefully in mid-air. " className="bg-[#191D23]">Zero-Gravity (Antigravity)</option>
                                <option value=" Extreme slow-motion, 120fps, cinematic time-dilation. " className="bg-[#191D23]">Epic Slow-Motion</option>
                                <option value=" Hyper time-lapse, fast-moving clouds and shadows. " className="bg-[#191D23]">Hyper Time-Lapse</option>
                                <option value=" Underwater physics, bubbles rising, distorted light rays. " className="bg-[#191D23]">Underwater Physics</option>
                                <option value=" Reversed time, objects moving backwards perfectly. " className="bg-[#191D23]">Reversed Time</option>
                              </select>

                              {(isKling || isSeedance2) && (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[10px] font-bold text-[#FFB300] bg-[#191D23] border border-[#FFB300]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#FFB300]/60 hover:bg-[#FFB300]/10 transition-colors appearance-none shadow-sm"
                                  title="Use for Multi-Shot narrative sequences"
                                >
                                  <option value="" disabled hidden>⏱️ Timing...</option>
                                  <option value=" At the 4th second, " className="bg-[#191D23]">At 4 Seconds</option>
                                  <option value=" At the 8th second, " className="bg-[#191D23]">At 8 Seconds</option>
                                  <option value=" \n\nCut to Shot 2: " className="bg-[#191D23]">Cut to Shot 2</option>
                                  <option value=" \n\nCut to Shot 3: " className="bg-[#191D23]">Cut to Shot 3</option>
                                </select>
                              )}

                              <button
                                onClick={() => {
                                  const dialogueFormat = (isKling || isSeedance2)
                                    ? '\nCharacter Name (confident, English): "Type exact dialogue here" '
                                    : ' The character says "Type exact dialogue here" ';
                                  updateScene(scene.id, "prompt", (scene.prompt || "") + dialogueFormat);
                                }}
                                className="inline-flex items-center text-[10px] font-bold px-3 py-2 rounded-lg transition-all shadow-sm text-[#DEDCDC] bg-[#191D23] hover:bg-[#57707A]/30 border border-[#57707A]/50 hover:border-[#DEDCDC]/50"
                                title="Inserts model-specific TTS dialogue format"
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-[#57707A]" /> TTS Dialogue
                              </button>
                            </div>
                          )}

                          {(() => {
                            return (
                              <div className="flex flex-col flex-1 bg-[#191D23]">
                                {isNativeAudio ? (
                                  <div className="p-4 border-b border-[#57707A]/30 flex-1">
                                    <div className="flex items-start gap-3 bg-[#191D23] text-[#DEDCDC] text-[10px] font-bold px-4 py-3 rounded-xl border border-[#57707A]/40 shadow-inner">
                                      <Zap className="w-4 h-4 shrink-0 text-[#B3FF00] mt-0.5" />
                                      <span className="leading-relaxed text-[#989DAA]">
                                        <strong className="text-[#B3FF00]">Native Text-To-Speech Active:</strong> Use the "TTS Dialogue" button above to inject spoken dialogue natively through the prompt. To lip-sync with an uploaded MP3, use the <strong>Audio-to-Video</strong> tool on the dashboard.
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-5 bg-[#2A2F38]/50 border-b border-[#57707A]/30 flex-1">
                                    <div className="flex items-start gap-3 bg-[#191D23] text-[#989DAA] text-[10px] font-bold px-4 py-3.5 rounded-xl border border-[#57707A]/40 shadow-inner">
                                      <Mic className="w-4 h-4 shrink-0 text-[#57707A] mt-0.5" />
                                      <span className="leading-relaxed">This AI model generates silent video.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {!scene.videoUrl && (
                            <div className="p-4 bg-[#191D23]/80 border-t border-[#57707A]/30 flex justify-between items-center shrink-0">
                              <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider pl-2">
                                {scene.primaryPreview ? "Ready for animation" : "Text-to-Video Ready"}
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateSingleVideo(index)}
                                disabled={scene.isGeneratingVideo}
                                className={cn("h-10 text-[10px] font-bold px-5 rounded-lg transition-all shadow-md", "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] border-none")}
                              >
                                <Film className="w-4 h-4 mr-2" /> Generate Scene Video
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

        <Button onClick={addEmptyScene} variant="outline" className="w-full mt-2 border-dashed border-2 border-[#57707A]/50 bg-[#191D23]/50 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/50 hover:bg-[#2A2F38]/80 py-8 rounded-2xl font-bold transition-all shadow-inner text-sm">
          <Plus className="mr-2 h-5 w-5" /> Add Another Scene
        </Button>
      </div>

      {/* ── RIGHT PANE: DIRECTOR & PREVIEW ── */}
      <div className="w-full xl:w-[400px] shrink-0 xl:sticky xl:top-6 flex flex-col gap-6 z-20">
        {/* CARD 1: MASTER DIRECTOR */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl relative overflow-hidden">

          {/* ✨ RESTORED ASPECT RATIO DROPDOWN ✨ */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#57707A]/20">
            <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide"><Settings2 className="w-4 h-4 text-[#C5BAC4]" /> Master Director</h3>

            {/* <select
              value={localAspectRatio}
              onChange={(e) => setLocalAspectRatio(e.target.value)}
              className="text-xs font-bold text-[#f472b6] bg-[#191D23] border border-[#f472b6]/30 px-3 py-1.5 rounded-xl cursor-pointer hover:border-[#f472b6]/60 transition-colors appearance-none shadow-sm outline-none"
              title="Universal Aspect Ratio for all scenes"
            >
              <option value="16:9">📐 16:9</option>
              <option value="9:16">📐 9:16</option>
              <option value="1:1">📐 1:1</option>
              <option value="21:9">📐 21:9</option>
            </select> */}
          </div>

          <div className="flex flex-col gap-4 mb-2">
            <div className="relative">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Master Story Concept</label>
              <Textarea value={bRollConcept} onChange={(e) => setBRollConcept(e.target.value)} placeholder="Describe the full story flow AND dialogue..." className="flex-1 w-full resize-none h-40 text-sm p-4 bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar" />
            </div>

            {/* ✨ NEW: AI PROMPT ENHANCEMENT TOGGLE */}
            <div className="flex items-center justify-between bg-[#191D23] p-3 rounded-xl border border-[#57707A]/30 shadow-inner mt-2">
              <div>
                <p className="text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider">✨ AI Prompt Helper</p>
                <p className="text-[9px] text-[#57707A] font-medium mt-0.5">ON: AI rewrites prompt. OFF: Pro raw mode.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={aiEnhance} onChange={(e) => setAiEnhance(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-[#2A2F38] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#57707A] peer-checked:after:bg-[#B3FF00] after:border after:rounded-full after:h-4 after:w-4 after:transition-all border border-[#57707A]/50"></div>
              </label>
            </div>

            {/* ✨ RESTORED MODEL CONSISTENCY TOGGLE ✨ */}
            <div className="flex items-center justify-between bg-[#191D23] p-3 rounded-xl border border-[#57707A]/30 shadow-inner">
              <div>
                <p className="text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider">AI Model Selection</p>
                <p className="text-[9px] text-[#57707A] font-medium mt-0.5">Let AI pick dynamically per scene, or lock one model.</p>
              </div>
              <div className="flex gap-1 bg-[#2A2F38] p-1 rounded-lg border border-[#57707A]/40">
                <button onClick={() => setModelConsistency("dynamic")} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-md transition-all", modelConsistency === "dynamic" ? "bg-[#B3FF00] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>
                  Dynamic
                </button>
                <button onClick={() => setModelConsistency("consistent")} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-md transition-all", modelConsistency === "consistent" ? "bg-[#C5BAC4] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>
                  Consistent
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-1">
              <Button onClick={handleWriteScript} disabled={isWritingScript || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4] h-12 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
                {isWritingScript ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />} Write Prompts &amp; Audio
              </Button>
            </div>
          </div>
        </div>

        {/* CARD 2: CASTING ROOM */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#57707A]/20">
            <label className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide">
              <Lock className="h-4 w-4 text-[#C5BAC4]" /> Consistency Lock
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
            <div className="flex flex-col gap-3 mt-1 animate-in fade-in">
              <div className="flex items-center justify-between bg-[#191D23] border border-[#C5BAC4]/30 rounded-xl p-2 shadow-inner">
                {(() => {
                  const actorA = actors.find(a => a.id === selectedActorA);
                  return actorA ? (
                    <div className="flex items-center gap-3 pl-2">
                      <div
                        className="w-10 h-10 rounded-lg overflow-hidden border border-[#57707A]/50 shadow-sm relative group cursor-pointer"
                        onClick={() => setPreviewModalImg(actorA.stitchedSheetUrl)}
                      >
                        <img src={actorA.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-4 h-4 text-white" /></div>
                      </div>
                      <span className="text-[#C5BAC4] text-sm font-bold">
                        {actorA.name}
                      </span>
                    </div>
                  ) : null;
                })()}
                <button onClick={() => setIsCharacterLockModalOpen(true)} className="inline-flex items-center justify-center h-10 w-10 bg-[#2A2F38] text-[#DEDCDC] hover:text-[#C5BAC4] rounded-lg border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors shadow-sm" title="Change Actor">
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {enableCharacterLock && !selectedActorA && (
            <button onClick={() => setIsCharacterLockModalOpen(true)} className="mt-1 w-full flex items-center justify-center gap-2 bg-[#191D23] hover:bg-[#57707A]/30 text-[#DEDCDC]/60 hover:text-[#C5BAC4] text-xs font-bold py-3.5 rounded-xl border border-dashed border-[#57707A]/50 hover:border-[#C5BAC4]/50 transition-all animate-in fade-in shadow-inner">
              <UserPlus className="w-4 h-4" /> Select Actor to Lock
            </button>
          )}

          <Button onClick={() => setIsCastingOpen(true)} variant="outline" className="w-full mt-4 h-11 text-xs font-bold border-[#57707A]/40 text-[#DEDCDC] hover:text-[#191D23] hover:bg-[#C5BAC4] hover:border-[#C5BAC4] bg-[#191D23] transition-all rounded-xl shadow-sm">
            <Users className="w-4 h-4 mr-2" /> Open Casting Room
          </Button>
        </div>

        {/* CARD 3: RENDER ENGINE & PREVIEWS */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl flex flex-col relative">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#57707A]/20">
            <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide"><Palette className="w-4 h-4 text-[#C5BAC4]" /> Render Engine</h3>
          </div>

          <div className="flex items-center gap-3 bg-[#191D23] p-2 rounded-xl border border-[#57707A]/40 shadow-inner mb-5">
            <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="bg-transparent text-xs font-bold text-[#DEDCDC] focus:outline-none cursor-pointer flex-1 appearance-none px-2 py-1">
              {VISUAL_STYLES.map(s => <option key={s.id} value={s.id} className="bg-[#191D23]">{s.label}</option>)}
            </select>
          </div>

          <div className="mb-6">
            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-[#C5BAC4]" /> Global Style Reference</label>
            <div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 transition-all overflow-hidden group/ref flex flex-col shadow-inner">
              {frameReferencePreview ? (
                <>
                  <img src={frameReferencePreview} className="w-full h-full object-cover opacity-90" />
                  <button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full shadow-md opacity-0 group-hover/ref:opacity-100 transition-all hover:scale-110 hover:bg-red-500 z-20"><X className="h-3 w-3" /></button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-[#C5BAC4] text-center py-1.5 font-bold tracking-widest uppercase z-10">Style Locked</div>
                </>
              ) : (
                <label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors">
                  <ImageIcon className="h-6 w-6 mb-2" />
                  <span className="text-[10px] font-bold text-center uppercase tracking-widest">Click or Drop<br />Image Here</span>
                </label>
              )}
              <input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleGenerateAllImages} disabled={isGeneratingAllImages || generatingSlot !== null || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#B3FF00] bg-[#191D23] hover:bg-[#B3FF00] h-12 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
              {isGeneratingAllImages ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Images className="h-4 w-4 mr-2" />} Generate Images ({filledImageSlots}/{totalImageSlots})
            </Button>
            {isGeneratingAllImages && (
              <p className="text-[9px] text-[#C5BAC4] font-bold uppercase tracking-wider text-center animate-pulse mt-1">
                Images generate in background. You can safely leave this page.
              </p>
            )}

            <div className="bg-[#191D23] border border-[#57707A]/40 p-3.5 rounded-xl mt-3 shadow-inner">
              <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 text-center">Video Processing</p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleGenerateSceneVideos} disabled={isGeneratingVideos} className={cn("w-full h-11 justify-center text-xs font-bold rounded-lg transition-all shadow-md border-none", "bg-[#57707A]/30 hover:bg-[#57707A]/50 text-[#DEDCDC]")}>
                  {isGeneratingVideos ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Film className="h-4 w-4 mr-2" />} 1. Gen Scene Videos
                </Button>

                {isGeneratingVideos && (
                  <p className="text-[9px] text-[#B3FF00] font-bold uppercase tracking-wider text-center animate-pulse">
                    Videos rendering in background. You can safely leave this page.
                  </p>
                )}

                <Button onClick={() => { }} disabled={!allVideosGenerated} className={cn("w-full h-12 justify-center text-sm font-bold rounded-lg transition-all shadow-md border-none", allVideosGenerated ? "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23]" : "bg-[#191D23] text-[#57707A] cursor-not-allowed border border-[#57707A]/30")}>
                  2. Render Final Sequence
                </Button>
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
                      <div
                        className="aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-[#57707A]/30 relative cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setPreviewModalImg(actor.stitchedSheetUrl); }}
                      >
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-5 h-5 text-white" /></div>
                        {isSelected && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black px-2 py-0.5 uppercase tracking-widest rounded shadow-md z-10">Locked</div>}
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