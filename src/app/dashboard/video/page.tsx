"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Film,
  Sparkles,
  ArrowRight,
  Loader2,
  PlaySquare,
  UserCircle,
  ShoppingBag,
  Shirt,
  Clapperboard,
  CheckCircle,
  Zap,
  ArrowLeft,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";

import { VideoEditorUI } from "@/components/layout/VideoEditorUI";

import { UgcSetup } from "@/components/video/UgcSetup";
import { CinematicSetup } from "@/components/video/CinematicSetup";
import { ClothingSetup } from "@/components/video/ClothingSetup";
import { ProductRevealSetup } from "@/components/video/ProductRevealSetup";
import { StorytellingSetup } from "@/components/video/StorytellingSetup";
import type { BRollScene } from "@/components/video/types";

const VIDEO_MODES = [
  {
    id: "ugc",
    title: "UGC Product Review",
    icon: UserCircle,
    desc: "AI influencer talks about your product.",
    primaryLabel: "Product Image",
    secondaryLabel: "Influencer Face (Optional)",
  },
  {
    id: "showcase",
    title: "Cinematic Showcase",
    icon: ShoppingBag,
    desc: "Dynamic camera pans around your product.",
    primaryLabel: "Product Image",
    secondaryLabel: null,
  },
  {
    id: "clothing",
    title: "AI Clothing Try-On",
    icon: Shirt,
    desc: "Put your garments on an AI model.",
    primaryLabel: "Garment Image",
    secondaryLabel: "Model Image",
  },
  {
    id: "logo_reveal",
    title: "Product Reveal",
    icon: Zap,
    desc: "Dynamic 3D motion graphics for your product.",
    primaryLabel: "Product Image (PNG)",
    secondaryLabel: null,
  },
  {
    id: "storytelling",
    title: "Storytelling B-Roll",
    icon: Clapperboard,
    desc: "Multi-scene cinematic sequence for your brand.",
    primaryLabel: null,
    secondaryLabel: null,
  },
];

