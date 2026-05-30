"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Save,
  Sparkles,
  Send,
  CheckCircle,
  XCircle,
  Pencil,
  Upload,
  X,
  ZoomIn,
  Trash2,
  Zap,
  Wand2,
  Palette,
  LayoutGrid,
  Smartphone,
  MonitorPlay,
  Music,
  Youtube,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Pin,
  AtSign,
  Cloud,
  FolderOpen,
} from "lucide-react";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import { InstagramTroubleshootModal } from "@/components/publishing/InstagramTroubleshootModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { triggerWorkflow } from "@/lib/workflows";
import type { Content, ContentStatus } from "@/types/database";

import { cn } from "@/lib/utils";

// ✨ Omni-Publishing State Types
interface PlatformSettings {
  enabled: boolean;
  format: 'post' | 'story' | 'short' | 'reel' | 'feed' | 'standard';
}

type PublishSettings = {
  [key: string]: PlatformSettings;
};

const parsePublishSettings = (data: any): PublishSettings => {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      // Legacy support: if it was an array of strings, convert it to the new object format
      if (Array.isArray(parsed)) {
        const newSettings: PublishSettings = {};
        parsed.forEach(platform => {
          if (platform === 'tiktok') newSettings.tiktok = { enabled: true, format: 'post' };
          if (platform === 'instagram') newSettings.instagram = { enabled: true, format: 'reel' };
          if (platform === 'youtube') newSettings.youtube = { enabled: true, format: 'short' };
        });
        return newSettings;
      }
      return parsed || {};
    } catch {
      return {};
    }
  }
  return data || {};
};

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

type GenerationMode = "generate" | "style_transfer";

