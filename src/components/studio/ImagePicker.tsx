"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content } from "@/types/database";
import { NOT_STORYBOARD_FRAME, PART_TYPES, VIDEO_TYPES, cleanCaption, resolveMedia, thumbUrl } from "./media";

export type PickedImage = { url: string; contentId: string | null; title: string };

/** The brand's images from the Library, plus "upload from this device". */
export function ImagePicker({ onPick, allowUpload = true, selectedId }: { onPick: (img: PickedImage) => void; allowUpload?: boolean; selectedId?: string | null }) {
  const { activeBrand } = useBrandStore();
  const [items, setItems] = useState<Content[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeBrand) return;
    let cancelled = false;
    supabase
      .from("content")
      .select("id, caption, image_urls, video_urls, reference_image_url, content_type, created_at, status")
      .eq("brand_id", activeBrand.id)
      .not("content_type", "in", `(${[...PART_TYPES, ...VIDEO_TYPES].join(",")})`)
      .or(NOT_STORYBOARD_FRAME)
      .order("created_at", { ascending: false })
      .limit(36)
      .then(({ data }) => { if (!cancelled) setItems(((data ?? []) as unknown as Content[]).filter((c) => { const m = resolveMedia(c); return m.url && !m.isVideo; })); });
    return () => { cancelled = true; };
  }, [activeBrand]);

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
        {allowUpload && (
          <button
            className="rounded-[10px] grid place-items-center gap-1 text-xs aspect-square"
            style={{ border: "1px dashed var(--s-line-2)", color: "var(--s-soft)" }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> From device
          </button>
        )}
        {items === null
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="s-skel aspect-square" />)
          : items.map((c) => {
            const m = resolveMedia(c);
            const title = cleanCaption(c.caption) || "Image";
            return (
              <button
                key={c.id}
                className={`s-media${selectedId === c.id ? " sel" : ""}`}
                title={title}
                onClick={() => onPick({ url: m.url!, contentId: c.id, title })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="m" style={{ aspectRatio: "1 / 1" }}><img src={thumbUrl(m.url!, 320)} alt={title} loading="lazy" decoding="async" /></div>
              </button>
            );
          })}
      </div>
      {items?.length === 0 && <p className="text-xs mt-3" style={{ color: "var(--s-mute)" }}>No images in this brand&apos;s library yet. Generate one, or upload from your device.</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick({ url: URL.createObjectURL(f), contentId: null, title: f.name.replace(/\.[^.]+$/, "") });
          e.target.value = "";
        }}
      />
    </div>
  );
}
