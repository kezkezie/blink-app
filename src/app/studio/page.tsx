"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Film, ImageIcon, LayoutTemplate, MessageCircle, Shirt, ShoppingBag, UserCircle, Wand2, Zap, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import type { Content } from "@/types/database";
import { estimateVideoCredits } from "@/lib/video-model-registry";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { MediaCard, NOT_STORYBOARD_FRAME, PART_TYPES } from "@/components/studio/media";
import { useAskStore } from "@/components/studio/ask-store";
import { useStudioBrands } from "@/components/studio/hooks";

type Kind = "long" | "shot" | "image";
const KIND_LABEL: Record<Kind, string> = { long: "Long video", shot: "One shot", image: "Image" };

const fromCredits = (mode: string, s = 5) => estimateVideoCredits("auto", s, { videoMode: mode, hasStartFrame: true }) ?? 0;

const VIDEO_WAYS = [
  { mode: "showcase", title: "Cinematic showcase", line: "The camera moves around your product", icon: ShoppingBag },
  { mode: "logo_reveal", title: "Product reveal", line: "Your product appears with motion graphics", icon: Zap },
  { mode: "ugc", title: "Creator review", line: "A creator talks about your product", icon: UserCircle },
  { mode: "clothing", title: "Try-on", line: "Your garment on a model", icon: Shirt },
];

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
  const { ask } = useAskStore();
  const [kind, setKind] = useState<Kind>("long");
  const [brief, setBrief] = useState("");
  const [recent, setRecent] = useState<Content[] | null>(null);
  const [stats, setStats] = useState<{ total: number; pending: number; approved: number; posted: number } | null>(null);

  useEffect(() => {
    if (!clientId || !activeBrand) return;
    let cancelled = false;
    (async () => {
      const finished = () => supabase.from("content").select("*", { count: "exact" }).eq("brand_id", activeBrand.id)
        .not("content_type", "in", `(${PART_TYPES.join(",")})`).or(NOT_STORYBOARD_FRAME);
      const [list, pending, approved, posted] = await Promise.all([
        finished().order("created_at", { ascending: false }).limit(8),
        finished().eq("status", "pending_approval").limit(1),
        finished().eq("status", "approved").limit(1),
        finished().eq("status", "posted").limit(1),
      ]);
      if (cancelled) return;
      setRecent((list.data ?? []) as unknown as Content[]);
      setStats({ total: list.count ?? 0, pending: pending.count ?? 0, approved: approved.count ?? 0, posted: posted.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [clientId, activeBrand]);

  const startCost = useMemo(() => {
    if (kind === "image") return IMAGE_ENGINE_REGISTRY.nb2.creditCost;
    if (kind === "shot") return fromCredits("showcase");
    return fromCredits("storytelling", 15) + 3 * 18; // three 5 s scenes, each with a start frame
  }, [kind]);

  function start() {
    const b = brief.trim();
    if (kind === "image") router.push(`/studio/image${b ? `?prompt=${encodeURIComponent(b)}` : ""}`);
    else router.push(`/studio/video?mode=${kind === "long" ? "storytelling" : "showcase"}${b ? `&brief=${encodeURIComponent(b)}` : ""}`);
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
          placeholder={kind === "image" ? "Describe the image, e.g. a launch poster for our new flavour on a sunny kitchen table" : kind === "long" ? "Tell the story, e.g. a 30 second launch film: the farm at dawn, the harvest, the pack, the plate" : "Describe the shot, e.g. the cover pulls off our car in a dark studio"}
          aria-label="What do you want to make?"
          className="w-full bg-transparent outline-none resize-none text-base leading-relaxed px-1"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className="s-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
          <div className="flex-1" />
          <button className="s-btn ai" onClick={() => ask(brief.trim() ? `Help me make this: ${brief.trim()}` : "")}>
            <MessageCircle className="h-4 w-4" /> Plan it with AI
          </button>
          <button className="s-btn primary" onClick={start}>
            Start <span className="cost">from {startCost} cr</span>
          </button>
        </div>
      </div>

      <section className="mt-10">
        <h3 className="s-section-h">Ways to start</h3>
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Link href="/studio/video?mode=storytelling" className="s-card p-5 flex flex-col gap-3 hover:border-[var(--s-line-2)] transition-colors">
            <div className="flex items-center gap-2"><Clapperboard className="h-5 w-5" style={{ color: "var(--s-accent)" }} /><span className="s-badge">LONG VIDEO</span></div>
            <div>
              <b className="text-[15px] font-semibold">Story, scene by scene</b>
              <p className="text-sm mt-1" style={{ color: "var(--s-soft)" }}>Write the idea. BlinkSpot splits it into scenes, you approve each start frame, then put the clips together in the editor.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs mono mt-auto" style={{ color: "var(--s-mute)" }}>
              1 Story <ArrowRight className="h-3 w-3" /> 2 Scenes <ArrowRight className="h-3 w-3" /> 3 Render <ArrowRight className="h-3 w-3" /> 4 Edit
            </div>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/studio/image" className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <ImageIcon className="h-4 w-4" style={{ color: "var(--s-soft)" }} />
              <b className="text-sm font-medium">Generate an image</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>From {IMAGE_ENGINE_REGISTRY["gpt-image-2-text-to-image"].creditCost} cr</span>
            </Link>
            <Link href="/studio/image?mode=design" className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <LayoutTemplate className="h-4 w-4" style={{ color: "var(--s-soft)" }} />
              <b className="text-sm font-medium">Design a poster</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>Photo + your type and logo · free</span>
            </Link>
            <Link href="/studio/image?mode=edit" className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <Wand2 className="h-4 w-4" style={{ color: "var(--s-soft)" }} />
              <b className="text-sm font-medium">Edit a photo with AI</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>Change colours, objects, text</span>
            </Link>
            <Link href="/studio/video?tab=editor" className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <Film className="h-4 w-4" style={{ color: "var(--s-soft)" }} />
              <b className="text-sm font-medium">Open the editor</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>Cut and join your clips</span>
            </Link>
          </div>
        </div>
        <div className="grid gap-3 mt-3 grid-cols-2 md:grid-cols-4">
          {VIDEO_WAYS.map((w) => (
            <Link key={w.mode} href={`/studio/video?mode=${w.mode}`} className="s-card p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
              <w.icon className="h-4 w-4" style={{ color: "var(--s-soft)" }} />
              <b className="text-sm font-medium">{w.title}</b>
              <span className="text-xs" style={{ color: "var(--s-mute)" }}>{w.line}</span>
              <span className="text-[11px] mono mt-auto" style={{ color: "var(--s-mute)" }}>5 s from {fromCredits(w.mode)} cr</span>
            </Link>
          ))}
        </div>
      </section>

      {stats && (
        <section className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "In your library", value: stats.total, href: "/studio/library" },
            { label: "Needs approval", value: stats.pending, href: "/studio/plan/approvals" },
            { label: "Approved", value: stats.approved, href: "/studio/plan" },
            { label: "Posted", value: stats.posted, href: "/studio/plan/analytics" },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="s-card px-4 py-3 hover:border-[var(--s-line-2)] transition-colors">
              <div className="text-xl font-semibold mono">{s.value}</div>
              <div className="text-xs" style={{ color: "var(--s-mute)" }}>{s.label}</div>
            </Link>
          ))}
        </section>
      )}

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
