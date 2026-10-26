"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, SkipBack, Trash2, Plus, Video, Type, Music, Image as ImageIcon, UploadCloud, Settings, Download, ZoomIn, ZoomOut, Loader2, X, SlidersHorizontal, ArrowUp, ArrowDown, ChevronDown, Layers, Film, Mic, Magnet, Check, Maximize2, Minimize2, Scissors, Copy, Sparkles, Wand2, Undo2, Redo2, AudioLines, Subtitles, Clapperboard, Gauge, Square } from "lucide-react";
import { toast } from "sonner";
import { useCredits } from "@/components/studio/hooks";
import { AI_NEEDS_CREDITS } from "@/lib/plans";
import { needsStamp, stampBox } from "@/lib/stamp";
import { readVideo } from "@/lib/video-inspo/analyze";
import { inspoPatternKey, type EditRecipe, type InspoPattern } from "@/lib/video-inspo/plan";
import { VOICES, voiceoverCredits } from "@/lib/voiceover";
import { beatCut, detectBeats, waveformPeaks } from "@/lib/editor/beats";
import { captionChunks, transcribeCredits, type Highlight, type Segment } from "@/lib/editor/highlights";
import { canvasSize, drawtextFilter, frameAt, normalizeFilter, overlayFilter, overlayStep, webmDecoder, type CanvasAspect, type FitMode } from "@/lib/editor/export-graph";
import { SPEEDS, sourceAt, span, speedLabel, speedOf, withSpeed } from "@/lib/editor/speed";
import { commit, emptyHistory, isRedoKey, isUndoKey, redoStep, undoStep, type History } from "@/lib/editor/history";
import "./video-editor.css";
import { Button } from "@/components/ui/button";
import { cn, cloudinaryVideoPoster } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useBrandStore } from "@/app/store/useBrandStore"; // ✨ Added to isolate libraries by brand
import { useEditorBridge } from "@/components/video/editor-bridge";
import { clearDraft, draftAge, loadDraft, saveDraft } from "@/lib/drafts";
import { applyEditOps, type EditorState } from "@/lib/editor-ops";
import { MotionBin } from "@/components/studio/motion/MotionBin";
import { Modal } from "@/components/studio/Modal";
import type { AddedMotion, MotionPlace } from "@/components/studio/motion/MotionStudio";

interface MediaAsset {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  thumb: string;
  name: string;
  duration?: number;
}

const noSubscribe = () => () => {};

interface TrackClip {
  id: string;
  assetId: string;
  url: string;
  type: "video" | "audio" | "image";
  name: string;
  timelineStart: number;
  trimStart: number;
  trimEnd: number;
  maxDuration: number;
  opacity?: number;
  volume?: number;
  trackRow?: number;
  /** Playback speed (2026-10-23, slow-mo): 0.5 plays at half speed and lasts twice as long. */
  speed?: number;
  /** Its length is a guess until the file says (a new upload or Library add): it then takes the real length. */
  guessed?: boolean;
}

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  timelineStart: number;
  trimStart: number;
  trimEnd: number;
  maxDuration: number;
  opacity?: number;
  trackRow?: number;
  /** "caption": outlined, for words people read along (studio, 2026-10-11). */
  style?: "plain" | "caption";
}

/**
 * `variant="studio"` (the new look): the editor fills the screen, the timeline is compact and Focus
 * hides the side panels so playback is big. The classic page keeps the original layout.
 */
