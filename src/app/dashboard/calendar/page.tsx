"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { CalendarView } from "@/components/content/CalendarView";
import type { Content } from "@/types/database";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  // State for the current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Notification state for visual feedback when scheduling
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const fetchContent = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (data) setContent(data as unknown as Content[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // ✨ Intercepts drag-and-drop and pushes to PostForMe safely
  const handleUpdateContent = async (updatedItem: Content) => {
    // 1. Always optimistically update the UI instantly so the drop is smooth
    setContent((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );

    // 2. Check if they are trying to schedule it
    // ✨ FIX: Using TypeScript bypass to safely check properties
    if ((updatedItem as any).scheduled_at) {

      const targetPlatforms = (updatedItem as any).target_platforms || [];

      // If they haven't selected a platform, don't crash and don't revert. 
      // Just warn them. The UI will show the red outline automatically.
      if (targetPlatforms.length === 0) {
        setMessage({
          type: "error",
          text: "⚠️ Post placed on calendar. Click 'Add Platform' to enable auto-publishing."
        });
        return; // Stop here, do not call the API!
      }

      // If they DO have a platform selected, proceed with pushing to PostForMe
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
        fetchContent(); // If the actual API fails, we snap it back.
      }
    }
  };

  // ✨ Processes all items created by the "Magic Auto-Schedule" button
  const handleBulkUpdate = async (updatedItems: Content[]) => {
    setMessage({ type: "info", text: "Checking platform selections and auto-scheduling..." });

    try {
      let successCount = 0;
      let skippedCount = 0;

      // Loop through and push each newly scheduled post to PostForMe
      for (const item of updatedItems) {
        // ✨ FIX: Cast to any
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
              // ✨ FIX: Cast to any
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

      await fetchContent(); // Reload to get the fresh accurate state from the DB

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

      {/* ✨ Notification Banner */}
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
        />
      </div>
    </div>
  );
}