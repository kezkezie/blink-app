"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  CheckCircle,
  Send,
  Sparkles,
  ArrowRight,
  ImageIcon,
  Loader2,
  Video, // ✨ NEW: Added Video icon for fallback
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import type { Content, ContentStatus, Platform } from "@/types/database";

interface Stats {
  total: number;
  pending: number;
  approved: number;
  published: number;
}

// ✨ NEW: Exact same blacklist from the calendar to keep the dashboard clean
const HIDDEN_CONTENT_TYPES = ["sequence_clip", "audio", "voiceover", "audio_clip", "generated_audio"];

const statCards = [
  {
    key: "total" as const,
    label: "Total Posts",
    icon: FileText,
    color: "text-[#C5BAC4]",
    bg: "bg-[#C5BAC4]/10 border border-[#C5BAC4]/20",
  },
  {
    key: "pending" as const,
    label: "Pending Approval",
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border border-amber-500/20",
  },
  {
    key: "approved" as const,
    label: "Approved",
    icon: CheckCircle,
    color: "text-[#B3FF00]",
    bg: "bg-[#B3FF00]/10 border border-[#B3FF00]/20",
  },
  {
    key: "published" as const,
    label: "Published",
    icon: Send,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border border-blue-500/20",
  },
];

// Helper to safely parse stringified DB arrays
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

export default function DashboardPage() {
  const { clientId, loading: clientLoading } = useClient();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    approved: 0,
    published: 0,
  });
  const [recentContent, setRecentContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;

    async function fetchData() {
      try {
        // Fetch all content, but ✨ FILTER OUT the internal editor clips and audios
        const { data, error } = await supabase
          .from("content")
          .select("*")
          .eq("client_id", clientId)
          .not("content_type", "in", `(${HIDDEN_CONTENT_TYPES.join(',')})`)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching content:", error);
          setLoading(false);
          return;
        }

        const all = (data || []) as unknown as Content[];

        // Compute stats
        setStats({
          total: all.length,
          pending: all.filter((c) => c.status === "pending_approval").length,
          approved: all.filter((c) => c.status === "approved").length,
          published: all.filter((c) => c.status === "posted").length,
        });

        // Recent 5
        setRecentContent(all.slice(0, 5));
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [clientId]);

  if (loading || clientLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#C5BAC4]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="rounded-xl border border-[#57707A]/30 bg-[#2A2F38] p-5 shadow-lg transition-all hover:-translate-y-0.5 hover:border-[#57707A]/60"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#DEDCDC] font-display">
                  {stats[card.key]}
                </p>
                <p className="text-xs text-[#989DAA] font-medium uppercase tracking-wider mt-0.5">
                  {card.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Generate CTA */}
      <div className="relative rounded-2xl border border-[#C5BAC4]/30 bg-[#2A2F38] p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-[#C5BAC4]/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="rounded-xl bg-[#C5BAC4]/20 border border-[#C5BAC4]/30 p-4 shadow-inner">
            <Sparkles className="h-7 w-7 text-[#C5BAC4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#DEDCDC] font-display">
              Generate New Content
            </h3>
            <p className="text-sm text-[#989DAA] mt-1">
              Let AI create captions, images, and a full content plan in minutes.
            </p>
          </div>
        </div>
        <Link href="/dashboard/generate" className="relative z-10 w-full sm:w-auto">
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-[#C5BAC4]/20 transition-all duration-200">
            <Sparkles className="h-4 w-4" />
            Generate Now
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
      </div>

      {/* Recent Content */}
      <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#57707A]/30 bg-[#191D23]/40">
          <h2 className="text-lg font-bold text-[#DEDCDC] font-display">
            Recent Content
          </h2>
          <Link
            href="/dashboard/content"
            className="text-sm text-[#C5BAC4] hover:text-white font-medium flex items-center gap-1.5 transition-colors"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentContent.length === 0 ? (
          <div className="px-6 py-16 text-center flex flex-col items-center justify-center">
            <div className="h-16 w-16 bg-[#191D23] rounded-full flex items-center justify-center mb-4 border border-[#57707A]/30 shadow-inner">
              <FileText className="h-6 w-6 text-[#57707A]" />
            </div>
            <p className="text-[#DEDCDC] font-bold">No content yet</p>
            <p className="text-sm text-[#989DAA] mt-1">
              Hit &quot;Generate&quot; to create your first batch of posts.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#57707A]/20">
            {recentContent.map((item) => {
              const imageUrlsArray = parseArray(item.image_urls);
              const displayImage = imageUrlsArray[0];
              const platformsArray = parseArray(item.target_platforms);

              // ✨ NEW: Detect if the URL is a video format
              const isVideo = displayImage && displayImage.match(/\.(mp4|mov|webm)$/i);

              return (
                <li key={item.id}>
                  <Link
                    href={`/dashboard/content/${item.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-[#57707A]/10 transition-colors group"
                  >
                    {/* ✨ UPDATED: Smart Thumbnail Renderer (Image vs Video) */}
                    <div className="h-14 w-14 rounded-lg bg-[#191D23] border border-[#57707A]/30 flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative group-hover:border-[#C5BAC4]/50 transition-colors">
                      {displayImage ? (
                        isVideo ? (
                          <video
                            src={`${displayImage}#t=0.1`} // #t=0.1 loads the first frame as a poster
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={displayImage}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )
                      ) : (
                        item.content_type === 'video' ? <Video className="h-5 w-5 text-[#57707A]" /> : <ImageIcon className="h-5 w-5 text-[#57707A]" />
                      )}
                    </div>

                    {/* Caption + Meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#DEDCDC] truncate group-hover:text-white transition-colors">
                        {item.caption
                          ? item.caption.length > 80
                            ? item.caption.substring(0, 80) + "…"
                            : item.caption
                          : "No caption"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {/* Platform icons */}
                        <div className="flex items-center gap-1 text-[#989DAA]">
                          {platformsArray.length > 0 ? platformsArray.map((p: Platform) => (
                            <div key={p} className="opacity-70"><PlatformIcon platform={p} /></div>
                          )) : <span className="text-[10px] uppercase tracking-wider bg-[#191D23] px-1.5 py-0.5 rounded">Unassigned</span>}
                        </div>
                        <span className="text-xs text-[#57707A] mx-1">•</span>
                        <span className="text-xs text-[#989DAA]">
                          {new Date(item.created_at!).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      <StatusBadge status={item.status as ContentStatus} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}