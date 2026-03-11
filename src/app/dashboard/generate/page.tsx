"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Sparkles, Image as ImageIcon, Box, LayoutGrid, UploadCloud, X, Loader2, Wand2, RefreshCw, Eraser, CheckCircle, Palette, Layers, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";

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
  const [strictBrandAlignment, setStrictBrandAlignment] = useState(true);
  const [numImages, setNumImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<GeneratedResult[]>([]);

  // --- State: Brand Context ---
  const [brandContext, setBrandContext] = useState<any>(null);

  // --- State: Modals & Refinement ---
  const [selectedResult, setSelectedResult] = useState<GeneratedResult | null>(null);
  const [refinementTab, setRefinementTab] = useState<"fresh" | "retouch">("fresh");
  const [modalPrompt, setModalPrompt] = useState("");
  const [retouchPrompt, setRetouchPrompt] = useState(""); // ✨ New state for magic retouch instructions
  const [isRefining, setIsRefining] = useState(false); // ✨ Loading state for modal buttons

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
          useBrand: strictBrandAlignment,
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

    try {
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
      // ✨ FIX: This is the full prompt that actually goes to the AI
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
            caption: finalPrompt, // Save the FULL prompt so it shows up in the modal
            status: "draft",
            image_urls: [url],
            ai_model: 'nano-banana-studio'
          })
          .select()
          .single();

        if (error) console.error("Failed to save to grid:", error);
        if (contentRecord) {
          // ✨ Ensure we pass the finalPrompt here so the modal opens with it!
          newResults.push({ id: contentRecord.id, url, prompt: finalPrompt, mode: selectedMode });
        }
      }

      setGeneratedResults(prev => [...newResults, ...prev]);

    } catch (error: any) {
      console.error(error);
      alert(`Generation failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Refinement Logic (Modal Buttons) ---
  const handleRefine = async (type: "fresh" | "retouch") => {
    if (!selectedResult || !clientId) return;

    // Ensure they typed something if retouching
    if (type === "retouch" && !retouchPrompt.trim()) {
      return alert("Please enter instructions on what you want to change.");
    }

    setIsRefining(true);

    try {
      // 1. Determine n8n payload based on the tab
      // If "fresh", we do a standard generation with the image as a reference.
      // If "retouch", we hit your n8n's "edit" mode (qwen/image-edit).
      const wfMode = type === "fresh" ? "standard" : "edit";
      const wfPrompt = type === "fresh" ? modalPrompt : retouchPrompt;

      // 2. Trigger n8n
      const response = await triggerWorkflow("blink-generate-images", {
        client_id: clientId,
        mode: wfMode,
        prompt: wfPrompt,
        reference_image_urls: [selectedResult.url], // Passing the current image!
        strict_brand_alignment: strictBrandAlignment,
        numImages: 1,
        is_sync: true
      });

      let newUrls: string[] = [];
      if (response && Array.isArray(response.imageUrls)) newUrls = response.imageUrls as string[];
      else if (response && response.imageUrls) newUrls = response.imageUrls as string[];

      if (newUrls.length === 0) throw new Error("No images were returned.");

      // 3. Save the new variation to the grid
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

        // Auto-switch the modal to the newly generated image!
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
    setModalPrompt(result.prompt); // Pre-fill the Fresh Take box with the full prompt
    setRetouchPrompt(""); // Clear the instruction box for Magic Retouch
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-20 animate-in fade-in relative">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold font-heading flex items-center gap-3">
            <Sparkles className="h-8 w-8" /> AI Image Studio
          </h1>
          <p className="mt-2 text-purple-100 max-w-xl text-sm leading-relaxed">
            Generate fresh aesthetic content, composite your products perfectly into new scenes, or build beautiful campaign grids.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Select Mode</h3>
            <div className="flex flex-col gap-3">
              {IMAGE_MODES.map((mode) => {
                const isSelected = selectedMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    onClick={() => { setSelectedMode(mode.id); setFiles([]); setPreviews([]); }}
                    className={cn(
                      "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3",
                      isSelected ? "border-purple-500 bg-purple-50 shadow-sm" : "border-gray-200 hover:border-purple-200"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg shrink-0", isSelected ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500")}>
                      <mode.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className={cn("text-sm font-bold", isSelected ? "text-purple-900" : "text-gray-700")}>{mode.title}</h4>
                      <p className="text-[10px] text-gray-500 mt-1 leading-tight">{mode.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-purple-500" /> Strict Brand Alignment
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {strictBrandAlignment
                    ? `Applying ${brandContext?.name || 'brand'} style guides.`
                    : "Ignoring brand guides for creative freedom."}
                </p>
              </div>
              <Switch checked={strictBrandAlignment} onCheckedChange={setStrictBrandAlignment} />
            </div>

            {selectedMode === "standard" && (
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800">Batch Size</h3>
                  <span className="text-sm font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{numImages} Images</span>
                </div>
                <Slider value={[numImages]} onValueChange={(v) => setNumImages(v[0])} min={1} max={10} step={1} className="py-1" />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Canvas & Generation */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex-1 flex flex-col space-y-6 relative">

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Visual Aesthetic</label>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 ring-purple-400 outline-none cursor-pointer hover:bg-gray-100 transition-colors"
              >
                {MARKETING_STYLES.map(style => (
                  <option key={style.id} value={style.id}>{style.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 relative">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-gray-800">Director's Prompt</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePromptHelp}
                  disabled={isHelpLoading}
                  className={cn("h-7 text-xs px-2 hover:bg-purple-50 hover:text-purple-600 transition-colors border border-transparent hover:border-purple-200", isHelpLoading && "animate-pulse")}
                >
                  {isHelpLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  {isHelpLoading ? "Writing..." : "AI Magic Writer"}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={selectedMode === 'product_drop' ? "Describe scene (e.g., 'on a sunny beach towel')..." : "Describe what you want to see..."}
                  className={cn("resize-none bg-gray-50 border-gray-200 h-28 focus-visible:ring-purple-400 pr-10 transition-all", isHelpLoading && "opacity-50")}
                  readOnly={isHelpLoading}
                />
                {isHelpLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles className="w-8 h-8 text-purple-500 animate-bounce opacity-50" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 text-right">The AI Writer will automatically adapt your prompt to fit the <b>{MARKETING_STYLES.find(s => s.id === selectedStyle)?.label}</b> style.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-gray-800">
                  Image Assets {activeConfig.requiresUpload && <span className="text-red-500">*</span>}
                </label>
                <span className="text-xs text-gray-500 font-medium">{files.length} / {activeConfig.maxUploads} Uploaded</span>
              </div>

              <div className="flex flex-wrap gap-4">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative w-24 h-24 rounded-lg border border-gray-200 overflow-hidden group shadow-sm">
                    <img src={src} className="w-full h-full object-cover" alt="upload preview" />
                    {selectedMode === 'product_drop' && (
                      <div className="absolute inset-0 bg-black/20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px', zIndex: -1 }}></div>
                    )}
                    <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {files.length < activeConfig.maxUploads && (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all text-gray-400",
                      isDragActive ? "border-purple-500 bg-purple-50 text-purple-500 scale-105" : "border-gray-300 hover:border-purple-400 hover:bg-purple-50 hover:text-purple-500"
                    )}
                  >
                    <input {...getInputProps()} />
                    <UploadCloud className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight px-1">
                      {isDragActive ? "Drop Here" : "Drag & Drop"}
                    </span>
                  </div>
                )}
              </div>
              {selectedMode === 'product_drop' && <p className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Pro Tip: Use transparent PNGs for best results.</p>}
              {selectedStyle === 'brand' && !brandContext?.logoUrl && <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ Warning: No logo found in your Brand Profile. Please upload one in the settings.</p>}
            </div>

            <div className="mt-auto pt-6 border-t border-gray-100 flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || (activeConfig.requiresUpload && files.length === 0) || isHelpLoading || (selectedStyle === 'brand' && !brandContext?.logoUrl)}
                className="bg-purple-600 hover:bg-purple-700 text-white h-12 px-8 font-bold shadow-md transition-all relative overflow-hidden"
              >
                {isGenerating ? (
                  <div className="flex items-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    <span>Generating...</span>
                    <div className="absolute bottom-0 left-0 h-1 bg-white/30 animate-progress w-full origin-left"></div>
                  </div>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" /> Generate {selectedMode === 'standard' && numImages > 1 ? `${numImages} Images` : 'Image'}</>
                )}
              </Button>
            </div>
          </div>

          {/* RESULTS AREA */}
          {(isGenerating || generatedResults.length > 0) && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 shadow-inner min-h-[300px] animate-in fade-in-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-500" /> Studio Results
                </h3>
                {generatedResults.length > 0 && !isGenerating && <span className="text-xs text-gray-500">{generatedResults.length} items saved to Grid</span>}
              </div>

              {isGenerating && generatedResults.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-100 border-t-purple-500 animate-spin"></div>
                    <Sparkles className="w-6 h-6 text-purple-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm font-medium animate-pulse">Nano Banana is painting your pixels...</p>
                </div>
              ) : (
                <div className={cn("grid gap-4", (selectedMode === 'grid' || selectedMode === 'organic_blend') ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4")}>
                  {generatedResults.map((result, idx) => (
                    <div
                      key={result.id + idx}
                      onClick={() => openModal(result)}
                      className="relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-purple-400 transition-all shadow-sm group cursor-pointer bg-gray-100"
                    >
                      <img src={result.url} alt={`Generated ${idx}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 backdrop-blur-sm text-purple-900 text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-2 transform scale-90 group-hover:scale-100 transition-transform">
                          <Sparkles className="w-3 h-3" /> Refine & Edit
                        </div>
                      </div>
                    </div>
                  ))}
                  {isGenerating && Array.from({ length: numImages }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="aspect-square rounded-xl bg-gray-200 animate-pulse relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
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
        <DialogContent className="max-w-[95vw] md:max-w-[1200px] p-0 overflow-hidden bg-white h-[90vh] md:h-[85vh] max-h-[900px] border-0 shadow-2xl rounded-2xl flex flex-col md:flex-row">
          {selectedResult && (
            <>
              {/* LEFT: Controls Panel */}
              <div className="w-full md:w-[340px] border-b md:border-b-0 md:border-r border-gray-200 bg-white flex flex-col shrink-0 order-2 md:order-1 h-[55%] md:h-full">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col">
                  <DialogHeader className="mb-6">
                    <DialogTitle className="text-xl font-heading flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-600" /> Refinement Hub
                    </DialogTitle>
                    <p className="text-xs text-gray-500 mt-1">Perfect your creation with advanced AI tools.</p>
                  </DialogHeader>

                  <Tabs value={refinementTab} onValueChange={(v: any) => setRefinementTab(v)} className="w-full flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                      <TabsTrigger value="fresh" className="text-xs gap-1.5 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700"><RefreshCw className="w-3.5 h-3.5" /> Fresh Take</TabsTrigger>
                      <TabsTrigger value="retouch" className="text-xs gap-1.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"><Eraser className="w-3.5 h-3.5" /> Magic Retouch</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 flex flex-col">
                      {refinementTab === "fresh" && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                          <p className="text-sm text-gray-600 bg-purple-50/50 border border-purple-100 p-3 rounded-lg leading-relaxed">
                            <strong className="text-purple-700 block mb-1">🔄 Remix the concept.</strong>
                            Edit your prompt below to generate a new variation using this image as a reference.
                          </p>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Refined Prompt</label>
                            <Textarea
                              value={modalPrompt}
                              onChange={(e) => setModalPrompt(e.target.value)}
                              className="resize-none h-32 text-sm bg-white border-gray-200 focus-visible:ring-purple-500 rounded-xl"
                            />
                          </div>
                          <Button
                            onClick={() => handleRefine("fresh")}
                            disabled={isRefining || !modalPrompt.trim()}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-11 rounded-xl shadow-sm"
                          >
                            {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            {isRefining ? "Generating..." : "Generate Variation"}
                          </Button>
                        </div>
                      )}

                      {refinementTab === "retouch" && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                          <p className="text-sm text-gray-600 bg-blue-50/50 border border-blue-100 p-3 rounded-lg leading-relaxed">
                            <strong className="text-blue-700 block mb-1">🪄 Provide instructions.</strong>
                            Tell the AI exactly what you want changed in the image (e.g., change colors, remove objects).
                          </p>
                          <Textarea
                            value={retouchPrompt}
                            onChange={(e) => setRetouchPrompt(e.target.value)}
                            placeholder="E.g., Change the sofa to red, remove the vase..."
                            className="resize-none text-sm h-32 bg-gray-50 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                          />
                          <Button
                            onClick={() => handleRefine("retouch")}
                            disabled={isRefining || !retouchPrompt.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 rounded-xl shadow-sm"
                          >
                            {isRefining ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                            {isRefining ? "Applying Magic..." : "Apply Magic Retouch"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </Tabs>
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t border-gray-100 flex gap-3 bg-gray-50/50 shrink-0">
                  <Button variant="outline" className="flex-1 h-10 rounded-xl text-gray-700 font-medium bg-white" onClick={() => window.open(selectedResult.url, '_blank')}>
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
                  <Button variant="outline" className="flex-1 h-10 rounded-xl text-gray-700 font-medium bg-white" onClick={() => alert('Share link copied to clipboard! (Coming soon)')}>
                    <Share2 className="w-4 h-4 mr-2" /> Share
                  </Button>
                </div>
              </div>

              {/* RIGHT: Image View */}
              <div className="flex-1 bg-[#0a0a0a] relative group overflow-hidden order-1 md:order-2 min-h-[45%] md:min-h-0 md:rounded-r-2xl">
                <img
                  src={selectedResult.url}
                  className="w-full h-full object-cover"
                  alt="Selected result"
                />

                {/* Prompt overlay on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pt-16 text-white opacity-0 group-hover:opacity-100 transition-opacity delay-100 pointer-events-none">
                  <p className="text-xs font-bold uppercase tracking-wider mb-1 text-purple-400">Original Prompt</p>
                  <p className="text-sm leading-relaxed line-clamp-3 text-gray-200">{selectedResult.prompt}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}