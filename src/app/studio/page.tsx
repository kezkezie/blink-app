"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, ImageIcon, Scissors, Shuffle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content } from "@/types/database";
import { estimateVideoCredits } from "@/lib/video-model-registry";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { MediaCard, NOT_STORYBOARD_FRAME, PART_TYPES } from "@/components/studio/media";
import { useStudioBrands } from "@/components/studio/hooks";

type Kind = "video" | "image";
const KIND_LABEL: Record<Kind, string> = { video: "Video", image: "Image" };

const fromCredits = (mode: string, s = 5) => estimateVideoCredits("auto", s, { videoMode: mode, hasStartFrame: true }) ?? 0;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Create: one box to start anything, the ways to start, and what you made recently. */
export default function CreatePage() {
  const router = useRouter();
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const { profile } = useStudioBrands();
  const [kind, setKind] = useState<Kind>("video");
  const [brief, setBrief] = useState("");
  const [recent, setRecent] = useState<Content[] | null>(null);

  useEffect(() => {
    if (!clientId || !activeBrand) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("content").select("*").eq("brand_id", activeBrand.id)
        .not("content_type", "in", `(${PART_TYPES.join(",")})`).or(NOT_STORYBOARD_FRAME)
        .order("created_at", { ascending: false }).limit(8);
      if (cancelled) return;
      setRecent((data ?? []) as unknown as Content[]);
    })();
    return () => { cancelled = true; };
  }, [clientId, activeBrand]);

  const startCost = useMemo(() => {
    if (kind === "image") return IMAGE_ENGINE_REGISTRY["gpt-image-2-text-to-image"].creditCost;
    return fromCredits("storytelling", 5) + 18; // one 5 s scene with its start frame
  }, [kind]);

  function start() {
    const b = brief.trim();
    if (kind === "image") router.push(`/studio/image${b ? `?prompt=${encodeURIComponent(b)}` : ""}`);
    else router.push(`/studio/video?mode=storytelling${b ? `&brief=${encodeURIComponent(b)}` : ""}`);
  }

  const name = (profile?.name || "").split(" ")[0];

  return (
    <div className="max-w-[1040px] mx-auto pt-4 md:pt-10">
      <p className="text-sm mb-2" style={{ color: "var(--s-soft)" }}>{greeting()}{name ? `, ${name}` : ""}</p>
      <h2 className="text-[28px] md:text-[34px] font-semibold leading-tight tracking-tight mb-6">
        What are we making{activeBrand ? <> for <span style={{ color: "var(--s-accent)" }}>{activeBrand.brand_name}</span></> : null} today?
      </h2>

      <div className="s-card p-3.5" style={{ boxShadow: "0 20px 60px rgba(0,0,0,.35)", borderColor: "var(--s-line-2)" }}>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
          rows={3}
          placeholder={kind === "image" ? "Describe the image, e.g. a launch poster for our new flavour on a sunny kitchen table" : "Describe the video, e.g. a 20 second launch: the farm at dawn, the harvest, the pack, the plate. One line is fine for a single shot."}
          aria-label="What do you want to make?"
          className="w-full bg-transparent outline-none resize-none text-base leading-relaxed px-1"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className="s-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
          <div className="flex-1" />
          {kind === "image" && <Link href="/studio/image?mode=remix" className="s-btn ghost sm">Have an inspo pic? Inspo Remix →</Link>}
          <button className="s-btn primary" onClick={start}>
            Start <span className="cost">from {startCost} cr</span>
          </button>
        </div>
      </div>

      <section className="mt-10">
        <h3 className="s-section-h">Or start from</h3>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { href: "/studio/image?mode=remix", icon: Shuffle, title: "Inspo Remix", line: "Drop a post you love from Pinterest or anywhere. Get it in your brand.", accent: true },
            { href: "/studio/video", icon: Clapperboard, title: "Video", line: "A stack of scenes, then the editor. One shot or a full ad." },
            { href: "/studio/image", icon: ImageIcon, title: "Image", line: `Generate from an idea · from ${IMAGE_ENGINE_REGISTRY["gpt-image-2-text-to-image"].creditCost} cr` },
            { href: "/studio/video?tab=editor", icon: Scissors, title: "Edit footage", line: "Cut your clips; Ask BlinkSpot can do the cut" },
          ].map((w) => (
            <Link key={w.title} href={w.href} className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <w.icon className="h-4 w-4" style={{ color: w.accent ? "var(--s-accent)" : "var(--s-soft)" }} />
              <b className="text-sm font-medium">{w.title}</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>{w.line}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 mb-6">
        <h3 className="s-section-h">Recent work <Link href="/studio/library" className="s-btn ghost sm normal-case tracking-normal">Open library →</Link></h3>
        {recent === null ? (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="s-skel" style={{ aspectRatio: "1 / 1.1" }} />)}</div>
        ) : recent.length === 0 ? (
          <div className="s-empty"><h3>Your work will show up here</h3><p className="text-sm">Start with the box above, or upload photos of your product.</p></div>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {recent.map((c) => <MediaCard key={c.id} content={c} href={`/studio/library/${c.id}`} aspect="1 / 1" />)}
          </div>
        )}
      </section>
    </div>
  );
}
