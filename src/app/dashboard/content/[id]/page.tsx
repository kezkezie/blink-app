"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
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
  Calendar as CalendarIcon,
  Upload,
  X,
  ZoomIn,
  Trash2,
  Zap,
  Wand2,
  Palette,
  LayoutGrid,
  Smartphone,
  CirclePlay,
  MonitorPlay,
  Music,
  Youtube,
  Instagram
} from "lucide-react";
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
  { value: "realistic", label: "Hyper-Realistic Photo", promptAddon: "Hyper-realistic photograph, highly detailed, 8k resolution." },
  { value: "cinematic", label: "Cinematic Lighting", promptAddon: "Cinematic lighting, dramatic shadows, movie still, moody aesthetic." },
  { value: "3d_render", label: "3D Product Render", promptAddon: "Abstract 3D render, Cinema4D, Octane render, smooth glossy textures." },
  { value: "studio", label: "Clean Studio Shot", promptAddon: "Professional studio lighting, clean infinite background, high-end commercial product photography." },
  { value: "illustrative", label: "Modern Illustration", promptAddon: "Modern illustration, vibrant colors, flat vector aesthetic." },
  { value: "2d_flat", label: "2D Flat Design", promptAddon: "2D flat design, minimalistic, clean lines, corporate vector." },
];

