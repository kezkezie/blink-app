"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, Clapperboard, Clock, Film, LayoutTemplate, Loader2, MessageSquareWarning, RefreshCw, Save, Send, Sparkles, Trash2, Wand2, X, ZoomIn, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { isSharedBrand, useBrandStore } from "@/app/store/useBrandStore";
import { cloudinaryStreamUrl, cloudinaryVideoPoster } from "@/lib/utils";
import { MARKETING_STYLES } from "@/lib/marketing-styles";
import { Modal } from "@/components/studio/Modal";
import { ImagePicker } from "@/components/studio/ImagePicker";
import { STATUS_LABEL, cleanCaption, resolveMedia, thumbUrl } from "@/components/studio/media";
import { useBrandKit, generateBrandImages, generationErrorMessage, nearestImageAspect, type ImageEngine } from "@/components/studio/generate-image";
import { InstagramTroubleshootModal } from "@/components/publishing/InstagramTroubleshootModal";
import { PlatformGlyph } from "@/components/studio/plan/PlatformGlyph";
import { PLATFORM_LABEL, enabledPlatforms, placeOnCalendar, postState, publishNow, settingsFor, takeOffCalendar, toLocalInput, whenLabel, type CalRow } from "@/components/studio/plan/schedule";
import { UpscaleButton } from "./Upscale";
import { VIDEO_ONLY, VIDEO_ONLY_LINE, platformLabel, postResults, resultLine, skippedLine, workingTitleOf } from "@/lib/social-media-rules";
import { DetailSkeleton } from "@/components/studio/Skeletons";

/**
 * A post in the studio look (2026-10-11; the classic page stays at /dashboard/content/[id]).
 * Everything the classic page did: captions (long/short, AI-written), hashtags, platforms,
 * post now or schedule, approvals, remake the image, delete. Plus: schedule a date right here
 * instead of "drag it on the calendar", and an honest queued / not queued state.
 */
type Post = CalRow & { caption_choice?: string | null; caption_written?: boolean | null; caption_short?: string | null; hashtags?: string | null; call_to_action?: string | null; rejection_reason?: string | null; ai_model?: string | null; image_prompt_used?: string | null; creation_metadata?: unknown };

const ENGINES: Array<{ id: ImageEngine; label: string; cost: number }> = [
  { id: "nb2", label: "Best quality", cost: 18 },
  { id: "gpt-image-2-text-to-image", label: "Fast", cost: 6 },
];

