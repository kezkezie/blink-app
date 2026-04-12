"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Sparkles, Image as ImageIcon, Box, LayoutGrid, UploadCloud, X, Loader2, Wand2, RefreshCw, Eraser, CheckCircle, Palette, Layers, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";

// --- Configuration ---
const IMAGE_MODES = [
  { id: "standard", title: "Standard Generation", icon: ImageIcon, desc: "Generate stunning AI photos from scratch or enhance a reference image.", requiresUpload: false, maxUploads: 1 },
  { id: "product_drop", title: "Product Drop", icon: Box, desc: "Upload a transparent product PNG and AI will blend it into a beautiful scene.", requiresUpload: true, maxUploads: 1 },
  { id: "organic_blend", title: "Organic Composition", icon: Layers, desc: "Upload 2 to 8 items. AI will arrange them naturally into a realistic, cohesive scene.", requiresUpload: true, maxUploads: 8 },
  { id: "grid", title: "Campaign Grid", icon: LayoutGrid, desc: "Upload 2 to 8 images and let AI arrange them into an aesthetic moodboard.", requiresUpload: true, maxUploads: 8 }
];

// ✨ Universal Marketing Styles
const MARKETING_STYLES = [
  { id: "studio", label: "📸 Studio Product Shoot", promptAddon: "Professional studio lighting, clean infinite background, high-end commercial product photography, 8k resolution, highly detailed." },
  { id: "lifestyle", label: "🌿 Lifestyle Photography", promptAddon: "Candid lifestyle photography, natural sunlight, authentic, relatable, shot on 35mm lens, depth of field." },
  { id: "cinematic", label: "🎬 Cinematic", promptAddon: "Cinematic lighting, dramatic shadows, anamorphic lens, movie still, highly detailed, moody aesthetic." },
  { id: "poster", label: "📝 Poster / Ad Design", promptAddon: "Graphic design poster style, bold typography layout space, vibrant colors, professional advertising campaign aesthetic." },
  { id: "brand", label: "✨ Brand Integrated (Logo)", promptAddon: "Professional aesthetic integrating brand identity. The brand logo or motif is naturally placed in the environment as a decal, sign, or texture." },
  { id: "abstract", label: "🎨 Abstract / 3D Render", promptAddon: "Abstract 3D render, Cinema4D, Octane render, smooth glossy textures, soft geometric shapes, visually striking." },
  { id: "flatlay", label: "📐 Flatlay / Top-Down", promptAddon: "Top-down flatlay perspective, neatly organized items, aesthetic grid arrangement, soft diffused lighting." }
];

interface GeneratedResult {
  id: string;
  url: string;
  prompt: string;
  mode: string;
}

