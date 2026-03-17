"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { CalendarView } from "@/components/content/CalendarView";
import type { Content } from "@/types/database";
import { cn } from "@/lib/utils";

const UNSCHEDULED_LIMIT = 20;

// ✨ FIX: Targeting exactly how your Supabase database saves them
const HIDDEN_CONTENT_TYPES = ["sequence_clip", "generated_audio"];

export default function CalendarPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  // State for the current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Notification state
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Pagination States
  const [unscheduledOffset, setUnscheduledOffset] = useState(UNSCHEDULED_LIMIT);
  const [hasMoreUnscheduled, setHasMoreUnscheduled] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Smart fetching (All Scheduled + Paginated Unscheduled)
  const fetchContent = useCallback(async () => {
    if (!clientId) return;

    // 1. Fetch ALL scheduled posts 
    const { data: scheduled } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .not("content_type", "in", `(${HIDDEN_CONTENT_TYPES.join(',')})`)
      .not("scheduled_at", "is", null);

    // 2. Fetch Unscheduled posts up to the current offset 
    const { data: unscheduled } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .not("content_type", "in", `(${HIDDEN_CONTENT_TYPES.join(',')})`)
      .is("scheduled_at", null)
      .order("created_at", { ascending: false })
      .range(0, unscheduledOffset - 1);

    if (scheduled && unscheduled) {
      setContent([...scheduled, ...(unscheduled as any[])]);
      setHasMoreUnscheduled(unscheduled.length === unscheduledOffset);
    }
    setLoading(false);
  }, [clientId, unscheduledOffset]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Function to load the next page of unscheduled posts
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const newOffset = unscheduledOffset + UNSCHEDULED_LIMIT;

    const { data: moreUnscheduled } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .not("content_type", "in", `(${HIDDEN_CONTENT_TYPES.join(',')})`)
      .is("scheduled_at", null)
      .order("created_at", { ascending: false })
      .range(unscheduledOffset, newOffset - 1);

    if (moreUnscheduled && moreUnscheduled.length > 0) {
      setContent(prev => [...prev, ...(moreUnscheduled as any[])]);
      setHasMoreUnscheduled(moreUnscheduled.length === UNSCHEDULED_LIMIT);
      setUnscheduledOffset(newOffset);
    } else {
      setHasMoreUnscheduled(false);
    }
    setIsLoadingMore(false);
  };

  const handleUpdateContent = async (updatedItem: Content) => {
    setContent((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );

    if ((updatedItem as any).scheduled_at) {
      const targetPlatforms = (updatedItem as any).target_platforms || [];

      if (targetPlatforms.length === 0) {
        setMessage({
          type: "error",
          text: "⚠️ Post placed on calendar. Click 'Add Platform' to enable auto-publishing."
        });
        return;
      }

      setMessage({ type: "info", text: "Syncing schedule with social platforms..." });

      try {
        const res = await fetch("/api/social-posts/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: updatedItem.id,
            clientId: clientId,
            scheduledAt: (updatedItem as any).scheduled_at,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to schedule post");
        }

        setMessage({ type: "success", text: "Post successfully scheduled! 🚀" });
        setTimeout(() => setMessage(null), 3000);
      } catch (err: any) {
        console.error("Scheduling Error:", err);
        setMessage({ type: "error", text: err.message });
        fetchContent();
      }
    }
  };

  const handleBulkUpdate = async (updatedItems: Content[]) => {
    setMessage({ type: "info", text: "Checking platform selections and auto-scheduling..." });

    try {
      let successCount = 0;
      let skippedCount = 0;

      for (const item of updatedItems) {
        if ((item as any).scheduled_at) {
          const targetPlatforms = (item as any).target_platforms || [];
          if (targetPlatforms.length === 0) {
            skippedCount++;
            continue;
          }

          const res = await fetch("/api/social-posts/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentId: item.id,
              clientId: clientId,
              scheduledAt: (item as any).scheduled_at,
            }),
          });

          if (res.ok) {
            successCount++;
          } else {
            console.error(`Failed to schedule item ${item.id}`, await res.json());
          }
        }
      }

      await fetchContent();

      if (skippedCount > 0) {
        setMessage({ type: "error", text: `Scheduled ${successCount} posts. Skipped ${skippedCount} posts because they lacked target platforms.` });
      } else if (successCount > 0) {
        setMessage({ type: "success", text: `Successfully scheduled ${successCount} posts! 🚀` });
      } else {
        setMessage({ type: "error", text: `Failed to schedule posts. Make sure you select platforms first.` });
      }

      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error("Bulk Scheduling Error:", err);
      setMessage({ type: "error", text: "An error occurred while auto-scheduling." });
      fetchContent();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {message && (
        <div
          className={cn(
            "px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm",
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : message.type === "info"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : message.type === "info" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="leading-relaxed">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto p-0.5 hover:bg-black/5 rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 min-h-[600px]">
        <CalendarView
          content={content}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onUpdateContent={handleUpdateContent}
          onBulkUpdate={handleBulkUpdate}
          hasMoreUnscheduled={hasMoreUnscheduled}
          isLoadingMore={isLoadingMore}
          onLoadMoreUnscheduled={handleLoadMore}
        />
      </div>
    </div>
  );
}