export default function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { clientId } = useClient();
  const router = useRouter();

  const [content, setContent] = useState<Content | null>(null);
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

  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);

  const [generationMode, setGenerationMode] = useState<GenerationMode>("generate");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const refInputRef = useRef<HTMLInputElement>(null);

  const [isHelpLoading, setIsHelpLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!clientId) return;
      try {
        const [contentRes, clientRes, brandRes, socialRes] = await Promise.all([
          supabase.from("content").select("*").eq("id", id).maybeSingle(),
          supabase.from("clients").select("company_name, industry, onboarding_notes").eq("id", clientId).single(),
          supabase.from("brand_profiles").select("logo_url, image_style, brand_voice").eq("client_id", clientId).maybeSingle(),
          supabase.from("social_accounts").select("platform").eq("client_id", clientId).eq("is_active", true)
        ]);

        if (contentRes.data) {
          const item = contentRes.data as any;
          setContent(item);
          setCaption(item.caption || "");
          setCaptionShort(item.caption_short || "");
          setHashtags(item.hashtags || "");
          setCallToAction(item.call_to_action || "");

          // ✨ Load Publish Settings
          setPublishSettings(parsePublishSettings(item.target_platforms));
        }

        if (brandRes.data?.logo_url) setBrandLogo(brandRes.data.logo_url);

        if (socialRes.data) {
          const platforms = Array.from(new Set(socialRes.data.map(s => s.platform)));
          setConnectedPlatforms(platforms);
        }

        let desc = "";
        if (clientRes.data?.onboarding_notes) {
          try { desc = JSON.parse(clientRes.data.onboarding_notes as string).description || ""; }
          catch { desc = clientRes.data.onboarding_notes as string || ""; }
        }

        setBrandContext({
          name: clientRes.data?.company_name,
          industry: clientRes.data?.industry,
          description: desc,
          imageStyle: brandRes.data?.image_style,
          brandVoice: brandRes.data?.brand_voice,
          logoUrl: brandRes.data?.logo_url,
        });

      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, clientId]);

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

      const res = await fetch("/api/ai/prompt-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt,
          brandContext: brandContext,
          useBrand: true,
          mode: generationMode,
          style: activeStyleObj
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

  async function handleSendForApproval() {
    if (!content) return;

    if (!isAnyPlatformSelected) {
      alert("Please select at least one platform to publish to before sending for approval.");
      return;
    }

    setActionLoading(true);
    try {
      await autoSaveEdits();

      await triggerWorkflow("blink-send-approval", {
        client_id: clientId!,
        post_id: content.id,
        caption: caption,
        image_url: parseArray(content.image_urls)[0] || null,
        publish_settings: publishSettings // Pass to n8n
      });

      await supabase
        .from("content")
        .update({ status: "pending_approval" } as Record<string, unknown>)
        .eq("id", content.id);

      setContent((prev) =>
        prev ? { ...prev, status: "pending_approval" as ContentStatus } : null
      );
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
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
      if (!res.ok) throw new Error(data.error);

      setContent((prev) =>
        prev
          ? {
            ...prev,
            status: "posted" as ContentStatus,
            scheduled_at: null as any,
          }
          : null
      );
      alert("Post approved and sent live to PostForMe! 🚀");
    } catch (err: any) {
      alert(`Failed to publish: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveAndSchedule() {
    if (!content || !scheduleDate) return;

    if (!isAnyPlatformSelected) {
      alert("Please select at least one platform to publish to before scheduling.");
      return;
    }

    setActionLoading(true);
    try {
      await autoSaveEdits();

      const scheduledTime = new Date(scheduleDate).toISOString();
      const { error } = await supabase
        .from("content")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: "admin",
          scheduled_at: scheduledTime,
        } as Record<string, unknown>)
        .eq("id", content.id);
      if (error) throw error;
      setContent((prev) =>
        prev
          ? {
            ...prev,
            status: "approved" as ContentStatus,
            scheduled_at: scheduledTime as string,
          }
          : null
      );
      setScheduleDate("");
    } catch (err) {
      alert("Failed to schedule post.");
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

  async function handleGenerateImage() {
    if (!content) return;

    setImageModalOpen(false);
    setGeneratingImage(true);

    let finalTopic = customPrompt.trim() || captionShort || caption?.substring(0, 60) || "Create a professional image";
    const displayImage = parseArray(content.image_urls)[0];

    if (brandContext?.description) {
      finalTopic = `${finalTopic}. BRAND CONTEXT: We are ${brandContext.name}, operating in the ${brandContext.industry} industry. Product info: ${brandContext.description}`;
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

      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId!,
        post_id: content.id,
        topic: finalTopic,
        content_type: content.content_type,
        mode: generationMode,
        reference_image_urls: uploadedUrls,
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

  const isGenerationDisabled = generatingImage || (generationMode === "style_transfer" && refFiles.length === 0);

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
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.tiktok?.format === 'story'} onChange={() => setPlatformFormat('tiktok', 'story')} className="text-[#C5BAC4] bg-[#191D23] border-[#57707A]/50 focus:ring-[#C5BAC4]" />
                            <CirclePlay className={cn("w-4 h-4", publishSettings.tiktok?.format === 'story' ? "text-[#C5BAC4]" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.tiktok?.format === 'story' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Story</span>
                          </label>
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
                            <input type="radio" checked={publishSettings.instagram?.format === 'reel' || publishSettings.instagram?.format === 'feed'} onChange={() => setPlatformFormat('instagram', isVideo ? 'reel' : 'feed')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
                            <Smartphone className={cn("w-4 h-4", (publishSettings.instagram?.format === 'reel' || publishSettings.instagram?.format === 'feed') ? "text-pink-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", (publishSettings.instagram?.format === 'reel' || publishSettings.instagram?.format === 'feed') ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Feed / Reel</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.instagram?.format === 'story'} onChange={() => setPlatformFormat('instagram', 'story')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
                            <CirclePlay className={cn("w-4 h-4", publishSettings.instagram?.format === 'story' ? "text-pink-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.instagram?.format === 'story' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Story</span>
                          </label>
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
                            <input type="radio" checked={publishSettings.youtube?.format === 'standard'} onChange={() => setPlatformFormat('youtube', 'standard')} className="text-red-500 bg-[#191D23] border-[#57707A]/50 focus:ring-red-500" />
                            <MonitorPlay className={cn("w-4 h-4", publishSettings.youtube?.format === 'standard' ? "text-red-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.youtube?.format === 'standard' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>Standard Video</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" checked={publishSettings.youtube?.format === 'short'} onChange={() => setPlatformFormat('youtube', 'short')} className="text-red-500 bg-[#191D23] border-[#57707A]/50 focus:ring-red-500" />
                            <Smartphone className={cn("w-4 h-4", publishSettings.youtube?.format === 'short' ? "text-red-500" : "text-[#57707A] group-hover:text-[#DEDCDC]")} />
                            <span className={cn("text-xs font-bold", publishSettings.youtube?.format === 'short' ? "text-[#DEDCDC]" : "text-[#989DAA]")}>YouTube Short (9:16)</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add logic for Facebook, X, LinkedIn if they exist in connectedPlatforms similarly */}

                </div>
              )}
            </div>

            <div className="pt-5 border-t border-[#57707A]/20 relative z-10">
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 mt-2">Caption (Long)</label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
              />
            </div>
            <div className="relative z-10">
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">Caption (Short)</label>
              <Input
                value={captionShort}
                onChange={(e) => setCaptionShort(e.target.value)}
                className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-11 shadow-inner"
              />
            </div>
            <div className="relative z-10">
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
              {content.status === "draft" && (
                <>
                  {!isVideo && (
                    <div className="flex gap-2">
                      <Button
                        onClick={openImageGenerationModal}
                        disabled={generatingImage || actionLoading}
                        variant="outline"
                        className="flex-1 justify-center gap-2 bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white rounded-xl h-11 font-bold shadow-sm transition-colors"
                      >
                        {generatingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-[#C5BAC4]" />
                        )}{" "}
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
                    onClick={handleSendForApproval}
                    disabled={actionLoading || !displayImage}
                    className="w-full justify-start gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}{" "}
                    Send for Approval
                  </Button>
                </>
              )}

              {(content.status === "pending_approval" ||
                content.status === "approved") && (
                  <div className="space-y-4 pt-1">
                    {content.status === "pending_approval" && (
                      <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold mb-2 shadow-inner">
                        <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
                        Post looks good? Choose how to proceed:
                      </div>
                    )}
                    {content.status === "approved" &&
                      (content as any).scheduled_at ? (
                      <div className="p-5 border border-[#B3FF00]/30 rounded-xl bg-[#B3FF00]/5 shadow-inner space-y-4 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[#B3FF00] font-bold font-display">
                            <CheckCircle className="h-5 w-5" />
                            Ghost Poster Active 👻
                          </div>
                        </div>
                        <p className="text-xs text-[#989DAA] font-medium leading-relaxed bg-[#191D23] p-3 rounded-lg border border-[#57707A]/30">
                          This post is queued. The AI will automatically publish
                          it on <br />
                          <b className="text-[#DEDCDC] text-sm mt-1 inline-block">
                            {new Date(
                              (content as any).scheduled_at
                            ).toLocaleString()}
                          </b>
                        </p>
                        <div className="flex flex-col gap-2.5 pt-2">
                          <Button
                            onClick={handleApproveAndPublishNow}
                            disabled={actionLoading}
                            className="w-full text-sm font-bold h-11 gap-1.5 bg-[#191D23] text-[#B3FF00] border border-[#B3FF00]/30 hover:bg-[#B3FF00]/20 hover:border-[#B3FF00]/50 rounded-xl transition-colors"
                          >
                            {actionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}{" "}
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
                    ) : (
                      <>
                        <Button
                          onClick={handleApproveAndPublishNow}
                          disabled={actionLoading}
                          className="w-full justify-start gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}{" "}
                          {content.status === "pending_approval"
                            ? "Approve & Publish Now"
                            : "Publish Now"}
                        </Button>
                        <div className="p-4 border border-[#57707A]/30 rounded-xl bg-[#191D23]/50 shadow-inner inset-0 space-y-3">
                          <label className="text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5 text-[#B3FF00]" />{" "}
                            {content.status === "pending_approval"
                              ? "Approve & Schedule"
                              : "Schedule Post"}
                          </label>
                          <Input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full text-sm bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] focus:ring-[#B3FF00] rounded-lg color-scheme-dark"
                            min={new Date().toISOString().slice(0, 16)}
                          />
                          <Button
                            onClick={handleApproveAndSchedule}
                            disabled={actionLoading || !scheduleDate}
                            className="w-full justify-center gap-2 bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] font-bold h-11 rounded-lg shadow-md border-none transition-all"
                          >
                            {actionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}{" "}
                            Schedule for later
                          </Button>
                        </div>
                      </>
                    )}
                    {content.status === "pending_approval" && (
                      <Button
                        onClick={() => setRejectOpen(true)}
                        disabled={actionLoading}
                        variant="outline"
                        className="w-full justify-start gap-2 border border-red-500/30 text-red-400 bg-transparent hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50 mt-3 font-bold h-11 rounded-xl transition-colors"
                      >
                        <XCircle className="h-4 w-4" /> Reject & Request Edit
                      </Button>
                    )}
                  </div>
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
                  {refPreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-3 mb-2">
                      {refPreviews.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#57707A]/50 shadow-sm bg-[#191D23]">
                          <img src={src} className="w-full h-full object-cover opacity-90" alt={`Ref ${i}`} />
                          <button onClick={() => removeRefFile(i)} className="absolute top-1 right-1 p-1 bg-red-500/90 rounded-full shadow-sm hover:bg-red-500 text-white transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleRefFilesDrop}
                    onClick={() => refInputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20"
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-[#57707A]" />
                    <p className="text-xs font-bold text-[#989DAA] uppercase tracking-wider">Click or drag & drop reference images</p>
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
    </div>
  );
}