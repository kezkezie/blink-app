"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  Scissors,
  Copy,
  Trash2,
  Plus,
  Video,
  Type,
  Music,
  Image as ImageIcon,
  UploadCloud,
  Settings,
  Download,
  ZoomIn,
  ZoomOut,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";

// ─── Types ───
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
}

// ✨ Text layers now have timeline properties!
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
}

export function VideoEditorUI() {
  const { clientId } = useClient();

  // ─── STATE ───
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "text">("assets");
  const [isLoadingDB, setIsLoadingDB] = useState(false);

  // Timeline Zoom & Playhead
  const [zoom, setZoom] = useState(2);
  const [globalTime, setGlobalTime] = useState(0);
  const PIXELS_PER_SECOND = 10 * zoom;

  // Media Arrays
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [videoClips, setVideoClips] = useState<TrackClip[]>([]);
  const [audioClips, setAudioClips] = useState<TrackClip[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);

  const [selectedElement, setSelectedElement] = useState<{
    id: string;
    type: "text" | "video" | "audio";
  } | null>(null);

  // Active Playback State
  const [activeClip, setActiveClip] = useState<TrackClip | null>(null);
  const [activeAudioClip, setActiveAudioClip] = useState<TrackClip | null>(
    null
  );

  // Drag states for visual feedback
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isAudioHovered, setIsAudioHovered] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag Math Refs
  const dragTextRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);
  const trimRef = useRef<{
    id: string;
    type: "video" | "audio" | "text";
    edge: "start" | "end";
    startMouseX: number;
    initTrim: number;
    initTimeline: number;
  } | null>(null);
  const clipDragRef = useRef<{
    id: string;
    type: "video" | "audio" | "text";
    startMouseX: number;
    initTimelineStart: number;
  } | null>(null);

  // ─── 1. SUPABASE FETCH ───
  useEffect(() => {
    if (!clientId) return;
    async function loadDatabaseContent() {
      setIsLoadingDB(true);
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (data) {
        const dbAssets: MediaAsset[] = [];
        data.forEach((item) => {
          if (item.image_urls && Array.isArray(item.image_urls)) {
            item.image_urls.forEach((url: string, idx: number) => {
              const isVid =
                url.includes(".mp4") ||
                url.includes(".mov") ||
                item.ai_model === "veo-3-1" ||
                item.ai_model === "sora-2-image-to-video";
              dbAssets.push({
                id: `db-${item.id}-${idx}`,
                type: isVid ? "video" : "image",
                url: url,
                thumb: url,
                name: `${item.content_type || "Generated"} Media`,
              });
            });
          }
        });
        setAssets(dbAssets);
      }
      setIsLoadingDB(false);
    }
    loadDatabaseContent();
  }, [clientId]);

  // ─── 2. SMOOTH PLAYBACK ENGINE ───
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    function updatePlayhead(time: number) {
      if (isPlaying) {
        const deltaSeconds = (time - lastTime) / 1000;
        lastTime = time;

        setGlobalTime((prev) => {
          const nextTime = prev + deltaSeconds;
          const maxVideo =
            videoClips.length > 0
              ? Math.max(
                  ...videoClips.map(
                    (c) => c.timelineStart + (c.trimEnd - c.trimStart)
                  )
                )
              : 0;
          const maxAudio =
            audioClips.length > 0
              ? Math.max(
                  ...audioClips.map(
                    (c) => c.timelineStart + (c.trimEnd - c.trimStart)
                  )
                )
              : 0;
          const maxText =
            textLayers.length > 0
              ? Math.max(
                  ...textLayers.map(
                    (c) => c.timelineStart + (c.trimEnd - c.trimStart)
                  )
                )
              : 0;
          const maxTime = Math.max(maxVideo, maxAudio, maxText, 5); // Minimum 5s loop

          if (nextTime >= maxTime) {
            setIsPlaying(false);
            return maxTime;
          }
          return nextTime;
        });
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    }

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, videoClips, audioClips, textLayers]);

  // Sync Video & Audio Elements to globalTime
  useEffect(() => {
    // 1. Video Sync
    const currentVid = videoClips.find(
      (c) =>
        globalTime >= c.timelineStart &&
        globalTime < c.timelineStart + (c.trimEnd - c.trimStart)
    );
    setActiveClip(currentVid || null);

    if (currentVid && currentVid.type === "video") {
      if (videoRef.current) {
        const expectedTime =
          currentVid.trimStart + (globalTime - currentVid.timelineStart);
        if (Math.abs(videoRef.current.currentTime - expectedTime) > 0.25)
          videoRef.current.currentTime = expectedTime;
        if (isPlaying && videoRef.current.paused)
          videoRef.current.play().catch(() => {});
      }
    } else {
      if (videoRef.current) videoRef.current.pause();
    }

    // 2. ✨ Audio Sync
    const currentAud = audioClips.find(
      (c) =>
        globalTime >= c.timelineStart &&
        globalTime < c.timelineStart + (c.trimEnd - c.trimStart)
    );
    setActiveAudioClip(currentAud || null);

    if (currentAud) {
      if (audioRef.current) {
        const expectedTime =
          currentAud.trimStart + (globalTime - currentAud.timelineStart);
        if (Math.abs(audioRef.current.currentTime - expectedTime) > 0.25)
          audioRef.current.currentTime = expectedTime;
        if (isPlaying && audioRef.current.paused)
          audioRef.current.play().catch(() => {});
      }
    } else {
      if (audioRef.current) audioRef.current.pause();
    }
  }, [globalTime, videoClips, audioClips, isPlaying]);

  // ✨ Robust Pause/Play Handler
  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      videoRef.current?.pause();
      audioRef.current?.pause();
    } else {
      setIsPlaying(true);
    }
  }

  // ─── 3. LIBRARY & DRAG/DROP ───
  function handleDragStart(e: React.DragEvent, asset: MediaAsset) {
    e.dataTransfer.setData("application/json", JSON.stringify(asset));
  }

  function deleteAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isAudio = file.type.includes("audio");
    const isVideo = file.type.includes("video");
    const trackType = isAudio ? "audio" : isVideo ? "video" : "image";
    processDroppedFile(file, trackType, globalTime);
  }

  function processDroppedFile(
    file: File,
    trackType: "video" | "audio" | "image",
    dropTime: number
  ) {
    const url = URL.createObjectURL(file);
    const newAssetId = crypto.randomUUID();
    const newAsset: MediaAsset = {
      id: newAssetId,
      type: trackType,
      url,
      thumb: url,
      name: file.name,
      duration: 10,
    };
    setAssets((prev) => [newAsset, ...prev]);
    addClipToTimeline(
      newAsset,
      trackType === "audio" ? "audio" : "video",
      dropTime
    );
  }

  function addClipToTimeline(
    asset: MediaAsset,
    trackType: "video" | "audio",
    dropTime: number
  ) {
    const clips = trackType === "video" ? videoClips : audioClips;
    let start = dropTime;
    if (dropTime < 1 && clips.length > 0) {
      const lastClip = clips[clips.length - 1];
      start = lastClip.timelineStart + (lastClip.trimEnd - lastClip.trimStart);
    }

    const defaultDuration = asset.type === "image" ? 5 : asset.duration || 10;

    const newClip: TrackClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      url: asset.url,
      type: asset.type as any,
      name: asset.name,
      timelineStart: start,
      trimStart: 0,
      trimEnd: defaultDuration,
      maxDuration: defaultDuration,
    };
    if (trackType === "video") setVideoClips([...videoClips, newClip]);
    else setAudioClips([...audioClips, newClip]);
  }

  function handleDropOnTrack(e: React.DragEvent, trackType: "video" | "audio") {
    e.preventDefault();
    setIsVideoHovered(false);
    setIsAudioHovered(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX =
      e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const dropTime = Math.max(0, dropX / PIXELS_PER_SECOND);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isAudio = file.type.includes("audio");
      const isVideo = file.type.includes("video");
      const droppedTrackType = isAudio ? "audio" : isVideo ? "video" : "image";
      processDroppedFile(file, droppedTrackType, dropTime);
      return;
    }

    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const asset = JSON.parse(data) as MediaAsset;

    const isValid =
      trackType === "video"
        ? asset.type === "video" || asset.type === "image"
        : asset.type === "audio";
    if (!isValid)
      return alert(
        `Please drop a ${
          trackType === "video" ? "video or image" : "audio"
        } file here.`
      );

    addClipToTimeline(asset, trackType, dropTime);
  }

  function handleLoadedMetadata(
    id: string,
    duration: number,
    type: "video" | "audio"
  ) {
    if (isNaN(duration) || duration === Infinity) duration = 10;
    if (type === "video") {
      setVideoClips((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                maxDuration: duration,
                trimEnd: Math.min(c.trimEnd, duration),
              }
            : c
        )
      );
    } else {
      setAudioClips((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                maxDuration: duration,
                trimEnd: Math.min(c.trimEnd, duration),
              }
            : c
        )
      );
    }
  }

  // ─── 4. TIMELINE INTERACTIONS ───
  function handleTimelineScrub(e: React.MouseEvent) {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const exactDropX = clickX - 128; // Adjust for sticky header
    if (exactDropX >= 0) setGlobalTime(exactDropX / PIXELS_PER_SECOND);
  }

  function onTrimMouseDown(
    e: React.MouseEvent,
    id: string,
    type: "video" | "audio" | "text",
    edge: "start" | "end"
  ) {
    e.preventDefault();
    e.stopPropagation();
    let clip: any =
      type === "video"
        ? videoClips.find((c) => c.id === id)
        : type === "audio"
        ? audioClips.find((c) => c.id === id)
        : textLayers.find((c) => c.id === id);
    if (!clip) return;
    trimRef.current = {
      id,
      type,
      edge,
      startMouseX: e.clientX,
      initTrim: edge === "start" ? clip.trimStart : clip.trimEnd,
      initTimeline: clip.timelineStart,
    };
    setSelectedElement({ id, type });
  }

  function onClipMouseDown(
    e: React.MouseEvent,
    id: string,
    type: "video" | "audio" | "text"
  ) {
    e.stopPropagation();
    let clip: any =
      type === "video"
        ? videoClips.find((c) => c.id === id)
        : type === "audio"
        ? audioClips.find((c) => c.id === id)
        : textLayers.find((c) => c.id === id);
    if (!clip) return;
    clipDragRef.current = {
      id,
      type,
      startMouseX: e.clientX,
      initTimelineStart: clip.timelineStart,
    };
    setSelectedElement({ id, type });
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragTextRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const dx =
          ((e.clientX - dragTextRef.current.startX) / rect.width) * 100;
        const dy =
          ((e.clientY - dragTextRef.current.startY) / rect.height) * 100;
        const newX = Math.min(95, Math.max(5, dragTextRef.current.initX + dx));
        const newY = Math.min(95, Math.max(5, dragTextRef.current.initY + dy));
        setTextLayers((prev) =>
          prev.map((l) =>
            l.id === dragTextRef.current!.id ? { ...l, x: newX, y: newY } : l
          )
        );
      }

      if (trimRef.current) {
        const { id, type, edge, startMouseX, initTrim, initTimeline } =
          trimRef.current;
        const deltaSeconds = (e.clientX - startMouseX) / PIXELS_PER_SECOND;

        let setClips: any =
          type === "video"
            ? setVideoClips
            : type === "audio"
            ? setAudioClips
            : setTextLayers;
        setClips((prev: any[]) =>
          prev.map((clip: any) => {
            if (clip.id !== id) return clip;
            let newClip = { ...clip };
            if (edge === "start") {
              const newTrim = Math.max(
                0,
                Math.min(initTrim + deltaSeconds, clip.trimEnd - 0.5)
              );
              newClip.trimStart = newTrim;
              newClip.timelineStart = initTimeline + (newTrim - initTrim);
            } else {
              newClip.trimEnd = Math.max(
                clip.trimStart + 0.5,
                Math.min(clip.maxDuration, initTrim + deltaSeconds)
              );
            }
            return newClip;
          })
        );
      }

      if (clipDragRef.current) {
        const { id, type, startMouseX, initTimelineStart } =
          clipDragRef.current;
        const deltaSeconds = (e.clientX - startMouseX) / PIXELS_PER_SECOND;
        const newTimelineStart = Math.max(0, initTimelineStart + deltaSeconds);

        let setClips: any =
          type === "video"
            ? setVideoClips
            : type === "audio"
            ? setAudioClips
            : setTextLayers;
        setClips((prev: any[]) =>
          prev.map((clip: any) =>
            clip.id === id ? { ...clip, timelineStart: newTimelineStart } : clip
          )
        );
      }
    }

    function onMouseUp() {
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
  }, [PIXELS_PER_SECOND]);

  function addTextLayer() {
    const id = crypto.randomUUID();
    setTextLayers([
      ...textLayers,
      {
        id,
        text: "New Text",
        x: 50,
        y: 50,
        fontSize: 48,
        color: "#FFFFFF",
        timelineStart: globalTime,
        trimStart: 0,
        trimEnd: 5,
        maxDuration: 3600,
      },
    ]);
    setSelectedElement({ id, type: "text" });
    setActiveTab("text");
  }

  function deleteSelected() {
    if (!selectedElement) return;
    if (selectedElement.type === "text")
      setTextLayers((prev) => prev.filter((l) => l.id !== selectedElement.id));
    if (selectedElement.type === "video")
      setVideoClips((prev) => prev.filter((c) => c.id !== selectedElement.id));
    if (selectedElement.type === "audio")
      setAudioClips((prev) => prev.filter((c) => c.id !== selectedElement.id));
    setSelectedElement(null);
  }

  // ─── RULER MATH ───
  const contentMax =
    Math.max(
      30,
      ...videoClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)),
      ...audioClips.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)),
      ...textLayers.map((c) => c.timelineStart + (c.trimEnd - c.trimStart)),
      globalTime
    ) + 60;
  const maxVisibleTime = Math.min(contentMax, 3600);

  let rulerStep = 1;
  if (zoom < 5) rulerStep = 5;
  if (zoom < 1) rulerStep = 30;
  if (zoom < 0.2) rulerStep = 60;

  return (
    <div className="flex flex-col h-[800px] bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm select-none">
      {/* ─── TOP WORKSPACE ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("assets")}
              className={cn(
                "flex-1 py-3 text-xs font-bold uppercase tracking-wider",
                activeTab === "assets"
                  ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50/50"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              Media
            </button>
            <button
              onClick={() => setActiveTab("text")}
              className={cn(
                "flex-1 py-3 text-xs font-bold uppercase tracking-wider",
                activeTab === "text"
                  ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50/50"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              Text
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {activeTab === "assets" && (
              <div className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="video/*,image/*,audio/*"
                  onChange={handleManualUpload}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full border-dashed border-2 border-purple-200 text-purple-600 hover:bg-purple-50 h-12"
                >
                  <UploadCloud className="w-4 h-4 mr-2" /> Upload File
                </Button>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-gray-400 uppercase">
                      Your Library
                    </p>
                    {isLoadingDB && (
                      <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {assets.map((asset) => (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, asset)}
                        className="group relative aspect-square bg-black rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 ring-purple-500 transition-all border border-gray-200"
                      >
                        {asset.type === "video" ? (
                          <video
                            src={asset.url}
                            className="w-full h-full object-cover opacity-80"
                          />
                        ) : (
                          <img
                            src={asset.thumb}
                            alt="Asset"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-white p-1 rounded">
                          {asset.type === "video" ? (
                            <Video className="w-3 h-3" />
                          ) : asset.type === "audio" ? (
                            <Music className="w-3 h-3" />
                          ) : (
                            <ImageIcon className="w-3 h-3" />
                          )}
                        </div>
                        <button
                          onClick={() => deleteAsset(asset.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity shadow-sm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "text" && (
              <div className="space-y-3">
                <Button
                  onClick={addTextLayer}
                  className="w-full bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 justify-start font-bold text-lg h-14"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Text Layer
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL */}
        <div
          className="flex-1 bg-gray-100 flex flex-col relative"
          onClick={() => setSelectedElement(null)}
        >
          <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
            <span className="text-sm font-semibold text-gray-600">
              Preview Canvas
            </span>
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
            >
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>

          <div className="flex-1 overflow-hidden p-6 flex items-center justify-center bg-dot-pattern">
            <div
              ref={canvasRef}
              className="relative w-full max-w-3xl aspect-video bg-black rounded-lg shadow-2xl overflow-hidden ring-1 ring-white/10"
            >
              {/* Invisible Audio Player for active track */}
              {activeAudioClip && (
                <audio ref={audioRef} src={activeAudioClip.url} />
              )}

              {activeClip ? (
                activeClip.type === "image" ? (
                  <img
                    src={activeClip.url}
                    className="w-full h-full object-contain"
                    alt="Preview"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={activeClip.url}
                    className="w-full h-full object-contain"
                  />
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <Video className="w-12 h-12 mb-2 opacity-30" />
                  <p>Drag a video or image to the timeline below</p>
                </div>
              )}

              {/* Hidden Loaders for Safely Grabbing Metadata */}
              <div className="hidden">
                {videoClips
                  .filter((c) => c.type === "video")
                  .map((clip) => (
                    <video
                      key={clip.id}
                      src={clip.url}
                      preload="metadata"
                      onLoadedMetadata={(e) =>
                        handleLoadedMetadata(
                          clip.id,
                          e.currentTarget.duration,
                          "video"
                        )
                      }
                    />
                  ))}
                {audioClips.map((clip) => (
                  <audio
                    key={clip.id}
                    src={clip.url}
                    preload="metadata"
                    onLoadedMetadata={(e) =>
                      handleLoadedMetadata(
                        clip.id,
                        e.currentTarget.duration,
                        "audio"
                      )
                    }
                  />
                ))}
              </div>

              {/* Render Text Layers ONLY if they overlap the current globalTime */}
              {textLayers.map((layer) => {
                const isVisible =
                  globalTime >= layer.timelineStart &&
                  globalTime <
                    layer.timelineStart + (layer.trimEnd - layer.trimStart);
                if (!isVisible) return null;

                return (
                  <div
                    key={layer.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedElement({ id: layer.id, type: "text" });
                      dragTextRef.current = {
                        id: layer.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initX: layer.x,
                        initY: layer.y,
                      };
                    }}
                    style={{
                      top: `${layer.y}%`,
                      left: `${layer.x}%`,
                      color: layer.color,
                      fontSize: `${layer.fontSize}px`,
                    }}
                    className={cn(
                      "absolute transform -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] cursor-grab active:cursor-grabbing px-2 py-1 rounded",
                      selectedElement?.id === layer.id
                        ? "ring-2 ring-purple-500 ring-dashed bg-purple-500/20"
                        : ""
                    )}
                  >
                    {layer.text}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="h-14 bg-white border-t border-gray-200 flex items-center justify-center gap-4 shrink-0">
            <span className="text-xs font-mono w-16 text-right text-gray-500">
              {globalTime.toFixed(1)}s
            </span>
            <button
              onClick={() => setGlobalTime(0)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              className="p-3 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-full transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <span className="text-xs font-mono w-16 text-gray-500">
              {maxVisibleTime}s MAX
            </span>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="font-bold text-sm text-gray-700">Properties</span>
          </div>
          {selectedElement?.type === "text" ? (
            (() => {
              const layer = textLayers.find((l) => l.id === selectedElement.id);
              if (!layer) return null;
              return (
                <div className="p-4 space-y-5">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">
                      Text Content
                    </label>
                    <textarea
                      value={layer.text}
                      onChange={(e) =>
                        setTextLayers((prev) =>
                          prev.map((l) =>
                            l.id === layer.id
                              ? { ...l, text: e.target.value }
                              : l
                          )
                        )
                      }
                      className="w-full mt-1.5 p-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 ring-purple-400 outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">
                      Font Size
                    </label>
                    <input
                      type="range"
                      value={layer.fontSize}
                      onChange={(e) =>
                        setTextLayers((prev) =>
                          prev.map((l) =>
                            l.id === layer.id
                              ? { ...l, fontSize: parseInt(e.target.value) }
                              : l
                          )
                        )
                      }
                      className="w-full mt-2 accent-purple-600"
                      min="12"
                      max="120"
                    />
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <p className="text-sm text-gray-400">
                Select text or a clip to edit properties.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── BOTTOM WORKSPACE (Timeline) ─── */}
      <div className="h-72 bg-white border-t border-gray-300 flex flex-col z-0">
        <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 z-20">
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-xs font-semibold uppercase text-gray-400 mr-4">
              Timeline Tracks
            </span>
            <button
              onClick={deleteSelected}
              disabled={!selectedElement}
              className="p-1.5 hover:bg-gray-200 rounded text-red-500 disabled:opacity-30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-32 accent-purple-500 h-1"
            />
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="w-32 flex-shrink-0 bg-white border-r border-gray-200 z-30 absolute left-0 top-0 bottom-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
            <div className="h-6 border-b border-gray-200 bg-gray-50"></div>
            <div className="h-14 border-b border-gray-100 flex items-center px-3 gap-2 text-gray-600 bg-blue-50/30">
              <Video className="w-4 h-4" />{" "}
              <span className="text-xs font-semibold">Video</span>
            </div>
            <div className="h-12 border-b border-gray-100 flex items-center px-3 gap-2 text-gray-600 bg-purple-50/30">
              <Type className="w-4 h-4" />{" "}
              <span className="text-xs font-semibold">Text</span>
            </div>
            <div className="h-14 border-b border-gray-100 flex items-center px-3 gap-2 text-gray-600 bg-green-50/30">
              <Music className="w-4 h-4" />{" "}
              <span className="text-xs font-semibold">Audio</span>
            </div>
          </div>

          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto relative bg-gray-50/50 pl-32"
            onClick={handleTimelineScrub}
          >
            <div
              style={{
                width: `${maxVisibleTime * PIXELS_PER_SECOND}px`,
                minWidth: "100%",
                height: "100%",
                position: "relative",
              }}
            >
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${globalTime * PIXELS_PER_SECOND}px` }}
              >
                <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-sm"></div>
              </div>

              <div className="h-6 border-b border-gray-200 bg-white relative overflow-hidden pointer-events-none">
                {Array.from({
                  length: Math.ceil(maxVisibleTime / rulerStep),
                }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute text-[9px] text-gray-400 border-l border-gray-300 pl-1"
                    style={{
                      left: `${i * rulerStep * PIXELS_PER_SECOND}px`,
                      bottom: 0,
                      height: "12px",
                    }}
                  >
                    {i * rulerStep}s
                  </div>
                ))}
              </div>

              {/* VIDEO TRACK */}
              <div
                className={cn(
                  "h-14 border-b border-gray-200/50 relative py-1.5 transition-all",
                  isVideoHovered
                    ? "bg-blue-100 ring-2 ring-inset ring-blue-400"
                    : ""
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsVideoHovered(true);
                }}
                onDragLeave={() => setIsVideoHovered(false)}
                onDrop={(e) => handleDropOnTrack(e, "video")}
              >
                {videoClips.map((clip) => (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => onClipMouseDown(e, clip.id, "video")}
                    style={{
                      left: `${clip.timelineStart * PIXELS_PER_SECOND}px`,
                      width: `${
                        (clip.trimEnd - clip.trimStart) * PIXELS_PER_SECOND
                      }px`,
                    }}
                    className={cn(
                      "absolute top-1.5 h-11 bg-blue-200 border border-blue-400 rounded flex items-center overflow-hidden cursor-grab active:cursor-grabbing",
                      selectedElement?.id === clip.id
                        ? "ring-2 ring-blue-600 z-10"
                        : ""
                    )}
                  >
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, clip.id, "video", "start")
                      }
                      className="w-2 h-full bg-blue-500 cursor-ew-resize shrink-0 hover:bg-blue-600"
                    />
                    <span className="text-xs font-semibold text-blue-800 px-2 truncate flex-1 pointer-events-none">
                      {clip.name}
                    </span>
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, clip.id, "video", "end")
                      }
                      className="w-2 h-full bg-blue-500 cursor-ew-resize shrink-0 hover:bg-blue-600"
                    />
                  </div>
                ))}
              </div>

              {/* TEXT TRACK */}
              <div className="h-12 border-b border-gray-200/50 relative py-1.5">
                {textLayers.map((layer) => (
                  <div
                    key={layer.id}
                    onMouseDown={(e) => onClipMouseDown(e, layer.id, "text")}
                    style={{
                      left: `${layer.timelineStart * PIXELS_PER_SECOND}px`,
                      width: `${
                        (layer.trimEnd - layer.trimStart) * PIXELS_PER_SECOND
                      }px`,
                    }}
                    className={cn(
                      "absolute top-1.5 h-9 bg-purple-200 border border-purple-400 rounded flex items-center overflow-hidden cursor-grab active:cursor-grabbing",
                      selectedElement?.id === layer.id
                        ? "ring-2 ring-purple-600 z-10"
                        : ""
                    )}
                  >
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, layer.id, "text", "start")
                      }
                      className="w-2 h-full bg-purple-500 cursor-ew-resize shrink-0 hover:bg-purple-600"
                    />
                    <Type className="w-3 h-3 text-purple-700 mx-2 shrink-0 pointer-events-none" />
                    <span className="text-xs font-semibold text-purple-900 truncate flex-1 pointer-events-none">
                      {layer.text}
                    </span>
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, layer.id, "text", "end")
                      }
                      className="w-2 h-full bg-purple-500 cursor-ew-resize shrink-0 hover:bg-purple-600"
                    />
                  </div>
                ))}
              </div>

              {/* AUDIO TRACK */}
              <div
                className={cn(
                  "h-14 border-b border-gray-200/50 relative py-1.5 transition-all",
                  isAudioHovered
                    ? "bg-green-100 ring-2 ring-inset ring-green-400"
                    : ""
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsAudioHovered(true);
                }}
                onDragLeave={() => setIsAudioHovered(false)}
                onDrop={(e) => handleDropOnTrack(e, "audio")}
              >
                {audioClips.map((clip) => (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => onClipMouseDown(e, clip.id, "audio")}
                    style={{
                      left: `${clip.timelineStart * PIXELS_PER_SECOND}px`,
                      width: `${
                        (clip.trimEnd - clip.trimStart) * PIXELS_PER_SECOND
                      }px`,
                    }}
                    className={cn(
                      "absolute top-1.5 h-11 bg-green-200 border border-green-400 rounded flex items-center overflow-hidden cursor-grab active:cursor-grabbing",
                      selectedElement?.id === clip.id
                        ? "ring-2 ring-green-600 z-10"
                        : ""
                    )}
                  >
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, clip.id, "audio", "start")
                      }
                      className="w-2 h-full bg-green-500 cursor-ew-resize shrink-0 hover:bg-green-600"
                    />
                    <Music className="w-3 h-3 text-green-700 mx-2 shrink-0 pointer-events-none" />
                    <span className="text-xs font-semibold text-green-800 truncate flex-1 pointer-events-none">
                      {clip.name}
                    </span>
                    <div
                      onMouseDown={(e) =>
                        onTrimMouseDown(e, clip.id, "audio", "end")
                      }
                      className="w-2 h-full bg-green-500 cursor-ew-resize shrink-0 hover:bg-green-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
