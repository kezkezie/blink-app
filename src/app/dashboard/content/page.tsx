"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { ContentCard } from "@/components/content/ContentCard";
import { Loader2, Trash2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Content } from "@/types/database";

export default function ContentPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  // ✨ Batch Deletion State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  async function fetchContent() {
    if (!clientId) return;
    setLoading(true);
    const { data } = await supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (data) setContent(data as unknown as Content[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchContent();
  }, [clientId]);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === content.length) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      setSelectedIds(new Set(content.map((c) => c.id))); // Select all
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} posts?`))
      return;

    setIsDeleting(true);
    try {
      await supabase.from("content").delete().in("id", Array.from(selectedIds));
      setSelectedIds(new Set());
      await fetchContent(); // Refresh the list
    } catch (err) {
      console.error("Failed to delete", err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="space-y-6 pb-20">
      {/* ✨ Floating Batch Action Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm sticky top-20 z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
            className="text-xs font-medium border-gray-300"
          >
            <CheckSquare className="h-4 w-4 mr-2 text-gray-500" />
            {selectedIds.size === content.length && content.length > 0
              ? "Deselect All"
              : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <span className="text-sm font-medium text-blink-primary">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {selectedIds.size > 0 && (
          <Button
            onClick={handleBatchDelete}
            disabled={isDeleting}
            variant="destructive"
            className="bg-red-500 hover:bg-red-600 text-white shadow-sm"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Selected
          </Button>
        )}
      </div>

      {content.length === 0 ? (
        <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 font-medium">
            No content found. Go generate some!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {content.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`relative group rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-red-400 scale-[0.98]"
                    : "hover:shadow-md"
                }`}
              >
                {/* Overlay Checkbox */}
                <div
                  onClick={() => toggleSelect(item.id)}
                  className={`absolute top-3 left-3 z-10 h-6 w-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors backdrop-blur-sm
                    ${
                      isSelected
                        ? "bg-red-500 border-red-500 text-white"
                        : "bg-white/50 border-white hover:bg-white"
                    }`}
                >
                  {isSelected && <CheckSquare className="h-4 w-4" />}
                </div>

                <ContentCard content={item} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
