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
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";

import { VideoEditorUI } from "@/components/layout/VideoEditorUI";

import { UgcSetup } from "@/components/video/UgcSetup";
import { CinematicSetup } from "@/components/video/CinematicSetup";
import { ClothingSetup } from "@/components/video/ClothingSetup";
import { ProductRevealSetup } from "@/components/video/ProductRevealSetup";
import { StorytellingSetup } from "@/components/video/StorytellingSetup";
import type { BRollScene } from "@/components/video/types";

// ─── Video Modes ──────────────────────────────────────────────────────────────
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

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function VideoStudioPage() {
  const router = useRouter();
  const { clientId } = useClient();

  // Tab State
  const [activeTab, setActiveTab] = useState<"studio" | "editor">("studio");

  // Studio State
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({
    name: "",
    industry: "",
    desc: "",
  });
  const [selectedMode, setSelectedMode] = useState("ugc");

  // Standard Mode State
  const [prompt, setPrompt] = useState("");
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [primaryPreview, setPrimaryPreview] = useState<string | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [secondaryPreview, setSecondaryPreview] = useState<string | null>(null);

  // Storytelling B-Roll State
  const [bRollConcept, setBRollConcept] = useState("");
  const [bRollScenes, setBRollScenes] = useState<BRollScene[]>([]);

  // AI Model Selection
  const [selectedAiModel, setSelectedAiModel] = useState("auto");

  // ✨ Tracking the background generation & Errors
  const [generatingPostId, setGeneratingPostId] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

  const activeModeConfig = VIDEO_MODES.find((m) => m.id === selectedMode)!;

  // Load Brand Context
  useEffect(() => {
    if (!clientId) return;
    async function loadBrand() {
      const { data } = await supabase
        .from("clients")
        .select("company_name, industry, onboarding_notes")
        .eq("id", clientId)
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
  }, [clientId]);

  // ✨ Listen for n8n to finish (Hybrid: WebSockets + Polling Fallback)
  useEffect(() => {
    if (!generatingPostId) return;

    // 1. WebSocket Listener (Instant Update)
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
          // Catch Backend Failures
          if (payload.new.status === "failed") {
            setGenerationError("The AI engine failed to process this request. The image format might be unsupported, or a safety filter rejected the prompt.");
          }
          const newUrls = payload.new.image_urls;
          if (newUrls && Array.isArray(newUrls) && newUrls.length > 0) {
            setGeneratedVideoUrl(newUrls[0]);
          }
        }
      )
      .subscribe();

    // 2. Polling Fallback (Checks every 5 seconds)
    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from("content")
        .select("image_urls, status")
        .eq("id", generatingPostId)
        .single();

      if (data?.status === "failed") {
        setGenerationError("The AI engine failed to process this request. The image format might be unsupported, or a safety filter rejected the prompt.");
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

  // Handle Image Upload Previews
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

  // Generate standard prompt via AI
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

  // Generate B-Roll Scenes (Timeline)
  async function handleGenerateScenes() {
    if (!bRollConcept.trim()) return alert("Please enter a concept first.");
    setIsSuggesting(true);

    try {
      setTimeout(() => {
        const mockScenes: BRollScene[] = [
          {
            id: crypto.randomUUID(),
            scene_number: 1,
            image_prompt:
              "Cinematic wide shot of a modern, brightly lit product studio.",
            video_action:
              "Slow drone push-in to establish the setting. Soft morning light.",
            duration: "5s",
          },
          {
            id: crypto.randomUUID(),
            scene_number: 2,
            image_prompt:
              "Macro close-up of the product texture, elegant styling.",
            video_action:
              "Smooth pan left across the surface showing fine details.",
            duration: "5s",
          },
        ];
        setBRollScenes(mockScenes);
        setIsSuggesting(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      setIsSuggesting(false);
    }
  }

  function addEmptyScene() {
    const newScene: BRollScene = {
      id: crypto.randomUUID(),
      scene_number: bRollScenes.length + 1,
      image_prompt: "",
      video_action: "",
      duration: "5s",
    };
    setBRollScenes([...bRollScenes, newScene]);
  }

  function updateScene(id: string, field: keyof BRollScene, value: string) {
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

  // Final Generation Dispatch to n8n Webhook
  async function handleGenerate() {
    if (!clientId) return;
    setIsGenerating(true);
    setGenerationError(null); // Reset error state on new generation
    localStorage.setItem(
      `blink_analyzing_media_${clientId}`,
      Date.now().toString()
    );

    try {
      let primaryUrl = null,
        secondaryUrl = null;

      // Ensure 'assets' bucket exists in your Supabase project!
      if (primaryFile) {
        const ext = primaryFile.name.split(".").pop();
        const path = `videos/${clientId}/primary_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(path, primaryFile);
        if (uploadError)
          throw new Error(`Primary Upload Failed: ${uploadError.message}`);

        primaryUrl = supabase.storage.from("assets").getPublicUrl(path)
          .data.publicUrl;
      }

      if (secondaryFile) {
        const ext = secondaryFile.name.split(".").pop();
        const path = `videos/${clientId}/secondary_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(path, secondaryFile);
        if (uploadError)
          throw new Error(`Secondary Upload Failed: ${uploadError.message}`);

        secondaryUrl = supabase.storage.from("assets").getPublicUrl(path)
          .data.publicUrl;
      }

      const payloadPrompt =
        selectedMode === "storytelling" ? JSON.stringify(bRollScenes) : prompt;

      // 1. Determine the correct model based on the mode
      let targetModel = selectedAiModel;

      // If user left it on Auto, do the smart routing
      if (targetModel === "auto") {
        targetModel = "sora-2-image-to-video";
        if (selectedMode === "showcase" || selectedMode === "logo_reveal") {
          targetModel = "bytedance/seedance-1.5-pro";
        }
      }

      // 2. Insert into database
      const { data: contentRecord, error: dbError } = await supabase
        .from("content")
        .insert({
          client_id: clientId,
          content_type: "reel",
          caption: `🎬 AI Draft: ${activeModeConfig.title}`,
          status: "draft",
          ai_model: targetModel,
        })
        .select()
        .single();

      if (dbError)
        throw new Error(`Database Insert Failed: ${dbError.message}`);

      setGeneratingPostId(contentRecord.id);

      await triggerWorkflow("blink-generate-video-v1", {
        client_id: clientId,
        post_id: contentRecord.id,
        video_mode: selectedMode,
        primary_image_url: primaryUrl,
        secondary_image_url: secondaryUrl,
        user_prompt: payloadPrompt,
        is_sequence: selectedMode === "storytelling",
        brand_name: businessInfo.name,
        brand_info: businessInfo.desc,
      });

      setStep(3);
    } catch (err: any) {
      console.error("Full Generation Error:", err);
      alert(`Generation Failed: ${err.message || JSON.stringify(err)}`);
      setIsGenerating(false);
    } finally {
      localStorage.removeItem(`blink_analyzing_media_${clientId}`);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20">
      {/* ── Hero Banner ── */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold font-heading flex items-center gap-3">
            <Film className="h-8 w-8" /> AI Video Studio
          </h1>
          <p className="mt-2 text-indigo-100 max-w-xl text-sm leading-relaxed">
            Generate stunning commercial clips with AI, then polish them in the
            built-in editor.
          </p>
        </div>
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <PlaySquare className="h-64 w-64" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("studio")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "studio"
              ? "bg-white text-purple-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Sparkles className="h-4 w-4" /> Generate Video
        </button>
        <button
          onClick={() => setActiveTab("editor")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "editor"
              ? "bg-white text-purple-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Video className="h-4 w-4" /> Video Editor
        </button>
      </div>

      {/* ── Tab: Generate Video ── */}
      {activeTab === "studio" && (
        <div className="space-y-6 max-w-5xl">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <h2 className="text-xl font-bold text-blink-dark">
                Step 1: Choose Video Style
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
                      }}
                      className={cn(
                        "relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        isSelected
                          ? "border-purple-500 bg-purple-50 shadow-md"
                          : "border-gray-200 hover:border-purple-300 bg-white"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle className="h-5 w-5 text-purple-600" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center mb-3",
                          isSelected
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        <mode.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-bold text-blink-dark">
                        {mode.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{mode.desc}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                >
                  Next Step <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={() => setStep(1)}
                  className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-xl font-bold text-blink-dark">
                  Step 2: Director's Setup ({activeModeConfig.title})
                </h2>
              </div>

              {/* ── Render the correct Setup component for the selected mode ── */}
              {(() => {
                const sharedProps = {
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

              {/* AI Engine Picker + Generate Button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">AI Engine</label>
                  <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
                    {[
                      { value: "auto", label: "🌟 Auto" },
                      { value: "bytedance/seedance-1.5-pro", label: "Seedance 1.5" },
                      { value: "kling-3.0/video", label: "Kling 3.0" },
                      { value: "sora-2-image-to-video", label: "Sora 2" },
                    ].map((engine) => (
                      <button
                        key={engine.value}
                        onClick={() => setSelectedAiModel(engine.value)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${selectedAiModel === engine.value
                            ? "bg-white text-purple-700 shadow-sm ring-1 ring-purple-200"
                            : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
                          }`}
                      >
                        {engine.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={
                    isGenerating ||
                    (selectedMode === "storytelling" &&
                      bRollScenes.length === 0) ||
                    (selectedMode !== "storytelling" &&
                      !!activeModeConfig.primaryLabel &&
                      !primaryFile)
                  }
                  className="bg-purple-600 hover:bg-purple-700 text-white h-12 px-10 text-base shadow-lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Queuing
                      Studio...
                    </>
                  ) : (
                    <>
                      <Film className="mr-2 h-5 w-5" />{" "}
                      {selectedMode === "storytelling"
                        ? "Generate Sequence"
                        : "Generate AI Video"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm animate-in fade-in">
              {generationError ? (
                // 🚨 ERROR STATE
                <div className="space-y-6 animate-in zoom-in duration-500">
                  <div className="h-20 w-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                    <X className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-blink-dark font-heading">
                      Generation Failed
                    </h2>
                    <p className="text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                      {generationError}
                    </p>
                  </div>
                  <div className="mt-8 flex justify-center">
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        setStep(1);
                        setGenerationError(null);
                        setGeneratingPostId(null);
                        setIsGenerating(false);
                      }}
                    >
                      Go Back & Try Again
                    </Button>
                  </div>
                </div>
              ) : !generatedVideoUrl ? (
                // ⏳ LOADING STATE
                <div className="space-y-6">
                  <div className="h-24 w-24 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Loader2 className="h-10 w-10 animate-spin" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-blink-dark font-heading">
                      Generating Masterpiece... 🎬
                    </h2>
                    <p className="text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                      The AI Director is rendering your prompt. This process
                      takes exactly <b>2 to 5 minutes</b>. Please keep this tab
                      open.
                    </p>
                  </div>
                </div>
              ) : (
                // ✅ SUCCESS STATE
                <div className="space-y-6 animate-in zoom-in duration-500">
                  <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-blink-dark font-heading">
                      Your Video is Ready! 🎉
                    </h2>
                  </div>

                  <div className="mt-6 aspect-video max-w-lg mx-auto bg-black rounded-lg overflow-hidden shadow-xl ring-4 ring-purple-500/20">
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="mt-8 flex justify-center gap-4">
                    <Button
                      variant="outline"
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
                    </Button>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                      onClick={() => setActiveTab("editor")}
                    >
                      <Video className="w-4 h-4 mr-2" /> Open in Timeline Editor
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Video Editor ── */}
      {activeTab === "editor" && (
        <div className="animate-in fade-in w-full">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-blink-dark">Video Editor</h2>
            <p className="text-sm text-gray-500 mt-1">
              Timeline-based editor for your AI generated assets.
            </p>
          </div>

          <VideoEditorUI />
        </div>
      )}
    </div>
  );
}