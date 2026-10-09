"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";
import { toast } from "sonner";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import type { BRollScene } from "@/components/video/types";
import { VIDEO_MODES } from "@/components/video/video-modes";

/**
 * Video Studio state and actions (upload, AI suggest, storyboard, scenes, generate, live progress).
 * Moved out of the classic /dashboard/video page unchanged, so the classic page and the new
 * /studio/video page run the same engine and only the layout differs.
 */
export function useVideoStudio() {
  const router = useRouter();
  const { clientId: hookClientId } = useClient();
  const { activeBrand } = useBrandStore(); // ✨ Hooked into activeBrand to force re-renders

  const [activeTab, setActiveTab] = useState<"studio" | "editor">("studio");
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({
    name: "",
    industry: "",
    desc: "",
  });
  const [selectedMode, setSelectedMode] = useState("ugc");

  const [prompt, setPrompt] = useState("");
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [primaryPreview, setPrimaryPreview] = useState<string | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [secondaryPreview, setSecondaryPreview] = useState<string | null>(null);

  const [bRollConcept, setBRollConcept] = useState("");
  const [bRollScenes, setBRollScenes] = useState<BRollScene[]>([]);
  const [selectedAiModel, setSelectedAiModel] = useState("auto");

  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState("5");
  const [aiEnhance, setAiEnhance] = useState(true);

  const [generatingPostId, setGeneratingPostId] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // ✨ STEP 3: Add Live Progress State
  const [progressText, setProgressText] = useState("Initializing AI Engine...");

  const primaryInputRef = useRef<HTMLInputElement | null>(null);
  const secondaryInputRef = useRef<HTMLInputElement | null>(null);

  const activeModeConfig = VIDEO_MODES.find((m) => m.id === selectedMode)!;

  useEffect(() => {
    if (!hookClientId) return;
    async function loadBrand() {
      const { data } = await supabase
        .from("clients")
        .select("company_name, industry, onboarding_notes")
        .eq("id", hookClientId)
        .single();
      if (data) {
        let desc = "";
        try {
          desc = JSON.parse(data.onboarding_notes || "{}").description || "";
        } catch (e) {
          desc = data.onboarding_notes || "";
        }
        setBusinessInfo({
          name: data.company_name || "",
          industry: data.industry || "",
          desc,
        });
      }
    }
    loadBrand();
  }, [hookClientId]);

  useEffect(() => {
    if (!generatingPostId) return;

    const channel = supabase
      .channel("video-generation-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "content",
          filter: `id=eq.${generatingPostId}`,
        },
        (payload) => {
          // ✨ STEP 3: Catch Live Progress Updates
          if (payload.new.generation_status_text) {
            setProgressText(payload.new.generation_status_text);
          }

          if (payload.new.status === "failed") {
            setGenerationError(payload.new.error_message || "The AI engine failed to process this request.");
          }
          const newUrls = payload.new.image_urls;
          if (newUrls && Array.isArray(newUrls) && newUrls.length > 0) {
            setGeneratedVideoUrl(newUrls[0]);
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from("content")
        .select("*")
        .eq("id", generatingPostId)
        .single();

      // Also catch it in the polling fallback just in case WebSockets fail
      if (data?.generation_status_text) {
        setProgressText(data.generation_status_text);
      }

      if (data?.status === "failed") {
        setGenerationError(data.error_message || "The AI engine failed to process this request.");
        clearInterval(pollInterval);
      } else if (
        !error &&
        data?.image_urls &&
        Array.isArray(data.image_urls) &&
        data.image_urls.length > 0
      ) {
        setGeneratedVideoUrl(data.image_urls[0]);
        clearInterval(pollInterval);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [generatingPostId]);

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "primary" | "secondary"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Show instant local preview while Cloudinary upload runs in background
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (type === "primary") {
        setPrimaryFile(file); // kept as fallback if Cloudinary fails
        setPrimaryPreview(evt.target?.result as string);
      } else {
        setSecondaryFile(file);
        setSecondaryPreview(evt.target?.result as string);
      }
    };
    reader.readAsDataURL(file);

    // 2. Upload directly to Cloudinary analyze_image folder (publicly accessible by GPT-4o)
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "blinkspot_casts");
      formData.append("folder", "blinkspot/analyze_image");

      const res = await fetch("https://api.cloudinary.com/v1_1/dap8jijxa/image/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Cloudinary upload failed");

      // 3. Replace temp data URL with permanent Cloudinary URL; clear File object
      if (type === "primary") {
        setPrimaryFile(null);
        setPrimaryPreview(data.secure_url);
      } else {
        setSecondaryFile(null);
        setSecondaryPreview(data.secure_url);
      }
    } catch (err) {
      // Cloudinary upload failed — primaryFile still set so handleGenerate falls back to Supabase Storage
      console.error("Reference image Cloudinary upload failed, falling back to Supabase Storage:", err);
    }
  }

  async function handleAISuggest() {
    setIsSuggesting(true);
    try {
      const res = await fetch("/api/video/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          companyName: activeBrand?.brand_name || businessInfo.name, // Use active brand name if available
          industry: businessInfo.industry,
          description: businessInfo.desc,
          userConcept: prompt,
        }),
      });
      const data = await res.json();
      if (data.suggestion) setPrompt(data.suggestion);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleGenerateScenes() {
    if (!bRollConcept.trim()) { toast.warning("Please enter a concept first."); return; }
    setIsSuggesting(true);
    try {
      const res = await fetch("/api/video/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: bRollConcept,
          brandName: activeBrand?.brand_name || businessInfo.name, // Use active brand name if available
          industry: businessInfo.industry,
        }),
      });

      const data = await res.json();

      if (data.scenes && Array.isArray(data.scenes)) {
        const formattedScenes: BRollScene[] = data.scenes.map(
          (s: any, idx: number) => ({
            id: crypto.randomUUID(),
            scene_number: idx + 1,
            mode: s.mode || "showcase",
            aiModel: "auto",
            primaryFile: null,
            primaryPreview: null,
            secondaryFile: null,
            secondaryPreview: null,
            prompt: s.prompt,
            duration: s.duration || "5",
          })
        );
        setBRollScenes(formattedScenes);
      } else {
        throw new Error("Invalid format received from AI");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to auto-generate sequence.");
    } finally {
      setIsSuggesting(false);
    }
  }

  function addEmptyScene() {
    const newScene: BRollScene = {
      id: crypto.randomUUID(),
      scene_number: bRollScenes.length + 1,
      mode: "showcase",
      aiModel: "auto",
      primaryFile: null,
      primaryPreview: null,
      secondaryFile: null,
      secondaryPreview: null,
      prompt: "",
      duration: "5",
    };
    setBRollScenes([...bRollScenes, newScene]);
  }

  function updateScene(id: string, field: string, value: any) {
    setBRollScenes((scenes) =>
      scenes.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  function removeScene(id: string) {
    setBRollScenes((scenes) => {
      const filtered = scenes.filter((s) => s.id !== id);
      return filtered.map((s, idx) => ({ ...s, scene_number: idx + 1 }));
    });
  }

  async function handleGenerate() {
    const safeClientId = hookClientId;
    if (!safeClientId) {
      toast.error("User session not found. Please refresh the page and try again.");
      return;
    }
    if (!activeBrand) {
      toast.warning("Please select a brand workspace first.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setProgressText("Uploading assets and queuing task...");

    const strictBrandAlignment = true; // Active brand is explicitly set

    const { addTask, removeTask } = useWorkflowStore.getState();
    const taskId = `vid-gen-${Date.now()}`;

    const base64ToBlob = (base64: string, mimeType: string) => {
      const byteCharacters = atob(base64.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: mimeType });
    };

    try {
      addTask(taskId, "Generating Video");

      if (selectedMode === "storytelling") {
        let lastRecordId = null;

        for (let i = 0; i < bRollScenes.length; i++) {
          const scene = bRollScenes[i];
          let pUrl = null;
          let sUrl = null;

          const activePrimaryFile = scene.primaryFile || (i === 0 ? primaryFile : null);
          const activePrimaryPreview = scene.primaryPreview || (i === 0 ? primaryPreview : null);

          if (activePrimaryFile) {
            const ext = activePrimaryFile.name.split(".").pop() || "png";
            const path = `videos/${safeClientId}/scene_${i}_primary_${Date.now()}.${ext}`;
            await supabase.storage.from("assets").upload(path, activePrimaryFile);
            pUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
          } else if (activePrimaryPreview && activePrimaryPreview.startsWith("http")) {
            pUrl = activePrimaryPreview;
          }

          if (scene.secondaryFile) {
            const ext = scene.secondaryFile.name.split(".").pop() || "png";
            const path = `videos/${safeClientId}/scene_${i}_secondary_${Date.now()}.${ext}`;
            await supabase.storage.from("assets").upload(path, scene.secondaryFile);
            sUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
          } else if (scene.secondaryPreview && scene.secondaryPreview.startsWith("http")) {
            sUrl = scene.secondaryPreview;
          }

          const targetModel = scene.aiModel && scene.aiModel !== "auto" ? scene.aiModel : selectedAiModel;

          // ✨ FIXED: Added brand_id to database insert
          const { data: clipRecord, error: dbError } = await supabase
            .from("content")
            .insert({
              client_id: safeClientId,
              brand_id: activeBrand.id,
              content_type: "sequence_clip",
              caption: `🎬 AI Scene ${i + 1}: ${scene.mode}`,
              status: "draft",
              ai_model: targetModel,
              generation_status_text: "Initializing Scene..."
            })
            .select()
            .single();

          if (dbError) throw new Error(`Database Insert Failed: ${dbError.message}`);
          lastRecordId = clipRecord.id;

          // ✨ FIXED: Passing brand_id to workflow
          await triggerWorkflow("blink-generate-video-v1", {
            client_id: safeClientId,
            brand_id: activeBrand.id,
            post_id: clipRecord.id,
            video_mode: scene.mode,
            primary_image_url: pUrl,
            secondary_image_url: sUrl,
            user_prompt: scene.prompt,
            is_sequence: false,
            ai_model_override: targetModel,
            duration: scene.duration || duration,
            strict_brand_alignment: strictBrandAlignment,
            aspect_ratio: aspectRatio,
          });
        }
        setGeneratingPostId(lastRecordId);
        setStep(3);
        return;
      }

      let primaryUrl = null;
      let secondaryUrl = null;
      const targetModel = selectedAiModel;

      if (primaryFile) {
        const ext = primaryFile.name.split(".").pop();
        const path = `videos/${safeClientId}/primary_${Date.now()}.${ext}`;
        await supabase.storage.from("assets").upload(path, primaryFile);
        primaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      } else if (primaryPreview && primaryPreview.startsWith("http")) {
        primaryUrl = primaryPreview;
      }

      if (secondaryFile) {
        const ext = secondaryFile.name.split(".").pop();
        const path = `videos/${safeClientId}/secondary_${Date.now()}.${ext}`;
        await supabase.storage.from("assets").upload(path, secondaryFile);
        secondaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      } else if (secondaryPreview && secondaryPreview.startsWith("http")) {
        secondaryUrl = secondaryPreview;
      }

      if ((selectedMode === "ugc" || selectedMode === "clothing") && secondaryUrl && primaryUrl) {
        const mergePrompt = selectedMode === "ugc"
          ? `A highly realistic, viral TikTok style smartphone photo of an influencer interacting with the product. ${prompt}`
          : `A highly realistic fashion editorial photo of a model wearing the clothing. ${prompt}`;

        try {
          const mergeController = new AbortController();
          const mergeTimer = setTimeout(() => mergeController.abort(), 60_000);

          setProgressText("Pre-processing elements using Vision AI...");

          const mergeRes = await fetch("/api/video/nano-banana", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: 'generator',
              prompt: mergePrompt,
              refImage: primaryUrl,
              styleRefImage: secondaryUrl
            }),
            signal: mergeController.signal,
          });

          clearTimeout(mergeTimer);

          const mergeData = await mergeRes.json();

          if (mergeData.url) {
            const mergedUrl = mergeData.url;
            setPrimaryPreview(mergedUrl);
            setSecondaryPreview(null);
            setSecondaryFile(null);

            if (mergedUrl.startsWith('data:')) {
              const mimeMatch = mergedUrl.match(/data:(.*?);/);
              const mime = mimeMatch ? mimeMatch[1] : 'image/png';
              const blob = base64ToBlob(mergedUrl, mime);
              const path = `videos/${safeClientId}/merged_primary_${Date.now()}.png`;
              await supabase.storage.from("assets").upload(path, blob);
              primaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
            } else {
              primaryUrl = mergedUrl;
            }
            secondaryUrl = null;
          }
        } catch (e) {
          console.error("Auto-merge failed, falling back.", e);
        }
      }

      // ✨ FIXED: Added brand_id to database insert
      const { data: contentRecord, error: dbError } = await supabase
        .from("content")
        .insert({
          client_id: safeClientId,
          brand_id: activeBrand.id,
          content_type: "reel",
          caption: `🎬 AI Draft: ${activeModeConfig.title}`,
          status: "draft",
          ai_model: targetModel,
          generation_status_text: "Initializing AI Engine..."
        })
        .select()
        .single();

      if (dbError) throw new Error(`Database Insert Failed: ${dbError.message}`);
      setGeneratingPostId(contentRecord.id);

      // ✨ FIXED: Passing brand_id to workflow
      await triggerWorkflow("blink-generate-video-v1", {
        client_id: safeClientId,
        brand_id: activeBrand.id,
        post_id: contentRecord.id,
        video_mode: selectedMode,
        primary_image_url: primaryUrl,
        secondary_image_url: secondaryUrl,
        user_prompt: prompt,
        is_sequence: false,
        ai_model_override: targetModel,
        strict_brand_alignment: strictBrandAlignment,
        aspect_ratio: aspectRatio,
        duration: duration,
        ai_enhance: aiEnhance,
      });

      setStep(3);
    } catch (err: any) {
      console.error("Full Generation Error:", err);
      setGenerationError(err.message || JSON.stringify(err));
      setStep(3);
    } finally {
      removeTask(taskId);
      if (selectedMode !== "storytelling") setIsGenerating(false);
    }
  }

  return {
    router,
    hookClientId,
    activeBrand,
    activeTab,
    setActiveTab,
    step,
    setStep,
    isGenerating,
    setIsGenerating,
    isSuggesting,
    setIsSuggesting,
    businessInfo,
    setBusinessInfo,
    selectedMode,
    setSelectedMode,
    prompt,
    setPrompt,
    primaryFile,
    setPrimaryFile,
    primaryPreview,
    setPrimaryPreview,
    secondaryFile,
    setSecondaryFile,
    secondaryPreview,
    setSecondaryPreview,
    bRollConcept,
    setBRollConcept,
    bRollScenes,
    setBRollScenes,
    selectedAiModel,
    setSelectedAiModel,
    aspectRatio,
    setAspectRatio,
    duration,
    setDuration,
    aiEnhance,
    setAiEnhance,
    generatingPostId,
    setGeneratingPostId,
    generatedVideoUrl,
    setGeneratedVideoUrl,
    generationError,
    setGenerationError,
    progressText,
    setProgressText,
    primaryInputRef,
    secondaryInputRef,
    activeModeConfig,
    handleFileSelect,
    handleAISuggest,
    handleGenerateScenes,
    addEmptyScene,
    updateScene,
    removeScene,
    handleGenerate,
  };
}

export type VideoStudio = ReturnType<typeof useVideoStudio>;
