"use client";

import { useState, useEffect } from "react";
import { Upload, X, Sparkles, Loader2, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, Mic, FolderOpen, Wand2, Plus, Trash2, Video, Music, CheckCircle, Save, Users } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";

// ✨ ADDED: Dual character audio states
type StoryboardScene = any & {
  videoUrl?: string | null;
  isGeneratingVideo?: boolean;
  prompt?: string;
  aiModel?: string;
  useEndFrame?: boolean;

  // Character 1 (Default)
  audioPrompt?: string;
  sceneAudioUrl?: string | null;
  sceneAudioPublicUrl?: string | null;
  audioName?: string;
  isGeneratingAudio?: boolean;

  // Character 2 (Kling 3.0 Multi-Character)
  isMultiCharacter?: boolean;
  audioPromptB?: string;
  sceneAudioUrlB?: string | null;
  sceneAudioPublicUrlB?: string | null;
  audioNameB?: string;
  isGeneratingAudioB?: boolean;
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
    const savedScenes = localStorage.getItem('blink_storyboard_scenes');
    if (savedScenes) {
      try {
        setBRollScenes(JSON.parse(savedScenes));
      } catch (e) {
        console.error("Failed to parse saved scenes", e);
      }
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

        isMultiCharacter: false,
        audioPromptB: "",
        sceneAudioUrlB: null,
        sceneAudioPublicUrlB: null,
        audioNameB: "",
        isGeneratingAudioB: false,

        videoUrl: null,
        isGeneratingVideo: false
      }));
      setBRollScenes(defaultScenes);
    }
  }, []);

  useEffect(() => {
    if (bRollScenes.length > 0) {
      localStorage.setItem('blink_storyboard_scenes', JSON.stringify(bRollScenes));
    }
  }, [bRollScenes]);

  const [generatingSlot, setGeneratingSlot] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<{ index: number, type: 'primary' | 'secondary' } | null>(null);
  const [suggestingPromptIndex, setSuggestingPromptIndex] = useState<number | null>(null);
  const [sendingAudioId, setSendingAudioId] = useState<string | null>(null);

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

      const directorData = await callN8n('director', {
        clientId: clientId,
        prompt: `Concept: ${bRollConcept}\n\nCRITICAL: Break this concept into ${bRollScenes.length} scenes. For each scene, you MUST return an "image_prompt" (visuals) AND an "audio_prompt" (the exact spoken English narration script or sound effects for that specific scene).`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: audioEngine,
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
        prompt: `Write a visual image prompt AND the exact English spoken narration script for Scene ${index + 1} based on this concept: "${bRollConcept}". The camera movement/style is "${sceneMode}".`,
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

  // ✨ UPDATED: Handles custom upload for Slot A or Slot B
  const handleCustomAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, slot: 'A' | 'B' = 'A') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const localUrl = URL.createObjectURL(file);
      const defaultName = file.name.replace(/\.[^/.]+$/, "");

      if (slot === 'A') {
        updateScene(sceneId, "sceneAudioUrl", localUrl);
        updateScene(sceneId, "audioPrompt", `[Custom Upload] ${file.name}`);
        updateScene(sceneId, "audioName", defaultName);
      } else {
        updateScene(sceneId, "sceneAudioUrlB", localUrl);
        updateScene(sceneId, "audioPromptB", `[Custom Upload] ${file.name}`);
        updateScene(sceneId, "audioNameB", defaultName);
      }

      const audioPath = `videos/${clientId}/custom_audio_${Date.now()}_${file.name}`;
      await supabase.storage.from("assets").upload(audioPath, file);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

      if (slot === 'A') updateScene(sceneId, "sceneAudioPublicUrl", publicUrl);
      else updateScene(sceneId, "sceneAudioPublicUrlB", publicUrl);

    } catch (err) {
      console.error("Audio upload failed:", err);
      alert("Failed to process uploaded audio file.");
    }
  };

  // ✨ UPDATED: Handles TTS Generation for Slot A or Slot B
  const handleGenerateSceneAudio = async (index: number, slot: 'A' | 'B' = 'A') => {
    const scene = bRollScenes[index];
    const promptText = slot === 'A' ? scene.audioPrompt : scene.audioPromptB;

    if (!promptText?.trim() || !clientId) return alert("Please write an audio script first.");

    if (slot === 'A') updateScene(scene.id, "isGeneratingAudio", true);
    else updateScene(scene.id, "isGeneratingAudioB", true);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: promptText })
      });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const localUrl = URL.createObjectURL(blob);
      const audioPath = `videos/${clientId}/scene_${index + 1}_audio_${slot}_${Date.now()}.mp3`;

      await supabase.storage.from("assets").upload(audioPath, blob);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

      if (slot === 'A') {
        updateScene(scene.id, "sceneAudioUrl", localUrl);
        updateScene(scene.id, "audioName", `Scene ${index + 1} Voice 1`);
        updateScene(scene.id, "sceneAudioPublicUrl", publicUrl);
      } else {
        updateScene(scene.id, "sceneAudioUrlB", localUrl);
        updateScene(scene.id, "audioNameB", `Scene ${index + 1} Voice 2`);
        updateScene(scene.id, "sceneAudioPublicUrlB", publicUrl);
      }

    } catch (err: any) {
      console.error("Audio generation failed:", err);
      alert(`Audio generation failed: ${err.message}`);
    } finally {
      if (slot === 'A') updateScene(scene.id, "isGeneratingAudio", false);
      else updateScene(scene.id, "isGeneratingAudioB", false);
    }
  };

  const handleRemoveSceneAudio = (sceneId: string, slot: 'A' | 'B' = 'A') => {
    if (slot === 'A') {
      updateScene(sceneId, "sceneAudioUrl", null);
      updateScene(sceneId, "sceneAudioPublicUrl", null);
      updateScene(sceneId, "audioName", "");
    } else {
      updateScene(sceneId, "sceneAudioUrlB", null);
      updateScene(sceneId, "sceneAudioPublicUrlB", null);
      updateScene(sceneId, "audioNameB", "");
    }
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

  const handleGenerateSingleVideo = async (slotIndex: number) => {
    const scene = bRollScenes[slotIndex];
    if (!scene.primaryPreview || !clientId) return alert("Please generate or upload a primary image first.");
    if (scene.useEndFrame && !scene.secondaryPreview) return alert("You enabled the End Frame toggle. Please generate or upload an End Frame before animating.");

    updateScene(scene.id, "isGeneratingVideo", true);

    try {
      let finalPrimaryUrl = scene.primaryPreview;
      let finalSecondaryUrl = scene.useEndFrame ? scene.secondaryPreview : null;

      if ((scene.mode === 'ugc' || scene.mode === 'clothing') && finalSecondaryUrl) {
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

      // ✨ BACKEND PAYLOAD: Send both audio URLs if multi-character is enabled
      await callN8n('scene_video_generator', {
        post_id: postId,
        client_id: clientId,
        primary_image_url: finalPrimaryUrl,
        secondary_image_url: finalSecondaryUrl,
        user_prompt: scene.prompt || bRollConcept,
        duration: "8",
        video_mode: scene.mode,
        ai_model_override: scene.aiModel || "auto",
        audio_url_a: scene.sceneAudioPublicUrl || null,
        audio_url_b: scene.isMultiCharacter ? scene.sceneAudioPublicUrlB : null
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
                    </div>
                    <div className="flex items-center gap-3">

                      {/* ✨ KLING 3.0 DUAL CHARACTER TOGGLE ✨ */}
                      {scene.aiModel === "kling-3.0/video" && (
                        <label className="flex items-center gap-2 cursor-pointer bg-orange-50 px-2 py-1 border border-orange-200 rounded shadow-sm hover:bg-orange-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={scene.isMultiCharacter || false}
                            onChange={(e) => updateScene(scene.id, "isMultiCharacter", e.target.checked)}
                            className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider flex items-center gap-1"><Users className="w-3 h-3" /> Dual Character</span>
                        </label>
                      )}

                      <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 border border-gray-200 rounded shadow-sm hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={scene.useEndFrame || false}
                          onChange={(e) => updateScene(scene.id, "useEndFrame", e.target.checked)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Use End Frame</span>
                      </label>

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
                                className="flex-1 w-full text-xs p-3 resize-none bg-white border-b border-gray-200 focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[80px]"
                                placeholder={
                                  scene.mode === 'ugc'
                                    ? "UGC Action: Describe the influencer (e.g., holding product, looking shocked, pointing at text)..."
                                    : "Visual prompt: Describe the camera movement and aesthetics..."
                                }
                              />
                            )}

                            {/* ✨ DYNAMIC AUDIO GRID: Split into two columns if Dual Character is enabled */}
                            <div className={cn("flex flex-col flex-1 bg-white", scene.isMultiCharacter ? "grid grid-cols-2 divide-x divide-gray-200" : "")}>

                              {/* --- CHARACTER 1 AUDIO BLOCK --- */}
                              <div className="flex flex-col h-full min-w-0">
                                {scene.isMultiCharacter && <div className="bg-blue-100 text-[9px] font-bold text-blue-700 px-2 py-1 flex items-center justify-between border-b border-blue-200">Character 1 (Left Face)</div>}

                                <Textarea
                                  value={scene.audioPrompt || ""}
                                  onChange={(e) => updateScene(scene.id, "audioPrompt", e.target.value)}
                                  className="flex-1 w-full text-xs p-3 resize-none bg-blue-50/20 border-b border-blue-100 focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[70px]"
                                  placeholder="Type English narration or upload audio file below..."
                                />

                                <div className="p-2 border-b border-blue-100 bg-blue-50 flex flex-col gap-2 shrink-0">
                                  {scene.sceneAudioUrl ? (
                                    <div className="flex flex-col gap-2 w-full">
                                      <div className="flex items-center gap-2">
                                        <audio controls src={scene.sceneAudioUrl} className="h-8 flex-1 w-full min-w-0" />
                                        <button onClick={() => handleRemoveSceneAudio(scene.id, 'A')} className="p-1.5 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors" title="Delete Track">
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
                                          <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleCustomAudioUpload(e, scene.id, 'A')} />
                                        </label>
                                        <Button size="sm" onClick={() => handleGenerateSceneAudio(index, 'A')} disabled={!scene.audioPrompt || scene.isGeneratingAudio || scene.audioPrompt.startsWith("[Custom Upload]")} className={cn("h-8 text-[11px] font-bold px-3 transition-colors flex-1 xl:flex-none", scene.audioPrompt && !scene.audioPrompt.startsWith("[Custom Upload]") ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" : "bg-blue-200 text-blue-400")}>
                                          {scene.isGeneratingAudio ? <Loader2 className="w-3.5 h-3.5 xl:mr-1.5 animate-spin" /> : <Mic className="w-3.5 h-3.5 xl:mr-1.5" />} <span className="hidden xl:inline">Generate TTS</span>
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* --- CHARACTER 2 AUDIO BLOCK (Only if Multi-Character toggled ON) --- */}
                              {scene.isMultiCharacter && (
                                <div className="flex flex-col h-full min-w-0 border-l border-gray-200">
                                  <div className="bg-emerald-100 text-[9px] font-bold text-emerald-700 px-2 py-1 flex items-center justify-between border-b border-emerald-200">Character 2 (Right Face)</div>

                                  <Textarea
                                    value={scene.audioPromptB || ""}
                                    onChange={(e) => updateScene(scene.id, "audioPromptB", e.target.value)}
                                    className="flex-1 w-full text-xs p-3 resize-none bg-emerald-50/20 border-b border-emerald-100 focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[70px]"
                                    placeholder="Type Character 2 dialogue..."
                                  />

                                  <div className="p-2 border-b border-emerald-100 bg-emerald-50 flex flex-col gap-2 shrink-0">
                                    {scene.sceneAudioUrlB ? (
                                      <div className="flex flex-col gap-2 w-full">
                                        <div className="flex items-center gap-2">
                                          <audio controls src={scene.sceneAudioUrlB} className="h-8 flex-1 w-full min-w-0" />
                                          <button onClick={() => handleRemoveSceneAudio(scene.id, 'B')} className="p-1.5 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors" title="Delete Track">
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                        <div className="flex gap-2 w-full items-center">
                                          <input type="text" value={scene.audioNameB || ""} onChange={(e) => updateScene(scene.id, "audioNameB", e.target.value)} className="flex-1 text-[11px] font-bold text-emerald-900 px-2 py-1.5 rounded border border-emerald-200 focus:outline-emerald-400 bg-white min-w-0" placeholder="Name this clip..." />
                                          <Button size="sm" onClick={() => handleSendAudioToEditor(scene.id, scene.audioNameB || `Scene Audio`, scene.sceneAudioUrlB!, scene.sceneAudioPublicUrlB)} disabled={sendingAudioId === scene.id} className="h-8 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shrink-0">
                                            {sendingAudioId === scene.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                                        <span className="text-[9px] font-medium text-emerald-500 uppercase tracking-wider truncate hidden xl:inline-block">
                                          {scene.audioPromptB ? "Ready for TTS" : "Add script"}
                                        </span>
                                        <div className="flex gap-1.5 shrink-0 w-full xl:w-auto justify-end">
                                          <label className="flex items-center justify-center h-8 px-3 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-100 rounded-md text-[11px] font-bold cursor-pointer transition-colors shadow-sm flex-1 xl:flex-none">
                                            <Upload className="w-3 h-3 xl:mr-1.5" /> <span className="hidden xl:inline">Upload</span>
                                            <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleCustomAudioUpload(e, scene.id, 'B')} />
                                          </label>
                                          <Button size="sm" onClick={() => handleGenerateSceneAudio(index, 'B')} disabled={!scene.audioPromptB || scene.isGeneratingAudioB || scene.audioPromptB.startsWith("[Custom Upload]")} className={cn("h-8 text-[11px] font-bold px-3 transition-colors flex-1 xl:flex-none", scene.audioPromptB && !scene.audioPromptB.startsWith("[Custom Upload]") ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" : "bg-emerald-200 text-emerald-400")}>
                                            {scene.isGeneratingAudioB ? <Loader2 className="w-3.5 h-3.5 xl:mr-1.5 animate-spin" /> : <Mic className="w-3.5 h-3.5 xl:mr-1.5" />} <span className="hidden xl:inline">Generate TTS</span>
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                            </div>

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
        {generatedAudioUrl && (<div className="shrink-0 border-t border-orange-200/50 pt-4 pb-2 animate-in slide-in-from-bottom-2"><label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1"><Mic className="h-3 w-3" /> Generated Voiceover</label><div className="bg-white/60 rounded-xl p-2 border border-orange-300 shadow-sm relative group/audio"><audio controls src={generatedAudioUrl} className="w-full h-8" /><button onClick={() => setGeneratedAudioUrl(null)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/audio:opacity-100 transition-opacity shadow-md z-10"><X className="h-3 w-3" /></button></div></div>)}
        <div className="shrink-0 border-t border-orange-200/50 pt-4"><label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2 block flex items-center gap-1"><Upload className="h-3 w-3" /> Drop Style Reference</label><div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-orange-300 bg-white/60 hover:bg-white transition-colors overflow-hidden group/ref flex flex-col">{frameReferencePreview ? (<><img src={frameReferencePreview} className="w-full h-full object-cover" /><button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); }} className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full shadow-sm opacity-0 group-hover/ref:opacity-100 transition-opacity"><X className="h-4 w-4" /></button><div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white text-center py-1 font-bold tracking-widest uppercase">Style Locked</div></>) : (<label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-orange-400 hover:text-orange-500"><ImageIcon className="h-6 w-6 mb-2 opacity-50" /><span className="text-[10px] font-bold text-center leading-tight uppercase">Click or Drop<br />Image Here</span></label>)}<input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} /></div></div>
      </div>

      <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} />
      {previewModalImg && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewModalImg(null)}><div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}><button onClick={() => setPreviewModalImg(null)} className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"><X className="h-6 w-6" /></button><img src={previewModalImg} className="w-full h-full object-contain rounded-lg shadow-2xl" alt="Preview Enlarged" /></div></div>)}
      <Dialog open={regenDialogState.isOpen} onOpenChange={(open) => !open && setRegenDialogState(prev => ({ ...prev, isOpen: false }))}><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle className="flex items-center gap-2 text-purple-700"><Wand2 className="h-5 w-5" /> Regenerate {regenDialogState.slotType === 'primary' ? 'Primary' : 'Secondary'} Image</DialogTitle><DialogDescription>Edit the prompt below to refine the generation for this specific slot in Scene {regenDialogState.index !== null ? regenDialogState.index + 1 : ''}.</DialogDescription></DialogHeader><div className="py-4"><Textarea value={regenDialogState.promptText} onChange={(e) => setRegenDialogState(prev => ({ ...prev, promptText: e.target.value }))} placeholder="Enter a detailed visual prompt..." className="h-32 resize-none bg-gray-50 border-gray-200 focus-visible:ring-purple-300" /></div><DialogFooter><Button variant="outline" onClick={() => setRegenDialogState(prev => ({ ...prev, isOpen: false }))}>Cancel</Button><Button onClick={handleConfirmRegen} className="bg-purple-600 hover:bg-purple-700 text-white font-bold"><Sparkles className="h-4 w-4 mr-2" /> Regenerate Slot</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}