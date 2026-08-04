"use client";

import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Sparkles, Image as ImageIcon, Box, LayoutGrid, UploadCloud, X, Loader2, Wand2, RefreshCw, Eraser, CheckCircle, Layers, Download, Share2, Briefcase, Info, FolderOpen } from "lucide-react";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import { checkReferenceEngineCompatibility, isReferenceCapableEngine, willAttachReference } from "@/lib/image-generation-guards";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { useAssistedCreationStore } from "@/app/store/useAssistedCreationStore";
import { selectCreativeDirection, assemblePrompt } from "@/lib/creative-direction";
import { AssistedCreation } from "@/components/creation/AssistedCreation";
import { LogoGenerator } from "@/components/creation/LogoGenerator";
import { ImageGenerationStatus } from "@/components/creation/ImageGenerationStatus";
import { IMAGE_STUDIO_ALLOWED_FORMATS, type AssistedCreativeDirection } from "@/lib/assisted-creation";
import {
  imageGenerationReducer,
  initialImageGenerationStatus,
  isActive,
  isTerminal,
  leavePageWarning,
  type BillingState,
} from "@/lib/image-generation-state";
import { mintIdempotencyKey, submitGenerationJob } from "@/lib/generation-job-client";
import { clearActiveImageJob, durableImageJobsEnabled, persistActiveImageJob, readActiveImageJob } from "@/lib/durable-image-jobs";
import { useObservedGenerationJob } from "@/lib/use-observed-generation-job";

// --- Configuration ---
const IMAGE_MODES = [
  { id: "standard", title: "Standard Generation", icon: ImageIcon, desc: "Generate stunning AI photos from scratch or enhance a reference image.", requiresUpload: false, maxUploads: 1 },
  { id: "product_drop", title: "Product Drop", icon: Box, desc: "Upload a transparent product PNG and AI will blend it into a beautiful scene.", requiresUpload: true, maxUploads: 1 },
  { id: "organic_blend", title: "Organic Composition", icon: Layers, desc: "Upload 2 to 8 items. AI will arrange them naturally into a realistic, cohesive scene.", requiresUpload: true, maxUploads: 8 },
  { id: "grid", title: "Campaign Grid", icon: LayoutGrid, desc: "Upload 2 to 8 images and let AI arrange them into an aesthetic moodboard.", requiresUpload: true, maxUploads: 8 }
];

// ✨ Universal Marketing Styles
const MARKETING_STYLES = [
  {
    id: "studio",
    label: "📸 Studio Product Shoot",
    promptAddon: `Reference: Irving Penn product portraits, Bottega Veneta campaigns. The background is silence that amplifies — not empty space. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "lifestyle",
    label: "🌿 Lifestyle Photography",
    promptAddon: `Reference: Kinfolk magazine, Aesop campaign photography, Monocle editorial. The product was not placed here — it lives here. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "cinematic",
    label: "🎬 Cinematic",
    promptAddon: `Reference: Roger Deakins lighting, Denis Villeneuve visual language. A single frame from a film that has not been made yet. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
  {
    id: "poster",
    label: "🔥 Editorial Ad Campaign",
    promptAddon: `Reference: Apple launch photography, Mubi film poster art, Virgil Abloh design language, modern social-media graphic design. The poster is an event, not a flyer. Typography is FLAT 2D graphic design — bold clean vector lettering, flat layered echoes, rounded color label chips. STRICTLY NO 3D extruded, beveled, embossed, or puffy text.`,
  },
  {
    id: "brand",
    label: "✨ Brand Integrated (Logo)",
    promptAddon: `Image 1 is the brand's own logo and must be used as the identity reference. Integrate it naturally into the scene as a printed mark, embossed detail, label, packaging graphic, or surface application. Preserve its proportions, recognizable shapes, and brand colors. Do not invent another logo, brand name, or lettering. Keep the mark clear, undistorted, and appropriately sized within the composition. Build the surrounding product scene, lighting, materials, and atmosphere around this supplied brand asset.`,
  },
  {
    id: "abstract",
    label: "🎨 Abstract / 3D Render",
    promptAddon: `Reference: Zaha Hadid architecture as product design, Kaws sculpture meets Octane rendering. One dominant form. Surface tells the story through light, shadow, and material precision.`,
  },
  {
    id: "flatlay",
    label: "📐 Flatlay / Top-Down",
    promptAddon: `Reference: Wallpaper* magazine spreads, System Magazine editorial. Objects in conversation, not arranged. Surface chosen like a frame. NO TEXT, NO TYPOGRAPHY, NO LOGOS anywhere in the image.`,
  },
];

interface GeneratedResult {
  id: string;
  url: string;
  prompt: string;
  mode: string;
}

