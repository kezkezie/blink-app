"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageIcon, Loader2, RefreshCw, Palette } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import type { Content, ContentStatus, Platform } from "@/types/database";

interface ContentCardProps {
  content: Content;
  clientId?: string | null;
  onUpdate?: (updated: Content) => void;
}

export function ContentCard({ content, clientId, onUpdate }: ContentCardProps) {
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  // Notice we now allow 'failed' drafts to be actionable (so they can be deleted or modified if needed)
  const isActionable =
    content.status === "draft" || content.status === "rejected" || content.status === "failed";

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

  const imageUrlsArray = parseArray(content.image_urls);
  const hasImage = imageUrlsArray.length > 0;
  const displayImage = imageUrlsArray[0];

  const platformsArray = parseArray(content.target_platforms);

  async function handleRegenCaption(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRegeneratingCaption(true);

    try {
      await triggerWorkflow("blink-write-captions", {
        client_id: clientId,
        post_id: content.id,
        regenerate: true,
      });

      let attempts = 0;
      while (attempts < 10) {
        const { data } = await supabase
          .from("content")
          .select("*")
          .eq("id", content.id)
          .single();
        if (data) {
          const updated = data as unknown as Content;
          if (
            updated.caption !== content.caption ||
            updated.updated_at !== content.updated_at
          ) {
            onUpdate?.(updated);
            break;
          }
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error("Regenerate caption error:", err);
    } finally {
      setRegeneratingCaption(false);
    }
  }

  async function handleRegenImage(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRegeneratingImage(true);

    try {
      await triggerWorkflow("blink-generate-images", {
        client_id: clientId,
        post_id: content.id,
        topic: content.caption_short || content.caption?.substring(0, 60) || "",
        content_type: content.content_type,
        mode: "generate",
      });

      let attempts = 0;
      while (attempts < 20) {
        const { data } = await supabase
          .from("content")
          .select("*")
          .eq("id", content.id)
          .single();
        if (data) {
          const updated = data as unknown as Content;
          const newUrls = parseArray(updated.image_urls);

          if (newUrls.length > 0 && newUrls[0] !== displayImage) {
            onUpdate?.(updated);
            break;
          }
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error("Regenerate image error:", err);
    } finally {
      setRegeneratingImage(false);
    }
  }

  const isLoading = regeneratingCaption || regeneratingImage;

  // ✨ FIXED: ONLY check the actual file extension, NOT the content_type!
  const isVideo =
    hasImage &&
    displayImage &&
    (displayImage.toLowerCase().includes(".mp4") ||
      displayImage.toLowerCase().includes(".mov") ||
      displayImage.toLowerCase().includes(".webm"));

  return (
    <div className="relative group w-full h-full">
      <Link
        href={`/dashboard/content/${content.id}`}
        className="block h-full rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg hover:shadow-xl hover:shadow-black/40 hover:border-[#57707A]/60 transition-all duration-300 overflow-hidden flex flex-col"
      >
        {/* Image / Video Wrapper */}
        <div className="relative aspect-[4/3] bg-[#191D23] overflow-hidden shrink-0 border-b border-[#57707A]/20">
          {hasImage ? (
            isVideo ? (
              // ✨ FIXED: Appended #t=0.1 to force a thumbnail, removed autoPlay
              <video
                src={`${displayImage}#t=0.1`}
                className={cn(
                  "h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 bg-black",
                  isLoading && "opacity-30 grayscale"
                )}
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={displayImage}
                alt={content.caption_short || "Content Preview"}
                className={cn(
                  "h-full w-full object-cover group-hover:scale-105 transition-transform duration-500",
                  isLoading && "opacity-30 grayscale"
                )}
              />
            )
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <ImageIcon className="h-10 w-10 text-[#57707A]/50" />
            </div>
          )}

          {/* 👇 THE NEW FAILED BADGE 👇 */}
          {content.status === "failed" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-[#191D23]/90 backdrop-blur-sm border-b-2 border-red-500/30">
              <div className="bg-[#2A2F38] border border-red-500/20 shadow-xl rounded-xl p-4 w-full max-w-[280px]">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-bold text-sm">Generation Failed</span>
                </div>
                <div className="text-[11px] text-[#989DAA] leading-relaxed space-y-1.5">
                  <p>Something went wrong with the AI processing. Please check the following:</p>
                  <ul className="list-disc pl-3 text-red-500/50 space-y-0.5">
                    <li><span className="text-[#989DAA]"><b className="text-[#DEDCDC]">Safety Filter:</b> Face resembles a celebrity or is cropped too tightly.</span></li>
                    <li><span className="text-[#989DAA]"><b className="text-[#DEDCDC]">Invalid Media:</b> File format unsupported or too large.</span></li>
                  </ul>
                  <p className="pt-2 text-[#57707A] font-medium">Please delete this draft and try again.</p>
                </div>
              </div>
            </div>
          )}
          {/* 👆 END OF FAILED BADGE 👆 */}

          {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 bg-[#2A2F38]/95 border border-[#57707A]/50 rounded-full px-4 py-2 shadow-xl">
                <Loader2 className="h-4 w-4 animate-spin text-[#C5BAC4]" />
                <span className="text-xs font-bold text-[#DEDCDC]">
                  {regeneratingCaption
                    ? "Rewriting caption..."
                    : "Regenerating media..."}
                </span>
              </div>
            </div>
          )}

          {/* Only show the status badge if it hasn't failed, otherwise it clashes with our big error box */}
          {content.status !== "failed" && (
            <div className="absolute top-3 right-3 z-30 drop-shadow-md">
              <StatusBadge status={content.status as ContentStatus} />
            </div>
          )}

          {isActionable && !isLoading && content.status !== "failed" && (
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-[#191D23]/90 via-[#191D23]/50 to-transparent p-3 pt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex gap-2">
                <button
                  onClick={handleRegenCaption}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#2A2F38]/90 backdrop-blur-sm border border-[#57707A]/50 text-[#DEDCDC] text-[10px] font-bold uppercase tracking-wider hover:bg-[#C5BAC4] hover:text-[#191D23] hover:border-[#C5BAC4] transition-all"
                >
                  <RefreshCw className="h-3 w-3" /> Rewrite
                </button>
                {/* Hide the image regen button if the media is actually a video file */}
                {!isVideo && (
                  <button
                    onClick={handleRegenImage}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#2A2F38]/90 backdrop-blur-sm border border-[#57707A]/50 text-[#DEDCDC] text-[10px] font-bold uppercase tracking-wider hover:bg-[#C5BAC4] hover:text-[#191D23] hover:border-[#C5BAC4] transition-all"
                  >
                    <Palette className="h-3 w-3" /> Re-Roll
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
          <p className="text-sm font-bold text-[#DEDCDC] leading-relaxed line-clamp-2 min-h-[2.5rem] group-hover:text-white transition-colors">
            {content.caption
              ? content.caption.length > 80
                ? content.caption.substring(0, 80) + "…"
                : content.caption
              : "No caption generated."}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-[#57707A]/20 mt-auto">
            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
              {platformsArray.slice(0, 3).map((p: Platform) => (
                <PlatformIcon key={p} platform={p} />
              ))}
              {platformsArray.length > 3 && (
                <span className="text-xs text-[#989DAA] font-medium ml-1">
                  +{platformsArray.length - 3}
                </span>
              )}
              {platformsArray.length === 0 && (
                <span className="text-[10px] text-[#57707A] uppercase tracking-wider font-bold">Unassigned</span>
              )}
            </div>
            <span className="text-[10px] text-[#989DAA] bg-[#191D23] border border-[#57707A]/30 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
              {content.content_type.replace('_', ' ')}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}