export function PostDetail({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [connected, setConnected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [short, setShort] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [choice, setChoice] = useState<"long" | "short">("long");
  // A real caption (typed or written by the AI), not the working title the post was made with.
  const [written, setWritten] = useState(false);
  // The working title while it's still in the long caption (only the short one written yet):
  // posting it is refused (lib/social-schedule.ts workingTitleOf), and the Long tab says so.
  const [titleLeft, setTitleLeft] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [writing, setWriting] = useState<"long" | "short" | null>(null);
  const [processing, setProcessing] = useState(() => search.get("processing") === "true");
  const [zoom, setZoom] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whenValue, setWhenValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [igHelp, setIgHelp] = useState(false);
  // Remake the image
  const [remakeOpen, setRemakeOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState<ImageEngine>("nb2");
  const [style, setStyle] = useState<(typeof MARKETING_STYLES)[number]["id"]>("studio");
  const [useCurrent, setUseCurrent] = useState(true);
  const [extraRefs, setExtraRefs] = useState<string[]>([]);
  const [pickRef, setPickRef] = useState(false);
  const [aspect, setAspect] = useState("1:1");

  const brandId = (post?.brand_id as string | undefined) ?? activeBrand?.id ?? null;
  const kit = useBrandKit(brandId, activeBrand?.brand_name);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("content").select("*").eq("id", id).eq("client_id", clientId).maybeSingle();
    const row = (data ?? null) as Post | null;
    setPost(row);
    if (!row) return;
    setCaption(row.caption ?? ""); setShort(row.caption_short ?? ""); setHashtags(row.hashtags ?? "");
    setChoice(row.caption_choice === "short" ? "short" : "long"); setWritten(!!row.caption_written);
    setTitleLeft(workingTitleOf(row));
    setPlatforms(enabledPlatforms(row.target_platforms));
    setDirty(false);
    if (row.brand_id) {
      // Connected platforms without tokens (works in a brand shared with you too).
      const { data: acc } = await supabase.rpc("brand_platforms", { p_brand: row.brand_id });
      setConnected([...new Set(((acc ?? []) as Array<{ platform: string }>).map((a) => String(a.platform).toLowerCase()))]);
    }
  }, [clientId, id]);
  useEffect(() => { void load(); }, [load]);

  // Opened right after an AI edit (?processing=true): wait for the new media, like the classic page.
  useEffect(() => {
    if (!processing) return;
    const done = () => { setProcessing(false); router.replace(`/studio/library/${id}`, { scroll: false }); };
    const channel = supabase.channel(`post-${id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "content", filter: `id=eq.${id}` }, (payload) => {
      const row = payload.new as Post;
      if (resolveMedia(row).url) { setPost((p) => (p ? { ...p, ...row } : p)); done(); }
    }).subscribe();
    const t = setTimeout(() => { void load().then(done); }, 90_000);
    return () => { clearTimeout(t); void supabase.removeChannel(channel); };
  }, [processing, id, load, router]);

  const media = useMemo(() => (post ? resolveMedia(post) : null), [post]);
  const isVideo = !!media?.isVideo;

  async function save(quiet = false) {
    if (!post || !clientId) return false;
    // Editing either caption makes it a real one; the working title alone isn't.
    const isWritten = written || caption !== (post.caption ?? "") || short !== (post.caption_short ?? "");
    // The working title stays known while it's still the long caption, so it can't post as one.
    const left = titleLeft && caption.trim() === titleLeft ? titleLeft : null;
    const meta = (post.creation_metadata && typeof post.creation_metadata === "object" ? post.creation_metadata : {}) as Record<string, unknown>;
    const metaChange = (meta.working_title ?? null) !== left ? { creation_metadata: { ...meta, working_title: left } } : {};
    const { error } = await supabase.from("content").update({
      caption, caption_short: short, hashtags, target_platforms: settingsFor(platforms), caption_choice: choice, caption_written: isWritten, ...metaChange,
    } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId);
    if (error) { toast.error("Couldn't save your changes."); return false; }
    setWritten(isWritten);
    setPost({ ...post, caption, caption_short: short, hashtags, target_platforms: settingsFor(platforms), caption_choice: choice, caption_written: isWritten, ...metaChange } as Post);
    setTitleLeft(left);
    setDirty(false);
    if (!quiet) toast.success("Saved.");
    return true;
  }
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  /** The long/short pick is saved straight away: it's what the calendar posts too. */
  async function pickCaption(next: "long" | "short") {
    setChoice(next);
    if (!post || !clientId || post.status === "posted") return;
    await supabase.from("content").update({ caption_choice: next } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId);
    setPost({ ...post, caption_choice: next });
  }

  async function writeCaption(length: "long" | "short") {
    if (!post || !clientId) return;
    setWriting(length);
    try {
      const imgs = media?.images ?? [];
      const mediaUrl = imgs[0] || media?.url || null;
      const res = await fetch("/api/content/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, contentId: post.id, brandId: post.brand_id, mediaUrl, mediaType: mediaUrl && !imgs[0] && isVideo ? "video/mp4" : "image/jpeg", lengthPreference: length, only: true,
          brandContext: kit ? { name: kit.name, industry: kit.industry, description: kit.description, imageStyle: kit.imageStyle, brandVoice: kit.brandVoice, logoUrl: kit.logoUrl, websiteUrl: kit.websiteUrl } : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't write the caption.");
      // Only the tab you're on, and the hashtags (Kezie, 2026-10-27).
      if (length === "long" && data.caption_long) { setCaption(data.caption_long); setTitleLeft(null); }
      if (length === "short" && data.caption_short) setShort(data.caption_short);
      if (data.hashtags) setHashtags(data.hashtags);
      setWritten(true);
      setDirty(true);
      toast.success(`${length === "long" ? "Long" : "Short"} caption and hashtags written · 1 credit. Check them, then Save.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't write the caption."); }
    finally { setWriting(null); }
  }

  async function doPublishNow() {
    if (!post || !clientId) return;
    if (!platforms.length) { toast.info("Pick at least one platform first."); return; }
    setBusy("publish");
    if (!(await save(true))) { setBusy(null); return; }
    await supabase.from("content").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: "admin" } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId);
    const r = await publishNow(clientId, post.id, settingsFor(platforms), choice);
    setBusy(null);
    if (!r.ok) { toast.error(r.error || "Couldn't publish it."); await load(); return; }
    const ig = platforms.includes("instagram");
    const sent = platforms.filter((p) => isVideo || !VIDEO_ONLY.has(p));
    toast.success(`Sent to ${sent.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}.${r.note ? ` ${r.note}` : ""}${ig ? " If it doesn't show on Instagram in 5 minutes, check the account's status." : ""}`, { duration: 8000 });
    await load();
  }
  async function doSchedule() {
    if (!post || !clientId || !whenValue) return;
    const at = new Date(whenValue);
    if (at.getTime() < Date.now() + 5 * 60_000) { toast.info("Pick a time at least a few minutes from now."); return; }
    setWhenOpen(false);
    setBusy("schedule");
    if (!(await save(true))) { setBusy(null); return; }
    const iso = at.toISOString();
    const r = await placeOnCalendar(clientId, { id: post.id, target_platforms: settingsFor(platforms), postforme_tracking_id: post.postforme_tracking_id }, iso, { captionChoice: choice });
    setBusy(null);
    if (!r.ok) toast.error(r.error || "Couldn't schedule it.");
    else if (r.queued) toast.success(`Scheduled for ${whenLabel(iso)}.${r.note ? ` ${r.note}` : ""}`, { duration: r.note ? 9000 : 4000 });
    else if (!platforms.length) toast(`On the calendar for ${whenLabel(iso)}. Pick where it posts so it goes out.`);
    else toast.error(`On the calendar, but not queued: ${r.error}`, { duration: 9000 });
    await load();
  }
  async function unschedule() {
    if (!post) return;
    setBusy("unschedule");
    const r = await takeOffCalendar(post.id);
    setBusy(null);
    if (!r.ok) toast.error(r.error || "Couldn't take it off the calendar."); else toast.success("Taken off the calendar.");
    await load();
  }
  async function setStatus(status: string, extra: Record<string, unknown> = {}, message?: string) {
    if (!post || !clientId) return;
    setBusy(status);
    const { error } = await supabase.from("content").update({ status, ...extra } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId);
    setBusy(null);
    if (error) { toast.error("Couldn't update the post."); return; }
    if (message) toast.success(message);
    await load();
  }
  async function remove() {
    if (!post || !clientId) return;
    setBusy("delete");
    if (post.postforme_tracking_id && post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now()) {
      const r = await takeOffCalendar(post.id);
      if (!r.ok) { setBusy(null); toast.error(r.error || "Couldn't cancel its schedule, so it wasn't deleted."); return; }
    }
    const { error } = await supabase.from("content").delete().eq("id", post.id).eq("client_id", clientId);
    setBusy(null);
    if (error) { toast.error("Couldn't delete it."); return; }
    toast.success("Deleted.");
    router.push("/studio/library");
  }

  function openRemake() {
    setPrompt(""); setExtraRefs([]); setUseCurrent(true); setEngine("nb2"); setStyle("studio"); setRemakeOpen(true);
  }
  async function remake() {
    if (!post || !clientId || !kit || !brandId) return;
    setRemakeOpen(false);
    setBusy("remake");
    const before = post.image_urls;
    const refs = [...(useCurrent && media?.url && !isVideo ? [media.url] : []), ...extraRefs];
    const finalEngine: ImageEngine = refs.length && engine !== "nb2" ? "gpt-image-2-image-to-image" : engine;
    try {
      const out = await generateBrandImages({
        clientId, brandId, kit, prompt: prompt.trim() || cleanCaption(short || caption).slice(0, 300) || "A professional post for the brand",
        references: refs, engine: finalEngine, aspect, style, caption: cleanCaption(caption).slice(0, 300), save: false,
      });
      const urls = out.map((o) => o.url);
      const { error } = await supabase.from("content").update({ image_urls: urls, updated_at: new Date().toISOString() } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId);
      if (error) throw new Error("The image was made but couldn't be saved to this post.");
      toast.success(`New image in · ${ENGINES.find((e) => e.id === engine)?.cost ?? 18} credits`, {
        action: { label: "Undo", onClick: () => { void supabase.from("content").update({ image_urls: before } as Record<string, unknown>).eq("id", post.id).eq("client_id", clientId).then(() => load()); } },
        duration: 10000,
      });
      await load();
    } catch (e) { toast.error(generationErrorMessage(e), { duration: 9000 }); }
    finally { setBusy(null); }
  }

  if (post === undefined) return <DetailSkeleton />;
  if (post === null) return (
    <div className="s-empty"><h3>Post not found</h3><p className="text-[13px]">It may have been deleted, or it belongs to another account.</p><Link href="/studio/library" className="s-btn sm mt-3">Back to Library</Link></div>
  );

  const status = STATUS_LABEL[post.status] ?? { label: post.status };
  const scheduledFuture = !!post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now();
  const st = post.scheduled_at ? postState(post) : null;
  const image = !isVideo ? media?.url ?? null : null;
  const title = cleanCaption(short || caption).split("\n")[0].slice(0, 80) || (isVideo ? "Video" : "Image");
  const canEdit = post.status !== "posted";
  const results = postResults(post);
  const viewOnly = isSharedBrand(activeBrand) && activeBrand.role === "viewer";

  // Where it posts, in words: what you'll see happen when you press the button.
  // In the order of the rows below, and only accounts that are connected (others can't post).
  const sending = connected.filter((p) => platforms.includes(p) && (isVideo || !VIDEO_ONLY.has(p)));
  const sendingLine = sending.length ? `${sending.map(platformLabel).join(", ").replace(/, ([^,]*)$/, " and $1")}${sending.length === 1 && connected.length > 1 ? " only" : ""}` : "";
  const shortLeft = 120 - short.trim().length;
  const tabNote = choice === "long" && canEdit && caption.trim() && titleLeft && caption.trim() === titleLeft;
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <span className="flex items-center gap-2 text-[13px] font-semibold"><span className="grid place-items-center h-5 w-5 rounded-full text-[11px]" style={{ background: "var(--s-raised)", color: "var(--s-soft)", border: "1px solid var(--s-line-2)" }}>{n}</span>{children}</span>
  );

  return (
    <div className="grid gap-5 max-w-[1240px] mx-auto w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/studio/library" className="s-btn ghost sm -ml-2"><ArrowLeft className="h-3.5 w-3.5" /> Library</Link>
        <h2 className="text-[17px] font-semibold truncate min-w-0 max-w-[60ch]" title={title}>{title}</h2>
        <span className={`s-badge ${status.tone ?? ""}`}>{status.label}</span>
        <div className="flex-1" />
        <button className="s-btn ghost sm" onClick={() => setDeleteOpen(true)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" style={{ color: "var(--s-danger)" }} /> Delete</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)] items-start">
        {/* The picture or video, with what you can do to it. */}
        <div className="grid gap-3 lg:sticky lg:top-20">
          <div className="relative rounded-2xl overflow-hidden grid place-items-center" style={{ background: "#000", border: "1px solid var(--s-line)", minHeight: 320, maxHeight: "72dvh" }}>
            {media?.url ? (
              isVideo ? (
                <video src={cloudinaryStreamUrl(media.url)} poster={cloudinaryVideoPoster(media.url)} controls playsInline preload="metadata" className="w-full h-full object-contain" style={{ maxHeight: "72dvh" }} />
              ) : (
                <button className="group relative w-full h-full grid place-items-center" onClick={() => setZoom(true)} aria-label="View full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(media.url, 1600)} alt={title} className="max-w-full object-contain" style={{ maxHeight: "72dvh" }} />
                  <span className="s-pill absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="h-3.5 w-3.5" /> Full size</span>
                </button>
              )
            ) : <span className="text-[13px] py-24" style={{ color: "var(--s-mute)" }}>No media yet</span>}
            {(processing || busy === "remake") && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(12,13,15,.72)", backdropFilter: "blur(6px)" }}>
                <div className="grid gap-2 justify-items-center text-center px-6"><Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--s-ai)" }} /><b className="text-[14px]">{busy === "remake" ? "Making the new image…" : "Applying your edit…"}</b><span className="text-[12px]" style={{ color: "var(--s-soft)" }}>This usually takes under a minute.</span></div>
              </div>
            )}
          </div>
          {(image || (media?.url && !viewOnly)) && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Edit the media">
              {image && (
                <>
                  <Link href={`/studio/library/${post.id}/edit`} className="s-btn sm"><Wand2 className="h-3.5 w-3.5" /> Edit with AI</Link>
                  <Link href={`/studio/image?mode=design&content=${post.id}`} className="s-btn sm"><LayoutTemplate className="h-3.5 w-3.5" /> Open in Editor</Link>
                  <Link href={`/studio/motion?picture=${post.id}&brief=${encodeURIComponent(`Animate this picture${post.caption ? `: ${cleanCaption(post.caption).slice(0, 120)}` : ""}`)}`} className="s-btn sm" title="Animate this picture: your words and brand shapes move over it"><Clapperboard className="h-3.5 w-3.5" /> Motion graphic</Link>
                  <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(image)}`} className="s-btn sm"><Film className="h-3.5 w-3.5" /> Animate</Link>
                </>
              )}
              {media?.url && !viewOnly && <UpscaleButton contentId={post.id} mediaUrl={media.url} isVideo={isVideo} />}
              {image && canEdit && <button className="s-btn ai sm" disabled={!!busy} onClick={openRemake}><RefreshCw className="h-3.5 w-3.5" /> Remake</button>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[12px] mono" style={{ color: "var(--s-mute)" }}>
            <span>{isVideo ? "Video" : "Picture"}</span>·<span>made {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            {post.ai_model && <>·<span>{post.ai_model}</span></>}
          </div>
        </div>

        <div className="grid gap-3 min-w-0">
          {post.status === "rejected" && (
            <div className="s-card p-4 grid gap-2" style={{ borderColor: "color-mix(in oklab, var(--s-danger) 40%, var(--s-line))" }}>
              <b className="text-[13px] flex items-center gap-1.5"><MessageSquareWarning className="h-4 w-4" style={{ color: "var(--s-danger)" }} /> Changes asked for</b>
              <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>{post.rejection_reason || "No note was left."}</p>
              <button className="s-btn sm justify-self-start" disabled={!!busy} onClick={() => setStatus("draft", { rejection_reason: null }, "Back to draft. Make the changes, then send it again.")}>Edit and resubmit</button>
            </div>
          )}

          {/* 1. The caption: one tab each, the tab you're on is the one that posts (Kezie, 2026-10-27). */}
          <section className="s-card p-4 grid gap-3" aria-label="Caption">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Step n={1}>Caption</Step>
              <div className="s-seg" role="tablist" aria-label="Caption length">
                {(["short", "long"] as const).map((t) => (
                  <button key={t} role="tab" id={`tab-${t}`} aria-controls="caption-panel" aria-selected={choice === t} onClick={() => void pickCaption(t)}>{t === "short" ? "Short" : "Long"}</button>
                ))}
              </div>
            </div>
            <div id="caption-panel" role="tabpanel" aria-labelledby={`tab-${choice}`} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{choice === "short" ? "One or two lines." : "A few short paragraphs and a call to action."} This one posts.</span>
                <button className="s-btn ai sm shrink-0" disabled={!!writing || !canEdit} onClick={() => writeCaption(choice)}>{writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Write {choice} with AI <span className="cost">1 cr</span></button>
              </div>
              {tabNote && (
                <div role="note" className="rounded-lg p-2.5 text-[12.5px] grid gap-1.5" style={{ background: "var(--s-raised)", color: "var(--s-soft)" }}>
                  <span>&ldquo;{caption.trim().slice(0, 60)}{caption.trim().length > 60 ? "…" : ""}&rdquo; is this post&apos;s working title, not a caption. Write one with AI or type your own before it posts.</span>
                  <button className="s-btn sm justify-self-start" onClick={() => { setTitleLeft(null); setWritten(true); setDirty(true); }}>Use it as the caption</button>
                </div>
              )}
              {choice === "long" ? (
                <textarea className="s-input" rows={8} value={caption} onChange={(e) => edit(setCaption)(e.target.value)} disabled={!canEdit} placeholder="What should people read under this post?" aria-label="Long caption" />
              ) : (
                <>
                  <textarea className="s-input" rows={3} value={short} onChange={(e) => edit(setShort)(e.target.value)} disabled={!canEdit} placeholder="A one or two line hook" aria-label="Short caption" />
                  <span className="text-[11.5px] justify-self-end" style={{ color: shortLeft < 0 ? "var(--s-warn)" : "var(--s-mute)" }}>{shortLeft >= 0 ? `${shortLeft} characters left` : `${-shortLeft} over the 120 that read best`}</span>
                  {!short.trim() && caption.trim() && !(titleLeft && caption.trim() === titleLeft) && <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Empty, so the long caption posts instead.</span>}
                </>
              )}
            </div>
            <label className="grid gap-1.5">
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Hashtags · added under the caption</span>
              <input className="s-input" value={hashtags} onChange={(e) => edit(setHashtags)(e.target.value)} disabled={!canEdit} placeholder="#nairobi #freshjuice" aria-label="Hashtags" />
            </label>
          </section>

          {/* 2. Where it posts: one clear row per account, ticked or not, and what that adds up to. */}
          <section className="s-card p-4 grid gap-3" aria-label="Where it posts">
            <div className="flex items-center justify-between gap-2">
              <Step n={2}>Where it posts</Step>
              <Link href="/studio/account/settings" className="text-[12px] underline" style={{ color: "var(--s-mute)" }}>Manage accounts</Link>
            </div>
            {connected.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>No social accounts connected for this brand. <Link href="/studio/account/settings" className="underline" style={{ color: "var(--s-text)" }}>Connect them in Settings</Link>.</p>
            ) : (
              <div className="grid gap-1.5" role="group" aria-label="Platforms">
                {connected.map((p) => {
                  const on = platforms.includes(p);
                  // YouTube takes videos only (lib/social-media-rules.ts): a picture can't be sent there.
                  const videosOnly = VIDEO_ONLY.has(p) && !isVideo;
                  const ticked = on && !videosOnly;
                  return (
                    <button key={p} type="button" role="checkbox" aria-checked={ticked} disabled={!canEdit || (videosOnly && !on)}
                      title={videosOnly ? `${platformLabel(p)} only takes videos, and this post is a picture.` : undefined}
                      onClick={() => edit(setPlatforms)(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                      className="flex items-center gap-3 rounded-xl px-3 h-11 text-left transition-colors"
                      style={{ background: ticked ? "color-mix(in oklab, var(--s-accent) 9%, var(--s-bg))" : "var(--s-bg)", border: `1px solid ${ticked ? "var(--s-accent)" : "var(--s-line)"}`, opacity: videosOnly ? 0.55 : 1 }}>
                      <PlatformGlyph platform={p} size={16} />
                      <span className="text-[13.5px] flex-1">{platformLabel(p)}{videosOnly && <span className="text-[12px] ml-1.5" style={{ color: "var(--s-mute)" }}>· {VIDEO_ONLY_LINE}</span>}</span>
                      <span aria-hidden className="h-5 w-5 rounded-md grid place-items-center" style={{ background: ticked ? "var(--s-accent)" : "transparent", border: `1.5px solid ${ticked ? "var(--s-accent)" : "var(--s-line-2)"}` }}>{ticked && <Check className="h-3.5 w-3.5" style={{ color: "var(--s-accent-ink)" }} />}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {connected.length > 0 && (
              <p className="text-[12.5px]" style={{ color: sending.length ? "var(--s-soft)" : "var(--s-warn)" }}>{sending.length ? <>Posts to <b style={{ color: "var(--s-text)" }}>{sendingLine}</b>.</> : "Nothing picked yet: tick where it should post."}</p>
            )}
            {!isVideo && platforms.some((p) => VIDEO_ONLY.has(p)) && <p className="text-[12px]" style={{ color: "var(--s-warn)" }}>{skippedLine(platforms.filter((p) => VIDEO_ONLY.has(p)), platformLabel)} Tap it to take it off.</p>}
          </section>

          {/* 3. When: what each network said, then post now or schedule. */}
          <section className="s-card p-4 grid gap-3" aria-label="When">
            <Step n={3}>When</Step>
            {results.length > 0 && (
              <ul className="grid gap-1 text-[12.5px]" aria-label="What each platform said">
                {results.map((r) => (
                  <li key={`${r.platform}-${r.at}`} className="flex items-start gap-1.5" style={{ color: r.ok ? "var(--s-ok)" : "var(--s-danger)" }}>
                    {r.ok ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <span>{r.ok ? <>Posted on {platformLabel(r.platform)}{r.url && <> · <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">open</a></>}</> : resultLine(r, platformLabel)}</span>
                  </li>
                ))}
              </ul>
            )}
            {post.status === "posted" ? (
              <p className="text-[13px] flex items-center gap-1.5" style={{ color: "var(--s-ok)" }}><Check className="h-4 w-4" /> Posted{post.scheduled_at ? ` · ${whenLabel(post.scheduled_at)}` : ""}</p>
            ) : scheduledFuture && st ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Clock className="h-4 w-4" style={{ color: "var(--s-soft)" }} /><b className="text-[14px]">{whenLabel(post.scheduled_at!)}</b>
                  <span className={`s-badge ${st.tone === "ok" ? "ok" : st.tone === "danger" ? "danger" : "warn"}`}>{st.label}</span>
                </div>
                {st.label !== "Queued" && <p className="text-[12px]" style={{ color: "var(--s-warn)" }}>{platforms.length ? "It's on the calendar but not queued with your accounts yet. Press Change time and save to try again." : "Tick where it posts above and Save, so it actually goes out."}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <button className="s-btn sm" disabled={!!busy} onClick={() => { setWhenValue(toLocalInput(post.scheduled_at)); setWhenOpen(true); }}><Clock className="h-3.5 w-3.5" /> Change time</button>
                  <button className="s-btn sm" disabled={!!busy || !sending.length} onClick={doPublishNow}>{busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Post now instead</button>
                  <button className="s-btn ghost sm" disabled={!!busy} onClick={unschedule}>{busy === "unschedule" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Take off the calendar</button>
                </div>
              </>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="s-btn primary justify-center" style={{ height: 42 }} disabled={!!busy || !sending.length || !resolveMedia(post).url} onClick={doPublishNow} title={sending.length ? "" : "Tick where it posts first"}>
                  {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} {sending.length === 1 ? `Post now to ${platformLabel(sending[0])}` : "Post now"}
                </button>
                <button className="s-btn justify-center" style={{ height: 42 }} disabled={!!busy} onClick={() => { setWhenValue(toLocalInput(null)); setWhenOpen(true); }}>{busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Schedule</button>
                <Link href="/studio/plan" className="text-[12px] underline sm:col-span-2" style={{ color: "var(--s-mute)" }}>Open the calendar</Link>
              </div>
            )}
            {post.status === "draft" && <button className="s-btn ghost sm justify-self-start -ml-2" disabled={!!busy} onClick={() => setStatus("pending_approval", {}, "Sent for approval.")}><Send className="h-3.5 w-3.5" /> Send for approval first</button>}
            {post.status === "pending_approval" && (
              <div className="flex flex-wrap gap-1.5 pt-1" style={{ borderTop: "1px solid var(--s-line)" }}>
                <span className="text-[12px] w-full pt-2" style={{ color: "var(--s-warn)" }}>Waiting for approval.</span>
                <button className="s-btn sm primary" disabled={!!busy} onClick={() => setStatus("approved", { approved_at: new Date().toISOString(), approved_by: "admin" }, "Approved.")}><Check className="h-3.5 w-3.5" /> Approve</button>
                <button className="s-btn sm" disabled={!!busy} onClick={() => { setReason(""); setRejectOpen(true); }}><MessageSquareWarning className="h-3.5 w-3.5" /> Ask for changes</button>
              </div>
            )}
            {platforms.includes("instagram") && <button className="text-[11.5px] justify-self-start" style={{ color: "var(--s-mute)" }} onClick={() => setIgHelp(true)}>Posted but not showing on Instagram? →</button>}
          </section>

          {canEdit && (
            <div className="sticky bottom-[78px] md:bottom-3 z-10 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "color-mix(in oklab, var(--s-panel) 92%, transparent)", border: `1px solid ${dirty ? "var(--s-line-2)" : "var(--s-line)"}`, backdropFilter: "blur(8px)" }}>
              <span className="text-[12px] flex-1" style={{ color: dirty ? "var(--s-warn)" : "var(--s-mute)" }}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
              <button className="s-btn primary sm" disabled={!dirty || !!busy} onClick={() => void save()}><Save className="h-3.5 w-3.5" /> Save</button>
            </div>
          )}
        </div>
      </div>

      <Modal open={zoom && !!image} onClose={() => setZoom(false)} label="Full size" width={1400}>
        <div className="relative bg-black grid place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt={title} className="max-w-full object-contain" style={{ maxHeight: "86dvh" }} />}
          <button className="s-btn sm absolute top-3 right-3" onClick={() => setZoom(false)} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </Modal>

      <Modal open={whenOpen} onClose={() => setWhenOpen(false)} label="Schedule" width={420} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">When should it go out?</b><button className="s-btn ghost sm" onClick={() => setWhenOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <input type="datetime-local" className="s-input" value={whenValue} min={toLocalInput(new Date(Date.now() + 10 * 60_000).toISOString())} onChange={(e) => setWhenValue(e.target.value)} aria-label="Date and time" style={{ colorScheme: "dark" }} />
        {!platforms.length && <p className="text-[12px] mt-2" style={{ color: "var(--s-warn)" }}>No platforms picked yet: it goes on the calendar, but won&apos;t post until you pick where.</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setWhenOpen(false)}>Cancel</button>
          <button className="s-btn primary sm" disabled={!whenValue} onClick={doSchedule}>Schedule</button>
        </div>
      </Modal>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} label="Ask for changes" width={480} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">What should change?</b><button className="s-btn ghost sm" onClick={() => setRejectOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <textarea className="s-input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Use the green bottle, and make the price bigger" aria-label="What should change" />
        <div className="flex justify-end gap-2 mt-3">
          <button className="s-btn ghost sm" onClick={() => setRejectOpen(false)}>Cancel</button>
          <button className="s-btn primary sm" disabled={!reason.trim()} onClick={() => { setRejectOpen(false); void setStatus("rejected", { rejection_reason: reason.trim() }, "Sent back with your note."); }}>Send back</button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} label="Delete this post" width={420} padded>
        <b className="text-sm">Delete this post?</b>
        <p className="text-[13px] mt-2" style={{ color: "var(--s-soft)" }}>It&apos;s removed from your Library{scheduledFuture ? " and taken off the calendar" : ""}. This can&apos;t be undone.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="s-btn ghost sm" onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button className="s-btn sm" style={{ background: "var(--s-danger)", color: "#fff", borderColor: "transparent" }} disabled={busy === "delete"} onClick={remove}>{busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete</button>
        </div>
      </Modal>

      <Modal open={remakeOpen} onClose={() => setRemakeOpen(false)} label="Remake the image" width={620} padded>
        <div className="flex items-center justify-between mb-1"><b className="text-sm">Remake the image</b><button className="s-btn ghost sm" onClick={() => setRemakeOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <p className="text-[12px] mb-3" style={{ color: "var(--s-mute)" }}>The new picture replaces this one on the post; captions and schedule stay. You can undo right after.</p>
        <div className="grid gap-3">
          <label className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>What should change?</span>
            <textarea className="s-input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={cleanCaption(short || caption).slice(0, 120) || "e.g. the same drink on a sunny Nairobi rooftop, close-up"} />
          </label>
          <div className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>Style</span>
            <div className="flex flex-wrap gap-1.5">{MARKETING_STYLES.map((s) => <button key={s.id} className="s-chip" aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.label.replace(/^[^\p{L}]+/u, "")}</button>)}</div>
          </div>
          <div className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>References</span>
            <div className="flex flex-wrap gap-2 items-center">
              {media?.url && !isVideo && (
                <button className="relative h-14 w-14 rounded-lg overflow-hidden" style={{ outline: useCurrent ? "2px solid var(--s-accent)" : "1px solid var(--s-line-2)", opacity: useCurrent ? 1 : 0.45 }} onClick={() => setUseCurrent((v) => !v)} title={useCurrent ? "Using this image (click to drop it)" : "Not using this image"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(media.url, 200)} alt="" className="h-full w-full object-cover" />
                </button>
              )}
              {extraRefs.map((u) => (
                <button key={u} className="relative h-14 w-14 rounded-lg overflow-hidden" style={{ outline: "2px solid var(--s-accent)" }} onClick={() => setExtraRefs((x) => x.filter((y) => y !== u))} title="Remove">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(u, 200)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {extraRefs.length < 3 && <button className="s-btn sm" onClick={() => setPickRef(true)}>Add from Library</button>}
            </div>
          </div>
          <div className="grid gap-1.5"><span className="s-label" style={{ margin: 0 }}>Shape</span>
            <div className="flex flex-wrap gap-1.5">{["1:1", "4:5", "9:16", "16:9"].map((a) => <button key={a} className="s-chip" aria-pressed={aspect === a} onClick={() => setAspect(a)}>{a}</button>)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="s-seg" role="group" aria-label="Quality">{ENGINES.map((e) => <button key={e.id} aria-pressed={engine === e.id} onClick={() => setEngine(e.id)}>{e.label}</button>)}</div>
            <div className="flex-1" />
            <button className="s-btn primary" disabled={!kit} onClick={remake}><RefreshCw className="h-4 w-4" /> Remake <span className="cost">{ENGINES.find((e) => e.id === engine)?.cost} cr</span></button>
          </div>
        </div>
      </Modal>

      <Modal open={pickRef} onClose={() => setPickRef(false)} label="Pick a reference" width={860} padded>
        <div className="flex items-center justify-between mb-3"><b className="text-sm">Pick a reference from your Library</b><button className="s-btn ghost sm" onClick={() => setPickRef(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <ImagePicker allowUpload={false} onPick={(p) => { setPickRef(false); if (!p.url.startsWith("blob:")) setExtraRefs((x) => [...new Set([...x, p.url])].slice(0, 3)); }} />
      </Modal>

      <InstagramTroubleshootModal open={igHelp} onClose={() => setIgHelp(false)} />
      {/* The aspect of the current image, so a remake keeps its shape by default. */}
      {image && <AspectProbe url={image} onAspect={(a) => setAspect(nearestImageAspect(a))} />}
    </div>
  );
}

/** Reads an image's real size once and reports it as "w:h". */
function AspectProbe({ url, onAspect }: { url: string; onAspect: (a: string) => void }) {
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled && img.naturalWidth && img.naturalHeight) onAspect(`${img.naturalWidth}:${img.naturalHeight}`); };
    img.src = thumbUrl(url, 400);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return null;
}
