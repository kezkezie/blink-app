"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { supabase } from "@/lib/supabase";
import type { Content, ContentStatus, Platform } from "@/types/database";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  content: Content[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onUpdateContent: (updatedItem: Content) => void;
  onBulkUpdate: (updatedItems: Content[]) => void;
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
}: CalendarViewProps) {
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
      {/* ─── LEFT: MAIN CALENDAR GRID (75%) ─── */}
      <div className="xl:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[700px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-blink-dark font-heading w-40">
              {monthName} {year}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={prevMonth}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextMonth}
                className="h-8 w-8 p-0"
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
          >
            Today
          </Button>
        </div>

        <div className="flex-1 bg-gray-50/50 p-4">
          <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-200 h-full">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="bg-white py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                {day}
              </div>
            ))}

            {blanks.map((b) => (
              <div key={`blank-${b}`} className="bg-gray-50 min-h-[120px]" />
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
                    "bg-white min-h-[120px] p-2 flex flex-col transition-all cursor-pointer border-2",
                    isToday(day)
                      ? "bg-blink-primary/5 border-transparent"
                      : "hover:bg-gray-50 border-transparent",
                    isSelected
                      ? "border-blink-primary ring-2 ring-blink-primary/20"
                      : "",
                    isDragOver
                      ? "border-dashed border-blink-primary bg-blink-primary/10 shadow-inner z-10"
                      : ""
                  )}
                >
                  <div className="flex items-center justify-between mb-2 pointer-events-none">
                    <span
                      className={cn(
                        "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                        isToday(day)
                          ? "bg-blink-primary text-white"
                          : "text-gray-500"
                      )}
                    >
                      {day}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">
                        {dayPosts.length} posts
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1 pointer-events-none">
                    {dayPosts.slice(0, 3).map((post) => {
                      const platforms = parseArray(post.target_platforms);
                      return (
                        <div
                          key={post.id}
                          className="bg-gray-50 border border-gray-100 rounded p-1.5 shadow-sm"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            {platforms.slice(0, 2).map((p: Platform) => (
                              <PlatformIcon key={p} platform={p} />
                            ))}
                          </div>
                          <p className="text-[10px] leading-tight text-gray-600 line-clamp-1">
                            {post.caption_short || post.caption || "No caption"}
                          </p>
                        </div>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-center text-blink-primary font-medium pt-1">
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
        className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col h-[700px] overflow-hidden relative"
        onDragOver={(e) => handleDragOver(e)}
        onDrop={handleDropToUnscheduled}
      >
        {/* MODE A: DEFAULT (UNSCHEDULED) */}
        {!selectedDay ? (
          <>
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-blink-dark font-heading">
                  Unscheduled
                </h3>
                <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {unscheduledPosts.length}
                </span>
              </div>
              <Button
                onClick={handleAutoSchedule}
                disabled={autoScheduling || unscheduledPosts.length === 0}
                className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 shadow-sm"
              >
                {autoScheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}{" "}
                Magic Auto-Schedule
              </Button>
              <p className="text-[10px] text-center text-gray-500 mt-2">
                Automatically assigns 1 post per day.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/30">
              {unscheduledPosts.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-400 font-medium">
                    All posts scheduled! 🎉
                  </p>
                </div>
              ) : (
                unscheduledPosts.map((post) => {
                  const displayImage = parseArray(post.image_urls)[0];
                  const isDragging = draggedItemId === post.id;

                  return (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragEnd={() => setDraggedItemId(null)}
                      className={cn(
                        "bg-white border border-gray-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-blink-primary/50 transition-all",
                        isDragging
                          ? "opacity-50 scale-95"
                          : "opacity-100 scale-100"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-gray-300 pt-1">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        {displayImage ? (
                          <img
                            src={displayImage}
                            alt="thumbnail"
                            className="h-10 w-10 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                            <ImageIcon className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <StatusBadge status={post.status as ContentStatus} />
                          <p className="text-xs text-gray-600 line-clamp-2 font-medium mt-1">
                            {post.caption_short || post.caption || "No caption"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {draggedItemId &&
              scheduledPosts.find((p) => p.id === draggedItemId) && (
                <div className="absolute inset-0 bg-blink-primary/10 border-2 border-dashed border-blink-primary backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none transition-all">
                  <div className="bg-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold text-blink-primary flex items-center gap-2">
                    <X className="h-4 w-4" /> Drop to Unschedule
                  </div>
                </div>
              )}
          </>
        ) : (
          /* MODE B: DATE TRIGGERED */
          <>
            <div className="p-4 border-b border-gray-100 bg-blink-primary/5">
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1 text-xs text-blink-primary font-medium hover:underline mb-2"
              >
                <ArrowLeft className="h-3 w-3" /> Back to Unscheduled
              </button>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blink-dark font-heading">
                  {monthName} {selectedDay}, {year}
                </h3>
                <span className="bg-blink-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {selectedDayPosts.length} posts
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/30">
              {selectedDayPosts.length === 0 ? (
                <div className="text-center py-10 flex flex-col items-center gap-2">
                  <Clock className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-400 font-medium">
                    No posts scheduled.
                  </p>
                  <p className="text-xs text-gray-400">
                    Drag posts here from the calendar to schedule them for this
                    day.
                  </p>
                </div>
              ) : (
                selectedDayPosts.map((post) => {
                  const displayImage = parseArray(post.image_urls)[0];
                  const timeVal = formatTimeForInput(
                    (post as any).scheduled_at
                  );
                  const isDragging = draggedItemId === post.id;

                  return (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragEnd={() => setDraggedItemId(null)}
                      className={cn(
                        "bg-white border border-gray-200 rounded-lg p-3 shadow-sm transition-all relative group",
                        isDragging ? "opacity-50 scale-95" : "opacity-100"
                      )}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="cursor-grab active:cursor-grabbing text-gray-300 group-hover:text-blink-primary pt-1">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        {displayImage ? (
                          <img
                            src={displayImage}
                            alt="thumbnail"
                            className="h-10 w-10 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                            <ImageIcon className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex gap-1">
                              {parseArray(post.target_platforms).map(
                                (p: Platform) => (
                                  <PlatformIcon key={p} platform={p} />
                                )
                              )}
                            </div>
                            <StatusBadge
                              status={post.status as ContentStatus}
                            />
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {post.caption_short || post.caption || "No caption"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                        {/* ✨ FIXED: Wrapped in <label>, increased width, and added showPicker() */}
                        <label
                          className="flex items-center gap-1.5 bg-gray-100 hover:bg-blink-primary/10 border border-gray-200 hover:border-blink-primary/30 px-2.5 py-1.5 rounded-md transition-colors group/time cursor-pointer"
                          title="Click to edit time"
                        >
                          <Clock className="h-3.5 w-3.5 text-blink-primary shrink-0" />
                          <input
                            type="time"
                            value={timeVal}
                            onClick={(e) => {
                              try {
                                (e.target as HTMLInputElement).showPicker();
                              } catch (err) {}
                            }}
                            onChange={(e) =>
                              handleTimeChange(post.id, e.target.value)
                            }
                            className="text-xs font-bold text-blink-dark bg-transparent border-none outline-none cursor-pointer p-0 m-0 w-[90px] focus:ring-0"
                          />
                          <Pencil className="h-3 w-3 text-gray-400 group-hover/time:text-blink-primary transition-colors opacity-50 group-hover/time:opacity-100 shrink-0" />
                        </label>

                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              const simulatedEvent = {
                                preventDefault: () => {},
                                dataTransfer: { getData: () => post.id },
                              } as unknown as React.DragEvent;
                              handleDropToUnscheduled(simulatedEvent);
                            }}
                            className="text-[10px] font-medium text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                          >
                            Remove
                          </button>
                          <Link href={`/dashboard/content/${post.id}`}>
                            <button className="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition-colors flex items-center gap-1">
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
    </div>
  );
}
