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
  Eye,
  Zap,
  ZoomIn,
  Trash2,
  Layers,
  ImagePlus,
  Palette,
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

type GenerationMode = "generate" | "style_transfer" | "edit" | "layers";

const STYLE_OPTIONS = [
  { value: "realistic", label: "Hyper-Realistic Photo" },
  { value: "cinematic", label: "Cinematic Lighting" },
  { value: "3d_render", label: "3D Product Render" },
  { value: "studio", label: "Clean Studio Shot" },
  { value: "illustrative", label: "Modern Illustration" },
  { value: "2d_flat", label: "2D Flat Design" },
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
  const [useCurrentImageAsRef, setUseCurrentImageAsRef] = useState(false);

  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("generate");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchData() {
      if (!clientId) return;
      try {
        const [contentRes, brandRes] = await Promise.all([
          supabase.from("content").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("brand_profiles")
            .select("logo_url")
            .eq("client_id", clientId)
            .maybeSingle(),
        ]);

        if (contentRes.data) {
          const item = contentRes.data as unknown as Content;
          setContent(item);
          setCaption(item.caption || "");
          setCaptionShort(item.caption_short || "");
          setHashtags(item.hashtags || "");
          setCallToAction(item.call_to_action || "");
        }
        if (brandRes.data?.logo_url) setBrandLogo(brandRes.data.logo_url);
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, clientId]);

  const pollForImageUpdate = async (
    contentId: string,
    originalImgUrl: string | undefined
  ) => {
    setGeneratingImage(true);
    let attempts = 0;
    let found = false;
    while (attempts < 60 && !found) {
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("id", contentId)
        .single();
      if (data) {
        const newImg = parseArray((data as unknown as Content).image_urls)[0];
        if (newImg && newImg !== originalImgUrl) {
          setContent(data as unknown as Content);
          found = true;
          break;
        }
      }
      attempts++;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!found) {
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("id", contentId)
        .single();
      if (data) setContent(data as unknown as Content);
    }
    setGeneratingImage(false);
    localStorage.removeItem(`regenerating_img_${contentId}`);
  };

  useEffect(() => {
    if (!content || generatingImage) return;
    const checkRecovery = async () => {
      const timestamp = localStorage.getItem(`regenerating_img_${content.id}`);
      if (timestamp && Date.now() - parseInt(timestamp) < 5 * 60 * 1000) {
        pollForImageUpdate(content.id, parseArray(content.image_urls)[0]);
      } else {
        localStorage.removeItem(`regenerating_img_${content.id}`);
      }
    };
    checkRecovery();
  }, [content?.id]);

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
      } as Record<string, unknown>)
      .eq("id", content.id);
    setSaving(false);
    if (!error)
      setContent((prev) =>
        prev
          ? {
              ...prev,
              caption,
              caption_short: captionShort,
              hashtags,
              call_to_action: callToAction,
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
    setActionLoading(true);
    try {
      await supabase
        .from("content")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: "admin",
          scheduled_at: null, // Clear any schedule if publishing now
        } as Record<string, unknown>)
        .eq("id", content.id);

      await fetch("/api/social-posts/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: content.id,
          clientId: clientId!,
          platforms: content.target_platforms || ["instagram"],
          scheduledAt: null,
        }),
      });

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
    } catch (err) {
      console.error("Publish error:", err);
      alert("Failed to publish post.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveAndSchedule() {
    if (!content || !scheduleDate) return;
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
      console.error("Schedule error:", err);
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
        .update({
          scheduled_at: null,
        } as Record<string, unknown>)
        .eq("id", content.id);

      if (error) throw error;

      setContent((prev) =>
        prev ? { ...prev, scheduled_at: null as any } : null
      );
    } catch (err) {
      console.error("Cancel schedule error:", err);
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
    const maxFiles = generationMode === "style_transfer" ? 4 : 8;
    const usedSlots = refFiles.length + (useCurrentImageAsRef ? 1 : 0);
    const remainingSlots = maxFiles - usedSlots;

    if (remainingSlots <= 0) {
      alert(`Maximum ${maxFiles} reference images allowed for this mode.`);
      return;
    }

    let validFiles = newFiles.filter((f) => f.size <= 30 * 1024 * 1024);
    if (validFiles.length < newFiles.length)
      alert("Some files were skipped because they exceed 30MB.");

    if (validFiles.length > remainingSlots) {
      alert(
        `Adding first ${remainingSlots} files to respect the ${maxFiles} image limit.`
      );
      validFiles = validFiles.slice(0, remainingSlots);
    }

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
    setGeneratingImage(true);
    setImageModalOpen(false);
    const finalTopic =
      customPrompt.trim() || captionShort || caption?.substring(0, 60) || "";
    const displayImage = parseArray(content.image_urls)[0];
    try {
      await supabase
        .from("content")
        .update({ image_prompt_used: finalTopic })
        .eq("id", content.id);
      setContent((prev) =>
        prev ? { ...prev, image_prompt_used: finalTopic } : null
      );

      let uploadedUrls: string[] = [];
      for (const file of refFiles) {
        const filePath = `references/${clientId}/${Date.now()}_${Math.random()
          .toString(36)
          .substring(7)}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage
          .from("assets")
          .upload(filePath, file);
        if (!error)
          uploadedUrls.push(
            supabase.storage.from("assets").getPublicUrl(filePath).data
              .publicUrl
          );
      }

      if (useCurrentImageAsRef && displayImage)
        uploadedUrls.unshift(displayImage);

      await triggerWorkflow("blink-generate-images", {
        client_id: clientId!,
        post_id: content.id,
        topic: finalTopic,
        content_type: content.content_type,
        mode: generationMode,
        reference_image_url: displayImage || null,
        reference_image_urls: uploadedUrls,
        logo_url: brandLogo || null,
        style: generationMode === "style_transfer" ? selectedStyle : null,
      });

      setRefFiles([]);
      setRefPreviews([]);
      setCustomPrompt("");
      setUseCurrentImageAsRef(false);
      setGenerationMode("generate");
      localStorage.setItem(
        `regenerating_img_${content.id}`,
        Date.now().toString()
      );
      pollForImageUpdate(content.id, displayImage);
    } catch (err) {
      console.error(err);
      setGeneratingImage(false);
    }
  }

  function openImageGenerationModal() {
    setRefFiles([]);
    setRefPreviews([]);
    setCustomPrompt("");
    setUseCurrentImageAsRef(false);
    setGenerationMode(parseArray(content?.image_urls)[0] ? "edit" : "generate");
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
  const referenceImageUrl = (content as unknown as Record<string, unknown>)
    .reference_image_url as string | null;

  const isGenerationDisabled =
    generatingImage ||
    ((generationMode === "style_transfer" || generationMode === "layers") &&
      refFiles.length === 0 &&
      !useCurrentImageAsRef);

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
            <div className="relative aspect-video bg-gray-100">
              {generatingImage ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm z-10 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
                  <p className="text-sm font-medium text-blink-dark">
                    Painting your image...
                  </p>
                </div>
              ) : displayImage ? (
                <div
                  className="relative h-full w-full group cursor-zoom-in"
                  onClick={() => setPreviewImageUrl(displayImage)}
                >
                  <img
                    src={displayImage}
                    alt="Generated Content"
                    className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2 font-medium text-sm shadow-lg backdrop-blur-md">
                      <ZoomIn className="h-4 w-4" /> Click to Enlarge
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="h-12 w-12 text-gray-300" />
                  <p className="text-sm text-gray-400">No image yet</p>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Caption (Long)
              </label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Caption (Short)
              </label>
              <Input
                value={captionShort}
                onChange={(e) => setCaptionShort(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Hashtags
              </label>
              <Input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
              {hashtags && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {hashtags
                    .split(/[\s,]+/)
                    .filter(Boolean)
                    .map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs bg-blink-primary/10 text-blink-primary px-2 py-0.5 rounded-full font-medium"
                      >
                        {tag.startsWith("#") ? tag : `#${tag}`}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Call to Action
              </label>
              <Input
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
              />
            </div>
            <div className="pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Save Changes
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
                  <Button
                    onClick={openImageGenerationModal}
                    disabled={generatingImage || actionLoading}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    {generatingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-blink-secondary" />
                    )}{" "}
                    {displayImage ? "Regenerate Image" : "Generate Image"}
                  </Button>
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

              {/* ✨ NEW STREAMLINED APPROVAL FLOW */}
              {(content.status === "pending_approval" ||
                content.status === "approved") && (
                <div className="space-y-3 pt-1">
                  {content.status === "pending_approval" && (
                    <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium mb-1 border border-blue-100">
                      Post looks good? Choose how to proceed:
                    </div>
                  )}

                  {/* 👻 GHOST POSTER ACTIVE STATE - FIXED BUTTON LAYOUT */}
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
              <div className="flex justify-between">
                <span className="text-gray-500">Last Updated</span>
                <span className="text-blink-dark font-medium">
                  {new Date(content.updated_at).toLocaleDateString("en-US", {
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
            {content.image_prompt_used && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="block text-gray-500 text-xs mb-1.5 font-medium">
                  Image Prompt Used:
                </span>
                <span className="block text-blink-dark text-xs italic leading-relaxed bg-gray-50 p-2 rounded-md">
                  "{content.image_prompt_used}"
                </span>
              </div>
            )}
          </div>
          {referenceImageUrl && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-blink-dark font-heading flex items-center gap-2">
                <Eye className="h-4 w-4 text-gray-400" /> Reference Source
              </h3>
              <div
                className="relative h-32 w-full rounded-lg overflow-hidden border border-gray-100 cursor-zoom-in group bg-gray-50"
                onClick={() => setPreviewImageUrl(referenceImageUrl)}
              >
                <img
                  src={referenceImageUrl}
                  alt="Source"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30">
                  <div className="bg-white/20 backdrop-blur-md text-white px-3 py-1.5 rounded-full flex items-center gap-2 font-medium text-xs shadow-lg">
                    <ZoomIn className="h-3.5 w-3.5" /> View
                  </div>
                </div>
              </div>
            </div>
          )}
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
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt="Preview"
              className="w-auto h-auto max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Content</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this content? This action cannot
              be undone.
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
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blink-primary" />{" "}
              {displayImage ? "Regenerate Image" : "Generate Image"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setGenerationMode("generate")}
                className={cn(
                  "flex flex-col items-center text-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                  generationMode === "generate"
                    ? "border-blink-primary bg-blink-primary/5"
                    : "border-gray-100 hover:border-gray-200"
                )}
              >
                <div
                  className={cn(
                    "p-2.5 rounded-full",
                    generationMode === "generate"
                      ? "bg-blink-primary/10 text-blink-primary"
                      : "bg-gray-50 text-gray-400"
                  )}
                >
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-blink-dark">
                    Pure AI Generation
                  </h4>
                </div>
              </div>
              <div
                onClick={() => setGenerationMode("style_transfer")}
                className={cn(
                  "flex flex-col items-center text-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                  generationMode === "style_transfer"
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-100 hover:border-gray-200"
                )}
              >
                <div
                  className={cn(
                    "p-2.5 rounded-full",
                    generationMode === "style_transfer"
                      ? "bg-amber-100 text-amber-600"
                      : "bg-gray-50 text-gray-400"
                  )}
                >
                  <Palette className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[13px] font-semibold text-blink-dark">
                    Style Transfer
                  </h4>
                </div>
              </div>
              {displayImage && (
                <>
                  <div
                    onClick={() => setGenerationMode("edit")}
                    className={cn(
                      "flex flex-col items-center text-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                      generationMode === "edit"
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div
                      className={cn(
                        "p-2.5 rounded-full",
                        generationMode === "edit"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-50 text-gray-400"
                      )}
                    >
                      <Pencil className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold text-blink-dark">
                        Edit Image
                      </h4>
                    </div>
                  </div>
                  <div
                    onClick={() => setGenerationMode("layers")}
                    className={cn(
                      "flex flex-col items-center text-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                      generationMode === "layers"
                        ? "border-purple-400 bg-purple-50"
                        : "border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div
                      className={cn(
                        "p-2.5 rounded-full",
                        generationMode === "layers"
                          ? "bg-purple-100 text-purple-600"
                          : "bg-gray-50 text-gray-400"
                      )}
                    >
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold text-blink-dark">
                        Layers
                      </h4>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-100">
              {generationMode === "style_transfer" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-medium text-gray-700">
                    Target Style
                  </label>
                  <Select
                    value={selectedStyle}
                    onValueChange={setSelectedStyle}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a style" />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex justify-between">
                  Custom Prompt{" "}
                  <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={2}
                  placeholder={
                    generationMode === "layers"
                      ? "E.g., Place the logo elegantly in the corner..."
                      : "Describe what you want the AI to generate..."
                  }
                  className="resize-none text-sm"
                />
              </div>

              {(generationMode === "style_transfer" ||
                generationMode === "layers") && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {displayImage && (
                    <div
                      onClick={() =>
                        setUseCurrentImageAsRef(!useCurrentImageAsRef)
                      }
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                        useCurrentImageAsRef
                          ? "border-blink-primary bg-blink-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50"
                      )}
                    >
                      <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={displayImage}
                          alt="Current"
                          className="h-full w-full object-cover"
                        />
                        {useCurrentImageAsRef && (
                          <div className="absolute inset-0 bg-blink-primary/20 flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-blink-primary drop-shadow-md" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-blink-dark">
                          Use Current Image
                        </h4>
                        <p className="text-xs text-gray-500">
                          Include this image as a reference layer.
                        </p>
                      </div>
                    </div>
                  )}

                  <label className="text-sm font-medium text-gray-700 flex justify-between">
                    {generationMode === "layers"
                      ? "Upload Layers"
                      : "Upload Reference Photos"}{" "}
                    <span className="text-xs text-gray-400 font-normal">
                      (Max {generationMode === "style_transfer" ? 4 : 8} total)
                    </span>
                  </label>
                  {refPreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {refPreviews.map((preview, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl border border-gray-200 overflow-hidden group bg-gray-50"
                        >
                          <img
                            src={preview}
                            alt={`Ref ${idx}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => removeRefFile(idx)}
                            className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 shadow-sm hover:bg-red-50 transition-opacity"
                          >
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
                    className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-blink-primary/40 group"
                  >
                    <div className="h-12 w-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <ImagePlus className="h-6 w-6 text-gray-400 group-hover:text-blink-primary transition-colors" />
                    </div>
                    <p className="text-sm font-medium text-blink-dark mb-1">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 text-center max-w-[250px]">
                      Supported formats: JPEG, PNG, WEBP
                      <br />
                      Maximum file size: 30MB
                    </p>
                  </div>
                  <input
                    ref={refInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg, image/png, image/webp"
                    className="hidden"
                    onChange={handleRefFilesSelect}
                  />
                </div>
              )}
              {generationMode === "style_transfer" && brandLogo && (
                <div className="flex items-center gap-2 p-3 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-300">
                  <Layers className="h-4 w-4" /> Your brand logo will be
                  automatically added to the final image.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateImage}
              disabled={isGenerationDisabled}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
            >
              <Sparkles className="h-4 w-4" />{" "}
              {generationMode === "style_transfer"
                ? "Transfer Style"
                : generationMode === "edit"
                ? "Edit Image"
                : generationMode === "layers"
                ? "Composite Layers"
                : "Generate Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
