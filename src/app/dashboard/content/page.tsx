"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { ContentCard } from "@/components/content/ContentCard";
import { Loader2, Trash2, CheckSquare, Film, Clapperboard, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Content } from "@/types/database";
import { useBrandStore } from "@/app/store/useBrandStore";

export default function ContentPage() {
  const { clientId } = useClient();
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeBrand } = useBrandStore();

  const [activeTab, setActiveTab] = useState<"finished" | "sequences">("finished");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  async function fetchContent() {
    if (!clientId || !activeBrand) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let query = supabase
      .from("content")
      .select("*")
      .eq("brand_id", activeBrand.id)
      .order("created_at", { ascending: false });

    if (activeTab === "finished") {
      // ✨ Hide all variations of raw/sequence clips from the main feed
      query = query
        .neq("content_type", "raw_clip")
        .neq("content_type", "sequence_clip")
        .neq("content_type", "story_sequence")
        .neq("content_type", "storyboard")
        .neq("content_type", "generated_audio");
    } else if (activeTab === "sequences") {
      // ✨ FIXED: Use .in() to catch multiple variations of sequence naming!
      query = query.in("content_type", [
        "sequence_clip",
        "story_sequence",
        "storyboard",
        "story"
      ]);
    }

    const { data } = await query;
    if (data) setContent(data as unknown as Content[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchContent();
    setSelectedIds(new Set());
  }, [clientId, activeBrand?.id, activeTab]);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === content.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(content.map((c) => c.id)));
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
      await fetchContent();
    } catch (err) {
      console.error("Failed to delete", err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!activeBrand && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in duration-500">
        <div className="mx-auto h-20 w-20 bg-[#191D23] border border-[#57707A]/40 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
          <Briefcase className="h-10 w-10 text-[#57707A]" />
        </div>
        <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">No Workspace Selected</h2>
        <p className="text-[#989DAA] mt-3 max-w-md mx-auto leading-relaxed mb-8">
          Please select or create a brand from the top navigation bar to view its content library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">

      {/* ── TAB SWITCHER ── */}
      <div className="flex gap-1 p-1 bg-[#2A2F38] border border-[#57707A]/30 rounded-xl w-fit shadow-sm">
        <button
          onClick={() => setActiveTab("finished")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "finished"
              ? "bg-[#57707A] text-[#DEDCDC] shadow-sm"
              : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#57707A]/10"
          )}
        >
          <Film className="h-4 w-4" /> Finished Content
        </button>
        <button
          onClick={() => setActiveTab("sequences")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200",
            activeTab === "sequences"
              ? "bg-[#57707A] text-[#DEDCDC] shadow-sm"
              : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#57707A]/10"
          )}
        >
          <Clapperboard className="h-4 w-4" /> Story Sequences
        </button>
      </div>

      {/* ── SELECTION CONTROL BAR ── */}
      <div className="flex items-center justify-between bg-[#2A2F38] p-4 rounded-xl border border-[#57707A]/40 shadow-lg sticky top-20 z-20 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
            className="text-xs font-bold border-[#57707A]/50 bg-[#191D23] text-[#DEDCDC]/70 hover:bg-[#57707A]/30 hover:text-[#DEDCDC] transition-colors h-9"
          >
            <CheckSquare className="h-4 w-4 mr-2 opacity-70" />
            {selectedIds.size === content.length && content.length > 0
              ? "Deselect All"
              : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <span className="text-sm font-bold text-[#C5BAC4] animate-in fade-in slide-in-from-left-2">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {selectedIds.size > 0 && (
          <Button
            onClick={handleBatchDelete}
            disabled={isDeleting}
            variant="destructive"
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 shadow-sm h-9 text-xs font-bold transition-colors animate-in zoom-in duration-200"
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

      {/* ── CONTENT GRID ── */}
      {loading ? (
        <div className="flex justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
        </div>
      ) : content.length === 0 ? (
        <div className="text-center py-32 bg-[#2A2F38] border border-[#57707A]/30 rounded-2xl shadow-inner flex flex-col items-center justify-center">
          <div className="h-16 w-16 bg-[#191D23] rounded-full flex items-center justify-center mb-4 border border-[#57707A]/30">
            {activeTab === "finished" ? (
              <Film className="h-6 w-6 text-[#57707A]" />
            ) : (
              <Clapperboard className="h-6 w-6 text-[#57707A]" />
            )}
          </div>
          <p className="text-[#DEDCDC] font-bold text-lg">
            {activeTab === "finished" ? "No content found." : "No sequences found."}
          </p>
          <p className="text-sm text-[#989DAA] mt-2 max-w-sm">
            {activeTab === "finished"
              ? "Head over to the Video Studio to generate your first cinematic clip!"
              : "Head to the Video Studio and build a Storytelling B-Roll to see your raw sequences here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {content.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "relative group rounded-2xl transition-all duration-300",
                  isSelected
                    ? "ring-2 ring-red-400/80 scale-[0.98] shadow-lg shadow-red-500/10"
                    : "hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1"
                )}
              >
                {/* Custom Checkbox overlay */}
                <div
                  onClick={() => toggleSelect(item.id)}
                  className={cn(
                    "absolute top-4 left-4 z-10 h-7 w-7 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all backdrop-blur-md shadow-sm",
                    isSelected
                      ? "bg-red-500/90 border-red-400 text-white"
                      : "bg-[#191D23]/60 border-[#DEDCDC]/40 hover:bg-[#57707A]/80 hover:border-[#DEDCDC] opacity-0 group-hover:opacity-100 text-transparent hover:text-white/50"
                  )}
                >
                  <CheckSquare className="h-4 w-4" />
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