export default function ImageStudioPage() {
  const { clientId } = useClient();

  // --- State: Core ---
  const [selectedMode, setSelectedMode] = useState("standard");
  const [selectedStyle, setSelectedStyle] = useState("studio");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [numImages, setNumImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>([]);

  // --- State: Brand Context ---
  const [brandContext, setBrandContext] = useState<any>(null);

  // --- State: Modals & Refinement ---
  const [selectedResult, setSelectedResult] = useState<GeneratedResult | null>(null);
  const [refinementTab, setRefinementTab] = useState<"fresh" | "retouch">("fresh");
  const [modalPrompt, setModalPrompt] = useState("");
  const [retouchPrompt, setRetouchPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const activeConfig = IMAGE_MODES.find(m => m.id === selectedMode)!;

  // --- Load Brand Context on Mount ---
  useEffect(() => {
    if (!clientId) return;
    async function loadContext() {
      const [clientRes, brandRes] = await Promise.all([
        supabase.from("clients").select("company_name, industry").eq("id", clientId).single(),
        supabase.from("brand_profiles").select("image_style, brand_voice, logo_url").eq("client_id", clientId).eq("is_active", true).maybeSingle(),
      ]);

      setBrandContext({
        name: clientRes.data?.company_name,
        industry: clientRes.data?.industry,
        imageStyle: brandRes.data?.image_style,
        brandVoice: brandRes.data?.brand_voice,
        logoUrl: brandRes.data?.logo_url,
      });
    }
    loadContext();
  }, [clientId]);


  // --- AI Prompt Helper ---
  const [isHelpLoading, setIsHelpLoading] = useState(false);

  const handlePromptHelp = async () => {
    if (isHelpLoading) return;
    setIsHelpLoading(true);

    try {
      const activeStyleObj = MARKETING_STYLES.find(s => s.id === selectedStyle);

      const res = await fetch("/api/ai/prompt-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          brandContext: brandContext,
          useBrand: useBrandStore.getState().activeBrand !== null,
          mode: selectedMode,
          style: activeStyleObj
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to fetch suggestion");

      if (data.suggestion) {
        setPrompt(data.suggestion);
      }
    } catch (err: any) {
      alert(`Prompt helper failed: ${err.message}`);
    } finally {
      setIsHelpLoading(false);
    }
  };


  // --- Drag & Drop Logic ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const remainingSlots = activeConfig.maxUploads - files.length;
    const allowedFiles = acceptedFiles.slice(0, remainingSlots);

    allowedFiles.forEach(file => {
      if (selectedMode === 'product_drop' && file.type !== 'image/png') {
        alert("For Product Drop, please upload PNG files for best transparency results.");
      }
      setFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  }, [files.length, activeConfig.maxUploads, selectedMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': [], 'image/jpeg': [], 'image/webp': [] },
    disabled: files.length >= activeConfig.maxUploads,
    multiple: activeConfig.maxUploads > 1
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // --- Main Generation Logic ---
  const handleGenerate = async () => {
    if (!clientId) return alert("Session lost. Please refresh.");
    if (activeConfig.requiresUpload && files.length === 0) return alert("Please upload the required images.");
    if ((selectedMode === "grid" || selectedMode === "organic_blend") && files.length < 2) return alert("This mode requires at least 2 images.");

    setIsGenerating(true);

    const { activeBrand } = useBrandStore.getState();
    const strictBrandAlignment = activeBrand !== null;
    const { addTask, removeTask } = useWorkflowStore.getState();
    const taskId = `img-gen-${Date.now()}`;

    try {
      addTask(taskId, "Generating Image");
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "png";
        const path = `images/${clientId}/studio_ref_${Date.now()}_${i}.${ext}`;
        await supabase.storage.from("assets").upload(path, file);
        const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
        uploadedUrls.push(url);
      }

      const activeStyleObj = MARKETING_STYLES.find(s => s.id === selectedStyle);
      const finalPrompt = `${prompt}. ${activeStyleObj?.promptAddon || ""}`;

      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId,
        mode: selectedMode,
        prompt: finalPrompt,
        reference_image_urls: uploadedUrls,
        strict_brand_alignment: strictBrandAlignment,
        numImages: selectedMode === "standard" ? numImages : 1,
        style: selectedStyle,
        logo_url: strictBrandAlignment ? brandContext?.logoUrl : undefined,
        is_sync: true
      });

      let newUrls: string[] = [];
      if (response && Array.isArray(response.imageUrls)) {
        newUrls = response.imageUrls as string[];
      } else if (response && response.imageUrls) {
        newUrls = response.imageUrls as string[];
      }

      if (newUrls.length === 0) throw new Error("No images were returned from the generator.");

      const newResults: GeneratedResult[] = [];
      for (const url of newUrls) {
        const { data: contentRecord, error } = await supabase
          .from("content")
          .insert({
            client_id: clientId,
            content_type: "post_image",
            caption: finalPrompt,
            status: "draft",
            image_urls: [url],
            ai_model: 'nano-banana-studio'
          })
          .select()
          .single();

        if (error) console.error("Failed to save to grid:", error);
        if (contentRecord) {
          newResults.push({ id: contentRecord.id, url, prompt: finalPrompt, mode: selectedMode });
        }
      }

      setGeneratedResults(prev => [...newResults, ...prev]);

    } catch (error: any) {
      console.error(error);
      alert(`Generation failed: ${error.message || "Unknown error"}`);
    } finally {
      removeTask(taskId);
      setIsGenerating(false);
    }
  };

  // --- Refinement Logic (Modal Buttons) ---
  const handleRefine = async (type: "fresh" | "retouch") => {
    if (!selectedResult || !clientId) return;

    if (type === "retouch" && !retouchPrompt.trim()) {
      return alert("Please enter instructions on what you want to change.");
    }

    setIsRefining(true);

    try {
      const wfMode = type === "fresh" ? "standard" : "edit";
      const wfPrompt = type === "fresh" ? modalPrompt : retouchPrompt;

      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId,
        mode: wfMode,
        prompt: wfPrompt,
        reference_image_urls: [selectedResult.url],
        strict_brand_alignment: useBrandStore.getState().activeBrand !== null,
        numImages: 1,
        is_sync: true
      });

      let newUrls: string[] = [];
      if (response && Array.isArray(response.imageUrls)) newUrls = response.imageUrls as string[];
      else if (response && response.imageUrls) newUrls = response.imageUrls as string[];

      if (newUrls.length === 0) throw new Error("No images were returned.");

      const url = newUrls[0];
      const { data: contentRecord } = await supabase
        .from("content")
        .insert({
          client_id: clientId,
          content_type: "post_image",
          caption: wfPrompt,
          status: "draft",
          image_urls: [url],
          ai_model: type === "fresh" ? 'nano-banana-v2' : 'qwen-image-edit'
        })
        .select()
        .single();

      if (contentRecord) {
        const newRes = { id: contentRecord.id, url, prompt: wfPrompt, mode: wfMode };
        setGeneratedResults(prev => [newRes, ...prev]);

        setSelectedResult(newRes);
        setModalPrompt(newRes.prompt);
        setRetouchPrompt("");
      }

    } catch (error: any) {
      console.error(error);
      alert(`Refinement failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsRefining(false);
    }
  };

  const openModal = (result: GeneratedResult) => {
    setSelectedResult(result);
    setModalPrompt(result.prompt);
    setRetouchPrompt("");
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-20 animate-in fade-in duration-500 relative">
      {/* ── HERO BANNER ── */}
      <div className="relative bg-[#2A2F38] rounded-2xl p-8 border border-[#57707A]/40 shadow-xl overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#C5BAC4]/10 blur-[120px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#C5BAC4]" />
            </div>
            <h1 className="text-2xl font-bold text-[#DEDCDC] font-display">AI Image Studio</h1>
          </div>
          <p className="text-sm text-[#DEDCDC]/50 max-w-xl leading-relaxed">
            Generate fresh aesthetic content, composite your products perfectly into new scenes, or build beautiful campaign grids.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-bold text-[#DEDCDC]/60 uppercase tracking-widest">Select Mode</h3>
            <div className="flex flex-col gap-3">
              {IMAGE_MODES.map((mode) => {
                const isSelected = selectedMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => { setSelectedMode(mode.id); setFiles([]); setPreviews([]); }}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                      isSelected ? "border-[#C5BAC4]/50 bg-[#C5BAC4]/10 shadow-sm" : "border-[#57707A]/30 bg-[#191D23]/40 hover:border-[#57707A]/80 hover:bg-[#57707A]/20"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg shrink-0 border", isSelected ? "bg-[#C5BAC4] text-[#191D23] border-[#C5BAC4]" : "bg-[#191D23] text-[#57707A] border-[#57707A]/40")}>
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className={cn("text-sm font-bold", isSelected ? "text-[#DEDCDC]" : "text-[#989DAA]")}>{mode.title}</h4>
                      <p className={cn("text-[10px] mt-1 leading-tight", isSelected ? "text-[#DEDCDC]/60" : "text-[#57707A]")}>{mode.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {selectedMode === "standard" && (
            <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#DEDCDC]">Batch Size</h3>
                <span className="text-xs font-bold text-[#191D23] bg-[#C5BAC4] px-2 py-0.5 rounded shadow-sm">{numImages} Images</span>
              </div>
              <Slider value={[numImages]} onValueChange={(v) => setNumImages(v[0])} min={1} max={10} step={1} className="py-1" />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Canvas & Generation */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#2A2F38] rounded-xl border border-[#57707A]/30 p-6 shadow-lg flex-1 flex flex-col space-y-6 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#B3FF00]/5 blur-[60px] rounded-full pointer-events-none" />

            <div className="space-y-2 relative z-10">
              <label className="text-sm font-bold text-[#DEDCDC]">Visual Aesthetic</label>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full p-3 bg-[#191D23] border border-[#57707A]/40 rounded-xl text-sm font-medium text-[#DEDCDC] focus:ring-2 ring-[#C5BAC4] outline-none cursor-pointer hover:bg-[#57707A]/20 transition-colors appearance-none"
              >
                {MARKETING_STYLES.map(style => (
                  <option key={style.id} value={style.id}>{style.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 relative z-10">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-[#DEDCDC]">Director's Prompt</label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePromptHelp}
                  disabled={isHelpLoading}
                  className={cn("h-7 text-xs px-3 bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-[#DEDCDC] hover:border-[#C5BAC4] transition-colors rounded-lg", isHelpLoading && "animate-pulse")}
                >
                  {isHelpLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Wand2 className="w-3 h-3 mr-1.5" />}
                  {isHelpLoading ? "Writing..." : "AI Magic Writer"}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={selectedMode === 'product_drop' ? "Describe scene (e.g., 'on a sunny beach towel')..." : "Describe what you want to see..."}
                  className={cn("resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] h-28 focus-visible:ring-[#C5BAC4] pr-10 transition-all rounded-xl", isHelpLoading && "opacity-50")}
                  readOnly={isHelpLoading}
                />
                {isHelpLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles className="w-8 h-8 text-[#C5BAC4] animate-bounce opacity-50" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#989DAA] text-right">The AI Writer will automatically adapt your prompt to fit the <b className="text-[#DEDCDC]">{MARKETING_STYLES.find(s => s.id === selectedStyle)?.label}</b> style.</p>
            </div>

            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[#DEDCDC]">
                  Image Assets {activeConfig.requiresUpload && <span className="text-red-400">*</span>}
                </label>
                <span className="text-xs text-[#989DAA] font-bold px-2 py-0.5 bg-[#191D23] rounded-md border border-[#57707A]/30">{files.length} / {activeConfig.maxUploads} Uploaded</span>
              </div>

              <div className="flex flex-wrap gap-4">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative w-24 h-24 rounded-xl border border-[#57707A]/40 overflow-hidden group shadow-sm bg-[#191D23]">
                    <img src={src} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt="upload preview" />
                    {selectedMode === 'product_drop' && (
                      <div className="absolute inset-0 bg-black/40 pointer-events-none" style={{ backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px', zIndex: -1 }}></div>
                    )}
                    <button onClick={() => removeFile(idx)} className="absolute top-1.5 right-1.5 bg-red-500/90 backdrop-blur-sm text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-500 hover:scale-110">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {files.length < activeConfig.maxUploads && (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "w-24 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all",
                      isDragActive ? "border-[#C5BAC4] bg-[#C5BAC4]/10 text-[#C5BAC4] scale-105" : "border-[#57707A]/50 bg-[#191D23]/50 text-[#57707A] hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 hover:text-[#989DAA]"
                    )}
                  >
                    <input {...getInputProps()} />
                    <UploadCloud className="w-6 h-6 mb-1.5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight px-1">
                      {isDragActive ? "Drop Here" : "Drag & Drop"}
                    </span>
                  </div>
                )}
              </div>
              {selectedMode === 'product_drop' && <p className="text-[10px] text-[#B3FF00] font-bold mt-2 flex items-center gap-1.5 bg-[#B3FF00]/10 border border-[#B3FF00]/20 px-2 py-1.5 rounded-md w-fit"><CheckCircle className="w-3.5 h-3.5" /> Pro Tip: Use transparent PNGs for best results.</p>}
              {selectedStyle === 'brand' && !brandContext?.logoUrl && <p className="text-[10px] text-red-400 font-bold mt-2 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded-md w-fit">⚠️ Warning: No logo found in your Brand Profile. Please upload one in the settings.</p>}
            </div>

            <div className="mt-auto pt-6 border-t border-[#57707A]/30 flex justify-end relative z-10">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || (activeConfig.requiresUpload && files.length === 0) || isHelpLoading || (selectedStyle === 'brand' && !brandContext?.logoUrl)}
                className="bg-[#C5BAC4] hover:bg-white text-[#191D23] h-12 px-8 font-bold shadow-lg shadow-[#C5BAC4]/20 transition-all relative overflow-hidden rounded-xl disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="flex items-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    <span>Generating...</span>
                    <div className="absolute bottom-0 left-0 h-1 bg-black/20 animate-progress w-full origin-left"></div>
                  </div>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" /> Generate {selectedMode === 'standard' && numImages > 1 ? `${numImages} Images` : 'Image'}</>
                )}
              </Button>
            </div>
          </div>

          {/* RESULTS AREA */}
          {(isGenerating || generatedResults.length > 0) && (
            <div className="bg-[#191D23]/60 rounded-xl border border-[#57707A]/30 p-6 shadow-inner min-h-[300px] animate-in fade-in-50">
              <div className="flex items-center justify-between mb-5 border-b border-[#57707A]/20 pb-3">
                <h3 className="text-sm font-bold text-[#DEDCDC] uppercase tracking-wider flex items-center gap-2 font-display">
                  <ImageIcon className="w-4 h-4 text-[#C5BAC4]" /> Studio Results
                </h3>
                {generatedResults.length > 0 && !isGenerating && <span className="text-xs text-[#989DAA] font-bold bg-[#2A2F38] px-2 py-1 rounded-md border border-[#57707A]/30">{generatedResults.length} items saved to Grid</span>}
              </div>

              {isGenerating && generatedResults.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-[#57707A] gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-[#2A2F38] border-t-[#C5BAC4] animate-spin shadow-[0_0_15px_rgba(197,186,196,0.3)]"></div>
                    <Sparkles className="w-6 h-6 text-[#C5BAC4] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm font-bold animate-pulse text-[#989DAA]">Nano Banana is painting your pixels...</p>
                </div>
              ) : (
                <div className={cn("grid gap-5", (selectedMode === 'grid' || selectedMode === 'organic_blend') ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4")}>
                  {generatedResults.map((result, idx) => (
                    <div
                      key={result.id + idx}
                      onClick={() => openModal(result)}
                      className="relative aspect-square rounded-xl overflow-hidden border-2 border-[#57707A]/30 hover:border-[#C5BAC4] transition-all shadow-md group cursor-pointer bg-[#191D23]"
                    >
                      <img src={result.url} alt={`Generated ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-all flex flex-col items-center justify-end pb-4 opacity-0 group-hover:opacity-100">
                        <div className="bg-[#191D23]/80 backdrop-blur-md border border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#C5BAC4] hover:text-[#191D23] hover:border-[#C5BAC4] text-xs font-bold px-4 py-2 rounded-full shadow-xl flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                          <Sparkles className="w-3.5 h-3.5" /> Refine & Edit
                        </div>
                      </div>
                    </div>
                  ))}
                  {isGenerating && Array.from({ length: numImages }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="aspect-square rounded-xl bg-[#2A2F38] border border-[#57707A]/20 animate-pulse relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#57707A]/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ✨ FULLY FUNCTIONAL REFINEMENT MODAL ✨ */}
      <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedResult(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-[1200px] p-0 overflow-hidden bg-[#191D23] h-[90vh] md:h-[85vh] max-h-[900px] border border-[#57707A]/40 shadow-2xl shadow-black/50 rounded-2xl flex flex-col md:flex-row">
          {selectedResult && (
            <>
              {/* LEFT: Controls Panel */}
              <div className="w-full md:w-[380px] border-b md:border-b-0 md:border-r border-[#57707A]/30 bg-[#2A2F38] flex flex-col shrink-0 order-2 md:order-1 h-[55%] md:h-full z-10 shadow-[5px_0_15px_rgba(0,0,0,0.2)] relative">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col custom-scrollbar">
                  <DialogHeader className="mb-8 border-b border-[#57707A]/20 pb-4">
                    <DialogTitle className="text-xl font-heading flex items-center gap-2 text-[#DEDCDC]">
                      <Sparkles className="w-5 h-5 text-[#C5BAC4]" /> Refinement Hub
                    </DialogTitle>
                    <p className="text-xs text-[#989DAA] mt-1.5 font-medium">Perfect your creation with advanced AI tools.</p>
                  </DialogHeader>

                  <Tabs value={refinementTab} onValueChange={(v: any) => setRefinementTab(v)} className="w-full flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 mb-8 bg-[#191D23] border border-[#57707A]/30 rounded-xl p-1 h-auto">
                      <TabsTrigger value="fresh" className="text-xs font-bold py-2.5 gap-1.5 rounded-lg data-[state=active]:bg-[#57707A]/80 data-[state=active]:text-[#DEDCDC] text-[#989DAA] data-[state=active]:shadow-sm transition-all"><RefreshCw className="w-3.5 h-3.5" /> Fresh Take</TabsTrigger>
                      <TabsTrigger value="retouch" className="text-xs font-bold py-2.5 gap-1.5 rounded-lg data-[state=active]:bg-[#57707A]/80 data-[state=active]:text-[#DEDCDC] text-[#989DAA] data-[state=active]:shadow-sm transition-all"><Eraser className="w-3.5 h-3.5" /> Magic Retouch</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 flex flex-col">
                      {refinementTab === "fresh" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                          <div className="bg-[#191D23]/60 border border-[#C5BAC4]/20 p-4 rounded-xl">
                            <strong className="text-[#C5BAC4] block mb-1 text-sm font-bold flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Remix Concept</strong>
                            <p className="text-xs text-[#989DAA] leading-relaxed">Edit your prompt below to generate a new variation using this image as a reference point.</p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest">Refined Prompt</label>
                            <Textarea
                              value={modalPrompt}
                              onChange={(e) => setModalPrompt(e.target.value)}
                              className="resize-none h-36 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                            />
                          </div>
                          <div className="pt-2">
                            <Button
                              onClick={() => handleRefine("fresh")}
                              disabled={isRefining || !modalPrompt.trim()}
                              className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all"
                            >
                              {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              {isRefining ? "Generating Variation..." : "Generate Variation"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {refinementTab === "retouch" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                          <div className="bg-[#191D23]/60 border border-[#B3FF00]/20 p-4 rounded-xl">
                            <strong className="text-[#B3FF00] block mb-1 text-sm font-bold flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Provide Instructions</strong>
                            <p className="text-xs text-[#989DAA] leading-relaxed">Tell the AI exactly what you want changed in the image (e.g., "change the sofa to red" or "remove the vase").</p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest">Instructions</label>
                            <Textarea
                              value={retouchPrompt}
                              onChange={(e) => setRetouchPrompt(e.target.value)}
                              placeholder="E.g., Change the background to a sunset..."
                              className="resize-none text-sm h-36 bg-[#191D23] rounded-xl border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#B3FF00] shadow-inner custom-scrollbar"
                            />
                          </div>
                          <div className="pt-2">
                            <Button
                              onClick={() => handleRefine("retouch")}
                              disabled={isRefining || !retouchPrompt.trim()}
                              className="w-full bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] font-bold h-12 rounded-xl shadow-lg shadow-[#B3FF00]/10 transition-all border-none"
                            >
                              {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#191D23]" /> : <Wand2 className="w-4 h-4 mr-2 text-[#191D23]" />}
                              {isRefining ? "Applying Magic..." : "Apply Magic Retouch"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Tabs>
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t border-[#57707A]/30 flex gap-3 bg-[#191D23]/40 shrink-0">
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-[#DEDCDC] font-bold bg-[#2A2F38] border-[#57707A]/50 hover:bg-[#57707A]/30 hover:border-[#C5BAC4] transition-colors" onClick={() => window.open(selectedResult?.url, '_blank')}>
                    <Download className="w-4 h-4 mr-2 text-[#C5BAC4]" /> Save
                  </Button>
                  <Button variant="outline" className="flex-1 h-11 rounded-xl text-[#DEDCDC] font-bold bg-[#2A2F38] border-[#57707A]/50 hover:bg-[#57707A]/30 hover:border-[#C5BAC4] transition-colors" onClick={() => alert('Share link copied to clipboard! (Coming soon)')}>
                    <Share2 className="w-4 h-4 mr-2 text-[#C5BAC4]" /> Share
                  </Button>
                </div>
              </div>

              {/* RIGHT: Image View */}
              <div className="flex-1 bg-[#0A0A0A] relative group overflow-hidden order-1 md:order-2 min-h-[45%] md:min-h-0 md:rounded-r-2xl flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                <img
                  src={selectedResult?.url}
                  className="max-w-full max-h-full object-contain relative z-10 drop-shadow-2xl"
                  alt="Selected result"
                />

                {/* Prompt overlay on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-8 pt-24 text-white opacity-0 group-hover:opacity-100 transition-opacity delay-100 pointer-events-none z-20">
                  <div className="max-w-3xl mx-auto">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-[#C5BAC4] flex items-center gap-2"><Sparkles className="w-3 h-3" /> Original Prompt</p>
                    <p className="text-sm leading-relaxed line-clamp-4 text-[#DEDCDC] font-medium bg-black/40 p-4 rounded-xl border border-white/10 backdrop-blur-sm">{selectedResult?.prompt}</p>
                  </div>
                </div>

                {/* Close button for mobile */}
                <button onClick={() => setSelectedResult(null)} className="md:hidden absolute top-4 right-4 z-30 p-2 bg-black/50 backdrop-blur-md text-white rounded-full border border-white/20">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}