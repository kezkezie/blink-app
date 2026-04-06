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
  Music,
  Zap,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { cn } from "@/lib/utils";

type ToolMode = "brush" | "eraser" | "arrow";
type ActiveTab = "caption" | "animate" | "motion_transfer" | "audio_to_video";

export default function YourContentPage() {
  const router = useRouter();
  const { clientId } = useClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refVideoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Main File States
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [mediaContext, setMediaContext] = useState("");

  // Reference Video States for Motion Transfer (V2)
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);

  // Audio to Video States
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioModel, setAudioModel] = useState("kling-3.0/video");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("caption");

  // MOTION BRUSH STATES (V2)
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushSize, setBrushSize] = useState(30);

  // Canvas Refs (V2)
  const containerRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing State (V2)
  const [isDrawing, setIsDrawing] = useState(false);
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });
  const [arrowStart, setArrowStart] = useState<{ x: number, y: number } | null>(null);
  const [arrowVector, setArrowVector] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

  // Initialize Canvases for Motion Brush (V2)
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

  // Handle Draw Events (Motion Brush - V2)
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
    if (e.dataTransfer.files?.length) {
      if (activeTab === 'audio_to_video' && e.dataTransfer.files[0].type.startsWith("audio")) {
        handleAudioSelect(e.dataTransfer.files[0]);
      } else {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    }
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

  // Audio Upload Handlers
  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) handleAudioSelect(e.dataTransfer.files[0]);
  };

  const handleAudioSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.type.startsWith("audio")) {
      setAudioFile(selectedFile);
      setAudioPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      alert("Please upload a valid audio file (.mp3, .wav, .flac).");
    }
  };

  // Reference Video Upload Handlers (For Motion Transfer - V2)
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

  // --- AUDIO TO VIDEO ANIMATION TRIGGER ---
  const handleAudioToVideo = async () => {
    if (!audioFile || !clientId) return alert("Please upload an audio file.");
    if (!mediaContext.trim()) return alert("Please write a prompt for the video generation.");

    // Strict validation check for models that REQUIRE an image for lipsync
    if ((audioModel === 'kling-3.0/video' || audioModel === 'bytedance/seedance-2') && !file) {
      return alert("This model requires a Start Image to lip-sync with the audio. Please upload an image containing a clear face.");
    }

    setIsProcessing(true);
    setLoadingText("Uploading Assets...");

    try {
      // 1. Upload Audio
      const audioPath = `videos/${clientId}/pruna_audio_${Date.now()}.${audioFile.name.split(".").pop()}`;
      await supabase.storage.from("assets").upload(audioPath, audioFile);
      const audioPublicUrl = supabase.storage.from("assets").getPublicUrl(audioPath).data.publicUrl;

      // 2. Upload Image (Optional for Pruna, Required for Kling/Seedance)
      let imagePublicUrl = null;
      if (file) {
        const imgPath = `videos/${clientId}/pruna_image_${Date.now()}.${file.name.split(".").pop()}`;
        await supabase.storage.from("assets").upload(imgPath, file);
        imagePublicUrl = supabase.storage.from("assets").getPublicUrl(imgPath).data.publicUrl;
      }

      setLoadingText(`Initializing ${audioModel.includes('kling') ? 'Kling 3.0' : audioModel.includes('seedance') ? 'Seedance 2' : 'Pruna AI'} Engine...`);

      // 3. Create Placeholder in Supabase
      const { data: dbData, error: dbError } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: "sequence_clip",
        caption: `🎵 Audio Reactive Video`,
        status: "draft",
        image_urls: imagePublicUrl ? [imagePublicUrl] : [],
        ai_model: audioModel,
      }).select('id').single();

      if (dbError) throw dbError;

      // 4. Send to n8n
      const n8nRes = await fetch("/api/video/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scene_video_generator",
          post_id: dbData.id,
          client_id: clientId,
          primary_image_url: imagePublicUrl,
          user_prompt: mediaContext,
          duration: "10",
          video_mode: "audio_to_video",
          ai_model_override: audioModel,
          scene_data: {
            audio: {
              audio_url: audioPublicUrl
            }
          }
        })
      });

      if (!n8nRes.ok) throw new Error("Failed to trigger video generation");

      setLoadingText("Generation started successfully! Check your Content tab.");
      setTimeout(() => {
        router.push(`/dashboard/content/${dbData.id}`);
      }, 1500);

    } catch (err: any) {
      alert(`Audio to Video failed: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // --- MOTION BRUSH ANIMATION TRIGGER (V2) ---
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

  // --- MOTION TRANSFER ANIMATION TRIGGER (V2) ---
  const handleMotionTransfer = async () => {
    if (!file || !referenceVideoFile || !clientId) return;

    setIsProcessing(true);
    setLoadingText("Uploading Base Image & Driving Video...");

    try {
      const imgPath = `videos/${clientId}/pose_base_${Date.now()}.${file.name.split(".").pop()}`;
      await supabase.storage.from("assets").upload(imgPath, file);
      const imgUrl = supabase.storage.from("assets").getPublicUrl(imgPath).data.publicUrl;

      const vidPath = `videos/${clientId}/pose_drive_${Date.now()}.${referenceVideoFile.name.split(".").pop()}`;
      await supabase.storage.from("assets").upload(vidPath, referenceVideoFile);
      const vidUrl = supabase.storage.from("assets").getPublicUrl(vidPath).data.publicUrl;

      setLoadingText("Generating Motion Transfer...");

      const { data: dbData, error: dbError } = await supabase.from("content").insert({
        client_id: clientId,
        content_type: "sequence_clip",
        caption: `🕺 Motion Transfer Video`,
        status: "draft",
        image_urls: [imgUrl],
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
          primary_image_url: imgUrl,
          reference_video_url: vidUrl,
          user_prompt: mediaContext || "Make the character follow the exact movements of the reference video.",
          duration: "10",
          video_mode: "motion_transfer",
          ai_model_override: "kling-3.0/video"
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
    setAudioFile(null);
    setAudioPreviewUrl(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 pt-8 pb-20">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-[#DEDCDC] font-display">
          Content Studio
        </h1>
        <p className="text-[#989DAA]">
          Upload media to write captions, animate, or sync audio.
        </p>
      </div>

      {/* ✨ ALWAYS VISIBLE TABS */}
      <div className="flex p-1.5 bg-[#191D23] border border-[#57707A]/30 rounded-xl mx-auto max-w-[400px] overflow-x-auto shadow-inner relative z-10">
        <button
          onClick={() => setActiveTab('caption')}
          className={cn("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4", activeTab === 'caption' ? "bg-[#57707A]/80 shadow-md text-[#DEDCDC]" : "text-[#57707A] hover:text-[#989DAA]")}
        >
          <ScrollText className="w-3.5 h-3.5" /> AI Caption
        </button>

        <button
          onClick={() => setActiveTab('audio_to_video')}
          className={cn("flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap px-4", activeTab === 'audio_to_video' ? "bg-gradient-to-r from-[#00E5FF] to-[#00B3CC] shadow-[0_0_15px_rgba(0,229,255,0.2)] text-[#191D23]" : "text-[#57707A] hover:text-[#989DAA]")}
        >
          <Music className="w-3.5 h-3.5" /> Audio to Video
        </button>
      </div>

      {/* Hidden Inputs */}
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
      <input
        type="file"
        className="hidden"
        ref={audioInputRef}
        accept="audio/*"
        onChange={(e) => {
          if (e.target.files?.length) handleAudioSelect(e.target.files[0]);
        }}
      />

      {/* ─── DYNAMIC VIEW RENDERING ─── */}
      {activeTab === 'caption' && !file ? (
        /* BIG DROPZONE FOR CAPTIONS */
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropFile}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#57707A]/50 bg-[#2A2F38] rounded-3xl p-20 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#57707A]/20 hover:border-[#C5BAC4]/50 transition-all duration-300 shadow-lg"
        >
          <div className="flex gap-4 mb-6">
            <div className="h-16 w-16 bg-[#191D23] rounded-2xl shadow-inner flex items-center justify-center text-[#C5BAC4] -rotate-6 transform hover:rotate-0 transition-all border border-[#57707A]/30">
              <ImageIcon className="h-8 w-8" />
            </div>
            <div className="h-16 w-16 bg-[#191D23] rounded-2xl shadow-inner flex items-center justify-center text-[#C5BAC4] rotate-6 transform hover:rotate-0 transition-all border border-[#57707A]/30">
              <Video className="h-8 w-8" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-[#DEDCDC] mb-2 font-display">Drag & drop your masterpiece here</h3>
          <p className="text-sm text-[#989DAA] mb-6 max-w-sm">Upload images or videos to generate AI captions.</p>

          <Button className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-full px-8 h-12 shadow-lg shadow-[#C5BAC4]/10 pointer-events-none transition-colors">
            <UploadCloud className="mr-2 h-5 w-5" /> Browse Files
          </Button>
        </div>
      ) : (
        /* EDITOR UI (Used for both Caption and Audio-to-Video) */
        <div className="bg-[#2A2F38] rounded-3xl p-6 md:p-8 shadow-2xl border border-[#57707A]/30">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {/* Left: The Visuals */}
            <div className="md:col-span-2 relative w-full aspect-video bg-[#191D23] rounded-2xl overflow-hidden border border-[#57707A]/40 flex flex-col items-center justify-center shadow-inner" ref={containerRef}>

              {preview ? (
                isVideo ? (
                  <video src={preview!} controls className="w-full h-full object-contain bg-black" />
                ) : (
                  <img src={preview!} alt="Upload preview" className="w-full h-full object-contain" />
                )
              ) : activeTab === 'audio_to_video' ? (
                <div className="flex flex-col items-center text-[#57707A] gap-3">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <p className="text-xs font-bold uppercase tracking-wider">No Start Image</p>
                  <p className="text-[10px] text-[#989DAA] max-w-[200px] text-center">Upload an image to preview it here.</p>
                </div>
              ) : null}

              {isProcessing && (
                <div className="absolute inset-0 bg-[#191D23]/80 backdrop-blur-md flex flex-col items-center justify-center z-50 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl bg-[#C5BAC4]/20 animate-pulse"></div>
                    <Loader2 className="h-12 w-12 animate-spin text-[#C5BAC4] relative z-10" />
                  </div>
                  <p className="font-bold text-[#DEDCDC] tracking-wider uppercase text-sm animate-pulse">{loadingText}</p>
                  {activeTab === 'audio_to_video' && (
                    <p className="text-[10px] text-[#989DAA] text-center max-w-[250px] font-medium">Media generation runs in the background. It is safe to navigate away.</p>
                  )}
                </div>
              )}
            </div>

            {/* Right: The Controls */}
            <div className="flex flex-col space-y-6 h-full">

              {/* ─── CAPTION MODE CONTROLS ─── */}
              {activeTab === 'caption' && (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-[#DEDCDC] mb-1 font-display">File Uploaded</h3>
                    <p className="font-medium text-[#57707A] text-xs truncate w-full">{file?.name}</p>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mb-2">Context (Optional)</label>
                    <Textarea
                      value={mediaContext}
                      onChange={(e) => setMediaContext(e.target.value)}
                      placeholder="e.g., Behind the scenes of our new product launch..."
                      className="text-sm resize-none h-32 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                      disabled={isProcessing}
                    />
                    <p className="text-[10px] text-[#57707A] mt-2 font-bold">Providing context helps the AI write much better captions.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button onClick={handleAnalyze} disabled={isProcessing} className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 font-bold transition-all">
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ScrollText className="mr-2 h-5 w-5" />} Write Caption
                    </Button>
                    <Button variant="ghost" disabled={isProcessing} onClick={handleCancel} className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold transition-colors">
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {/* ─── AUDIO TO VIDEO CONTROLS ─── */}
              {activeTab === 'audio_to_video' && (
                <div className="flex flex-col h-full gap-4">
                  <div className="bg-gradient-to-r from-[#00E5FF]/10 to-transparent border border-[#00E5FF]/30 rounded-xl p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-[#00E5FF]/10 blur-xl rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="flex items-center gap-2 mb-2 relative z-10">
                      <Zap className="w-4 h-4 text-[#00E5FF]" />
                      <h3 className="text-xs font-bold text-[#DEDCDC] uppercase tracking-wider">
                        {audioModel === "kling-3.0/video" ? "Kling 3.0 Engine" : audioModel === "bytedance/seedance-2" ? "Seedance 2 Engine" : "Pruna AI Engine"}
                      </h3>
                    </div>
                    <p className="text-[10px] text-[#989DAA] font-medium relative z-10 leading-relaxed">
                      {(audioModel === "kling-3.0/video" || audioModel === "bytedance/seedance-2")
                        ? "This model requires BOTH an audio file and a start image with a clear face to generate a lip-synced video."
                        : "Pruna converts your audio into a synced video. Upload an image for best results, or leave blank for pure AI generation."}
                    </p>
                  </div>

                  <div className="space-y-4 flex-1">
                    {/* Model Selection Dropdown */}
                    <div>
                      <label className="block text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mb-2">1. AI Model</label>
                      <select
                        value={audioModel}
                        onChange={(e) => setAudioModel(e.target.value)}
                        className="w-full text-xs font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-3 px-3 bg-[#191D23] text-[#DEDCDC] cursor-pointer focus:outline-none focus:border-[#00E5FF]/50 transition-colors appearance-none"
                      >
                        <option value="kling-3.0/video">Kling 3.0 (Cinematic Lipsync)</option>
                        <option value="bytedance/seedance-2">Seedance 2 (Cinematic Lipsync)</option>
                        <option value="replicate:prunaai/p-video">Pruna P-Video (Fast Action Lipsync)</option>
                      </select>
                    </div>

                    {/* Audio Status Block */}
                    <div>
                      <label className="block text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mb-2">2. Driving Audio <span className="text-red-400">*Required</span></label>
                      {audioPreviewUrl ? (
                        <div className="flex items-center justify-between bg-[#191D23] border border-[#57707A]/50 p-2.5 rounded-xl shadow-inner">
                          <div className="flex items-center gap-3 w-full min-w-0">
                            <div className="w-8 h-8 rounded bg-[#00E5FF]/10 flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-[#00E5FF]" />
                            </div>
                            <audio src={audioPreviewUrl} controls className="h-8 w-full min-w-0" />
                          </div>
                          <button onClick={() => { setAudioFile(null); setAudioPreviewUrl(null); }} className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1 ml-2 shrink-0">Remove</button>
                        </div>
                      ) : (
                        <div
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={handleAudioDrop}
                          onClick={() => audioInputRef.current?.click()}
                          className="h-16 border-2 border-dashed border-[#00E5FF]/30 bg-[#191D23]/50 hover:bg-[#00E5FF]/5 rounded-xl flex items-center justify-center cursor-pointer transition-colors shadow-inner"
                        >
                          <span className="text-[10px] font-bold text-[#00E5FF] uppercase tracking-wider flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Drop Audio File</span>
                        </div>
                      )}
                    </div>

                    {/* Image Upload Block */}
                    <div>
                      {/* Inside the Image Upload Block */}
                      <label className="block text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mb-2 flex items-center gap-1">
                        3. Start Image
                        {(audioModel === 'kling-3.0/video' || audioModel === 'bytedance/seedance-2') ? <span className="text-red-400">*Required for this model</span> : <span className="text-[#57707A]">(Optional)</span>}
                      </label>

                      {!preview ? (
                        <div
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={handleDropFile}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn("h-16 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-colors shadow-inner",
                            (audioModel === 'kling-3.0/video' || audioModel === 'bytedance/seedance-2') ? "border-red-400/30 bg-[#191D23] hover:bg-red-400/5" : "border-[#57707A]/40 bg-[#191D23] hover:bg-[#57707A]/20"
                          )}
                        >
                          <span className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-2", (audioModel === 'kling-3.0/video' || audioModel === 'bytedance/seedance-2') ? "text-red-400" : "text-[#57707A] hover:text-[#C5BAC4]")}><ImageIcon className="w-4 h-4" /> Drop Image File</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-[#191D23] border border-[#57707A]/50 p-2.5 rounded-xl shadow-inner">
                          <div className="flex items-center gap-3 w-full min-w-0">
                            <div className="w-8 h-8 rounded bg-[#57707A]/20 flex items-center justify-center shrink-0 overflow-hidden">
                              <img src={preview} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-xs font-bold text-[#DEDCDC] truncate">{file?.name}</span>
                          </div>
                          <button onClick={() => { setFile(null); setPreview(null); }} className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1 ml-2 shrink-0">Remove</button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mb-2 flex justify-between">
                        <span>4. Visual Prompt</span>
                        <span className="text-red-400">*Required</span>
                      </label>
                      <Textarea
                        value={mediaContext}
                        onChange={(e) => setMediaContext(e.target.value)}
                        placeholder="e.g., A cinematic medium close-up of a person speaking naturally to the camera..."
                        className="text-xs resize-none h-24 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#00E5FF]/50 rounded-xl shadow-inner custom-scrollbar"
                        disabled={isProcessing}
                      />
                      <p className="text-[9px] text-[#57707A] mt-2 font-medium">Describe the scene and the speaker. <strong className="text-red-400">Do not use quotes here</strong>—the uploaded audio file handles the speech!</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-auto">
                    <Button
                      onClick={handleAudioToVideo}
                      disabled={isProcessing || !audioFile || !mediaContext.trim() || ((audioModel === 'kling-3.0/video' || audioModel === 'bytedance/seedance-2') && !file)}
                      className="w-full bg-gradient-to-r from-[#00E5FF] to-[#00B3CC] hover:from-[#00B3CC] hover:to-[#0099B3] text-[#191D23] h-12 rounded-xl shadow-lg shadow-[#00E5FF]/20 font-bold text-sm border-none disabled:opacity-50 disabled:grayscale transition-all duration-300"
                    >
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Video className="mr-2 h-5 w-5" />} Generate Sync Video
                    </Button>
                    <Button variant="ghost" disabled={isProcessing} onClick={handleCancel} className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold transition-colors">Cancel</Button>
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