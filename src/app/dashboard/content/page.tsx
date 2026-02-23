"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LayoutGrid,
  Calendar,
  Filter,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/content/ContentCard";
import { CalendarView } from "@/components/content/CalendarView";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import type { Content, ContentStatus, Platform } from "@/types/database";

const statusFilters: { label: string; value: ContentStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending_approval" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Published", value: "posted" },
];

const platformFilters: { label: string; value: Platform | "all" }[] = [
  { label: "All Platforms", value: "all" },
  { label: "📸 Instagram", value: "instagram" },
  { label: "🎵 TikTok", value: "tiktok" },
  { label: "📘 Facebook", value: "facebook" },
  { label: "🐦 Twitter", value: "twitter" },
  { label: "💼 LinkedIn", value: "linkedin" },
];

const ITEMS_PER_PAGE = 12;

export default function ContentPage() {
  const { clientId, loading: clientLoading } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<"list" | "calendar">("list");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">(
    "all"
  );
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!clientId) return;
    async function fetchContent() {
      try {
        const { data, error } = await supabase
          .from("content")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });
        if (error) {
          console.error("Error fetching content:", error);
          return;
        }
        setContent((data || []) as unknown as Content[]);
      } catch (err) {
        console.error("Content fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchContent();
  }, [clientId]);

  // ✨ NEW: Real-time update handlers for the Calendar drag & drop
  const handleUpdateContent = (updatedItem: Content) => {
    setContent((prev) =>
      prev.map((c) => (c.id === updatedItem.id ? updatedItem : c))
    );
  };

  const handleBulkUpdate = (updatedItems: Content[]) => {
    setContent((prev) => {
      const newArray = [...prev];
      updatedItems.forEach((updated) => {
        const idx = newArray.findIndex((c) => c.id === updated.id);
        if (idx !== -1) newArray[idx] = updated;
      });
      return newArray;
    });
  };

  const filteredContent = useMemo(() => {
    let result = content;
    if (statusFilter !== "all")
      result = result.filter((c) => c.status === statusFilter);
    if (platformFilter !== "all")
      result = result.filter((c) =>
        c.target_platforms?.includes(platformFilter as Platform)
      );
    return result;
  }, [content, statusFilter, platformFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, platformFilter, view]);

  const totalPages = Math.ceil(filteredContent.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedContent = filteredContent.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  if (loading || clientLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "list"
                ? "bg-white text-blink-dark shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <LayoutGrid className="h-4 w-4" /> List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "calendar"
                ? "bg-white text-blink-dark shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Calendar className="h-4 w-4" /> Calendar
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ContentStatus | "all")
            }
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blink-primary/20 focus:border-blink-primary cursor-pointer"
          >
            {statusFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={platformFilter}
            onChange={(e) =>
              setPlatformFilter(e.target.value as Platform | "all")
            }
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blink-primary/20 focus:border-blink-primary cursor-pointer"
          >
            {platformFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400 ml-1">
            {filteredContent.length} post
            {filteredContent.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filteredContent.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No content found</p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter !== "all" || platformFilter !== "all"
              ? "Try adjusting your filters"
              : "Generate your first batch of content to get started"}
          </p>
        </div>
      ) : view === "list" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedContent.map((item) => (
              <ContentCard key={item.id} content={item} clientId={clientId} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4 pb-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="gap-1 shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-gray-500 font-medium min-w-[100px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="gap-1 shadow-sm"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* ✨ NEW: Pass the update functions to the Calendar */
        <CalendarView
          content={filteredContent}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onUpdateContent={handleUpdateContent}
          onBulkUpdate={handleBulkUpdate}
        />
      )}
    </div>
  );
}
