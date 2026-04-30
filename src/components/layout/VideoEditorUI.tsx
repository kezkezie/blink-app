"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Play, Pause, SkipBack, Trash2, Plus, Video, Type, Music,
  Image as ImageIcon, UploadCloud, Settings, Download,
  ZoomIn, ZoomOut, Loader2, X, SlidersHorizontal, ArrowUp, ArrowDown, ChevronDown, Layers, Film, Mic, Magnet, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface MediaAsset {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  thumb: string;
  name: string;
  duration?: number;
}

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
}

export function VideoEditorUI() {
  const { clientId } = useClient();
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

  // ✨ REPLACED isScrubbingRef with proper React State for tracking the playhead handle
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isScrubbingUI, setIsScrubbingUI] = useState(false);

  const PIXELS_PER_SECOND = 10 * zoom;

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [videoClips, setVideoClips] = useState<TrackClip[]>([]);
  const [audioClips, setAudioClips] = useState<TrackClip[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);

  const [selectedElement, setSelectedElement] = useState<{ id: string; type: "text" | "video" | "audio"; } | null>(null);
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
    if (!clientId) return;
    setIsLoadingDB(true);

    let query = supabase
      .from("content")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filterType === "sequence") {
      query = query.eq("content_type", "sequence_clip");
    } else if (filterType === "audio") {
      query = query.in("content_type", ["generated_audio", "audio", "music", "voiceover"]);
    } else {
      query = query.not("content_type", "in", '("sequence_clip","generated_audio")');
    }

    const { data, error } = await query;

    if (data) {
      const dbAssets: MediaAsset[] = [];
      data.forEach((item) => {
        let parsedUrls: string[] = [];

        if (Array.isArray(item.image_urls) && item.image_urls.length > 0) {
          parsedUrls = item.image_urls;
        } else if (typeof item.image_urls === 'string' && item.image_urls.length > 5) {
          try { parsedUrls = JSON.parse(item.image_urls); } catch (e) { }
        }

        if (parsedUrls.length === 0) {
          if (Array.isArray(item.video_urls) && item.video_urls.length > 0) {
            parsedUrls = item.video_urls;
          } else if (typeof item.video_urls === 'string' && item.video_urls.length > 5) {
            try { parsedUrls = JSON.parse(item.video_urls); } catch (e) { }
          }
        }

        parsedUrls.forEach((url: string, idx: number) => {
          const isAudioUrl = url.includes(".mp3") || url.includes(".wav") || url.includes("audios/");
          const isAudioType = item.content_type === "generated_audio";
          const isAudio = isAudioUrl || isAudioType;

          const isVid = url.includes(".mp4") || url.includes(".mov") || item.content_type === "sequence_clip" || item.content_type === "reel";

          if (filterType === "audio" && !isAudio) return;
          if (filterType === "library" && (isAudio || item.content_type === "sequence_clip")) return;

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
    loadDatabaseContent(assetPageLimit, assetFilter);
  }, [clientId, assetPageLimit, assetFilter]);

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
          const maxVideo = videoClips.length > 0 ? Math.max(...videoClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart))) : 0;
          const maxAudio = audioClips.length > 0 ? Math.max(...audioClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart))) : 0;
          const maxText = textLayers.length > 0 ? Math.max(...textLayers.map((c) => c.timelineStart + (c.trimEnd - c.trimStart))) : 0;
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
      const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (clip.trimEnd - clip.trimStart);
      if (isActive) {
        el.volume = (clip.volume ?? 100) / 100;
        const expectedTime = clip.trimStart + (globalTime - clip.timelineStart);
        if (Math.abs(el.currentTime - expectedTime) > 0.25) el.currentTime = expectedTime;
        if (isPlaying && el.paused) el.play().catch(() => { });
      } else {
        if (!el.paused) el.pause();
      }
    });

    audioClips.forEach(clip => {
      const el = audioRefs.current[clip.id];
      if (!el) return;
      const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (clip.trimEnd - clip.trimStart);
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

  const handleRender = async () => {
    if (!clientId) return;
    const orderedVideos = [...videoClips].sort((a, b) => a.timelineStart - b.timelineStart);
    if (orderedVideos.length === 0) return alert("Please add at least one visual layer (image or video) to the timeline!");

    setIsRendering(true);
    setRenderComplete(false);
    setIsPlaying(false);
    setRenderProgress(5);
    setRenderStatusText("Booting AI Render Engine...");

    try {
      const ffmpeg = ffmpegRef.current;
      ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));

      if (!ffmpeg.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      setRenderProgress(15);

      let hasFont = false;
      if (textLayers.length > 0) {
        setRenderStatusText("Loading font libraries...");
        try {
          const fontData = await fetchFile(getProxyUrl('https://raw.githubusercontent.com/ffmpegwasm/testdata/master/arial.ttf'));
          await ffmpeg.writeFile('arial.ttf', fontData);
          hasFont = true;
        } catch (e) {
          console.warn("Could not load font.", e);
        }
      }

      const inputArgs: string[] = [];
      const filterSteps: string[] = [];
      let concatStreams = "";

      for (let i = 0; i < orderedVideos.length; i++) {
        setRenderStatusText(`Processing visual media ${i + 1} of ${orderedVideos.length}...`);
        const clip = orderedVideos[i];
        const isImg = clip.type === 'image';
        const ext = isImg ? 'png' : 'mp4';
        const fileName = `media_${i}.${ext}`;
        const duration = clip.trimEnd - clip.trimStart;

        try {
          await ffmpeg.writeFile(fileName, await fetchFile(getProxyUrl(clip.url)));
        } catch (err) {
          throw new Error(`Failed to download media item ${i + 1}.`);
        }

        if (isImg) {
          inputArgs.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', fileName);
        } else {
          inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);
        }

        filterSteps.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`);
        concatStreams += `[v${i}]`;

        setRenderProgress(15 + Math.floor((i / orderedVideos.length) * 30));
      }

      setRenderStatusText("Stitching sequence...");
      filterSteps.push(`${concatStreams}concat=n=${orderedVideos.length}:v=1:a=0[outv]`);

      let finalVideoMap = '[outv]';

      if (textLayers.length > 0 && hasFont) {
        setRenderStatusText("Baking text layers...");
        let textFilters: string[] = [];
        textLayers.forEach((layer) => {
          const start = layer.timelineStart;
          const end = layer.timelineStart + (layer.trimEnd - layer.trimStart);
          const x = `(w*${layer.x}/100)`;
          const y = `(h*${layer.y}/100)`;
          const size = layer.fontSize * 2;
          const safeText = layer.text.replace(/'/g, "\u2019").replace(/:/g, "\\:");
          textFilters.push(`drawtext=fontfile=arial.ttf:text='${safeText}':fontcolor=${layer.color || 'white'}:fontsize=${size}:x=${x}:y=${y}:enable='between(t,${start},${end})'`);
        });
        if (textFilters.length > 0) {
          filterSteps.push(`[outv]${textFilters.join(',')}[textout]`);
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
          const duration = clip.trimEnd - clip.trimStart;
          await ffmpeg.writeFile(fileName, await fetchFile(getProxyUrl(clip.url)));

          inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);

          const delayMs = Math.floor(clip.timelineStart * 1000);
          const audioInputIndex = orderedVideos.length;
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
            const duration = clip.trimEnd - clip.trimStart;
            await ffmpeg.writeFile(fileName, await fetchFile(getProxyUrl(clip.url)));

            inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);

            const delayMs = Math.floor(clip.timelineStart * 1000);
            const audioInputIndex = orderedVideos.length + i;
            filterSteps.push(`[${audioInputIndex}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
            audioMixStr += `[a${i}]`;
            hasAudio = true;
            setRenderProgress(40 + Math.floor((i / audioClips.length) * 20));
          }
          filterSteps.push(`${audioMixStr}amix=inputs=${audioClips.length}:duration=longest:dropout_transition=0[outa]`);
        }
      }

      setRenderProgress(70);
      const finalFilterGraph = filterSteps.join(';');

      const maxVideoTime = orderedVideos.reduce((max, clip) => Math.max(max, clip.timelineStart + (clip.trimEnd - clip.trimStart)), 0);

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

      execArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', 'output.mp4');

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

  function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isAudio = file.type.includes("audio");
    const trackType = isAudio ? "audio" : file.type.includes("video") ? "video" : "image";
    processDroppedFile(file, trackType, globalTime, 0);
  }

  function processDroppedFile(file: File, trackType: "video" | "audio" | "image", dropTime: number, row: number) {
    const url = URL.createObjectURL(file);
    const newAsset: MediaAsset = { id: crypto.randomUUID(), type: trackType, url, thumb: url, name: file.name, duration: 10 };
    setAssets((prev) => [newAsset, ...prev]);
    addClipToTimeline(newAsset, trackType === "audio" ? "audio" : "video", dropTime, row);
  }

  function addClipToTimeline(asset: MediaAsset, trackType: "video" | "audio", dropTime: number, row: number) {
    const defaultDuration = asset.type === "image" ? 5 : asset.duration || 10;
    const newClip: TrackClip = {
      id: crypto.randomUUID(), assetId: asset.id, url: asset.url, type: asset.type as any, name: asset.name,
      timelineStart: dropTime, trimStart: 0, trimEnd: defaultDuration, maxDuration: defaultDuration,
      opacity: 100, volume: 100, trackRow: row,
    };
    if (trackType === "video") setVideoClips([...videoClips, newClip]);
    else setAudioClips([...audioClips, newClip]);
  }

  function handleDropOnTrack(e: React.DragEvent, trackType: "video" | "audio", targetRow: number) {
    e.preventDefault();
    setHoveredTrackInfo(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const dropTime = Math.max(0, dropX / PIXELS_PER_SECOND);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isAudio = file.type.includes("audio");
      processDroppedFile(file, isAudio ? "audio" : file.type.includes("video") ? "video" : "image", dropTime, targetRow);
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
    if (type === "video") setVideoClips((prev) => prev.map((c) => c.id === id ? { ...c, maxDuration: duration, trimEnd: Math.min(c.trimEnd, duration) } : c));
    else setAudioClips((prev) => prev.map((c) => c.id === id ? { ...c, maxDuration: duration, trimEnd: Math.min(c.trimEnd, duration) } : c));
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
    // We remove the magic 128 here, we just use the raw relative clickX
    // Need to account for the left sidebar offset if timelineRef includes it.
    // Assuming timelineRef is JUST the scrolling track area:
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
          if (edge === "start") {
            const newTrim = Math.max(0, Math.min(initTrim + deltaSeconds, clip.trimEnd - 0.5));
            newClip.trimStart = newTrim;
            newClip.timelineStart = initTimeline + (newTrim - initTrim);
          } else {
            newClip.trimEnd = Math.max(clip.trimStart + 0.5, Math.min(clip.maxDuration, initTrim + deltaSeconds));
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
            const duration = clip.trimEnd - clip.trimStart;

            const allClips = [...videoClips, ...audioClips, ...textLayers];

            allClips.forEach(other => {
              if (other.id === id) return;
              const otherStart = other.timelineStart;
              const otherEnd = other.timelineStart + (other.trimEnd - other.trimStart);

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

  const contentMax = Math.max(30, ...videoClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)), ...audioClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)), ...textLayers.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)), globalTime) + 60;
  const maxVisibleTime = Math.min(contentMax, 3600);

  let rulerStep = 1;
  if (zoom < 5) rulerStep = 5;
  if (zoom < 1) rulerStep = 30;
  if (zoom < 0.2) rulerStep = 60;

  return (
    <div className="flex flex-col h-[850px] bg-[#191D23] border border-[#57707A]/30 rounded-2xl overflow-hidden shadow-lg select-none relative">

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
        <div className="w-72 bg-[#2A2F38] border-r border-[#57707A]/30 flex flex-col z-10">
          <div className="flex border-b border-[#57707A]/30">
            <button onClick={() => setActiveTab("assets")} className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors", activeTab === "assets" ? "text-[#C5BAC4] border-b-2 border-[#C5BAC4] bg-[#191D23]/30" : "text-[#DEDCDC]/40 hover:bg-[#191D23]/20")}>{"Media"}</button>
            <button onClick={() => setActiveTab("text")} className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors", activeTab === "text" ? "text-[#C5BAC4] border-b-2 border-[#C5BAC4] bg-[#191D23]/30" : "text-[#DEDCDC]/40 hover:bg-[#191D23]/20")}>{"Text"}</button>
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

                <input type="file" ref={fileInputRef} className="hidden" accept="video/*,image/*,audio/*" onChange={handleManualUpload} />
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full border-dashed border-2 border-[#57707A]/50 bg-transparent text-[#C5BAC4] hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/10 h-10 font-bold transition-colors">
                  <UploadCloud className="w-4 h-4 mr-2" /> Upload File
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

                  <div className="grid grid-cols-2 gap-3 pb-2">
                    {assets.map((asset) => (
                      <div key={asset.id} draggable onDragStart={(e) => handleDragStart(e, asset)} className="group relative aspect-square bg-[#0F1115] rounded-xl overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 ring-[#C5BAC4] transition-all border border-[#57707A]/40 shadow-sm">
                        {asset.type === "video" ? (
                          <video src={asset.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" preload="metadata" muted playsInline />
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
          <div className="h-14 bg-[#2A2F38] border-b border-[#57707A]/30 flex items-center justify-between px-5 shrink-0 z-10 shadow-sm">
            <span className="text-sm font-bold text-[#DEDCDC] tracking-wider uppercase font-display">Preview Canvas</span>

            <Button
              size="sm"
              onClick={handleRender}
              disabled={isRendering || videoClips.length === 0}
              className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-md shadow-[#C5BAC4]/20 transition-all duration-200 h-9 rounded-lg px-4"
            >
              <Film className="w-4 h-4 mr-2" />
              Render & Finish
            </Button>
          </div>

          <div className="flex-1 overflow-hidden p-6 flex items-center justify-center bg-[url('/checkers.png')] relative before:absolute before:inset-0 before:bg-[#191D23]/90">
            <div ref={canvasRef} className="relative w-full max-w-3xl aspect-video bg-[#000000] rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden ring-1 ring-[#57707A]/50 z-10">

              {videoClips.sort((a, b) => (a.trackRow || 0) - (b.trackRow || 0)).map((clip) => {
                const isActive = globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (clip.trimEnd - clip.trimStart);
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

              {!videoClips.some(clip => globalTime >= clip.timelineStart && globalTime < clip.timelineStart + (clip.trimEnd - clip.trimStart)) && (
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
                const isVisible = globalTime >= layer.timelineStart && globalTime < layer.timelineStart + (layer.trimEnd - layer.trimStart);
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

          <div className="h-14 bg-[#2A2F38] border-t border-[#57707A]/30 flex items-center justify-center gap-6 shrink-0 z-10">
            <span className="text-xs font-mono font-bold w-16 text-right text-[#DEDCDC]/50">{globalTime.toFixed(1)}s</span>
            <button onClick={() => setGlobalTime(0)} className="p-2.5 text-[#DEDCDC]/50 hover:bg-[#191D23] hover:text-[#DEDCDC] rounded-full transition-colors"><SkipBack className="w-4 h-4" /></button>
            <button onClick={togglePlay} className="p-3.5 bg-[#C5BAC4] text-[#191D23] hover:bg-white rounded-full transition-colors shadow-lg shadow-[#C5BAC4]/10">
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <span className="text-xs font-mono font-bold w-16 text-[#DEDCDC]/50">{maxVisibleTime}s MAX</span>
          </div>
        </div>

        {/* RIGHT PANEL: INSPECTOR */}
        <div className="w-72 bg-[#2A2F38] border-l border-[#57707A]/30 flex flex-col z-10 overflow-y-auto custom-scrollbar shadow-[-5px_0_15px_rgba(0,0,0,0.1)]">
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
      <div className="h-80 bg-[#2A2F38] border-t border-[#57707A]/40 flex flex-col z-0 shadow-[0_-5px_20px_rgba(0,0,0,0.2)]">
        <div className="h-12 bg-[#191D23] border-b border-[#57707A]/30 flex items-center justify-between px-5 z-20 shrink-0">
          <div className="flex items-center gap-4 text-[#DEDCDC]/50">
            <span className="text-xs font-bold uppercase tracking-wider text-[#989DAA] font-display">Timeline Tracks</span>
            <div className="h-4 w-px bg-[#57707A]/40"></div>
            <button onClick={deleteSelected} disabled={!selectedElement} className="p-1.5 hover:bg-[#57707A]/30 rounded-lg text-red-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" title="Delete Selected Clip"><Trash2 className="w-4 h-4" /></button>
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
                    <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "video")} style={{ left: `${clip.timelineStart * PIXELS_PER_SECOND}px`, width: `${(clip.trimEnd - clip.trimStart) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-11 bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === clip.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
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
                    <div key={layer.id} onMouseDown={(e) => onClipMouseDown(e, layer.id, "text")} style={{ left: `${layer.timelineStart * PIXELS_PER_SECOND}px`, width: `${(layer.trimEnd - layer.trimStart) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-9 bg-[#DEDCDC]/10 border border-[#DEDCDC]/50 rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === layer.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
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
                    <div key={clip.id} onMouseDown={(e) => onClipMouseDown(e, clip.id, "audio")} style={{ left: `${clip.timelineStart * PIXELS_PER_SECOND}px`, width: `${(clip.trimEnd - clip.trimStart) * PIXELS_PER_SECOND}px` }} className={cn("absolute top-1.5 h-11 bg-[#B3FF00]/20 border border-[#B3FF00] rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing backdrop-blur-md", selectedElement?.id === clip.id ? "ring-2 ring-white z-10 shadow-lg brightness-110" : "")}>
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