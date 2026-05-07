"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { Content, ContentStatus, Platform } from "@/types/database";

interface ContentCardProps {
  content: Content;
  clientId?: string | null;
  onUpdate?: (updated: Content) => void;
}

export function ContentCard({ content, clientId, onUpdate }: ContentCardProps) {
  const isActionable =
    content.status === "draft" || content.status === "rejected" || content.status === "failed";

  // ── Fail-proof JSONB array parser ──
  const parseArray = (data: unknown): string[] => {
    if (Array.isArray(data)) return data.filter((u) => typeof u === "string" && u.length > 0);
    if (typeof data === "string" && data.length > 0) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string" && (u as string).length > 0);
      } catch {
        if (data.startsWith("http")) return [data];
      }
    }
    return [];
  };

  // ── Extension-based media type detection ──
  const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];
  const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

  const getCleanExtension = (url: string): string => {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split("/").pop() || "";
      const ext = lastSegment.includes(".") ? "." + lastSegment.split(".").pop()!.toLowerCase() : "";
      return ext;
    } catch {
      const lower = url.toLowerCase();
      for (const ext of [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]) {
        if (lower.includes(ext)) return ext;
      }
      return "";
    }
  };

  const isVideoUrl = (url: string): boolean => VIDEO_EXTENSIONS.includes(getCleanExtension(url));

  // ── Media resolution ──
  const videoUrlsArray = parseArray(content.video_urls);
  const imageUrlsArray = parseArray(content.image_urls);
  const referenceImageUrl = content.reference_image_url;

  let displayUrl: string | null = null;
  let isVideo = false;

  const firstVideo = videoUrlsArray.find((u) => isVideoUrl(u));
  if (firstVideo) {
    displayUrl = firstVideo;
    isVideo = true;
  }

  if (!displayUrl) {
    const videoInImages = imageUrlsArray.find((u) => isVideoUrl(u));
    if (videoInImages) {
      displayUrl = videoInImages;
      isVideo = true;
    }
  }

  if (!displayUrl && imageUrlsArray.length > 0) {
    displayUrl = imageUrlsArray[0];
    isVideo = false;
  }

  if (!displayUrl && referenceImageUrl) {
    displayUrl = referenceImageUrl;
    isVideo = isVideoUrl(referenceImageUrl);
  }

  const hasMedia = !!displayUrl;
  const platformsArray = parseArray(content.target_platforms) as Platform[];

  return (
    <div className="relative group w-full h-full">
      <Link
        href={`/dashboard/content/${content.id}`}
        className="block h-full rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] shadow-lg hover:shadow-xl hover:shadow-black/40 hover:border-[#57707A]/60 transition-all duration-300 overflow-hidden flex flex-col"
      >
        <div className="relative aspect-[4/3] bg-[#191D23] overflow-hidden shrink-0 border-b border-[#57707A]/20">
          {hasMedia ? (
            isVideo ? (
              <video
                src={`${displayUrl}#t=0.1`}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 bg-black"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={displayUrl!}
                alt={content.caption_short || "Content Preview"}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <ImageIcon className="h-10 w-10 text-[#57707A]/50" />
            </div>
          )}

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

          {content.status !== "failed" && (
            <div className="absolute top-3 right-3 z-30 drop-shadow-md">
              <StatusBadge status={content.status as ContentStatus} />
            </div>
          )}
        </div>

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