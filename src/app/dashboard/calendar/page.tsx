"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { CalendarView } from "@/components/content/CalendarView";
import type { Content } from "@/types/database";
import { cn } from "@/lib/utils";

const UNSCHEDULED_LIMIT = 20;

const HIDDEN_CONTENT_TYPES = ["sequence_clip", "generated_audio"];

// ✨ UPGRADED: Now seamlessly translates raw arrays from the modal into Omni-Objects
const parsePublishSettings = (data: any): any => {
  if (!data) return {};

  let parsed = data;
  if (typeof data === "string") {
    try { parsed = JSON.parse(data); } catch { return {}; }
  }

  // If the modal passed a legacy array (e.g. ['tiktok']), translate it instantly:
  if (Array.isArray(parsed)) {
    const newSettings: any = {};
    parsed.forEach(platform => {
      if (platform === 'tiktok') newSettings.tiktok = { enabled: true, format: 'post' };
      if (platform === 'instagram') newSettings.instagram = { enabled: true, format: 'reel' };
      if (platform === 'youtube') newSettings.youtube = { enabled: true, format: 'short' };
    });
    return newSettings;
  }

  return typeof parsed === 'object' ? parsed : {};
};

const isAnyPlatformEnabled = (settings: any) => {
  if (!settings) return false;
  return Object.values(settings).some((p: any) => p && p.enabled === true);
};

export default function CalendarPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [unscheduledOffset, setUnscheduledOffset] = useState(UNSCHEDULED_LIMIT);
  const [hasMoreUnscheduled, setHasMoreUnscheduled] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchContent = useCallback(async () => {
    if (!clientId) return;

    const { data: scheduled } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .not("content_type", "in", `(${HIDDEN_CONTENT_TYPES.join(',')})`)
      .not("scheduled_at", "is", null);

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
    // ✨ 1. Intercept and translate whatever the modal sent into the new Object format
    const publishSettings = parsePublishSettings((updatedItem as any).target_platforms);

    // Replace the raw array with the standardized object locally
    const standardizedItem = {
      ...updatedItem,
      target_platforms: publishSettings
    };

    setContent((prev) =>
      prev.map((item) => (item.id === standardizedItem.id ? standardizedItem : item))
    );

    if ((standardizedItem as any).scheduled_at) {

      // Now the check will pass successfully!
      if (!isAnyPlatformEnabled(publishSettings)) {
        setMessage({
          type: "error",
          text: "⚠️ Post placed on calendar. Click 'Add Platform' to enable auto-publishing."
        });
        return;
      }

      setMessage({ type: "info", text: "Syncing schedule with social platforms..." });

      try {
        // ✨ 2. Force sync the translated Object format back to Supabase
        // This ensures the database matches the new backend format, even if the modal only saved an array.
        await supabase
          .from("content")
          .update({ target_platforms: publishSettings } as any)
          .eq("id", standardizedItem.id);

        const res = await fetch("/api/social-posts/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: standardizedItem.id,
            clientId: clientId,
            scheduledAt: (standardizedItem as any).scheduled_at,
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
          const publishSettings = parsePublishSettings((item as any).target_platforms);

          if (!isAnyPlatformEnabled(publishSettings)) {
            skippedCount++;
            continue;
          }

          // Force sync bulk items too
          await supabase
            .from("content")
            .update({ target_platforms: publishSettings } as any)
            .eq("id", item.id);

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
      <div className="flex justify-center py-32">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {message && (
        <div
          className={cn(
            "px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-3 transition-all shadow-lg animate-in slide-in-from-top-4",
            message.type === "success"
              ? "bg-[#B3FF00]/10 text-[#B3FF00] border border-[#B3FF00]/20"
              : message.type === "info"
                ? "bg-[#C5BAC4]/10 text-[#C5BAC4] border border-[#C5BAC4]/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : message.type === "info" ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="leading-relaxed tracking-wide">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto p-1 hover:bg-black/20 rounded-full transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-[#191D23] rounded-2xl border border-[#57707A]/30 shadow-xl md:p-6 min-h-[600px] overflow-hidden">
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