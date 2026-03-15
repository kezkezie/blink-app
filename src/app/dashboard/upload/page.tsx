"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Image as ImageIcon,
  Video,
  Sparkles,
  Loader2,
  Paintbrush,
  MoveRight,
  Eraser,
  Undo2,
  Play,
  ScrollText,
  Activity,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { cn } from "@/lib/utils";

type ToolMode = "brush" | "eraser" | "arrow";
// ✨ ADDED: Third tab for Motion Transfer
type ActiveTab = "caption" | "animate" | "motion_transfer";

export default function YourContentPage() {
  const router = useRouter();
  const { clientId } = useClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null); // ✨ NEW: Ref for the driving video

  // Main File States
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [mediaContext, setMediaContext] = useState("");

  // ✨ NEW: Reference Video States for Motion Transfer
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("caption");

  // MOTION BRUSH STATES
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushSize, setBrushSize] = useState(30);

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });
  const [arrowStart, setArrowStart] = useState<{ x: number, y: number } | null>(null);
  const [arrowVector, setArrowVector] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

  // Initialize Canvases for Motion Brush
  useEffect(() => {
    if (activeTab === 'animate' && preview && !isVideo) {
      const img = new Image();
      img.onload = () => {
        if (containerRef.current) {
          const container = containerRef.current;
          const ratio = Math.min(container.clientWidth / img.width, container.clientHeight / img.height);
          const drawW = img.width * ratio;
          const drawH = img.height * ratio;
          setImageDims({ w: drawW, h: drawH });
        }
      };
      img.src = preview;
    }
  }, [activeTab, preview, isVideo]);

  // Handle Draw Events (Motion Brush)
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (toolMode === 'arrow') {
      const coords = getCoordinates(e, uiCanvasRef.current!);
      setArrowStart(coords);
      return;
    }

    setIsDrawing(true);
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = toolMode === 'eraser' ? 'rgba(0,0,0,1)' : 'rgba(255, 0, 0, 0.4)';
    ctx.globalCompositeOperation = toolMode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (toolMode === 'arrow' && arrowStart) {
      const canvas = uiCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const coords = getCoordinates(e, canvas);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawArrow(ctx, arrowStart.x, arrowStart.y, coords.x, coords.y);
      return;
    }

    if (!isDrawing) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (toolMode === 'arrow' && arrowStart) {
      const coords = getCoordinates(e, uiCanvasRef.current!);
      setArrowVector({ startX: arrowStart.x, startY: arrowStart.y, endX: coords.x, endY: coords.y });
      setArrowStart(null);
      return;
    }
    setIsDrawing(false);
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number) => {
    const headlen = 15;
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;

    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();

    ctx.shadowBlur = 0;
  };

  const clearCanvas = () => {
    const mCtx = maskCanvasRef.current?.getContext('2d');
    const uiCtx = uiCanvasRef.current?.getContext('2d');
    if (mCtx && maskCanvasRef.current) mCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    if (uiCtx && uiCanvasRef.current) uiCtx.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
    setArrowVector(null);
  };


  // Main File Upload Handlers
  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setIsVideo(selectedFile.type.startsWith("video"));
      clearCanvas();
      setReferenceVideoFile(null);
      setReferenceVideoPreview(null);
    }
  };

  // ✨ NEW: Reference Video Upload Handlers (For Motion Transfer)
  const handleRefVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) handleRefVideoSelect(e.dataTransfer.files[0]);
  };

  const handleRefVideoSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.type.startsWith("video")) {
      setReferenceVideoFile(selectedFile);
      setReferenceVideoPreview(URL.createObjectURL(selectedFile));
    } else {
      alert("Please upload a valid video file for motion reference.");
    }
  };

  // --- REGULAR CAPTION ANALYSIS ---
  const handleAnalyze = async () => {
    if (!file || !clientId) return;
    setIsProcessing(true);
    try {
      setLoadingText("Uploading media securely...");
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `uploads/${clientId}/${fileName}`;

      await supabase.storage.from("assets").upload(filePath, file);
      const publicUrl = supabase.storage.from("assets").getPublicUrl(filePath).data.publicUrl;

      setLoadingText("Fetching Brand DNA...");
      const { data: brand } = await supabase.from("brand_profiles").select("brand_voice, dos, donts").eq("client_id", clientId).single();

      setLoadingText("AI is writing the perfect caption...");
      const aiRes = await fetch("/api/content/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl: publicUrl, mediaType: file.type, brandVoice: brand?.brand_voice, dos: brand?.dos, donts: brand?.donts, context: mediaContext }),
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiData.error || "Failed AI Request");

      setLoadingText("Saving to drafts...");
      const { error: dbError } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: file.type.startsWith("video") ? "video" : "post_image",
        image_urls: [publicUrl],
        caption: aiData.caption_long || aiData.caption || "",
        caption_short: aiData.caption_short || "",
        hashtags: aiData.hashtags || "",
        call_to_action: aiData.call_to_action || "",
        status: "draft",
        ai_model: "gpt-4o",
      });

      if (dbError) throw dbError;
      router.push("/dashboard/content");
    } catch (error) {
      alert("Something went wrong during analysis.");
      setIsProcessing(false);
    }
  };

  // --- MOTION BRUSH ANIMATION TRIGGER ---
  const handleMotionBrush = async () => {
    if (!file || !clientId || !maskCanvasRef.current) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = maskCanvasRef.current.width;
    tempCanvas.height = maskCanvasRef.current.height;
    const tCtx = tempCanvas.getContext('2d')!;

    tCtx.fillStyle = 'black';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tCtx.globalCompositeOperation = 'source-over';
    tCtx.drawImage(maskCanvasRef.current, 0, 0);

    const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      }
    }
    tCtx.putImageData(imgData, 0, 0);

    const maskDataUrl = tempCanvas.toDataURL('image/png');

    let direction = "auto";
    if (arrowVector) {
      const dx = arrowVector.endX - arrowVector.startX;
      const dy = arrowVector.endY - arrowVector.startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx > 0 ? "right" : "left";
      } else {
        direction = dy > 0 ? "down" : "up";
      }
    }

    setIsProcessing(true);
    setLoadingText("Sending Motion Instructions to AI...");

    try {
      const origPath = `videos/${clientId}/motion_orig_${Date.now()}.jpg`;
      await supabase.storage.from("assets").upload(origPath, file);
      const origUrl = supabase.storage.from("assets").getPublicUrl(origPath).data.publicUrl;

      const maskBlob = await fetch(maskDataUrl).then(r => r.blob());
      const maskPath = `videos/${clientId}/motion_mask_${Date.now()}.png`;
      await supabase.storage.from("assets").upload(maskPath, maskBlob);
      const maskUrl = supabase.storage.from("assets").getPublicUrl(maskPath).data.publicUrl;

      const { data: dbData, error: dbError } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: "sequence_clip",
        caption: `🎬 Animated Motion Video`,
        status: "draft",
        image_urls: [origUrl],
        ai_model: "kling-3.0/video",
      }).select('id').single();

      if (dbError) throw dbError;

      const n8nRes = await fetch("/api/video/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scene_video_generator",
          post_id: dbData.id,
          client_id: clientId,
          primary_image_url: origUrl,
          motion_mask_url: maskUrl,
          motion_direction: direction,
          user_prompt: mediaContext || "Cinematic animated motion.",
          duration: "5",
          video_mode: "motion_brush",
          ai_model_override: "kling-3.0/video"
        })
      });

      if (!n8nRes.ok) throw new Error("Failed to trigger video generation");
      router.push(`/dashboard/content/${dbData.id}`);

    } catch (err: any) {
      alert(`Motion generation failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // --- ✨ NEW: MOTION TRANSFER ANIMATION TRIGGER ---
  const handleMotionTransfer = async () => {
    if (!file || !referenceVideoFile || !clientId) return;

    setIsProcessing(true);
    setLoadingText("Uploading Base Image & Driving Video...");

    try {
      // 1. Upload the base image
      const imgPath = `videos/${clientId}/pose_base_${Date.now()}.${file.name.split(".").pop()}`;
      await supabase.storage.from("assets").upload(imgPath, file);
      const imgUrl = supabase.storage.from("assets").getPublicUrl(imgPath).data.publicUrl;

      // 2. Upload the driving video
      const vidPath = `videos/${clientId}/pose_drive_${Date.now()}.${referenceVideoFile.name.split(".").pop()}`;
      await supabase.storage.from("assets").upload(vidPath, referenceVideoFile);
      const vidUrl = supabase.storage.from("assets").getPublicUrl(vidPath).data.publicUrl;

      setLoadingText("Generating Motion Transfer...");

      // 3. Create Draft Post
      const { data: dbData, error: dbError } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: "sequence_clip",
        caption: `🕺 Motion Transfer Video`,
        status: "draft",
        image_urls: [imgUrl],
        ai_model: "kling-3.0/video",
      }).select('id').single();

      if (dbError) throw dbError;

      // 4. Trigger n8n Backend
      const n8nRes = await fetch("/api/video/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scene_video_generator",
          post_id: dbData.id,
          client_id: clientId,
          primary_image_url: imgUrl,           // The character to animate
          reference_video_url: vidUrl,         // The video providing the motion
          user_prompt: mediaContext || "Make the character follow the exact movements of the reference video.",
          duration: "10",
          video_mode: "motion_transfer",       // ✨ Specific mode flag for backend routing
          ai_model_override: "kling-3.0/video" // Kling/Viggle handles this perfectly
        })
      });

      if (!n8nRes.ok) throw new Error("Failed to trigger video generation");
      router.push(`/dashboard/content/${dbData.id}`);

    } catch (err: any) {
      alert(`Motion transfer failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    setIsVideo(false);
    setMediaContext("");
    clearCanvas();
    setReferenceVideoFile(null);
    setReferenceVideoPreview(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 pt-8 pb-20">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-blink-dark font-heading">
          Content Studio
        </h1>
        <p className="text-gray-500">
          Upload media to write captions, paint motion, or extract poses from videos.
        </p>
      </div>

      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        accept="image/*, video/mp4, video/quicktime"
        onChange={(e) => {
          if (e.target.files?.length) handleFileSelect(e.target.files[0]);
        }}
      />

      <input
        type="file"
        className="hidden"
        ref={refVideoInputRef}
        accept="video/mp4, video/quicktime"
        onChange={(e) => {
          if (e.target.files?.length) handleRefVideoSelect(e.target.files[0]);
        }}
      />

      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropFile}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-blink-primary/30 bg-white rounded-3xl p-20 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blink-primary/5 hover:border-blink-primary/50 transition-all duration-300 shadow-sm"
        >
          <div className="flex gap-4 mb-6">
            <div className="h-16 w-16 bg-blue-50 rounded-2xl shadow-sm flex items-center justify-center text-blue-500 -rotate-6 transform hover:rotate-0 transition-all border border-blue-100">
              <ImageIcon className="h-8 w-8" />
            </div>
            <div className="h-16 w-16 bg-purple-50 rounded-2xl shadow-sm flex items-center justify-center text-purple-500 rotate-6 transform hover:rotate-0 transition-all border border-purple-100">
              <Video className="h-8 w-8" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-blink-dark mb-2">
            Drag & drop your masterpiece here
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            Upload an image to animate it, or a video to write captions.
          </p>
          <Button className="bg-blink-dark text-white rounded-full px-8 h-12 shadow-md pointer-events-none">
            <UploadCloud className="mr-2 h-5 w-5" /> Browse Files
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-200">

          {/* MODE TABS (3 Tabs now) */}
          {!isVideo && (
            <div className="flex p-1 bg-gray-100 rounded-lg mb-6 mx-auto max-w-2xl overflow-x-auto">
              <button onClick={() => setActiveTab('caption')} className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4", activeTab === 'caption' ? "bg-white shadow-sm text-blink-dark" : "text-gray-500 hover:text-gray-700")}>
                <ScrollText className="w-4 h-4" /> AI Caption
              </button>
              <button onClick={() => setActiveTab('animate')} className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4", activeTab === 'animate' ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                <Sparkles className="w-4 h-4" /> Motion Brush
              </button>
              <button onClick={() => setActiveTab('motion_transfer')} className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4", activeTab === 'motion_transfer' ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                <Activity className="w-4 h-4" /> Motion Transfer
              </button>
            </div>
          )}

          {/* MEDIA VIEWER / CANVAS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">

            {/* Left: The Visuals */}
            <div className="md:col-span-2 relative w-full aspect-video bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 flex items-center justify-center" ref={containerRef}>

              {activeTab === 'animate' && !isVideo ? (
                /* IF ANIMATE MODE: Show Interactive Canvas Stack */
                <div
                  className="relative touch-none"
                  style={{ width: imageDims.w, height: imageDims.h }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <img src={preview!} className="absolute inset-0 w-full h-full pointer-events-none select-none" draggable={false} />

                  <canvas ref={maskCanvasRef} width={imageDims.w} height={imageDims.h} className="absolute inset-0 w-full h-full cursor-crosshair" />
                  <canvas ref={uiCanvasRef} width={imageDims.w} height={imageDims.h} className="absolute inset-0 w-full h-full pointer-events-none" />
                </div>
              ) : (
                /* IF CAPTION OR TRANSFER MODE: Standard preview */
                isVideo ? (
                  <video src={preview!} controls className="w-full h-full object-contain bg-black" />
                ) : (
                  <img src={preview!} alt="Upload preview" className="w-full h-full object-contain" />
                )
              )}

              {isProcessing && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-50 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl bg-purple-500/30 animate-pulse"></div>
                    <Loader2 className="h-12 w-12 animate-spin text-purple-600 relative z-10" />
                  </div>
                  <p className="font-bold text-purple-900 tracking-wider uppercase text-sm animate-pulse">{loadingText}</p>
                </div>
              )}
            </div>

            {/* Right: The Controls */}
            <div className="flex flex-col space-y-6 h-full">

              {/* ─── CAPTION MODE CONTROLS ─── */}
              {activeTab === 'caption' && (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-blink-dark mb-1">File Uploaded</h3>
                    <p className="font-medium text-gray-500 text-xs truncate w-full">{file?.name}</p>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Context (Optional)</label>
                    <Textarea
                      value={mediaContext}
                      onChange={(e) => setMediaContext(e.target.value)}
                      placeholder="e.g., Behind the scenes of our new product launch..."
                      className="text-sm resize-none h-32 bg-gray-50 border-gray-200"
                      disabled={isProcessing}
                    />
                    <p className="text-[10px] text-gray-400 mt-2 font-medium">Providing context helps the AI write much better captions.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button onClick={handleAnalyze} disabled={isProcessing} className="w-full bg-blink-primary text-white h-12 rounded-xl shadow-md font-bold">
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ScrollText className="mr-2 h-5 w-5" />} Write Caption
                    </Button>
                    <Button variant="ghost" disabled={isProcessing} onClick={handleCancel} className="w-full text-red-500 hover:bg-red-50 font-bold">
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {/* ─── MOTION BRUSH CONTROLS ─── */}
              {activeTab === 'animate' && (
                <div className="flex flex-col h-full gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-purple-600" /> Animation Tools</h3>
                    <p className="text-[10px] text-gray-500 font-medium">1. Paint over what you want to move. <br />2. Draw an arrow for direction.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-lg border border-gray-200">
                    <button onClick={() => setToolMode('brush')} className={cn("flex flex-col items-center justify-center p-2 rounded-md transition-all", toolMode === 'brush' ? "bg-white shadow-sm text-purple-600" : "text-gray-500 hover:text-gray-700")}>
                      <Paintbrush className="w-5 h-5 mb-1" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Paint</span>
                    </button>
                    <button onClick={() => setToolMode('arrow')} className={cn("flex flex-col items-center justify-center p-2 rounded-md transition-all", toolMode === 'arrow' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700")}>
                      <MoveRight className="w-5 h-5 mb-1" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Direction</span>
                    </button>
                    <button onClick={() => setToolMode('eraser')} className={cn("flex flex-col items-center justify-center p-2 rounded-md transition-all", toolMode === 'eraser' ? "bg-white shadow-sm text-red-600" : "text-gray-500 hover:text-gray-700")}>
                      <Eraser className="w-5 h-5 mb-1" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Erase</span>
                    </button>
                  </div>

                  {(toolMode === 'brush' || toolMode === 'eraser') && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center"><label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Brush Size</label><span className="text-xs font-bold text-gray-700">{brushSize}px</span></div>
                      <input type="range" min="5" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                    </div>
                  )}

                  {arrowVector && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1"><MoveRight className="w-3 h-3" /> Direction Set</span>
                      <button onClick={() => { setArrowVector(null); uiCanvasRef.current?.getContext('2d')?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height); }} className="text-[10px] text-red-500 hover:underline font-bold">Remove</button>
                    </div>
                  )}

                  <div className="flex-1 pt-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Prompt (Optional)</label>
                    <Textarea
                      value={mediaContext}
                      onChange={(e) => setMediaContext(e.target.value)}
                      placeholder="e.g., The water ripples softly..."
                      className="text-xs resize-none h-20 bg-gray-50 border-gray-200"
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="flex flex-col gap-2 mt-auto">
                    <Button onClick={clearCanvas} variant="outline" className="w-full border-gray-200 text-gray-600 h-9 text-xs font-bold"><Undo2 className="w-3.5 h-3.5 mr-2" /> Reset Canvas</Button>
                    <Button onClick={handleMotionBrush} disabled={isProcessing} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white h-12 rounded-xl shadow-lg shadow-purple-500/20 font-bold text-sm">
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />} Animate Motion
                    </Button>
                    <Button variant="ghost" disabled={isProcessing} onClick={handleCancel} className="w-full text-red-500 hover:bg-red-50 font-bold h-9">Cancel</Button>
                  </div>
                </div>
              )}

              {/* ─── ✨ NEW: MOTION TRANSFER CONTROLS ─── */}
              {activeTab === 'motion_transfer' && (
                <div className="flex flex-col h-full gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-1"><Activity className="w-4 h-4 text-blue-600" /> Reference Motion</h3>
                    <p className="text-[10px] text-gray-500 font-medium">Upload a video. The AI will make your image mimic the video's movements.</p>
                  </div>

                  <div className="flex-1 space-y-4">
                    {referenceVideoPreview ? (
                      <div className="relative rounded-xl border border-blue-200 bg-blue-50/50 p-2">
                        <video src={referenceVideoPreview} controls className="w-full h-32 object-cover rounded-lg bg-black" />
                        <button onClick={() => { setReferenceVideoFile(null); setReferenceVideoPreview(null); }} className="absolute top-4 right-4 p-1.5 bg-white/90 text-red-500 rounded-full shadow-md hover:bg-red-50 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                        <p className="text-[10px] font-bold text-blue-700 mt-2 text-center truncate px-2">{referenceVideoFile?.name}</p>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleRefVideoDrop}
                        onClick={() => refVideoInputRef.current?.click()}
                        className="h-32 border-2 border-dashed border-blue-300 bg-blue-50/30 hover:bg-blue-50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors"
                      >
                        <Video className="h-6 w-6 text-blue-400 mb-2" />
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Drop Reference Video</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Prompt (Optional)</label>
                      <Textarea
                        value={mediaContext}
                        onChange={(e) => setMediaContext(e.target.value)}
                        placeholder="e.g., The character dances energetically..."
                        className="text-xs resize-none h-20 bg-gray-50 border-gray-200"
                        disabled={isProcessing}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-auto">
                    <Button
                      onClick={handleMotionTransfer}
                      disabled={isProcessing || !referenceVideoFile}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white h-12 rounded-xl shadow-lg shadow-blue-500/20 font-bold text-sm"
                    >
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Activity className="mr-2 h-5 w-5" />} Transfer Motion
                    </Button>
                    <Button variant="ghost" disabled={isProcessing} onClick={handleCancel} className="w-full text-red-500 hover:bg-red-50 font-bold h-9">Cancel</Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}