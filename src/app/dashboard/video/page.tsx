"use client";

import {
  Film,
  Sparkles,
  Loader2,
  PlaySquare,
  CheckCircle,
  ArrowLeft,
  Video,
  X,
  Briefcase // ✨ Added Briefcase for empty state
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUTO_VIDEO_MODEL,
  VIDEO_MODEL_REGISTRY,
  reconcileAspectRatioFor,
  reconcileDurationFor,
} from "@/lib/video-model-registry";

import { VideoEditorUI } from "@/components/layout/VideoEditorUI";

import { UgcSetup } from "@/components/video/UgcSetup";
import { CinematicSetup } from "@/components/video/CinematicSetup";
import { ClothingSetup } from "@/components/video/ClothingSetup";
import { ProductRevealSetup } from "@/components/video/ProductRevealSetup";
import { StorytellingSetup } from "@/components/video/StorytellingSetup";
import { VIDEO_MODES } from "@/components/video/video-modes";
import { useVideoStudio } from "@/components/video/useVideoStudio";

export default function VideoStudioPage() {
  const {
    activeBrand,
    activeTab,
    setActiveTab,
    step,
    setStep,
    isGenerating,
    setIsGenerating,
    isSuggesting,
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
    setGeneratingPostId,
    generatedVideoUrl,
    setGeneratedVideoUrl,
    generationError,
    setGenerationError,
    progressText,
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
  } = useVideoStudio();

  // ✨ NEW: "No Brand" fallback state
  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in duration-500">
        <div className="mx-auto h-20 w-20 bg-[#191D23] border border-[#57707A]/40 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
          <Briefcase className="h-10 w-10 text-[#57707A]" />
        </div>
        <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">No Workspace Selected</h2>
        <p className="text-[#989DAA] mt-3 max-w-md mx-auto leading-relaxed mb-8">
          Please select or create a brand from the top navigation bar to access the Video Studio.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-20">
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
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedMode(mode.id);
                        setPrimaryFile(null);
                        setPrimaryPreview(null);
                        setPrompt("");
                        setBRollScenes([]);
                        setAspectRatio(mode.id === "ugc" ? "9:16" : "16:9");
                        setStep(2);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedMode(mode.id);
                          setPrimaryFile(null);
                          setPrimaryPreview(null);
                          setPrompt("");
                          setBRollScenes([]);
                          setAspectRatio(mode.id === "ugc" ? "9:16" : "16:9");
                          setStep(2);
                        }
                      }}
                      className={cn(
                        "relative p-5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#191D23]",
                        isSelected
                          ? "border-[#C5BAC4]/50 bg-[#57707A] shadow-lg shadow-black/20 ring-2 ring-[#C5BAC4]/40 ring-offset-1 ring-offset-[#191D23]"
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
                  setDuration,
                  // The setups derive their aspect/duration options from the
                  // registry, so they need the model that will actually run.
                  aiModel: selectedAiModel,
                  videoMode: selectedMode,
                  aiEnhance,
                  setAiEnhance,
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
                      {/* Registry-driven: registering a model in
                          `video-model-registry.ts` adds it here automatically. */}
                      {[
                        { value: AUTO_VIDEO_MODEL, label: "🌟 Auto" },
                        ...Object.values(VIDEO_MODEL_REGISTRY).map((m) => ({ value: m.id, label: m.label })),
                      ].map((engine) => (
                        <button
                          key={engine.value}
                          onClick={() => {
                            setSelectedAiModel(engine.value);
                            // Repair a selection the new engine cannot render, so
                            // the picker never sits on a value that would be
                            // rejected at the boundary (Pruna has no 21:9, and its
                            // range is 1-20s). This is UI repair, not clamping:
                            // an unsupported value that is actually submitted is
                            // still REJECTED before any deduction.
                            setAspectRatio((current) => reconcileAspectRatioFor(engine.value, current));
                            setDuration((current) => reconcileDurationFor(engine.value, current));
                          }}
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