export default function ImageStudioPage() {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore(); // ✨ Hooked into activeBrand to force re-renders
  const assistedDraft = useAssistedCreationStore((state) => state.draft);
  const assistedHydrated = useAssistedCreationStore((state) => state.hasHydrated);
  const revealAssistedAdvanced = useAssistedCreationStore((state) => state.revealAdvanced);
  const setAssistedHandoff = useAssistedCreationStore((state) => state.setHandoff);

  // --- State: Core ---
  const [selectedMode, setSelectedMode] = useState("standard");
  const [selectedStyle, setSelectedStyle] = useState("studio");
  const [selectedImageEngine, setSelectedImageEngine] = useState("nb2");
  const [selectedAspect, setSelectedAspect] = useState("4:5");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [numImages, setNumImages] = useState(1);
  const [genStatus, dispatchGen] = useReducer(imageGenerationReducer, initialImageGenerationStatus);
  const isGenerating = isActive(genStatus);
  const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>([]);

  // --- Slice 5 Increment 3: durable job seam (OFF by default; the synchronous
  //     path below remains the compatibility fallback until live n8n async
  //     acknowledgement/status-writing is authorized). ---
  const [durableEnabled] = useState(() => durableImageJobsEnabled());
  const [observedContentId, setObservedContentId] = useState<string | null>(null);
  const submittingRef = useRef(false);          // one submission per action
  const actionKeyRef = useRef<string | null>(null); // stable idempotency key within an action
  const lastJobContentIdRef = useRef<string | null>(null); // retry-parent lineage
  const durablePromptRef = useRef<string>("");

  // Warn before leaving the page while a generation is in flight.
  useEffect(() => {
    if (leavePageWarning(genStatus) === null) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [genStatus]);

  // Observe exactly one durable job (Increment 3). Snapshots are authoritative and
  // are synced into the existing unified status; a durable terminal stops observation.
  useObservedGenerationJob(observedContentId, {
    onSnapshot: (snapshot) => {
      dispatchGen({ type: "sync", status: snapshot.status });
      if (snapshot.status.generationState === "succeeded" && snapshot.imageUrls.length > 0) {
        setGeneratedResults((prev) => {
          const fresh = snapshot.imageUrls.map((url, index) => ({
            id: `${snapshot.contentId}:${index}`, url, prompt: durablePromptRef.current, mode: selectedMode,
          }));
          const others = prev.filter((result) => !result.id.startsWith(`${snapshot.contentId}:`));
          return [...fresh, ...others];
        });
      }
      // Honest local timeout keeps observing; a DURABLE terminal ends it.
      if (!snapshot.observationTimedOut && isTerminal(snapshot.status)) {
        clearActiveImageJob(snapshot.contentId);
        setObservedContentId(null);
      }
    },
    onError: (error) => {
      if (error.code === "unauthorized") toast.error("Your session expired. Please sign in again.");
    },
  });

  // Restore an in-flight durable job after refresh/navigation — OBSERVE the
  // existing job, never resubmit it. Guarded and idempotent.
  useEffect(() => {
    if (!durableEnabled || !activeBrand || !clientId) return;
    if (observedContentId || submittingRef.current || isActive(genStatus)) return;
    const restored = readActiveImageJob(activeBrand.id);
    if (restored) {
      // Reveal the studio surface so the restored job's status/results are visible
      // (the status panel lives inside the advanced controls).
      revealAssistedAdvanced(activeBrand.id);
      // Establish the restored job as the retry parent: if it later resolves
      // failed/refunded and the user retries, the new placeholder must carry
      // retry_of_content_id === this restored id (lineage survives navigation).
      lastJobContentIdRef.current = restored;
      setObservedContentId(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durableEnabled, activeBrand?.id, clientId]);

  // --- State: Brand Context ---
  const [brandContext, setBrandContext] = useState<any>(null);

  // --- State: Library Picker ---
  const [libraryUrls, setLibraryUrls] = useState<string[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // --- State: Modals & Refinement ---
  const [selectedResult, setSelectedResult] = useState<GeneratedResult | null>(null);
  const [refinementTab, setRefinementTab] = useState<"fresh" | "retouch">("fresh");
  const [modalPrompt, setModalPrompt] = useState("");
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const activeConfig = IMAGE_MODES.find(m => m.id === selectedMode)!;

  // Reference/inspiration → engine compatibility (reactive, non-blocking guidance).
  // A reference image (upload, Content Grid pick, or Brand logo) can only be used by
  // a reference-capable engine; GPT Image 2 · T2I is text-only. We surface this
  // inline and offer an explicit switch — we never silently drop the image or bill.
  const willAttachInspiration = willAttachReference({
    style: selectedStyle,
    hasBrandLogo: !!brandContext?.logoUrl,
    uploadCount: files.length,
    libraryCount: libraryUrls.length,
  });
  const engineIsReferenceCapable = isReferenceCapableEngine(selectedImageEngine);
  const showEngineIncompatibleGuidance = willAttachInspiration && !engineIsReferenceCapable;

  const revealAdvancedControls = () => {
    if (activeBrand) revealAssistedAdvanced(activeBrand.id);
    window.setTimeout(() => document.getElementById("advanced-creation-controls")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const handoffAssistedDirection = (direction: AssistedCreativeDirection) => {
    if (activeBrand) setAssistedHandoff(activeBrand.id, direction);
    setPrompt(direction.summary);
    setSelectedStyle(direction.style);
    setSelectedMode("standard");
    revealAdvancedControls();
    toast.success("Creative direction is ready in the existing studio controls.");
  };

  const currentAssistedDraft = assistedDraft?.brandId === activeBrand?.id ? assistedDraft : null;
  const showAdvancedControls = currentAssistedDraft?.advancedRevealed === true;

  useEffect(() => {
    if (!assistedHydrated || !currentAssistedDraft?.handoff) return;
    // Format-honesty quarantine: a legacy handoff derived from a video/carousel
    // direction must not silently populate image generation controls.
    const handoffDirection = currentAssistedDraft.direction;
    if (handoffDirection && !IMAGE_STUDIO_ALLOWED_FORMATS.includes(handoffDirection.outputType)) return;
    setPrompt(currentAssistedDraft.handoff.prompt);
    setSelectedStyle(currentAssistedDraft.handoff.style);
    setSelectedMode(currentAssistedDraft.handoff.mode);
  }, [assistedHydrated, currentAssistedDraft?.handoff, currentAssistedDraft?.direction]);

  // --- Load Brand Context on Mount & Brand Switch ---
  useEffect(() => {
    if (!clientId || !activeBrand) {
      setBrandContext(null);
      return;
    }

    async function loadContext() {
      const [clientRes, brandRes] = await Promise.all([
        supabase.from("clients").select("company_name, industry").eq("id", clientId).single(),
        supabase.from("brand_profiles")
          .select("brand_name, company_name, website_url, description, image_style, brand_voice, logo_url, primary_color, secondary_color, primary_font")
          .eq("id", activeBrand!.id)
          .maybeSingle(),
      ]);

      setBrandContext({
        name: brandRes.data?.brand_name || (activeBrand as any).brand_name || clientRes.data?.company_name,
        industry: clientRes.data?.industry,
        imageStyle: brandRes.data?.image_style,
        brandVoice: brandRes.data?.brand_voice,
        logoUrl: brandRes.data?.logo_url,
        websiteUrl: brandRes.data?.website_url,
        description: brandRes.data?.description,
        primaryColor: brandRes.data?.primary_color,
        secondaryColor: brandRes.data?.secondary_color,
        primaryFont: brandRes.data?.primary_font,
      });
    }
    loadContext();
  }, [clientId, activeBrand?.id]);


  // --- AI Prompt Helper ---
  const [isHelpLoading, setIsHelpLoading] = useState(false);
  const [customTypography, setCustomTypography] = useState("");
  const [showTypographyInput, setShowTypographyInput] = useState(false);

  const handlePromptHelp = async () => {
    if (isHelpLoading) return;
    setIsHelpLoading(true);

    try {
      const activeStyleObj = MARKETING_STYLES.find(s => s.id === selectedStyle);

      const res = await fetch("/api/ai/prompt-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          brandContext: brandContext,
          useBrand: activeBrand !== null,
          mode: selectedMode,
          style: activeStyleObj
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to fetch suggestion");

      if (data.suggestion) {
        setPrompt(data.suggestion);
      }
    } catch (err: any) {
      toast.error(`Prompt helper failed: ${err.message}`);
    } finally {
      setIsHelpLoading(false);
    }
  };


  // --- Drag & Drop Logic ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const remainingSlots = activeConfig.maxUploads - files.length;
    const allowedFiles = acceptedFiles.slice(0, remainingSlots);

    allowedFiles.forEach(file => {
      if (selectedMode === 'product_drop' && file.type !== 'image/png') {
        toast.warning("For Product Drop, PNG files give the best transparency results.");
      }
      setFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  }, [files.length, activeConfig.maxUploads, selectedMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': [], 'image/jpeg': [], 'image/webp': [] },
    disabled: files.length >= activeConfig.maxUploads,
    multiple: activeConfig.maxUploads > 1
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const removeLibraryUrl = (index: number) => {
    setLibraryUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleLibrarySelect = (url: string) => {
    const totalUsed = files.length + libraryUrls.length;
    if (totalUsed >= activeConfig.maxUploads) {
      toast.warning(`Maximum ${activeConfig.maxUploads} reference images allowed.`);
      return;
    }
    if (!libraryUrls.includes(url)) {
      setLibraryUrls(prev => [...prev, url]);
    }
    setIsLibraryOpen(false);
  };

  // --- Main Generation Logic ---
  // Durable path (guarded): placeholder → submit → observe. Preserves retry-parent
  // lineage, prevents duplicate submissions, and leaves the synchronous path below
  // untouched. Only reached when durable jobs are enabled.
  const handleGenerateDurable = async (opts?: { retry?: boolean }) => {
    if (submittingRef.current) return; // one submission per action (closes the click/rerender race)
    submittingRef.current = true;
    dispatchGen({ type: opts?.retry ? "retry" : "start" });
    try {
      let activePrompt = prompt.trim();
      if (activePrompt.length < 10) {
        try {
          const helperRes = await fetch("/api/ai/prompt-helper", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: activePrompt, brandContext, useBrand: !!activeBrand, mode: selectedMode, style: MARKETING_STYLES.find((s) => s.id === selectedStyle) }),
          });
          const helperData = await helperRes.json();
          if (helperData.suggestion) { activePrompt = helperData.suggestion; setPrompt(helperData.suggestion); }
        } catch { /* non-fatal */ }
      }

      const idempotencyKey = actionKeyRef.current ?? mintIdempotencyKey();
      actionKeyRef.current = idempotencyKey; // stable within this action
      const retryOfContentId = opts?.retry ? lastJobContentIdRef.current ?? undefined : undefined;

      const placeholder = await submitGenerationJob({
        brandId: activeBrand!.id,
        mode: selectedMode,
        imageEngine: selectedImageEngine,
        aspectRatio: selectedAspect,
        idempotencyKey,
        retryOfContentId,
      });
      if (!placeholder.ok) {
        dispatchGen({ type: "failed", errorCode: placeholder.code, message: "Couldn't start generation. Please try again.", billing: "not_charged" });
        return;
      }
      lastJobContentIdRef.current = placeholder.contentId;
      persistActiveImageJob(activeBrand!.id, placeholder.contentId);

      // Assemble (reusing the pure director/prompt builders) and submit ONCE.
      // Live async n8n status-writing is separately gated, so this is fire-and-forget:
      // durable state is read from the job row via the observer, not this response.
      // Upload any user-provided files so durable jobs support upload-based modes
      // (Product Drop, Grid, Organic) and inspiration uploads — not just library picks.
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "png";
        const path = `images/${clientId}/studio_ref_${Date.now()}_${i}.${ext}`;
        await supabase.storage.from("assets").upload(path, file);
        uploadedUrls.push(supabase.storage.from("assets").getPublicUrl(path).data.publicUrl);
      }
      const referenceUrls = [...uploadedUrls, ...libraryUrls];
      if (selectedStyle === "brand" && brandContext?.logoUrl) referenceUrls.unshift(brandContext.logoUrl);
      const activeStyleObj = MARKETING_STYLES.find((s) => s.id === selectedStyle);
      const brandConstraint = brandContext?.name
        ? `CRITICAL BRAND CONSTRAINT: This content belongs to the brand "${brandContext.name}". Do NOT invent fictional brand names, fake website URLs, placeholder logos, or generic company names.`
        : "";
      const creativeDirection = selectCreativeDirection(brandContext ?? {}, { topic: activePrompt, style: selectedStyle, mode: selectedMode, customTypography: customTypography.trim() || undefined });
      const { prompt: finalPrompt, negativePrompt } = assemblePrompt(activePrompt, creativeDirection, brandContext ?? {}, activeStyleObj?.promptAddon ?? "", brandConstraint, customTypography.trim() || undefined);
      durablePromptRef.current = finalPrompt;

      // Durable jobs route to the dedicated async lane (Slice 5, #2): ack → atomic
      // claim_and_charge → generate → status writes → claim_and_refund.
      void triggerWorkflow("blink-generate-images-async", {
        client_id: clientId,
        brand_id: activeBrand!.id,
        // Durable correlation contract (Slice 5, Increment 3): these three fields
        // tie this async submission to the placeholder the future n8n status writer
        // must update. All derive from the SUCCESSFUL placeholder response/action —
        // none is independently generated, and none carries tenant or billing
        // authority (post_id ownership is re-verified server-side).
        //   post_id         — the durable placeholder content row (== observed == persisted id)
        //   job_id          — explicit alias of post_id for the job-oriented status writer
        //   idempotency_key — the once-per-action key that created the placeholder
        post_id: placeholder.contentId,
        job_id: placeholder.jobId,
        idempotency_key: idempotencyKey,
        mode: selectedMode,
        prompt: activePrompt,
        assembled_prompt: finalPrompt,
        negative_prompt: negativePrompt,
        reference_image_urls: referenceUrls,
        // GPT Image 2 · I2I consumes references via input_urls (matches the sync path).
        ...(selectedImageEngine === "gpt-image-2-image-to-image" ? { input_urls: referenceUrls } : {}),
        kie_model: selectedImageEngine === "nb2" ? "nano-banana-2" : selectedImageEngine,
        aspect_ratio: selectedAspect,
        style: selectedStyle,
        imageEngine: selectedImageEngine,
        logo_url: brandContext?.logoUrl ?? undefined,
        is_sync: false,
      }).catch(() => { /* durable state is observed from the job row */ });

      setObservedContentId(placeholder.contentId); // observe → drives status + results
    } catch {
      dispatchGen({ type: "failed", errorCode: "generation_error", message: "Couldn't start generation. Please try again.", billing: "not_charged" });
    } finally {
      submittingRef.current = false;
      actionKeyRef.current = null;
    }
  };

  const handleGenerate = async (opts?: { retry?: boolean }) => {
    // Never start a second request while one is in flight — a retry must not
    // duplicate a running generation.
    if (isActive(genStatus)) return;
    if (!clientId) return toast.error("Session lost. Please refresh.");
    if (!activeBrand) return toast.error("Please select a brand workspace first.");
    const totalRefs = files.length + libraryUrls.length;
    if (activeConfig.requiresUpload && totalRefs === 0) return toast.error("Please upload or pick an image from your content grid.");
    if ((selectedMode === "grid" || selectedMode === "organic_blend") && totalRefs < 2) return toast.error("This mode requires at least 2 images.");

    // Reject an incompatible engine/reference combination BEFORE the workflow charges credits.
    // Brand Integrated attaches the logo; a text-to-image engine cannot use it and would only
    // deduct, fail at the provider, then need a refund.
    const engineCheck = checkReferenceEngineCompatibility({
      engine: selectedImageEngine,
      willAttachReference: willAttachReference({
        style: selectedStyle,
        hasBrandLogo: !!brandContext?.logoUrl,
        uploadCount: files.length,
        libraryCount: libraryUrls.length,
      }),
    });
    if (!engineCheck.ok) return toast.error(engineCheck.reason);

    // Guarded rollout seam: when durable jobs are enabled, take the placeholder →
    // submit → observe path and NEVER also run the synchronous path below.
    if (durableEnabled) {
      void handleGenerateDurable(opts);
      return;
    }

    dispatchGen({ type: opts?.retry ? "retry" : "start" });

    const { addTask, removeTask } = useWorkflowStore.getState();
    const taskId = `img-gen-${Date.now()}`;

    try {
      addTask(taskId, "Generating Image");

      // Auto Creative Director — if prompt is empty or lazy (<10 chars), generate a concept first
      let activePrompt = prompt.trim();
      if (activePrompt.length < 10) {
        addTask(taskId, "Creative Director is writing your brief...");
        try {
          const helperRes = await fetch("/api/ai/prompt-helper", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: activePrompt,
              brandContext,
              useBrand: !!activeBrand,
              mode: selectedMode,
              style: MARKETING_STYLES.find(s => s.id === selectedStyle),
            }),
          });
          const helperData = await helperRes.json();
          if (helperData.suggestion) {
            activePrompt = helperData.suggestion;
            setPrompt(helperData.suggestion); // show user what was created
          }
        } catch {
          // non-fatal — fall through with whatever prompt we have
        }
      }

      // Upload any user-provided files
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "png";
        const path = `images/${clientId}/studio_ref_${Date.now()}_${i}.${ext}`;
        await supabase.storage.from("assets").upload(path, file);
        const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        uploadedUrls.push(url);
      }

      // Merge uploaded files + library picks. Library URLs are already on CDN — no upload needed.
      const referenceUrls = [...uploadedUrls, ...libraryUrls];
      if (selectedStyle === "brand" && brandContext?.logoUrl) {
        referenceUrls.unshift(brandContext.logoUrl);
      }

      const activeStyleObj = MARKETING_STYLES.find(s => s.id === selectedStyle);

      // Hard-lock brand identity — prevents AI from inventing fictional brands
      const brandConstraint = brandContext?.name
        ? [
          `CRITICAL BRAND CONSTRAINT: This content belongs to the brand "${brandContext.name}".`,
          brandContext.websiteUrl ? `The website is ${brandContext.websiteUrl}.` : "",
          brandContext.description ? `Brand description: ${brandContext.description}.` : "",
          brandContext.industry ? `Industry: ${brandContext.industry}.` : "",
          `Do NOT invent fictional brand names, fake website URLs, placeholder logos, or generic company names.`,
          `Any text, signage, labels, or website URLs visible in the image MUST reflect "${brandContext.name}" only.`,
        ].filter(Boolean).join(" ")
        : "";

      // Creative Direction Engine — dynamically layers composition, emotion, lighting,
      // depth, and tension systems based on brand DNA. Replaces flat style concatenation.
      const creativeDirection = selectCreativeDirection(brandContext ?? {}, {
        topic: activePrompt,
        style: selectedStyle,
        mode: selectedMode,
        customTypography: customTypography.trim() || undefined,
      });
      const { prompt: finalPrompt, negativePrompt } = assemblePrompt(
        activePrompt,
        creativeDirection,
        brandContext ?? {},
        activeStyleObj?.promptAddon ?? "",
        brandConstraint,
        customTypography.trim() || undefined,
      );
      const totalImages = selectedMode === "standard" ? numImages : 1;

      // Fire one workflow call per image in parallel so batch actually works
      const workflowPayload = {
        client_id: clientId,
        brand_id: activeBrand.id,
        mode: selectedMode,
        prompt: activePrompt,
        assembled_prompt: finalPrompt,
        negative_prompt: negativePrompt,
        custom_typography: customTypography.trim() || undefined,
        reference_image_urls: referenceUrls,
        // ✨ The workflow routes on `kie_model` (NOT `imageEngine`). Without this the
        // GPT Image 2 selection was silently ignored and everything ran as
        // nano-banana-2 — which is why "GPT Image 2 · I2I" never followed the
        // reference layout. Map the engine pill to the model the workflow expects.
        kie_model: selectedImageEngine === "nb2" ? "nano-banana-2" : selectedImageEngine,
        // ✨ User-chosen output format (workflow falls back to 4:5 if absent)
        aspect_ratio: selectedAspect,
        // For Image→Image, also pass the moodboard refs as input_urls (the GPT I2I
        // node prefers input_urls; it falls back to reference_image_urls otherwise).
        ...(selectedImageEngine === "gpt-image-2-image-to-image" ? { input_urls: referenceUrls } : {}),
        strict_brand_alignment: true,
        numImages: 1,
        style: selectedStyle,
        imageEngine: selectedImageEngine,
        // Full brand identity so n8n can reinforce brand context in its own prompt building
        brand_name: brandContext?.name ?? undefined,
        brand_website: brandContext?.websiteUrl ?? undefined,
        brand_description: brandContext?.description ?? undefined,
        brand_industry: brandContext?.industry ?? undefined,
        brand_primary_color: brandContext?.primaryColor ?? undefined,
        brand_secondary_color: brandContext?.secondaryColor ?? undefined,
        logo_url: brandContext?.logoUrl ?? undefined,
        is_sync: true,
      };

      dispatchGen({ type: "generating" });
      const settled = await Promise.allSettled(
        Array.from({ length: totalImages }).map(() => triggerWorkflow("blink-generate-images", workflowPayload))
      );

      const newUrls: string[] = [];
      let safetyMessage: string | null = null;
      // Billing truth from the workflow, when it reports it. A safety refusal
      // refunds; an explicit `refunded: false` means charged-but-failed.
      let failureBilling: BillingState | null = null;
      for (const result of settled) {
        if (result.status === "fulfilled" && result.value) {
          const r = result.value as any;
          if (r.success === false) {
            if (r.message) safetyMessage = r.message;
            if (typeof r.refunded === "boolean") failureBilling = r.refunded ? "refunded" : "charged";
            continue;
          }
          const urls: string[] = Array.isArray(r.imageUrls) ? r.imageUrls : r.imageUrls ? [r.imageUrls] : [];
          newUrls.push(...urls);
        }
      }

      if (newUrls.length === 0) {
        const message = safetyMessage || "No images were returned from the generator.";
        // Absent an explicit flag, a returned safety refusal is refunded by n8n.
        const billing: BillingState = failureBilling ?? (safetyMessage ? "refunded" : "refund_pending");
        dispatchGen({ type: "failed", errorCode: safetyMessage ? "safety_blocked" : "no_images", message, billing });
        toast.error(`Generation failed: ${message}`);
        return;
      }

      dispatchGen({ type: "saving" });
      const newResults: GeneratedResult[] = [];
      for (const url of newUrls) {
        const { data: contentRecord, error } = await supabase
          .from("content")
          .insert({
            client_id: clientId,
            brand_id: activeBrand.id,
            content_type: "post_image",
            caption: "",
            status: "draft",
            image_urls: [url],
            ai_model: "nano-banana-studio",
          })
          .select()
          .single();

        if (error) console.error("Failed to save to grid:", error);
        if (contentRecord) newResults.push({ id: contentRecord.id, url, prompt: finalPrompt, mode: selectedMode });
      }

      setGeneratedResults(prev => [...newResults, ...prev]);
      dispatchGen({ type: "succeeded" });
      toast.success(`${newResults.length} image${newResults.length !== 1 ? "s" : ""} generated and saved.`);

    } catch (error: any) {
      console.error(error);
      const message = error?.message || "Unknown error";
      const timedOut = error?.name === "AbortError" || /timed out/i.test(message);
      if (timedOut) {
        dispatchGen({ type: "timed_out", message });
      } else {
        dispatchGen({ type: "failed", errorCode: "generation_error", message, billing: "refund_pending" });
      }
      toast.error(`Generation failed: ${message}`);
    } finally {
      removeTask(taskId);
    }
  };

  // --- Refinement Logic (Modal Buttons) ---
  const handleRefine = async (type: "fresh" | "retouch") => {
    if (!selectedResult || !clientId) return;
    if (!activeBrand) return toast.error("Please select a brand workspace first.");

    if (type === "retouch" && !retouchPrompt.trim()) {
      return toast.error("Please enter instructions on what you want to change.");
    }

    setIsRefining(true);

    try {
      const wfMode = type === "fresh" ? "standard" : "edit";
      const wfPrompt = type === "fresh" ? modalPrompt : retouchPrompt;

      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId,
        brand_id: activeBrand.id,
        mode: wfMode,
        prompt: wfPrompt,
        reference_image_urls: [selectedResult.url],
        strict_brand_alignment: true,
        numImages: 1,
        is_sync: true,
        logo_url: brandContext?.logoUrl ?? undefined,
        brand_name: brandContext?.name ?? undefined,
        brand_website: brandContext?.websiteUrl ?? undefined,
        brand_description: brandContext?.description ?? undefined,
        brand_industry: brandContext?.industry ?? undefined,
        brand_primary_color: brandContext?.primaryColor ?? undefined,
      });

      if (response && (response as any).success === false) {
        throw new Error((response as any).message || "No images were returned.");
      }
      let newUrls: string[] = [];
      if (response && Array.isArray(response.imageUrls)) newUrls = response.imageUrls as string[];
      else if (response && response.imageUrls) newUrls = response.imageUrls as string[];

      if (newUrls.length === 0) throw new Error("No images were returned.");

      const url = newUrls[0];
      // ✨ FIXED: Save with brand_id
      const { data: contentRecord } = await supabase
        .from("content")
        .insert({
          client_id: clientId,
          brand_id: activeBrand.id,
          content_type: "post_image",
          caption: "",
          status: "draft",
          image_urls: [url],
          ai_model: type === "fresh" ? 'nano-banana-v2' : 'qwen-image-edit'
        })
        .select()
        .single();

      if (contentRecord) {
        const newRes = { id: contentRecord.id, url, prompt: wfPrompt, mode: wfMode };
        setGeneratedResults(prev => [newRes, ...prev]);

        setSelectedResult(newRes);
        setModalPrompt(newRes.prompt);
        setRetouchPrompt("");
      }

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Refinement failed. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const openModal = (result: GeneratedResult) => {
    setSelectedResult(result);
    setModalPrompt(result.prompt);
    setRetouchPrompt("");
  };

  // ✨ NEW: "No Brand" fallback state
  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in duration-500">
        <div className="mx-auto h-20 w-20 bg-[#191D23] border border-[#57707A]/40 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
          <Briefcase className="h-10 w-10 text-[#57707A]" />
        </div>
        <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">No Workspace Selected</h2>
        <p className="text-[#989DAA] mt-3 max-w-md mx-auto leading-relaxed mb-8">
          Please select or create a brand from the top navigation bar to access the Image Studio.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-20 animate-in fade-in duration-500 relative">
      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#2A2F38] rounded-2xl p-8 border border-[#57707A]/40 shadow-xl overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#C5BAC4]/10 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#C5BAC4]" />
            </div>
            <h1 className="text-2xl font-bold text-[#DEDCDC] font-display">AI Image Studio</h1>
          </div>
          <p className="text-sm text-[#DEDCDC]/50 max-w-xl leading-relaxed">
            Generate fresh aesthetic content, composite your products perfectly into new scenes, or build beautiful campaign grids.
          </p>
        </div>
      </div>

      <AssistedCreation
        brandId={activeBrand.id}
        brandName={brandContext?.name || activeBrand.brand_name || "your brand"}
        onCustomize={revealAdvancedControls}
        onContinue={handoffAssistedDirection}
      />

      {showAdvancedControls && <div id="advanced-creation-controls" className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-20">
        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-bold text-[#DEDCDC]/60 uppercase tracking-widest">Select Mode</h3>
            <div className="flex flex-col gap-3">
              {IMAGE_MODES.map((mode) => {
                const isSelected = selectedMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => { setSelectedMode(mode.id); setFiles([]); setPreviews([]); setLibraryUrls([]); }}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                      isSelected ? "border-[#C5BAC4]/50 bg-[#C5BAC4]/10 shadow-sm" : "border-[#57707A]/30 bg-[#191D23]/40 hover:border-[#57707A]/80 hover:bg-[#57707A]/20"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg shrink-0 border", isSelected ? "bg-[#C5BAC4] text-[#191D23] border-[#C5BAC4]" : "bg-[#191D23] text-[#57707A] border-[#57707A]/40")}>
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className={cn("text-sm font-bold", isSelected ? "text-[#DEDCDC]" : "text-[#989DAA]")}>{mode.title}</h4>
                      <p className={cn("text-[10px] mt-1 leading-tight", isSelected ? "text-[#DEDCDC]/60" : "text-[#57707A]")}>{mode.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {selectedMode === "standard" && (
            <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#DEDCDC]">Batch Size</h3>
                <span className="text-xs font-bold text-[#191D23] bg-[#C5BAC4] px-2 py-0.5 rounded shadow-sm">{numImages} Images</span>
              </div>
              <Slider value={[numImages]} onValueChange={(v) => setNumImages(v[0])} min={1} max={10} step={1} className="py-1" />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Canvas & Generation */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-6 shadow-lg flex-1 flex flex-col space-y-6 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#B3FF00]/5 blur-[60px] rounded-full pointer-events-none" />

            <div className="space-y-2 relative z-10">
              <label className="text-sm font-bold text-[#DEDCDC]">Visual Aesthetic</label>
              <select
                value={selectedStyle}
                style={{ colorScheme: 'dark' }}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full p-3 bg-[#191D23] border border-[#57707A]/40 rounded-xl text-sm font-medium text-[#DEDCDC] focus:ring-2 ring-[#C5BAC4] outline-none cursor-pointer hover:bg-[#57707A]/20 transition-colors appearance-none"
              >
                {MARKETING_STYLES.map(style => (
                  <option className="bg-[#2A2F38]" key={style.id} value={style.id}>{style.label}</option>
                ))}
              </select>
            </div>

            {/* AI Engine selector */}
            <div className="space-y-2 relative z-10">
              <label className="text-sm font-bold text-[#DEDCDC]">AI Engine</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: "nb2", label: "Nano Banana 2", badge: "default" },
                  { id: "gpt-image-2-text-to-image", label: "GPT Image 2 · T2I", badge: "new" },
                  { id: "gpt-image-2-image-to-image", label: "GPT Image 2 · I2I", badge: "new" },
                  { id: "z-image", label: "Z-Image", badge: "new" },
                ] as const).map((engine) => (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => setSelectedImageEngine(engine.id)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all",
                      selectedImageEngine === engine.id
                        ? "bg-[#C5BAC4]/15 border-[#C5BAC4]/50 text-[#C5BAC4] shadow-sm"
                        : "bg-[#191D23] border-[#57707A]/30 text-[#57707A] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/30"
                    )}
                  >
                    {engine.label}
                    {engine.badge === "new" && (
                      <span className="text-[8px] font-black bg-[#B3FF00] text-[#191D23] px-1 py-0.5 rounded uppercase tracking-wide leading-none">NEW</span>
                    )}
                  </button>
                ))}
              </div>
              {selectedImageEngine === "gpt-image-2-image-to-image" && (
                <p className="text-[10px] text-[#989DAA] leading-relaxed mt-1">
                  GPT Image 2 · I2I transforms the inspiration images you add below, guided by your prompt.
                </p>
              )}
              {selectedImageEngine === "gpt-image-2-text-to-image" && (
                <p className="text-[10px] text-[#989DAA] leading-relaxed mt-1">
                  GPT Image 2 · T2I is text-only — it generates purely from your prompt and cannot use an inspiration image.
                </p>
              )}
              {/* Non-blocking: an inspiration image is attached but the engine can't use it. */}
              {showEngineIncompatibleGuidance && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col gap-2 mt-2 bg-[#B3FF00]/8 border border-[#B3FF00]/30 rounded-xl px-3 py-2.5"
                >
                  <p className="text-[11px] text-[#DEDCDC] leading-relaxed">
                    You added an inspiration image, but <b>GPT Image 2 · T2I is text-only</b> and can&apos;t use it. Switch to a reference-capable engine (Nano Banana 2 or GPT Image 2 · I2I) to use your image, or remove it to generate from your prompt alone.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedImageEngine("nb2")}
                    className="self-start text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#C5BAC4] text-[#191D23] hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2A2F38]"
                  >
                    Switch to Nano Banana 2
                  </button>
                </div>
              )}
            </div>

            {/* Output format / aspect ratio */}
            <div className="space-y-2 relative z-10">
              <label className="text-sm font-bold text-[#DEDCDC]">Output Format</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: "1:1", label: "1:1", hint: "Square" },
                  { id: "4:5", label: "4:5", hint: "Portrait" },
                  { id: "3:4", label: "3:4", hint: "Portrait" },
                  { id: "9:16", label: "9:16", hint: "Story / Reel" },
                  { id: "16:9", label: "16:9", hint: "Landscape" },
                  { id: "3:2", label: "3:2", hint: "Landscape" },
                  { id: "2:3", label: "2:3", hint: "Portrait" },
                ] as const).map((ar) => (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setSelectedAspect(ar.id)}
                    title={ar.hint}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all",
                      selectedAspect === ar.id
                        ? "bg-[#C5BAC4]/15 border-[#C5BAC4]/50 text-[#C5BAC4] shadow-sm"
                        : "bg-[#191D23] border-[#57707A]/30 text-[#57707A] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/30"
                    )}
                  >
                    {ar.label}
                    <span className="text-[8px] font-medium text-[#57707A] uppercase tracking-wide leading-none hidden sm:inline">{ar.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Typography specification — off by default, AI chooses freely */}
            <div className="relative z-10">
              <button
                onClick={() => { setShowTypographyInput(v => !v); if (showTypographyInput) setCustomTypography(""); }}
                className={cn(
                  "flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                  showTypographyInput
                    ? "border-[#C5BAC4]/50 text-[#C5BAC4] bg-[#C5BAC4]/10"
                    : "border-[#57707A]/40 text-[#57707A] hover:text-[#DEDCDC] hover:border-[#57707A]/70"
                )}
              >
                <span>🔤</span>
                {showTypographyInput ? "Typography: Custom" : "Typography: AI Chooses"}
              </button>
              {showTypographyInput && (
                <input
                  type="text"
                  value={customTypography}
                  onChange={(e) => setCustomTypography(e.target.value)}
                  placeholder='e.g. "Bold condensed sans-serif, Futura-style headline"'
                  className="mt-2 w-full p-3 bg-[#191D23] border border-[#57707A]/40 rounded-xl text-sm text-[#DEDCDC] placeholder:text-[#57707A] focus:ring-2 ring-[#C5BAC4] outline-none"
                />
              )}
            </div>

            <div className="space-y-2 relative z-10">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-[#DEDCDC]">Director's Prompt</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePromptHelp}
                  disabled={isHelpLoading}
                  className={cn("h-7 text-xs px-3 bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-[#DEDCDC] hover:border-[#C5BAC4] transition-colors rounded-lg", isHelpLoading && "animate-pulse")}
                >
                  {isHelpLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Wand2 className="w-3 h-3 mr-1.5" />}
                  {isHelpLoading ? "Writing..." : "AI Magic Writer"}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={selectedMode === 'product_drop' ? "Describe scene (e.g., 'on a sunny beach towel')..." : "Describe what you want to see..."}
                  className={cn("resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] h-28 focus-visible:ring-[#C5BAC4] pr-10 transition-all rounded-xl", isHelpLoading && "opacity-50")}
                  readOnly={isHelpLoading}
                />
                {isHelpLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles className="w-8 h-8 text-[#C5BAC4] animate-bounce opacity-50" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#989DAA] text-right">The AI Writer will automatically adapt your prompt to fit the <b className="text-[#DEDCDC]">{MARKETING_STYLES.find(s => s.id === selectedStyle)?.label}</b> style.</p>
            </div>

            {selectedStyle === "brand" && brandContext?.logoUrl && (
              <div className="flex items-start gap-2.5 bg-[#C5BAC4]/8 border border-[#C5BAC4]/20 rounded-xl px-4 py-3 relative z-10">
                <Info className="w-4 h-4 text-[#C5BAC4] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#C5BAC4]/80 leading-relaxed font-medium">
                  Your logo is passed to the AI as a reference. For cleanest results the logo should be on a transparent or white background in your Brand Profile. The AI will interpret it — use Magic Retouch after to correct any imperfections.
                </p>
              </div>
            )}

            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <label id="inspiration-label" className="text-sm font-bold text-[#DEDCDC]">
                    {activeConfig.requiresUpload
                      ? activeConfig.id === "product_drop"
                        ? "Product image"
                        : "Images to compose"
                      : "Add an inspiration image"}
                    {activeConfig.requiresUpload && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
                    {activeConfig.requiresUpload && <span className="sr-only"> (required)</span>}
                  </label>
                  <p id="inspiration-help" className="text-[11px] text-[#989DAA] mt-1 font-medium leading-relaxed max-w-xl">
                    {activeConfig.requiresUpload
                      ? activeConfig.id === "product_drop"
                        ? "Upload the product you want placed into a scene."
                        : "Upload the images you want composed together."
                      : "Optional — upload an existing design or choose one from your Content Grid. BlinkSpot can use its colors, composition, lighting, and overall visual direction as inspiration."}
                  </p>
                </div>
                <span className="text-xs text-[#989DAA] font-bold px-2 py-0.5 bg-[#191D23] rounded-md border border-[#57707A]/30 shrink-0 ml-3" aria-label={`${files.length + libraryUrls.length} of ${activeConfig.maxUploads} images added`}>{files.length + libraryUrls.length} / {activeConfig.maxUploads}</span>
              </div>

              {!activeConfig.requiresUpload && (
                <ul className="text-[10px] text-[#989DAA] leading-relaxed space-y-1 list-disc pl-4 marker:text-[#57707A]">
                  <li>Your image is a <b className="text-[#DEDCDC]">visual reference</b>, not an exact-copy instruction.</li>
                  <li>In the <b className="text-[#DEDCDC]">Director&apos;s Prompt</b> above, say what to keep and what to change.</li>
                  <li>Inspiration images need <b className="text-[#DEDCDC]">Nano Banana 2</b> or <b className="text-[#DEDCDC]">GPT Image 2 · I2I</b>. GPT Image 2 · T2I is text-only.</li>
                </ul>
              )}

              <div className="flex flex-wrap gap-4">
                {/* Uploaded file previews */}
                {previews.map((src, idx) => (
                  <div key={`file-${idx}`} className="relative w-24 h-24 rounded-xl border border-[#57707A]/40 overflow-hidden group shadow-sm bg-[#191D23]">
                    <img src={src} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={`Uploaded inspiration image ${idx + 1}`} />
                    {selectedMode === 'product_drop' && (
                      <div className="absolute inset-0 bg-black/40 pointer-events-none" style={{ backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px', zIndex: -1 }}></div>
                    )}
                    <button type="button" onClick={() => removeFile(idx)} aria-label={`Remove uploaded image ${idx + 1}`} className="absolute top-1.5 right-1.5 bg-red-500/90 backdrop-blur-sm text-white p-1 rounded-full opacity-90 hover:opacity-100 transition-all shadow-md hover:bg-red-500 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:opacity-100">
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}

                {/* Library-picked image previews */}
                {libraryUrls.map((src, idx) => (
                  <div key={`lib-${idx}`} className="relative w-24 h-24 rounded-xl border border-[#C5BAC4]/40 overflow-hidden group shadow-sm bg-[#191D23]">
                    <img src={src} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={`Content Grid inspiration image ${idx + 1}`} />
                    <div className="absolute bottom-1 left-1 bg-[#C5BAC4] text-[#191D23] text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none">Grid</div>
                    <button type="button" onClick={() => removeLibraryUrl(idx)} aria-label={`Remove Content Grid image ${idx + 1}`} className="absolute top-1.5 right-1.5 bg-red-500/90 backdrop-blur-sm text-white p-1 rounded-full opacity-90 hover:opacity-100 transition-all shadow-md hover:bg-red-500 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:opacity-100">
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}

                {/* Upload drop zone (keyboard-operable via react-dropzone root) */}
                {(files.length + libraryUrls.length) < activeConfig.maxUploads && (
                  <div
                    {...getRootProps({
                      role: "button",
                      "aria-label": activeConfig.requiresUpload ? "Upload an image" : "Upload an inspiration image",
                      "aria-describedby": "inspiration-help",
                    })}
                    className={cn(
                      "w-24 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2A2F38]",
                      isDragActive ? "border-[#C5BAC4] bg-[#C5BAC4]/10 text-[#C5BAC4] scale-105" : "border-[#57707A]/50 bg-[#191D23]/50 text-[#57707A] hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 hover:text-[#989DAA]"
                    )}
                  >
                    <input {...getInputProps()} />
                    <UploadCloud className="w-6 h-6 mb-1.5" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight px-1">
                      {isDragActive ? "Drop here" : "Upload image"}
                    </span>
                  </div>
                )}

                {/* Choose from Content Grid */}
                {(files.length + libraryUrls.length) < activeConfig.maxUploads && (
                  <button
                    type="button"
                    onClick={() => setIsLibraryOpen(true)}
                    aria-label="Choose an image from your Content Grid"
                    aria-describedby="inspiration-help"
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 text-[#57707A] hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 hover:text-[#989DAA] flex flex-col items-center justify-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2A2F38]"
                  >
                    <FolderOpen className="w-6 h-6 mb-1.5" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight px-1">Choose from Grid</span>
                  </button>
                )}
              </div>
              {selectedMode === 'product_drop' && <p className="text-[10px] text-[#B3FF00] font-bold mt-2 flex items-center gap-1.5 bg-[#B3FF00]/10 border border-[#B3FF00]/20 px-2 py-1.5 rounded-md w-fit"><CheckCircle className="w-3.5 h-3.5" /> Pro Tip: Use transparent PNGs for best results.</p>}
              {selectedStyle === 'brand' && !brandContext?.logoUrl && (
                <>
                  <p className="text-[10px] text-red-400 font-bold mt-2 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded-md w-fit">⚠️ No logo found in your Brand Profile — upload one in settings, or generate one below.</p>
                  {activeBrand && (
                    <LogoGenerator
                      brandId={activeBrand.id}
                      onSaved={(logoUrl) => setBrandContext({ ...(brandContext ?? {}), logoUrl })}
                    />
                  )}
                </>
              )}
            </div>

            <div className="mt-auto pt-6 border-t border-[#57707A]/30 flex justify-end relative z-10">
              <Button
                onClick={() => handleGenerate()}
                disabled={isGenerating || (activeConfig.requiresUpload && (files.length + libraryUrls.length) === 0) || isHelpLoading || (selectedStyle === 'brand' && !brandContext?.logoUrl)}
                className="bg-[#C5BAC4] hover:bg-white text-[#191D23] h-12 px-8 font-bold shadow-lg shadow-[#C5BAC4]/20 transition-all relative overflow-hidden rounded-xl disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="flex items-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    <span>Generating...</span>
                    <div className="absolute bottom-0 left-0 h-1 bg-black/20 animate-progress w-full origin-left"></div>
                  </div>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" /> Generate {selectedMode === 'standard' && numImages > 1 ? `${numImages} Images` : 'Image'}</>
                )}
              </Button>
            </div>
          </div>

          {/* PERSISTENT GENERATION STATUS — unified generation/billing/retry contract */}
          <ImageGenerationStatus status={genStatus} onRetry={() => handleGenerate({ retry: true })} />

          {/* RESULTS AREA */}
          {(isGenerating || generatedResults.length > 0) && (
            <div className="bg-[#191D23]/60 rounded-xl border border-[#57707A]/30 p-6 shadow-inner min-h-[300px] animate-in fade-in-50">
              <div className="flex items-center justify-between mb-5 border-b border-[#57707A]/20 pb-3">
                <h3 className="text-sm font-bold text-[#DEDCDC] uppercase tracking-wider flex items-center gap-2 font-display">
                  <ImageIcon className="w-4 h-4 text-[#C5BAC4]" /> Studio Results
                </h3>
                {generatedResults.length > 0 && !isGenerating && <span className="text-xs text-[#989DAA] font-bold bg-[#2A2F38] px-2 py-1 rounded-md border border-[#57707A]/30">{generatedResults.length} items saved to Grid</span>}
              </div>

              {isGenerating && generatedResults.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-[#57707A] gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-[#2A2F38] border-t-[#C5BAC4] animate-spin shadow-[0_0_15px_rgba(197,186,196,0.3)]"></div>
                    <Sparkles className="w-6 h-6 text-[#C5BAC4] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm font-bold animate-pulse text-[#989DAA]">Nano Banana is painting your pixels...</p>
                </div>
              ) : (
                <div className={cn("grid gap-5", (selectedMode === 'grid' || selectedMode === 'organic_blend') ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4")}>
                  {generatedResults.map((result, idx) => (
                    <div
                      key={result.id + idx}
                      onClick={() => openModal(result)}
                      className="relative aspect-square rounded-xl overflow-hidden border-2 border-[#57707A]/30 hover:border-[#C5BAC4] transition-all shadow-md group cursor-pointer bg-[#191D23]"
                    >
                      <img src={result.url} alt={`Generated ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100" loading="lazy" />

                      {/* Brand logo overlay — always shows the real logo regardless of what the AI drew */}
                      {brandContext?.logoUrl && (
                        <div className="absolute bottom-2 right-2 z-20 bg-white rounded-md shadow-lg p-1 max-w-[40%]">
                          <img
                            src={brandContext.logoUrl}
                            alt="Brand logo"
                            className="h-6 w-auto max-w-full object-contain"
                          />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-all flex flex-col items-center justify-end pb-4 opacity-0 group-hover:opacity-100">
                        <div className="bg-[#191D23]/80 backdrop-blur-md border border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#C5BAC4] hover:text-[#191D23] hover:border-[#C5BAC4] text-xs font-bold px-4 py-2 rounded-full shadow-xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                          <Sparkles className="w-3.5 h-3.5" /> Refine & Edit
                        </div>
                      </div>
                    </div>
                  ))}
                  {isGenerating && Array.from({ length: numImages }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="aspect-square rounded-xl bg-[#2A2F38] border border-[#57707A]/20 animate-pulse relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#57707A]/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>}

      {/* ✨ FULLY FUNCTIONAL REFINEMENT MODAL ✨ */}
      <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedResult(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-[1200px] p-0 overflow-hidden bg-[#191D23] h-[90vh] md:h-[85vh] max-h-[900px] border border-[#57707A]/40 shadow-2xl shadow-black/50 rounded-2xl flex flex-col md:flex-row">
          {selectedResult && (
            <>
              {/* LEFT: Controls Panel */}
              <div className="w-full md:w-[380px] border-b md:border-b-0 md:border-r border-[#57707A]/30 bg-[#2A2F38] flex flex-col shrink-0 order-2 md:order-1 h-[55%] md:h-full z-10 shadow-[5px_0_15px_rgba(0,0,0,0.2)] relative">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col custom-scrollbar">
                  <DialogHeader className="mb-8 border-b border-[#57707A]/20 pb-4">
                    <DialogTitle className="text-xl font-heading flex items-center gap-2 text-[#DEDCDC]">
                      <Sparkles className="w-5 h-5 text-[#C5BAC4]" /> Refinement Hub
                    </DialogTitle>
                    <p className="text-xs text-[#989DAA] mt-1.5 font-medium">Perfect your creation with advanced AI tools.</p>
                  </DialogHeader>

                  <Tabs value={refinementTab} onValueChange={(v: any) => setRefinementTab(v)} className="w-full flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 mb-8 bg-[#191D23] border border-[#57707A]/30 rounded-xl p-1 h-auto">
                      <TabsTrigger value="fresh" className="text-xs font-bold py-2.5 gap-1.5 rounded-lg data-[state=active]:bg-[#57707A]/80 data-[state=active]:text-[#DEDCDC] text-[#989DAA] data-[state=active]:shadow-sm transition-all"><RefreshCw className="w-3.5 h-3.5" /> Fresh Take</TabsTrigger>
                      <TabsTrigger value="retouch" className="text-xs font-bold py-2.5 gap-1.5 rounded-lg data-[state=active]:bg-[#57707A]/80 data-[state=active]:text-[#DEDCDC] text-[#989DAA] data-[state=active]:shadow-sm transition-all"><Eraser className="w-3.5 h-3.5" /> Magic Retouch</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 flex flex-col">
                      {refinementTab === "fresh" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                          <div className="bg-[#191D23]/60 border border-[#C5BAC4]/20 p-4 rounded-xl">
                            <strong className="text-[#C5BAC4] block mb-1 text-sm font-bold flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Remix Concept</strong>
                            <p className="text-xs text-[#989DAA] leading-relaxed">Edit your prompt below to generate a new variation using this image as a reference point.</p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest">Refined Prompt</label>
                            <Textarea
                              value={modalPrompt}
                              onChange={(e) => setModalPrompt(e.target.value)}
                              className="resize-none h-36 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                            />
                          </div>
                          <div className="pt-2">
                            <Button
                              onClick={() => handleRefine("fresh")}
                              disabled={isRefining || !modalPrompt.trim()}
                              className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                            >
                              {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              {isRefining ? "Generating Variation..." : "Generate Variation"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {refinementTab === "retouch" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                          <div className="bg-[#191D23]/60 border border-[#B3FF00]/20 p-4 rounded-xl">
                            <strong className="text-[#B3FF00] block mb-1 text-sm font-bold flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Provide Instructions</strong>
                            <p className="text-xs text-[#989DAA] leading-relaxed">Tell the AI exactly what you want changed in the image (e.g., "change the sofa to red" or "remove the vase").</p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest">Instructions</label>
                            <Textarea
                              value={retouchPrompt}
                              onChange={(e) => setRetouchPrompt(e.target.value)}
                              placeholder="E.g., Change the background to a sunset..."
                              className="resize-none text-sm h-36 bg-[#191D23] rounded-xl border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#B3FF00] shadow-inner custom-scrollbar"
                            />
                          </div>
                          <div className="pt-2">
                            <Button
                              onClick={() => handleRefine("retouch")}
                              disabled={isRefining || !retouchPrompt.trim()}
                              className="w-full bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#B3FF00]/10 transition-all border-none"
                            >
                              {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#191D23]" /> : <Wand2 className="w-4 h-4 mr-2 text-[#191D23]" />}
                              {isRefining ? "Applying Magic..." : "Apply Magic Retouch"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Tabs>
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t border-[#57707A]/30 flex gap-3 bg-[#191D23]/40 shrink-0">
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-[#DEDCDC] font-bold bg-[#2A2F38] border-[#57707A]/50 hover:bg-[#57707A]/30 hover:border-[#C5BAC4] transition-colors" onClick={() => window.open(selectedResult?.url, '_blank')}>
                    <Download className="w-4 h-4 mr-2 text-[#C5BAC4]" /> Save
                  </Button>
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-[#DEDCDC] font-bold bg-[#2A2F38] border-[#57707A]/50 hover:bg-[#57707A]/30 hover:border-[#C5BAC4] transition-colors" onClick={() => toast.info('Share links coming soon.')}>
                    <Share2 className="w-4 h-4 mr-2 text-[#C5BAC4]" /> Share
                  </Button>
                </div>
              </div>

              {/* RIGHT: Image View */}
              <div className="flex-1 bg-[#0A0A0A] relative group overflow-hidden order-1 md:order-2 min-h-[45%] md:min-h-0 md:rounded-r-2xl flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                <img
                  src={selectedResult?.url}
                  className="max-w-full max-h-full object-contain relative z-10 drop-shadow-2xl"
                  alt="Selected result"
                />

                {/* Brand logo overlay on full-size modal view */}
                {brandContext?.logoUrl && (
                  <div className="absolute bottom-4 right-4 z-30 bg-white rounded-lg shadow-xl p-1.5 max-w-[30%]">
                    <img
                      src={brandContext.logoUrl}
                      alt="Brand logo"
                      className="h-8 w-auto max-w-full object-contain"
                    />
                  </div>
                )}

                {/* Prompt overlay on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-8 pt-24 text-white opacity-0 group-hover:opacity-100 transition-opacity delay-100 pointer-events-none z-20">
                  <div className="max-w-3xl mx-auto">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-[#C5BAC4] flex items-center gap-2"><Sparkles className="w-3 h-3" /> Original Prompt</p>
                    <p className="text-sm leading-relaxed line-clamp-4 text-[#DEDCDC] font-medium bg-black/40 p-4 rounded-xl border border-white/10 backdrop-blur-sm">{selectedResult?.prompt}</p>
                  </div>
                </div>

                {/* Close button for mobile */}
                <button onClick={() => setSelectedResult(null)} className="md:hidden absolute top-4 right-4 z-30 p-2 bg-black/50 backdrop-blur-md text-white rounded-full border border-white/20">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AssetSelectionModal
        open={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelect={handleLibrarySelect}
      />
    </div >
  );
}
