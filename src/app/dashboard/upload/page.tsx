"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Image as ImageIcon,
  Video,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";

export default function YourContentPage() {
  const router = useRouter();
  const { clientId } = useClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaContext, setMediaContext] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleAnalyze = async () => {
    if (!file || !clientId) return;
    setIsProcessing(true);

    localStorage.setItem(
      `blink_analyzing_media_${clientId}`,
      Date.now().toString()
    );

    try {
      setLoadingText("Uploading media securely...");
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.${fileExt}`;
      const filePath = `uploads/${clientId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(filePath, file);
      if (uploadError) throw new Error("Failed to upload file");

      const { data: urlData } = supabase.storage
        .from("assets")
        .getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      setLoadingText("Fetching Brand DNA...");
      const { data: brand } = await supabase
        .from("brand_profiles")
        .select("brand_voice, dos, donts")
        .eq("client_id", clientId)
        .single();

      setLoadingText("AI is writing the perfect caption...");
      const aiRes = await fetch("/api/content/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: publicUrl,
          mediaType: file.type,
          brandVoice: brand?.brand_voice,
          dos: brand?.dos,
          donts: brand?.donts,
          context: mediaContext,
        }),
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiData.error || "Failed AI Request");

      setLoadingText("Saving to calendar...");

      // ✨ FIXED: Now we map the AI's exact JSON keys to your specific database columns!
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

      localStorage.removeItem(`blink_analyzing_media_${clientId}`);
      router.push("/dashboard/content");
    } catch (error) {
      console.error(error);
      alert("Something went wrong during analysis.");
      setIsProcessing(false);
      localStorage.removeItem(`blink_analyzing_media_${clientId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pt-10">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-blink-dark font-heading">
          Your Content Studio
        </h1>
        <p className="text-gray-500">
          Upload your own photos or videos, and let our AI Vision model write
          the perfect caption.
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

      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-blink-primary/30 bg-blink-primary/5 rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blink-primary/10 hover:border-blink-primary/50 transition-all duration-300"
        >
          <div className="flex gap-4 mb-6">
            <div className="h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-500 -rotate-6 transform hover:rotate-0 transition-all">
              <ImageIcon className="h-8 w-8" />
            </div>
            <div className="h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-purple-500 rotate-6 transform hover:rotate-0 transition-all">
              <Video className="h-8 w-8" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-blink-dark mb-2">
            Drag & drop your masterpiece here
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            Supports JPG, PNG, MP4 up to 100MB.
          </p>
          <Button className="bg-blink-dark text-white rounded-full px-8 h-12 shadow-lg pointer-events-none">
            <UploadCloud className="mr-2 h-5 w-5" /> Browse Files
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 flex flex-col items-center text-center space-y-6">
          <div className="relative w-full aspect-video bg-gray-100 rounded-2xl overflow-hidden border border-gray-200">
            {file.type.startsWith("image") ? (
              <img
                src={preview!}
                alt="Upload preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                src={preview!}
                controls
                className="w-full h-full object-contain bg-black"
              />
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-blink-primary" />
                <p className="font-semibold text-blink-dark animate-pulse">
                  {loadingText}
                </p>
              </div>
            )}
          </div>

          <div className="w-full space-y-3 text-left">
            <div>
              <h3 className="text-sm font-bold text-blink-dark flex items-center justify-between">
                File Ready{" "}
                <span className="font-normal text-gray-400 text-xs truncate max-w-[200px]">
                  {file.name}
                </span>
              </h3>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                What is this media about? (Optional)
              </label>
              <Input
                value={mediaContext}
                onChange={(e) => setMediaContext(e.target.value)}
                placeholder="e.g., Behind the scenes of our new product launch..."
                className="text-sm"
                disabled={isProcessing}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Giving the AI context helps it write significantly better
                captions, especially for videos!
              </p>
            </div>
          </div>

          <div className="flex gap-4 w-full">
            <Button
              variant="outline"
              disabled={isProcessing}
              onClick={() => {
                setFile(null);
                setPreview(null);
                setMediaContext("");
              }}
              className="flex-1 h-12 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={isProcessing}
              className="flex-2 w-full bg-gradient-to-r from-blink-primary to-purple-600 text-white h-12 rounded-xl shadow-md hover:shadow-lg transition-all text-base"
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5" />
              )}
              {isProcessing ? "Processing..." : "Analyze & Write Caption"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
