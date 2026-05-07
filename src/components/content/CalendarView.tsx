"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image"; // ✨ IMPORT NEXT/IMAGE
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Clock,
  Wand2,
  Loader2,
  ImageIcon,
  ArrowLeft,
  X,
  ExternalLink,
  Pencil,
  CheckCircle,
  AlertCircle,
  Smartphone,
  CirclePlay,
  LayoutGrid,
  MonitorPlay,
  Music,
  Instagram,
  Youtube
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content, ContentStatus, Platform } from "@/types/database";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  content: Content[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onUpdateContent: (updatedItem: Content) => void;
  onBulkUpdate: (updatedItems: Content[]) => void;
  hasMoreUnscheduled?: boolean;
  isLoadingMore?: boolean;
  onLoadMoreUnscheduled?: () => void;
}

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

const formatTimeForInput = (isoString: string | null | undefined) => {
  if (!isoString) return "10:00";
  const d = new Date(isoString);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

export function CalendarView({
  content,
  currentMonth,
  onMonthChange,
  onUpdateContent,
  onBulkUpdate,
  hasMoreUnscheduled,
  isLoadingMore,
  onLoadMoreUnscheduled,
}: CalendarViewProps) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();

  const [autoScheduling, setAutoScheduling] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [platformModalOpen, setPlatformModalOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const [publishSettings, setPublishSettings] = useState<PublishSettings>({});
  const [savingPlatforms, setSavingPlatforms] = useState(false);
  const [editingPostIsVideo, setEditingPostIsVideo] = useState(false);

  useEffect(() => {
    async function fetchPlatforms() {
      if (!clientId || !activeBrand) return;

      const { data } = await supabase
        .from("social_accounts")
        .select("platform")
        .eq("brand_id", activeBrand.id)
        .eq("is_active", true);

      if (data) {
        setConnectedPlatforms(Array.from(new Set(data.map((d) => d.platform))));
      }
    }
    fetchPlatforms();
  }, [clientId, activeBrand?.id]);

  // --- Calendar Date Math ---
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const monthName = currentMonth.toLocaleString("default", { month: "long" });

  const prevMonth = () => {
    onMonthChange(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };
  const nextMonth = () => {
    onMonthChange(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  // --- Segregate Content ---
  const scheduledPosts = content.filter((c) => (c as any).scheduled_at);
  const unscheduledPosts = content.filter((c) => !(c as any).scheduled_at);

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.setData("contentId", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetDay?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (targetDay !== undefined && dragOverDay !== targetDay) {
      setDragOverDay(targetDay);
    }
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDropToDate = async (e: React.DragEvent, targetDay: number) => {
    e.preventDefault();
    setDragOverDay(null);
    const id = e.dataTransfer.getData("contentId");
    setDraggedItemId(null);
    if (!id) return;

    const itemToUpdate = content.find((c) => c.id === id);
    if (!itemToUpdate) return;

    let hours = 10,
      minutes = 0;
    if ((itemToUpdate as any).scheduled_at) {
      const existingDate = new Date((itemToUpdate as any).scheduled_at);
      hours = existingDate.getHours();
      minutes = existingDate.getMinutes();
    }

    const targetDate = new Date(year, month, targetDay, hours, minutes, 0);

    if (targetDate.getTime() < Date.now()) {
      const now = new Date();
      if (
        targetDate.getDate() === now.getDate() &&
        targetDate.getMonth() === now.getMonth() &&
        targetDate.getFullYear() === now.getFullYear()
      ) {
        targetDate.setHours(now.getHours());
        targetDate.setMinutes(now.getMinutes() + 15);
      }
    }

    const isoDateString = targetDate.toISOString();

    const updatedItem = {
      ...itemToUpdate,
      scheduled_at: isoDateString,
    } as Content;

    onUpdateContent(updatedItem);

    try {
      await supabase
        .from("content")
        .update({ scheduled_at: isoDateString } as Record<string, unknown>)
        .eq("id", id);
    } catch (err) {
      console.error("Failed to schedule post:", err);
    }
  };

  const handleDropToUnscheduled = async (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("contentId");
    setDraggedItemId(null);
    if (!id) return;

    const itemToUpdate = content.find((c) => c.id === id);
    if (!itemToUpdate) return;

    const updatedItem = { ...itemToUpdate, scheduled_at: null } as Content;
    onUpdateContent(updatedItem);

    try {
      await supabase
        .from("content")
        .update({ scheduled_at: null } as Record<string, unknown>)
        .eq("id", id);
    } catch (err) {
      console.error("Failed to unschedule post:", err);
    }
  };

  const handleTimeChange = async (id: string, timeString: string) => {
    if (!selectedDay) return;
    const item = content.find((c) => c.id === id);
    if (!item) return;

    const [hours, minutes] = timeString.split(":").map(Number);
    const targetDate = new Date(year, month, selectedDay, hours, minutes, 0);
    const isoDateString = targetDate.toISOString();

    const updatedItem = { ...item, scheduled_at: isoDateString } as Content;
    onUpdateContent(updatedItem);

    await supabase
      .from("content")
      .update({ scheduled_at: isoDateString } as Record<string, unknown>)
      .eq("id", id);
  };

  const handleAutoSchedule = async () => {
    setAutoScheduling(true);
    try {
      const itemsToSchedule = [...unscheduledPosts];
      if (itemsToSchedule.length === 0) return;

      const updatedItems: Content[] = [];
      let scheduleDate = new Date();
      scheduleDate.setDate(scheduleDate.getDate() + 1);
      scheduleDate.setHours(10, 0, 0, 0);

      for (const item of itemsToSchedule) {
        const isoString = scheduleDate.toISOString();
        await supabase
          .from("content")
          .update({ scheduled_at: isoString } as Record<string, unknown>)
          .eq("id", item.id);
        updatedItems.push({ ...item, scheduled_at: isoString } as Content);
        scheduleDate.setDate(scheduleDate.getDate() + 1);
      }
      onBulkUpdate(updatedItems);
    } catch (error) {
      console.error("Auto schedule failed", error);
    } finally {
      setAutoScheduling(false);
    }
  };

  // ✨ Omni-Publishing Toggles for Modal
  const openPlatformModal = (post: Content) => {
    setEditingPostId(post.id);

    // ✨ FIX: Add (post as any) to bypass the missing TypeScript definition
    const images = parseArray(post.image_urls);
    const videos = parseArray((post as any).video_urls);
    const displayMedia = images[0] || videos[0];

    const isVideo = displayMedia && (post.content_type === "video" || post.content_type === "reel" || displayMedia.includes(".mp4") || displayMedia.includes(".mov") || videos.length > 0);
    setEditingPostIsVideo(!!isVideo);

    setPublishSettings(parsePublishSettings((post as any).target_platforms));
    setPlatformModalOpen(true);
  };

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

  const handleSavePlatforms = async () => {
    setSavingPlatforms(true);
    const postToUpdate = content.find((c) => c.id === editingPostId);
    if (postToUpdate) {
      // Save the complex object directly to Supabase
      const updatedItem = { ...postToUpdate, target_platforms: JSON.stringify(publishSettings) } as any;

      await supabase
        .from("content")
        .update({ target_platforms: publishSettings } as any)
        .eq("id", editingPostId);

      onUpdateContent(updatedItem); // This will trigger the parent CalendarPage to check the schedule
    }
    setPlatformModalOpen(false);
    setSavingPlatforms(false);
    setEditingPostId(null);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const selectedDayPosts = selectedDay
    ? scheduledPosts.filter((p) => {
      const pDate = new Date((p as any).scheduled_at);
      return (
        pDate.getDate() === selectedDay &&
        pDate.getMonth() === month &&
        pDate.getFullYear() === year
      );
    })
    : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start animate-in fade-in duration-500">
      {/* ─── LEFT: MAIN CALENDAR GRID (75%) ─── */}
      <div className="xl:col-span-3 rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg overflow-hidden flex flex-col min-h-[700px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#57707A]/30 bg-[#191D23]/40">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-[#DEDCDC] font-display w-40">
              {monthName} {year}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={prevMonth}
                className="h-8 w-8 p-0 bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextMonth}
                className="h-8 w-8 p-0 bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onMonthChange(new Date());
              setSelectedDay(new Date().getDate());
            }}
            className="bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white font-bold text-xs"
          >
            Today
          </Button>
        </div>

        <div className="flex-1 bg-[#191D23]/40 p-4">
          <div className="grid grid-cols-7 gap-[1px] rounded-xl overflow-hidden border border-[#57707A]/30 bg-[#57707A]/30 h-full">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="bg-[#2A2F38] py-2 text-center text-xs font-bold text-[#989DAA] uppercase tracking-wider"
              >
                {day}
              </div>
            ))}

            {blanks.map((b) => (
              <div key={`blank-${b}`} className="bg-[#191D23]/20 min-h-[120px]" />
            ))}

            {days.map((day) => {
              const dayPosts = scheduledPosts.filter((p) => {
                const pDate = new Date((p as any).scheduled_at);
                return (
                  pDate.getDate() === day &&
                  pDate.getMonth() === month &&
                  pDate.getFullYear() === year
                );
              });
              const isSelected = selectedDay === day;
              const isDragOver = dragOverDay === day;

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  onDragOver={(e) => handleDragOver(e, day)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropToDate(e, day)}
                  className={cn(
                    "bg-[#2A2F38] min-h-[120px] p-2 flex flex-col transition-all cursor-pointer border-2 relative",
                    isToday(day)
                      ? "bg-[#C5BAC4]/5 border-transparent"
                      : "hover:bg-[#57707A]/20 border-transparent",
                    isSelected
                      ? "border-[#C5BAC4] ring-2 ring-[#C5BAC4]/20 z-10"
                      : "",
                    isDragOver
                      ? "border-dashed border-[#C5BAC4] bg-[#C5BAC4]/10 shadow-inner z-20"
                      : ""
                  )}
                >
                  <div className="flex items-center justify-between mb-2 pointer-events-none">
                    <span
                      className={cn(
                        "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full",
                        isToday(day)
                          ? "bg-[#C5BAC4] text-[#191D23]"
                          : "text-[#989DAA]"
                      )}
                    >
                      {day}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[10px] text-[#57707A] font-bold uppercase tracking-widest">
                        {dayPosts.length} posts
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1 pointer-events-none">
                    {dayPosts.slice(0, 3).map((post) => {
                      const settingsObj = parsePublishSettings((post as any).target_platforms);
                      const enabledPlatforms = Object.keys(settingsObj).filter(k => settingsObj[k].enabled);
                      const hasNoPlatform = enabledPlatforms.length === 0;

                      return (
                        <div
                          key={post.id}
                          className={cn(
                            "border rounded p-1.5 shadow-sm transition-all",
                            hasNoPlatform
                              ? "bg-red-500/10 border-red-500/30 ring-1 ring-red-500/20"
                              : "bg-[#191D23] border-[#57707A]/40"
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            {hasNoPlatform ? (
                              <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 rounded flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Needs Platform
                              </span>
                            ) : (
                              enabledPlatforms.slice(0, 2).map((p: string) => (
                                <PlatformIcon key={p} platform={p as Platform} />
                              ))
                            )}
                          </div>
                          <p className="text-[10px] font-medium leading-tight text-[#989DAA] line-clamp-1">
                            {post.caption_short || post.caption || "No caption"}
                          </p>
                        </div>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-center text-[#C5BAC4] font-bold pt-1">
                        + {dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── RIGHT: DUAL-MODE SIDEBAR (25%) ─── */}
      <div
        className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg flex flex-col h-[700px] overflow-hidden relative"
        onDragOver={(e) => handleDragOver(e)}
        onDrop={handleDropToUnscheduled}
      >
        {/* MODE A: DEFAULT (UNSCHEDULED) */}
        {!selectedDay ? (
          <>
            <div className="p-4 border-b border-[#57707A]/30 bg-[#191D23]/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#DEDCDC] font-display">
                  Unscheduled
                </h3>
                <span className="bg-[#57707A]/50 text-[#DEDCDC] text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {unscheduledPosts.length}
                </span>
              </div>
              <Button
                onClick={handleAutoSchedule}
                disabled={autoScheduling || unscheduledPosts.length === 0}
                className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold gap-2 shadow-sm transition-colors"
              >
                {autoScheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}{" "}
                Magic Auto-Schedule
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#191D23]/20 custom-scrollbar">
              {unscheduledPosts.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-[#989DAA] font-bold">
                    All posts scheduled! 🎉
                  </p>
                </div>
              ) : (
                <>
                  {unscheduledPosts.map((post) => {
                    // ✨ FIX: Add (post as any) to bypass the missing TypeScript definition
                    const images = parseArray(post.image_urls);
                    const videos = parseArray((post as any).video_urls);
                    const displayMedia = images[0] || videos[0];

                    const isVideo =
                      displayMedia &&
                      (post.content_type === "video" ||
                        post.content_type === "reel" ||
                        displayMedia.includes(".mp4") ||
                        displayMedia.includes(".mov") ||
                        videos.length > 0);

                    const isDragging = draggedItemId === post.id;

                    return (
                      <div
                        key={post.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, post.id)}
                        onDragEnd={() => setDraggedItemId(null)}
                        className={cn(
                          "bg-[#2A2F38] border border-[#57707A]/40 rounded-xl p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-[#C5BAC4]/50 transition-all",
                          isDragging
                            ? "opacity-50 scale-95"
                            : "opacity-100 scale-100"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-[#57707A] hover:text-[#C5BAC4] pt-1 transition-colors">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          {displayMedia ? (
                            isVideo ? (
                              <video
                                src={`${displayMedia}#t=0.1`}
                                className="h-12 w-12 rounded-lg object-cover shrink-0 bg-black"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              // ✨ SWAPPED IMG FOR NEXT/IMAGE
                              <img
                                src={displayMedia}
                                alt="thumbnail"
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-lg object-cover shrink-0"
                              />
                            )
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-[#191D23] border border-[#57707A]/30 flex items-center justify-center shrink-0">
                              <ImageIcon className="h-5 w-5 text-[#57707A]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <StatusBadge status={post.status as ContentStatus} />
                            <p className="text-xs text-[#DEDCDC] line-clamp-2 font-medium mt-1.5">
                              {post.caption_short || post.caption || "No caption"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {hasMoreUnscheduled && (
                    <div className="pt-3 pb-6 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onLoadMoreUnscheduled}
                        disabled={isLoadingMore}
                        className="w-full max-w-[200px] text-xs font-bold bg-[#2A2F38] hover:bg-[#57707A]/20 text-[#DEDCDC] border-[#57707A]/40 shadow-sm"
                      >
                        {isLoadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                        {isLoadingMore ? "Loading..." : "Load More Posts"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
            {draggedItemId &&
              scheduledPosts.find((p) => p.id === draggedItemId) && (
                <div className="absolute inset-0 bg-[#C5BAC4]/10 border-2 border-dashed border-[#C5BAC4] backdrop-blur-[2px] flex items-center justify-center z-10 pointer-events-none transition-all">
                  <div className="bg-[#191D23] px-5 py-2.5 rounded-full shadow-xl text-sm font-bold text-[#C5BAC4] flex items-center gap-2 border border-[#C5BAC4]/30">
                    <X className="h-4 w-4" /> Drop to Unschedule
                  </div>
                </div>
              )}
          </>
        ) : (
          /* MODE B: DATE TRIGGERED */
          <>
            <div className="p-4 border-b border-[#57707A]/30 bg-[#C5BAC4]/5">
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1.5 text-xs text-[#C5BAC4] font-bold hover:text-white mb-3 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Unscheduled
              </button>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#DEDCDC] font-display">
                  {monthName} {selectedDay}, {year}
                </h3>
                <span className="bg-[#C5BAC4] text-[#191D23] text-xs font-bold px-2 py-0.5 rounded-full">
                  {selectedDayPosts.length} posts
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#191D23]/20 custom-scrollbar">
              {selectedDayPosts.length === 0 ? (
                <div className="text-center py-10 flex flex-col items-center gap-2">
                  <Clock className="h-8 w-8 text-[#57707A]" />
                  <p className="text-sm text-[#989DAA] font-bold">
                    No posts scheduled.
                  </p>
                  <p className="text-xs text-[#57707A]">
                    Drag posts here from the calendar to schedule them for this day.
                  </p>
                </div>
              ) : (
                selectedDayPosts.map((post) => {
                  // ✨ FIX: Add (post as any) to bypass the missing TypeScript definition
                  const images = parseArray(post.image_urls);
                  const videos = parseArray((post as any).video_urls);
                  const displayMedia = images[0] || videos[0];

                  const isVideo =
                    displayMedia &&
                    (post.content_type === "video" ||
                      post.content_type === "reel" ||
                      displayMedia.includes(".mp4") ||
                      displayMedia.includes(".mov") ||
                      videos.length > 0);

                  const timeVal = formatTimeForInput(
                    (post as any).scheduled_at
                  );
                  const isDragging = draggedItemId === post.id;

                  const settingsObj = parsePublishSettings((post as any).target_platforms);
                  const enabledPlatforms = Object.keys(settingsObj).filter(k => settingsObj[k].enabled);
                  const hasNoPlatform = enabledPlatforms.length === 0;

                  return (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragEnd={() => setDraggedItemId(null)}
                      className={cn(
                        "border rounded-xl p-3 shadow-sm transition-all relative group",
                        isDragging ? "opacity-50 scale-95" : "opacity-100",
                        hasNoPlatform ? "bg-red-500/5 border-red-500/30" : "bg-[#2A2F38] border-[#57707A]/40"
                      )}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="cursor-grab active:cursor-grabbing text-[#57707A] group-hover:text-[#C5BAC4] transition-colors pt-1">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        {displayMedia ? (
                          isVideo ? (
                            <video
                              src={`${displayMedia}#t=0.1`}
                              className="h-10 w-10 rounded-lg object-cover shrink-0 bg-black"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            // ✨ SWAPPED IMG FOR NEXT/IMAGE
                            <img
                              src={displayMedia}
                              alt="thumbnail"
                              width={40}
                              height={40}
                              className="h-10 w-10 rounded-lg object-cover shrink-0"
                            />
                          )
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-[#191D23] border border-[#57707A]/30 flex items-center justify-center shrink-0">
                            <ImageIcon className="h-4 w-4 text-[#57707A]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex gap-1 items-center">
                              {hasNoPlatform ? (
                                <button
                                  onClick={() => openPlatformModal(post)}
                                  className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold hover:bg-red-500/20 transition-colors animate-pulse"
                                >
                                  + Add Platform
                                </button>
                              ) : (
                                enabledPlatforms.map((p: string) => (
                                  <PlatformIcon key={p} platform={p as Platform} />
                                ))
                              )}
                            </div>
                            <StatusBadge
                              status={post.status as ContentStatus}
                            />
                          </div>
                          <p className="text-xs text-[#DEDCDC] line-clamp-2">
                            {post.caption_short || post.caption || "No caption"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-[#57707A]/20 pt-3 mt-2">
                        <label
                          className="flex items-center gap-1.5 bg-[#191D23] hover:bg-[#57707A]/20 border border-[#57707A]/40 px-2.5 py-1.5 rounded-md transition-colors group/time cursor-pointer shadow-inner"
                          title="Click to edit time"
                        >
                          <Clock className="h-3.5 w-3.5 text-[#C5BAC4] shrink-0" />
                          <input
                            type="time"
                            value={timeVal}
                            onClick={(e) => {
                              try {
                                (e.target as HTMLInputElement).showPicker();
                              } catch (err) { }
                            }}
                            onChange={(e) =>
                              handleTimeChange(post.id, e.target.value)
                            }
                            className="text-xs font-bold text-[#DEDCDC] bg-transparent border-none outline-none cursor-pointer p-0 m-0 w-[80px] focus:ring-0 color-scheme-dark"
                          />
                          <Pencil className="h-3 w-3 text-[#57707A] group-hover/time:text-[#C5BAC4] transition-colors opacity-50 group-hover/time:opacity-100 shrink-0" />
                        </label>

                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              const simulatedEvent = {
                                preventDefault: () => { },
                                dataTransfer: { getData: () => post.id },
                              } as unknown as React.DragEvent;
                              handleDropToUnscheduled(simulatedEvent);
                            }}
                            className="text-[10px] font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 px-2 py-1 rounded transition-colors"
                          >
                            Remove
                          </button>
                          <Link href={`/dashboard/content/${post.id}`}>
                            <button className="text-[10px] font-bold bg-[#191D23] hover:bg-[#57707A]/30 border border-[#57707A]/40 text-[#DEDCDC] px-2.5 py-1 rounded shadow-sm transition-colors flex items-center gap-1.5">
                              Edit <ExternalLink className="h-3 w-3" />
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={platformModalOpen} onOpenChange={setPlatformModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#2A2F38] text-[#DEDCDC] border-[#57707A]/50">
          <DialogHeader>
            <DialogTitle className="text-[#DEDCDC]">Select Target Platforms</DialogTitle>
            <DialogDescription className="text-[#989DAA]">
              Select the platforms and formats to distribute your generated content.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {connectedPlatforms.length === 0 ? (
              <div className="p-4 bg-[#191D23]/50 rounded-xl text-sm text-[#989DAA] border border-[#57707A]/30 text-center">
                No social accounts connected. <br />
                <a href="/dashboard/settings" className="text-[#C5BAC4] font-bold hover:text-white mt-2 inline-block">Go to Settings</a>
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
                      onClick={() => togglePlatform('instagram', editingPostIsVideo ? 'reel' : 'feed')}
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
                          <input type="radio" checked={publishSettings.instagram?.format === 'reel' || publishSettings.instagram?.format === 'feed'} onChange={() => setPlatformFormat('instagram', editingPostIsVideo ? 'reel' : 'feed')} className="text-pink-500 bg-[#191D23] border-[#57707A]/50 focus:ring-pink-500" />
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
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[#57707A]/30 pt-4 mt-2">
            <Button variant="outline" onClick={() => setPlatformModalOpen(false)} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20">Cancel</Button>
            <Button
              onClick={handleSavePlatforms}
              disabled={savingPlatforms || !isAnyPlatformSelected}
              className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold"
            >
              {savingPlatforms ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}