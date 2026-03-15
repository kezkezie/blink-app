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
  Palette // ✨ Added Palette icon for the new button
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
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";
import type { Content, ContentStatus } from "@/types/database";

import { cn } from "@/lib/utils";

const PLATFORM_UI: Record<string, { label: string; emoji: string; color: string }> = {
  instagram: { label: "Instagram", emoji: "📸", color: "text-pink-600 border-pink-200 bg-pink-50" },
  tiktok: { label: "TikTok", emoji: "🎵", color: "text-gray-900 border-gray-300 bg-gray-100" },
  facebook: { label: "Facebook", emoji: "📘", color: "text-blue-600 border-blue-200 bg-blue-50" },
  x: { label: "X (Twitter)", emoji: "🐦", color: "text-gray-900 border-gray-300 bg-gray-100" },
  linkedin: { label: "LinkedIn", emoji: "💼", color: "text-blue-700 border-blue-200 bg-blue-50" },
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

// ✨ Removed "edit" and "layers" from the GenerationMode type
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
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);

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
          setTargetPlatforms(item.target_platforms || []);
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

  const togglePlatform = (platform: string) => {
    setTargetPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

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

  async function handleSave() {
    if (!content) return;
    setSaving(true);
    const { error } = await supabase
      .from("content")
      .update({
        caption,
        caption_short: captionShort,
        hashtags,
        call_to_action: callToAction,
        target_platforms: targetPlatforms
      } as any)
      .eq("id", content.id);
    setSaving(false);
    if (!error)
      setContent((prev: any) =>
        prev
          ? {
            ...prev,
            caption,
            caption_short: captionShort,
            hashtags,
            call_to_action: callToAction,
            target_platforms: targetPlatforms
          }
          : null
      );
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
    setActionLoading(true);
    try {
      await triggerWorkflow("blink-send-approval", {
        client_id: clientId!,
        post_id: content.id,
        caption: content.caption,
        image_url: parseArray(content.image_urls)[0] || null,
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

    if (targetPlatforms.length === 0) {
      alert("Please select at least one platform to publish to and click 'Save Changes' first.");
      return;
    }

    setActionLoading(true);
    try {
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
      alert("Post approved and sent live! 🚀");
    } catch (err: any) {
      alert(`Failed to publish: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveAndSchedule() {
    if (!content || !scheduleDate) return;

    if (targetPlatforms.length === 0) {
      alert("Please select at least one platform to publish to and click 'Save Changes' first.");
      return;
    }

    setActionLoading(true);
    try {
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );
  if (!content)
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 font-medium">Content not found</p>
        <Button
          variant="ghost"
          className="mt-4"
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

  // Disable if in style transfer mode but no reference images provided
  const isGenerationDisabled = generatingImage || (generationMode === "style_transfer" && refFiles.length === 0);

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.push("/dashboard/content")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blink-dark transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to content
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="relative h-[400px] md:h-[500px] w-full bg-gray-900 flex items-center justify-center overflow-hidden">
              {generatingImage ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
                  <p className="text-sm font-medium text-blink-dark">
                    Painting your image...
                  </p>
                </div>
              ) : displayImage ? (
                <>
                  {isVideo ? (
                    <video
                      src={`${displayImage}#t=0.1`}
                      className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 pointer-events-none"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={displayImage}
                      className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 pointer-events-none"
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
                        className="h-full w-full object-contain drop-shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div
                        className="relative h-full w-full flex items-center justify-center cursor-zoom-in"
                        onClick={() => setPreviewImageUrl(displayImage)}
                      >
                        <img
                          src={displayImage}
                          alt="Generated Content"
                          className="h-full w-full object-contain drop-shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                          <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 font-medium text-sm shadow-lg backdrop-blur-md">
                            <ZoomIn className="h-4 w-4" /> Click to Enlarge
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-gray-50 relative z-10">
                  <ImageIcon className="h-12 w-12 text-gray-300" />
                  <p className="text-sm text-gray-400">No media yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Publish To (Select Platforms)</label>
              {connectedPlatforms.length === 0 ? (
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-500 border border-gray-200">
                  No social accounts connected. Go to <a href="/dashboard/settings" className="text-blink-primary hover:underline">Settings</a> to connect accounts.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {connectedPlatforms.map(platform => {
                    const isSelected = targetPlatforms.includes(platform);
                    const config = PLATFORM_UI[platform] || { label: platform, emoji: "🔗", color: "bg-gray-100 text-gray-800 border-gray-300" };
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200",
                          isSelected ? config.color : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        <span>{config.emoji}</span>
                        {config.label}
                        {isSelected && <CheckCircle className="h-3.5 w-3.5 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 mt-2">Caption (Long)</label>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Caption (Short)</label>
              <Input value={captionShort} onChange={(e) => setCaptionShort(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hashtags</label>
              <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
            </div>
            <div className="pt-2">
              <Button onClick={handleSave} disabled={saving} className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-blink-dark font-heading">
                Status
              </h3>
              <StatusBadge status={content.status as ContentStatus} size="md" />
            </div>
            {content.status === "rejected" && content.rejection_reason && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">
                  Rejection Reason
                </p>
                <p className="text-sm text-red-600">
                  {content.rejection_reason}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {content.status === "draft" && (
                <>
                  {!isVideo && (
                    <div className="flex gap-2">
                      <Button
                        onClick={openImageGenerationModal}
                        disabled={generatingImage || actionLoading}
                        variant="outline"
                        className="flex-1 justify-center gap-2"
                      >
                        {generatingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 text-blink-secondary" />
                        )}{" "}
                        {displayImage ? "Regenerate Image" : "Generate Image"}
                      </Button>

                      {/* ✨ NEW: Enter Image Studio Button */}
                      {displayImage && (
                        <Button
                          onClick={() => router.push(`/dashboard/content/${content.id}/edit`)}
                          disabled={generatingImage || actionLoading}
                          className="flex-1 justify-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200 shadow-sm"
                        >
                          <Palette className="h-4 w-4" /> Enter Image Studio
                        </Button>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={handleSendForApproval}
                    disabled={actionLoading || !displayImage}
                    className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
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
                  <div className="space-y-3 pt-1">
                    {content.status === "pending_approval" && (
                      <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium mb-1 border border-blue-100">
                        Post looks good? Choose how to proceed:
                      </div>
                    )}
                    {content.status === "approved" &&
                      (content as any).scheduled_at ? (
                      <div className="p-4 border border-emerald-200 rounded-xl bg-emerald-50 shadow-inner space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-700 font-bold">
                            <CheckCircle className="h-5 w-5" />
                            Ghost Poster Active 👻
                          </div>
                        </div>
                        <p className="text-xs text-emerald-700/80 leading-relaxed">
                          This post is queued. The AI will automatically publish
                          it on{" "}
                          <b>
                            {new Date(
                              (content as any).scheduled_at
                            ).toLocaleString()}
                          </b>
                          .
                        </p>
                        <div className="flex flex-col gap-2 pt-2">
                          <Button
                            onClick={handleApproveAndPublishNow}
                            disabled={actionLoading}
                            className="w-full text-xs h-9 gap-1.5 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          >
                            {actionLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}{" "}
                            Publish Now Instead
                          </Button>
                          <Button
                            onClick={handleCancelSchedule}
                            disabled={actionLoading}
                            variant="outline"
                            className="w-full text-xs h-9 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100 bg-white"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Cancel Schedule
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button
                          onClick={handleApproveAndPublishNow}
                          disabled={actionLoading}
                          className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
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
                        <div className="p-3 border border-gray-100 rounded-xl bg-gray-50 shadow-inner inset-0 space-y-2.5">
                          <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5 text-emerald-600" />{" "}
                            {content.status === "pending_approval"
                              ? "Approve & Schedule"
                              : "Schedule Post"}
                          </label>
                          <Input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full text-sm bg-white border-gray-200 focus:ring-emerald-500"
                            min={new Date().toISOString().slice(0, 16)}
                          />
                          <Button
                            onClick={handleApproveAndSchedule}
                            disabled={actionLoading || !scheduleDate}
                            className="w-full justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
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
                        className="w-full justify-start gap-2 border-red-200 text-red-600 hover:bg-red-50 mt-2"
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
                  className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
                >
                  <Pencil className="h-4 w-4" /> Edit & Resubmit
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-blink-dark font-heading">
              Details
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Content Type</span>
                <span className="text-blink-dark font-medium capitalize">
                  {content.content_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-blink-dark font-medium">
                  {new Date(content.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {(content as any).scheduled_at && (
                <div className="flex justify-between">
                  <span className="text-emerald-600 font-semibold">
                    Scheduled For
                  </span>
                  <span className="text-emerald-700 font-bold">
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
                <div className="flex justify-between">
                  <span className="text-gray-500">AI Model</span>
                  <span className="text-blink-dark font-medium">
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
              className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 gap-2"
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
        <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none flex flex-col items-center justify-center">
          <DialogTitle className="sr-only">Media Preview</DialogTitle>
          {previewImageUrl &&
            (previewImageUrl.includes(".mp4") ||
              previewImageUrl.includes(".mov") ? (
              <video
                src={previewImageUrl}
                controls
                playsInline
                preload="metadata"
                className="w-auto h-auto max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl bg-black"
              />
            ) : (
              <img
                src={previewImageUrl}
                alt="Preview"
                className="w-auto h-auto max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            ))}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Content</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this content?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}{" "}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blink-primary" />
              {displayImage ? "Regenerate Image" : "Generate Image"}
            </DialogTitle>
            <DialogDescription>
              Adjust settings and provide prompts to guide the AI in painting your post.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Generation Mode</label>
              <Select value={generationMode} onValueChange={(v: GenerationMode) => setGenerationMode(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {/* ✨ Cleaned up dropdown list */}
                  <SelectItem value="generate">Pure Generation (Text to Image)</SelectItem>
                  <SelectItem value="style_transfer">Style Transfer (Image to Image)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Art Style</label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger>
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 relative">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700">Custom Prompt Instructions (Optional)</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePromptHelp}
                  disabled={isHelpLoading}
                  className={cn("h-7 text-xs px-2 hover:bg-blink-primary/10 hover:text-blink-primary transition-colors border border-transparent hover:border-blink-primary/20", isHelpLoading && "animate-pulse")}
                >
                  {isHelpLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  {isHelpLoading ? "Writing..." : "AI Magic Writer"}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={"e.g., A dramatic product shot with neon lighting..."}
                  className={cn("resize-none pr-10 transition-all", isHelpLoading && "opacity-50")}
                  rows={3}
                  readOnly={isHelpLoading}
                />
                {isHelpLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles className="w-8 h-8 text-blink-primary animate-bounce opacity-50" />
                  </div>
                )}
              </div>
            </div>

            {/* Reference Images section (Only for style transfer now) */}
            {generationMode === "style_transfer" && (
              <div className="space-y-4 p-4 border border-gray-200 rounded-xl bg-gray-50">
                <h4 className="text-sm font-medium text-gray-800">Reference Images</h4>

                <div className="space-y-2">
                  {refPreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {refPreviews.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-gray-200">
                          <img src={src} className="w-full h-full object-cover" alt={`Ref ${i}`} />
                          <button onClick={() => removeRefFile(i)} className="absolute top-1 right-1 p-1 bg-white/80 rounded-full shadow-sm hover:bg-white text-red-500">
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
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-gray-300 hover:border-blink-primary hover:bg-blink-primary/5"
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                    <p className="text-xs font-medium text-gray-600">Click or drag & drop reference images</p>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setImageModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGenerateImage}
              disabled={isGenerationDisabled}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white"
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