export function VideoEditorUI({ variant = "classic" }: { variant?: "classic" | "studio" } = {}) {
  if (typeof window !== "undefined") { const w = window as unknown as { __veRenders?: number }; w.__veRenders = (w.__veRenders ?? 0) + 1; } // [VEDBG]
  const studio = variant === "studio";
  const [focusPreview, setFocusPreview] = useState(false);
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore(); // ✨ Fetch active brand
  const router = useRouter();

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "text">("assets");
  const [assetFilter, setAssetFilter] = useState<"library" | "sequence" | "audio">("library");

  const [isLoadingDB, setIsLoadingDB] = useState(false);
  const [assetPageLimit, setAssetPageLimit] = useState(8);
  const [hasMoreAssets, setHasMoreAssets] = useState(true);

  const [isRendering, setIsRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState(false);
  const [renderStatusText, setRenderStatusText] = useState("Preparing render engine...");
  const ffmpegRef = useRef(new FFmpeg());
  const [renderProgress, setRenderProgress] = useState(0);

  const [zoom, setZoom] = useState(2);
  const [globalTime, setGlobalTime] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);

  // ✨ Proper React State for tracking the playhead handle dragging
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isScrubbingUI, setIsScrubbingUI] = useState(false);

  const PIXELS_PER_SECOND = 10 * zoom;

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [videoClips, setVideoClips] = useState<TrackClip[]>([]);
  const [audioClips, setAudioClips] = useState<TrackClip[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);

  const [selectedElement, setSelectedElement] = useState<{ id: string; type: "text" | "video" | "audio"; } | null>(null);
  // Canvas shape and framing (both looks export them; the classic look stays 16:9 / fit).
  const [canvasAspect, setCanvasAspect] = useState<CanvasAspect>("16:9");
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  // Studio look: left rail, AI tools state, waveforms, beat markers, measured canvas width.
  const [rail, setRail] = useState<"media" | "scenes" | "audio" | "text" | "ai">("media");
  // Motion deep link (Ask BlinkSpot's make_motion, the Library's "Animate this"): ?rail=motion&motion=...&motionPicture=<post>.
  const [motionStart, setMotionStart] = useState<{ prompt: string | null; picture: string | null }>({ prompt: null, picture: null });
  // Motion opens as a window over the editor, not in the narrow rail (Kezie, 2026-10-21).
  const [motionOpen, setMotionOpen] = useState(false);
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  // Stop for the AI tools (2026-10-25): the request ends, and the server refunds the step in progress.
  const aiStop = useRef<AbortController | null>(null);
  const aiStart = (label: string) => { aiStop.current = new AbortController(); setAiBusy(label); return aiStop.current.signal; };
  const AI_STOPPED = "Stopped. The step that was running isn't charged.";
  const [cutEvery, setCutEvery] = useState<1 | 2 | 4>(2);
  const [beatLength, setBeatLength] = useState(30);
  const [beatMarks, setBeatMarks] = useState<number[]>([]);
  const [shortTarget, setShortTarget] = useState<15 | 30 | 60>(30);
  const [shorts, setShorts] = useState<{ source: { url: string; name: string; duration: number }; highlights: Highlight[]; segments: Segment[]; credits: number } | null>(null);
  const [canvasW, setCanvasW] = useState(960);
  // AI needs credits, not a plan (2026-10-12); Cut to the beat runs in the browser and is always free.
  const { balance, plan } = useCredits();
  // The free plan's exports carry the BlinkSpot stamp in the corner (lib/stamp.ts).
  const stampExport = plan !== null && needsStamp(plan);
  const aiLocked = balance !== null && balance <= 0;

  // Ask BlinkSpot can read and edit this timeline through the editor bridge (smart editing).
  // Nothing visual changes here; an AI edit is applied only when the user presses Apply.
  const liveTimeline = useRef<EditorState>({ videoClips: [], audioClips: [], textLayers: [], assets: [] });
  useEffect(() => {
    liveTimeline.current = { videoClips, audioClips, textLayers, assets } as EditorState;
  }, [videoClips, audioClips, textLayers, assets]);

  // Undo and redo for every change to the timeline (2026-10-23: Cmd+Z on a Mac, Ctrl+Z on Windows;
  // it used to keep one step, and only for AI changes, splits and duplicates). A burst of changes
  // (a drag, a trim) settles for 350 ms and becomes one step. Snapshots are the arrays themselves,
  // compared by content: some effects rebuild an array with the same clips in it (a video's length
  // arriving), and a by-reference check made each of those a step, so Undo seemed to do nothing.
  type Snap = { videoClips: TrackClip[]; audioClips: TrackClip[]; textLayers: TextLayer[] };
  const history = useRef<History<Snap>>(emptyHistory<Snap>());
  const [, setHistoryTick] = useState(0);
  const sameList = (a: unknown[], b: unknown[]) => a === b || (a.length === b.length && JSON.stringify(a) === JSON.stringify(b));
  const sameSnap = (a: Snap, b: Snap) => sameList(a.videoClips, b.videoClips) && sameList(a.audioClips, b.audioClips) && sameList(a.textLayers, b.textLayers);
  const liveSnap = (): Snap => ({ videoClips: liveTimeline.current.videoClips as TrackClip[], audioClips: liveTimeline.current.audioClips as TrackClip[], textLayers: liveTimeline.current.textLayers as TextLayer[] });
  // A file's real length arrives after its clip is added (a Library video is guessed at 10 s until
  // then). That correction is not an edit: it joins the current step, and a step restored later
  // never brings the guess back.
  const knownLength = useRef<Record<string, number>>({});
  const absorbNext = useRef(false);
  const withRealLengths = (list: TrackClip[]) => list.map((c) => {
    const d = knownLength.current[c.url];
    return d && (c.maxDuration !== d || c.trimEnd > d) ? { ...c, maxDuration: d, trimEnd: Math.min(c.trimEnd, d) } : c;
  });
  const keep = useRef((snap: Snap, absorb = false) => {
    const h = history.current;
    const next = absorb && h.present ? (sameSnap(h.present, snap) ? h : { ...h, present: snap }) : commit(h, snap, sameSnap);
    if (next === h) return;
    history.current = next;
    setHistoryTick((t) => t + 1);
    useEditorBridge.setState({ canUndo: next.past.length > 0 });
  });
  const travel = useRef((step: (h: History<Snap>) => History<Snap>) => {
    keep.current(liveSnap()); // a change still settling becomes its own step first
    const stepped = step(history.current);
    if (stepped === history.current || !stepped.present) return;
    const present = { videoClips: withRealLengths(stepped.present.videoClips), audioClips: withRealLengths(stepped.present.audioClips), textLayers: stepped.present.textLayers };
    history.current = { ...stepped, present };
    setHistoryTick((t) => t + 1);
    useEditorBridge.setState({ canUndo: stepped.past.length > 0 });
    setVideoClips(present.videoClips); setAudioClips(present.audioClips); setTextLayers(present.textLayers);
  });
  const undoTimeline = () => travel.current(undoStep);
  const redoTimeline = () => travel.current(redoStep);
  const canUndoTimeline = history.current.past.length > 0;
  const canRedoTimeline = history.current.future.length > 0;
  // For the shortcut hints: the server says "not a Mac", the browser corrects it after hydrating.
  const isMac = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent), () => false);

  useEffect(() => {
    useEditorBridge.setState({
      attached: true,
      getState: () => liveTimeline.current,
      // An AI edit is one step in the history like any other, so Undo (or Cmd/Ctrl+Z) takes it back.
      apply: (ops) => {
        keep.current(liveSnap());
        const next = applyEditOps(liveTimeline.current, ops);
        setVideoClips(next.videoClips as TrackClip[]);
        setAudioClips(next.audioClips as TrackClip[]);
        setTextLayers(next.textLayers as TextLayer[]);
      },
      undo: () => travel.current(undoStep),
    });
    return () => useEditorBridge.setState({ attached: false, getState: null, apply: null, undo: null, canUndo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A queued stack (rendered scenes, or clips picked in the Library) lands on the main track in order.
  // The timeline is kept on this device (2026-10-20: leaving the editor lost the edit). Files from
  // the computer are kept too, so their clips come back. Restored before any queued clips land.
  type VideoDraft = { assets: MediaAsset[]; videoClips: TrackClip[]; audioClips: TrackClip[]; textLayers: TextLayer[]; canvasAspect: CanvasAspect; fitMode: FitMode };
  const draftKey = `videoEditor:${activeBrand?.id ?? "none"}`;
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const d = await loadDraft<VideoDraft>(draftKey);
      if (!alive) return;
      const empty = !liveTimeline.current.videoClips.length && !liveTimeline.current.audioClips.length && !liveTimeline.current.textLayers.length;
      if (d && empty && (d.value.videoClips.length || d.value.audioClips.length || d.value.textLayers.length)) {
        const relinked = new Map<string, string>();
        for (const a of d.value.assets) {
          if (!a.url.startsWith("blob:")) continue;
          const file = await loadDraft<Blob>(`videoFile:${a.id}`);
          if (file) relinked.set(a.url, URL.createObjectURL(file.value));
        }
        if (!alive) return;
        const fix = (u: string) => relinked.get(u) ?? u;
        const usable = (u: string) => !u.startsWith("blob:") || relinked.has(u);
        setAssets(d.value.assets.filter((a) => usable(a.url)).map((a) => ({ ...a, url: fix(a.url), thumb: fix(a.thumb) })));
        setVideoClips(d.value.videoClips.filter((c) => usable(c.url)).map((c) => ({ ...c, url: fix(c.url) })));
        setAudioClips(d.value.audioClips.filter((c) => usable(c.url)).map((c) => ({ ...c, url: fix(c.url) })));
        setTextLayers(d.value.textLayers);
        setCanvasAspect(d.value.canvasAspect);
        setFitMode(d.value.fitMode);
        toast(`Picked up your edit from ${draftAge(d.at)}.`, { duration: 9000, action: { label: "Start fresh", onClick: () => {
          setVideoClips([]); setAudioClips([]); setTextLayers([]);
          void clearDraft(draftKey);
          d.value.assets.forEach((a) => { if (a.url.startsWith("blob:")) void clearDraft(`videoFile:${a.id}`); });
        } } });
      }
      setDraftReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    const t = setTimeout(() => { void saveDraft<VideoDraft>(draftKey, { assets, videoClips, audioClips, textLayers, canvasAspect, fitMode }); }, 1000);
    return () => clearTimeout(t);
  }, [draftReady, draftKey, assets, videoClips, audioClips, textLayers, canvasAspect, fitMode]);
  useEffect(() => {
    if (!draftReady) return;
    const snap = { videoClips, audioClips, textLayers };
    const absorb = absorbNext.current;
    absorbNext.current = false;
    const t = setTimeout(() => keep.current(snap, absorb), 350);
    return () => clearTimeout(t);
  }, [draftReady, videoClips, audioClips, textLayers]);

  const queued = useEditorBridge((b) => b.queue);
  useEffect(() => {
    if (!queued.length || !draftReady) return;
    useEditorBridge.setState({ queue: [] });
    const newAssets: MediaAsset[] = [];
    const newClips: TrackClip[] = [];
    let at = Math.max(0, ...liveTimeline.current.videoClips.filter((c) => (c.trackRow ?? 0) === 0).map((c) => c.timelineStart + (span(c))));
    for (const q of queued) {
      const id = crypto.randomUUID();
      const length = q.duration > 0 ? q.duration : 5;
      newAssets.push({ id, type: "video", url: q.url, thumb: q.url, name: q.name, duration: length });
      newClips.push({ id: crypto.randomUUID(), assetId: id, url: q.url, type: "video", name: q.name, timelineStart: at, trimStart: 0, trimEnd: length, maxDuration: length, opacity: 100, volume: 100, trackRow: 0 });
      at += length;
    }
    setAssets((prev) => [...newAssets, ...prev]);
    setVideoClips((prev) => [...prev, ...newClips]);
  }, [queued, draftReady]);
  const [hoveredTrackInfo, setHoveredTrackInfo] = useState<{ type: string, row: number } | null>(null);

  const videoTrackCount = Math.max(1, ...videoClips.map(c => (c.trackRow || 0) + 1));
  const textTrackCount = Math.max(1, ...textLayers.map(c => (c.trackRow || 0) + 1));
  const audioTrackCount = Math.max(1, ...audioClips.map(c => (c.trackRow || 0) + 1));

  const videoRefs = useRef<{ [id: string]: HTMLVideoElement | null }>({});
  const audioRefs = useRef<{ [id: string]: HTMLVideoElement | HTMLAudioElement | null }>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragTextRef = useRef<{ id: string; startX: number; startY: number; initX: number; initY: number; } | null>(null);
  const trimRef = useRef<{ id: string; type: "video" | "audio" | "text"; edge: "start" | "end"; startMouseX: number; initTrim: number; initTimeline: number; } | null>(null);
  const clipDragRef = useRef<{ id: string; type: "video" | "audio" | "text"; startMouseX: number; initTimelineStart: number; } | null>(null);

  async function loadDatabaseContent(limit: number, filterType: "library" | "sequence" | "audio") {
    // ✨ FIX: Require activeBrand so libraries are isolated to the specific brand
    if (!clientId || !activeBrand) return;
    setIsLoadingDB(true);

    // ✨ SYNCED with content/page.tsx — all known sequence type variations
    const sequenceTypes = ["sequence_clip", "story_sequence", "storyboard", "story"];

    let query = supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .eq("brand_id", activeBrand.id) // ✨ Isolate query to current brand
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filterType === "sequence") {
      query = query.in("content_type", sequenceTypes);
    } else if (filterType === "audio") {
      query = query.in("content_type", ["generated_audio", "audio", "music", "voiceover"]);
    } else {
      // Library: exclude ALL sequence types + audio so they don't bleed into General
      query = query.not("content_type", "in", `(${sequenceTypes.concat(["generated_audio"]).join(",")})`);
    }

    const { data, error } = await query;

    if (data) {
      const dbAssets: MediaAsset[] = [];
      data.forEach((item) => {
        let parsedUrls: string[] = [];

        // ✨ FIX: Always collect from BOTH image_urls and video_urls, then deduplicate.
        // Previously we only checked video_urls if image_urls was empty, which meant
        // story sequences with videos in video_urls were invisible.
        let fromImages: string[] = [];
        if (Array.isArray(item.image_urls) && item.image_urls.length > 0) {
          fromImages = item.image_urls;
        } else if (typeof item.image_urls === 'string' && item.image_urls.length > 5) {
          try { fromImages = JSON.parse(item.image_urls); } catch (e) { }
        }

        let fromVideos: string[] = [];
        if (Array.isArray(item.video_urls) && item.video_urls.length > 0) {
          fromVideos = item.video_urls;
        } else if (typeof item.video_urls === 'string' && item.video_urls.length > 5) {
          try { fromVideos = JSON.parse(item.video_urls); } catch (e) { fromVideos = [item.video_urls]; }
        }

        // Merge and deduplicate — put videos first so they get priority display
        const allUrls = [...fromVideos, ...fromImages];
        parsedUrls = [...new Set(allUrls.filter((u: string) => typeof u === 'string' && u.length > 5))];

        parsedUrls.forEach((url: string, idx: number) => {
          const isAudioUrl = url.includes(".mp3") || url.includes(".wav") || url.includes("audios/");
          const isAudioType = item.content_type === "generated_audio";
          const isAudio = isAudioUrl || isAudioType;

          // ✨ SYNCED: Recognize all sequence types as video assets
          const isSequenceType = sequenceTypes.includes(item.content_type);
          // A still is a still, whatever folder it's in: Storyboard start frames live in story-sequences/ too (QA-020).
          const isStill = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url) || url.includes("/image/upload/");
          const isVid = !isStill && (url.includes(".mp4") || url.includes(".mov") || url.includes("/video/upload/") || url.includes("story-sequences") || isSequenceType || item.content_type === "reel");

          if (filterType === "audio" && !isAudio) return;
          if (filterType === "library" && (isAudio || isSequenceType)) return;

          const mediaType = isAudio ? "audio" : isVid ? "video" : "image";

          dbAssets.push({
            id: `db-${item.id}-${idx}`,
            type: mediaType,
            url: url,
            thumb: url,
            name: item.caption || (isAudio ? `Voiceover/Music` : `${item.content_type || "Generated"} Media`),
          });
        });
      });
      setAssets(dbAssets);
      setHasMoreAssets(data.length >= limit);
    }
    setIsLoadingDB(false);
  }

  useEffect(() => {
    // ✨ FIX: Depend on activeBrand.id so switching brands forces a fresh fetch
    loadDatabaseContent(assetPageLimit, assetFilter);
  }, [clientId, activeBrand?.id, assetPageLimit, assetFilter]);

  const handleFilterSwitch = (mode: "library" | "sequence" | "audio") => {
    setAssetFilter(mode);
    setAssetPageLimit(8);
    setAssets([]);
  };

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    function updatePlayhead(time: number) {
      if (isPlaying) {
        const deltaSeconds = (time - lastTime) / 1000;
        lastTime = time;

        setGlobalTime((prev) => {
          const nextTime = prev + deltaSeconds;
          const maxVideo = videoClips.length > 0 ? Math.max(...videoClips.map((c) => c.timelineStart + (span(c)))) : 0;
          const maxAudio = audioClips.length > 0 ? Math.max(...audioClips.map((c) => c.timelineStart + (span(c)))) : 0;
          const maxText = textLayers.length > 0 ? Math.max(...textLayers.map((c) => c.timelineStart + (span(c)))) : 0;
          const maxTime = Math.max(maxVideo, maxAudio, maxText, 5);

          if (nextTime >= maxTime) { setIsPlaying(false); return maxTime; }
          return nextTime;
        });
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    }
    if (isPlaying) animationFrameId = requestAnimationFrame(updatePlayhead);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, videoClips, audioClips, textLayers]);

  useEffect(() => {
    videoClips.forEach(clip => {
      const el = videoRefs.current[clip.id];
      if (!el) return;
      const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip));
      if (isActive) {
        el.volume = (clip.volume ?? 100) / 100;
        // Slow-mo (2026-10-23): the source second at this time, played at the clip's speed.
        const rate = speedOf(clip);
        if (el.playbackRate !== rate) el.playbackRate = rate;
        const expectedTime = sourceAt(clip, globalTime);
        if (Math.abs(el.currentTime - expectedTime) > 0.25 * rate) el.currentTime = expectedTime;
        if (isPlaying && el.paused) el.play().catch(() => { });
      } else {
        if (!el.paused) el.pause();
      }
    });

    audioClips.forEach(clip => {
      const el = audioRefs.current[clip.id];
      if (!el) return;
      const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip));
      if (isActive) {
        el.volume = (clip.volume ?? 100) / 100;
        const expectedTime = clip.trimStart + (globalTime - clip.timelineStart);
        if (Math.abs(el.currentTime - expectedTime) > 0.25) el.currentTime = expectedTime;
        if (isPlaying && el.paused) el.play().catch(() => { });
      } else {
        if (!el.paused) el.pause();
      }
    });
  }, [globalTime, videoClips, audioClips, isPlaying]);

  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      Object.values(videoRefs.current).forEach(el => el?.pause());
      Object.values(audioRefs.current).forEach(el => el?.pause());
    } else {
      setIsPlaying(true);
    }
  }

  const getProxyUrl = (originalUrl: string) => {
    if (originalUrl.startsWith('blob:')) return originalUrl;
    return `/api/fetch-media?url=${encodeURIComponent(originalUrl)}`;
  };

  /** A photo as a JPEG no bigger than `max` px on its long side (decoded in the browser, same-origin via the proxy). */
  async function imageForExport(url: string, max: number): Promise<Uint8Array> {
    const blob = await (await fetch(getProxyUrl(url))).blob();
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!jpg) return fetchFile(getProxyUrl(url));
    return new Uint8Array(await jpg.arrayBuffer());
  }

  async function ensureFfmpeg() {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg.loaded) {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    }
    return ffmpeg;
  }

  const handleRender = async () => {
    if (!clientId) { toast("Still loading your account. Try Export again in a second."); return; }
    // V1 plays in sequence; clips on the rows above are laid over it at their time (2026-10-15).
    const hasBase = videoClips.some((c) => (c.trackRow ?? 0) === 0);
    const orderedVideos = videoClips.filter((c) => !hasBase || (c.trackRow ?? 0) === 0).sort((a, b) => a.timelineStart - b.timelineStart);
    const overlays = hasBase ? videoClips.filter((c) => (c.trackRow ?? 0) > 0).sort((a, b) => (a.trackRow ?? 0) - (b.trackRow ?? 0) || a.timelineStart - b.timelineStart) : [];
    if (orderedVideos.length === 0) return alert("Please add at least one visual layer (image or video) to the timeline!");

    setIsRendering(true);
    setRenderComplete(false);
    setIsPlaying(false);
    setRenderProgress(5);
    setRenderStatusText("Booting AI Render Engine...");

    try {
      const ffmpeg = await ensureFfmpeg();
      ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
      const { W, H } = canvasSize(canvasAspect);

      setRenderProgress(15);

      let hasFont = false;
      if (textLayers.length > 0) {
        setRenderStatusText("Loading font libraries...");
        // Our own copy (the old one came through the media proxy, which refused the host, so an error
        // page was saved as the font and every export with text failed). Checked before use.
        try {
          const fontData = await fetchFile('/fonts/Inter-ExtraBold.ttf');
          const sig = String.fromCharCode(...fontData.slice(0, 4));
          if (fontData.length > 10_000 && (sig === "\u0000\u0001\u0000\u0000" || sig === "OTTO" || sig === "true")) {
            await ffmpeg.writeFile('font.ttf', fontData);
            hasFont = true;
          } else console.warn("Font file looked wrong; exporting without text.");
        } catch (e) {
          console.warn("Could not load font.", e);
        }
      }

      const inputArgs: string[] = [];
      const filterSteps: string[] = [];
      let concatStreams = "";

      // Each file is fetched and written once (a beat cut reuses the same clips many times), and photos
      // are shrunk to about the export size first: a looped 4K PNG was decoded 30 times a second.
      const written = new Map<string, string>();
      for (let i = 0; i < orderedVideos.length; i++) {
        setRenderStatusText(`Processing visual media ${i + 1} of ${orderedVideos.length}...`);
        const clip = orderedVideos[i];
        const isImg = clip.type === 'image';
        const duration = span(clip); // on the timeline
        const source = clip.trimEnd - clip.trimStart; // seconds of the file
        let fileName = written.get(clip.url);
        if (!fileName) {
          fileName = `media_${written.size}.${isImg ? 'jpg' : 'mp4'}`;
          try {
            await ffmpeg.writeFile(fileName, isImg ? await imageForExport(clip.url, Math.max(W, H)) : await fetchFile(getProxyUrl(clip.url)));
          } catch (err) {
            throw new Error(`Failed to download media item ${i + 1}.`);
          }
          written.set(clip.url, fileName);
        }

        if (isImg) {
          inputArgs.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', fileName);
        } else {
          inputArgs.push('-ss', String(clip.trimStart), '-t', String(source), '-i', fileName);
        }

        filterSteps.push(normalizeFilter(i, W, H, fitMode, isImg ? 1 : speedOf(clip)));
        concatStreams += `[v${i}]`;

        setRenderProgress(15 + Math.floor((i / orderedVideos.length) * 30));
      }

      setRenderStatusText("Stitching sequence...");
      filterSteps.push(`${concatStreams}concat=n=${orderedVideos.length}:v=1:a=0[outv]`);

      let finalVideoMap = '[outv]';

      // Layers above V1 (motion lower thirds, picture-in-picture), see-through where they are.
      for (let j = 0; j < overlays.length; j++) {
        setRenderStatusText(`Layering ${j + 1} of ${overlays.length}...`);
        const clip = overlays[j];
        const index = orderedVideos.length + j;
        const duration = span(clip); // on the timeline
        const isImg = clip.type === 'image';
        const source = isImg ? duration : clip.trimEnd - clip.trimStart;
        const fileName = `overlay_${j}.${isImg ? 'jpg' : 'video'}`;
        try {
          const bytes = isImg ? await imageForExport(clip.url, Math.max(W, H)) : await fetchFile(getProxyUrl(clip.url));
          // Read the codec first: writeFile hands the bytes to ffmpeg's worker and empties this copy.
          const decoder = isImg ? null : webmDecoder(bytes as Uint8Array);
          await ffmpeg.writeFile(fileName, bytes);
          if (isImg) inputArgs.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', fileName);
          else inputArgs.push(...(decoder ? ['-c:v', decoder] : []), '-ss', String(clip.trimStart), '-t', String(source), '-i', fileName);
        } catch {
          throw new Error(`Failed to download layer ${j + 1}.`);
        }
        filterSteps.push(overlayFilter(index, W, H, fitMode, clip.timelineStart, clip.opacity ?? 100, isImg ? 1 : speedOf(clip)));
        filterSteps.push(overlayStep(finalVideoMap, index, clip.timelineStart, clip.timelineStart + duration, `lay${j}`));
        finalVideoMap = `[lay${j}]`;
      }

      if (textLayers.length > 0 && hasFont) {
        setRenderStatusText("Baking text layers...");
        let textFilters: string[] = [];
        // Centred on its point like the preview, sized for the canvas width, captions outlined.
        textLayers.forEach((layer) => textFilters.push(drawtextFilter(layer, W)));
        if (textFilters.length > 0) {
          filterSteps.push(`${finalVideoMap}${textFilters.join(',')}[textout]`);
          finalVideoMap = '[textout]';
        }
      }

      let hasAudio = false;
      if (audioClips.length > 0) {
        setRenderStatusText("Mixing and syncing audio layers...");

        if (audioClips.length === 1) {
          const clip = audioClips[0];
          const extMatch = clip.url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
          const rawExt = extMatch ? extMatch[1].toLowerCase() : 'mp3';
          const safeExt = ['mp4', 'mp3', 'wav', 'mov', 'webm', 'aac'].includes(rawExt) ? rawExt : 'mp3';

          const fileName = `audio_0.${safeExt}`;
          const duration = span(clip);
          await ffmpeg.writeFile(fileName, await fetchFile(getProxyUrl(clip.url)));

          inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);

          const delayMs = Math.floor(clip.timelineStart * 1000);
          const audioInputIndex = orderedVideos.length + overlays.length;
          filterSteps.push(`[${audioInputIndex}:a]adelay=${delayMs}|${delayMs}[outa]`);
          hasAudio = true;
        } else {
          let audioMixStr = "";
          for (let i = 0; i < audioClips.length; i++) {
            const clip = audioClips[i];
            const extMatch = clip.url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
            const rawExt = extMatch ? extMatch[1].toLowerCase() : 'mp3';
            const safeExt = ['mp4', 'mp3', 'wav', 'mov', 'webm', 'aac'].includes(rawExt) ? rawExt : 'mp3';

            const fileName = `audio_${i}.${safeExt}`;
            const duration = span(clip);
            await ffmpeg.writeFile(fileName, await fetchFile(getProxyUrl(clip.url)));

            inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);

            const delayMs = Math.floor(clip.timelineStart * 1000);
            const audioInputIndex = orderedVideos.length + overlays.length + i;
            filterSteps.push(`[${audioInputIndex}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
            audioMixStr += `[a${i}]`;
            hasAudio = true;
            setRenderProgress(40 + Math.floor((i / audioClips.length) * 20));
          }
          filterSteps.push(`${audioMixStr}amix=inputs=${audioClips.length}:duration=longest:dropout_transition=0[outa]`);
        }
      }

      if (stampExport) {
        // Last input: the stamp picture, laid over the finished picture for the whole video.
        const b = stampBox(W, H);
        await ffmpeg.writeFile('stamp.png', await fetchFile('/brand/stamp.png'));
        const stampIndex = orderedVideos.length + overlays.length + audioClips.length;
        inputArgs.push('-i', 'stamp.png');
        filterSteps.push(`[${stampIndex}:v]scale=${b.width}:${b.height}[stampimg]`);
        filterSteps.push(`${finalVideoMap}[stampimg]overlay=${b.left}:${b.top}:eof_action=repeat[stamped]`);
        finalVideoMap = '[stamped]';
      }

      setRenderProgress(70);
      const finalFilterGraph = filterSteps.join(';');

      const maxVideoTime = orderedVideos.reduce((max, clip) => Math.max(max, clip.timelineStart + (span(clip))), 0);

      setRenderStatusText("Encoding final masterpiece...");
      const execArgs = [
        ...inputArgs,
        '-filter_complex', finalFilterGraph,
        '-map', finalVideoMap
      ];

      if (hasAudio) {
        execArgs.push('-map', '[outa]');
        execArgs.push('-c:a', 'aac', '-b:a', '192k');
      }

      if (maxVideoTime > 0) {
        execArgs.push('-t', String(maxVideoTime));
      }

      // CRF 20 (default 23): ultrafast at 23 left faint specks around sharp coloured edges (motion end cards).
      execArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', 'output.mp4');

      const retCode = await ffmpeg.exec(execArgs);

      if (retCode !== 0) {
        throw new Error(`Engine failed (Exit code: ${retCode}).`);
      }

      setRenderProgress(90);
      setRenderStatusText("File successfully baked! Preparing download...");

      const data = await ffmpeg.readFile('output.mp4');
      if (data.length === 0) throw new Error("Render produced an empty file.");

      const finalBlob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      const localUrl = URL.createObjectURL(finalBlob);

      const downloadLink = document.createElement('a');
      downloadLink.href = localUrl;
      downloadLink.download = `Blink_Commercial_${Date.now()}.mp4`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setRenderStatusText("Saving backup to your Content Grid...");

      const path = `videos/${clientId}/final_render_${Date.now()}.mp4`;
      await supabase.storage.from("assets").upload(path, finalBlob);
      const finalUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;

      const { error } = await supabase.from('content').insert({
        client_id: clientId,
        brand_id: activeBrand?.id, // ✨ Also attach the brand here for organization
        content_type: 'reel',
        caption: '🎬 Final Edited Commercial',
        status: 'draft',
        video_urls: [finalUrl],
        image_urls: [finalUrl],
        ai_model: 'blink-wasm-editor'
      });

      if (error) throw error;

      setRenderProgress(100);
      setRenderComplete(true);

    } catch (err: any) {
      console.error("Render failed:", err);
      alert(`Render failed: ${err.message}`);
      setIsRendering(false);
      setRenderProgress(0);
      setRenderStatusText("");
    }
  };

  function handleDragStart(e: React.DragEvent, asset: MediaAsset) { e.dataTransfer.setData("application/json", JSON.stringify(asset)); }

  async function deleteAsset(assetId: string, assetName: string) {
    if (!confirm(`Are you sure you want to permanently delete "${assetName}"? This cannot be undone.`)) return;

    setAssets((prev) => prev.filter((a) => a.id !== assetId));

    if (assetId.startsWith('db-')) {
      const dbId = assetId.split('-')[1];

      const { error } = await supabase
        .from('content')
        .delete()
        .eq('id', dbId);

      if (error) {
        console.error("Failed to delete from Supabase:", error);
        alert("Failed to delete asset from the database.");
      }
    }
  }

  // Files from the computer go one after another at the end of the video track, like the Library's +
  // (2026-10-26: three phone clips uploaded at the playhead landed on top of each other). Several at once is fine.
  function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    let at = videoClips.length ? Math.max(0, ...videoClips.filter((c) => (c.trackRow ?? 0) === 0).map((c) => c.timelineStart + (span(c)))) : 0;
    for (const file of files) {
      const trackType = file.type.includes("audio") ? "audio" : file.type.includes("video") ? "video" : "image";
      if (trackType === "audio") { processDroppedFile(file, "audio", globalTime, 0); continue; }
      processDroppedFile(file, trackType, at, 0);
      at += trackType === "image" ? 5 : 10;
    }
  }

  function processDroppedFile(file: File, trackType: "video" | "audio" | "image", dropTime: number, row: number) {
    const url = URL.createObjectURL(file);
    const newAsset: MediaAsset = { id: crypto.randomUUID(), type: trackType, url, thumb: url, name: file.name, duration: 10 };
    void saveDraft(`videoFile:${newAsset.id}`, file);
    setAssets((prev) => [newAsset, ...prev]);
    addClipToTimeline(newAsset, trackType === "audio" ? "audio" : "video", dropTime, row);
  }

  /**
   * A rendered motion graphic onto the timeline (2026-10-15): full-frame ones at the start (the
   * rest moves along, text and audio too, so everything stays in sync) or after the last clip; a
   * see-through lower third over the video at the playhead, on the row above.
   */
  function addMotion(m: AddedMotion, where: MotionPlace) {
    const asset: MediaAsset = { id: crypto.randomUUID(), type: "video", url: m.url, thumb: m.url, name: m.name, duration: m.seconds };
    setAssets((prev) => [asset, ...prev]);
    const clip = (start: number, row: number): TrackClip => ({ id: crypto.randomUUID(), assetId: asset.id, url: m.url, type: "video", name: m.name, timelineStart: start, trimStart: 0, trimEnd: m.seconds, maxDuration: m.seconds, opacity: 100, volume: 100, trackRow: row });
    if (m.kind === "overlay") {
      setVideoClips((prev) => [...prev, clip(globalTime, Math.max(1, ...prev.filter((c) => (c.trackRow ?? 0) > 0 && c.timelineStart < globalTime + m.seconds && c.timelineStart + (span(c)) > globalTime).map((c) => (c.trackRow ?? 0) + 1)))]);
    } else if (where === "start") {
      const later = <T extends { timelineStart: number }>(x: T) => ({ ...x, timelineStart: x.timelineStart + m.seconds });
      setVideoClips((prev) => [clip(0, 0), ...prev.map(later)]);
      setTextLayers((prev) => prev.map(later));
      setAudioClips((prev) => prev.map(later));
    } else {
      setVideoClips((prev) => [...prev, clip(Math.max(0, ...prev.filter((c) => (c.trackRow ?? 0) === 0).map((c) => c.timelineStart + (span(c)))), 0)]);
    }
  }

  function addClipToTimeline(asset: MediaAsset, trackType: "video" | "audio", dropTime: number, row: number) {
    const known = knownLength.current[asset.url];
    const defaultDuration = asset.type === "image" ? 5 : known || asset.duration || 10;
    const newClip: TrackClip = {
      id: crypto.randomUUID(), assetId: asset.id, url: asset.url, type: asset.type as any, name: asset.name,
      timelineStart: dropTime, trimStart: 0, trimEnd: defaultDuration, maxDuration: defaultDuration,
      opacity: 100, volume: 100, trackRow: row, ...(asset.type !== "image" && !known ? { guessed: true } : {}),
    };
    // From the latest timeline: several files added in one go all land (2026-10-26).
    if (trackType === "video") setVideoClips((prev) => [...prev, newClip]);
    else setAudioClips((prev) => [...prev, newClip]);
  }

  function handleDropOnTrack(e: React.DragEvent, trackType: "video" | "audio", targetRow: number) {
    e.preventDefault();
    setHoveredTrackInfo(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const dropTime = Math.max(0, dropX / PIXELS_PER_SECOND);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Several files dropped together play one after another from where they were dropped.
      let at = dropTime;
      for (const file of Array.from(e.dataTransfer.files)) {
        const kind = file.type.includes("audio") ? "audio" : file.type.includes("video") ? "video" : "image";
        processDroppedFile(file, kind, at, targetRow);
        at += kind === "image" ? 5 : 10;
      }
      return;
    }

    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const asset = JSON.parse(data) as MediaAsset;
    if (trackType === "video" && asset.type === "audio") return alert("Please drop a video/image file here.");
    if (trackType === "audio" && asset.type !== "audio") return alert("Please drop an audio file here.");
    addClipToTimeline(asset, trackType, dropTime, targetRow);
  }

  function handleLoadedMetadata(id: string, duration: number, type: "video" | "audio") {
    if (isNaN(duration) || duration === Infinity) duration = 10;
    const clip = (type === "video" ? videoClips : audioClips).find((c) => c.id === id);
    if (clip && Number.isFinite(duration)) knownLength.current[clip.url] = duration;
    absorbNext.current = true; // the real length joins the current step; it isn't an edit
    // A clip still at its guessed length, untrimmed, takes the whole file (a 24 s phone clip stayed at
    // the 10 s guess, 2026-10-26), and what comes after it on its row moves along.
    const real = (prev: TrackClip[]) => {
      const c = prev.find((x) => x.id === id);
      if (!c) return prev;
      if (!(c.guessed && c.trimStart === 0 && c.trimEnd === c.maxDuration && duration > c.trimEnd)) {
        return prev.map((x) => x.id === id ? { ...x, maxDuration: duration, trimEnd: Math.min(x.trimEnd, duration), guessed: false } : x);
      }
      const oldEnd = c.timelineStart + span(c);
      const grown = { ...c, maxDuration: duration, trimEnd: duration, guessed: false };
      const move = span(grown) - span(c);
      return prev.map((x) => x.id === id ? grown : (x.trackRow ?? 0) === (c.trackRow ?? 0) && x.timelineStart >= oldEnd - 0.05 ? { ...x, timelineStart: x.timelineStart + move } : x);
    };
    if (type === "video") setVideoClips(real);
    else setAudioClips(real);
  }

  const updateTextLayer = (id: string, updates: Partial<TextLayer>) => setTextLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  const updateVideoClip = (id: string, updates: Partial<TrackClip>) => setVideoClips(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const updateAudioClip = (id: string, updates: Partial<TrackClip>) => setAudioClips(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

  // ✨ FIX: Start playhead dragging
  function handlePlayheadMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    setIsScrubbingUI(true);
    setIsPlaying(false);
  }

  // ✨ FIX: Handle clicking empty timeline space to jump
  function handleTimelineMouseDown(e: React.MouseEvent) {
    if (!timelineRef.current) return;
    setIsPlaying(false);

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    // Calculate raw X within the timeline container
    if (clickX >= 0) {
      setGlobalTime(clickX / PIXELS_PER_SECOND);
      setIsDraggingPlayhead(true);
      setIsScrubbingUI(true);
    }
  }

  function onTrimMouseDown(e: React.MouseEvent, id: string, type: "video" | "audio" | "text", edge: "start" | "end") {
    e.preventDefault(); e.stopPropagation();
    let clip: any = type === "video" ? videoClips.find((c) => c.id === id) : type === "audio" ? audioClips.find((c) => c.id === id) : textLayers.find((c) => c.id === id);
    if (!clip) return;
    trimRef.current = { id, type, edge, startMouseX: e.clientX, initTrim: edge === "start" ? clip.trimStart : clip.trimEnd, initTimeline: clip.timelineStart };
    setSelectedElement({ id, type });
  }

  function onClipMouseDown(e: React.MouseEvent, id: string, type: "video" | "audio" | "text") {
    e.stopPropagation();
    let clip: any = type === "video" ? videoClips.find((c) => c.id === id) : type === "audio" ? audioClips.find((c) => c.id === id) : textLayers.find((c) => c.id === id);
    if (!clip) return;
    clipDragRef.current = { id, type, startMouseX: e.clientX, initTimelineStart: clip.timelineStart };
    setSelectedElement({ id, type });
  }

  // ✨ REWRITTEN MOUSE TRACKING FOR PERFECT PLAYHEAD DRAGGING
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      // 1. Handle Playhead Dragging
      if (isDraggingPlayhead && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        // Calculate raw X within the timeline container
        let rawX = e.clientX - rect.left;
        // Clamp it to the visible window so it doesn't break
        rawX = Math.max(0, Math.min(rawX, rect.width));
        // Add scroll position to get true timeline position
        const absoluteX = rawX + timelineRef.current.scrollLeft;

        setGlobalTime(absoluteX / PIXELS_PER_SECOND);
      }

      // 2. Handle Text Overlay Dragging on Canvas
      if (dragTextRef.current && canvasRef.current) {
        const currentDrag = dragTextRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - currentDrag.startX) / rect.width) * 100;
        const dy = ((e.clientY - currentDrag.startY) / rect.height) * 100;
        const newX = Math.min(95, Math.max(5, currentDrag.initX + dx));
        const newY = Math.min(95, Math.max(5, currentDrag.initY + dy));
        setTextLayers((prev) => prev.map((l) => l.id === currentDrag.id ? { ...l, x: newX, y: newY } : l));
      }

      // 3. Handle Clip Trimming
      if (trimRef.current) {
        const { id, type, edge, startMouseX, initTrim, initTimeline } = trimRef.current;
        const deltaSeconds = (e.clientX - startMouseX) / PIXELS_PER_SECOND;
        let setClips: any = type === "video" ? setVideoClips : type === "audio" ? setAudioClips : setTextLayers;

        setClips((prev: any[]) => prev.map((clip: any) => {
          if (clip.id !== id) return clip;
          let newClip = { ...clip };
          // The mouse moves timeline seconds; a sped-up or slowed clip moves its source by that times its speed.
          const rate = speedOf(clip);
          if (edge === "start") {
            const newTrim = Math.max(0, Math.min(initTrim + deltaSeconds * rate, clip.trimEnd - 0.5));
            newClip.trimStart = newTrim;
            newClip.timelineStart = initTimeline + (newTrim - initTrim) / rate;
          } else {
            newClip.trimEnd = Math.max(clip.trimStart + 0.5, Math.min(clip.maxDuration, initTrim + deltaSeconds * rate));
          }
          return newClip;
        }));
      }

      // 4. Handle Clip Dragging
      if (clipDragRef.current) {
        const { id, type, startMouseX, initTimelineStart } = clipDragRef.current;
        const deltaSeconds = (e.clientX - startMouseX) / PIXELS_PER_SECOND;
        let newTimelineStart = Math.max(0, initTimelineStart + deltaSeconds);

        let setClips: any = type === "video" ? setVideoClips : type === "audio" ? setAudioClips : setTextLayers;

        setClips((prev: any[]) => prev.map((clip: any) => {
          if (clip.id !== id) return clip;

          if (isMagnetEnabled) {
            const snapThreshold = 15 / PIXELS_PER_SECOND;
            let bestSnapDist = snapThreshold;
            let bestSnapTime = newTimelineStart;
            const duration = span(clip);

            const allClips = [...videoClips, ...audioClips, ...textLayers];

            allClips.forEach(other => {
              if (other.id === id) return;
              const otherStart = other.timelineStart;
              const otherEnd = other.timelineStart + (span(other));

              if (Math.abs(newTimelineStart - otherEnd) < bestSnapDist) {
                bestSnapDist = Math.abs(newTimelineStart - otherEnd);
                bestSnapTime = otherEnd;
              }
              if (Math.abs(newTimelineStart - otherStart) < bestSnapDist) {
                bestSnapDist = Math.abs(newTimelineStart - otherStart);
                bestSnapTime = otherStart;
              }
              if (Math.abs((newTimelineStart + duration) - otherStart) < bestSnapDist) {
                bestSnapDist = Math.abs((newTimelineStart + duration) - otherStart);
                bestSnapTime = otherStart - duration;
              }
            });
            newTimelineStart = bestSnapTime;
          }

          return { ...clip, timelineStart: newTimelineStart };
        }));
      }
    }

    function onMouseUp() {
      setIsDraggingPlayhead(false);
      setIsScrubbingUI(false);
      dragTextRef.current = null;
      trimRef.current = null;
      clipDragRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [PIXELS_PER_SECOND, isMagnetEnabled, videoClips, audioClips, textLayers, isDraggingPlayhead]);


  function addTextLayer() {
    const id = crypto.randomUUID();
    setTextLayers([...textLayers, {
      id, text: "New Text", x: 50, y: 50, fontSize: 48, color: "#FFFFFF",
      timelineStart: globalTime, trimStart: 0, trimEnd: 5, maxDuration: 3600, opacity: 100, trackRow: 0
    }]);
    setSelectedElement({ id, type: "text" });
    setActiveTab("text");
  }

  function deleteSelected() {
    if (!selectedElement) return;
    if (selectedElement.type === "text") setTextLayers((prev) => prev.filter((l) => l.id !== selectedElement.id));
    if (selectedElement.type === "video") setVideoClips((prev) => prev.filter((c) => c.id !== selectedElement.id));
    if (selectedElement.type === "audio") setAudioClips((prev) => prev.filter((c) => c.id !== selectedElement.id));
    setSelectedElement(null);
  }

  const contentMax = Math.max(30, ...videoClips.map((c) => c.timelineStart + (span(c))), ...audioClips.map((c) => c.timelineStart + (span(c))), ...textLayers.map((c) => c.timelineStart + (span(c))), globalTime) + 60;
  const maxVisibleTime = Math.min(contentMax, 3600);

  let rulerStep = 1;
  if (zoom < 5) rulerStep = 5;
  if (zoom < 1) rulerStep = 30;
  if (zoom < 0.2) rulerStep = 60;

  // Font sizes on the studio preview scale with the canvas width (export uses the same rule).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setCanvasW(Math.round(e.contentRect.width) || 960));
    ro.observe(el);
    return () => ro.disconnect();
  }, [studio, canvasAspect]);

  // ───────────── STUDIO LOOK (2026-10-11) ─────────────
  // Same engine as the classic layout below (playback, trims, snapping, export, Ask's edits); a new
  // arrangement after Kezie's references: tool rail, media bin, big preview, inspector, and a timeline
  // with filmstrips, waveforms and beat markers. Plus split / duplicate / shortcuts, 9:16 and 1:1,
  // and three AI tools: cut to the beat (local, free), captions and shorts (transcribed, per minute).
  const totalLength = Math.max(0, ...videoClips.map((c) => c.timelineStart + (span(c))), ...audioClips.map((c) => c.timelineStart + (span(c))), ...textLayers.map((c) => c.timelineStart + (span(c))));
  const fmt = (s: number) => { const m = Math.floor(s / 60); const r = s - m * 60; return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0")}`; };
  const snapshot = () => keep.current(liveSnap());
  const canUndo = canUndoTimeline;

  function splitAtPlayhead() {
    const t = globalTime;
    const hit = (c: { timelineStart: number; trimStart: number; trimEnd: number }) => t > c.timelineStart + 0.1 && t < c.timelineStart + (span(c)) - 0.1;
    const pick = <T extends { id: string; timelineStart: number; trimStart: number; trimEnd: number }>(list: T[], type: string) =>
      (selectedElement?.type === type ? list.filter((c) => c.id === selectedElement.id) : list).find(hit);
    const v = pick(videoClips, "video"), a = !v ? pick(audioClips, "audio") : undefined, x = !v && !a ? pick(textLayers, "text") : undefined;
    const target = v ?? a ?? x;
    if (!target) { toast.info("Put the playhead over a clip to split it."); return; }
    snapshot();
    const cut = sourceAt(target, t);
    const left = { ...target, trimEnd: cut };
    const right = { ...target, id: crypto.randomUUID(), timelineStart: t, trimStart: cut };
    if (v) setVideoClips((p) => p.flatMap((c) => (c.id === v.id ? [left as TrackClip, right as TrackClip] : [c])));
    else if (a) setAudioClips((p) => p.flatMap((c) => (c.id === a.id ? [left as TrackClip, right as TrackClip] : [c])));
    else setTextLayers((p) => p.flatMap((c) => (c.id === x!.id ? [left as TextLayer, right as TextLayer] : [c])));
    setSelectedElement({ id: right.id, type: v ? "video" : a ? "audio" : "text" });
  }
  function duplicateSelected() {
    if (!selectedElement) return;
    snapshot();
    const copy = <T extends { id: string; timelineStart: number; trimStart: number; trimEnd: number }>(c: T): T => ({ ...c, id: crypto.randomUUID(), timelineStart: c.timelineStart + (span(c)) });
    if (selectedElement.type === "video") { const c = videoClips.find((x) => x.id === selectedElement.id); if (c) { const n = copy(c); setVideoClips((p) => [...p, n]); setSelectedElement({ id: n.id, type: "video" }); } }
    if (selectedElement.type === "audio") { const c = audioClips.find((x) => x.id === selectedElement.id); if (c) { const n = copy(c); setAudioClips((p) => [...p, n]); setSelectedElement({ id: n.id, type: "audio" }); } }
    if (selectedElement.type === "text") { const c = textLayers.find((x) => x.id === selectedElement.id); if (c) { const n = copy(c); setTextLayers((p) => [...p, n]); setSelectedElement({ id: n.id, type: "text" }); } }
  }
  /** Add a bin item at the playhead (tap-friendly alternative to dragging). */
  function addAssetAtPlayhead(asset: MediaAsset) {
    if (asset.type === "audio") addClipToTimeline(asset, "audio", globalTime, 0);
    else {
      const end = Math.max(0, ...videoClips.filter((c) => (c.trackRow ?? 0) === 0).map((c) => c.timelineStart + (span(c))));
      addClipToTimeline(asset, "video", videoClips.length ? end : 0, 0);
    }
  }
  function addTextPreset(kind: "title" | "subtitle" | "caption") {
    const id = crypto.randomUUID();
    const base = { id, x: 50, timelineStart: globalTime, trimStart: 0, trimEnd: kind === "caption" ? 3 : 4, maxDuration: 3600, opacity: 100, trackRow: 0 };
    const layer: TextLayer = kind === "title" ? { ...base, text: "Your headline", y: 22, fontSize: 56, color: "#FFFFFF", style: "plain" }
      : kind === "subtitle" ? { ...base, text: "A short supporting line", y: 32, fontSize: 30, color: "#FFFFFF", style: "plain" }
      : { ...base, text: "Words people read along", y: 82, fontSize: 34, color: "#FFFFFF", style: "caption" };
    setTextLayers((p) => [...p, layer]);
    setSelectedElement({ id, type: "text" });
  }

  // Studio shortcuts: Space play, S split, D duplicate, Delete/Backspace remove, arrows nudge the playhead,
  // Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    if (!studio) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      // Cmd+Z / Ctrl+Z undo, Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y redo (typing in a box keeps its own undo).
      if (isUndoKey(e)) { e.preventDefault(); undoTimeline(); return; }
      if (isRedoKey(e)) { e.preventDefault(); redoTimeline(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); splitAtPlayhead(); }
      else if (e.key === "d" || e.key === "D") { e.preventDefault(); duplicateSelected(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selectedElement) { e.preventDefault(); deleteSelected(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setGlobalTime((t) => t + (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setGlobalTime((t) => Math.max(0, t - (e.shiftKey ? 1 : 1 / 30))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Waveforms for audio clips (decoded once per file).
  useEffect(() => {
    if (!studio) return;
    for (const c of audioClips) {
      if (peaks[c.url] !== undefined) continue;
      setPeaks((p) => ({ ...p, [c.url]: [] }));
      void decodeAudio(c.url).then(({ samples }) => setPeaks((p) => ({ ...p, [c.url]: waveformPeaks(samples, 1200) }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioClips, studio]);

  async function decodeAudio(url: string): Promise<{ samples: Float32Array; sr: number }> {
    const buf = await (await fetch(getProxyUrl(url))).arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buf);
      const out = new Float32Array(audio.length);
      for (let ch = 0; ch < audio.numberOfChannels; ch++) { const d = audio.getChannelData(ch); for (let i = 0; i < d.length; i++) out[i] += d[i] / audio.numberOfChannels; }
      return { samples: out, sr: audio.sampleRate };
    } finally { void ctx.close(); }
  }

  /** The audio of [from, from+len) of a video as a small mp3 in the user's edits folder (for transcription). */
  async function extractAudioToStorage(url: string, from: number, len: number): Promise<string> {
    const ffmpeg = await ensureFfmpeg();
    const name = `clipsrc_${Date.now()}`;
    await ffmpeg.writeFile(name, await fetchFile(getProxyUrl(url)));
    const code = await ffmpeg.exec(["-ss", String(Math.max(0, from)), "-t", String(Math.max(1, len)), "-i", name, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", `${name}.mp3`]);
    if (code !== 0) throw new Error("Couldn't read the sound from this video.");
    const data = await ffmpeg.readFile(`${name}.mp3`);
    void ffmpeg.deleteFile(name).catch(() => {}); void ffmpeg.deleteFile(`${name}.mp3`).catch(() => {});
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: "audio/mpeg" });
    const path = `edits/${clientId}/clip_audio_${Date.now()}.mp3`;
    const { error } = await supabase.storage.from("assets").upload(path, blob, { contentType: "audio/mpeg" });
    if (error) throw new Error("Couldn't upload the sound for transcription.");
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }
  async function transcribe(body: Record<string, unknown>, signal?: AbortSignal) {
    const res = await fetch("/api/editor/highlights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, brandId: activeBrand?.id, hint: activeBrand?.brand_name }), signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
    return data as { segments: Segment[]; duration: number; credits: number; highlights?: Highlight[]; note?: string };
  }

  async function cutToBeat() {
    const music = audioClips.find((c) => c.id === selectedElement?.id) ?? audioClips[0];
    if (!music) { toast.info("Add a song to the audio track first (Audio in the left rail, or drop a file)."); setRail("audio"); handleFilterSwitch("audio"); return; }
    const vids = videoClips.filter((c) => (c.trackRow ?? 0) === 0).sort((a, b) => a.timelineStart - b.timelineStart);
    if (!vids.length) { toast.info("Add some clips or photos to the video track first."); return; }
    setAiBusy("Listening for the beat…");
    try {
      const { samples, sr } = await decodeAudio(music.url);
      const r = detectBeats(samples, sr);
      if (!r.bpm || r.beats.length < 4) { toast.info("Couldn't find a steady beat in this track. Try a song with drums."); return; }
      const beatsTl = r.beats.filter((b) => b >= music.trimStart && b <= music.trimEnd).map((b) => music.timelineStart + (b - music.trimStart));
      const from = music.timelineStart, to = music.timelineStart + (span(music));
      const pieces = beatCut(vids.map((v) => ({ id: v.id, maxDuration: v.type === "image" ? 3600 : v.maxDuration, trimStart: v.trimStart })), beatsTl, { from, to: Math.min(to, from + beatLength), every: cutEvery });
      if (!pieces.length) { toast.info("The song is too short for that. Pick a longer stretch."); return; }
      snapshot();
      const byId = new Map(vids.map((v) => [v.id, v]));
      const cut = pieces.map((p) => ({ ...byId.get(p.sourceId)!, id: crypto.randomUUID(), timelineStart: p.timelineStart, trimStart: p.trimStart, trimEnd: p.trimEnd, trackRow: 0 }));
      setVideoClips((prev) => [...prev.filter((c) => (c.trackRow ?? 0) !== 0), ...cut]);
      setBeatMarks(beatsTl);
      toast.success(`${cut.length} cuts on the beat · ${Math.round(r.bpm)} BPM. Undo is one click.`);
    } catch (e) { console.error(e); toast.error("Couldn't read that song. Try another file."); }
    finally { setAiBusy(null); }
  }

  // Deep link: ?tab=editor&rail=audio opens on that panel (Ask's "Make a voiceover" button).
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("rail");
    if (r === "audio") { setRail("audio"); handleFilterSwitch("audio"); }
    else if (r === "motion") {
      const q = new URLSearchParams(window.location.search);
      setMotionStart({ prompt: q.get("motion")?.slice(0, 600) ?? null, picture: q.get("motionPicture") });
      setMotionOpen(true);
    }
    else if (r === "ai" || r === "text" || r === "scenes" || r === "media") setRail(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make a voiceover right here (QA-021): text to speech onto the audio track, saved to the Library.
  const [voText, setVoText] = useState("");
  const [voVoice, setVoVoice] = useState<string>("nova");
  async function makeVoiceover() {
    const text = voText.trim();
    if (text.length < 2) { toast.info("Write what the voice should say."); return; }
    const signal = aiStart("Recording the voiceover…");
    try {
      const res = await fetch("/api/voiceover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: voVoice, brandId: activeBrand?.id }), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't make the voiceover.");
      const len = await new Promise<number>((resolve) => { const a = new Audio(); a.preload = "metadata"; a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 10); a.onerror = () => resolve(10); a.src = data.url; });
      const asset = { id: `vo-${data.id ?? Date.now()}`, type: "audio" as const, url: data.url, thumb: data.url, name: data.name ?? "Voiceover", duration: len };
      setAssets((p) => [asset, ...p]);
      addAssetAtPlayhead(asset);
      setVoText("");
      toast.success(`Voiceover on the audio track · ${data.credits} credit${data.credits === 1 ? "" : "s"}`);
    } catch (e) { if (signal.aborted) toast.info(AI_STOPPED); else toast.error(e instanceof Error ? e.message : "Couldn't make the voiceover."); }
    finally { setAiBusy(null); }
  }

  // A Video Inspo plan leaves its rhythm behind for this brand: which scene plays when, and the words.
  const [inspoCut, setInspoCut] = useState<InspoPattern | null>(null);
  useEffect(() => {
    if (!activeBrand?.id) return;
    try { const raw = localStorage.getItem(inspoPatternKey(activeBrand.id)); setInspoCut(raw ? (JSON.parse(raw) as InspoPattern) : null); } catch { setInspoCut(null); }
  }, [activeBrand?.id]);

  /** Cut like your inspo: the rendered scenes (in timeline order) cut into the inspo's rhythm, free. */
  function cutLikeInspo() {
    if (!inspoCut) return;
    const vids = videoClips.filter((c) => (c.trackRow ?? 0) === 0).sort((a, b) => a.timelineStart - b.timelineStart);
    if (vids.length < Math.min(inspoCut.scenes, 2)) { toast.info(`Put your ${inspoCut.scenes} rendered scenes on the timeline first (Storyboard > Put them together), in scene order.`); return; }
    const used = new Map<string, number>(vids.map((v) => [v.id, v.trimStart]));
    const pieces: TrackClip[] = [];
    let t = 0;
    for (const c of inspoCut.cuts) {
      const clip = vids[c.scene] ?? vids[c.scene % vids.length];
      const max = clip.type === "image" ? 3600 : clip.maxDuration;
      let start = used.get(clip.id) ?? clip.trimStart;
      if (start + c.seconds > max) start = clip.trimStart;
      const take = Math.min(c.seconds, max - start);
      if (take <= 0.1) continue;
      pieces.push({ ...clip, id: crypto.randomUUID(), timelineStart: Math.round(t * 1000) / 1000, trimStart: start, trimEnd: start + take, trackRow: 0 });
      used.set(clip.id, start + take);
      t += take;
    }
    if (!pieces.length) return;
    snapshot();
    setVideoClips((prev) => [...prev.filter((c) => (c.trackRow ?? 0) !== 0), ...pieces]);
    if (inspoCut.texts.length) setTextLayers((prev) => [...prev, ...inspoCut.texts.filter((x) => x.at < t).map((x) => ({ id: crypto.randomUUID(), text: x.text, x: 50, y: 50, fontSize: 52, color: "#FFFFFF", style: "caption" as const, timelineStart: x.at, trimStart: 0, trimEnd: Math.min(x.duration, t - x.at), maxDuration: 3600, opacity: 100, trackRow: 1 }))]);
    if (inspoCut.aspect) { setCanvasAspect(inspoCut.aspect); setFitMode("fill"); }
    toast.success(`Cut like "${inspoCut.title}": ${pieces.length} shots from ${Math.min(vids.length, inspoCut.scenes)} scenes. Undo is one click.`);
  }

  /**
   * Edit like a video (Kezie, 2026-10-12: "edit a video for me that looks like this"): read the
   * inspo's editing (each cut's length, its words on screen), then recut the user's own clips to
   * the same rhythm and add those words, rewritten for the brand. Undo puts it back.
   */
  async function editLikeVideo(file: File) {
    const vids = videoClips.filter((c) => (c.trackRow ?? 0) === 0).sort((a, b) => a.timelineStart - b.timelineStart);
    if (!vids.length) { toast.info("Add your own clips or photos to the video track first, then pick the video to copy."); return; }
    const url = URL.createObjectURL(file);
    const signal = aiStart("Reading the inspo's editing…");
    try {
      const r = await readVideo(url, (p) => setAiBusy(`Reading the inspo · ${Math.round(p * 100)}%`));
      if (signal.aborted) throw new Error(AI_STOPPED);
      if (r.shots.length < 2) { toast.info("That video is one long shot, so there's no editing to copy. Try one with cuts."); return; }
      setAiBusy("Working out the edit…");
      const res = await fetch("/api/inspo/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "edit", shots: r.shots.map(({ start, end, data }) => ({ start, end, data })), duration: r.duration, width: r.width, height: r.height, brandId: activeBrand?.id }), signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.recipe) throw new Error(data.error || "Couldn't read that video's editing.");
      const recipe = data.recipe as EditRecipe;
      const cutTimes: number[] = [];
      let t = 0;
      for (const c of recipe.cuts.slice(0, -1)) { t += c; cutTimes.push(Math.round(t * 1000) / 1000); }
      const total = recipe.cuts.reduce((n, c) => n + c, 0);
      const pieces = beatCut(vids.map((v) => ({ id: v.id, maxDuration: v.type === "image" ? 3600 : v.maxDuration, trimStart: v.trimStart })), cutTimes, { from: 0, to: total, every: 1 });
      if (!pieces.length) { toast.info("Couldn't fit your clips to that edit. Add a few more clips and try again."); return; }
      snapshot();
      const byId = new Map(vids.map((v) => [v.id, v]));
      setVideoClips((prev) => [...prev.filter((c) => (c.trackRow ?? 0) !== 0), ...pieces.map((p) => ({ ...byId.get(p.sourceId)!, id: crypto.randomUUID(), timelineStart: p.timelineStart, trimStart: p.trimStart, trimEnd: p.trimEnd, trackRow: 0 }))]);
      const size = { big: 60, medium: 44, small: 30 } as const;
      if (recipe.texts.length) {
        setTextLayers((prev) => [...prev, ...recipe.texts.filter((x) => x.at < total).map((x) => ({ id: crypto.randomUUID(), text: x.text, x: 50, y: x.y, fontSize: size[x.size], color: "#FFFFFF", style: x.style, timelineStart: x.at, trimStart: 0, trimEnd: Math.min(x.duration, total - x.at), maxDuration: 3600, opacity: 100, trackRow: 1 }))]);
      }
      setCanvasAspect(recipe.aspect); setFitMode("fill");
      setBeatMarks(cutTimes);
      toast.success(`Edited like the inspo: ${pieces.length} cuts${recipe.texts.length ? `, ${recipe.texts.length} lines of text` : ""} (${recipe.pace || "same pace"}) · ${data.credits} credits. Undo is one click.`, { duration: 8000 });
    } catch (e) { if (signal.aborted) toast.info(AI_STOPPED); else toast.error(e instanceof Error ? e.message : "Couldn't read that video's editing."); }
    finally { URL.revokeObjectURL(url); setAiBusy(null); }
  }

  async function addCaptions() {
    const targets = (selectedElement?.type === "video" ? videoClips.filter((c) => c.id === selectedElement.id) : videoClips).filter((c) => c.type === "video");
    if (!targets.length) { toast.info("Add a video with talking in it first."); return; }
    const signal = aiStart("Listening to what's said…");
    try {
      const layers: TextLayer[] = [];
      let spent = 0;
      for (const c of targets) {
        const len = c.trimEnd - c.trimStart; // seconds of the source file
        const audioUrl = await extractAudioToStorage(c.url, c.trimStart, len);
        if (signal.aborted) throw new Error(AI_STOPPED);
        const r = await transcribe({ mode: "captions", audioUrl, seconds: len }, signal);
        spent += r.credits;
        for (const ch of captionChunks(r.segments, 0, len)) {
          layers.push({ id: crypto.randomUUID(), text: ch.text, x: 50, y: 82, fontSize: 34, color: "#FFFFFF", style: "caption", timelineStart: c.timelineStart + ch.start / speedOf(c), trimStart: 0, trimEnd: Math.max(0.3, (ch.end - ch.start) / speedOf(c)), maxDuration: 3600, opacity: 100, trackRow: 0 });
        }
      }
      if (!layers.length) { toast.info(`Nobody speaks in ${targets.length === 1 ? "this clip" : "these clips"}, so there's nothing to caption. ${spent} credits used.`); return; }
      snapshot();
      setTextLayers((p) => [...p, ...layers]);
      toast.success(`${layers.length} captions added · ${spent} credits. Edit any of them in the inspector.`);
    } catch (e) { if (signal.aborted) toast.info(AI_STOPPED); else toast.error(e instanceof Error ? e.message : "Couldn't make captions."); }
    finally { setAiBusy(null); }
  }

  async function findShorts(source: { url: string; name: string; duration: number }) {
    const signal = aiStart("Watching the whole video for the best moments…");
    setShorts(null);
    try {
      const audioUrl = await extractAudioToStorage(source.url, 0, source.duration);
      if (signal.aborted) throw new Error(AI_STOPPED);
      const r = await transcribe({ mode: "highlights", audioUrl, seconds: source.duration, count: 3, target: shortTarget }, signal);
      setShorts({ source, highlights: r.highlights ?? [], segments: r.segments, credits: r.credits });
      if (r.note) toast.info(r.note);
      else toast.success(`Found ${r.highlights?.length ?? 0} moments · ${r.credits} credits.`);
    } catch (e) { if (signal.aborted) toast.info(AI_STOPPED); else toast.error(e instanceof Error ? e.message : "Couldn't find the moments."); }
    finally { setAiBusy(null); }
  }
  function applyShort(h: Highlight) {
    if (!shorts) return;
    snapshot();
    const len = h.end - h.start;
    const assetId = crypto.randomUUID();
    setAssets((p) => (p.some((a) => a.url === shorts.source.url) ? p : [{ id: assetId, type: "video", url: shorts.source.url, thumb: shorts.source.url, name: shorts.source.name, duration: shorts.source.duration }, ...p]));
    setVideoClips([{ id: crypto.randomUUID(), assetId, url: shorts.source.url, type: "video", name: h.title, timelineStart: 0, trimStart: h.start, trimEnd: h.end, maxDuration: shorts.source.duration, opacity: 100, volume: 100, trackRow: 0 }]);
    const caps: TextLayer[] = captionChunks(shorts.segments, h.start, h.end).map((ch) => ({ id: crypto.randomUUID(), text: ch.text, x: 50, y: 80, fontSize: 40, color: "#FFFFFF", style: "caption", timelineStart: ch.start, trimStart: 0, trimEnd: Math.max(0.3, ch.end - ch.start), maxDuration: 3600, opacity: 100, trackRow: 0 }));
    const hook: TextLayer[] = h.hook ? [{ id: crypto.randomUUID(), text: h.hook.length > 34 ? `${h.hook.slice(0, 33)}…` : h.hook, x: 50, y: 14, fontSize: 44, color: "#FFFFFF", style: "caption", timelineStart: 0, trimStart: 0, trimEnd: Math.min(2.6, len), maxDuration: 3600, opacity: 100, trackRow: 1 }] : [];
    setTextLayers([...caps, ...hook]);
    setCanvasAspect("9:16"); setFitMode("fill"); setGlobalTime(0); setSelectedElement(null);
    toast.success(`"${h.title}" is on the timeline as a 9:16 short with captions. Export when it looks right.`);
  }

  const renderStudio = () => {
    const shape = canvasAspect === "9:16" ? 9 / 16 : canvasAspect === "1:1" ? 1 : 16 / 9;
    const pps = PIXELS_PER_SECOND;
    const objectFit = fitMode === "fill" ? "cover" : "contain";
    const trackH = { video: 58, text: 34, audio: 50 };
    const selVideo = selectedElement?.type === "video" ? videoClips.find((c) => c.id === selectedElement.id) : undefined;
    const selAudio = selectedElement?.type === "audio" ? audioClips.find((c) => c.id === selectedElement.id) : undefined;
    const selText = selectedElement?.type === "text" ? textLayers.find((c) => c.id === selectedElement.id) : undefined;
    const fontPx = (n: number) => `calc(${n}px * var(--cw, 960) / 960)`;
    const longSource = selVideo && selVideo.type === "video" ? { url: selVideo.url, name: selVideo.name, duration: selVideo.maxDuration } : null;
    const captionSeconds = (selVideo?.type === "video" ? [selVideo] : videoClips.filter((c) => c.type === "video")).reduce((s, c) => s + (c.trimEnd - c.trimStart), 0);
    const range = (label: string, value: number, min: number, max: number, on: (v: number) => void, unit = "%") => (
      <label className="ve-row"><span>{label}</span><input type="range" min={min} max={max} value={value} onChange={(e) => on(parseInt(e.target.value))} /><span className="v">{value}{unit}</span></label>
    );
    const railBtn = (id: typeof rail, label: string, Icon: typeof Video, cls = "") => (
      <button type="button" className={cls} aria-pressed={rail === id} onClick={() => { setRail(id); if (id === "media") handleFilterSwitch("library"); if (id === "scenes") handleFilterSwitch("sequence"); if (id === "audio") handleFilterSwitch("audio"); }}><Icon className="h-[18px] w-[18px]" />{label}</button>
    );
    return (
      <div className="ve">
        <Modal open={motionOpen} onClose={() => setMotionOpen(false)} label="Motion graphics" width={760}>
          {/* The same Motion as Create > Motion graphics; what you make lands on this timeline. */}
          <div className="ve ve-motion-modal" style={{ display: "block", height: "auto", minHeight: 0, background: "transparent" }}>
            <div className="flex justify-end px-2 pt-2 -mb-9 relative"><button type="button" className="s-btn ghost sm" onClick={() => setMotionOpen(false)} aria-label="Close Motion"><X className="h-4 w-4" /></button></div>
            <MotionBin key={`${motionStart.prompt ?? ""}|${motionStart.picture ?? ""}`} clientId={clientId} shape={canvasAspect} initialPrompt={motionStart.prompt} pictureId={motionStart.picture} onAdded={(m, where) => { addMotion(m, where); setMotionOpen(false); }} />
          </div>
        </Modal>
        {isRendering && (
          <div className="absolute inset-0 z-50 grid place-items-center" style={{ background: "rgba(12,13,15,.9)", backdropFilter: "blur(6px)" }}>
            {!renderComplete ? (
              <div className="grid justify-items-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--s-accent)" }} />
                <b className="text-[16px]">Exporting your video</b>
                <span className="text-[13px]" style={{ color: "var(--s-soft)" }}>{renderStatusText}</span>
                <div className="w-64 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s-line)" }}><div className="h-full" style={{ width: `${renderProgress}%`, background: "var(--s-accent)", transition: "width .3s" }} /></div>
                <span className="mono text-[11px]" style={{ color: "var(--s-mute)" }}>{renderProgress}% · it runs on this computer; keep the tab open</span>
              </div>
            ) : (
              <div className="grid justify-items-center gap-3 text-center">
                <span className="h-14 w-14 rounded-full grid place-items-center" style={{ background: "color-mix(in oklab, var(--s-ok) 15%, transparent)" }}><Check className="h-7 w-7" style={{ color: "var(--s-ok)" }} /></span>
                <b className="text-[18px]">Exported</b>
                <span className="text-[13px] max-w-[380px]" style={{ color: "var(--s-soft)" }}>It downloaded to this computer and is saved in your Library as a draft, ready to caption and schedule.</span>
                <div className="flex gap-2 mt-2">
                  <button type="button" className="s-btn" onClick={() => { setIsRendering(false); setRenderComplete(false); }}>Back to the edit</button>
                  <button type="button" className="s-btn primary" onClick={() => router.push("/studio/library")}>Open the Library</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top bar */}
        <div className="ve-top">
          <b className="text-[13.5px]">Edit</b>
          <span className="mono text-[11.5px]" style={{ color: "var(--s-mute)" }}>{fmt(totalLength)}</span>
          <span className="flex items-center gap-0.5">
            <button type="button" className="s-btn ghost sm" disabled={!canUndoTimeline} onClick={undoTimeline} aria-label="Undo" title={`Undo (${isMac ? "⌘Z" : "Ctrl+Z"})`}><Undo2 className="h-3.5 w-3.5" /></button>
            <button type="button" className="s-btn ghost sm" disabled={!canRedoTimeline} onClick={redoTimeline} aria-label="Redo" title={`Redo (${isMac ? "⇧⌘Z" : "Ctrl+Y"})`}><Redo2 className="h-3.5 w-3.5" /></button>
          </span>
          <div className="flex-1" />
          <div className="s-seg" role="group" aria-label="Shape">
            {(["9:16", "1:1", "16:9"] as const).map((a) => <button key={a} type="button" aria-pressed={canvasAspect === a} onClick={() => setCanvasAspect(a)} title={a === "9:16" ? "Reels, TikTok, Shorts" : a === "1:1" ? "Feed posts" : "YouTube, websites"}>{a}</button>)}
          </div>
          <div className="s-seg" role="group" aria-label="Framing">
            <button type="button" aria-pressed={fitMode === "fill"} onClick={() => setFitMode("fill")} title="Crop to fill the frame">Fill</button>
            <button type="button" aria-pressed={fitMode === "fit"} onClick={() => setFitMode("fit")} title="Show the whole picture, with bars">Fit</button>
          </div>
          <button type="button" className="s-btn ghost sm" onClick={() => setFocusPreview((f) => !f)} aria-pressed={focusPreview} title="Bigger preview">{focusPreview ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
          <button type="button" className="s-btn primary" onClick={handleRender} disabled={isRendering || videoClips.length === 0}><Download className="h-4 w-4" /> Export</button>
        </div>

        <div className={`ve-main${focusPreview ? " focus" : ""}`}>
          {/* Tool rail */}
          <nav className="ve-rail" aria-label="Editor tools">
            {railBtn("media", "Media", ImageIcon)}
            {railBtn("scenes", "Scenes", Layers)}
            {railBtn("audio", "Audio", Music)}
            {railBtn("text", "Text", Type)}
            <button type="button" aria-pressed={motionOpen} aria-haspopup="dialog" onClick={() => setMotionOpen(true)}><Clapperboard className="h-[18px] w-[18px]" />Motion</button>
            {railBtn("ai", "AI", Sparkles, "ai")}
          </nav>

          {/* Bin */}
          <div className="ve-bin">
            {rail === "text" ? (
              <>
                <div className="ve-bin-h"><b className="text-[13px]">Text</b></div>
                <div className="grid gap-2 px-3 pb-3">
                  <button type="button" className="ve-card text-left" onClick={() => addTextPreset("title")}><b className="text-[18px] leading-tight">Headline</b><span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Big, near the top</span></button>
                  <button type="button" className="ve-card text-left" onClick={() => addTextPreset("subtitle")}><span className="text-[14px]">Supporting line</span><span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Smaller, under the headline</span></button>
                  <button type="button" className="ve-card text-left" onClick={() => addTextPreset("caption")}><span className="text-[14px] font-bold" style={{ textShadow: "0 0 3px #000, 0 0 3px #000" }}>Caption</span><span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Outlined, near the bottom</span></button>
                  <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Adds at the playhead. Drag it on the preview to move it.</p>
                </div>
              </>
            ) : rail === "ai" ? (
              <>
                <div className="ve-bin-h"><b className="text-[13px]">AI tools</b>{aiBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--s-ai)" }} />}
                  {aiBusy && <button className="s-btn sm ml-auto" onClick={() => aiStop.current?.abort()} aria-label="Stop" title="Stop: the step that's running isn't charged"><Square className="h-3 w-3" fill="currentColor" /> Stop</button>}</div>
                <div className="grid gap-2.5 px-3 pb-3">
                  {aiLocked && <div className="ve-card ai text-[12px]" style={{ color: "var(--s-soft)" }}><span>{AI_NEEDS_CREDITS}</span><a href="/studio/account/billing" className="s-btn ai sm justify-center">Get credits</a></div>}
                  <div className="ve-card ai">
                    <b className="text-[13px] flex items-center gap-1.5"><AudioLines className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Cut to the beat</b>
                    <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Re-cuts your video track so every cut lands on the music&apos;s beat. Uses the song on the audio track.</span>
                    <div className="s-seg" role="group" aria-label="Cut every">
                      {([1, 2, 4] as const).map((n) => <button key={n} type="button" aria-pressed={cutEvery === n} onClick={() => setCutEvery(n)}>{n === 1 ? "Every beat" : n === 2 ? "Every 2" : "Every bar"}</button>)}
                    </div>
                    <div className="s-seg" role="group" aria-label="Length">
                      {[15, 30, 60].map((n) => <button key={n} type="button" aria-pressed={beatLength === n} onClick={() => setBeatLength(n)}>{n} s</button>)}
                    </div>
                    <button type="button" className="s-btn ai sm" disabled={!!aiBusy} onClick={cutToBeat}><Wand2 className="h-3.5 w-3.5" /> Cut it <span className="cost">free</span></button>
                  </div>
                  <div className="ve-card ai">
                    <b className="text-[13px] flex items-center gap-1.5"><Subtitles className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Captions</b>
                    <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Writes what&apos;s said as outlined captions, timed to the words. {selVideo ? "For the selected clip." : "For every video on the timeline."}</span>
                    <button type="button" className="s-btn ai sm" disabled={!!aiBusy || aiLocked || captionSeconds <= 0} onClick={addCaptions}><Subtitles className="h-3.5 w-3.5" /> Add captions <span className="cost">{captionSeconds > 0 ? transcribeCredits(captionSeconds) : 0} cr</span></button>
                  </div>
                  {inspoCut && (
                    <div className="ve-card ai">
                      <b className="text-[13px] flex items-center gap-1.5"><Sparkles className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Cut like your inspo</b>
                      <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>&ldquo;{inspoCut.title}&rdquo;: your {inspoCut.scenes} rendered scenes, cut into its {inspoCut.cuts.length} shots{inspoCut.texts.length ? ` with ${inspoCut.texts.length} lines of text` : ""}. Put the scenes on the timeline in order first.</span>
                      <button type="button" className="s-btn ai sm" disabled={!!aiBusy} onClick={cutLikeInspo}><Scissors className="h-3.5 w-3.5" /> Cut it <span className="cost">free</span></button>
                    </div>
                  )}
                  <div className="ve-card ai">
                    <b className="text-[13px] flex items-center gap-1.5"><Copy className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Edit like a video you love</b>
                    <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Pick a Reel or ad whose editing you like. Your clips are recut to its rhythm and its words on screen are rewritten for your brand.</span>
                    <label className={`s-btn ai sm cursor-pointer${aiBusy || aiLocked ? " opacity-50 pointer-events-none" : ""}`}><Sparkles className="h-3.5 w-3.5" /> Pick the video to copy <span className="cost">≤20 cr</span>
                      <input type="file" accept="video/*" className="hidden" aria-label="Video to copy the editing of" disabled={!!aiBusy || aiLocked} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void editLikeVideo(f); }} />
                    </label>
                  </div>
                  <div className="ve-card ai">
                    <b className="text-[13px] flex items-center gap-1.5"><Scissors className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Shorts from a long video</b>
                    <span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Finds the 3 best moments of a talk, interview or vlog, and makes each a 9:16 short with captions.</span>
                    <div className="s-seg" role="group" aria-label="Short length">
                      {([15, 30, 60] as const).map((n) => <button key={n} type="button" aria-pressed={shortTarget === n} onClick={() => setShortTarget(n)}>~{n} s</button>)}
                    </div>
                    {longSource ? (
                      <button type="button" className="s-btn ai sm" disabled={!!aiBusy || aiLocked} onClick={() => findShorts(longSource)}><Sparkles className="h-3.5 w-3.5" /> Find moments in &quot;{longSource.name.slice(0, 18)}&quot; <span className="cost">{transcribeCredits(longSource.duration)} cr</span></button>
                    ) : (
                      <span className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>Select a long video on the timeline, or upload one:</span>
                    )}
                    <label className="s-btn sm cursor-pointer"><UploadCloud className="h-3.5 w-3.5" /> Upload a long video
                      <input type="file" accept="video/*" className="hidden" disabled={!!aiBusy || aiLocked} onChange={(e) => {
                        const f = e.target.files?.[0]; e.target.value = "";
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        const probe = document.createElement("video");
                        probe.preload = "metadata"; probe.src = url;
                        probe.onloadedmetadata = () => { const d = Number.isFinite(probe.duration) ? probe.duration : 0; if (d < 20) { toast.info("That video is short already. Use it as it is."); return; } void findShorts({ url, name: f.name, duration: d }); };
                      }} />
                    </label>
                    {shorts && (
                      <div className="grid gap-1.5 mt-1">
                        {shorts.highlights.length === 0 && <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>No clean moments found this time.</span>}
                        {shorts.highlights.map((h) => (
                          <button key={`${h.start}-${h.end}`} type="button" className="ve-hl text-left" onClick={() => applyShort(h)}>
                            <span className="flex items-center gap-2"><b className="text-[12.5px] flex-1">{h.title}</b><span className="mono text-[10.5px]" style={{ color: "var(--s-mute)" }}>{fmt(h.start)}–{fmt(h.end)}</span></span>
                            {h.hook && <span className="text-[11.5px] line-clamp-2" style={{ color: "var(--s-soft)" }}>&ldquo;{h.hook}&rdquo;</span>}
                            <span className="text-[11px]" style={{ color: "var(--s-ai)" }}>Use this one →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {canUndo && <button type="button" className="s-btn ghost sm" onClick={undoTimeline}><Undo2 className="h-3.5 w-3.5" /> Undo the last AI change</button>}
                </div>
              </>
            ) : (
              <>
                <div className="ve-bin-h">
                  <b className="text-[13px]">{rail === "scenes" ? "Your scenes" : rail === "audio" ? "Voiceovers and music" : "Your Library"}</b>
                  {isLoadingDB && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--s-mute)" }} />}
                  <div className="flex-1" />
                  <button type="button" className="s-btn ghost sm" onClick={() => fileInputRef.current?.click()} title="Upload from this device"><UploadCloud className="h-3.5 w-3.5" /></button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="video/*,image/*,audio/*" multiple onChange={handleManualUpload} />
                </div>
                {rail === "audio" && (
                  <div className="ve-card mx-3 mb-3" style={{ borderColor: "color-mix(in oklab, var(--s-ai) 35%, var(--s-line))" }}>
                    <b className="text-[13px] flex items-center gap-1.5"><Mic className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Make a voiceover</b>
                    <textarea className="s-input" rows={3} value={voText} maxLength={3000} onChange={(e) => setVoText(e.target.value)} placeholder="What should the voice say? e.g. Fresh from our kitchen to your office, every weekday." aria-label="Voiceover script" />
                    <div className="s-seg" role="group" aria-label="Voice">
                      {VOICES.map((vo) => <button key={vo.id} type="button" aria-pressed={voVoice === vo.id} onClick={() => setVoVoice(vo.id)}>{vo.label}</button>)}
                    </div>
                    <button type="button" className="s-btn ai sm" disabled={!!aiBusy || aiLocked || voText.trim().length < 2} onClick={makeVoiceover}><Mic className="h-3.5 w-3.5" /> Make it <span className="cost">{voiceoverCredits(voText.trim().length || 1)} cr</span></button>
                  </div>
                )}
                <div className="ve-assets">
                  {assets.map((asset) => (
                    <div key={asset.id} draggable onDragStart={(e) => handleDragStart(e, asset)} className={`ve-asset${asset.type === "audio" ? " audio" : ""}`} title={asset.name}>
                      {asset.type === "video" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        cloudinaryVideoPoster(asset.url) ? <img src={cloudinaryVideoPoster(asset.url)} alt="" /> : <video src={asset.url} preload="metadata" muted playsInline />
                      ) : asset.type === "audio" ? <AudioLines className="h-6 w-6" />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={asset.thumb} alt="" />}
                      <span className="k">{asset.type === "video" ? "VIDEO" : asset.type === "audio" ? "AUDIO" : "PHOTO"}</span>
                      <button type="button" className="add" onClick={() => addAssetAtPlayhead(asset)} aria-label={`Add ${asset.name} to the timeline`}><Plus className="h-3.5 w-3.5" /></button>
                      <button type="button" className="del" onClick={() => deleteAsset(asset.id, asset.name)} aria-label={`Delete ${asset.name}`}><X className="h-3.5 w-3.5" /></button>
                      <span className="nm">{asset.name}</span>
                    </div>
                  ))}
                </div>
                {assets.length === 0 && !isLoadingDB && <p className="text-[12px] px-3" style={{ color: "var(--s-mute)" }}>{rail === "scenes" ? "No scenes yet. Render some in the storyboard." : rail === "audio" ? "No audio yet. Make a voiceover above, or upload a song or recording." : "Nothing here yet. Upload, or make something in Create."}</p>}
                {hasMoreAssets && assets.length > 0 && <button type="button" className="s-btn ghost sm mx-3 mb-3" onClick={() => setAssetPageLimit((n) => n + 8)}><ChevronDown className="h-3.5 w-3.5" /> More</button>}
                <p className="text-[11px] px-3 pb-3 mt-auto" style={{ color: "var(--s-mute)" }}>Drag onto the timeline, or press + to add at the end.</p>
              </>
            )}
          </div>

          {/* Preview */}
          <div className="ve-stage" onClick={() => setSelectedElement(null)}>
            <div className="ve-canvaswrap">
              <div ref={canvasRef} className="ve-canvas" style={{ aspectRatio: String(shape), width: `min(100cqw, calc(100cqh * ${shape}))`, ["--cw" as string]: String(canvasW) }}>
                {[...videoClips].sort((a, b) => (a.trackRow || 0) - (b.trackRow || 0)).map((clip) => {
                  const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip));
                  return (
                    <div key={`canvas-${clip.id}`} className="absolute inset-0 pointer-events-none" style={{ opacity: isActive ? (clip.opacity ?? 100) / 100 : 0, zIndex: clip.trackRow || 0, display: isActive ? "block" : "none" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {clip.type === "image" ? <img src={clip.url} alt="" className="w-full h-full" style={{ objectFit }} />
                        : <video ref={(el) => { videoRefs.current[clip.id] = el; }} src={clip.url} className="w-full h-full" style={{ objectFit }} playsInline />}
                    </div>
                  );
                })}
                {!videoClips.some((clip) => globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip))) && (
                  <div className="absolute inset-0 grid place-items-center text-center px-4" style={{ color: "var(--s-mute)" }}>
                    <span className="grid justify-items-center gap-2 text-[12.5px]"><Film className="h-7 w-7" />{videoClips.length ? "Nothing at the playhead" : "Drag clips from the left onto the timeline"}</span>
                  </div>
                )}
                <div className="hidden">
                  {videoClips.filter((c) => c.type === "video").map((clip) => (<video key={clip.id} src={clip.url} preload="metadata" onLoadedMetadata={(e) => handleLoadedMetadata(clip.id, e.currentTarget.duration, "video")} />))}
                  {audioClips.map((clip) => (<video key={`canvas-audio-${clip.id}`} ref={(el) => { audioRefs.current[clip.id] = el; }} src={clip.url} preload="metadata" onLoadedMetadata={(e) => handleLoadedMetadata(clip.id, e.currentTarget.duration, "audio")} />))}
                </div>
                {[...textLayers].sort((a, b) => (a.trackRow || 0) - (b.trackRow || 0)).map((layer) => {
                  const isVisible = globalTime >= layer.timelineStart && globalTime < layer.timelineStart + (span(layer));
                  if (!isVisible) return null;
                  return (
                    <div key={layer.id}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedElement({ id: layer.id, type: "text" }); dragTextRef.current = { id: layer.id, startX: e.clientX, startY: e.clientY, initX: layer.x, initY: layer.y }; }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 rounded cursor-grab"
                      style={{ top: `${layer.y}%`, left: `${layer.x}%`, color: layer.color, fontSize: fontPx(layer.fontSize), opacity: (layer.opacity ?? 100) / 100, zIndex: 100 + (layer.trackRow || 0), fontFamily: "BlinkExport, Inter, Arial, sans-serif", fontWeight: 800,
                        textShadow: layer.style === "caption" ? "0 0 3px #000, 0 0 3px #000, 0 0 2px #000, 0 2px 6px rgba(0,0,0,.6)" : "0 2px 10px rgba(0,0,0,.6)",
                        outline: selectedElement?.id === layer.id ? "1.5px dashed var(--s-accent)" : "none" }}>
                      {layer.text}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="ve-transport" onClick={(e) => e.stopPropagation()}>
              <span className="mono text-[12px] w-[72px] text-right">{fmt(globalTime)}</span>
              <button type="button" className="s-btn ghost sm" style={{ width: 30, padding: 0 }} onClick={() => setGlobalTime(0)} aria-label="Back to start"><SkipBack className="h-4 w-4" /></button>
              <button type="button" className="ve-play" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}</button>
              <span className="mono text-[12px] w-[72px]" style={{ color: "var(--s-mute)" }}>{fmt(totalLength)}</span>
            </div>
          </div>

          {/* Inspector */}
          <aside className="ve-insp" aria-label="Properties">
            {selText ? (
              <>
                <div className="ve-sec"><div className="h"><Type className="h-3.5 w-3.5" /> Text</div>
                  <textarea className="s-input" rows={2} value={selText.text} onChange={(e) => updateTextLayer(selText.id, { text: e.target.value })} aria-label="Text" />
                  <div className="s-seg" role="group" aria-label="Text style">
                    <button type="button" aria-pressed={(selText.style ?? "plain") === "plain"} onClick={() => updateTextLayer(selText.id, { style: "plain" })}>Plain</button>
                    <button type="button" aria-pressed={selText.style === "caption"} onClick={() => updateTextLayer(selText.id, { style: "caption" })}>Outlined</button>
                  </div>
                  <label className="ve-row"><span>Colour</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(selText.color) ? selText.color : "#ffffff"} onChange={(e) => updateTextLayer(selText.id, { color: e.target.value.toUpperCase() })} className="h-7 w-full rounded" style={{ background: "transparent" }} /><span className="v">{selText.color}</span></label>
                  {range("Size", selText.fontSize, 12, 120, (v) => updateTextLayer(selText.id, { fontSize: v }), "")}
                  {range("Opacity", selText.opacity ?? 100, 0, 100, (v) => updateTextLayer(selText.id, { opacity: v }))}
                  {range("Across", Math.round(selText.x), 5, 95, (v) => updateTextLayer(selText.id, { x: v }))}
                  {range("Down", Math.round(selText.y), 5, 95, (v) => updateTextLayer(selText.id, { y: v }))}
                </div>
                <div className="ve-sec"><div className="h">Timing</div><span className="mono text-[12px]">{fmt(selText.timelineStart)} · {(span(selText)).toFixed(1)} s</span></div>
              </>
            ) : selVideo ? (
              <>
                <div className="ve-sec"><div className="h">{selVideo.type === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />} {selVideo.name}</div>
                  {range("Opacity", selVideo.opacity ?? 100, 0, 100, (v) => updateVideoClip(selVideo.id, { opacity: v }))}
                  {selVideo.type === "video" && range("Volume", selVideo.volume ?? 100, 0, 100, (v) => updateVideoClip(selVideo.id, { volume: v }))}
                  <label className="ve-row"><span>Layer</span>
                    <span className="flex gap-1"><button type="button" className="s-btn sm" onClick={() => updateVideoClip(selVideo.id, { trackRow: Math.max(0, (selVideo.trackRow || 0) - 1) })}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" className="s-btn sm" onClick={() => updateVideoClip(selVideo.id, { trackRow: (selVideo.trackRow || 0) + 1 })}><ArrowDown className="h-3.5 w-3.5" /></button></span>
                    <span className="v">V{(selVideo.trackRow || 0) + 1}</span></label>
                </div>
                {selVideo.type === "video" && (
                  <div className="ve-sec"><div className="h"><Gauge className="h-3.5 w-3.5" /> Speed</div>
                    <div className="s-seg grid grid-cols-3 w-full min-w-0" role="group" aria-label="Speed">
                      {SPEEDS.map((sp) => <button key={sp} type="button" className="justify-center" aria-pressed={speedOf(selVideo) === sp} onClick={() => setVideoClips((p) => withSpeed(p, selVideo.id, sp))} title={sp < 1 ? `Slow motion: ${1 / sp}× as long` : sp > 1 ? `${sp}× faster` : "Normal speed"}>{speedLabel(sp)}</button>)}
                    </div>
                    <span className="text-[11.5px] min-w-0 break-words" style={{ color: "var(--s-mute)" }}>{speedOf(selVideo) < 1 ? "Slow motion. Clips after it on this row move along so nothing overlaps." : speedOf(selVideo) > 1 ? "Sped up. Clips after it on this row move up to close the gap." : "Slow it down for a slow-mo moment, or speed it up."}</span>
                  </div>
                )}
                <div className="ve-sec"><div className="h">Timing</div><span className="mono text-[12px]">{fmt(selVideo.timelineStart)} · {span(selVideo).toFixed(1)} s{speedOf(selVideo) !== 1 ? ` (${(selVideo.trimEnd - selVideo.trimStart).toFixed(1)} s at ${speedLabel(speedOf(selVideo))})` : ""} of {selVideo.type === "image" ? "a photo" : `${selVideo.maxDuration.toFixed(1)} s`}</span></div>
              </>
            ) : selAudio ? (
              <>
                <div className="ve-sec"><div className="h"><Music className="h-3.5 w-3.5" /> {selAudio.name}</div>
                  {range("Volume", selAudio.volume ?? 100, 0, 100, (v) => updateAudioClip(selAudio.id, { volume: v }))}
                  <button type="button" className="s-btn ai sm justify-self-start" disabled={!!aiBusy} onClick={() => { setRail("ai"); void cutToBeat(); }}><AudioLines className="h-3.5 w-3.5" /> Cut the video to this song</button>
                </div>
                <div className="ve-sec"><div className="h">Timing</div><span className="mono text-[12px]">{fmt(selAudio.timelineStart)} · {(span(selAudio)).toFixed(1)} s</span></div>
              </>
            ) : (
              <>
                <div className="ve-sec"><div className="h">Project</div>
                  <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{canvasAspect === "9:16" ? "9:16 · Reels, TikTok, Shorts" : canvasAspect === "1:1" ? "1:1 · feed posts" : "16:9 · YouTube, websites"} · {fitMode === "fill" ? "fills the frame" : "whole picture"}</span>
                  <span className="mono text-[12px]">{videoClips.length} clip{videoClips.length === 1 ? "" : "s"} · {textLayers.length} text · {audioClips.length} audio · {fmt(totalLength)}</span>
                </div>
                <div className="ve-sec"><div className="h">Shortcuts</div>
                  <div className="grid gap-1.5 text-[12px]" style={{ color: "var(--s-soft)" }}>
                    {[["Space", "Play / pause"], ["S", "Split at the playhead"], ["D", "Duplicate"], ["Delete", "Remove"], ["← →", "Step a frame (Shift: a second)"]].map(([k, l]) => <span key={k} className="flex items-center gap-2"><span className="s-kbd">{k}</span>{l}</span>)}
                  </div>
                </div>
                <div className="ve-sec"><div className="h">Ask BlinkSpot</div><span className="text-[12px]" style={{ color: "var(--s-soft)" }}>Say the cut you want (&quot;a 15 s reel with a hook&quot;) and Ask edits this timeline. You press Apply.</span></div>
              </>
            )}
          </aside>
        </div>

        {/* Timeline */}
        <div className={`ve-tl${focusPreview ? " focus" : ""}`}>
          <div className="ve-tlbar">
            <button type="button" className="s-btn ghost sm" onClick={splitAtPlayhead} title="Split at the playhead (S)"><Scissors className="h-3.5 w-3.5" /> Split</button>
            <button type="button" className="s-btn ghost sm" onClick={duplicateSelected} disabled={!selectedElement} title="Duplicate (D)"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
            <button type="button" className="s-btn ghost sm" onClick={deleteSelected} disabled={!selectedElement} title="Delete"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            <div className="flex-1" />
            {beatMarks.length > 0 && <span className="text-[11px] mono" style={{ color: "var(--s-ai)" }}>♪ {beatMarks.length} beats</span>}
            <button type="button" className="s-btn ghost sm" aria-pressed={isMagnetEnabled} onClick={() => setIsMagnetEnabled(!isMagnetEnabled)} title={isMagnetEnabled ? "Snapping on" : "Snapping off"} style={isMagnetEnabled ? { color: "var(--s-accent)" } : undefined}><Magnet className="h-3.5 w-3.5" /></button>
            <ZoomOut className="h-3.5 w-3.5" style={{ color: "var(--s-mute)" }} />
            <input type="range" min="0.1" max="20" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-28" style={{ accentColor: "var(--s-accent)" }} aria-label="Zoom" />
            <ZoomIn className="h-3.5 w-3.5" style={{ color: "var(--s-mute)" }} />
          </div>
          <div className="ve-tlbody">
            <div className="ve-labels">
              <div style={{ height: 22, borderBottom: "1px solid var(--s-line)" }} />
              {Array.from({ length: videoTrackCount }).map((_, i) => <div key={`vl${i}`} className="ve-label" style={{ height: trackH.video }}><Video className="h-3.5 w-3.5" /> V{i + 1}</div>)}
              {Array.from({ length: textTrackCount }).map((_, i) => <div key={`tl${i}`} className="ve-label" style={{ height: trackH.text }}><Type className="h-3.5 w-3.5" /> T{i + 1}</div>)}
              {Array.from({ length: audioTrackCount }).map((_, i) => <div key={`al${i}`} className="ve-label" style={{ height: trackH.audio }}><Music className="h-3.5 w-3.5" /> A{i + 1}</div>)}
            </div>
            <div ref={timelineRef} className="ve-tracks" onMouseDown={handleTimelineMouseDown} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
              <div style={{ width: `${maxVisibleTime * pps}px`, minWidth: "100%", position: "relative" }}>
                <div className="ve-ruler">
                  {Array.from({ length: Math.ceil(maxVisibleTime / rulerStep) }).map((_, i) => <span key={i} style={{ left: `${i * rulerStep * pps}px` }}>{i * rulerStep}s</span>)}
                  {beatMarks.map((b, i) => <i key={i} className="ve-beat" style={{ left: `${b * pps}px` }} />)}
                </div>
                {Array.from({ length: videoTrackCount }).map((_, i) => (
                  <div key={`vr${i}`} className={`ve-track${hoveredTrackInfo?.type === "video" && hoveredTrackInfo.row === i ? " over" : ""}`} style={{ height: trackH.video }}
                    onDragOver={(e) => { e.preventDefault(); setHoveredTrackInfo({ type: "video", row: i }); }} onDragLeave={() => setHoveredTrackInfo(null)} onDrop={(e) => handleDropOnTrack(e, "video", i)}>
                    {videoClips.filter((c) => (c.trackRow || 0) === i).map((clip) => {
                      const width = (span(clip)) * pps;
                      const tile = 80;
                      const frames = clip.type === "video" ? Array.from({ length: Math.min(24, Math.max(1, Math.ceil(width / tile))) }, (_, k) => frameAt(clip.url, clip.trimStart + ((clip.trimEnd - clip.trimStart) * k) / Math.max(1, Math.ceil(width / tile)))).filter(Boolean) : [];
                      const bg = clip.type === "image" ? `url("${clip.url}")` : frames.length ? frames.map((f) => `url("${f}")`).join(",") : cloudinaryVideoPoster(clip.url) ? `url("${cloudinaryVideoPoster(clip.url)}")` : undefined;
                      const positions = frames.length > 1 ? frames.map((_, k) => `${k * tile}px 0`).join(",") : undefined;
                      return (
                        <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "video")} className={`ve-clip ${clip.type === "image" ? "image" : "video"}${selectedElement?.id === clip.id ? " sel" : ""}`}
                          style={{ left: `${clip.timelineStart * pps}px`, width: `${width}px`, backgroundImage: bg, backgroundPosition: positions, backgroundSize: frames.length > 1 ? `${tile}px 100%` : "auto 100%", backgroundRepeat: frames.length > 1 ? "no-repeat" : "repeat-x" }}>
                          <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, clip.id, "video", "start")} />
                          <span className="nm">{speedOf(clip) !== 1 && <b className="ve-speed" title={speedOf(clip) < 1 ? "Slow motion" : "Sped up"}>{speedLabel(speedOf(clip))}</b>}{clip.name}</span>
                          <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, clip.id, "video", "end")} />
                        </div>
                      );
                    })}
                  </div>
                ))}
                {Array.from({ length: textTrackCount }).map((_, i) => (
                  <div key={`tr${i}`} className="ve-track" style={{ height: trackH.text }}>
                    {textLayers.filter((l) => (l.trackRow || 0) === i).map((layer) => (
                      <div key={layer.id} onMouseDown={(e) => onClipMouseDown(e, layer.id, "text")} className={`ve-clip text${selectedElement?.id === layer.id ? " sel" : ""}`} style={{ left: `${layer.timelineStart * pps}px`, width: `${(span(layer)) * pps}px`, top: 3, bottom: 3 }}>
                        <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, layer.id, "text", "start")} />
                        <span className="nm">{layer.text}</span>
                        <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, layer.id, "text", "end")} />
                      </div>
                    ))}
                  </div>
                ))}
                {Array.from({ length: audioTrackCount }).map((_, i) => (
                  <div key={`ar${i}`} className={`ve-track${hoveredTrackInfo?.type === "audio" && hoveredTrackInfo.row === i ? " over" : ""}`} style={{ height: trackH.audio }}
                    onDragOver={(e) => { e.preventDefault(); setHoveredTrackInfo({ type: "audio", row: i }); }} onDragLeave={() => setHoveredTrackInfo(null)} onDrop={(e) => handleDropOnTrack(e, "audio", i)}>
                    {audioClips.filter((c) => (c.trackRow || 0) === i).map((clip) => {
                      const p = peaks[clip.url] ?? [];
                      const dur = Math.max(0.01, clip.maxDuration);
                      const from = Math.floor((clip.trimStart / dur) * p.length), to = Math.ceil((clip.trimEnd / dur) * p.length);
                      const width = (span(clip)) * pps;
                      const bars = p.slice(from, to);
                      const step = Math.max(1, Math.ceil(bars.length / Math.max(8, Math.floor(width / 3))));
                      const shown = bars.filter((_, k) => k % step === 0);
                      return (
                        <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "audio")} className={`ve-clip audio${/music|song|beat|\.mp3/i.test(clip.name) ? " music" : ""}${selectedElement?.id === clip.id ? " sel" : ""}`} style={{ left: `${clip.timelineStart * pps}px`, width: `${width}px` }}>
                          {shown.length > 0 && <span className="ve-wave">{shown.map((v, k) => <i key={k} style={{ height: `${Math.max(6, v * 100)}%` }} />)}</span>}
                          <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, clip.id, "audio", "start")} />
                          <span className="nm">{clip.name}</span>
                          <div className="grip" onMouseDown={(e) => onTrimMouseDown(e, clip.id, "audio", "end")} />
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="ve-head" style={{ left: `${globalTime * pps}px` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (studio) return renderStudio();

  return (
    <div className={cn(
      "flex flex-col bg-[#191D23] border border-[#57707A]/25 rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] select-none relative ring-1 ring-white/[0.03]",
      studio ? "h-[calc(100dvh-56px-53px-24px)] min-h-[560px]" : "h-[calc(100vh-200px)] min-h-[640px]",
    )}>

      {isRendering && (
        <div className="absolute inset-0 z-50 bg-[#191D23]/95 backdrop-blur-md flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
          {!renderComplete ? (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-[#C5BAC4] mb-6" />
              <h2 className="text-2xl font-bold tracking-widest uppercase mb-2 text-[#DEDCDC]">Rendering Sequence</h2>
              <p className="text-[#989DAA] text-sm mb-6 text-center max-w-sm">{renderStatusText}</p>

              <div className="w-64 h-2 bg-[#2A2F38] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#C5BAC4] transition-all duration-300 ease-out"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <p className="text-xs text-[#C5BAC4] mt-2 font-bold">{renderProgress}%</p>
            </>
          ) : (
            <div className="flex flex-col items-center animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-[#B3FF00]/10 border border-[#B3FF00]/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(179,255,0,0.2)]">
                <Check className="w-10 h-10 text-[#B3FF00]" />
              </div>
              <h2 className="text-3xl font-bold tracking-widest uppercase mb-3 text-[#DEDCDC]">Render Complete!</h2>
              <p className="text-[#989DAA] text-base mb-8 text-center max-w-md leading-relaxed">
                Your video has been successfully downloaded to your computer and securely backed up to your Content Grid.
              </p>
              <div className="flex gap-4">
                <Button
                  onClick={() => { setIsRendering(false); setRenderComplete(false); }}
                  variant="outline"
                  className="border-[#57707A]/50 bg-transparent text-[#DEDCDC]/70 hover:text-white hover:bg-[#2A2F38] font-bold h-12 px-6"
                >
                  Back to Editor
                </Button>
                <Button
                  onClick={() => router.push('/dashboard/content')}
                  className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 px-6 shadow-lg"
                >
                  View in Content Grid
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL: Media/Text */}
        <div className={cn("bg-[#2A2F38] border-r border-[#57707A]/25 flex flex-col z-10", studio ? "w-60" : "w-72", focusPreview && "hidden")}>
          <div className="flex border-b border-[#57707A]/25 bg-[#191D23]/40">
            <button onClick={() => setActiveTab("assets")} className={cn(
              "flex-1 py-3 text-[11px] font-black uppercase tracking-[0.08em] transition-all relative",
              activeTab === "assets" ? "text-[#C5BAC4]" : "text-[#57707A] hover:text-[#989DAA]"
            )}>
              Media
              {activeTab === "assets" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[#C5BAC4] rounded-full" />}
            </button>
            <button onClick={() => setActiveTab("text")} className={cn(
              "flex-1 py-3 text-[11px] font-black uppercase tracking-[0.08em] transition-all relative",
              activeTab === "text" ? "text-[#C5BAC4]" : "text-[#57707A] hover:text-[#989DAA]"
            )}>
              Text
              {activeTab === "text" && <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[#C5BAC4] rounded-full" />}
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === "assets" && (
              <div className="space-y-4">

                <div className="bg-[#191D23] border border-[#57707A]/20 p-1 rounded-xl flex items-center justify-between">
                  <button
                    onClick={() => handleFilterSwitch('library')}
                    className={cn("flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all", assetFilter === 'library' ? "bg-[#2A2F38] shadow-sm text-[#DEDCDC]" : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#2A2F38]/50")}
                  >
                    General
                  </button>
                  <button
                    onClick={() => handleFilterSwitch('sequence')}
                    className={cn("flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1", assetFilter === 'sequence' ? "bg-[#2A2F38] shadow-sm text-[#C5BAC4]" : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#2A2F38]/50")}
                  >
                    <Layers className="w-3 h-3" /> Scenes
                  </button>
                  <button
                    onClick={() => handleFilterSwitch('audio')}
                    className={cn("flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1", assetFilter === 'audio' ? "bg-[#2A2F38] shadow-sm text-[#B3FF00]" : "text-[#DEDCDC]/40 hover:text-[#DEDCDC]/70 hover:bg-[#2A2F38]/50")}
                  >
                    <Mic className="w-3 h-3" /> Audio
                  </button>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" accept="video/*,image/*,audio/*" multiple onChange={handleManualUpload} />
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full border-dashed border-2 border-[#57707A]/40 bg-[#191D23]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 h-10 font-bold transition-all rounded-xl">
                  <UploadCloud className="w-3.5 h-3.5 mr-2" /> Upload File
                </Button>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-[#57707A] uppercase tracking-wider">
                      {assetFilter === 'library' && 'Your Library'}
                      {assetFilter === 'sequence' && 'Story Sequences'}
                      {assetFilter === 'audio' && 'AI Voiceovers'}
                    </p>
                    {isLoadingDB && <Loader2 className="w-3 h-3 text-[#C5BAC4] animate-spin" />}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pb-2">
                    {assets.map((asset) => (
                      <div key={asset.id} draggable onDragStart={(e) => handleDragStart(e, asset)} className="group relative aspect-square bg-[#0F1115] rounded-xl overflow-hidden cursor-grab active:cursor-grabbing hover:ring-1 ring-[#C5BAC4]/70 transition-all border border-[#57707A]/30 hover:border-[#C5BAC4]/30 shadow-sm">
                        {asset.type === "video" ? (
                          cloudinaryVideoPoster(asset.url) ? (
                            // Static poster <img> — paints reliably, unlike a <video> thumbnail
                            <img src={cloudinaryVideoPoster(asset.url)} alt={asset.name || "Clip"} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                          ) : (
                            <video src={asset.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" preload="metadata" muted playsInline />
                          )
                        ) : asset.type === "audio" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#191D23] border border-[#B3FF00]/20 text-[#B3FF00] group-hover:bg-[#B3FF00]/10 transition-colors">
                            <Mic className="w-8 h-8 mb-2 opacity-80" />
                            <span className="text-[10px] font-bold text-center w-full truncate px-2">{asset.name || "Voiceover"}</span>
                          </div>
                        ) : (
                          <img src={asset.thumb} alt="Asset" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        )}

                        <div className="absolute top-1.5 left-1.5 bg-[#191D23]/80 border border-[#57707A]/50 backdrop-blur-sm text-[#DEDCDC] p-1.5 rounded-md shadow-sm">
                          {asset.type === "video" ? <Video className="w-3 h-3" /> : asset.type === "audio" ? <Music className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        </div>
                        <button
                          onClick={() => deleteAsset(asset.id, asset.name)}
                          className="absolute top-1.5 right-1.5 bg-red-500/90 border border-red-400 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all shadow-md scale-90 group-hover:scale-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {assets.length === 0 && !isLoadingDB && (
                    <div className="text-center p-5 border-2 border-dashed border-[#57707A]/30 rounded-xl text-[#989DAA] text-xs font-medium">
                      {assetFilter === 'library' && 'No standard media found.'}
                      {assetFilter === 'sequence' && 'No sequences found. Generate a Storytelling B-Roll first!'}
                      {assetFilter === 'audio' && 'No voiceovers found. Use Dedicated TTS to generate one!'}
                    </div>
                  )}

                  {hasMoreAssets && assets.length > 0 && (
                    <Button
                      onClick={() => setAssetPageLimit(prev => prev + 8)}
                      variant="ghost"
                      className="w-full text-xs font-bold text-[#DEDCDC]/50 hover:text-[#C5BAC4] border border-[#57707A]/30 bg-[#191D23]/50 hover:bg-[#191D23] transition-colors mt-2 h-9 rounded-lg"
                    >
                      {isLoadingDB ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3 mr-1" />} Load More
                    </Button>
                  )}
                </div>
              </div>
            )}
            {activeTab === "text" && (
              <div className="space-y-3">
                <Button onClick={addTextLayer} className="w-full bg-[#C5BAC4]/10 text-[#C5BAC4] hover:bg-[#C5BAC4]/20 border border-[#C5BAC4]/30 justify-start font-bold text-sm h-12 rounded-xl transition-colors">
                  <Plus className="w-4 h-4 mr-2" /> Add Text Layer
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Preview Canvas */}
        <div className="flex-1 bg-[#191D23] flex flex-col relative" onClick={() => setSelectedElement(null)}>
          <div className={cn("bg-gradient-to-r from-[#2A2F38] to-[#232830] border-b border-[#57707A]/25 flex items-center justify-between px-5 shrink-0 z-10 shadow-sm", studio ? "py-1.5" : "h-13 py-2.5")}>
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-4 rounded-full bg-[#C5BAC4]/40" />
              <span className="text-[11px] font-black text-[#989DAA] tracking-[0.1em] uppercase">Preview Canvas</span>
              {studio && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFocusPreview((f) => !f); }}
                  aria-pressed={focusPreview}
                  title={focusPreview ? "Show the media and settings panels" : "Hide the side panels for a bigger preview"}
                  className="ml-2 h-7 px-2.5 rounded-lg text-[11px] font-bold border border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/30 flex items-center gap-1.5"
                >
                  {focusPreview ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  {focusPreview ? "Exit focus" : "Focus"}
                </button>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleRender}
              disabled={isRendering || videoClips.length === 0}
              className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-black shadow-md shadow-[#C5BAC4]/15 transition-all duration-200 h-8 rounded-xl px-4 text-xs tracking-wide disabled:opacity-40"
            >
              <Film className="w-3.5 h-3.5 mr-1.5" />
              Render & Finish
            </Button>
          </div>

          <div className={cn("flex-1 overflow-hidden flex items-center justify-center bg-[url('/checkers.png')] relative before:absolute before:inset-0 before:bg-[#191D23]/90", studio ? "p-3" : "p-6")}>
            <div ref={canvasRef} className="relative aspect-video max-w-full max-h-full h-full w-auto mx-auto bg-[#000000] rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-[#57707A]/50 z-10">

              {videoClips.sort((a, b) => (a.trackRow || 0) - (b.trackRow || 0)).map((clip) => {
                const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip));
                return (
                  <div
                    key={`canvas-${clip.id}`}
                    className="absolute inset-0 pointer-events-none transition-opacity duration-150"
                    style={{
                      opacity: isActive ? (clip.opacity ?? 100) / 100 : 0,
                      zIndex: clip.trackRow || 0,
                      display: isActive ? 'block' : 'none'
                    }}
                  >
                    {clip.type === "image" ? (
                      <img src={clip.url} className="w-full h-full object-contain" />
                    ) : (
                      <video
                        ref={el => { videoRefs.current[clip.id] = el; }}
                        src={clip.url}
                        className="w-full h-full object-contain"
                        playsInline
                      />
                    )}
                  </div>
                )
              })}

              {isScrubbingUI && (
                <div className="absolute inset-0 bg-[#191D23]/60 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none animate-in fade-in duration-150">
                  <div className="bg-[#2A2F38]/90 px-5 py-2.5 rounded-full flex items-center gap-2.5 text-[#DEDCDC] shadow-xl border border-[#57707A]/50">
                    <Loader2 className="w-4 h-4 animate-spin text-[#C5BAC4]" />
                    <span className="text-xs font-bold tracking-widest uppercase">Seeking...</span>
                  </div>
                </div>
              )}

              {!videoClips.some(clip => globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (span(clip))) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[#57707A] z-0 bg-[#000000]">
                  <Video className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-xs font-bold tracking-widest uppercase">Drag media to timeline</p>
                </div>
              )}

              <div className="hidden">
                {videoClips.filter((c) => c.type === "video").map((clip) => (<video key={clip.id} src={clip.url} preload="metadata" onLoadedMetadata={(e) => handleLoadedMetadata(clip.id, e.currentTarget.duration, "video")} />))}

                {/* ✨ FIX: Render audio tracks through a hidden VIDEO tag so MP4 audio plays perfectly */}
                {audioClips.map((clip) => (
                  <video
                    key={`canvas-audio-${clip.id}`}
                    ref={el => { audioRefs.current[clip.id] = el; }}
                    src={clip.url}
                    preload="metadata"
                    onLoadedMetadata={(e) => handleLoadedMetadata(clip.id, e.currentTarget.duration, "audio")}
                  />
                ))}
              </div>

              {textLayers.sort((a, b) => (a.trackRow || 0) - (b.trackRow || 0)).map((layer) => {
                const isVisible = globalTime >= layer.timelineStart && globalTime < layer.timelineStart + (span(layer));
                if (!isVisible) return null;

                return (
                  <div
                    key={layer.id}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedElement({ id: layer.id, type: "text" }); dragTextRef.current = { id: layer.id, startX: e.clientX, startY: e.clientY, initX: layer.x, initY: layer.y }; }}
                    style={{ top: `${layer.y}%`, left: `${layer.x}%`, color: layer.color, fontSize: `${layer.fontSize}px`, opacity: (layer.opacity ?? 100) / 100, zIndex: 100 + (layer.trackRow || 0) }}
                    className={cn(
                      "absolute transform -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] cursor-grab active:cursor-grabbing px-2 py-1 rounded transition-opacity duration-150",
                      selectedElement?.id === layer.id ? "ring-2 ring-[#C5BAC4] ring-dashed bg-[#C5BAC4]/20 backdrop-blur-sm" : ""
                    )}
                  >
                    {layer.text}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={cn("bg-[#2A2F38] border-t border-[#57707A]/30 flex items-center justify-center gap-6 shrink-0 z-10", studio ? "h-12" : "h-14")}>
            <span className="text-xs font-mono font-bold w-16 text-right text-[#DEDCDC]/50">{globalTime.toFixed(1)}s</span>
            <button onClick={() => setGlobalTime(0)} className="p-2.5 text-[#DEDCDC]/50 hover:bg-[#191D23] hover:text-[#DEDCDC] rounded-full transition-colors"><SkipBack className="w-4 h-4" /></button>
            <button onClick={togglePlay} className="p-3.5 bg-[#C5BAC4] text-[#191D23] hover:bg-white rounded-full transition-colors shadow-lg shadow-[#C5BAC4]/10">
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <span className="text-xs font-mono font-bold w-16 text-[#DEDCDC]/50">{maxVisibleTime}s MAX</span>
          </div>
        </div>

        {/* RIGHT PANEL: INSPECTOR */}
        <div className={cn("bg-[#2A2F38] border-l border-[#57707A]/30 flex flex-col z-10 overflow-y-auto custom-scrollbar shadow-[-5px_0_15px_rgba(0,0,0,0.1)]", studio ? "w-60" : "w-72", focusPreview && "hidden")}>
          <div className="p-4 border-b border-[#57707A]/30 flex items-center gap-2 bg-[#191D23]/40">
            <SlidersHorizontal className="w-4 h-4 text-[#C5BAC4]" />
            <span className="font-bold text-sm text-[#DEDCDC] font-display">Properties</span>
          </div>

          {selectedElement ? (
            <div className="p-5 space-y-6 animate-in fade-in slide-in-from-right-2">
              <div className="flex items-center gap-2 pb-3 border-b border-[#57707A]/20">
                {selectedElement.type === 'video' && <Video className="w-4 h-4 text-[#C5BAC4]" />}
                {selectedElement.type === 'audio' && <Music className="w-4 h-4 text-[#B3FF00]" />}
                {selectedElement.type === 'text' && <Type className="w-4 h-4 text-[#DEDCDC]" />}
                <span className="text-sm font-bold text-[#DEDCDC] capitalize tracking-wide">{selectedElement.type} Settings</span>
              </div>

              {selectedElement.type === "text" && (() => {
                const layer = textLayers.find(l => l.id === selectedElement.id);
                if (!layer) return null;
                return (
                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-bold text-[#57707A] uppercase mb-2 block tracking-wider">Text Content</label>
                      <textarea value={layer.text} onChange={e => updateTextLayer(layer.id, { text: e.target.value })} className="w-full p-3 bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] rounded-xl text-sm resize-none focus:ring-1 focus:ring-[#C5BAC4] outline-none shadow-inner custom-scrollbar" rows={3} />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[10px] font-bold text-[#57707A] uppercase mb-2 tracking-wider">
                        Font Size <span className="bg-[#191D23] text-[#DEDCDC] px-2 py-0.5 rounded border border-[#57707A]/30">{layer.fontSize}px</span>
                      </label>
                      <input type="range" value={layer.fontSize} onChange={e => updateTextLayer(layer.id, { fontSize: parseInt(e.target.value) })} className="w-full accent-[#C5BAC4] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" min="12" max="120" />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[10px] font-bold text-[#57707A] uppercase mb-2 tracking-wider">
                        Opacity <span className="bg-[#191D23] text-[#DEDCDC] px-2 py-0.5 rounded border border-[#57707A]/30">{layer.opacity ?? 100}%</span>
                      </label>
                      <input type="range" value={layer.opacity ?? 100} onChange={e => updateTextLayer(layer.id, { opacity: parseInt(e.target.value) })} className="w-full accent-[#C5BAC4] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" min="0" max="100" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#57707A] uppercase mb-2 block tracking-wider">Track Placement</label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateTextLayer(layer.id, { trackRow: Math.max(0, (layer.trackRow || 0) - 1) })}><ArrowUp className="w-4 h-4 mr-1" /> Up</Button>
                        <span className="w-12 flex items-center justify-center bg-[#191D23] text-[#DEDCDC] font-bold rounded-lg border border-[#57707A]/40 text-xs">T{(layer.trackRow || 0) + 1}</span>
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateTextLayer(layer.id, { trackRow: (layer.trackRow || 0) + 1 })}><ArrowDown className="w-4 h-4 mr-1" /> Down</Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {selectedElement.type === "video" && (() => {
                const clip = videoClips.find(c => c.id === selectedElement.id);
                if (!clip) return null;
                return (
                  <div className="space-y-5">
                    <div>
                      <label className="flex items-center justify-between text-[10px] font-bold text-[#57707A] uppercase mb-2 tracking-wider">
                        Opacity <span className="bg-[#191D23] text-[#DEDCDC] px-2 py-0.5 rounded border border-[#57707A]/30">{clip.opacity ?? 100}%</span>
                      </label>
                      <input type="range" value={clip.opacity ?? 100} onChange={e => updateVideoClip(clip.id, { opacity: parseInt(e.target.value) })} className="w-full accent-[#C5BAC4] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" min="0" max="100" />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[10px] font-bold text-[#57707A] uppercase mb-2 tracking-wider">
                        Volume <span className="bg-[#191D23] text-[#DEDCDC] px-2 py-0.5 rounded border border-[#57707A]/30">{clip.volume ?? 100}%</span>
                      </label>
                      <input type="range" value={clip.volume ?? 100} onChange={e => updateVideoClip(clip.id, { volume: parseInt(e.target.value) })} className="w-full accent-[#C5BAC4] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" min="0" max="100" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#57707A] uppercase mb-2 block tracking-wider">Track Layer (Z-Index)</label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateVideoClip(clip.id, { trackRow: Math.max(0, (clip.trackRow || 0) - 1) })}><ArrowUp className="w-4 h-4 mr-1" /> Top</Button>
                        <span className="w-12 flex items-center justify-center bg-[#191D23] text-[#C5BAC4] font-bold rounded-lg border border-[#57707A]/40 text-xs">V{(clip.trackRow || 0) + 1}</span>
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateVideoClip(clip.id, { trackRow: (clip.trackRow || 0) + 1 })}><ArrowDown className="w-4 h-4 mr-1" /> Bottom</Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {selectedElement.type === "audio" && (() => {
                const clip = audioClips.find(c => c.id === selectedElement.id);
                if (!clip) return null;
                return (
                  <div className="space-y-5">
                    <div>
                      <label className="flex items-center justify-between text-[10px] font-bold text-[#57707A] uppercase mb-2 tracking-wider">
                        Volume <span className="bg-[#191D23] text-[#DEDCDC] px-2 py-0.5 rounded border border-[#57707A]/30">{clip.volume ?? 100}%</span>
                      </label>
                      <input type="range" value={clip.volume ?? 100} onChange={e => updateAudioClip(clip.id, { volume: parseInt(e.target.value) })} className="w-full accent-[#B3FF00] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" min="0" max="100" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#57707A] uppercase mb-2 block tracking-wider">Track Group</label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateAudioClip(clip.id, { trackRow: Math.max(0, (clip.trackRow || 0) - 1) })}><ArrowUp className="w-4 h-4 mr-1" /> Up</Button>
                        <span className="w-12 flex items-center justify-center bg-[#191D23] text-[#B3FF00] font-bold rounded-lg border border-[#57707A]/40 text-xs">A{(clip.trackRow || 0) + 1}</span>
                        <Button size="sm" variant="outline" className="flex-1 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white" onClick={() => updateAudioClip(clip.id, { trackRow: (clip.trackRow || 0) + 1 })}><ArrowDown className="w-4 h-4 mr-1" /> Down</Button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-80">
              <div className="w-16 h-16 bg-[#191D23] border border-[#57707A]/30 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <SlidersHorizontal className="w-8 h-8 text-[#57707A]" />
              </div>
              <p className="text-sm font-bold text-[#DEDCDC]/60 max-w-[180px]">Select a clip or text layer to adjust properties.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── BOTTOM WORKSPACE (Timeline Engine) ─── */}
      <div className={cn("bg-[#2A2F38] border-t border-[#57707A]/25 flex flex-col z-0 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] shrink-0", studio ? (focusPreview ? "h-40" : "h-56") : "h-80")}>
        <div className="h-11 bg-gradient-to-r from-[#191D23] to-[#1D2229] border-b border-[#57707A]/25 flex items-center justify-between px-5 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-3.5 rounded-full bg-[#B3FF00]/50" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#57707A]">Timeline</span>
            </div>
            <div className="h-3.5 w-px bg-[#57707A]/30"></div>
            <button onClick={deleteSelected} disabled={!selectedElement} className="p-1.5 hover:bg-red-500/20 rounded-lg text-[#57707A] hover:text-red-400 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#57707A] transition-colors" title="Delete Selected Clip"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-4">

            <button
              onClick={() => setIsMagnetEnabled(!isMagnetEnabled)}
              className={cn("p-1.5 rounded-lg transition-colors flex items-center gap-1", isMagnetEnabled ? "bg-[#C5BAC4]/20 text-[#C5BAC4] border border-[#C5BAC4]/30 shadow-sm" : "text-[#57707A] hover:bg-[#57707A]/20 hover:text-[#DEDCDC] border border-transparent")}
              title={isMagnetEnabled ? "Snapping Enabled" : "Snapping Disabled"}
            >
              <Magnet className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-[#57707A]/40 mx-1"></div>

            <ZoomOut className="w-4 h-4 text-[#57707A]" />
            <input type="range" min="0.1" max="20" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-32 accent-[#C5BAC4] h-1.5 bg-[#57707A]/30 rounded-lg appearance-none cursor-pointer" />
            <ZoomIn className="w-4 h-4 text-[#57707A]" />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative bg-[#191D23]/50">

          <div className="w-32 flex-shrink-0 bg-[#2A2F38] border-r border-[#57707A]/30 z-30 shadow-[2px_0_10px_rgba(0,0,0,0.2)] relative">
            <div className="h-6 border-b border-[#57707A]/20 bg-[#191D23]/80"></div>
            {Array.from({ length: videoTrackCount }).map((_, i) => (
              <div key={`vlabel-${i}`} className="h-14 border-b border-[#57707A]/20 flex items-center px-4 gap-2 text-[#C5BAC4] bg-[#C5BAC4]/5">
                <Video className="w-4 h-4 opacity-70" /> <span className="text-xs font-bold font-mono">V{i + 1}</span>
              </div>
            ))}
            {Array.from({ length: textTrackCount }).map((_, i) => (
              <div key={`tlabel-${i}`} className="h-12 border-b border-[#57707A]/20 flex items-center px-4 gap-2 text-[#DEDCDC] bg-white/5">
                <Type className="w-4 h-4 opacity-70" /> <span className="text-xs font-bold font-mono">T{i + 1}</span>
              </div>
            ))}
            {Array.from({ length: audioTrackCount }).map((_, i) => (
              <div key={`alabel-${i}`} className="h-14 border-b border-[#57707A]/20 flex items-center px-4 gap-2 text-[#B3FF00] bg-[#B3FF00]/5">
                <Music className="w-4 h-4 opacity-70" /> <span className="text-xs font-bold font-mono">A{i + 1}</span>
              </div>
            ))}
          </div>

          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto relative custom-scrollbar bg-[url('/grid.png')] bg-repeat"
            style={{ backgroundSize: '20px 20px', backgroundImage: 'radial-gradient(#57707a30 1px, transparent 0)' }}
            onMouseDown={handleTimelineMouseDown}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          >
            <div style={{ width: `${maxVisibleTime * PIXELS_PER_SECOND}px`, minWidth: "100%", height: "100%", position: "relative" }}>

              <div className="h-6 border-b border-[#57707A]/30 bg-[#191D23]/90 backdrop-blur-sm sticky top-0 z-10 overflow-hidden pointer-events-none shadow-sm">
                {Array.from({ length: Math.ceil(maxVisibleTime / rulerStep) }).map((_, i) => (
                  <div key={i} className="absolute text-[9px] font-mono font-bold text-[#57707A] border-l border-[#57707A]/40 pl-1.5" style={{ left: `${i * rulerStep * PIXELS_PER_SECOND}px`, bottom: 0, height: "14px" }}>{i * rulerStep}s</div>
                ))}
              </div>

              {Array.from({ length: videoTrackCount }).map((_, i) => (
                <div
                  key={`vrow-${i}`}
                  className={cn("h-14 border-b border-[#57707A]/20 relative py-1.5 transition-all", hoveredTrackInfo?.type === "video" && hoveredTrackInfo?.row === i ? "bg-[#C5BAC4]/10 ring-1 ring-inset ring-[#C5BAC4]/50" : "")}
                  onDragOver={(e) => { e.preventDefault(); setHoveredTrackInfo({ type: "video", row: i }); }}
                  onDragLeave={() => setHoveredTrackInfo(null)}
                  onDrop={(e) => handleDropOnTrack(e, "video", i)}
                >
                  {videoClips.filter(c => (c.trackRow || 0) === i).map((clip) => (
                    <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "video")} style={{ left: `${clip.timelineStart * PIXELS_PER_SECOND}px`, width: `${(span(clip)) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-11 bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === clip.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
                      <div onMouseDown={(e) => onTrimMouseDown(e, clip.id, "video", "start")} className="w-2.5 h-full bg-[#C5BAC4] cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                      <span className="text-[10px] font-bold text-[#DEDCDC] px-2 truncate flex-1 pointer-events-none">{clip.name}</span>
                      <div onMouseDown={(e) => onTrimMouseDown(e, clip.id, "video", "end")} className="w-2.5 h-full bg-[#C5BAC4] cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                    </div>
                  ))}
                </div>
              ))}

              {Array.from({ length: textTrackCount }).map((_, i) => (
                <div key={`trow-${i}`} className="h-12 border-b border-[#57707A]/20 relative py-1.5">
                  {textLayers.filter(l => (l.trackRow || 0) === i).map((layer) => (
                    <div key={layer.id} onMouseDown={(e) => onClipMouseDown(e, layer.id, "text")} style={{ left: `${layer.timelineStart * PIXELS_PER_SECOND}px`, width: `${(span(layer)) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-9 bg-[#DEDCDC]/10 border border-[#DEDCDC]/50 rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === layer.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
                      <div onMouseDown={(e) => onTrimMouseDown(e, layer.id, "text", "start")} className="w-2.5 h-full bg-[#DEDCDC]/60 cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                      <Type className="w-3 h-3 text-white mx-2 shrink-0 pointer-events-none" />
                      <span className="text-[10px] font-bold text-white truncate flex-1 pointer-events-none">{layer.text}</span>
                      <div onMouseDown={(e) => onTrimMouseDown(e, layer.id, "text", "end")} className="w-2.5 h-full bg-[#DEDCDC]/60 cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                    </div>
                  ))}
                </div>
              ))}

              {Array.from({ length: audioTrackCount }).map((_, i) => (
                <div
                  key={`arow-${i}`}
                  className={cn("h-14 border-b border-[#57707A]/20 relative py-1.5 transition-all", hoveredTrackInfo?.type === "audio" && hoveredTrackInfo?.row === i ? "bg-[#B3FF00]/10 ring-1 ring-inset ring-[#B3FF00]/50" : "")}
                  onDragOver={(e) => { e.preventDefault(); setHoveredTrackInfo({ type: "audio", row: i }); }}
                  onDragLeave={() => setHoveredTrackInfo(null)}
                  onDrop={(e) => handleDropOnTrack(e, "audio", i)}
                >
                  {audioClips.filter(c => (c.trackRow || 0) === i).map((clip) => (
                    <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "audio")} style={{ left: `${clip.timelineStart * PIXELS_PER_SECOND}px`, width: `${(span(clip)) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-11 bg-[#B3FF00]/20 border border-[#B3FF00] rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === clip.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
                      <div onMouseDown={(e) => onTrimMouseDown(e, clip.id, "audio", "start")} className="w-2.5 h-full bg-[#B3FF00] cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                      <Music className="w-3 h-3 text-[#B3FF00] mx-2 shrink-0 pointer-events-none" />
                      <span className="text-[10px] font-bold text-[#DEDCDC] truncate flex-1 pointer-events-none">{clip.name}</span>
                      <div onMouseDown={(e) => onTrimMouseDown(e, clip.id, "audio", "end")} className="w-2.5 h-full bg-[#B3FF00] cursor-ew-resize shrink-0 hover:bg-white transition-colors" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-0 bottom-0 pointer-events-none z-50 overflow-hidden" style={{ left: '8rem', right: 0 }}>
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#B3FF00] will-change-transform shadow-[0_0_10px_rgba(179,255,0,0.8)]"
              style={{ transform: `translateX(${(globalTime * PIXELS_PER_SECOND) - scrollLeft}px)` }}
            >
              <div className="absolute -top-0 -left-1.5 w-3.5 h-3.5 bg-[#B3FF00] rounded-sm shadow-md flex items-center justify-center">
                <div className="w-1 h-2 bg-[#191D23] rounded-full"></div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
// const input = $json;

// let systemInstruction = "";
// let userConcept = input.userPrompt && input.userPrompt.trim() !== "" 
//     ? input.userPrompt 
//     : "I have no specific concept. Please analyze the image and invent a highly engaging sequence.";

// let brandContext = "";
// if (input.strictBrandAlignment === true) {
//     brandContext = `\nBRAND IDENTITY TO ENFORCE:\n- Brand Name: '${input.brandName}'\n- Brand Vibe/Info: '${input.brandInfo}'\nCRITICAL INSTRUCTION: You must adopt the tone and aesthetic of this brand.`;
// } else {
//     brandContext = `\nCRITICAL INSTRUCTION: IGNORE any saved brand profiles. Focus 100% on the exact product and characters shown.`;
// }

// const safetyFilter = "\nCRITICAL COMPLIANCE: Write ONLY brand-safe, family-friendly prompts. Assume benevolent intent for all colloquialisms.";

// let targetModel = input.aiModelOverride || "auto";
// let videoMode = input.videoMode || "standard";
// let aspectRatio = input.aspectRatio || "16:9";

// // ✨ THE MASTER KLING 3.0 RULEBOOK (Derived from Official Docs)
// let klingRulebook = `
// *** KLING 3.0 MASTER RULEBOOK ***
// You are translating the user's concept into a flawless prompt for the Kling 3.0 Video Engine. You MUST obey these syntactical rules:

// 1. MULTI-SHOT NARRATIVES: If the scene requires multiple angles, use explicit shot markers. 
//    - Good: "Shot 1, medium close-up of a man driving. Shot 2, macro shot of his hands on the steering wheel."
// 2. NATIVE AUDIO & LIPSYNC: Kling 3.0 supports native lip-syncing. If a character speaks, you MUST use this exact format:
//    - Format: Character Description (emotion/accent/tone, language): "Exact spoken words."
//    - Good: Woman (cheerful, English): "Wow, I didn't expect this!"
//    - Bad: The woman smiles and says wow I didn't expect this.
// 3. TEMPORAL MARKERS (15-SECOND RULE): For long, continuous single-shots, dictate the pacing using time markers.
//    - Good: "At the 4th second, the camera accelerates forward. At the 8th second, the camera pans to track the protagonist."
// 4. NATIVE TEXT RENDERING: If a sign, shirt, or logo requires written text, state it explicitly in quotes.
//    - Good: The camera lingers on the word "KLING" emblazoned on the baseball bat.
// 5. ELEMENT CONSISTENCY: Describe character features (clothing, hair, colors) consistently across all shots to prevent morphing.
// `;

// // Seedance 2.0 Rulebook (Fallback)
// let seedanceRulebook = `
// *** SEEDANCE 2.0 RULEBOOK ***
// 1. CINEMATIC STRUCTURE: Use the formula: Subject + Scene + Action + Specific Camera Movement + Style/Lighting.
// 2. PHYSICS-AWARE PROMPTING: Describe exactly HOW things move with anti-gravity or realistic physics.
// 3. NO TEXT: Do not attempt to render visual text.
// `;

// let styleGuide = "";
// if (targetModel.includes('kling') || targetModel === 'auto') {
//     styleGuide = klingRulebook;
// } else if (targetModel.includes('seedance')) {
//     styleGuide = seedanceRulebook;
// } else if (targetModel.includes('pruna')) {
//     styleGuide = `\nMODEL STYLE GUIDE (Pruna P-Video): EXTREME SIMPLICITY. Keep the prompt STRICTLY UNDER 50 WORDS.`;
// }

// let actorInstructions = "";
// if (input.actor1Sheet && input.actor1Sheet !== "null") {
//     actorInstructions = `\nCRITICAL CASTING: You are receiving ONE character reference sheet. Integrate this exact character into the scene seamlessly.`;
// }

// systemInstruction = `You are an elite commercial video director. \n${brandContext} \n${safetyFilter} \n${actorInstructions} \n${styleGuide}\n\nWrite a highly detailed cinematic visual prompt based on the user's concept. Ensure absolute visual accuracy to the reference images. Output ONLY the prompt text.`;

// let framingInstruction = "";
// if (aspectRatio === "9:16") {
//     framingInstruction = "CAMERA FRAMING (9:16 VERTICAL): The final video is for mobile. Keep the primary subject dead-center. Prioritize vertical camera movements.";
// } else {
//     framingInstruction = "CAMERA FRAMING (16:9 LANDSCAPE): The final video is cinematic widescreen. Utilize the wide frame using horizontal pans.";
// }

// systemInstruction += `\n\n*** PROMPT ENHANCEMENT DIRECTIVE ***
// 1. PRESERVATION OVERRIDE (CRITICAL): If the USER'S CONCEPT already contains highly technical formatting (like 'Static locked-off medium-wide shot' or exact dialogue tags), DO NOT REWRITE IT. Preserve their exact wording and syntax.
// 2. IF IT IS A BASIC CONCEPT, upgrade it into a flawless, professional visual prompt using the Model Rulebook.
// ${framingInstruction}
// 3. CINEMATIC REALISM: Inject terms describing natural textures, realistic lighting, and high-end camera gear.`;

// let imagesToAnalyze = [];
// const isValidImg = (url) => url && typeof url === 'string' && url !== "null" && url.trim() !== "";

// if (isValidImg(input.primaryImageUrl)) imagesToAnalyze.push({ type: "image_url", image_url: { url: input.primaryImageUrl } });
// if (isValidImg(input.secondaryImageUrl)) imagesToAnalyze.push({ type: "image_url", image_url: { url: input.secondaryImageUrl } });
// if (isValidImg(input.actor1Sheet)) imagesToAnalyze.push({ type: "image_url", image_url: { url: input.actor1Sheet } });

// let userContent = [ { type: "text", text: "USER'S CONCEPT: " + userConcept } ];
// userContent = userContent.concat(imagesToAnalyze);

// return [{
//   json: {
//     chatGptBody: {
//         model: "gpt-4o",
//         messages: [
//             { role: "system", content: systemInstruction },
//             { role: "user", content: userContent }
//         ],
//         max_tokens: 600,
//         temperature: 0.7
//     }
//   }
// }];