const STYLE_OPTIONS = [
  { value: "realistic", label: "Hyper-Realistic Photo", promptAddon: "Hyper-realistic photograph, highly detailed, 8k resolution. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
  { value: "cinematic", label: "Cinematic Lighting", promptAddon: "Cinematic lighting, dramatic shadows, movie still, moody aesthetic. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
  { value: "3d_render", label: "3D Product Render", promptAddon: "Abstract 3D render, Cinema4D, Octane render, smooth glossy textures. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
  { value: "studio", label: "Clean Studio Shot", promptAddon: "Professional studio lighting, clean infinite background, high-end commercial product photography. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
  { value: "illustrative", label: "Modern Illustration", promptAddon: "Modern illustration, vibrant colors, flat vector aesthetic. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
  { value: "2d_flat", label: "2D Flat Design", promptAddon: "2D flat design, minimalistic, clean lines, corporate vector. NO TEXT, NO WORDS, NO TYPOGRAPHY, NO WATERMARKS in the image." },
];

export default function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [content, setContent] = useState<Content | null>(null);
  const [isProcessing, setIsProcessing] = useState(() => searchParams.get("processing") === "true");
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [brandContext, setBrandContext] = useState<any>(null);

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);

  // ✨ The new Omni-Publishing State
  const [publishSettings, setPublishSettings] = useState<PublishSettings>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [caption, setCaption] = useState("");
  const [captionShort, setCaptionShort] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [callToAction, setCallToAction] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [igTroubleshootOpen, setIgTroubleshootOpen] = useState(false);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const [refLibraryUrls, setRefLibraryUrls] = useState<string[]>([]);
  const [isRefLibraryOpen, setIsRefLibraryOpen] = useState(false);

  const [generationMode, setGenerationMode] = useState<GenerationMode>("generate");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const refInputRef = useRef<HTMLInputElement>(null);

  const [isHelpLoading, setIsHelpLoading] = useState(false);
  // ✨ AI Caption State
  const [generatingCaption, setGeneratingCaption] = useState<"long" | "short" | null>(null);

  // ✨ AI Caption Generator Function
  // ✨ AI Caption Generator Function
  async function handleGenerateCaption(length: "long" | "short") {
    if (!content) return;
    setGeneratingCaption(length);
    try {
      const res = await fetch("/api/content/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId, // ✨ SEND THE CLIENT ID FOR BILLING
          contentId: content.id,
          imageUrl: parseArray(content.image_urls)[0] || null,
          lengthPreference: length,
          brandContext: brandContext
        }),
      });

      const data = await res.json();

      // ✨ IF THEY RUN OUT OF CREDITS, THIS CATCHES THE 402 ERROR
      if (!res.ok) throw new Error(data.error || "Failed to generate caption");

      // ✨ FIXED: Correctly map "caption_long" from the backend!
      if (length === "long") {
        setCaption(data.caption_long || "");
      } else {
        setCaptionShort(data.caption_short || "");
      }

      if (data.hashtags) setHashtags(data.hashtags);
      if (data.call_to_action) setCallToAction(data.call_to_action);

    } catch (err: any) {
      alert(`Caption generation failed: ${err.message}`);
    } finally {
      setGeneratingCaption(null);
    }
  }

  useEffect(() => {
    async function fetchData() {
      if (!clientId) return;
      try {
        const [contentRes, clientRes] = await Promise.all([
          supabase.from("content").select("*").eq("id", id).maybeSingle(),
          supabase.from("clients").select("industry").eq("id", clientId).single(),
        ]);

        const item = contentRes.data as any;
        if (item) {
          setContent(item);
          setCaption(item.caption || "");
          setCaptionShort(item.caption_short || "");
          setHashtags(item.hashtags || "");
          setCallToAction(item.call_to_action || "");
          setPublishSettings(parsePublishSettings(item.target_platforms));
        }

        // Use activeBrand if set, otherwise fall back to the brand_id stored on the content row
        const brandId = activeBrand?.id || item?.brand_id;
        if (brandId) {
          const [brandRes, socialRes] = await Promise.all([
            supabase.from("brand_profiles")
              .select("brand_name, website_url, description, image_style, brand_voice, logo_url, primary_color, secondary_color, primary_font")
              .eq("id", brandId)
              .maybeSingle(),
            supabase.from("social_accounts").select("platform").eq("brand_id", brandId).eq("is_active", true),
          ]);

          if (brandRes.data?.logo_url) setBrandLogo(brandRes.data.logo_url);
          if (socialRes.data) {
            setConnectedPlatforms(Array.from(new Set(socialRes.data.map((s: any) => s.platform))));
          }

          setBrandContext({
            name: brandRes.data?.brand_name,
            industry: clientRes.data?.industry,
            description: brandRes.data?.description,
            imageStyle: brandRes.data?.image_style,
            brandVoice: brandRes.data?.brand_voice,
            logoUrl: brandRes.data?.logo_url,
            websiteUrl: brandRes.data?.website_url,
            primaryColor: brandRes.data?.primary_color,
            secondaryColor: brandRes.data?.secondary_color,
            primaryFont: brandRes.data?.primary_font,
          });
        }

      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, clientId, activeBrand?.id]);

  useEffect(() => {
    if (!isProcessing || !id) return;

    const channel = supabase
      .channel(`content-processing-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content", filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as any;
          const newUrls = parseArray(updated.image_urls);
          if (newUrls.length > 0) {
            setContent((prev) => prev ? { ...prev, ...updated } as Content : null);
            setIsProcessing(false);
            router.replace(`/dashboard/content/${id}`, { scroll: false });
          }
        }
      )
      .subscribe();

    // Fallback: after 90s try a manual refetch; if the image is already there show it,
    // otherwise surface a "still processing" state so the user isn't stuck forever.
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from("content").select("*").eq("id", id).maybeSingle();
      if (data && parseArray((data as any).image_urls).length > 0) {
        setContent(data as unknown as Content);
        setIsProcessing(false);
        router.replace(`/dashboard/content/${id}`, { scroll: false });
      } else {
        setIsProcessing(false);
        setProcessingTimedOut(true);
      }
    }, 90_000);

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [isProcessing, id]);

  // ✨ Omni-Publishing Toggles
  const togglePlatform = (platform: string, defaultFormat: any) => {
    setPublishSettings(prev => {
      const isCurrentlyEnabled = prev[platform]?.enabled;
      return {
        ...prev,
        [platform]: {
          enabled: !isCurrentlyEnabled,
          format: prev[platform]?.format || defaultFormat
        }
      };
    });
  };

  const setPlatformFormat = (platform: string, format: string) => {
    setPublishSettings(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        format: format as any
      }
    }));
  };

  const isAnyPlatformSelected = Object.values(publishSettings).some(p => p.enabled);

  const handlePromptHelp = async () => {
    if (isHelpLoading) return;
    setIsHelpLoading(true);

    try {
      const activeStyleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle);
      // route.ts reads style?.id — map .value to the blueprint key it understands
      const styleForHelper = activeStyleObj ? { id: activeStyleObj.value, ...activeStyleObj } : null;

      const res = await fetch("/api/ai/prompt-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt,
          brandContext: brandContext,
          useBrand: true,
          mode: generationMode,
          style: styleForHelper
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch suggestion");
      if (data.suggestion) setCustomPrompt(data.suggestion);
    } catch (err: any) {
      alert(`Prompt helper failed: ${err.message}`);
    } finally {
      setIsHelpLoading(false);
    }
  };

  // Helper to auto-save edits before executing an action
  async function autoSaveEdits() {
    if (!content) return false;
    const { error } = await supabase
      .from("content")
      .update({
        caption,
        caption_short: captionShort,
        hashtags,
        call_to_action: callToAction,
        target_platforms: publishSettings // ✨ Save the complex object
      } as any)
      .eq("id", content.id);
    return !error;
  }

  async function handleSave() {
    setSaving(true);
    const success = await autoSaveEdits();
    setSaving(false);
    if (success && content) {
      setContent({ ...content, caption, caption_short: captionShort, hashtags, call_to_action: callToAction, target_platforms: JSON.stringify(publishSettings) } as any);
    }
  }

  async function handleDelete() {
    if (!content) return;
    setDeleting(true);
    try {
      await supabase.from("content").delete().eq("id", content.id);
      router.refresh();
      router.push("/dashboard/content");
    } catch (err) {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }


  async function handleApproveAndPublishNow() {
    if (!content) return;

    if (!isAnyPlatformSelected) {
      alert("Please select at least one platform to publish to!");
      return;
    }

    setActionLoading(true);
    try {
      await autoSaveEdits();

      await supabase
        .from("content")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: "admin",
          scheduled_at: null,
        } as Record<string, unknown>)
        .eq("id", content.id);

      const res = await fetch("/api/social-posts/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: content.id,
          clientId: clientId!,
          scheduledAt: null,
          publishSettings: publishSettings // Pass to backend scheduler
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.pfmRaw ? `\n\nPostForMe raw: ${JSON.stringify(data.pfmRaw)}` : "";
        throw new Error((data.error || "Publish failed") + detail);
      }

      setContent((prev) =>
        prev
          ? {
            ...prev,
            status: "posted" as ContentStatus,
            scheduled_at: null as any,
          }
          : null
      );
      alert("Post sent to PostForMe and queued for Instagram. Note: if the Instagram account has any Meta restrictions, posts may not appear — check Account Status in Instagram Settings if the post doesn't show within 5 minutes.");
    } catch (err: any) {
      alert(`Failed to publish: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }


  async function handleCancelSchedule() {
    if (!content) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("content")
        .update({ scheduled_at: null } as Record<string, unknown>)
        .eq("id", content.id);
      if (error) throw error;
      setContent((prev) =>
        prev ? { ...prev, scheduled_at: null as any } : null
      );
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }

  function handleRefFilesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    addRefFiles(Array.from(e.target.files || []));
    if (e.target) e.target.value = "";
  }

  function handleRefFilesDrop(e: React.DragEvent) {
    e.preventDefault();
    addRefFiles(
      Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      )
    );
  }

  function addRefFiles(newFiles: File[]) {
    const maxFiles = 4;
    const usedSlots = refFiles.length;
    const remainingSlots = maxFiles - usedSlots;
    if (remainingSlots <= 0)
      return alert(`Maximum ${maxFiles} reference images allowed for this mode.`);

    let validFiles = newFiles.filter((f) => f.size <= 30 * 1024 * 1024);
    if (validFiles.length < newFiles.length)
      alert("Some files were skipped because they exceed 30MB.");
    if (validFiles.length > remainingSlots)
      validFiles = validFiles.slice(0, remainingSlots);

    setRefFiles((prev) => [...prev, ...validFiles]);
    validFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setRefPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  }

  function removeRefFile(index: number) {
    setRefFiles((prev) => prev.filter((_, i) => i !== index));
    setRefPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function removeRefLibraryUrl(index: number) {
    setRefLibraryUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRefLibrarySelect(url: string) {
    if (!refLibraryUrls.includes(url)) {
      setRefLibraryUrls((prev) => [...prev, url]);
    }
    setIsRefLibraryOpen(false);
  }

  async function handleGenerateImage() {
    if (!content) return;

    setImageModalOpen(false);
    setGeneratingImage(true);

    const activeStyleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle);
    let finalTopic = customPrompt.trim() || captionShort || caption?.substring(0, 60) || "Create a professional image";
    const displayImage = parseArray(content.image_urls)[0];

    if (activeStyleObj?.promptAddon) {
      finalTopic = `${finalTopic}. ${activeStyleObj.promptAddon}`;
    }

    if (brandContext?.description) {
      finalTopic = `${finalTopic}. BRAND CONTEXT: We are ${brandContext.name}, operating in the ${brandContext.industry} industry. Product info: ${brandContext.description}`;
    }

    if (generationMode === "style_transfer" && brandContext?.name) {
      finalTopic = `${finalTopic}. BRAND LOGO REPLACEMENT (CRITICAL): The reference image may contain an existing logo, wordmark, or brand name that belongs to a different brand. You MUST remove it completely and replace it with "${brandContext.name}" branding — render the exact text "${brandContext.name}" in a clean sans-serif in the same position. If the reference image has a website URL, replace it with "${brandContext.websiteUrl || brandContext.name.toLowerCase().replace(/\s/g, "") + ".com"}". Never preserve, copy, or display logos or brand text from the reference image.`;
    }

    try {
      await supabase
        .from("content")
        .update({ image_prompt_used: finalTopic })
        .eq("id", content.id);

      let uploadedUrls: string[] = [];
      for (const file of refFiles) {
        const ext = file.name.split(".").pop() || "png";
        const filePath = `references/${clientId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error } = await supabase.storage.from("assets").upload(filePath, file);
        if (!error) {
          uploadedUrls.push(supabase.storage.from("assets").getPublicUrl(filePath).data.publicUrl);
        }
      }

      // Library-picked images are already on CDN — merge directly, no upload needed
      const allReferenceUrls = [...uploadedUrls, ...refLibraryUrls];

      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId!,
        post_id: content.id,
        topic: finalTopic,
        content_type: content.content_type,
        mode: generationMode,
        reference_image_urls: allReferenceUrls,
        logo_url: brandLogo || null,
        style: selectedStyle,
        is_sync: true
      });

      let newUrls: string[] = [];
      if (response && Array.isArray(response.imageUrls)) {
        newUrls = response.imageUrls as string[];
      } else if (response && response.imageUrls) {
        newUrls = response.imageUrls as string[];
      }

      if (newUrls.length === 0) throw new Error("No images were returned by the AI generator.");

      const { data: updatedContent, error: updateError } = await supabase
        .from("content")
        .update({
          image_urls: newUrls,
          updated_at: new Date().toISOString()
        })
        .eq("id", content.id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (updatedContent) {
        setContent(updatedContent as unknown as Content);
      }

      setRefFiles([]);
      setRefPreviews([]);
      setRefLibraryUrls([]);
      setCustomPrompt("");
      setGenerationMode("generate");

    } catch (err: any) {
      console.error(err);
      alert(`Generation failed: ${err.message || "Unknown error"}`);
    } finally {
      setGeneratingImage(false);
    }
  }

  function openImageGenerationModal() {
    setRefFiles([]);
    setRefPreviews([]);
    setCustomPrompt("");
    setGenerationMode("generate");
    setImageModalOpen(true);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );
  if (!content)
    return (
      <div className="text-center py-32">
        <p className="text-[#989DAA] font-bold text-lg">Content not found</p>
        <Button
          variant="ghost"
          className="mt-4 text-[#57707A] hover:text-[#DEDCDC] hover:bg-[#2A2F38]"
          onClick={() => router.push("/dashboard/content")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to content
        </Button>
      </div>
    );

  const displayImage = parseArray(content.image_urls)[0];

  const isVideo =
    displayImage &&
    (displayImage.toLowerCase().includes(".mp4") ||
      displayImage.toLowerCase().includes(".mov") ||
      displayImage.toLowerCase().includes(".webm"));

  const isGenerationDisabled = generatingImage || (generationMode === "style_transfer" && refFiles.length === 0 && refLibraryUrls.length === 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <button
        onClick={() => router.push("/dashboard/content")}
        className="flex items-center gap-1.5 text-sm font-bold text-[#57707A] hover:text-[#C5BAC4] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to content
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg overflow-hidden relative">
            <div className="relative h-[400px] md:h-[550px] w-full bg-[#0F1115] flex items-center justify-center overflow-hidden shadow-inner">
              {(isProcessing || processingTimedOut) && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#191D23]/85 backdrop-blur-md gap-4 animate-in fade-in">
                  {processingTimedOut ? (
                    <>
                      <div className="p-4 bg-[#2A2F38] border border-[#57707A]/40 rounded-2xl shadow-xl flex flex-col items-center gap-3 max-w-[260px] text-center">
                        <p className="text-sm font-bold text-[#DEDCDC]">Still processing...</p>
                        <p className="text-xs text-[#989DAA] leading-relaxed">The AI is taking longer than usual. Your edit is still running in the background.</p>
                        <Button
                          size="sm"
                          onClick={async () => {
                            setProcessingTimedOut(false);
                            const { data } = await supabase.from("content").select("*").eq("id", id).maybeSingle();
                            if (data) setContent(data as unknown as Content);
                          }}
                          className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-9 rounded-xl text-xs"
                        >
                          Check Now
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-xl bg-[#C5BAC4]/20 animate-pulse"></div>
                        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4] relative z-10" />
                      </div>
                      <p className="text-sm font-bold text-[#DEDCDC] tracking-wider uppercase animate-pulse">
                        Applying your edits...
                      </p>
                      <p className="text-xs text-[#989DAA]">Hang tight — AI is processing your changes</p>
                    </>
                  )}
                </div>
              )}
              {generatingImage ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#191D23]/80 backdrop-blur-md z-20 gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl bg-[#C5BAC4]/20 animate-pulse"></div>
                    <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4] relative z-10" />
                  </div>
                  <p className="text-sm font-bold text-[#DEDCDC] tracking-wider uppercase animate-pulse">
                    Painting your image...
                  </p>
                </div>
              ) : displayImage ? (
                <>
                  {isVideo ? (
                    <video
                      src={`${displayImage}#t=0.1`}
                      className="absolute inset-0 w-full h-full object-cover blur-[40px] opacity-30 scale-110 pointer-events-none"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={displayImage}
                      className="absolute inset-0 w-full h-full object-cover blur-[40px] opacity-30 scale-110 pointer-events-none"
                      alt=""
                    />
                  )}
                  <div className="relative z-10 h-full w-full group flex items-center justify-center p-4">
                    {isVideo ? (
                      <video
                        src={displayImage}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-contain drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div
                        className="relative h-full w-full flex items-center justify-center cursor-zoom-in"
                        onClick={() => setPreviewImageUrl(displayImage)}
                      >
                        <img
                          src={displayImage}
                          alt="Generated Content"
                          className="h-full w-full object-contain drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                          <div className="bg-[#191D23]/90 border border-[#57707A]/50 text-[#DEDCDC] px-5 py-2.5 rounded-full flex items-center gap-2 font-bold text-xs uppercase tracking-wider shadow-xl backdrop-blur-md">
                            <ZoomIn className="h-4 w-4 text-[#C5BAC4]" /> Click to Enlarge
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-[#191D23] relative z-10">
                  <ImageIcon className="h-12 w-12 text-[#57707A]" />
                  <p className="text-sm font-bold text-[#57707A] uppercase tracking-wider">No media yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg p-6 md:p-8 space-y-6 relative overflow-hidden">
            {/* Subtle bg glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#C5BAC4]/5 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

            {/* ✨ OMNI-PUBLISHING SELECTOR */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4 border-b border-[#57707A]/20 pb-3">
                <label className="block text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display">
                  <Send className="w-4 h-4 text-[#C5BAC4]" /> Publish Destinations
                </label>
                <span className="text-[10px] bg-[#C5BAC4]/10 text-[#C5BAC4] px-2.5 py-1 rounded-md border border-[#C5BAC4]/20 font-bold uppercase tracking-wide">
                  Powered by PostForMe
                </span>
              </div>

              {connectedPlatforms.length === 0 ? (
                <div className="p-4 bg-[#191D23]/50 rounded-xl text-sm text-[#989DAA] border border-[#57707A]/30 font-medium">
                  No social accounts connected. Go to <a href="/dashboard/settings" className="text-[#C5BAC4] font-bold hover:text-white hover:underline transition-colors">Settings</a> to connect accounts.
                </div>
              ) : (
                <div className="flex flex-col gap-3">

                  {/* TikTok Controls */}
                  {connectedPlatforms.includes('tiktok') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.tiktok?.enabled ? "border-[#C5BAC4]/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}>
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20"
                        onClick={() => togglePlatform('tiktok', 'post')}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-black border border-gray-800 text-white rounded-lg shadow-inner"><Music className="w-4 h-4" /></div>
                          <div>
                            <p className={cn("text-sm font-bold", publishSettings.tiktok?.enabled ? "text-white" : "text-[#989DAA]")}>TikTok</p>
                          </div>
                        </div>
                        <input type="checkbox" checked={publishSettings.tiktok?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] text-[#C5BAC4] focus:ring-[#C5BAC4] pointer-events-none" />
                      </div>

                      {publishSettings.tiktok?.enabled && (
                        <div className="bg-[#2A2F38]/50 p-3 border-t border-[#57707A]/30 flex gap-4 pl-14 animate-in slide-in-from-top-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.tiktok?.format === 'post'} onChange={() => setPlatformFormat('tiktok', 'post')} className="text-[#C5BAC4] bg-[#191D23] border-[#57707A]/50 focus:ring-[#C5BAC4]" />
                            <Smartphone className={cn("w-4 h-4", publishSettings.tiktok?.format === 'post' ? "text-[#C5BAC4]" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.tiktok?.format === 'post' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Normal Post</span>
                          </label>
                          {/* TODO: Re-enable Story format once upgraded from PostForMe Quickstart API tier
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.tiktok?.format === 'story'} onChange={() => setPlatformFormat('tiktok', 'story')} className="text-[#C5BAC4] bg-[#191D23] border-[#57707A]/50 focus:ring-[#C5BAC4]" />
                            <CirclePlay className={cn("w-4 h-4", publishSettings.tiktok?.format === 'story' ? "text-[#C5BAC4]" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.tiktok?.format === 'story' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Story</span>
                          </label>
                          */}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instagram Controls */}
                  {connectedPlatforms.includes('instagram') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.instagram?.enabled ? "border-pink-500/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}>
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20"
                        onClick={() => togglePlatform('instagram', isVideo ? 'reel' : 'feed')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.instagram?.enabled ? "bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-600" : "bg-[#57707A]")}><Instagram className="w-4 h-4" /></div>
                          <div>
                            <p className={cn("text-sm font-bold", publishSettings.instagram?.enabled ? "text-white" : "text-[#989DAA]")}>Instagram</p>
                          </div>
                        </div>
                        <input type="checkbox" checked={publishSettings.instagram?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] text-pink-500 focus:ring-pink-500 pointer-events-none" />
                      </div>

                      {publishSettings.instagram?.enabled && (
                        <div className="bg-[#2A2F38]/50 p-3 border-t border-[#57707A]/30 flex flex-wrap gap-4 pl-14 animate-in slide-in-from-top-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={true} onChange={() => setPlatformFormat('instagram', 'feed')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
                            <Smartphone className="w-4 h-4 text-pink-500" />
                            <span className="text-xs font-bold text-[#DEDCDC]">Normal Post</span>
                          </label>
                          {/* TODO: Re-enable Reel and Story formats once upgraded from PostForMe Quickstart API tier
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.instagram?.format === 'reel'} onChange={() => setPlatformFormat('instagram', 'reel')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
                            <Smartphone className={cn("w-4 h-4", publishSettings.instagram?.format === 'reel' ? "text-pink-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.instagram?.format === 'reel' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Reel</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.instagram?.format === 'story'} onChange={() => setPlatformFormat('instagram', 'story')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
                            <CirclePlay className={cn("w-4 h-4", publishSettings.instagram?.format === 'story' ? "text-pink-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.instagram?.format === 'story' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Story</span>
                          </label>
                          */}
                        </div>
                      )}
                    </div>
                  )}

                  {/* YouTube Controls */}
                  {connectedPlatforms.includes('youtube') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.youtube?.enabled ? "border-red-500/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}>
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20"
                        onClick={() => togglePlatform('youtube', 'standard')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.youtube?.enabled ? "bg-red-600" : "bg-[#57707A]")}><Youtube className="w-4 h-4" /></div>
                          <div>
                            <p className={cn("text-sm font-bold", publishSettings.youtube?.enabled ? "text-white" : "text-[#989DAA]")}>YouTube</p>
                          </div>
                        </div>
                        <input type="checkbox" checked={publishSettings.youtube?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] text-red-600 focus:ring-red-500 pointer-events-none" />
                      </div>

                      {publishSettings.youtube?.enabled && (
                        <div className="bg-[#2A2F38]/50 p-3 border-t border-[#57707A]/30 flex gap-4 pl-14 animate-in slide-in-from-top-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={true} onChange={() => setPlatformFormat('youtube', 'standard')} className="text-red-500 bg-[#191D23] border-[#57707A]/50 focus:ring-red-500" />
                            <MonitorPlay className="w-4 h-4 text-red-500" />
                            <span className="text-xs font-bold text-[#DEDCDC]">Standard Video</span>
                          </label>
                          {/* TODO: Re-enable YouTube Short once upgraded from PostForMe Quickstart API tier
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.youtube?.format === 'short'} onChange={() => setPlatformFormat('youtube', 'short')} className="text-red-500 bg-[#191D23] border-[#57707A]/50 focus:ring-red-500" />
                            <Smartphone className={cn("w-4 h-4", publishSettings.youtube?.format === 'short' ? "text-red-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.youtube?.format === 'short' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>YouTube Short (9:16)</span>
                          </label>
                          */}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Facebook */}
                  {connectedPlatforms.includes('facebook') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.facebook?.enabled ? "border-blue-500/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20" onClick={() => togglePlatform('facebook', isVideo ? 'reel' : 'post')}>
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.facebook?.enabled ? "bg-blue-600" : "bg-[#57707A]")}><Facebook className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.facebook?.enabled ? "text-white" : "text-[#989DAA]")}>Facebook</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.facebook?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] text-blue-500 focus:ring-blue-500 pointer-events-none" />
                      </div>
                      {publishSettings.facebook?.enabled && (
                        <div className="bg-[#2A2F38]/50 p-3 border-t border-[#57707A]/30 flex flex-wrap gap-4 pl-14 animate-in slide-in-from-top-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={true} onChange={() => setPlatformFormat('facebook', 'post')} className="text-blue-500 bg-[#191D23] border-[#57707A]/50 focus:ring-blue-500" />
                            <LayoutGrid className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-bold text-[#DEDCDC]">Normal Post</span>
                          </label>
                          {/* TODO: Re-enable Reel + Story once upgraded from PostForMe Quickstart API tier
                          { val: 'reel',  label: 'Reel',  Icon: Smartphone },
                          { val: 'story', label: 'Story', Icon: CirclePlay },
                          */}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Twitter / X */}
                  {(connectedPlatforms.includes('twitter') || connectedPlatforms.includes('x')) && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.twitter?.enabled ? "border-[#57707A]/80 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}
                      onClick={() => togglePlatform('twitter', 'post')}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner border border-gray-700", publishSettings.twitter?.enabled ? "bg-gray-900" : "bg-[#57707A]")}><Twitter className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.twitter?.enabled ? "text-white" : "text-[#989DAA]")}>X (Twitter)</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.twitter?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* LinkedIn */}
                  {connectedPlatforms.includes('linkedin') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.linkedin?.enabled ? "border-blue-700/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}
                      onClick={() => togglePlatform('linkedin', 'post')}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.linkedin?.enabled ? "bg-blue-700" : "bg-[#57707A]")}><Linkedin className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.linkedin?.enabled ? "text-white" : "text-[#989DAA]")}>LinkedIn</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.linkedin?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Pinterest */}
                  {connectedPlatforms.includes('pinterest') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.pinterest?.enabled ? "border-red-700/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}
                      onClick={() => togglePlatform('pinterest', 'post')}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.pinterest?.enabled ? "bg-red-700" : "bg-[#57707A]")}><Pin className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.pinterest?.enabled ? "text-white" : "text-[#989DAA]")}>Pinterest</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.pinterest?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Threads */}
                  {connectedPlatforms.includes('threads') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.threads?.enabled ? "border-gray-600/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}
                      onClick={() => togglePlatform('threads', 'post')}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.threads?.enabled ? "bg-gray-800" : "bg-[#57707A]")}><AtSign className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.threads?.enabled ? "text-white" : "text-[#989DAA]")}>Threads</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.threads?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Bluesky */}
                  {connectedPlatforms.includes('bluesky') && (
                    <div className={cn("border rounded-xl transition-all overflow-hidden", publishSettings.bluesky?.enabled ? "border-sky-500/50 shadow-md bg-[#191D23]/80" : "border-[#57707A]/30 bg-[#191D23]/40")}
                      onClick={() => togglePlatform('bluesky', 'post')}>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#57707A]/20">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg text-white shadow-inner", publishSettings.bluesky?.enabled ? "bg-sky-500" : "bg-[#57707A]")}><Cloud className="w-4 h-4" /></div>
                          <p className={cn("text-sm font-bold", publishSettings.bluesky?.enabled ? "text-white" : "text-[#989DAA]")}>Bluesky</p>
                        </div>
                        <input type="checkbox" checked={publishSettings.bluesky?.enabled || false} readOnly className="w-5 h-5 rounded border-[#57707A]/50 bg-[#191D23] pointer-events-none" />
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            <div className="pt-5 border-t border-[#57707A]/20 relative z-10">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Caption (Long)</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerateCaption('long')}
                  disabled={generatingCaption !== null}
                  className="h-7 px-3 text-[10px] font-bold bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:border-[#C5BAC4]/50 hover:text-white transition-colors rounded-lg shadow-sm"
                >
                  {generatingCaption === 'long' ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Wand2 className="w-3 h-3 mr-1.5" />}
                  AI Write Long
                </Button>
              </div>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
              />
            </div>

            <div className="relative z-10 mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Caption (Short)</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerateCaption('short')}
                  disabled={generatingCaption !== null}
                  className="h-7 px-3 text-[10px] font-bold bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:border-[#C5BAC4]/50 hover:text-white transition-colors rounded-lg shadow-sm"
                >
                  {generatingCaption === 'short' ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Wand2 className="w-3 h-3 mr-1.5" />}
                  AI Write Short
                </Button>
              </div>
              <Input
                value={captionShort}
                onChange={(e) => setCaptionShort(e.target.value)}
                className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-11 shadow-inner"
              />
            </div>

            <div className="relative z-10 mt-4">
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">Hashtags</label>
              <Input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-11 shadow-inner"
              />
            </div>

            <div className="pt-4 relative z-10">
              <Button onClick={handleSave} disabled={saving} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold gap-2 h-11 px-6 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#57707A]/20 pb-4">
              <h3 className="text-sm font-bold text-[#DEDCDC] uppercase tracking-wider font-display">
                Status
              </h3>
              <StatusBadge status={content.status as ContentStatus} size="md" />
            </div>
            {content.status === "rejected" && content.rejection_reason && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 shadow-inner">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Rejection Reason</p>
                <p className="text-sm text-red-300 font-medium">
                  {content.rejection_reason}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {/* ── Asset editing tools (draft / pending) ── */}
              {(content.status === "draft" || content.status === "pending_approval") && (
                <>
                  {!isVideo && (
                    <div className="flex gap-2">
                      <Button
                        onClick={openImageGenerationModal}
                        disabled={generatingImage || actionLoading}
                        variant="outline"
                        className="flex-1 justify-center gap-2 bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white rounded-xl h-11 font-bold shadow-sm transition-colors"
                      >
                        {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-[#C5BAC4]" />}{" "}
                        {displayImage ? "Regen Image" : "Generate Image"}
                      </Button>
                      {displayImage && (
                        <Button
                          onClick={() => router.push(`/dashboard/content/${content.id}/edit`)}
                          disabled={generatingImage || actionLoading}
                          className="flex-1 justify-center gap-2 bg-[#C5BAC4]/10 hover:bg-[#C5BAC4]/20 text-[#C5BAC4] border border-[#C5BAC4]/30 shadow-sm rounded-xl h-11 font-bold transition-colors"
                        >
                          <Palette className="h-4 w-4" /> Image Studio
                        </Button>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={handleApproveAndPublishNow}
                    disabled={actionLoading || !isAnyPlatformSelected}
                    className="w-full justify-start gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{" "}
                    Publish Now
                  </Button>
                  <p className="text-[10px] text-[#57707A] font-medium text-center">
                    To schedule, drag this post to a date on the <a href="/dashboard/calendar" className="text-[#C5BAC4] font-bold hover:text-white">Calendar</a>.
                  </p>
                  <button
                    onClick={() => setIgTroubleshootOpen(true)}
                    className="w-full text-[10px] text-[#57707A] hover:text-[#C5BAC4] font-medium text-center transition-colors py-0.5"
                  >
                    Post sent but not showing on Instagram? →
                  </button>
                </>
              )}

              {/* ── Scheduled post controls ── */}
              {content.status === "approved" && (content as any).scheduled_at && (
                <div className="p-5 border border-[#B3FF00]/30 rounded-xl bg-[#B3FF00]/5 shadow-inner space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 text-[#B3FF00] font-bold font-display">
                    <CheckCircle className="h-5 w-5" />
                    Ghost Poster Active 👻
                  </div>
                  <p className="text-xs text-[#989DAA] font-medium leading-relaxed bg-[#191D23] p-3 rounded-lg border border-[#57707A]/30">
                    Queued to publish on<br />
                    <b className="text-[#DEDCDC] text-sm mt-1 inline-block">
                      {new Date((content as any).scheduled_at).toLocaleString()}
                    </b>
                  </p>
                  <div className="flex flex-col gap-2.5 pt-2">
                    <Button
                      onClick={handleApproveAndPublishNow}
                      disabled={actionLoading}
                      className="w-full text-sm font-bold h-11 gap-1.5 bg-[#191D23] text-[#B3FF00] border border-[#B3FF00]/30 hover:bg-[#B3FF00]/20 hover:border-[#B3FF00]/50 rounded-xl transition-colors"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{" "}
                      Publish Now Instead
                    </Button>
                    <Button
                      onClick={handleCancelSchedule}
                      disabled={actionLoading}
                      variant="outline"
                      className="w-full text-xs font-bold h-10 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 bg-transparent rounded-xl transition-colors"
                    >
                      <XCircle className="h-4 w-4" /> Cancel Schedule
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Approved but not yet scheduled ── */}
              {content.status === "approved" && !(content as any).scheduled_at && (
                <Button
                  onClick={handleApproveAndPublishNow}
                  disabled={actionLoading}
                  className="w-full justify-start gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{" "}
                  Publish Now
                </Button>
              )}

              {content.status === "rejected" && (
                <Button
                  onClick={async () => {
                    setActionLoading(true);
                    await supabase
                      .from("content")
                      .update({
                        status: "draft",
                        rejection_reason: null,
                      } as Record<string, unknown>)
                      .eq("id", content.id);
                    setContent((prev) =>
                      prev
                        ? {
                          ...prev,
                          status: "draft" as ContentStatus,
                          rejection_reason: null,
                        }
                        : null
                    );
                    setActionLoading(false);
                  }}
                  disabled={actionLoading}
                  className="w-full justify-start gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-11 rounded-xl shadow-md transition-all"
                >
                  <Pencil className="h-4 w-4" /> Edit & Resubmit
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#DEDCDC] uppercase tracking-wider font-display border-b border-[#57707A]/20 pb-3">
              Details
            </h3>
            <div className="space-y-3 text-sm font-medium">
              <div className="flex justify-between items-center">
                <span className="text-[#57707A]">Content Type</span>
                <span className="text-[#DEDCDC] bg-[#191D23] px-2 py-1 rounded border border-[#57707A]/30 capitalize text-xs">
                  {content.content_type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#57707A]">Created</span>
                <span className="text-[#DEDCDC]">
                  {new Date(content.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {(content as any).scheduled_at && (
                <div className="flex justify-between items-center pt-2 border-t border-[#57707A]/20">
                  <span className="text-[#B3FF00] font-bold">
                    Scheduled For
                  </span>
                  <span className="text-[#B3FF00] font-bold bg-[#B3FF00]/10 px-2 py-1 rounded border border-[#B3FF00]/20 text-xs">
                    {new Date((content as any).scheduled_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                </div>
              )}
              {content.ai_model && (
                <div className="flex justify-between items-center pt-2 border-t border-[#57707A]/20">
                  <span className="text-[#57707A]">AI Model</span>
                  <span className="text-[#C5BAC4] font-bold text-xs uppercase tracking-wider">
                    {content.ai_model}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2 font-bold h-11 rounded-xl transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Delete Content
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={!!previewImageUrl}
        onOpenChange={(open) => !open && setPreviewImageUrl(null)}
      >
        <DialogContent className="max-w-5xl p-1 bg-[#191D23]/90 backdrop-blur-xl border border-[#57707A]/50 shadow-2xl flex flex-col items-center justify-center rounded-2xl">
          <DialogTitle className="sr-only">Media Preview</DialogTitle>
          <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none rounded-2xl"></div>
          {previewImageUrl &&
            (previewImageUrl.includes(".mp4") ||
              previewImageUrl.includes(".mov") ? (
              <video
                src={previewImageUrl}
                controls
                playsInline
                preload="metadata"
                className="w-auto h-auto max-h-[85vh] max-w-full object-contain rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] bg-black relative z-10"
              />
            ) : (
              <img
                src={previewImageUrl}
                alt="Preview"
                className="w-auto h-auto max-h-[85vh] max-w-full object-contain rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10"
              />
            ))}
          <button onClick={() => setPreviewImageUrl(null)} className="absolute top-4 right-4 z-30 p-2 bg-black/50 backdrop-blur-md text-white rounded-full border border-white/20 hover:bg-black/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2 font-display"><Trash2 className="w-5 h-5" /> Delete Content</DialogTitle>
            <DialogDescription className="text-[#989DAA] pt-2">
              Are you sure you want to delete this content? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20">
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white font-bold border-none"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}{" "}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] custom-scrollbar shadow-2xl">
          <DialogHeader className="border-b border-[#57707A]/20 pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-display text-[#DEDCDC]">
              <Sparkles className="h-6 w-6 text-[#C5BAC4]" />
              {displayImage ? "Regenerate Image" : "Generate Image"}
            </DialogTitle>
            <DialogDescription className="text-[#989DAA] mt-1">
              Adjust settings and provide prompts to guide the AI in painting your post.
            </DialogDescription>
          </DialogHeader>

          <div className="py-5 space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Generation Mode</label>
              <Select value={generationMode} onValueChange={(v: GenerationMode) => setGenerationMode(v)}>
                <SelectTrigger className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12 rounded-xl shadow-inner focus:ring-[#C5BAC4]">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
                  <SelectItem value="generate" className="focus:bg-[#191D23] focus:text-white cursor-pointer">Pure Generation (Text to Image)</SelectItem>
                  <SelectItem value="style_transfer" className="focus:bg-[#191D23] focus:text-white cursor-pointer">Style Transfer (Image to Image)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Art Style</label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12 rounded-xl shadow-inner focus:ring-[#C5BAC4]">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
                  {STYLE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="focus:bg-[#191D23] focus:text-white cursor-pointer">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 relative">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Custom Prompt Instructions (Optional)</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePromptHelp}
                  disabled={isHelpLoading}
                  className={cn("h-8 text-xs px-3 bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-white hover:border-[#C5BAC4]/50 transition-colors rounded-lg", isHelpLoading && "animate-pulse")}
                >
                  {isHelpLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
                  {isHelpLoading ? "Writing..." : "AI Magic Writer"}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={"e.g., A dramatic product shot with neon lighting..."}
                  className={cn("resize-none pr-10 transition-all bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar", isHelpLoading && "opacity-50")}
                  rows={4}
                  readOnly={isHelpLoading}
                />
                {isHelpLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles className="w-8 h-8 text-[#C5BAC4] animate-bounce opacity-50" />
                  </div>
                )}
              </div>
            </div>

            {generationMode === "style_transfer" && (
              <div className="space-y-4 p-5 border border-[#57707A]/40 rounded-xl bg-[#191D23]/50 shadow-inner">
                <h4 className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">Reference Images</h4>

                <div className="space-y-4">
                  {(refPreviews.length > 0 || refLibraryUrls.length > 0) && (
                    <div className="grid grid-cols-4 gap-3 mb-2">
                      {refPreviews.map((src, i) => (
                        <div key={`file-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-[#57707A]/50 shadow-sm bg-[#191D23]">
                          <img src={src} className="w-full h-full object-cover opacity-90" alt={`Ref ${i}`} />
                          <button onClick={() => removeRefFile(i)} className="absolute top-1 right-1 p-1 bg-red-500/90 rounded-full shadow-sm hover:bg-red-500 text-white transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {refLibraryUrls.map((src, i) => (
                        <div key={`lib-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-[#C5BAC4]/40 shadow-sm bg-[#191D23]">
                          <img src={src} className="w-full h-full object-cover opacity-90" alt={`Grid pick ${i}`} />
                          <div className="absolute bottom-1 left-1 bg-[#C5BAC4] text-[#191D23] text-[7px] font-bold px-1.5 py-0.5 rounded-full leading-none">Grid</div>
                          <button onClick={() => removeRefLibraryUrl(i)} className="absolute top-1 right-1 p-1 bg-red-500/90 rounded-full shadow-sm hover:bg-red-500 text-white transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleRefFilesDrop}
                      onClick={() => refInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20"
                    >
                      <Upload className="h-6 w-6 mx-auto mb-2 text-[#57707A]" />
                      <p className="text-xs font-bold text-[#989DAA] uppercase tracking-wider">Click or drag & drop</p>
                    </div>
                    <button
                      onClick={() => setIsRefLibraryOpen(true)}
                      className="flex-1 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center gap-2"
                    >
                      <FolderOpen className="h-6 w-6 text-[#57707A]" />
                      <p className="text-xs font-bold text-[#989DAA] uppercase tracking-wider">From Content Grid</p>
                    </button>
                  </div>
                  <input
                    ref={refInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleRefFilesSelect}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[#57707A]/20 pt-5">
            <Button variant="outline" onClick={() => setImageModalOpen(false)} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white rounded-xl font-bold h-11 px-6">Cancel</Button>
            <Button
              onClick={handleGenerateImage}
              disabled={isGenerationDisabled}
              className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-lg shadow-[#C5BAC4]/10 rounded-xl h-11 px-6 transition-all"
            >
              {generatingImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {displayImage ? "Regenerate Image" : "Generate Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetSelectionModal
        open={isRefLibraryOpen}
        onClose={() => setIsRefLibraryOpen(false)}
        onSelect={handleRefLibrarySelect}
      />

      <InstagramTroubleshootModal
        open={igTroubleshootOpen}
        onClose={() => setIgTroubleshootOpen(false)}
      />
    </div>
  );
}