export default function VideoStudioPage() {
  const router = useRouter();
  const { clientId: hookClientId } = useClient();

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

  function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "primary" | "secondary"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (type === "primary") {
        setPrimaryFile(file);
        setPrimaryPreview(e.target?.result as string);
      } else {
        setSecondaryFile(file);
        setSecondaryPreview(e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAISuggest() {
    setIsSuggesting(true);
    try {
      const res = await fetch("/api/video/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          companyName: businessInfo.name,
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
    if (!bRollConcept.trim()) return alert("Please enter a concept first.");
    setIsSuggesting(true);
    try {
      const res = await fetch("/api/video/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: bRollConcept,
          brandName: businessInfo.name,
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
      alert("Failed to auto-generate sequence.");
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
      alert("User session not found. Please refresh the page and try again.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setProgressText("Uploading assets and queuing task...");

    const { activeBrand } = useBrandStore.getState();
    const strictBrandAlignment = activeBrand !== null;
    const brandName = activeBrand?.brand_name || businessInfo.name;

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

          let targetModel = scene.aiModel && scene.aiModel !== "auto" ? scene.aiModel : selectedAiModel;

          const { data: clipRecord, error: dbError } = await supabase
            .from("content")
            .insert({
              client_id: safeClientId,
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

          await triggerWorkflow("blink-generate-video-v1", {
            client_id: safeClientId,
            post_id: clipRecord.id,
            video_mode: scene.mode,
            primary_image_url: pUrl,
            secondary_image_url: sUrl,
            user_prompt: scene.prompt,
            is_sequence: false,
            brand_name: brandName,
            brand_info: businessInfo.desc,
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
      let targetModel = selectedAiModel;

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

      const { data: contentRecord, error: dbError } = await supabase
        .from("content")
        .insert({
          client_id: safeClientId,
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

      await triggerWorkflow("blink-generate-video-v1", {
        client_id: safeClientId,
        post_id: contentRecord.id,
        video_mode: selectedMode,
        primary_image_url: primaryUrl,
        secondary_image_url: secondaryUrl,
        user_prompt: prompt,
        is_sequence: false,
        brand_name: brandName,
        brand_info: businessInfo.desc,
        ai_model_override: targetModel,
        strict_brand_alignment: strictBrandAlignment,
        aspect_ratio: aspectRatio,
        duration: duration,
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

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20">
      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#2A2F38] rounded-2xl p-8 border border-[#57707A]/40 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#C5BAC4]/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 flex items-center justify-center">
              <Film className="h-5 w-5 text-[#C5BAC4]" />
            </div>
            <h1 className="text-2xl font-bold text-[#DEDCDC] font-display">AI Video Studio</h1>
          </div>
          <p className="text-sm text-[#DEDCDC]/50 max-w-xl leading-relaxed">
            Generate stunning commercial clips with AI, then polish them in the built-in editor.
          </p>
        </div>
        <div className="absolute bottom-0 right-8 opacity-5 pointer-events-none">
          <PlaySquare className="h-48 w-48 text-[#C5BAC4]" />
        </div>
      </div>

      {/* ── TAB SWITCHER ── */}
      <div className="flex gap-1 p-1 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("studio")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "studio"
              ? "bg-[#57707A] text-[#DEDCDC] shadow-sm"
              : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70"
          )}
        >
          <Sparkles className="h-4 w-4" /> Generate Video
        </button>
        <button
          onClick={() => setActiveTab("editor")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "editor"
              ? "bg-[#57707A] text-[#DEDCDC] shadow-sm"
              : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70"
          )}
        >
          <Video className="h-4 w-4" /> Video Editor
        </button>
      </div>

      {activeTab === "studio" && (
        <div className="space-y-6 w-full">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="text-base font-bold text-[#DEDCDC]/60 uppercase tracking-widest">
                Step 1 — Choose Video Style
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {VIDEO_MODES.map((mode) => {
                  const isSelected = selectedMode === mode.id;
                  return (
                    <div
                      key={mode.id}
                      onClick={() => {
                        setSelectedMode(mode.id);
                        setPrimaryFile(null);
                        setPrompt("");
                        setBRollScenes([]);
                        setAspectRatio(mode.id === "ugc" ? "9:16" : "16:9");
                      }}
                      className={cn(
                        "relative p-5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
                        isSelected
                          ? "border-[#C5BAC4]/50 bg-[#57707A] shadow-lg shadow-black/20"
                          : "border-[#57707A]/30 bg-[#2A2F38] hover:bg-[#57707A]/50 hover:border-[#57707A]/60"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle className="h-5 w-5 text-[#C5BAC4]" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center mb-3",
                          isSelected
                            ? "bg-[#C5BAC4]/15 border border-[#C5BAC4]/20"
                            : "bg-[#191D23]/60 border border-white/5"
                        )}
                      >
                        <mode.icon className={cn("h-5 w-5", isSelected ? "text-[#C5BAC4]" : "text-[#DEDCDC]/40")} />
                      </div>
                      <h3 className="text-sm font-bold text-[#DEDCDC]">
                        {mode.title}
                      </h3>
                      <p className="text-xs text-[#DEDCDC]/40 mt-1">{mode.desc}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl bg-[#C5BAC4] text-[#191D23] text-sm font-bold hover:bg-white transition-colors shadow-lg"
                >
                  Next Step <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={() => setStep(1)}
                  className="p-2 bg-[#2A2F38] border border-[#57707A]/40 rounded-full hover:bg-[#57707A]/50 text-[#DEDCDC]/60 hover:text-[#DEDCDC] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-[#DEDCDC]/60 uppercase tracking-widest">
                  Step 2 — Director's Setup ({activeModeConfig.title})
                </h2>
              </div>

              {(() => {
                const sharedProps: any = {
                  primaryFile,
                  setPrimaryFile,
                  primaryPreview,
                  setPrimaryPreview,
                  primaryInputRef,
                  handleFileSelect,
                  secondaryFile,
                  setSecondaryFile,
                  secondaryPreview,
                  setSecondaryPreview,
                  secondaryInputRef,
                  prompt,
                  setPrompt,
                  isSuggesting,
                  handleAISuggest,
                  activeModeConfig,
                  aspectRatio,
                  setAspectRatio,
                  duration,
                  setDuration
                };
                switch (selectedMode) {
                  case "ugc":
                    return <UgcSetup {...sharedProps} />;
                  case "showcase":
                    return <CinematicSetup {...sharedProps} />;
                  case "clothing":
                    return <ClothingSetup {...sharedProps} />;
                  case "logo_reveal":
                    return <ProductRevealSetup {...sharedProps} />;
                  case "storytelling":
                    return (
                      <StorytellingSetup
                        {...sharedProps}
                        bRollConcept={bRollConcept}
                        setBRollConcept={setBRollConcept}
                        bRollScenes={bRollScenes}
                        setBRollScenes={setBRollScenes}
                        handleGenerateScenes={handleGenerateScenes}
                        addEmptyScene={addEmptyScene}
                        updateScene={updateScene}
                        removeScene={removeScene}
                      />
                    );
                  default:
                    return null;
                }
              })()}

              <div className="space-y-4 pt-4 border-t border-[#57707A]/30">
                {selectedMode !== "storytelling" && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-[#DEDCDC]/40 uppercase tracking-wider whitespace-nowrap">
                      Master AI Engine
                    </label>
                    <div className="flex flex-wrap rounded-lg border border-[#57707A]/40 bg-[#191D23]/60 p-0.5 gap-0.5">
                      {[
                        { value: "auto", label: "🌟 Auto" },
                        { value: "replicate:prunaai/p-video", label: "⚡ Pruna AI (Fast)" },
                        { value: "replicate:openai/sora-2", label: "Sora 2 (Replicate)" },
                        { value: "kling-3.0/video", label: "Kling 3.0" },
                        { value: "bytedance/seedance-2", label: "Seedance 2 (Cinematic)" },
                        { value: "bytedance/seedance-2-fast", label: "Seedance 2 (Fast)" },
                      ].map((engine) => (
                        <button
                          key={engine.value}
                          onClick={() => setSelectedAiModel(engine.value)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${selectedAiModel === engine.value
                            ? "bg-[#57707A] text-[#DEDCDC] shadow-sm ring-1 ring-[#C5BAC4]/30"
                            : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#57707A]/30"
                            }`}
                        >
                          {engine.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      (selectedMode === "storytelling" && bRollScenes.length === 0) ||
                      (selectedMode !== "storytelling" && !!activeModeConfig.primaryLabel && !primaryFile && !primaryPreview)
                    }
                    className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 px-8 text-base shadow-lg w-full sm:w-auto shrink-0"
                  >
                    {isGenerating ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Queuing...</>
                    ) : (
                      <><Film className="mr-2 h-5 w-5" />{" "}
                        {selectedMode === "storytelling" ? "Generate Sequence" : "Generate AI Video"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-10 text-center shadow-lg animate-in fade-in">
              {generationError ? (
                <div className="space-y-6 animate-in zoom-in duration-500">
                  <div className="h-20 w-20 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                    <X className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">Generation Failed</h2>
                    <p className="text-red-400/80 mt-2 max-w-md mx-auto leading-relaxed font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-sm">
                      {generationError}
                    </p>
                  </div>
                  <div className="mt-8 flex justify-center">
                    <button
                      className="px-6 py-2.5 rounded-lg border border-[#57707A]/40 text-[#DEDCDC]/60 hover:text-[#DEDCDC] hover:border-[#57707A] text-sm font-medium transition-colors"
                      onClick={() => {
                        setStep(1);
                        setGenerationError(null);
                        setGeneratingPostId(null);
                        setIsGenerating(false);
                      }}
                    >
                      Go Back &amp; Try Again
                    </button>
                  </div>
                </div>
              ) : !generatedVideoUrl ? (
                <div className="space-y-6">
                  <div className="h-24 w-24 bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 text-[#C5BAC4] rounded-full flex items-center justify-center mx-auto">
                    <Loader2 className="h-10 w-10 animate-spin" />
                  </div>
                  <div>
                    {/* ✨ STEP 3: Display the Live Progress Text */}
                    <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">
                      {progressText}
                    </h2>
                    <p className="text-[#DEDCDC]/40 mt-3 max-w-md mx-auto leading-relaxed text-sm">
                      Please do not close this window. Our cinematic AI engine is currently animating your scene pixel by pixel.
                    </p>
                    <div className="mt-4 p-4 bg-[#191D23]/60 rounded-lg border border-[#57707A]/30 text-sm text-[#DEDCDC]/50">
                      ⏱️ High-fidelity video generation typically takes <b className="text-[#DEDCDC]/70">5 to 15 minutes</b> depending on server load.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in zoom-in duration-500">
                  <div className="h-20 w-20 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">Your Sequence is Ready! 🎉</h2>
                  </div>
                  <div className="mt-6 aspect-video max-w-lg mx-auto bg-black rounded-lg overflow-hidden shadow-xl ring-2 ring-[#C5BAC4]/20">
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="mt-8 flex justify-center gap-4">
                    <button
                      className="px-6 py-2.5 rounded-lg border border-[#57707A]/40 text-[#DEDCDC]/60 hover:text-[#DEDCDC] hover:border-[#57707A] text-sm font-medium transition-colors"
                      onClick={() => {
                        setStep(1);
                        setPrimaryFile(null);
                        setSecondaryFile(null);
                        setPrompt("");
                        setBRollScenes([]);
                        setGeneratedVideoUrl(null);
                        setGeneratingPostId(null);
                        setIsGenerating(false);
                      }}
                    >
                      Create Another
                    </button>
                    <button
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#C5BAC4] text-[#191D23] text-sm font-bold hover:bg-white transition-colors shadow-lg"
                      onClick={() => setActiveTab("editor")}
                    >
                      <Video className="w-4 h-4" /> Open in Timeline Editor
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "editor" && (
        <div className="animate-in fade-in w-full">
          <div className="mb-6 p-6 rounded-xl bg-[#2A2F38] border border-[#57707A]/30">
            <h2 className="text-base font-bold text-[#DEDCDC]/60 uppercase tracking-widest">Video Editor</h2>
            <p className="text-sm text-[#DEDCDC]/30 mt-1">
              Timeline-based editor for your AI generated assets.
            </p>
          </div>
          <VideoEditorUI />
        </div>
      )}
    </div>
  );
}