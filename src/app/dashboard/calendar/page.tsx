"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Loader2 } from "lucide-react";
import { CalendarView } from "@/components/content/CalendarView";
import type { Content } from "@/types/database";

export default function CalendarPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  // ✨ ADDED: State for the current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    async function fetchContent() {
      if (!clientId) return;
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (data) setContent(data as unknown as Content[]);
      setLoading(false);
    }

    fetchContent();
  }, [clientId]);

  // ✨ ADDED: Function to handle a single item being dragged/dropped
  const handleUpdateContent = (updatedItem: Content) => {
    setContent((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  // ✨ ADDED: Function to handle the "Magic Auto-Schedule" button
  const handleBulkUpdate = (updatedItems: Content[]) => {
    setContent((prev) => {
      const newContent = [...prev];
      updatedItems.forEach((updated) => {
        const idx = newContent.findIndex((item) => item.id === updated.id);
        if (idx !== -1) newContent[idx] = updated;
      });
      return newContent;
    });
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 min-h-[600px]">
        {/* ✨ FIXED: Passing all required properties to the component */}
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
