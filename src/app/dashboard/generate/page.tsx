"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Brain,
  PenTool,
  Palette,
  CheckCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Send,
  Upload,
  X,
  ImageIcon,
  Wand2,
  Sparkles,
  Layers,
  Eye,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ContentCard } from "@/components/content/ContentCard";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow, triggerWorkflowWithFile } from "@/lib/workflows";
import type { Content, Platform } from "@/types/database";

// ✨ ADDED: Complete list of all supported platforms
const ALL_PLATFORMS: { label: string; value: Platform; icon: string }[] = [
  { label: "Instagram", value: "instagram", icon: "📸" },
  { label: "TikTok", value: "tiktok", icon: "🎵" },
  { label: "Facebook", value: "facebook", icon: "📘" },
  { label: "Twitter / X", value: "twitter", icon: "🐦" },
  { label: "LinkedIn", value: "linkedin", icon: "💼" },
  { label: "YouTube", value: "youtube", icon: "▶️" },
  { label: "Pinterest", value: "pinterest", icon: "📌" },
  { label: "Threads", value: "threads", icon: "🔗" },
];

type StepStatus = "idle" | "running" | "done" | "error";

interface PipelineStep {
  id: string;
  icon: React.ElementType;
  label: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

const parseArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
};

export default function GeneratePage() {
  const { clientId, loading: clientLoading } = useClient();
  const [wizardStep, setWizardStep] = useState(1);

  // Step 1 form state
  const [postCount, setPostCount] = useState(7);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  // ✨ NEW: State to track which platforms are visible in the main grid
  const [visiblePlatformValues, setVisiblePlatformValues] = useState<
    Platform[]
  >(["instagram", "tiktok", "facebook", "twitter"]);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [topics, setTopics] = useState("");
  const [imageMode, setImageMode] = useState<"auto" | "individual">("auto");

  // Step 2 — Visual Context
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [enhanceMode, setEnhanceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 pipeline state
  const [pipeline, setPipeline] = useState<PipelineStep[]>([
    {
      id: "strategy",
      icon: Brain,
      label: "Planning content strategy...",
      status: "idle",
    },
    {
      id: "captions",
      icon: PenTool,
      label: "Writing captions...",
      status: "idle",
    },
    {
      id: "images",
      icon: Palette,
      label: "Generating images...",
      status: "idle",
    },
    { id: "done", icon: CheckCircle, label: "Done!", status: "idle" },
  ]);

  // Step 4 state
  const [generatedContent, setGeneratedContent] = useState<Content[]>([]);
  const [sendingAll, setSendingAll] = useState(false);
  const [regeneratingCaption, setRegeneratingCaption] = useState<string | null>(
    null
  );
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(
    null
  );

  // Image generation modal
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalTarget, setImageModalTarget] = useState<Content | null>(
    null
  );
  const [modalEnhanceMode, setModalEnhanceMode] = useState(false);
  const [modalRefFile, setModalRefFile] = useState<File | null>(null);
  const [modalRefPreview, setModalRefPreview] = useState<string | null>(null);
  const [modalGenerating, setModalGenerating] = useState(false);
  const modalRefInputRef = useRef<HTMLInputElement>(null);

  const [clientDescription, setClientDescription] = useState<string | null>(
    null
  );
  const [brandVoice, setBrandVoice] = useState<string | null>(null);
  const [clientIndustry, setClientIndustry] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    async function loadClientContext() {
      const [clientRes, brandRes, socialRes] = await Promise.all([
        supabase
          .from("clients")
          .select(
            "company_name, industry, website_url, onboarding_notes, social_links"
          )
          .eq("id", clientId)
          .single(),
        supabase
          .from("brand_profiles")
          .select("brand_voice, tone_keywords, image_style, dos, donts")
          .eq("client_id", clientId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("social_accounts")
          .select("platform")
          .eq("client_id", clientId)
          .eq("is_active", true),
      ]);

      if (clientRes.data) {
        const c = clientRes.data as Record<string, unknown>;
        setClientIndustry((c.industry as string) || null);
        if (c.onboarding_notes) {
          try {
            const notesStr = c.onboarding_notes as string;
            const parsedNotes = JSON.parse(notesStr);
            setClientDescription(parsedNotes.description || null);
          } catch (e) {
            setClientDescription(c.onboarding_notes as string);
          }
        }
      }
      if (brandRes.data) {
        const b = brandRes.data as Record<string, unknown>;
        setBrandVoice((b.brand_voice as string) || null);
      }
      if (socialRes.data) {
        const activePlatforms = socialRes.data.map(
          (s) => s.platform as Platform
        );

        // Auto-select connected platforms
        setPlatforms(activePlatforms);

        // Ensure connected platforms are visible in the grid
        setVisiblePlatformValues((prev) => {
          const newSet = new Set([...prev, ...activePlatforms]);
          return Array.from(newSet);
        });
      }
    }
    loadClientContext();
  }, [clientId]);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const updateStep = useCallback(
    (id: string, update: Partial<PipelineStep>) => {
      setPipeline((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...update } : s))
      );
    },
    []
  );

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) return;
    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setReferencePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function clearFile() {
    setReferenceFile(null);
    setReferencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleModalFileSelect(file: File) {
    if (!file.type.startsWith("image/")) return;
    setModalRefFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setModalRefPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearModalFile() {
    setModalRefFile(null);
    setModalRefPreview(null);
    if (modalRefInputRef.current) modalRefInputRef.current.value = "";
  }

  async function startGeneration() {
    setWizardStep(3);
    const isIndividual = imageMode === "individual";

    const pipelineSteps: PipelineStep[] = [
      {
        id: "strategy",
        icon: Brain,
        label: "Planning content strategy...",
        status: "idle",
      },
      {
        id: "captions",
        icon: PenTool,
        label: "Writing captions...",
        status: "idle",
      },
      ...(isIndividual
        ? []
        : [
            {
              id: "images",
              icon: Palette,
              label: "Generating images...",
              status: "idle" as StepStatus,
            },
          ]),
      {
        id: "done",
        icon: CheckCircle,
        label: "Done!",
        status: "idle" as StepStatus,
      },
    ];
    setPipeline(pipelineSteps);

    try {
      updateStep("strategy", { status: "running" });
      await triggerWorkflow("blink-generate-strategy", {
        client_id: clientId,
        post_count: postCount,
        platforms,
        topics: topics || undefined,
      });
      updateStep("strategy", { status: "done" });

      updateStep("captions", { status: "running" });
      await triggerWorkflow("blink-write-captions", {
        client_id: clientId,
        post_count: postCount,
        platforms,
      });
      updateStep("captions", { status: "done" });

      let contentItems: Content[] = [];
      let fetchAttempts = 0;

      while (fetchAttempts < 15) {
        const { data: newContent } = await supabase
          .from("content")
          .select("*")
          .eq("client_id", clientId!)
          .order("created_at", { ascending: false })
          .limit(postCount);

        if (newContent && newContent.length > 0) {
          contentItems = newContent as unknown as Content[];
          break;
        }

        fetchAttempts++;
        await delay(2000);
      }

      if (contentItems.length === 0) {
        throw new Error(
          "Timed out waiting for captions to save to the database."
        );
      }

      if (!isIndividual) {
        const imageLabel = enhanceMode
          ? "🎨 AI is enhancing your photo..."
          : "✨ AI is painting from your prompt...";
        updateStep("images", {
          status: "running",
          label: imageLabel,
          detail: `Image 0 of ${contentItems.length}...`,
        });

        for (let i = 0; i < contentItems.length; i++) {
          updateStep("images", {
            detail: `Image ${i + 1} of ${contentItems.length}...`,
          });
          const kieModel = enhanceMode
            ? "google/nano-banana-edit"
            : "google/nano-banana";

          try {
            if (referenceFile && enhanceMode) {
              await triggerWorkflowWithFile(
                "blink-generate-images",
                {
                  client_id: clientId!,
                  post_id: contentItems[i].id,
                  topic:
                    contentItems[i].caption_short ||
                    contentItems[i].caption?.substring(0, 60) ||
                    "",
                  content_type: contentItems[i].content_type,
                  mode: "enhance",
                  kie_model: kieModel,
                },
                referenceFile
              );
            } else {
              await triggerWorkflow("blink-generate-images", {
                client_id: clientId,
                post_id: contentItems[i].id,
                topic:
                  contentItems[i].caption_short ||
                  contentItems[i].caption?.substring(0, 60) ||
                  "",
                content_type: contentItems[i].content_type,
                mode: "generate",
                kie_model: kieModel,
              });
            }
          } catch (imgErr) {
            console.error(`Image ${i + 1} generation error:`, imgErr);
          }
          if (i < contentItems.length - 1) await delay(2000);
        }

        updateStep("images", {
          status: "done",
          detail: undefined,
          label: "Images generated",
        });

        let pollAttempts = 0;
        const maxPollAttempts = 15;
        let finalItems: Content[] = [];

        while (pollAttempts < maxPollAttempts) {
          const { data: polledContent } = await supabase
            .from("content")
            .select("*")
            .eq("client_id", clientId!)
            .order("created_at", { ascending: false })
            .limit(postCount);

          finalItems = (polledContent || []) as unknown as Content[];
          const allHaveImages = finalItems.every(
            (c) => parseArray(c.image_urls).length > 0
          );

          if (allHaveImages && finalItems.length > 0) break;

          pollAttempts++;
          if (pollAttempts < maxPollAttempts) await delay(3000);
        }
        setGeneratedContent(finalItems);
      } else {
        setGeneratedContent(contentItems);
      }

      updateStep("done", { status: "done" });
      await delay(1500);
      setWizardStep(4);
    } catch (err: unknown) {
      const currentRunning = pipeline.find((s) => s.status === "running");
      if (currentRunning) {
        updateStep(currentRunning.id, {
          status: "error",
          error: err instanceof Error ? err.message : "An error occurred",
        });
      }
    }
  }

  async function handleRegenerateCaption(item: Content) {
    setRegeneratingCaption(item.id);
    try {
      await triggerWorkflow("blink-write-captions", {
        client_id: clientId,
        post_id: item.id,
        regenerate: true,
      });

      let attempts = 0;
      while (attempts < 10) {
        const { data } = await supabase
          .from("content")
          .select("*")
          .eq("id", item.id)
          .single();

        if (data) {
          const updated = data as unknown as Content;
          if (
            updated.caption !== item.caption ||
            updated.updated_at !== item.updated_at
          ) {
            setGeneratedContent((prev) =>
              prev.map((c) => (c.id === item.id ? updated : c))
            );
            break;
          }
        }
        attempts++;
        await delay(2000);
      }
    } catch (err) {
      console.error("Regenerate caption error:", err);
    } finally {
      setRegeneratingCaption(null);
    }
  }

  function openImageModal(item: Content) {
    setImageModalTarget(item);
    setModalEnhanceMode(false);
    setModalRefFile(null);
    setModalRefPreview(null);
    setImageModalOpen(true);
  }

  async function handleModalGenerateImage() {
    if (!imageModalTarget) return;
    setModalGenerating(true);
    setRegeneratingImage(imageModalTarget.id);

    const kieModel = modalEnhanceMode
      ? "google/nano-banana-edit"
      : "google/nano-banana";

    try {
      if (modalRefFile && modalEnhanceMode) {
        await triggerWorkflowWithFile(
          "blink-generate-images",
          {
            client_id: clientId!,
            post_id: imageModalTarget.id,
            topic:
              imageModalTarget.caption_short ||
              imageModalTarget.caption?.substring(0, 60) ||
              "",
            content_type: imageModalTarget.content_type,
            mode: "enhance",
            kie_model: kieModel,
          },
          modalRefFile
        );
      } else {
        await triggerWorkflow("blink-generate-images", {
          client_id: clientId,
          post_id: imageModalTarget.id,
          topic:
            imageModalTarget.caption_short ||
            imageModalTarget.caption?.substring(0, 60) ||
            "",
          content_type: imageModalTarget.content_type,
          mode: "generate",
          kie_model: kieModel,
        });
      }

      let attempts = 0;
      while (attempts < 20) {
        const { data } = await supabase
          .from("content")
          .select("*")
          .eq("id", imageModalTarget.id)
          .single();
        if (data) {
          const updated = data as unknown as Content;
          const currentImg = parseArray(imageModalTarget.image_urls)[0];
          const newImg = parseArray(updated.image_urls)[0];

          if (newImg && newImg !== currentImg) {
            setGeneratedContent((prev) =>
              prev.map((c) => (c.id === imageModalTarget.id ? updated : c))
            );
            break;
          }
        }
        attempts++;
        await delay(3000);
      }

      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("id", imageModalTarget.id)
        .single();
      if (data) {
        setGeneratedContent((prev) =>
          prev.map((c) =>
            c.id === imageModalTarget.id ? (data as unknown as Content) : c
          )
        );
      }

      setImageModalOpen(false);
    } catch (err) {
      console.error("Image generation error:", err);
    } finally {
      setModalGenerating(false);
      setRegeneratingImage(null);
    }
  }

  async function handleSendAllForApproval() {
    setSendingAll(true);
    try {
      for (const item of generatedContent) {
        await supabase
          .from("content")
          .update({ status: "pending_approval" })
          .eq("id", item.id);
      }
      setGeneratedContent((prev) =>
        prev.map((c) => ({
          ...c,
          status: "pending_approval" as Content["status"],
        }))
      );
    } catch (err) {
      console.error("Send all for approval error:", err);
    } finally {
      setSendingAll(false);
    }
  }

  const totalSteps = 4;
  const stepLabels = ["Plan", "Visual Context", "Generate", "Review"];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center flex-1">
            <div
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold shrink-0 transition-colors",
                wizardStep >= step
                  ? "bg-blink-primary text-white"
                  : "bg-gray-200 text-gray-500"
              )}
            >
              {wizardStep > step ? <CheckCircle className="h-5 w-5" /> : step}
            </div>
            {step < totalSteps && (
              <div
                className={cn(
                  "flex-1 h-1 rounded-full mx-2 transition-colors",
                  wizardStep > step ? "bg-blink-primary" : "bg-gray-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-gray-500 font-medium px-1">
        {stepLabels.map((label, i) => (
          <span
            key={label}
            className={wizardStep >= i + 1 ? "text-blink-primary" : ""}
          >
            {label}
          </span>
        ))}
      </div>

      {/* STEP 1 */}
      {wizardStep === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
          <div className="rounded-lg bg-gradient-to-r from-blink-primary/5 to-blink-secondary/5 border border-blink-primary/10 p-4 text-center">
            <h2 className="text-xl font-semibold text-blink-dark font-heading">
              Plan Your Content ✨
            </h2>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
              Create a batch of AI-powered social media posts in 4 easy steps.
              Pick your settings, and our AI will handle the rest.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                How many posts?
              </label>
              <span className="text-2xl font-bold text-blink-primary">
                {postCount}
              </span>
            </div>
            <Slider
              value={[postCount]}
              onValueChange={(v) => setPostCount(v[0])}
              min={3}
              max={30}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>3</span>
              <span>30</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Target Platforms
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                Select where you want to design content for
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_PLATFORMS.filter((p) =>
                visiblePlatformValues.includes(p.value)
              ).map((p) => {
                const isSelected = platforms.includes(p.value);
                return (
                  <label
                    key={p.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer",
                      isSelected
                        ? "border-blink-primary bg-blink-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => togglePlatform(p.value)}
                    />
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-sm font-medium text-blink-dark leading-none">
                      {p.label}
                    </span>
                  </label>
                );
              })}

              {/* Add Platform Button */}
              {visiblePlatformValues.length < ALL_PLATFORMS.length && (
                <button
                  onClick={() => setIsPlatformModalOpen(true)}
                  className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-200 text-gray-500 hover:border-blink-primary/50 hover:bg-blink-primary/5 hover:text-blink-primary transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4" /> Add Platform
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Any specific topics or themes?{" "}
              <span className="text-gray-400">(optional)</span>
            </label>
            {clientDescription && (
              <div className="rounded-lg bg-blink-primary/5 border border-blink-primary/10 p-3 space-y-1.5">
                <p className="text-xs font-medium text-blink-primary">
                  💡 From your brand profile:
                </p>
                <p className="text-xs text-gray-600 leading-relaxed italic">
                  &quot;{clientDescription}&quot;
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setTopics((prev) =>
                      prev
                        ? `${prev}\n\nBrand Context: ${clientDescription}`
                        : clientDescription
                    )
                  }
                  className="text-xs text-blink-primary font-medium hover:underline"
                >
                  + Use this as a starting point
                </button>
              </div>
            )}
            <Textarea
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              rows={3}
              placeholder="Describe what you want to post about..."
              className="resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                "New product launch",
                "Behind the scenes",
                "Customer testimonials",
                "Seasonal promotion",
                "Tips & tricks",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setTopics((prev) => {
                      const trimmed = prev.trim();
                      if (
                        trimmed.toLowerCase().includes(suggestion.toLowerCase())
                      )
                        return prev;
                      return trimmed ? `${trimmed}, ${suggestion}` : suggestion;
                    });
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 bg-gray-50 text-gray-600 hover:border-blink-primary/40 hover:bg-blink-primary/5 hover:text-blink-primary transition-colors"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    imageMode === "auto"
                      ? "bg-blink-primary/10 text-blink-primary"
                      : "bg-amber-50 text-amber-600"
                  )}
                >
                  {imageMode === "auto" ? (
                    <Layers className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-blink-dark">
                    Image Generation Mode
                  </p>
                  <p className="text-xs text-gray-400">
                    {imageMode === "auto"
                      ? "Generate all images automatically in batch"
                      : "I'll generate images one by one after captions"}
                  </p>
                </div>
              </div>
              <Switch
                checked={imageMode === "individual"}
                onCheckedChange={(checked) =>
                  setImageMode(checked ? "individual" : "auto")
                }
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setImageMode("auto")}
                className={cn(
                  "flex-1 text-left py-2.5 px-3 rounded-lg text-xs font-medium transition-colors",
                  imageMode === "auto"
                    ? "bg-blink-primary/10 text-blink-primary border border-blink-primary/20"
                    : "bg-gray-50 text-gray-500 border border-gray-200"
                )}
              >
                <span className="block">🚀 Auto (batch)</span>
                <span className="font-normal text-[10px] opacity-70 block mt-0.5">
                  AI creates all images in one go — fastest option
                </span>
              </button>
              <button
                onClick={() => setImageMode("individual")}
                className={cn(
                  "flex-1 text-left py-2.5 px-3 rounded-lg text-xs font-medium transition-colors",
                  imageMode === "individual"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-gray-50 text-gray-500 border border-gray-200"
                )}
              >
                <span className="block">🎯 Individual</span>
                <span className="font-normal text-[10px] opacity-70 block mt-0.5">
                  Generate images one at a time with full control
                </span>
              </button>
            </div>
          </div>

          <Button
            onClick={() => {
              if (imageMode === "individual") startGeneration();
              else setWizardStep(2);
            }}
            disabled={platforms.length === 0}
            className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 h-12 text-base"
          >
            {imageMode === "individual" ? (
              <>
                Generate {postCount} Captions <ArrowRight className="h-5 w-5" />
              </>
            ) : (
              <>
                Next: Visual Context <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* STEP 2 */}
      {wizardStep === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-blink-dark font-heading">
              Visual Context
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload a reference photo or let AI generate everything from
              scratch
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    enhanceMode
                      ? "bg-amber-50 text-amber-600"
                      : "bg-blink-primary/10 text-blink-primary"
                  )}
                >
                  {enhanceMode ? (
                    <Wand2 className="h-4 w-4" />
                  ) : (
                    <Palette className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-blink-dark">
                    {enhanceMode
                      ? "Enhance Source Photo"
                      : "Pure AI Generation"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {enhanceMode
                      ? "AI will enhance & stylize your uploaded photo"
                      : "AI generates images entirely from text prompts"}
                  </p>
                </div>
              </div>
              <Switch checked={enhanceMode} onCheckedChange={setEnhanceMode} />
            </div>
          </div>

          {enhanceMode && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Reference Image <span className="text-red-500">*</span>
              </label>
              {referencePreview ? (
                <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                  <img
                    src={referencePreview}
                    alt="Reference"
                    className="w-full max-h-64 object-contain bg-gray-50"
                  />
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={clearFile}
                      className="p-1.5 rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
                    >
                      <X className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-amber-300 bg-amber-50/30 hover:bg-amber-50/60"
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                  <p className="text-sm font-medium text-blink-dark">
                    Drag & drop your reference image
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setWizardStep(1)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={startGeneration}
              disabled={enhanceMode && !referenceFile}
              className="flex-1 bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 h-12 text-base"
            >
              Generate {postCount} Posts <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {wizardStep === 3 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-blink-dark font-heading">
              Generating Your Content
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {imageMode === "individual"
                ? "Creating captions — you'll add images later"
                : "Sit back — this may take a few minutes"}
            </p>
          </div>
          <div className="space-y-1">
            {pipeline.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-lg transition-colors",
                  step.status === "running" && "bg-blink-primary/5",
                  step.status === "done" && "bg-emerald-50",
                  step.status === "error" && "bg-red-50"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center h-10 w-10 rounded-full shrink-0",
                    step.status === "idle" && "bg-gray-100 text-gray-400",
                    step.status === "running" &&
                      "bg-blink-primary/10 text-blink-primary",
                    step.status === "done" && "bg-emerald-100 text-emerald-600",
                    step.status === "error" && "bg-red-100 text-red-600"
                  )}
                >
                  {step.status === "running" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : step.status === "done" ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : step.status === "error" ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.status === "idle" && "text-gray-400",
                      step.status === "running" && "text-blink-dark",
                      step.status === "done" && "text-emerald-700",
                      step.status === "error" && "text-red-700"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {step.detail}
                    </p>
                  )}
                  {step.error && (
                    <p className="text-xs text-red-500 mt-0.5">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {wizardStep === 4 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
            <div className="text-center space-y-2">
              <div className="text-4xl">🎉</div>
              <h2 className="text-xl font-semibold text-blink-dark font-heading">
                Content Generated!
              </h2>
              <p className="text-sm text-gray-500">
                {generatedContent.length} post
                {generatedContent.length !== 1 ? "s" : ""} ready for review
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
              <Link href="/dashboard/content">
                <Button variant="outline" className="gap-2">
                  <ArrowRight className="h-4 w-4" /> Go to Content Calendar
                </Button>
              </Link>
              <Button
                onClick={handleSendAllForApproval}
                disabled={sendingAll}
                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
              >
                {sendingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}{" "}
                Send All for Approval
              </Button>
            </div>
          </div>

          {generatedContent.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {generatedContent.map((item) => {
                const urls = parseArray(item.image_urls);
                const hasImage = urls.length > 0;
                return (
                  <div key={item.id} className="relative group">
                    <ContentCard content={item} />
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          handleRegenerateCaption(item);
                        }}
                        disabled={regeneratingCaption === item.id}
                        className="flex-1 text-xs gap-1.5 h-8"
                      >
                        {regeneratingCaption === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}{" "}
                        Regen Caption
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          openImageModal(item);
                        }}
                        disabled={regeneratingImage === item.id}
                        className={cn(
                          "flex-1 text-xs gap-1.5 h-8",
                          !hasImage && imageMode === "individual"
                            ? "bg-blink-primary/5 border-blink-primary/30 text-blink-primary hover:bg-blink-primary/10"
                            : ""
                        )}
                      >
                        {regeneratingImage === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}{" "}
                        {!hasImage && imageMode === "individual"
                          ? "Generate Image"
                          : "Regen Image"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ✨ Platform Selection Modal */}
      <Dialog open={isPlatformModalOpen} onOpenChange={setIsPlatformModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Platform to Strategy</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {ALL_PLATFORMS.filter(
              (p) => !visiblePlatformValues.includes(p.value)
            ).map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setVisiblePlatformValues((prev) => [...prev, p.value]);
                  setPlatforms((prev) => [...prev, p.value]); // Auto-select it
                  setIsPlatformModalOpen(false);
                }}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blink-primary hover:bg-blink-primary/5 transition-colors text-left"
              >
                <span className="text-lg">{p.icon}</span>
                <span className="text-sm font-medium text-blink-dark">
                  {p.label}
                </span>
              </button>
            ))}
            {ALL_PLATFORMS.filter(
              (p) => !visiblePlatformValues.includes(p.value)
            ).length === 0 && (
              <div className="col-span-2 text-center text-sm text-gray-500 py-4">
                All platforms added!
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Generation Modal */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blink-primary" />
              {parseArray(imageModalTarget?.image_urls).length > 0
                ? "Regenerate Image"
                : "Generate Image"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-5">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      modalEnhanceMode
                        ? "bg-amber-50 text-amber-600"
                        : "bg-blink-primary/10 text-blink-primary"
                    )}
                  >
                    {modalEnhanceMode ? (
                      <Wand2 className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blink-dark">
                      {modalEnhanceMode
                        ? "Enhance Source Photo"
                        : "Pure AI Generation"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={modalEnhanceMode}
                  onCheckedChange={setModalEnhanceMode}
                />
              </div>
            </div>

            {modalEnhanceMode && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Reference Photo <span className="text-red-500">*</span>
                </label>
                {modalRefPreview ? (
                  <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={modalRefPreview}
                      alt="Reference"
                      className="w-full max-h-48 object-contain bg-gray-50"
                    />
                    <button
                      onClick={clearModalFile}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
                    >
                      <X className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleModalFileSelect(file);
                    }}
                    onClick={() => modalRefInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-amber-300 bg-amber-50/30 hover:bg-amber-50/60"
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2 text-amber-400" />
                    <p className="text-xs font-medium text-blink-dark">
                      Drop your reference image here
                    </p>
                  </div>
                )}
                <input
                  ref={modalRefInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleModalFileSelect(file);
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImageModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleModalGenerateImage}
              disabled={modalGenerating || (modalEnhanceMode && !modalRefFile)}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
            >
              {modalGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />{" "}
                  {modalEnhanceMode ? "Enhance Photo" : "Generate Image"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
