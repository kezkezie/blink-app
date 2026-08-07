"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, X, Sparkles, Loader2, Film, Settings2, Images, ScrollText, ImageIcon, Maximize2, Palette, Mic, FolderOpen, Wand2, Plus, Trash2, Video, CheckCircle, Save, Users, Lock, UserPlus, MessageSquare, ChevronUp, ChevronDown, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";
import type { VideoSetupProps } from "./types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SceneSpec } from "@/lib/scene-spec";
import {
  sceneSpecFromStoryboardScene,
  sceneSpecsFromDirectorOutput,
  sceneSpecsFromStoredSheetPanels,
} from "@/lib/scene-spec-adapters";
import { mintIdempotencyKey, submitVideoJob } from "@/lib/generation-job-client";
import type { ImageGenerationStatus } from "@/lib/image-generation-state";
import { summarizeSequence } from "@/lib/video-sequence-state";
import { observeSceneSet, type SceneSetObserver, type SceneSnapshot } from "@/lib/video-job-observer";
import { N8N_IMAGE_DEFAULT_COST, resolveImageEngine } from "@/lib/image-engine-pricing";
import {
  allowedAspectRatiosFor,
  allowedDurationsFor,
  estimateVideoCredits,
  generalReferenceSlotsFor,
  isEndFrameAllowedFor,
  modelSupportsEndFrame as registryModelSupportsEndFrame,
  resolveEffectiveVideoModel,
  videoModelFamily,
} from "@/lib/video-model-registry";
import {
  clearActiveSceneJob,
  persistActiveSceneJob,
  readActiveSceneJobs,
  type PersistedSceneJob,
} from "@/lib/durable-video-jobs";

/** How long one scene may be observed before it is presented as stale. The job
 *  is NOT cancelled — observation continues and a later durable terminal state
 *  replaces the stale presentation. */
const SCENE_STALE_MS = 15 * 60 * 1000;

/** A generate call awaits either a durable terminal snapshot or "stale". */
type SceneSettlement = SceneSnapshot | "stale";

// ============================================================================
// ✨ 1. ACTOR PROFILE TYPES & CASTING ROOM MODAL
// ============================================================================

export interface ActorProfile {
  id: string;
  name: string;
  stitchedSheetUrl: string;
  // ✨ Style pinning: variant actors ("sam · 2D Anime") keep their own medium
  // even when the scene's Render Engine genre differs — enables mixed media.
  styleLocked?: boolean;
  lockedStyleId?: string;
  baseActorId?: string; // for variants: the profile they were styled from (cache key)
}

interface CastingRoomModalProps {
  open: boolean;
  onClose: () => void;
  onSaveActor: (actor: ActorProfile) => void;
  onDeleteActor: (id: string) => void;
  actors: ActorProfile[];
  selectedActors: string[];
  onSelectActor: (actorId: string) => void;
  targetSlot: number;
  callN8n: (mode: 'director' | 'generator' | 'manual' | 'scene_video_generator', body: any) => Promise<any>;
  clientId: string | null;
  onPreviewActor: (url: string) => void;
  // ✨ Genre Studio: style a base actor into a genre variant, then refresh the list.
  onCreateVariant: (actor: ActorProfile, styleId: string, styleLabel: string) => Promise<string>;
}

function CastingRoomModal({ open, onClose, onSaveActor, onDeleteActor, actors, selectedActors, onSelectActor, targetSlot, callN8n, clientId, onPreviewActor, onCreateVariant }: CastingRoomModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isStitching, setIsStitching] = useState(false);

  const [actorName, setActorName] = useState("");
  const [angles, setAngles] = useState<(File | null)[]>(Array(6).fill(null));
  const [previews, setPreviews] = useState<(string | null)[]>(Array(6).fill(null));

  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [modelConsistency, setModelConsistency] = useState<"dynamic" | "consistent">("dynamic"); // ✨ NEW STATE
  const [creationMode, setCreationMode] = useState<"manual" | "ai">("manual");
  const [aiPrompt, setAiPrompt] = useState("");

  // ✨ Genre Studio: per-actor chosen style + which actor is currently styling
  const [variantStyleByActor, setVariantStyleByActor] = useState<Record<string, string>>({});
  const [stylingActorId, setStylingActorId] = useState<string | null>(null);

  const handleStyleActor = async (actor: ActorProfile) => {
    const styleId = variantStyleByActor[actor.id] || '3d_animation';
    const styleLabel = VISUAL_STYLES.find(s => s.id === styleId)?.label || styleId;
    const alreadyExists = actors.some(a => a.styleLocked && a.name === `${actor.name} · ${styleLabel}`);
    setStylingActorId(actor.id);
    try {
      await onCreateVariant(actor, styleId, styleLabel);
      if (alreadyExists) toast.warning(`"${actor.name} · ${styleLabel}" is already in your cast.`);
    } catch (err: any) {
      toast.error(`Styling failed: ${err.message}`);
    } finally {
      setStylingActorId(null);
    }
  };
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  // Which engine renders the AI character sheet
  const [castEngine, setCastEngine] = useState<"nb2" | "gpt-image-2-text-to-image">("nb2");

  const CHARACTER_SHEET_INJECTION = "Character reference sheet, identical character, multiple angles, front view, side view, back profile, white background, hyper-realistic, highly detailed.";
  const ANGLE_LABELS = ["Front Face", "Left Profile", "Right Profile", "Front Body", "Side Body", "Back Body"];

  const handleAngleUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newAngles = [...angles];
    const newPreviews = [...previews];
    newAngles[index] = file;
    newPreviews[index] = URL.createObjectURL(file);
    setAngles(newAngles);
    setPreviews(newPreviews);
  };

  const removeAngle = (index: number) => {
    const newAngles = [...angles];
    const newPreviews = [...previews];
    newAngles[index] = null;
    newPreviews[index] = null;
    setAngles(newAngles);
    setPreviews(newPreviews);
  };

  const handleSaveAndStitch = async () => {
    if (!actorName.trim()) { toast.warning("Please name your actor."); return; }
    if (actors.some(a => !a.styleLocked && (a.name || '').trim().toLowerCase() === actorName.trim().toLowerCase()))
      { toast.warning(`An actor named "${actorName.trim()}" already exists. Pick a distinct name so the AI can tell them apart.`); return; }
    if (angles.filter(a => a !== null).length === 0) { toast.warning("Please upload at least one angle."); return; }
    if (!clientId) return;

    setIsStitching(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1536;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImage = (file: File): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      };

      for (let i = 0; i < 6; i++) {
        if (angles[i]) {
          const img = await loadImage(angles[i]!);
          const col = i % 3;
          const row = Math.floor(i / 3);
          const size = 512;
          const scale = Math.max(size / img.width, size / img.height);
          const x = (size / 2) - (img.width / 2) * scale;
          const y = (size / 2) - (img.height / 2) * scale;

          ctx.save();
          ctx.beginPath();
          ctx.rect(col * size, row * size, size, size);
          ctx.clip();
          ctx.drawImage(img, (col * size) + x, (row * size) + y, img.width * scale, img.height * scale);
          ctx.restore();
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Failed to create stitched image");

      // ✨ CLOUDINARY DIRECT UPLOAD LOGIC ✨
      const formData = new FormData();
      formData.append("file", blob);
      formData.append("upload_preset", "blinkspot_casts"); // 🚨 You must create this in Cloudinary!
      formData.append("folder", "blinkspot/casts");

      // Using your actual Cloudinary cloud name: dap8jijxa
      const uploadRes = await fetch("https://api.cloudinary.com/v1_1/dap8jijxa/image/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error?.message || "Cloudinary upload failed");

      const publicUrl = uploadData.secure_url;

      const { data, error } = await supabase.from('assets').insert({
        client_id: clientId,
        asset_type: 'image',            // DB constraint rejects 'actor_profile'
        storage_provider: 'cloudinary', // constrained to cloudinary/supabase
        purpose: 'actor_profile',       // marker used to fetch actors
        file_name: actorName,           // actor display name
        file_url: publicUrl
      }).select('id').single();

      if (error) throw new Error(error.message);
      if (data) {
        onSaveActor({ id: data.id, name: actorName, stitchedSheetUrl: publicUrl });
      }
      setIsCreating(false);
      setActorName("");
      setAngles(Array(6).fill(null));
      setPreviews(Array(6).fill(null));

    } catch (err: any) {
      console.error(err);
      toast.error("Failed to stitch actor sheet: " + err.message);
    } finally {
      setIsStitching(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!actorName.trim()) { toast.warning("Please name your actor."); return; }
    if (actors.some(a => !a.styleLocked && (a.name || '').trim().toLowerCase() === actorName.trim().toLowerCase()))
      { toast.warning(`An actor named "${actorName.trim()}" already exists. Pick a distinct name so the AI can tell them apart.`); return; }
    if (!aiPrompt.trim()) { toast.warning("Please describe your character."); return; }
    if (!clientId) return;

    setIsGeneratingAI(true);
    try {
      const augmentedPrompt = `${CHARACTER_SHEET_INJECTION} ${aiPrompt}`;

      // ✨ ASYNC PIPELINE (same as storyboard slots): create a tracking row,
      // n8n responds {queued:true} instantly and writes the finished sheet URL
      // to the row — we poll it instead of holding the HTTP connection open.
      const { data: placeholder, error: phError } = await supabase.from('content').insert({
        client_id: clientId,
        content_type: 'post_image',
        caption: `Casting Room: ${actorName} character sheet`,
        status: 'draft',
        generation_status_text: 'Queued...',
        ai_model: castEngine === 'nb2' ? 'nano-banana-2' : castEngine
      }).select('id').single();
      if (phError || !placeholder) throw new Error('Could not create a tracking row for this generation.');

      try {
        await callN8n('generator', {
          prompt: augmentedPrompt,
          client_id: clientId,
          post_id: placeholder.id,
          imageEngine: castEngine,
          actor_names: [actorName],
        });
      } catch (queueErr) {
        await supabase.from('content').delete().eq('id', placeholder.id);
        throw queueErr;
      }

      let sheetUrl: string | null = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { data: row } = await supabase.from('content')
          .select('image_urls,status,generation_status_text')
          .eq('id', placeholder.id).single();
        if (row?.status === 'failed') throw new Error(row.generation_status_text || 'Generation failed. Credits refunded.');
        const urls = (Array.isArray(row?.image_urls) ? row.image_urls : [row?.image_urls]).filter(Boolean);
        if (urls.length > 0) { sheetUrl = urls[0]; break; }
      }
      if (!sheetUrl) {
        // Mark the tracking row failed so it stops reading "Queued..." forever
        // (n8n may still PATCH it later if it eventually finishes).
        await supabase.from('content').update({ status: 'failed', generation_status_text: 'Timed out client-side — asset may still arrive in your Library.' }).eq('id', placeholder.id);
        throw new Error('The character sheet is taking unusually long — check your Library shortly before retrying.');
      }

      const genData = { url: sheetUrl };

      const { data, error } = await supabase.from('assets').insert({
        client_id: clientId,
        asset_type: 'image',
        storage_provider: 'cloudinary',
        purpose: 'actor_profile',
        file_name: actorName,
        file_url: genData.url
      }).select('id').single();

      if (error) throw new Error(error.message);
      if (data) {
        onSaveActor({ id: data.id, name: actorName, stitchedSheetUrl: genData.url });
      }
      // Actor now lives in the Casting Room — drop the tracking row so the
      // sheet doesn't appear as a post in the Content Grid.
      await supabase.from('content').delete().eq('id', placeholder.id);
      setIsCreating(false);
      setActorName("");
      setAiPrompt("");
      setCreationMode("manual");
    } catch (err: any) {
      console.error(err);
      toast.error("AI generation failed: " + err.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl custom-scrollbar">
        <DialogHeader className="border-b border-[#57707A]/20 pb-4">
          <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl"><Users className="w-5 h-5" /> Digital Casting Room</DialogTitle>
          <DialogDescription className="text-[#989DAA] font-medium">Save actors to use consistently across all your video scenes.</DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4">
            <div>
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Actor Name</label>
              <Input value={actorName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActorName(e.target.value)} placeholder="e.g., Emma (Lead)" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-lg shadow-inner h-11" />
            </div>

            <div className="flex gap-1 p-1 bg-[#191D23] border border-[#57707A]/30 rounded-lg shadow-inner">
              <button
                onClick={() => setCreationMode("manual")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "manual" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/40" : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
                )}
              >
                <Upload className="w-3.5 h-3.5" /> Manual Upload (Stitch)
              </button>
              <button
                onClick={() => setCreationMode("ai")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-xs font-bold transition-all",
                  creationMode === "ai" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/40" : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate with AI
              </button>
            </div>

            {creationMode === "manual" ? (
              <>
                <div>
                  <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 block">Upload Angles (The more, the better)</label>
                  <div className="grid grid-cols-3 gap-4">
                    {ANGLE_LABELS.map((label, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-center text-[#DEDCDC]/50 uppercase tracking-widest">{label}</span>
                        <div className="aspect-square bg-[#191D23] border-2 border-dashed border-[#57707A]/40 rounded-xl relative overflow-hidden group hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 transition-all shadow-inner">
                          {previews[i] ? (
                            <>
                              <img src={previews[i]!} className="w-full h-full object-cover" />
                              <button onClick={() => removeAngle(i)} className="absolute top-1.5 right-1.5 bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:scale-110 transition-all shadow-md"><X className="w-3 h-3" /></button>
                            </>
                          ) : (
                            <label className="w-full h-full flex items-center justify-center cursor-pointer">
                              <Upload className="w-5 h-5 text-[#57707A] group-hover:text-[#C5BAC4] transition-colors" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAngleUpload(i, e)} />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-5 border-t border-[#57707A]/20">
                  <Button variant="outline" className="flex-1 bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 h-11 font-bold rounded-lg" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-11 rounded-lg shadow-lg shadow-[#C5BAC4]/10 transition-all" onClick={handleSaveAndStitch} disabled={isStitching}>
                    {isStitching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    {isStitching ? "Stitching Sheet..." : "Save & Stitch Actor"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Character Description</label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., A 30-year-old female astronaut with red hair, wearing a white NASA spacesuit"
                    className="h-32 resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-lg shadow-inner text-sm custom-scrollbar"
                  />
                  <p className="text-[10px] text-[#989DAA] mt-2 font-medium">We'll automatically generate a multi-angle character reference sheet from this description.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Render Engine</label>
                  <div className="flex gap-1 p-1 bg-[#191D23] border border-[#57707A]/30 rounded-lg shadow-inner">
                    {([
                      { id: "nb2", label: "Nano Banana 2" },
                      { id: "gpt-image-2-text-to-image", label: "GPT Image 2" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCastEngine(opt.id)}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all",
                          castEngine === opt.id
                            ? "bg-[#C5BAC4] text-[#191D23] shadow-sm"
                            : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-5 border-t border-[#57707A]/20">
                  <Button variant="outline" className="flex-1 bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 h-11 font-bold rounded-lg" onClick={() => setIsCreating(false)}>Cancel</Button>
                  <Button className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold h-11 rounded-lg shadow-lg shadow-[#C5BAC4]/10 transition-all" onClick={handleAIGenerate} disabled={isGeneratingAI}>
                    {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {isGeneratingAI ? "Generating Sheet..." : "Generate Character Sheet"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <Button onClick={() => setIsCreating(true)} className="w-full bg-[#191D23] hover:bg-[#57707A]/20 text-[#C5BAC4] border border-[#57707A]/40 hover:border-[#C5BAC4]/50 shadow-sm h-12 rounded-xl font-bold transition-all">
              <UserPlus className="w-4 h-4 mr-2" /> Add New Actor
            </Button>

            {actors.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
                {actors.map(actor => {
                  const isSelected = selectedActors[targetSlot] === actor.id;
                  const lockedSlots = selectedActors.map((id, i) => id === actor.id ? i : -1).filter(i => i >= 0);
                  return (
                    <div key={actor.id} className={cn(
                      "rounded-xl p-2.5 bg-[#191D23] shadow-inner flex flex-col gap-3 transition-all relative border",
                      isSelected ? "border-[#C5BAC4] ring-1 ring-[#C5BAC4]/50" : "border-[#57707A]/30 hover:border-[#57707A]/80"
                    )}>
                      <button
                        onClick={() => confirm("Delete this actor?") && onDeleteActor(actor.id)}
                        className="absolute top-1.5 right-1.5 z-20 p-1.5 bg-red-500/90 hover:bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:opacity-100 transition-all scale-90 hover:scale-100"
                        title="Delete Actor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div
                        className="aspect-video rounded-lg overflow-hidden bg-[#0F1115] border border-[#57707A]/20 relative group cursor-pointer"
                        onClick={() => onPreviewActor(actor.stitchedSheetUrl)}
                      >
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                        {lockedSlots.length > 0 && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-md z-10">A{lockedSlots.map(s => s + 1).join("+")}</div>}
                      </div>
                      <span className="text-xs font-bold text-center text-[#DEDCDC] truncate px-1">{actor.name}</span>
                      <button
                        onClick={() => onSelectActor(isSelected ? "" : actor.id)}
                        className={cn(
                          "w-full text-[10px] font-bold py-2 rounded-lg transition-colors uppercase tracking-wider",
                          isSelected ? "bg-[#C5BAC4] text-[#191D23] shadow-md" : "bg-[#2A2F38] text-[#989DAA] hover:bg-[#57707A]/40 hover:text-[#DEDCDC] border border-[#57707A]/30"
                        )}
                      >
                        {isSelected ? `✓ Actor ${targetSlot + 1}` : "Select"}
                      </button>

                      {/* ✨ GENRE STUDIO — base actors only. Style into a genre once; reused free. */}
                      {actor.styleLocked ? (
                        <div className="text-[9px] font-bold text-center text-[#57707A] uppercase tracking-widest py-1 flex items-center justify-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Style Locked
                        </div>
                      ) : (
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={variantStyleByActor[actor.id] || '3d_animation'}
                            onChange={(e) => setVariantStyleByActor(prev => ({ ...prev, [actor.id]: e.target.value }))}
                            disabled={stylingActorId === actor.id}
                            className="flex-1 min-w-0 text-[9px] font-bold text-[#DEDCDC] bg-[#2A2F38] border border-[#57707A]/30 rounded-lg px-1.5 py-1.5 cursor-pointer appearance-none focus:outline-none"
                          >
                            {VISUAL_STYLES.filter(s => s.id !== 'none').map(s => (
                              <option key={s.id} value={s.id} className="bg-[#191D23]">{s.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleStyleActor(actor)}
                            disabled={stylingActorId === actor.id}
                            title="Generate this actor in the chosen genre (~60s, reused free afterwards)"
                            className="shrink-0 text-[9px] font-bold text-[#191D23] bg-[#C5BAC4] hover:bg-white rounded-lg px-2 py-1.5 uppercase tracking-wider transition-colors disabled:opacity-60 flex items-center gap-1"
                          >
                            {stylingActorId === actor.id
                              ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> …</>
                              : <><Sparkles className="w-2.5 h-2.5" /> Style</>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ✨ 2. THE MAIN STORYTELLING SETUP COMPONENT
// ============================================================================

type StoryboardScene = any & {
  videoUrl?: string | null;
  isGeneratingVideo?: boolean;
  prompt?: string;
  aiModel?: string;
  useEndFrame?: boolean;
  duration?: string;
  location?: string; // ✨ scene location label from the Director (Env Lock is scene 1's location)
  prunaDraft?: boolean;
  audioPrompt?: string;
  seedanceImages?: (File | null)[];
  seedancePreviews?: (string | null)[];
  referenceVideoFile?: File | null;
  referenceVideoPreview?: string | null;
  // Remix (GPT Image 2 · Image→Image) source images — dedicated storage so it
  // never collides with Gemini's own reference slots (which use gptRefPreviews).
  remixSources?: (string | null)[];
};

type DirectorSheetBeat = {
  image_prompt?: string;
  video_prompt?: string;
  dialogue?: string;
  audio_prompt?: string;
  audioPrompt?: string;
  location?: string;
  aiModel?: string;
  ai_model?: string;
  duration?: string | number;
};

// ✨ We extend the props locally to safely accept the universal Aspect Ratio
export interface StorytellingSetupProps extends VideoSetupProps {
  bRollConcept: string;
  setBRollConcept: (val: string) => void;
  bRollScenes: StoryboardScene[];
  setBRollScenes: (scenes: StoryboardScene[] | ((prev: StoryboardScene[]) => StoryboardScene[])) => void;
  handleGenerateScenes: () => void;
  addEmptyScene: () => void;
  updateScene: (id: string, field: string, value: any) => void;
  removeScene: (id: string) => void;
  aspectRatio?: string;
  setAspectRatio?: (val: string) => void;
}

const VISUAL_STYLES = [
  { id: "none", label: "None (Follow Prompt Directly)" },
  { id: "cinematic", label: "Cinematic Realism" },
  { id: "3d_animation", label: "3D Animation (Pixar/Disney)" },
  { id: "anime", label: "2D Anime / Manga" },
  { id: "photoreal", label: "Photorealistic Photography" },
  { id: "claymation", label: "Stop-Motion Claymation" },
  { id: "cyberpunk", label: "Cyberpunk / Sci-Fi" },
  { id: "minimalist", label: "Minimalist Vector Art" }
];

// ✨ MODEL-AWARE INJECT PRESETS — each engine gets snippets written in its own
// prompting dialect (source of truth: AIS-OS references/video-model-prompting-rules.md).
type InjectPreset = { label: string; value: string };
type InjectSets = { camera: InjectPreset[]; sound: InjectPreset[]; physics: InjectPreset[]; timing: InjectPreset[] };

// Prompt dialect family now comes from the single model registry, so a new
// model gets the right INJECT_PRESETS by being registered — nothing to edit here.
const getModelFamily = (aiModel?: string): 'kling' | 'seedance' | 'pruna' | 'sora' | 'gemini' | 'auto' =>
  videoModelFamily(aiModel);

// Stable short id for a style-reference URL — used as the cache/style key for
// custom-style actor variants (`${actorId}::custom-<hash>`). djb2 → base36.
const shortHash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const INJECT_PRESETS: Record<ReturnType<typeof getModelFamily>, InjectSets> = {
  // Kling 3.0: shot sizes + named moves; native audio described in-prompt; timing beats
  kling: {
    camera: [
      { label: "Tracking Medium Shot", value: " Tracking medium shot, " },
      { label: "Slow Dolly-in", value: " The camera slowly dollies in, " },
      { label: "Low-angle Wide", value: " Low-angle wide shot, " },
      { label: "Close-up", value: " Close-up, " },
      { label: "Camera Zooms In", value: " The camera zooms in, " },
      { label: "Handheld Cinematic", value: " Cinematic handheld, " },
    ],
    sound: [
      { label: "Room Ambience", value: " Faint ambient room tone in the background for a realistic vibe. " },
      { label: "Soft Piano BGM", value: " Soft piano BGM underneath. " },
      { label: "Street Ambience", value: " Busy street ambience, distant traffic hum. " },
      { label: "Rain on Window", value: " Rain patters softly against the window. " },
      { label: "Voiceover", value: ' Voiceover (warm voice, English, slow pace): "Type narration here". ' },
    ],
    physics: [
      { label: "Epic Slow-Motion", value: " Extreme slow-motion, cinematic time-dilation. " },
      { label: "Hyper Time-Lapse", value: " Hyper time-lapse, fast-moving clouds and shadows. " },
      { label: "Natural Performance", value: " The character's movements and expressions are natural and lifelike. " },
      { label: "Zero-Gravity", value: " Zero-gravity environment, objects floating gracefully. " },
    ],
    timing: [
      { label: "At 4 Seconds", value: " At the 4th second, " },
      { label: "At 8 Seconds", value: " At the 8th second, " },
      { label: "Final 3 Seconds", value: " In the final 3 seconds, " },
      { label: "Shot 2", value: "\nShot 2, " },
      { label: "Shot 3", value: "\nShot 3, " },
    ],
  },
  // Seedance 2: camera TYPE+SPEED+TRAJECTORY; physics forces; audio synced to beats; Cut to:
  seedance: {
    camera: [
      { label: "Dolly-in (6s)", value: " Camera executes a slow dolly-in over 6 seconds, " },
      { label: "Steadicam Glide", value: " Smooth steadicam glide forward, " },
      { label: "360° Orbit", value: " 360-degree orbit around the subject at medium distance, " },
      { label: "Handheld Tracking", value: " Handheld tracking shot with slight vertical bounce, " },
      { label: "Rack Focus", value: " Rack focus from foreground to background, " },
      { label: "Crane Up & Over", value: " Low-angle crane up and over, " },
    ],
    sound: [
      { label: "Footsteps in Sync", value: " Footsteps crunch in sync with each step. " },
      { label: "Impact on Beat", value: " The impact sound lands exactly on the visual hit. " },
      { label: "Bass Drop", value: " [cinematic bass drop synced to the action climax] " },
      { label: "Rising Ambience", value: " Ambient wind rises as the camera pulls back. " },
    ],
    physics: [
      { label: "Visible Momentum", value: " Weight shifts visibly as momentum carries the motion, " },
      { label: "Fabric in Wind", value: " Fabric billows and ripples, light material catching air before settling, heavier edges pulling downward, " },
      { label: "Realistic Debris", value: " Fragments scatter outward with realistic momentum on impact, " },
      { label: "Epic Slow-Motion", value: " Extreme slow-motion, cinematic time-dilation, " },
      { label: "Underwater Physics", value: " Underwater physics, bubbles rising, distorted light rays, " },
    ],
    timing: [
      { label: "Cut to Shot 2", value: "\n\nCut to: Shot 2: " },
      { label: "Cut to Shot 3", value: "\n\nCut to: Shot 3: " },
      { label: "Over 4 Seconds", value: " completing the movement over 4 seconds, " },
      { label: "Over 8 Seconds", value: " completing the movement over 8 seconds, " },
    ],
  },
  // Pruna P-Video: short, direct, present-tense, social energy — no film jargon
  pruna: {
    camera: [
      { label: "Direct to Camera", value: " looks directly at camera, " },
      { label: "Selfie Angle", value: " front-facing selfie angle, " },
      { label: "Quick Zoom to Face", value: " quick zoom to face, " },
    ],
    sound: [
      { label: "Upbeat Music", value: " upbeat background music, " },
      { label: "Natural Room Audio", value: " natural room audio, " },
    ],
    physics: [
      { label: "High Energy", value: " high-energy movement, fast-cut social feel, " },
      { label: "Expressive Reaction", value: " reacts expressively with big gestures, " },
    ],
    timing: [
      { label: "Then Quickly", value: " then quickly " },
    ],
  },
  // Sora 2: one move + one action; sensory "we hear"; beats; atmosphere-led
  sora: {
    camera: [
      { label: "Slow Push-in", value: " The camera pushes in slowly — one continuous move. " },
      { label: "Static Camera", value: " Static camera; the scene breathes on its own. " },
      { label: "Lateral Tracking", value: " Slow lateral tracking at eye level. " },
    ],
    sound: [
      { label: "We Hear: City", value: " We hear: distant traffic and a low wind. " },
      { label: "We Hear: Footsteps", value: " We hear: footsteps echoing on wet stone. " },
      { label: "We Hear: Quiet Room", value: " We hear: the quiet hum of a still room. " },
    ],
    physics: [
      { label: "Physical Weight", value: " Weight and texture feel physically real. " },
      { label: "Shifting Light", value: " Natural light shifts subtly across the scene. " },
    ],
    timing: [
      { label: "Hold Two Beats", value: " She holds for two beats, then " },
      { label: "A Beat Later", value: " A beat later, " },
    ],
  },
  // Gemini Omni: transformation language, creative-brief tone, no jargon
  gemini: {
    camera: [
      { label: "Camera Holds Static", value: " Camera holds static throughout. " },
      { label: "Gentle Push-in", value: " A gentle, slow push-in. " },
    ],
    sound: [],
    physics: [
      { label: "Still Comes to Life", value: " The stillness comes to life with subtle, natural motion. " },
      { label: "Light Shift", value: " Lighting shifts smoothly toward warm golden-hour sun. " },
    ],
    timing: [],
  },
  // Auto / unknown: the original generic presets
  auto: {
    camera: [
      { label: "Cinematic Tracking", value: " Cinematic tracking shot, " },
      { label: "Drone Flyover", value: " Slow drone flyover, " },
      { label: "Handheld Shaky", value: " Handheld shaky cam, " },
      { label: "Medium Close-up", value: " Medium close-up, " },
      { label: "Macro Close-up", value: " Extreme macro close-up, " },
      { label: "Smooth Dolly-in", value: " Smooth dolly-in, " },
      { label: "Slow Orbit", value: " Slow orbit around, " },
    ],
    sound: [
      { label: "Street Noise", value: " [ambient street noise] " },
      { label: "Rain & Thunder", value: " [heavy rain and thunder] " },
      { label: "Bass Drop", value: " [cinematic bass drop] " },
      { label: "Cafe Chatter", value: " [muffled cafe chatter] " },
      { label: "Whoosh Transition", value: " [whoosh transition] " },
    ],
    physics: [
      { label: "Zero-Gravity (Antigravity)", value: " Zero-gravity environment, objects floating gracefully in mid-air. " },
      { label: "Epic Slow-Motion", value: " Extreme slow-motion, 120fps, cinematic time-dilation. " },
      { label: "Hyper Time-Lapse", value: " Hyper time-lapse, fast-moving clouds and shadows. " },
      { label: "Underwater Physics", value: " Underwater physics, bubbles rising, distorted light rays. " },
      { label: "Reversed Time", value: " Reversed time, objects moving backwards perfectly. " },
    ],
    timing: [],
  },
};

export function StorytellingSetup({
  bRollConcept,
  setBRollConcept,
  bRollScenes,
  setBRollScenes,
  handleGenerateScenes,
  addEmptyScene,
  updateScene,
  removeScene,
  aspectRatio = "16:9",
  setAspectRatio,
  isSuggesting,
}: StorytellingSetupProps) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const router = useRouter();

  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [isCastingOpen, setIsCastingOpen] = useState(false);
  const [enableCharacterLock, setEnableCharacterLock] = useState(false);
  const [isCharacterLockModalOpen, setIsCharacterLockModalOpen] = useState(false);
  const [selectedActors, setSelectedActors] = useState<string[]>(["", "", ""]);
  // ✨ Custom Style Mode cast interplay: do locked actors get re-styled into the
  // reference image, or keep their own look (mixed media)? Asked once via popup,
  // then remembered as a flip-able toggle. `castStyleAsked` marks combos we've
  // already prompted so the dialog never nags.
  const [castFollowsCustomStyle, setCastFollowsCustomStyle] = useState(true);
  const castStyleAsked = useRef<Record<string, boolean>>({});
  const [castStylePrompt, setCastStylePrompt] = useState(false);
  const [castingTargetSlot, setCastingTargetSlot] = useState(0);

  const [modelConsistency, setModelConsistency] = useState<"dynamic" | "consistent">("dynamic"); // ✨ NEW STATE
  const [aiEnhance, setAiEnhance] = useState(true);
  const [localAspectRatio, setLocalAspectRatio] = useState("16:9");

  // ✨ Live mirror of bRollScenes. During bulk generation the closure's scene
  // array is a stale snapshot, so freshly generated frames from earlier scenes
  // were invisible to later ones — every frame rendered in isolation, causing
  // awkward scene-to-scene transitions. Continuity anchors read from this ref.
  const scenesRef = useRef<StoryboardScene[]>(bRollScenes);
  useEffect(() => { scenesRef.current = bRollScenes; }, [bRollScenes]);

  // ✨ ACTOR GENRE-VARIANT CACHE — an actor's sheet is restyled into the active
  // genre ONCE (5 credits), saved as an asset (purpose='actor_variant'), then
  // reused for every scene and every future session. Keyed `${actorId}::${styleId}`.
  // V3: the last durable placeholder created per scene. A re-generate passes it
  // as the retry parent so attempt lineage survives across attempts.
  const sceneJobIds = useRef<Record<string, string>>({});
  // V4: per-scene generation/billing/retry state, keyed by scene id. The
  // sequence aggregate below is derived from this — no separate "is anything
  // running" flag that could disagree with the per-scene truth.
  const [sceneJobs, setSceneJobs] = useState<Record<string, ImageGenerationStatus>>({});
  const actorVariantCache = useRef<Record<string, string>>({});
  // In-flight variant generations, keyed `${actorId}::${styleId}`, so concurrent
  // callers share one generation instead of double-spending credits.
  const variantInFlight = useRef<Record<string, Promise<string> | undefined>>({});

  // ✨ localStorage namespaced by active brand so Brand A's storyboard + env-lock
  // never leak into Brand B; switching brands resets the workspace. Legacy
  // un-namespaced keys migrate into the current brand once, then are removed.
  const brandKeySuffix = activeBrand?.id || 'default';
  const ENV_LOCK_KEY = `blink_environment_lock::${brandKeySuffix}`;
  const SCENES_KEY = `blink_storyboard_scenes::${brandKeySuffix}`;
  const STYLE_LOCK_KEY = `blink_style_lock::${brandKeySuffix}`;

  const makeDefaultScenes = () => Array.from({ length: 4 }).map((_, i) => ({
    id: crypto.randomUUID(),
    scene_number: i + 1,
    aiModel: "auto",
    useEndFrame: false,
    primaryFile: null,
    primaryPreview: null,
    secondaryFile: null,
    secondaryPreview: null,
    seedanceImages: [null],
    seedancePreviews: [null],
    referenceVideoFile: null,
    referenceVideoPreview: null,
    prompt: "",
    videoUrl: null,
    isGeneratingVideo: false
  }));

  // ✨ ENVIRONMENT LOCK — one location anchored across every scene so the story
  // doesn't teleport between backgrounds. Persisted per brand; clearable.
  const [environmentLockUrl, setEnvironmentLockUrl] = useState<string | null>(null);
  useEffect(() => {
    let saved = localStorage.getItem(ENV_LOCK_KEY);
    if (!saved) {
      const legacy = localStorage.getItem('blink_environment_lock');
      if (legacy) { localStorage.setItem(ENV_LOCK_KEY, legacy); localStorage.removeItem('blink_environment_lock'); saved = legacy; }
    }
    setEnvironmentLockUrl(saved || null);
  }, [ENV_LOCK_KEY]);
  const handleEnvironmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    const ext = file.name.split('.').pop();
    const path = `videos/${clientId}/env_lock_${Date.now()}.${ext}`;
    await supabase.storage.from('assets').upload(path, file);
    const url = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
    setEnvironmentLockUrl(url);
    localStorage.setItem(ENV_LOCK_KEY, url);
  };
  const clearEnvironmentLock = () => {
    setEnvironmentLockUrl(null);
    localStorage.removeItem(ENV_LOCK_KEY);
  };

  // ✨ CUSTOM STYLE MODE — when Render Engine is "None", the Global Style
  // Reference image IS the genre. The uploaded URL is persisted per brand so a
  // single upload is reused across every scene and survives reloads.
  const [styleLockUrl, setStyleLockUrl] = useState<string | null>(null);
  useEffect(() => {
    setStyleLockUrl(localStorage.getItem(STYLE_LOCK_KEY) || null);
  }, [STYLE_LOCK_KEY]);

  // ✨ STORYBOARD SHEET — one 2×2 production sheet supplies four coherent start
  // frames from a single image generation. Each crop retains its Director beat so
  // it can become a complete scene rather than an image with an empty prompt.
  const COMIC_KEY = `blink_comic::${brandKeySuffix}`;
  const COMIC_PANELS_KEY = `blink_comic_panels::${brandKeySuffix}`;
  const [studioMode, setStudioMode] = useState<'storyboard' | 'comic'>('storyboard');
  const [comicUrl, setComicUrl] = useState<string | null>(null);
  // V2: panels are SceneSpec v1. Sheets saved by the earlier bounded repair used
  // an ad-hoc panel shape; they are adapted on read so previously saved sheets
  // keep working without a migration.
  const [storyboardSheetPanels, setStoryboardSheetPanels] = useState<SceneSpec[]>([]);
  const [isGeneratingComic, setIsGeneratingComic] = useState(false);
  useEffect(() => {
    const savedUrl = localStorage.getItem(COMIC_KEY) || null;
    setComicUrl(savedUrl);
    try {
      const savedPanels = JSON.parse(localStorage.getItem(COMIC_PANELS_KEY) || "[]");
      setStoryboardSheetPanels(sceneSpecsFromStoredSheetPanels(savedPanels, savedUrl || ""));
    } catch {
      setStoryboardSheetPanels([]);
    }
  }, [COMIC_KEY, COMIC_PANELS_KEY]);

  // ✨ Start-frame-only: skip end frames (half the image credits; end frames often
  // don't improve outcome). Persisted per brand. Storyboard Sheet animation always uses
  // start-frame-only regardless of this toggle.
  const STARTFRAME_KEY = `blink_startframe_only::${brandKeySuffix}`;
  const [startFrameOnly, setStartFrameOnly] = useState(false);
  useEffect(() => {
    setStartFrameOnly(localStorage.getItem(STARTFRAME_KEY) === '1');
  }, [STARTFRAME_KEY]);
  const toggleStartFrameOnly = () => {
    setStartFrameOnly(prev => {
      const next = !prev;
      localStorage.setItem(STARTFRAME_KEY, next ? '1' : '0');
      // Turning ON immediately clears end frames from every scene.
      if (next) setBRollScenes(scenes => scenes.map(s => ({ ...s, useEndFrame: false })));
      return next;
    });
  };

  // ✨ Fresh start: clears scenes + concept so a new story never inherits ghost
  // prompts from the previous one. Environment Lock and actors are kept.
  const handleNewStoryboard = () => {
    if (!confirm("Start a new storyboard? This clears the current scenes and concept. Your Environment Lock and saved actors stay.")) return;
    setBRollConcept("");
    setBRollScenes(makeDefaultScenes());
    localStorage.removeItem(SCENES_KEY);
  };

  // Load this brand's storyboard (or scaffold defaults); re-runs on brand switch.
  useEffect(() => {
    let savedScenes = localStorage.getItem(SCENES_KEY);
    if (!savedScenes) {
      const legacy = localStorage.getItem('blink_storyboard_scenes');
      if (legacy) { localStorage.setItem(SCENES_KEY, legacy); localStorage.removeItem('blink_storyboard_scenes'); savedScenes = legacy; }
    }
    if (savedScenes) {
      try { setBRollScenes(JSON.parse(savedScenes)); return; } catch (e) { }
    }
    setBRollScenes(makeDefaultScenes());
  }, [SCENES_KEY]);

  // ✨ Fetch saved actors from Supabase — reusable so the Casting Room can
  // refresh the list after creating a new genre variant.
  const refreshActors = useCallback(async () => {
    if (!clientId) return;
    {
      // Actors are stored as asset_type 'image' (the DB check constraint rejects
      // 'actor_profile') with purpose='actor_profile' as the marker and the actor
      // name in file_name. storage_provider must be 'cloudinary'/'supabase' (also
      // constrained), so we can't stash the name there.
      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('client_id', clientId)
        .eq('asset_type', 'image')
        .in('purpose', ['actor_profile', 'actor_variant']);

      if (data) {
        const profiles = data.filter(d => d.purpose === 'actor_profile');
        const variants = data.filter(d => d.purpose === 'actor_variant');
        const profileById: Record<string, any> = Object.fromEntries(profiles.map(p => [p.id, p]));

        const baseActors = profiles.map(d => ({
          id: d.id,
          name: d.file_name || "Unknown Actor",
          stitchedSheetUrl: d.file_url,
          styleLocked: false
        }));

        // ✨ Styled genre variants live in the Casting Room too — named
        // "Actor · Style" and selectable like any actor. file_name is
        // `${actorId}::${styleId}`; skip orphans whose base actor was deleted.
        // styleLocked=true keeps their medium fixed regardless of scene genre.
        const variantActors = variants.map(v => {
          const [baseId, styleId] = String(v.file_name || '').split('::');
          const base = profileById[baseId];
          if (!base) return null;
          const styleLabel = styleId?.startsWith('custom-')
            ? 'Custom Style'
            : (VISUAL_STYLES.find(s => s.id === styleId)?.label || styleId || 'Styled');
          return {
            id: v.id,
            name: `${base.file_name || 'Actor'} · ${styleLabel}`,
            stitchedSheetUrl: v.file_url,
            styleLocked: true,
            lockedStyleId: styleId,
            baseActorId: baseId
          };
        }).filter(Boolean) as ActorProfile[];

        setActors([...baseActors, ...variantActors]);
      }
    }
  }, [clientId]);

  useEffect(() => { refreshActors(); }, [refreshActors]);

  useEffect(() => {
    if (bRollScenes.length > 0) {
      try {
        // ✨ THE FIX: Create a "lightweight" copy of the scenes to save.
        // We strip out the heavy Base64 previews and File objects to prevent QuotaExceeded errors.
        const lightScenesToSave = bRollScenes.map(scene => ({
          ...scene,
          // Clear out heavy Base64 strings from manual uploads
          primaryPreview: scene.primaryPreview?.startsWith('data:') ? null : scene.primaryPreview,
          secondaryPreview: scene.secondaryPreview?.startsWith('data:') ? null : scene.secondaryPreview,
          seedancePreviews: Array.isArray(scene.seedancePreviews)
            ? scene.seedancePreviews.map((p: string | null) => p?.startsWith('data:') ? null : p)
            : [null],
          referenceVideoPreview: scene.referenceVideoPreview?.startsWith('blob:') || scene.referenceVideoPreview?.startsWith('data:') ? null : scene.referenceVideoPreview,

          // Never try to stringify File objects
          primaryFile: null,
          secondaryFile: null,
          seedanceImages: [null],
          referenceVideoFile: null
        }));

        localStorage.setItem(SCENES_KEY, JSON.stringify(lightScenesToSave));
      } catch (e) {
        console.error("Failed to save scenes to localStorage. It might still be too large:", e);
      }
    }
  }, [bRollScenes, SCENES_KEY]);



  const [generatingSlot, setGeneratingSlot] = useState<{ index: number, type: 'primary' | 'secondary', seedanceIndex?: number, geminiIndex?: number } | null>(null);
  // ✨ Slots whose last generation failed (e.g. a 429 that exhausted retries) —
  // keyed `${index}-${type}` — so we can surface a per-scene Retry button.
  const [failedSlots, setFailedSlots] = useState<Set<string>>(new Set());
  const [libraryTarget, setLibraryTarget] = useState<{ index: number, type: 'primary' | 'secondary', seedanceIndex?: number, geminiIndex?: number, remixIndex?: number, kind?: 'motionVideo' } | null>(null);
  const [suggestingPromptIndex, setSuggestingPromptIndex] = useState<number | null>(null);

  const [regenDialogState, setRegenDialogState] = useState<{ isOpen: boolean; sceneId: string | null; index: number | null; slotType: 'primary' | 'secondary'; promptText: string; seedanceIndex?: number; geminiIndex?: number }>({
    isOpen: false, sceneId: null, index: null, slotType: 'primary', promptText: ""
  });

  const [isWritingScript, setIsWritingScript] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const [frameReferenceFile, setFrameReferenceFile] = useState<File | null>(null);
  const [frameReferencePreview, setFrameReferencePreview] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");

  // ✨ Ask once, the first time a custom style image and a locked actor coexist,
  // whether the cast should match the style. Keyed so a given style+cast combo
  // never re-prompts; the answer lives on as a toggle in the Character Lock panel.
  useEffect(() => {
    if (selectedStyle !== 'none' || !styleLockUrl || !enableCharacterLock) return;
    const lockedIds = selectedActors.filter(Boolean);
    if (lockedIds.length === 0) return;
    const key = `${styleLockUrl}::${lockedIds.join(',')}`;
    if (castStyleAsked.current[key]) return;
    castStyleAsked.current[key] = true;
    setCastStylePrompt(true);
  }, [selectedStyle, styleLockUrl, enableCharacterLock, selectedActors]);

  const moveSceneUp = (index: number) => {
    if (index <= 0) return;
    const newScenes = [...bRollScenes];
    [newScenes[index - 1], newScenes[index]] = [newScenes[index], newScenes[index - 1]];
    setBRollScenes(newScenes);
  };

  const moveSceneDown = (index: number) => {
    if (index >= bRollScenes.length - 1) return;
    const newScenes = [...bRollScenes];
    [newScenes[index], newScenes[index + 1]] = [newScenes[index + 1], newScenes[index]];
    setBRollScenes(newScenes);
  };

  const ensureArray = (val: any) => Array.isArray(val) ? val : [val || null];

  // Which video engines can transition between a start and an end keyframe.
  // Seedance uses sequential reference images (not an end frame) and Gemini Omni
  // has its own reference model, so both are excluded.
  // Capability comes from the registry (auto is treated as capable, matching the
  // previous behaviour: default scenes start as "auto").
  const modelSupportsEndFrame = (model?: string) => registryModelSupportsEndFrame(model);

  const totalImageSlots = bRollScenes.reduce((count, scene) => {
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    if (isSeedance2) {
      return count + ensureArray(scene.seedancePreviews || [null]).length;
    }
    return count + 1 + (scene.useEndFrame ? 1 : 0);
  }, 0);

  const filledImageSlots = bRollScenes.reduce((count, scene) => {
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    if (isSeedance2) {
      return count + ensureArray(scene.seedancePreviews || [null]).filter(p => p !== null).length;
    }
    return count + (scene.primaryPreview ? 1 : 0) + (scene.useEndFrame && scene.secondaryPreview ? 1 : 0);
  }, 0);

  const hasAnyImages = filledImageSlots > 0;
  const allVideosGenerated = bRollScenes.length > 0 && bRollScenes.every(s => s.videoUrl);

  // V4: record one scene's job state. Scenes absent from the map are treated as
  // idle by the aggregate below, so an untouched storyboard reads "ready to
  // generate" rather than claiming progress it has not made.
  const setSceneJob = useCallback((sceneId: string, next: Partial<ImageGenerationStatus>) => {
    setSceneJobs(prev => {
      const base: ImageGenerationStatus = prev[sceneId] ?? {
        generationState: "idle",
        billingState: "not_charged",
        retryState: "none",
        message: null,
        errorCode: null,
        attempt: 1,
      };
      return { ...prev, [sceneId]: { ...base, ...next } };
    });
  }, []);

  // ── V5: observation, restoration and settlement ──────────────────────────
  // One observer handle per observed scene, plus the resolver a generate call
  // awaits. Refs (not state) so re-renders never restart observation.
  const sceneObservers = useRef<Map<string, SceneSetObserver>>(new Map());
  const sceneSettlers = useRef<Map<string, (outcome: SceneSettlement) => void>>(new Map());
  const restoredForBrand = useRef<string | null>(null);

  /** Stop observing one scene and drop it from the restoration set. */
  const stopObservingScene = useCallback((sceneId: string) => {
    sceneObservers.current.get(sceneId)?.dispose();
    sceneObservers.current.delete(sceneId);
    if (activeBrand?.id) clearActiveSceneJob(activeBrand.id, sceneId);
  }, [activeBrand?.id]);

  /**
   * Observe one durable scene job. Safe to call for a brand-new submission or
   * for a scene restored after a refresh — it only ever OBSERVES, never submits,
   * so restoration can never create a second job (or a second n8n deduction).
   */
  const startObservingScene = useCallback((job: PersistedSceneJob) => {
    if (sceneObservers.current.has(job.sceneId)) return; // already watching
    if (activeBrand?.id) persistActiveSceneJob(activeBrand.id, job);
    // Retry lineage must survive restoration: a restored scene that later fails
    // and is retried should reference this placeholder as its parent.
    sceneJobIds.current[job.sceneId] = job.contentId;

    const handle = observeSceneSet({
      scenes: [job],
      observationTimeoutMs: SCENE_STALE_MS,
      onSceneSnapshot: (snap) => {
        setSceneJob(snap.sceneId, snap.status);
        if (snap.videoUrl) updateScene(snap.sceneId, "videoUrl", snap.videoUrl);
        if (snap.observationTimedOut) {
          sceneSettlers.current.get(snap.sceneId)?.("stale");
          sceneSettlers.current.delete(snap.sceneId);
        }
      },
      onSceneSettled: (snap) => {
        // A durable terminal state: stop watching, release the restoration slot,
        // and resolve whatever generate call is awaiting this scene.
        stopObservingScene(snap.sceneId);
        updateScene(snap.sceneId, "isGeneratingVideo", false);
        sceneSettlers.current.get(snap.sceneId)?.(snap);
        sceneSettlers.current.delete(snap.sceneId);
      },
      onSceneError: (sceneId, error) => {
        // Transient read problems are not failures; surface nothing louder than
        // the status panel already shows.
        console.warn(`[scene ${sceneId}] observation issue:`, error.code);
      },
    });
    sceneObservers.current.set(job.sceneId, handle);
  }, [activeBrand?.id, setSceneJob, updateScene, stopObservingScene]);

  /** Resolve when a scene reaches a durable terminal state, or "stale" first. */
  const waitForSceneSettlement = useCallback((sceneId: string): Promise<SceneSettlement> => {
    return new Promise<SceneSettlement>((resolve) => {
      sceneSettlers.current.set(sceneId, resolve);
    });
  }, []);

  // Restore in-flight scenes after a refresh or navigation. Observation only —
  // nothing is resubmitted, so no duplicate job and no second deduction.
  useEffect(() => {
    const brandId = activeBrand?.id;
    if (!brandId || !clientId) return;
    if (restoredForBrand.current === brandId) return;
    restoredForBrand.current = brandId;
    for (const job of readActiveSceneJobs(brandId)) startObservingScene(job);
  }, [activeBrand?.id, clientId, startObservingScene]);

  // Dispose every observer on unmount so timers and channels never leak.
  useEffect(() => {
    const observers = sceneObservers.current;
    return () => {
      for (const handle of observers.values()) handle.dispose();
      observers.clear();
    };
  }, []);

  // The single source of truth for "how is this sequence doing?". Derived, never
  // stored, so it can never drift from the per-scene states.
  const sequenceStatus = summarizeSequence(
    bRollScenes.map((s, i) => ({
      sceneId: s.id,
      sceneNumber: i + 1,
      status: sceneJobs[s.id] ?? {
        // A scene that already holds a video from an earlier session reads as
        // ready, so returning users are not told to regenerate finished work.
        generationState: s.videoUrl ? "succeeded" : "idle",
        billingState: "not_charged",
        retryState: "none",
        message: null,
        errorCode: null,
        attempt: 1,
      },
      assetUrl: s.videoUrl ?? null,
    }))
  );

  const getLabels = (mode: string) => {
    switch (mode) {
      case "keyframe": return { primary: "Start Frame", secondary: "End Frame" };
      case "ugc": return { primary: "Product Shot", secondary: "Influencer Face" };
      case "clothing": return { primary: "Garment Flatlay", secondary: "Model Reference" };
      case "logo_reveal": return { primary: "Logo/Product", secondary: "End State" };
      case "showcase":
      default: return { primary: "Start Frame", secondary: "End Frame" };
    }
  };

  const callN8n = async (mode: 'director' | 'generator' | 'manual' | 'scene_video_generator', body: any) => {
    const endpoint = "/api/video/nano-banana";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...body })
    });
    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch (e) { throw new Error(`Server returned an invalid response.`); }
    if (!res.ok) throw new Error(data.error || `Error from ${mode} generator.`);
    return data;
  };

  // Prefer the already-uploaded persisted style URL (one upload reused across all
  // scenes + reloads). Only upload if a fresh file exists but wasn't persisted yet.
  const uploadRefImage = async (): Promise<string | null> => {
    if (styleLockUrl) return styleLockUrl;
    if (!frameReferenceFile || !clientId) return null;
    return persistStyleFile(frameReferenceFile);
  };

  // Upload a style-reference file, persist its URL per brand, and return it.
  const persistStyleFile = async (file: File): Promise<string | null> => {
    if (!clientId) return null;
    const ext = file.name.split(".").pop();
    const path = `videos/${clientId}/story_ref_${Date.now()}.${ext}`;
    await supabase.storage.from("assets").upload(path, file);
    const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
    setStyleLockUrl(url);
    localStorage.setItem(STYLE_LOCK_KEY, url);
    return url;
  };

  const base64ToBlob = (base64: string, mimeType: string) => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const generateScript = async (): Promise<{ prompts: string[]; scenes: StoryboardScene[] }> => {
    setIsWritingScript(true);
    let generatedPrompts: string[] = [];
    let generatedScenes: StoryboardScene[] = bRollScenes;
    try {
      const directorData = await callN8n('director', {
        clientId: clientId,
        prompt: `Concept: ${bRollConcept}\n\nCRITICAL: Break this concept into a dynamic sequence of scenes. For each scene, write the "image_prompt" and "video_prompt". ALSO, intelligently select the best 'aiModel' ('bytedance/seedance-2', 'kling-3.0/video', 'replicate:openai/sora-2', or 'replicate:prunaai/p-video'), a 'duration' (5, 10, or 15). Do NOT choose an end frame: end frames cost an extra paid image and are the user's explicit choice.`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        sceneConfigs: bRollScenes.map(scene => ({ aiModel: scene.aiModel })),
        consistencyMode: modelConsistency, // ✨ PASS PREFERENCE TO AI
        startFrameOnly // Director shouldn't plan end-frame transitions when true
      });

      const scenesData = directorData.scenes || [];
      let currentScenes = [...bRollScenes];

      if (scenesData.length > currentScenes.length) {
        const scenesToAdd = scenesData.length - currentScenes.length;
        for (let i = 0; i < scenesToAdd; i++) {
          const aiData = scenesData[currentScenes.length + i] || {};
          const addedModel = aiData.aiModel || aiData.ai_model || "auto";
          currentScenes.push({
            id: crypto.randomUUID(),
            scene_number: currentScenes.length + i + 1,
            // ✨ FIX: Safely catch snake_case or camelCase keys from the AI
            aiModel: addedModel,
            // ✨ Auto-enable the End Frame slot for engines that support keyframe
            // transitions. The AI Director often returns useEndFrame:false even for
            // Kling/Sora, which left the End Frame slot greyed out and ungenerated.
            // NEVER auto-enable: an end frame costs a second paid image
            // generation, so turning it on is the user's spending decision.
            // `supportsEndFrame` only decides whether the toggle is OFFERED.
            useEndFrame: false,
            primaryFile: null,
            primaryPreview: null,
            secondaryFile: null,
            secondaryPreview: null,
            seedanceImages: [null],
            seedancePreviews: [null],
            referenceVideoFile: null,
            referenceVideoPreview: null,
            prompt: "",
            videoUrl: null,
            isGeneratingVideo: false,
            duration: String(aiData.duration || "5")
          });
        }
      }

      const updatedScenes = currentScenes.map((scene, i) => {
        const aiData = scenesData[i] || {};
        // ✨ SPLIT PROMPTS: scene.prompt = motion/video prompt (Scene Director box),
        // scene.imagePrompt = still-frame prompt (edited via the Re-Gen modal).
        // The Director returns both; previously image_prompt was thrown away.
        const newVisualPrompt = aiData.video_prompt || aiData.image_prompt || "";
        const newImagePrompt = aiData.image_prompt || aiData.video_prompt || "";
        const finalPrompt = scene.prompt?.trim() || newVisualPrompt;
        const finalImagePrompt = scene.imagePrompt?.trim() || newImagePrompt;
        // ✨ Dedicated end-frame still prompt (scene's final moment, same set) so
        // end frames progress the action instead of re-rolling the start frame.
        const finalEndFramePrompt = scene.endFramePrompt?.trim() || aiData.end_frame_prompt || "";
        const finalModel = (aiData.aiModel || aiData.ai_model) ? (aiData.aiModel || aiData.ai_model) : scene.aiModel;

        return {
          ...scene,
          prompt: finalPrompt,
          imagePrompt: finalImagePrompt,
          endFramePrompt: finalEndFramePrompt,
          location: aiData.location || "",
          // ✨ FIX: Safely catch snake_case or camelCase keys from the AI
          aiModel: finalModel,
          duration: aiData.duration ? String(aiData.duration) : scene.duration,
          // ✨ Auto-enable End Frame for keyframe-capable engines (Kling/Sora/Pruna).
          // Seedance/Gemini stay false. Start-frame-only forces it off everywhere.
          // Always false — see the note above. Capability gates availability only.
          useEndFrame: false
        };
      });

      setBRollScenes(updatedScenes);
      // Bulk image generation should use the still-frame prompt when available
      generatedPrompts = updatedScenes.map(s => s.imagePrompt || s.prompt);
      generatedScenes = updatedScenes;

    } catch (err: any) {
      toast.error(`Script generation failed: ${err.message}`);
      throw err;
    } finally {
      setIsWritingScript(false);
    }
    return { prompts: generatedPrompts, scenes: generatedScenes };
  };

  const handleWriteScript = async () => {
    if (!bRollConcept.trim()) { toast.warning("Please enter a concept first."); return; }
    await generateScript();
  };

  const handleSuggestPrompt = async (sceneId: string, index: number) => {
    const scene = bRollScenes[index];
    const currentScenePrompt = scene.prompt || "";
    const fallbackConcept = bRollConcept.trim();

    if (!currentScenePrompt.trim() && !fallbackConcept) {
      { toast.warning("Please write a rough idea in this scene's prompt box, or fill out the Master Story Concept first."); return; }
    }

    setSuggestingPromptIndex(index);
    try {
      let aiInstruction = "";

      if (currentScenePrompt.trim()) {
        aiInstruction = `Refine and enhance the following rough scene idea into a highly descriptive, professional cinematic visual prompt (maximum 500 characters). \n\nRough idea to refine: "${currentScenePrompt.trim()}". \n\nCRITICAL: Write it in a highly descriptive narrative script format. Include setting, character actions, lighting, and exact spoken dialogue in quotes if applicable. Output ONLY the prompt.`;
      } else {
        aiInstruction = `Write a visual image prompt for Scene ${index + 1} based on this master concept: "${fallbackConcept}". CRITICAL: Write it in a highly descriptive narrative script format (maximum 500 characters). Include setting, character actions, camera movements, and exact spoken dialogue in quotes. Output ONLY the prompt.`;
      }

      const directorData = await callN8n('director', {
        prompt: aiInstruction,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        audioEngine: "video_native",
        totalDuration: 8
      });

      const suggestedPrompt = directorData.scenes?.[0]?.image_prompt || directorData.scenes?.[0]?.video_prompt || "Cinematic shot. Highly detailed.";
      updateScene(sceneId, "prompt", suggestedPrompt);

    } catch (err) {
      console.error(err);
      toast.error("Failed to suggest prompt. Check console for details.");
    } finally {
      setSuggestingPromptIndex(null);
    }
  };


  // ✨ Get (or generate once) an actor's sheet re-styled into the active genre.
  // Checks memory cache → Supabase assets → generates a single styled sheet and
  // persists it, so switching back to a genre is free and every scene uses the
  // SAME styled character instead of re-rolling per frame.
  // customStyleUrl set → style the actor into the medium of that reference IMAGE
  // (Custom Style mode) instead of a named genre label.
  const getOrCreateActorVariant = async (actor: ActorProfile, styleId: string, styleLabel: string, customStyleUrl?: string): Promise<string> => {
    const cacheKey = `${actor.id}::${styleId}`;
    if (actorVariantCache.current[cacheKey]) return actorVariantCache.current[cacheKey];
    if (variantInFlight.current[cacheKey]) return variantInFlight.current[cacheKey];

    const work = (async (): Promise<string> => {
    const { data: existing } = await supabase
      .from('assets')
      .select('file_url')
      .eq('client_id', clientId)
      .eq('asset_type', 'image')
      .eq('purpose', 'actor_variant')
      .eq('file_name', cacheKey)
      .limit(1);
    if (existing && existing[0]?.file_url) {
      actorVariantCache.current[cacheKey] = existing[0].file_url;
      return existing[0].file_url;
    }

    // One-time styled sheet generation from the identity anchor
    const { data: placeholder, error: phError } = await supabase.from('content').insert({
      client_id: clientId,
      brand_id: activeBrand?.id ?? null,
      content_type: 'post_image',
      caption: `Actor Variant: ${actor.name} · ${styleLabel}`,
      status: 'draft',
      generation_status_text: 'Queued...',
      ai_model: 'nano-banana-2'
    }).select('id').single();
    if (phError || !placeholder) throw new Error('Could not create tracking row for actor variant.');

    // Custom mode styles from a reference image (no named label); genre mode
    // styles from the label. Both preserve identity from the actor's own sheet.
    const styleTail = customStyleUrl
      ? `fully re-rendered in the exact art style, medium and color palette of the provided style reference image.`
      : `fully re-rendered in ${styleLabel} style.`;
    await callN8n('generator', {
      prompt: `Character reference sheet of "${actor.name}": full body, front view, side view and back view side by side on a clean neutral background. Preserve the exact same person from the reference image — same face, same skin tone, same ethnicity, same hair — ${styleTail}`,
      characterRefA: actor.stitchedSheetUrl,
      styleRefImage: customStyleUrl || undefined,
      client_id: clientId,
      post_id: placeholder.id,
      style_label: customStyleUrl ? null : styleLabel,
      actor_names: [actor.name],
    });

    let url: string | null = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const { data: row } = await supabase.from('content')
        .select('image_urls,status,generation_status_text')
        .eq('id', placeholder.id).single();
      if (row?.status === 'failed') throw new Error(row.generation_status_text || `Styling ${actor.name} failed. Credits refunded.`);
      const urls = ensureArray(row?.image_urls || []).filter(Boolean);
      if (urls.length > 0) { url = urls[0]; break; }
    }
    if (!url) {
      await supabase.from('content').update({ status: 'failed', generation_status_text: 'Timed out client-side — asset may still arrive in your Library.' }).eq('id', placeholder.id);
      throw new Error(`Styling ${actor.name} into ${styleLabel} timed out — check your Library shortly.`);
    }

    await supabase.from('assets').insert({
      client_id: clientId,
      asset_type: 'image',            // DB constraint rejects custom types
      storage_provider: 'cloudinary', // constrained to cloudinary/supabase
      purpose: 'actor_variant',       // marker: styled genre variant of an actor
      file_name: cacheKey,            // `${actorId}::${styleId}` — lookup key
      file_url: url
    });
    // Variant now lives in the Casting Room (assets) — remove the tracking row
    // so it doesn't clutter the Content Grid.
    await supabase.from('content').delete().eq('id', placeholder.id);
    actorVariantCache.current[cacheKey] = url;
    return url;
    })();
    variantInFlight.current[cacheKey] = work;
    try { return await work; } finally { delete variantInFlight.current[cacheKey]; }
  };

  const handleGenerateSlot = async (slotIndex: number, type: 'primary' | 'secondary' = 'primary', overridePrompt?: string, seedanceIndex: number = 0, scenesOverride?: StoryboardScene[], geminiIndex?: number) => {
    // scenesOverride lets bulk callers (handleGenerateAllImages) pass the just-fetched
    // AI Director scenes directly — bRollScenes here is a closure snapshot from the
    // last render and won't reflect a setBRollScenes() that happened earlier in the
    // same call stack (e.g. generateScript()'s fallback), so re-reading it would give
    // a stale aiModel/useEndFrame and misroute Seedance scenes through the wrong branch.
    const scenes = scenesOverride || bRollScenes;
    const scene = scenes[slotIndex];
    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
    // Gemini Omni stores its reference images in gptRefPreviews[geminiIndex] rather
    // than primaryPreview/seedancePreviews — route generation results there.
    const isGeminiRef = geminiIndex !== undefined;
    // Images prefer the still-frame prompt; scene.prompt stays the motion/video
    // prompt. NEVER fall back to the raw master concept — it produced images
    // driven by the Director's input instead of an actual scene description.
    // End frames prefer their dedicated end-frame prompt (scene's final moment).
    const promptToUse = overridePrompt
      || (type === 'secondary' ? scene.endFramePrompt : "")
      || scene.imagePrompt || scene.prompt || "";

    if (!promptToUse.trim()) { toast.warning("This scene has no prompt yet. Hit \"Write Scenes\" to let the Director script it, or use Suggest / type a scene description first."); return; }

    const NO_TEXT_CONSTRAINT = " CRITICAL: Do NOT output a character reference sheet, split screen, or multiple angles. Output a SINGLE, unified, cinematic scene featuring this exact character integrated naturally into the described environment.";

    // ✨ Locked actors: let the user drive them by NAME in the prompt, and make the
    // actor adopt the scene's genre/art style while keeping their identity.
    const lockedActors = (enableCharacterLock
      ? selectedActors.map(id => actors.find(a => a.id === id)).filter(Boolean)
      : []) as ActorProfile[];
    // ✨ Custom Style mode: the dropped image is the genre. "Keep their look"
    // (castFollowsCustomStyle=false) forces every base actor to be pinned (mixed
    // media); "Match the style" styles them into the reference image (resolveSheet).
    const customStyleActive = selectedStyle === 'none' && !!styleLockUrl;
    const customStyleUrl = customStyleActive ? styleLockUrl : null;
    const forceAllPinned = customStyleActive && !castFollowsCustomStyle;
    const genreLabel = customStyleActive
      ? "the reference style"
      : (VISUAL_STYLES.find(s => s.id === selectedStyle)?.label || "the scene's art style");
    // ✨ Split cast: genre-following actors adopt the scene's Render Engine style;
    // style-pinned variant actors (and all base actors in "keep their look") keep
    // their OWN medium (intentional mixed media).
    const pinnedActors = lockedActors.filter(a => a.styleLocked || forceAllPinned);
    const genreActors = lockedActors.filter(a => !pinnedActors.includes(a));
    let characterInstruction = "";
    if (genreActors.length > 0) {
      const roster = genreActors.map(a => `"${a.name}"`).join(", ");
      characterInstruction += ` CHARACTER LOCK: When the prompt names ${roster}, render that exact person from the provided character reference image — keep their identity, face, and proportions clearly recognizable — but FULLY RE-STYLE them into "${genreLabel}" so they match the scene's medium. Do NOT leave them photo-real if "${genreLabel}" is an illustrated, 3D, anime, or claymation style; the character must be rendered in that exact medium while still looking like the same person.`;
    }
    if (pinnedActors.length > 0) {
      const pinnedRoster = pinnedActors.map(a => `"${a.name}"`).join(", ");
      characterInstruction += ` MIXED-MEDIA LOCK: Render ${pinnedRoster} EXACTLY in the art style of their own reference sheet, preserving that exact medium even though the surrounding scene is "${genreLabel}". This mismatch is intentional — keep their identity, face and proportions, and do NOT convert them into the scene's medium.`;
    }

    // ✨ End frames must show story progression, not a re-roll of the start frame
    const endFrameInstruction = type === 'secondary'
      ? " END FRAME: depict the FINAL moment of this scene — the action visibly progressed from the start frame: new pose, new camera angle or new subject position. Same location, wardrobe and lighting. Do NOT replicate the start frame composition."
      : "";

    const safePrompt = promptToUse + characterInstruction + endFrameInstruction + NO_TEXT_CONSTRAINT;

    setGeneratingSlot({ index: slotIndex, type, seedanceIndex, geminiIndex });
    try {
      const styleRefUrl = await uploadRefImage();
      // ✨ Either/or: the style image only drives generation in Custom Style mode
      // (Render Engine = None). Under a named genre the image is ignored (zone is
      // greyed), so the label and the image never fight in n8n.
      const isCustomStyle = selectedStyle === 'none' && !!styleRefUrl;
      const effectiveStyleRef = isCustomStyle ? styleRefUrl : null;
      // ✨ CONTINUITY ANCHOR — read from live state, not the stale snapshot:
      //  • end frame continues from THIS scene's start frame
      //  • start frame continues from the PREVIOUS scene's last frame
      const liveScenes = scenesRef.current?.length ? scenesRef.current : scenes;
      let previousUrl: string | null = null;
      if (type === 'secondary') {
        previousUrl = liveScenes[slotIndex]?.primaryPreview || null;
      }
      if (!previousUrl && slotIndex > 0) {
        previousUrl = liveScenes[slotIndex - 1]?.secondaryPreview || liveScenes[slotIndex - 1]?.primaryPreview || null;
      }

      // ✨ Location-aware Environment Lock: the lock is the story's STARTING
      // location (scene 1). It applies only while the story stays there; when the
      // plot moves elsewhere, release the lock AND drop the cross-cut continuity
      // frame so a new location renders clean (no forest-in-prison blend).
      const lockLocation = (liveScenes[0]?.location || '').trim().toLowerCase();
      const sceneLocation = (liveScenes[slotIndex]?.location || scene.location || '').trim().toLowerCase();
      const envMatchesLock = !lockLocation || !sceneLocation || sceneLocation === lockLocation;
      const effectiveEnvLock = envMatchesLock ? environmentLockUrl : null;
      if (type === 'primary' && slotIndex > 0) {
        const prevLocation = (liveScenes[slotIndex - 1]?.location || '').trim().toLowerCase();
        if (prevLocation && sceneLocation && prevLocation !== sceneLocation) previousUrl = null;
      }

      // Resolve locked actors by slot (A/B/C) so multi-actor scenes keep every
      // cast member. When a genre is active, use the cached genre variant of each
      // actor (generated once, reused everywhere) instead of restyling per frame —
      // saves credits and keeps the styled character identical across scenes.
      const activeStyleLabel = selectedStyle !== 'none' ? (VISUAL_STYLES.find(s => s.id === selectedStyle)?.label || null) : null;
      const resolveSheet = async (slot: number): Promise<string | null> => {
        if (!enableCharacterLock) return null;
        const actor = actors.find(a => a.id === selectedActors[slot]);
        if (!actor) return null;
        // Style-pinned variants already ARE their final medium — use as-is, never
        // restyle into the scene genre (that's the mixed-media point).
        if (actor.styleLocked) return actor.stitchedSheetUrl;
        // Custom Style mode + "Match the style": style this base actor into the
        // reference IMAGE, cached once as `${actorId}::custom-<hash>`.
        if (customStyleActive && castFollowsCustomStyle && customStyleUrl) {
          const customId = 'custom-' + shortHash(customStyleUrl);
          try {
            return await getOrCreateActorVariant(actor, customId, 'Custom Style', customStyleUrl);
          } catch (e) {
            console.error(`Custom styling failed for ${actor.name}; using original sheet`, e);
            return actor.stitchedSheetUrl;
          }
        }
        if (!activeStyleLabel) return actor.stitchedSheetUrl;
        try {
          return await getOrCreateActorVariant(actor, selectedStyle, activeStyleLabel);
        } catch (e) {
          console.error(`Variant styling failed for ${actor.name}; falling back to original sheet`, e);
          return actor.stitchedSheetUrl;
        }
      };

      // ✨ Dead-URL guard: a locked actor whose Cloudinary sheet expired crashes
      // n8n at the vision step (the Amina incident). HEAD-check each locked sheet
      // and abort BEFORE spending credits or generating a variant.
      if (enableCharacterLock) {
        for (const slot of [0, 1, 2]) {
          const actor = actors.find(a => a.id === selectedActors[slot]);
          if (!actor) continue;
          let reachable = false;
          try { reachable = (await fetch(actor.stitchedSheetUrl, { method: 'HEAD' })).ok; } catch { reachable = false; }
          if (!reachable) {
            toast.error(`"${actor.name}"'s reference sheet is unreachable — it may have expired. Recreate them in the Casting Room before generating.`);
            setGeneratingSlot(null);
            return;
          }
        }
      }

      const characterSheetUrlA: string | null = await resolveSheet(0);
      const characterSheetUrlB: string | null = await resolveSheet(1);
      const characterSheetUrlC: string | null = await resolveSheet(2);

      // ✨ ASYNC PIPELINE: create a placeholder content row first. n8n responds
      // instantly ({queued:true}) and writes the finished frame URL to this row.
      // We poll the row instead of holding an HTTP connection open — the old
      // sync pattern died at the browser's ~5-minute fetch cap ("Failed to fetch")
      // even though n8n finished successfully.
      const { data: placeholder, error: phError } = await supabase
        .from("content")
        .insert({
          client_id: clientId,
          brand_id: activeBrand?.id ?? null,
          content_type: "post_image",
          caption: `Storyboard: Scene ${slotIndex + 1} ${type === 'primary' ? 'Start' : 'End'} Frame`,
          status: "draft",
          generation_status_text: "Queued...",
          ai_model: "nano-banana-2"
        })
        .select("id")
        .single();
      if (phError || !placeholder) throw new Error("Could not create a tracking row for this generation.");

      const sceneImageEngine = scene.imageEngine || 'nb2';
      try {
        await callN8n('generator', {
        prompt: safePrompt,
        refImage: effectiveStyleRef || previousUrl || null,
        styleRefImage: effectiveStyleRef,
        previousFrameImage: previousUrl,
        characterRefA: characterSheetUrlA,
        characterRefB: characterSheetUrlB,
        characterRefC: characterSheetUrlC,
        environmentRefImage: effectiveEnvLock,
        frame_role: type === 'secondary' ? 'end' : 'start',
        client_id: clientId,
        post_id: placeholder.id,
        // Explicit genre + cast names so the n8n prompt builder can enforce the
        // Render Engine style and preserve each actor's identity (skin tone,
        // ethnicity, hair) through the GPT rewrite.
        style_label: selectedStyle !== 'none' ? (VISUAL_STYLES.find(s => s.id === selectedStyle)?.label || null) : null,
        actor_names: lockedActors.map(a => a.name),
        // Pinned (style-locked) actors keep their own medium; n8n splits the
        // identity clause so these aren't re-rendered into the scene genre.
        pinned_actor_names: pinnedActors.map(a => a.name),
        imageEngine: sceneImageEngine,
        gptRefImages: sceneImageEngine === 'gpt-image-2-image-to-image'
          ? getRemixSources(scene).filter(Boolean)
          : undefined,
        geminiRefImages: scene.aiModel === 'gemini-omni-video'
          ? ensureArray(scene.gptRefPreviews || []).filter(Boolean)
          : undefined,
        });
      } catch (queueErr) {
        // Queueing failed (402 no credits, network) — the row will never be
        // updated by n8n, so remove it instead of leaving a phantom draft.
        await supabase.from('content').delete().eq('id', placeholder.id);
        throw queueErr;
      }

      // Poll the placeholder row until n8n saves the result (15 min cap, like video)
      let resultUrl: string | null = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { data: row } = await supabase
          .from('content')
          .select('image_urls,status,generation_status_text')
          .eq('id', placeholder.id)
          .single();
        if (row?.status === 'failed') {
          throw new Error(row.generation_status_text || 'Generation failed. Credits refunded.');
        }
        const urls = ensureArray(row?.image_urls || []).filter(Boolean);
        if (urls.length > 0) { resultUrl = urls[0]; break; }
      }
      if (!resultUrl) {
        await supabase.from('content').update({ status: 'failed', generation_status_text: 'Timed out client-side — asset may still arrive in your Library.' }).eq('id', placeholder.id);
        throw new Error("This frame is taking unusually long. It may still finish — check your Library in a few minutes before regenerating.");
      }

      const genData = { url: resultUrl };

      if (genData.url) {
        if (isGeminiRef) {
          setBRollScenes(currentScenes => {
            const newScenes = [...currentScenes];
            const oldScene = newScenes[slotIndex];
            const refPreviews = [...ensureArray(oldScene.gptRefPreviews || Array(5).fill(null))];
            refPreviews[geminiIndex!] = genData.url;
            newScenes[slotIndex] = { ...oldScene, gptRefPreviews: refPreviews, videoUrl: null };
            return newScenes;
          });

        } else if (isSeedance2) {
          setBRollScenes(currentScenes => {
            const newScenes = [...currentScenes];
            const oldScene = newScenes[slotIndex];

            const currentPreviews = ensureArray(oldScene.seedancePreviews || [null]);
            const currentFiles = ensureArray(oldScene.seedanceImages || [null]);

            const newPreviews = [...currentPreviews];
            const newFiles = [...currentFiles];

            newPreviews[seedanceIndex] = genData.url;
            newFiles[seedanceIndex] = null;

            newScenes[slotIndex] = {
              ...oldScene,
              seedancePreviews: newPreviews,
              seedanceImages: newFiles,
              primaryPreview: seedanceIndex === 0 ? genData.url : oldScene.primaryPreview,
              primaryFile: seedanceIndex === 0 ? null : oldScene.primaryFile,
              videoUrl: null
            };

            return newScenes;
          });

        } else {
          updateScene(scene.id, type === 'primary' ? "primaryPreview" : "secondaryPreview", genData.url);
          updateScene(scene.id, type === 'primary' ? "primaryFile" : "secondaryFile", null);
          updateScene(scene.id, "videoUrl", null);
        }

        // Auto-save insert removed: the placeholder row created above is updated
        // by n8n (Save Result to Supabase node) with the final URL + approved status.
      }
      // Success — clear any prior failure marker for this slot.
      setFailedSlots(prev => { const n = new Set(prev); n.delete(`${slotIndex}-${type}`); return n; });
    } catch (err: any) {
      console.error(err);
      setFailedSlots(prev => new Set(prev).add(`${slotIndex}-${type}`));
      toast.error(`Generation failed for Scene ${slotIndex + 1}: ${err.message}`);
    } finally {
      setGeneratingSlot(null);
    }
  };

  const handleGenerateAllImages = async () => {
    if (!bRollConcept.trim()) { toast.warning("Please enter a concept first."); return; }
    setIsGeneratingAllImages(true);

    // Default to the closure's bRollScenes — but if we have to run the AI
    // Director below, switch to ITS returned scenes instead. bRollScenes here
    // is a stale snapshot from the render that created this click handler;
    // setBRollScenes() inside generateScript() doesn't mutate it in place, so
    // reading bRollScenes after that call would still see pre-Director values
    // (useEndFrame/aiModel = scene defaults) and silently skip slots.
    let scenesToUse: StoryboardScene[] = bRollScenes;
    let currentPrompts = bRollScenes.map(s => s.imagePrompt || s.prompt);
    // ✨ Run the Director whenever ANY scene is missing its video prompt — not
    // only when every prompt is empty. A leftover hidden imagePrompt (e.g. from
    // localStorage) used to skip the Director entirely, generating images while
    // the Scene Director boxes stayed blank. generateScript preserves any text
    // the user already wrote.
    if (bRollScenes.some(s => !s.prompt?.trim())) {
      try {
        const result = await generateScript();
        currentPrompts = result.prompts;
        scenesToUse = result.scenes;
      } catch (e) { setIsGeneratingAllImages(false); return; }
    }

    // ✨ THIS IS THE SECRET TO PREVENTING SERVER CRASHES
    // We process them sequentially (one by one) to keep CPU usage low
    for (let i = 0; i < scenesToUse.length; i++) {
      const isSeedance2 = scenesToUse[i].aiModel === 'bytedance/seedance-2' || scenesToUse[i].aiModel === 'bytedance/seedance-2-fast';

      if (isSeedance2) {
        const previews = ensureArray(scenesToUse[i].seedancePreviews || [null]);
        for (let sIdx = 0; sIdx < previews.length; sIdx++) {
          if (!previews[sIdx] && currentPrompts[i]) {
            // AWAIT pauses the loop until this specific image is finished
            await handleGenerateSlot(i, 'primary', currentPrompts[i], sIdx, scenesToUse);
          }
        }
      } else {
        if (!scenesToUse[i].primaryPreview && currentPrompts[i]) {
          await handleGenerateSlot(i, 'primary', currentPrompts[i], 0, scenesToUse);
        }
        // Capability re-check at the POINT OF SPEND: never generate a paid
        // end-frame image for a model that cannot consume one, even if a stale
        // useEndFrame survived a model switch.
        if (
          scenesToUse[i].useEndFrame
          && isEndFrameAllowedFor(scenesToUse[i].aiModel, scenesToUse[i].mode)
          && !scenesToUse[i].secondaryPreview
          && currentPrompts[i]
        ) {
          await handleGenerateSlot(i, 'secondary', currentPrompts[i], 0, scenesToUse);
        }
      }
      // ✨ Stagger between scenes so 6 frames don't hit the GPT-4o Vision endpoint
      // inside one OpenAI TPM window (the 429 that failed whole frames). Combined
      // with the n8n retry-with-backoff, this keeps bulk runs from throttling.
      if (i < scenesToUse.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    setIsGeneratingAllImages(false);
  };

  // ✨ STORYBOARD SHEET — one coherent 2×2 production image instead of four
  // separately billed frame generations. Visual style is unrestricted.
  const handleGenerateComic = async () => {
    if (!clientId) return;
    if (!activeBrand?.id) { toast.warning("Please select a brand workspace first."); return; }
    if (!bRollConcept.trim()) { toast.warning("Write your story in the Master Story Concept box first."); return; }
    setIsGeneratingComic(true);
    try {
      // 1. Director → 4 coherent production beats (reuses continuity rules).
      const directorData = await callN8n('director', {
        clientId,
        prompt: `Concept: ${bRollConcept}\n\nBreak this into EXACTLY 4 sequential video scenes (establish, develop, turn, resolve) for a production storyboard sheet. For each scene return a detailed still-frame "image_prompt", an animation-ready "video_prompt", optional "dialogue", "audio_prompt", "location", the best "aiModel", and a duration. This is NOT a 2D comic: the chosen visual style must control the medium.`,
        style: VISUAL_STYLES.find(s => s.id === selectedStyle)?.label,
        consistencyMode: modelConsistency,
        startFrameOnly: true
      });
      const beats = ensureArray(directorData.scenes || []).slice(0, 4) as DirectorSheetBeat[];
      if (beats.length === 0) throw new Error("The Director didn't return any panels — try rephrasing your concept.");
      // V2: Director beats become validated SceneSpecs (snake_case/camelCase both
      // handled by the adapter). Provenance is attached once the sheet URL exists.
      const panels = sceneSpecsFromDirectorOutput(beats, {
        sourceIdea: bRollConcept,
        aspectRatio,
      });
      if (panels.some(panel => !panel.imagePrompt || !panel.videoPrompt)) {
        throw new Error("The Director returned an incomplete scene. Try generating the sheet again.");
      }
      const panelLines = beats.map((b, i) =>
        `Quadrant ${i + 1}: ${b.image_prompt || b.video_prompt || ''}`
      ).join(' ');

      // 2. Locked character refs so identity holds across every panel.
      const lockedActors = (enableCharacterLock
        ? selectedActors.map(id => actors.find(a => a.id === id)).filter(Boolean)
        : []) as ActorProfile[];
      const styleLabel = selectedStyle !== 'none' ? (VISUAL_STYLES.find(s => s.id === selectedStyle)?.label || null) : null;
      const customStyle = selectedStyle === 'none' && styleLockUrl ? styleLockUrl : null;

      const styleInstruction = styleLabel
        ? `Render every shot in ${styleLabel}.`
        : "Follow the requested medium in the story; photorealism, live action, 3D, animation, or illustration are all valid.";
      const comicPrompt = `Create one professional 2x2 VIDEO STORYBOARD CONTACT SHEET containing exactly four equal rectangular shots, read left-to-right then top-to-bottom. This is a production reference sheet, NOT comic-book artwork. ${styleInstruction} Each quadrant must be a clean ${aspectRatio} cinematic composition with no overlap across boundaries. Keep the same characters, faces, products, complete wardrobe, locations, lighting logic, and visual style consistent across all four shots. IMPORTANT: no captions, no speech bubbles, no words, no letters, no numbers, no logos added by the model, no comic ink treatment, and no decorative borders. Use only thin clean separation lines between quadrants. ${panelLines}`;

      // 3. One async generation (placeholder row + poll) — same contract as frames.
      const { data: placeholder, error: phError } = await supabase.from('content').insert({
        client_id: clientId, brand_id: activeBrand?.id ?? null, content_type: 'post_image',
        caption: `Storyboard Sheet: ${bRollConcept.slice(0, 60)}`, status: 'draft', generation_status_text: 'Queued...', ai_model: 'nano-banana-2'
      }).select('id').single();
      if (phError || !placeholder) throw new Error("Could not create a tracking row for the Storyboard Sheet.");

      try {
        await callN8n('generator', {
          prompt: comicPrompt,
          characterRefA: lockedActors[0]?.stitchedSheetUrl || null,
          characterRefB: lockedActors[1]?.stitchedSheetUrl || null,
          characterRefC: lockedActors[2]?.stitchedSheetUrl || null,
          styleRefImage: customStyle,
          client_id: clientId, post_id: placeholder.id,
          style_label: styleLabel,
          actor_names: lockedActors.map(a => a.name),
          imageEngine: 'nb2',
          aspect_ratio: aspectRatio,
        });
      } catch (queueErr) {
        await supabase.from('content').delete().eq('id', placeholder.id);
        throw queueErr;
      }

      let url: string | null = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: row } = await supabase.from('content').select('image_urls,status,generation_status_text').eq('id', placeholder.id).single();
        if (row?.status === 'failed') throw new Error(row.generation_status_text || 'Storyboard Sheet generation failed. Credits refunded.');
        const urls = ensureArray(row?.image_urls || []).filter(Boolean);
        if (urls.length > 0) { url = urls[0]; break; }
      }
      if (!url) {
        await supabase.from('content').update({ status: 'failed', generation_status_text: 'Timed out client-side — the Storyboard Sheet may still arrive in your Library.' }).eq('id', placeholder.id);
        throw new Error("The Storyboard Sheet is taking unusually long — check your Library shortly.");
      }
      // Attach sheet provenance now that the generated sheet URL is known, so a
      // scene prepared from a panel always knows which sheet and quadrant it came from.
      const panelsWithProvenance: SceneSpec[] = panels.map((panel, index) => ({
        ...panel,
        storyboardSheet: { sheetUrl: url as string, panelNumber: index + 1 },
      }));
      setComicUrl(url);
      setStoryboardSheetPanels(panelsWithProvenance);
      localStorage.setItem(COMIC_KEY, url);
      localStorage.setItem(COMIC_PANELS_KEY, JSON.stringify(panelsWithProvenance));
    } catch (err: any) {
      console.error(err);
      toast.error(`Storyboard Sheet generation failed: ${err.message}`);
    } finally {
      setIsGeneratingComic(false);
    }
  };

  // ✨ Crop one panel and restore its Director metadata into a ready-to-animate scene.
  const animateComicPanel = async (panelIndex: number) => {
    if (!comicUrl || !clientId) return;
    const panel = storyboardSheetPanels[panelIndex];
    if (!panel) { toast.warning("This saved sheet has no scene metadata. Regenerate it once before animating a panel."); return; }
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Could not load the Storyboard Sheet image.")); img.src = comicUrl; });
      const pw = Math.floor(img.naturalWidth / 2), ph = Math.floor(img.naturalHeight / 2);
      const sx = (panelIndex % 2) * pw, sy = Math.floor(panelIndex / 2) * ph;
      const canvas = document.createElement('canvas');
      canvas.width = pw; canvas.height = ph;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas unavailable.");
      ctx.drawImage(img, sx, sy, pw, ph, 0, 0, pw, ph);
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("Crop failed")), 'image/png'));
      const path = `videos/${clientId}/comic_panel_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(path, blob);
      if (uploadError) throw uploadError;
      const panelUrl = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;

      const newScene = {
        ...makeDefaultScenes()[0],
        scene_number: bRollScenes.length + 1,
        primaryPreview: panelUrl,
        useEndFrame: false,
        prompt: panel.videoPrompt || "",
        imagePrompt: panel.imagePrompt || "",
        audioPrompt: panel.audioDirection || panel.dialogue || "",
        location: panel.locationLabel || "",
        aiModel: panel.selectedModel || "auto",
        duration: panel.durationSeconds || "5",
        aspectRatio,
        storyboardSheetUrl: panel.storyboardSheet?.sheetUrl || comicUrl,
        storyboardSheetPanel: panel.storyboardSheet?.panelNumber ?? panelIndex + 1,
        // Carry the originating SceneSpec so narrative/direction metadata the
        // scene object has no field for survives into the generated clip.
        sceneSpec: panel,
      };
      setBRollScenes(prev => [...prev, newScene]);
      setStudioMode('storyboard');
      toast.success(`Scene ${panelIndex + 1} is ready with its start frame and motion prompt. Review it, then Generate Scene Video.`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Could not prepare this storyboard scene: ${err.message}`);
    }
  };

  const handleGenerateSingleVideo = async (slotIndex: number) => {
    const scene = bRollScenes[slotIndex];
    if (!clientId) return;
    // Guard: without an active brand the row would be saved with brand_id=null and
    // then never appear in the brand-scoped Story Sequences tab or editor library.
    if (!activeBrand?.id) {
      { toast.warning("Please select a brand workspace before generating videos."); return; }
    }

    const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';

    // Guard: never fall back to the raw master concept as the motion prompt —
    // the Director's input is not a scene description (mirrors the image path).
    if (!scene.prompt?.trim()) {
      { toast.warning("This scene has no motion prompt. Run \"Write Scenes\" or describe the scene in the Scene Director box first."); return; }
    }

    if (scene.useEndFrame && isEndFrameAllowedFor(scene.aiModel, scene.mode) && !scene.secondaryPreview && !isSeedance2) {
      { toast.warning("You enabled the End Frame toggle. Please generate or upload an End Frame before animating."); return; }
    }

    updateScene(scene.id, "isGeneratingVideo", true);

    try {
      let finalPrimaryUrl = null;
      if (isSeedance2 && scene.seedancePreviews && scene.seedancePreviews[0]) {
        finalPrimaryUrl = scene.seedancePreviews[0];
      } else {
        finalPrimaryUrl = scene.primaryPreview || null;
      }

      let finalSecondaryUrl = null;
      if (isSeedance2 && scene.seedancePreviews && scene.seedancePreviews[1]) {
        finalSecondaryUrl = scene.seedancePreviews[1];
      } else if (scene.useEndFrame) {
        finalSecondaryUrl = scene.secondaryPreview || null;
      }

      let finalReferenceVideoUrl = null;
      if (scene.referenceVideoFile) {
        const mimeExt = scene.referenceVideoFile.name.split('.').pop() || 'mp4';
        const vidPath = `videos/${clientId}/scene_ref_video_${Date.now()}.${mimeExt}`;
        await supabase.storage.from("assets").upload(vidPath, scene.referenceVideoFile);
        finalReferenceVideoUrl = supabase.storage.from("assets").getPublicUrl(vidPath).data.publicUrl;
      } else if (scene.referenceVideoPreview?.startsWith('http')) {
        // Picked from the Library — already hosted, no re-upload needed.
        finalReferenceVideoUrl = scene.referenceVideoPreview;
      }

      // Prefer the cached variant (populated during image generation) so the
      // video engine sees the same styled character as the frames. Style-pinned
      // variant actors keep their own sheet. In Custom Style mode the cache key
      // is the custom hash, not the genre id.
      const videoStyleKey = (selectedStyle === 'none' && styleLockUrl)
        ? 'custom-' + shortHash(styleLockUrl)
        : selectedStyle;
      const variantOrAnchor = (slot: number): string | null => {
        const actor = actors.find(a => a.id === selectedActors[slot]);
        if (!actor) return null;
        if (actor.styleLocked) return actor.stitchedSheetUrl;
        return actorVariantCache.current[`${actor.id}::${videoStyleKey}`] || actor.stitchedSheetUrl;
      };
      const characterSheetA = enableCharacterLock ? {
        actor_1_sheet: variantOrAnchor(0),
        actor_2_sheet: variantOrAnchor(1),
        actor_3_sheet: variantOrAnchor(2),
      } : null;

      if (finalPrimaryUrl && finalPrimaryUrl.startsWith('data:')) {
        const mimeMatch = finalPrimaryUrl.match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const blob = base64ToBlob(finalPrimaryUrl, mime);
        const path = `videos/${clientId}/scene_frame_1_${Date.now()}.png`;
        await supabase.storage.from("assets").upload(path, blob);
        finalPrimaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      }

      if (finalSecondaryUrl && finalSecondaryUrl.startsWith('data:')) {
        const mimeMatch = finalSecondaryUrl.match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const blob = base64ToBlob(finalSecondaryUrl, mime);
        const path = `videos/${clientId}/scene_frame_2_${Date.now()}.png`;
        await supabase.storage.from("assets").upload(path, blob);
        finalSecondaryUrl = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      }

      // V2: build the validated SceneSpec so scene intent survives the row (§13).
      const sceneSpec = sceneSpecFromStoryboardScene(
        {
          ...scene,
          scene_number: slotIndex + 1,
          primaryPreview: finalPrimaryUrl,
          secondaryPreview: finalSecondaryUrl,
        },
        { sourceIdea: bRollConcept, aspectRatio }
      );

      // V3: the placeholder is now created through the owned, DB-idempotent
      // video-job endpoint instead of a direct browser insert. The server
      // verifies client + brand ownership, re-validates the spec, and writes the
      // Slice-4 envelope (state triplet, attempt, idempotency key, retry
      // lineage). One key per attempt means a double submit returns the SAME
      // placeholder, so n8n can never be asked to deduct twice.
      // One freshly-minted key per ATTEMPT (never reused, or a genuine re-run
      // would idempotently return the previous placeholder). The key protects
      // against a duplicate delivery of the SAME attempt; re-entry from a second
      // click is blocked by the scene's `isGeneratingVideo` flag above.
      const idempotencyKey = mintIdempotencyKey("scene");
      // Re-generating a scene is a retry of its previous attempt: passing the
      // last placeholder as the parent preserves lineage and increments attempt.
      const previousJobId = sceneJobIds.current[scene.id];

      const submission = await submitVideoJob({
        brandId: activeBrand.id,
        idempotencyKey,
        contentType: "sequence_clip",
        sceneSpec,
        ...(previousJobId ? { retryOfContentId: previousJobId } : {}),
      });

      if (submission.ok) {
        sceneJobIds.current[scene.id] = submission.contentId;
        setSceneJob(scene.id, { generationState: "queued", retryState: "none", message: null, errorCode: null, attempt: submission.attempt });
      }
      if (!submission.ok) {
        throw new Error(
          submission.code === "unauthorized" ? "Your session expired — sign in again to generate this scene."
          : submission.code === "not_found" ? "That brand is no longer available for this workspace."
          : submission.code === "invalid_request" ? "This scene is missing something the generator needs. Review its prompt, model and duration."
          : "Could not queue this scene. Please try again."
        );
      }
      const postId = submission.contentId;

      await callN8n('scene_video_generator', {
        post_id: postId,
        client_id: clientId,
        content_type: "sequence_clip",
        ai_model_override: scene.aiModel || "auto",
        aspect_ratio: scene.aspectRatio || "16:9",
        video_resolution: scene.videoResolution || "720p",
        ...(scene.seed !== null && scene.seed !== undefined ? { seed: scene.seed } : {}),
        referenceVideoUrl: finalReferenceVideoUrl,
        scene_data: {
          visual_prompt: scene.prompt.trim(),
          ai_enhance: aiEnhance,
          video_mode: scene.mode,
          duration: scene.duration || "5",
          prunaDraft: scene.prunaDraft || false,
          referenceVideoUrl: finalReferenceVideoUrl,
          frames: {
            start_frame: finalPrimaryUrl,
            end_frame: finalSecondaryUrl
          },
          audio: {
            script: scene.audioPrompt || null,
            audio_url: null
          },
          casting: characterSheetA
        }
      });

      // V5: observation replaces the old inline 15-minute poll loop. The scene is
      // registered for durable restoration and watched by the SHARED observer
      // (Realtime-first, authenticated polling fallback, terminal latch,
      // forward-progress protection, honest local timeout). A refresh or
      // navigation re-attaches to exactly this row instead of losing it.
      // Register the awaiter BEFORE observation starts, otherwise a job that
      // settles immediately could resolve before anything is listening.
      const settlement = waitForSceneSettlement(scene.id);
      startObservingScene({ sceneId: scene.id, sceneNumber: slotIndex + 1, contentId: postId });

      const outcome = await settlement;

      if (outcome === "stale") {
        // Not a failure: the job may still finish. Observation continues in the
        // background and the panel shows honest "still working" copy, so the
        // bulk loop can move on to the next scene instead of blocking forever.
        toast.warning(`Scene ${slotIndex + 1} is taking longer than usual — it may still finish. We'll update it here.`);
        updateScene(scene.id, "isGeneratingVideo", false);
        return;
      }

      if (outcome.status.generationState !== "succeeded") {
        throw new Error(outcome.status.message || "The video engine reported a failure.");
      }

      // 1. Update the URL first
      if (outcome.videoUrl) updateScene(scene.id, "videoUrl", outcome.videoUrl);

      // 2. Give React 50ms to flush the state batch before turning off the loader
      setTimeout(() => {
        updateScene(scene.id, "isGeneratingVideo", false);
      }, 50);

    } catch (err: any) {
      console.error(`Failed to generate video for scene ${slotIndex + 1}:`, err);
      // Only mark failed if we did not already record an honest timeout above.
      setSceneJobs(prev => {
        const current = prev[scene.id];
        if (current?.generationState === "timed_out") return prev;
        return {
          ...prev,
          [scene.id]: {
            generationState: "failed",
            // Billing truth is unknown from the client: n8n refunds on failure,
            // but this path also covers submit/queue errors where nothing was
            // charged. `refund_pending` says "we don't yet know" without
            // claiming money back that may never have left.
            billingState: current?.billingState === "not_charged" ? "not_charged" : "refund_pending",
            retryState: "retry_available",
            message: err?.message ?? "Scene generation failed.",
            errorCode: "scene_generation_failed",
            attempt: current?.attempt ?? 1,
          },
        };
      });
      toast.error(`Scene ${slotIndex + 1} failed: ${err.message}`);
      updateScene(scene.id, "isGeneratingVideo", false);
    }
    // No finally block — success and failure are handled cleanly above!
  };

  const handleGenerateSceneVideos = async () => {
    setIsGeneratingVideos(true);
    for (let i = 0; i < bRollScenes.length; i++) {
      const scene = bRollScenes[i];
      if (scene.videoUrl) continue;
      await handleGenerateSingleVideo(i);
    }
    setIsGeneratingVideos(false);
  };

  const handleDeleteVideo = (sceneId: string) => {
    if (confirm("Are you sure you want to delete this video and re-enable image editing?")) {
      updateScene(sceneId, "videoUrl", null);
    }
  };

  const openRegenModal = (scene: any, index: number, slotType: 'primary' | 'secondary', seedanceIndex?: number, geminiIndex?: number) => {
    // Prefill ONLY with real scene prompts — never the master concept, which is
    // Director input, not an image description. End frames use their own prompt.
    const prefill = slotType === 'secondary'
      ? (scene.endFramePrompt || scene.imagePrompt || scene.prompt || "")
      : (scene.imagePrompt || scene.prompt || "");
    setRegenDialogState({ isOpen: true, sceneId: scene.id, index: index, slotType: slotType, promptText: prefill, seedanceIndex, geminiIndex });
  };

  const handleConfirmRegen = () => {
    const { sceneId, index, slotType, promptText, seedanceIndex, geminiIndex } = regenDialogState;
    if (!promptText.trim()) { toast.warning("Write an image prompt first — describe exactly what this frame should show."); return; }
    if (sceneId && index !== null) {
      // ✨ Save edits to the matching field — end frames to endFramePrompt, start
      // frames to imagePrompt. The Scene Director motion prompt (scene.prompt) is
      // untouched so Kling/Seedance keep their own script.
      updateScene(sceneId, slotType === 'secondary' ? "endFramePrompt" : "imagePrompt", promptText);
      handleGenerateSlot(index, slotType, promptText, seedanceIndex || 0, undefined, geminiIndex);
    }
    setRegenDialogState(prev => ({ ...prev, isOpen: false }));
  };

  // Remix sources live in scene.remixSources. Backward-compat: older saved scenes
  // stored them in gptRefPreviews, but NEVER read that on Gemini scenes (there it
  // is Gemini's own reference-slot storage).
  const getRemixSources = (scene: StoryboardScene): (string | null)[] => {
    const isGemini = scene.aiModel === 'gemini-omni-video';
    return ensureArray(scene.remixSources ?? (isGemini ? [] : scene.gptRefPreviews) ?? []);
  };

  // ✨ Remix Sources panel — one block reused by every scene layout (Seedance,
  // Gemini and default) so the Remix engine works everywhere, not just default.
  const renderRemixPanel = (scene: StoryboardScene, index: number) => {
    const writeSource = (rIdx: number, val: string | null) => {
      const p = [0, 1, 2, 3, 4].map(i => getRemixSources(scene)[i] ?? null);
      p[rIdx] = val;
      updateScene(scene.id, "remixSources", p);
    };
    return (
      <div className="mt-4 pt-4 border-t border-[#57707A]/20">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-[#C5BAC4] uppercase tracking-wider">
            Remix Sources <span className="text-[9px] text-[#57707A] normal-case font-medium">(up to 5)</span>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2, 3, 4].map((rIdx) => {
            const preview = getRemixSources(scene)[rIdx] || null;
            return (
              <div key={rIdx} className="flex flex-col gap-1">
                <div className={cn(
                  "relative aspect-square rounded-xl overflow-hidden bg-[#0F1115] border-2 flex items-center justify-center transition-all group/ri shadow-inner",
                  preview ? "border-[#C5BAC4]/40" : "border-dashed border-[#57707A]/30 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 cursor-pointer"
                )}>
                  {preview ? (
                    <>
                      <img src={preview} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => writeSource(rIdx, null)} className="absolute top-1 right-1 z-20 p-1 bg-red-500/90 text-white rounded-md opacity-0 group-hover/ri:opacity-100 transition-all">
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <label htmlFor={`remixsrc-${scene.id}-${rIdx}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors gap-1">
                      <ImageIcon className="h-4 w-4" />
                      <p className="text-[9px] font-bold">{rIdx + 1}</p>
                    </label>
                  )}
                  <input
                    id={`remixsrc-${scene.id}-${rIdx}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => writeSource(rIdx, ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                  />
                </div>
                <button type="button" title="Pick from library" onClick={() => setLibraryTarget({ index, type: 'primary', remixIndex: rIdx })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="h-6 flex items-center justify-center rounded-lg border border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <FolderOpen className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-[#57707A] mt-2 font-medium">Upload images to remix or transform · Max 30MB each · JPEG, PNG, WebP</p>
      </div>
    );
  };

  const handleLibrarySelect = (url: string) => {
    if (!libraryTarget) return;
    const scene = bRollScenes[libraryTarget.index];

    if (libraryTarget.kind === 'motionVideo') {
      updateScene(scene.id, "referenceVideoPreview", url);
      updateScene(scene.id, "referenceVideoFile", null);
      setLibraryTarget(null);
      return;
    } else if (libraryTarget.remixIndex !== undefined) {
      const p = [0, 1, 2, 3, 4].map(i => getRemixSources(scene)[i] ?? null);
      p[libraryTarget.remixIndex] = url;
      updateScene(scene.id, "remixSources", p);
    } else if (libraryTarget.geminiIndex !== undefined) {
      const refPreviews = [...ensureArray(scene.gptRefPreviews || Array(5).fill(null))];
      refPreviews[libraryTarget.geminiIndex] = url;
      updateScene(scene.id, "gptRefPreviews", refPreviews);
    } else if (libraryTarget.seedanceIndex !== undefined) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);
      const newPreviews = [...currentPreviews];
      const newFiles = [...currentFiles];
      newPreviews[libraryTarget.seedanceIndex] = url;
      newFiles[libraryTarget.seedanceIndex] = null;
      updateScene(scene.id, "seedancePreviews", newPreviews);
      updateScene(scene.id, "seedanceImages", newFiles);
      if (libraryTarget.seedanceIndex === 0) updateScene(scene.id, "primaryPreview", url);
    } else {
      const targetField = libraryTarget.type === "primary" ? "primaryPreview" : "secondaryPreview";
      updateScene(scene.id, targetField, url);
      updateScene(scene.id, libraryTarget.type === "primary" ? "primaryFile" : "secondaryFile", null);
    }
    updateScene(scene.id, "videoUrl", null);
    setLibraryTarget(null);
  };

  const removeSeedanceSlot = (sceneId: string, seedanceIndex: number) => {
    const scene = bRollScenes.find(s => s.id === sceneId);
    if (scene) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);

      const newPreviews = currentPreviews.filter((_, idx) => idx !== seedanceIndex);
      const newFiles = currentFiles.filter((_, idx) => idx !== seedanceIndex);

      if (newPreviews.length === 0) {
        updateScene(sceneId, "seedancePreviews", [null]);
        updateScene(sceneId, "seedanceImages", [null]);
        updateScene(sceneId, "primaryPreview", null);
      } else {
        updateScene(sceneId, "seedancePreviews", newPreviews);
        updateScene(sceneId, "seedanceImages", newFiles);
        updateScene(sceneId, "primaryPreview", newPreviews[0] || null);
      }
    }
    updateScene(sceneId, "videoUrl", null);
  };

  const clearSlot = (sceneId: string, type: 'primary' | 'secondary', seedanceIndex?: number) => {
    if (seedanceIndex !== undefined) {
      const scene = bRollScenes.find(s => s.id === sceneId);
      if (scene) {
        const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
        const currentFiles = ensureArray(scene.seedanceImages || [null]);
        const newPreviews = [...currentPreviews];
        const newFiles = [...currentFiles];
        newPreviews[seedanceIndex] = null;
        newFiles[seedanceIndex] = null;

        updateScene(sceneId, "seedancePreviews", newPreviews);
        updateScene(sceneId, "seedanceImages", newFiles);

        if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", null);
      }
    } else {
      updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", null);
      updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
    }
    updateScene(sceneId, "videoUrl", null);
  };

  const handleSceneFile = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, type: "primary" | "secondary", seedanceIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (seedanceIndex !== undefined) {
        const scene = bRollScenes.find(s => s.id === sceneId);
        if (scene) {
          const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
          const currentFiles = ensureArray(scene.seedanceImages || [null]);
          const newPreviews = [...currentPreviews];
          const newFiles = [...currentFiles];
          newPreviews[seedanceIndex] = event.target?.result as string;
          newFiles[seedanceIndex] = file;
          updateScene(sceneId, "seedancePreviews", newPreviews);
          updateScene(sceneId, "seedanceImages", newFiles);
          if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", event.target?.result as string);
        }
      } else {
        updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
        updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
      }
      updateScene(sceneId, "videoUrl", null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>, sceneId: string, type: "primary" | "secondary", seedanceIndex?: number) => {
    e.preventDefault(); e.stopPropagation();
    updateScene(sceneId, "videoUrl", null);

    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (seedanceIndex !== undefined) {
          const scene = bRollScenes.find(s => s.id === sceneId);
          if (scene) {
            const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
            const currentFiles = ensureArray(scene.seedanceImages || [null]);
            const newPreviews = [...currentPreviews];
            const newFiles = [...currentFiles];
            newPreviews[seedanceIndex] = event.target?.result as string;
            newFiles[seedanceIndex] = file;
            updateScene(sceneId, "seedancePreviews", newPreviews);
            updateScene(sceneId, "seedanceImages", newFiles);
            if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", event.target?.result as string);
          }
        } else {
          updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", event.target?.result as string);
          updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", file);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
    const url = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("URL");
    if (url) {
      if (seedanceIndex !== undefined) {
        const scene = bRollScenes.find(s => s.id === sceneId);
        if (scene) {
          const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
          const currentFiles = ensureArray(scene.seedanceImages || [null]);
          const newPreviews = [...currentPreviews];
          const newFiles = [...currentFiles];
          newPreviews[seedanceIndex] = url;
          newFiles[seedanceIndex] = null;
          updateScene(sceneId, "seedancePreviews", newPreviews);
          updateScene(sceneId, "seedanceImages", newFiles);
          if (seedanceIndex === 0) updateScene(sceneId, "primaryPreview", url);
        }
      } else {
        updateScene(sceneId, type === "primary" ? "primaryPreview" : "secondaryPreview", url);
        updateScene(sceneId, type === "primary" ? "primaryFile" : "secondaryFile", null);
      }
    }
  };

  const handleRefVideoDrop = async (e: React.DragEvent<HTMLDivElement>, sceneId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files?.length > 0 && e.dataTransfer.files[0].type.startsWith("video")) {
      const file = e.dataTransfer.files[0];
      updateScene(sceneId, "referenceVideoFile", file);
      updateScene(sceneId, "referenceVideoPreview", URL.createObjectURL(file));
    }
  };
  const handleRefVideoSelect = (e: React.ChangeEvent<HTMLInputElement>, sceneId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateScene(sceneId, "referenceVideoFile", file);
    updateScene(sceneId, "referenceVideoPreview", URL.createObjectURL(file));
  };

  const handleFrameReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrameReferenceFile(file);
    setFrameReferencePreview(URL.createObjectURL(file));
    persistStyleFile(file); // upload + persist so custom-style mode has a URL immediately
  };

  const handleRefDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0];
      setFrameReferenceFile(file);
      setFrameReferencePreview(URL.createObjectURL(file));
      persistStyleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const addSeedanceSlot = (sceneId: string) => {
    const scene = bRollScenes.find(s => s.id === sceneId);
    if (scene) {
      const currentPreviews = ensureArray(scene.seedancePreviews || [null]);
      const currentFiles = ensureArray(scene.seedanceImages || [null]);
      if (currentPreviews.length < 5) {
        updateScene(sceneId, "seedancePreviews", [...currentPreviews, null]);
        updateScene(sceneId, "seedanceImages", [...currentFiles, null]);
      } else {
        toast.warning("Seedance 2 supports a maximum of 5 reference images.");
      }
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in duration-500 w-full items-start pb-10">

      {/* ✨ RENDER CASTING ROOM MODAL */}
      <CastingRoomModal
        open={isCastingOpen}
        onClose={() => setIsCastingOpen(false)}
        actors={actors}
        onSaveActor={(newActor) => setActors([...actors, newActor])}
        onDeleteActor={async (id) => {
          // Dropping a variant must also evict its cached URL, else a later
          // generation reuses a now-dead Cloudinary link.
          const gone = actors.find(a => a.id === id);
          if (gone?.styleLocked && gone.baseActorId && gone.lockedStyleId) {
            delete actorVariantCache.current[`${gone.baseActorId}::${gone.lockedStyleId}`];
          }
          setActors(actors.filter(a => a.id !== id));
          setSelectedActors(prev => prev.map(s => s === id ? "" : s));
          await supabase.from('assets').delete().eq('id', id);
        }}
        selectedActors={selectedActors}
        onSelectActor={(actorId) => setSelectedActors(prev => { const next = [...prev]; next[castingTargetSlot] = actorId; return next; })}
        targetSlot={castingTargetSlot}
        callN8n={callN8n as any}
        clientId={clientId}
        onPreviewActor={setPreviewModalImg}
        onCreateVariant={async (actor, styleId, styleLabel) => {
          const url = await getOrCreateActorVariant(actor, styleId, styleLabel);
          await refreshActors(); // surface the new "Actor · Style" in the list
          return url;
        }}
      />

      {/* ✨ CUSTOM STYLE — cast interplay prompt (fires once per style+cast combo) */}
      <Dialog open={castStylePrompt} onOpenChange={setCastStylePrompt}>
        <DialogContent className="sm:max-w-[460px] bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-lg"><Palette className="w-5 h-5" /> Style your cast too?</DialogTitle>
            <DialogDescription className="text-[#989DAA] text-sm leading-relaxed pt-1">
              You're driving the look from a custom style image. Should your locked actors be re-rendered in that style (one-time ~5 credits each, reused forever) — or keep their current look for an intentional mixed-media world?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setCastFollowsCustomStyle(false); setCastStylePrompt(false); }} className="border-[#57707A]/40 text-[#DEDCDC] hover:text-[#191D23] hover:bg-[#C5BAC4] bg-[#191D23]">Keep their look</Button>
            <Button onClick={() => { setCastFollowsCustomStyle(true); setCastStylePrompt(false); }} className="bg-[#C5BAC4] text-[#191D23] hover:bg-white">Match the style</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── LEFT PANE: STORYBOARD ROWS ── */}
      {/* min-w-0 lets flex-1 actually shrink; without it content min-width forces
          horizontal overflow and pushes the right pane off-screen on laptops. */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-6 relative">

        {/* Storyboard Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-[#DEDCDC] flex items-center gap-2 font-display">
              <Film className="h-5 w-5 text-[#C5BAC4]" /> {studioMode === 'comic' ? 'Storyboard Sheet' : 'Visual Storyboard'}
            </h3>
            <p className="text-sm text-[#989DAA] mt-1 font-medium">{studioMode === 'comic' ? 'Create four consistent scene references with one image generation, then animate any shot.' : 'Write prompts, pick images, and generate videos.'}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* ✨ Mode toggle: individual scene frames | one credit-saving sheet */}
            <div className="flex items-center bg-[#191D23] p-1 rounded-xl border border-[#57707A]/40 shadow-inner">
              <button onClick={() => setStudioMode('storyboard')} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all", studioMode === 'storyboard' ? "bg-[#C5BAC4] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>Storyboard</button>
              <button onClick={() => setStudioMode('comic')} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all", studioMode === 'comic' ? "bg-[#C5BAC4] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>4-Shot Sheet</button>
            </div>
            {studioMode === 'storyboard' && (
              <span className={cn(
                "text-xs font-bold px-3.5 py-1.5 rounded-lg border uppercase tracking-wider",
                hasAnyImages ? "bg-[#B3FF00]/10 border-[#B3FF00]/30 text-[#B3FF00] shadow-sm" : "bg-[#2A2F38] border-[#57707A]/30 text-[#57707A]"
              )}>
                {filledImageSlots}/{totalImageSlots} Images
              </span>
            )}
          </div>
        </div>

        {/* ✨ STORYBOARD SHEET CANVAS — one image generation, four scene references */}
        {studioMode === 'comic' && (
          <div className="flex flex-col gap-5">
            <div className="relative w-full aspect-video rounded-2xl border-2 border-dashed border-[#57707A]/40 bg-[#191D23]/50 overflow-hidden flex items-center justify-center shadow-inner">
              {comicUrl ? (
                <img src={comicUrl} alt="Four-shot storyboard sheet" className="w-full h-full object-contain" />
              ) : isGeneratingComic ? (
                <div className="flex flex-col items-center gap-3 text-[#989DAA]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#C5BAC4]" />
                  <span className="text-xs font-bold uppercase tracking-widest">Building your storyboard sheet…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#57707A] px-8 text-center">
                  <Images className="w-8 h-8" />
                  <span className="text-xs font-bold uppercase tracking-widest">Your four scene references appear here</span>
                  <span className="text-[10px] text-[#57707A]">Supports cinematic realism, live action, 3D, anime, illustration, and custom styles.</span>
                </div>
              )}
            </div>

            {comicUrl && !isGeneratingComic && (
              <div className="grid grid-cols-2 gap-2.5">
                {[0, 1, 2, 3].map(i => (
                  <button key={i} onClick={() => animateComicPanel(i)} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] hover:text-[#191D23] hover:bg-[#C5BAC4] hover:border-[#C5BAC4] text-[11px] font-bold transition-all">
                    <Video className="w-3.5 h-3.5" /> Prepare Scene {i + 1}
                  </button>
                ))}
              </div>
            )}

            <Button onClick={handleGenerateComic} disabled={isGeneratingComic} className="w-full h-12 bg-[#B3FF00] text-[#191D23] hover:bg-[#B3FF00]/90 font-bold rounded-xl shadow-lg text-sm disabled:opacity-60">
              {isGeneratingComic ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>) : (<><Sparkles className="w-4 h-4 mr-2" /> {comicUrl ? 'Regenerate Storyboard Sheet' : 'Generate Storyboard Sheet'}</>)}
            </Button>
          </div>
        )}

        {studioMode === 'storyboard' && (<>
        {/* Scenes List */}
        <div className="flex flex-col space-y-8">
          {bRollScenes.map((scene, index) => {
            const labels = getLabels(scene.mode || "showcase");
            const isSeedance2 = scene.aiModel === 'bytedance/seedance-2' || scene.aiModel === 'bytedance/seedance-2-fast';
            const isGeminiOmniVideo = scene.aiModel === 'gemini-omni-video';
            const isNativeAudio = isSeedance2 || scene.aiModel === 'replicate:openai/sora-2' || scene.aiModel === 'kling-3.0/video' || scene.aiModel === 'replicate:prunaai/p-video' || scene.aiModel === 'auto' || isGeminiOmniVideo;
            const isPruna = scene.aiModel === 'replicate:prunaai/p-video';
            const isKling = scene.aiModel === 'kling-3.0/video' || scene.aiModel === 'auto';
            // `auto` is resolved the same way n8n resolves it, so the duration
            // options and the cost estimate describe the model that will actually
            // run rather than a union across every model.
            const effectiveModel = resolveEffectiveVideoModel(scene.aiModel, scene.mode);
            const estimatedCredits = estimateVideoCredits(scene.aiModel, scene.duration || "5", {
              videoMode: scene.mode,
              hasAudio: Boolean(scene.dialogue || scene.audioUrl),
            });
            const endFrameAllowed = isEndFrameAllowedFor(scene.aiModel, scene.mode);
            // Cost of the ADDITIONAL end-frame image, from the scene's image engine.
            // Zero when the user already supplied one — nothing is generated then.
            const endFrameImageCredits = resolveImageEngine(scene.imageEngine || "nb2")?.creditCost
              ?? N8N_IMAGE_DEFAULT_COST;
            const endFrameCost = scene.useEndFrame && endFrameAllowed && !scene.secondaryPreview
              ? endFrameImageCredits
              : 0;
            const combinedCredits = estimatedCredits === null ? null : estimatedCredits + endFrameCost;
            const imageEngine = scene.imageEngine || 'nb2';
            const isGptImg2Txt = imageEngine === 'gpt-image-2-text-to-image';
            const isGptImg2Img = imageEngine === 'gpt-image-2-image-to-image';
            const isGptImage2 = isGptImg2Txt || isGptImg2Img;

            const seedancePreviews = ensureArray(scene.seedancePreviews || [scene.primaryPreview || null]);
            // Verified end-to-end reference capacity for this model. When the
            // character lock is on, the actor sheet occupies one of those reference
            // slots, so the in-panel slots are one fewer.
            const seedanceMaxSlots = Math.max(1, generalReferenceSlotsFor(scene.aiModel, scene.mode) - (enableCharacterLock ? 1 : 0));

            return (
              <div key={scene.id} className={cn(
                "relative rounded-[2rem] border overflow-hidden flex flex-col group bg-[#2A2F38] shadow-lg",
                "transition-[border-color,box-shadow] duration-300",
                scene.videoUrl ? "border-[#B3FF00]/40 shadow-[0_0_30px_rgba(179,255,0,0.1)]" : (scene.primaryPreview || seedancePreviews[0] ? "border-[#C5BAC4]/25 hover:border-[#C5BAC4]/45" : "border-dashed border-[#57707A]/35 hover:border-[#57707A]/55")
              )}>
                {/* ── Scene Header ── */}
                <div className="bg-[#191D23]/90 border-b border-[#57707A]/25 px-5 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0 relative">
                  {/* Left status accent strip */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-[3px] rounded-tl-[2rem]",
                    scene.videoUrl ? "bg-[#B3FF00]" : (scene.primaryPreview || seedancePreviews[0] ? "bg-[#C5BAC4]/60" : "bg-[#57707A]/25")
                  )} />
                  <div className="flex flex-wrap items-center gap-3 pl-2">
                    {/* Scene number chip */}
                    <div className="flex flex-col items-center justify-center bg-[#2A2F38] border border-[#57707A]/40 rounded-xl px-3 py-1.5 shadow-inner min-w-[44px]">
                      <span className="text-[7px] font-black text-[#57707A] tracking-[0.14em] uppercase leading-none">SCENE</span>
                      <span className="text-base font-black text-[#C5BAC4] leading-tight">{index + 1}</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <select value={scene.aiModel || "auto"} onChange={(e) => {
                        const nextModel = e.target.value;
                        updateScene(scene.id, "aiModel", nextModel);
                        // Switching to a model that cannot consume an end frame must
                        // CLEAR the selection, or a stale useEndFrame would keep
                        // charging for an image the new provider ignores.
                        if (scene.useEndFrame && !isEndFrameAllowedFor(nextModel, scene.mode)) {
                          updateScene(scene.id, "useEndFrame", false);
                        }
                      }} className="text-xs font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-2 px-3 bg-[#2A2F38] text-[#B3FF00] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#B3FF00]/50 hover:bg-[#57707A]/20 transition-colors appearance-none">
                        <optgroup label="— Video Engines —" className="bg-[#191D23] text-[#57707A]">
                          <option value="auto" className="bg-[#191D23]">✨ Auto Engine</option>
                          <option value="replicate:openai/sora-2" className="bg-[#191D23]">Sora 2</option>
                          <option value="kling-3.0/video" className="bg-[#191D23]">Kling 3.0</option>
                          <option value="bytedance/seedance-2" className="bg-[#191D23]">Seedance 2 (Cinematic)</option>
                          <option value="bytedance/seedance-2-fast" className="bg-[#191D23]">Seedance 2 (Fast)</option>
                          <option value="replicate:prunaai/p-video" className="bg-[#191D23]">Pruna (Fast)</option>
                        </optgroup>
                        <optgroup label="— Gemini Omni —" className="bg-[#191D23] text-[#57707A]">
                          <option value="gemini-omni-video" className="bg-[#191D23]">✦ Gemini Omni Video</option>
                        </optgroup>
                      </select>

                      {/* Image Engine — pill buttons */}
                      <div className="flex gap-1 mt-0.5">
                        {([
                          { id: 'nb2', label: 'NB2', title: 'Default — best all-round scene generation' },
                          { id: 'gpt-image-2-text-to-image', label: 'GPT·T2I', title: 'Text-only generation, no reference images' },
                          { id: 'gpt-image-2-image-to-image', label: 'Remix', title: 'Transform your own images — product shots, restyles' },
                        ] as const).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.title}
                            onClick={() => updateScene(scene.id, "imageEngine", opt.id)}
                            className={cn(
                              "text-[9px] font-bold px-2 py-1 rounded-lg border transition-all uppercase tracking-wide",
                              imageEngine === opt.id
                                ? "bg-[#C5BAC4]/15 border-[#C5BAC4]/50 text-[#C5BAC4]"
                                : "bg-transparent border-[#57707A]/30 text-[#57707A] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/30"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">

                    {/* ✨ PER-SCENE ASPECT RATIO */}
                    <select
                      value={scene.aspectRatio || "16:9"}
                      onChange={(e) => updateScene(scene.id, "aspectRatio", e.target.value)}
                      className="text-[10px] font-bold rounded-xl border border-[#57707A]/35 shadow-inner py-2 px-2.5 bg-[#2A2F38] text-[#f472b6] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#f472b6]/40 hover:bg-[#57707A]/20 transition-colors appearance-none uppercase tracking-wider"
                    >
                      {/* Registry-derived, same reason as the duration list: the
                          hardcoded version offered every model 1:1, but Sora's
                          provider enum is only portrait|landscape and the builder
                          maps 1:1 -> 'square', which is rejected with HTTP 422. */}
                      {allowedAspectRatiosFor(effectiveModel).map((ar) => (
                        <option key={ar} value={ar} className="bg-[#191D23]">📐 {ar}</option>
                      ))}
                    </select>

                    {/* Duration — different options for gemini-omni-video */}
                    {(
                      <select
                        value={scene.duration || "5"}
                        onChange={(e) => updateScene(scene.id, "duration", e.target.value)}
                        className="text-[10px] font-bold rounded-xl border border-[#57707A]/35 shadow-inner py-2 px-2.5 bg-[#2A2F38] text-[#DEDCDC] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C5BAC4]/40 hover:bg-[#57707A]/20 transition-colors appearance-none uppercase tracking-wider"
                      >
                        {/* Registry-derived: the model registry is the single source
                            for which durations a model offers. The previous
                            hardcoded list drifted from it and offered Kling "5 Min"
                            (300s), which the provider cannot render — it was billed
                            at 300s and clamped to 15s. */}
                        {allowedDurationsFor(effectiveModel).map((secs) => (
                          <option key={secs} value={secs} className="bg-[#191D23]">
                            {secs} Secs
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Resolution — shown for Gemini Omni Video and GPT Image 2 */}
                    {(isGeminiOmniVideo || isGptImage2) && (
                      <select
                        value={scene.videoResolution || (isGeminiOmniVideo ? "720p" : "1K")}
                        onChange={(e) => updateScene(scene.id, "videoResolution", e.target.value)}
                        className="text-[10px] font-bold rounded-xl border border-[#57707A]/35 shadow-inner py-2 px-2.5 bg-[#2A2F38] text-[#00E5FF] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/40 hover:bg-[#57707A]/20 transition-colors appearance-none uppercase tracking-wider"
                      >
                        {isGeminiOmniVideo ? (
                          <>
                            <option value="720p" className="bg-[#191D23]">720p</option>
                            <option value="1080p" className="bg-[#191D23]">1080p</option>
                            <option value="4k" className="bg-[#191D23]">4K</option>
                          </>
                        ) : (
                          <>
                            <option value="1K" className="bg-[#191D23]">1K</option>
                            <option value="2K" className="bg-[#191D23]">2K</option>
                            <option value="4K" className="bg-[#191D23]">4K</option>
                          </>
                        )}
                      </select>
                    )}

                    {/* Seed — Gemini Omni Video only */}
                    {isGeminiOmniVideo && (
                      <input
                        type="number"
                        value={scene.seed ?? ""}
                        onChange={(e) => updateScene(scene.id, "seed", e.target.value === "" ? null : Number(e.target.value))}
                        placeholder="Seed (opt)"
                        min={0}
                        max={2147483647}
                        className="text-[10px] font-bold rounded-xl border border-[#57707A]/40 shadow-inner py-2.5 px-3 bg-[#2A2F38] text-[#DEDCDC] w-28 focus:outline-none focus:ring-1 focus:ring-[#C5BAC4]/50 placeholder:text-[#57707A] [appearance:textfield]"
                      />
                    )}
                    {/* Estimated cost, shown BEFORE submission. Mirrors the n8n
                        billing formula (per-second rate x validated duration, plus
                        the audio surcharge). n8n remains the billing authority. */}
                    {estimatedCredits !== null && (
                      <span
                        className="text-[10px] font-bold rounded-xl border border-[#B3FF00]/30 bg-[#2A2F38] text-[#B3FF00] py-2 px-2.5 uppercase tracking-wider whitespace-nowrap"
                        title={
                          `Estimated ${combinedCredits} credits total — ${estimatedCredits} for ${scene.duration || "5"}s of video on ${effectiveModel}` +
                          (endFrameCost > 0 ? ` plus ${endFrameCost} for the additional end-frame image` : "") +
                          `. Final amount is calculated at generation time.`
                        }
                      >
                        ≈ {combinedCredits} cr{endFrameCost > 0 ? ` (${estimatedCredits}+${endFrameCost})` : ""}
                      </span>
                    )}

                    {isPruna && (
                      <label className="flex items-center gap-2.5 cursor-pointer bg-[#2A2F38] px-3 py-2 border border-[#B3FF00]/30 rounded-xl hover:bg-[#B3FF00]/10 hover:border-[#B3FF00]/60 transition-all shadow-sm group/draft" title="4x Faster rendering for quick previews">
                        <input
                          type="checkbox"
                          checked={scene.prunaDraft || false}
                          onChange={(e) => updateScene(scene.id, "prunaDraft", e.target.checked)}
                          className="rounded border-[#57707A]/50 bg-[#191D23] text-[#B3FF00] focus:ring-[#B3FF00] cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-[#B3FF00] uppercase tracking-widest transition-colors mt-0.5">Draft Mode</span>
                      </label>
                    )}

                    {/* Offered ONLY for models that can actually consume an end
                        frame (registry-derived). Sora has no end-frame input at
                        all, so offering it there generated a paid image the
                        provider never received. The label states the extra cost,
                        because ticking this box spends image credits. */}
                    {endFrameAllowed && !startFrameOnly && (
                      <label className="flex items-center gap-2.5 cursor-pointer bg-[#2A2F38] px-3 py-2 border border-[#57707A]/40 rounded-xl hover:bg-[#57707A]/30 hover:border-[#C5BAC4]/40 transition-all shadow-sm group/check">
                        <input
                          type="checkbox"
                          checked={scene.useEndFrame || false}
                          onChange={(e) => updateScene(scene.id, "useEndFrame", e.target.checked)}
                          className="rounded border-[#57707A]/50 bg-[#191D23] text-[#C5BAC4] focus:ring-[#C5BAC4] cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-[#989DAA] group-hover/check:text-[#DEDCDC] uppercase tracking-widest transition-colors mt-0.5">
                          End Frame {scene.secondaryPreview ? "(supplied)" : `(+${endFrameImageCredits} cr image)`}
                        </span>
                      </label>
                    )}

                    <div className="flex gap-1.5 bg-[#191D23] rounded-xl p-1 border border-[#57707A]/30 shadow-inner">
                      <button
                        onClick={() => moveSceneUp(index)}
                        disabled={index === 0}
                        title="Move scene up"
                        className={cn("p-1.5 rounded-lg transition-colors", index === 0 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveSceneDown(index)}
                        disabled={index === bRollScenes.length - 1}
                        title="Move scene down"
                        className={cn("p-1.5 rounded-lg transition-colors", index === bRollScenes.length - 1 ? "text-[#57707A]/30 cursor-not-allowed" : "text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38]")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    {(failedSlots.has(`${index}-primary`) || failedSlots.has(`${index}-secondary`)) && generatingSlot === null && (
                      <button
                        onClick={() => {
                          if (failedSlots.has(`${index}-primary`)) handleGenerateSlot(index, 'primary');
                          if (failedSlots.has(`${index}-secondary`)) handleGenerateSlot(index, 'secondary');
                        }}
                        title="This scene's last image failed — retry it"
                        className="flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-[#191D23] px-2.5 py-2 rounded-xl transition-colors bg-amber-500/10 border border-amber-400/40 hover:bg-amber-400 shadow-sm ml-1"
                      >
                        <Wand2 className="h-3.5 w-3.5" /> Retry
                      </button>
                    )}

                    {bRollScenes.length > 1 && (
                      <button onClick={() => removeScene(scene.id)} title="Delete Scene" className="text-[#57707A] hover:text-white p-2.5 rounded-xl transition-colors bg-[#191D23] border border-[#57707A]/30 hover:bg-red-500/80 hover:border-red-500 shadow-sm ml-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row p-6 gap-8">

                  <div className="w-full lg:w-1/2 flex flex-col gap-6 lg:border-r border-[#57707A]/20 lg:pr-8 relative">
                    {scene.videoUrl && <div className="absolute inset-0 bg-[#191D23]/80 backdrop-blur-md z-30 cursor-not-allowed rounded-xl border border-[#57707A]/30 flex flex-col items-center justify-center" title="Delete video to edit images">
                      <Lock className="w-8 h-8 text-[#57707A] mb-2" />
                      <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">Images Locked</span>
                    </div>}

                    {isSeedance2 ? (
                      <div className="flex-1 flex flex-col gap-5">
                        <div>
                          {/* ── Seedance header with slot count and add button ── */}
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block">
                                Reference Images
                              </label>
                              <p className="text-[9px] text-[#57707A]/60 font-medium mt-0.5">
                                Tag images in your prompt with <strong className="text-[#C5BAC4]">@Image1</strong>, <strong className="text-[#C5BAC4]">@Image2</strong>…
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[9px] font-bold px-2 py-1 rounded border",
                                seedancePreviews.filter(Boolean).length > 0
                                  ? "text-[#B3FF00] border-[#B3FF00]/30 bg-[#B3FF00]/10"
                                  : "text-[#57707A] border-[#57707A]/30 bg-[#191D23]"
                              )}>
                                {seedancePreviews.filter(Boolean).length}/{seedancePreviews.length} filled
                              </span>
                              {/* Capped at the registry's VERIFIED reachable count.
                                  It was 5, but only slots 1-2 plus the actor sheet
                                  are serialized, so slots beyond that were paid for
                                  and silently dropped. */}
                              {seedancePreviews.length < seedanceMaxSlots && (
                                <button
                                  onClick={() => addSeedanceSlot(scene.id)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-[#C5BAC4] hover:text-white bg-[#191D23] hover:bg-[#C5BAC4]/15 border border-[#C5BAC4]/30 hover:border-[#C5BAC4]/60 px-3 py-1.5 rounded-lg shadow-sm transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Add Image
                                </button>
                              )}
                            </div>
                          </div>

                          <div className={cn("grid gap-3 mt-3", seedancePreviews.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                            {seedancePreviews.map((preview: string | null, sIdx: number) => (
                              <div key={sIdx} className="flex flex-col gap-2">

                                {/* Slot card */}
                                <div className={cn(
                                  "relative rounded-xl overflow-hidden bg-[#0F1115] border-2 flex flex-col items-center justify-center transition-all group/upload shadow-inner",
                                  seedancePreviews.length === 1 ? "h-44" : "h-36",
                                  preview
                                    ? "border-[#C5BAC4]/40"
                                    : "border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/60 hover:bg-[#C5BAC4]/5 cursor-pointer"
                                )}>
                                  {/* @ImageN badge — always visible */}
                                  <div className="absolute top-2 left-2 z-20 bg-[#C5BAC4] text-[#191D23] px-2 py-0.5 text-[10px] font-black rounded-md uppercase shadow-lg tracking-wide">
                                    @Image{sIdx + 1}
                                  </div>

                                  {/* Remove slot button (visible on hover, only when >1 slot) */}
                                  {seedancePreviews.length > 1 && (
                                    <button
                                      onClick={() => removeSeedanceSlot(scene.id, sIdx)}
                                      aria-label={`Remove image slot ${sIdx + 1}`}
                                      className="absolute top-2 right-2 z-30 p-1 bg-[#191D23]/80 text-[#57707A] hover:bg-red-500 hover:text-white rounded-md opacity-0 group-hover/upload:opacity-100 transition-all shadow-sm border border-[#57707A]/30 hover:border-red-400"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {generatingSlot?.index === index && generatingSlot.type === 'primary' && generatingSlot.seedanceIndex === sIdx ? (
                                    <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-[#191D23]/90 backdrop-blur-sm">
                                      <Loader2 className="h-7 w-7 text-[#C5BAC4] animate-spin" />
                                      <span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating…</span>
                                    </div>
                                  ) : preview ? (
                                    <>
                                      <img src={preview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                      <div className="absolute inset-0 bg-[#191D23]/0 group-hover/upload:bg-[#191D23]/40 transition-colors" />
                                      <div className="absolute bottom-2 right-2 flex gap-1.5 z-20 opacity-0 group-hover/upload:opacity-100 transition-all">
                                        <button type="button" onClick={() => setPreviewModalImg(preview)} aria-label="Preview image" className="p-1.5 bg-[#191D23] border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#DEDCDC] rounded-lg shadow-md transition-all">
                                          <Maximize2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button type="button" onClick={() => clearSlot(scene.id, 'primary', sIdx)} aria-label="Clear image" className="p-1.5 bg-[#191D23] border border-[#57707A]/50 hover:bg-red-500 hover:border-red-400 text-white rounded-lg shadow-md transition-all">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <label
                                      htmlFor={`seedance-${scene.id}-${sIdx}`}
                                      className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors gap-2"
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, scene.id, "primary", sIdx)}
                                    >
                                      <div className="w-10 h-10 rounded-xl bg-[#2A2F38] border border-[#57707A]/30 flex items-center justify-center">
                                        <ImageIcon className="h-5 w-5" />
                                      </div>
                                      <div className="text-center">
                                        <p className="text-[10px] font-bold uppercase tracking-wider">Drop or click to upload</p>
                                        <p className="text-[9px] text-[#57707A]/60 mt-0.5">PNG, JPG, WebP</p>
                                      </div>
                                    </label>
                                  )}
                                  <input
                                    id={`seedance-${scene.id}-${sIdx}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleSceneFile(e, scene.id, "primary", sIdx)}
                                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                  />
                                </div>

                                {/* Action buttons below each slot */}
                                <div className="flex gap-1.5">
                                  {preview ? (
                                    <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary', sIdx)} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] rounded-lg transition-colors px-2">
                                      <Wand2 className="h-3 w-3 mr-1" /> Re-Gen
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary', sIdx)} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] rounded-lg transition-colors px-2">
                                      <Wand2 className="h-3 w-3 mr-1" /> Generate
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary', seedanceIndex: sIdx })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-8 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] rounded-lg transition-colors px-2">
                                    <FolderOpen className="h-3 w-3 mr-1" /> Library
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="text-[10px] font-bold text-[#b488d4] uppercase tracking-wider block mb-3">
                            Motion Reference Video <span className="text-[#57707A]/60 normal-case ml-1">(Optional)</span>
                          </label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleRefVideoDrop(e, scene.id)} className="relative h-28 rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#b488d4]/40 hover:border-[#b488d4]/80 hover:bg-[#b488d4]/5 flex flex-col items-center justify-center transition-all group/upload shadow-inner">
                            <div className="absolute top-1.5 left-1.5 z-20 bg-[#b488d4] text-[#191D23] px-1.5 py-0.5 text-[9px] font-black rounded uppercase shadow-md">@Video1</div>

                            {scene.referenceVideoPreview ? (
                              <>
                                <video src={scene.referenceVideoPreview} className="w-full h-full object-cover opacity-80" muted loop autoPlay playsInline />
                                <button type="button" onClick={() => { updateScene(scene.id, "referenceVideoFile", null); updateScene(scene.id, "referenceVideoPreview", null); }} className="absolute top-2 right-2 p-2 bg-[#191D23]/80 border border-[#b488d4]/50 hover:bg-red-500/90 hover:border-red-400 text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100 z-20"><X className="h-4 w-4" /></button>
                              </>
                            ) : (
                              <label htmlFor={`refvideo-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#b488d4]/70 hover:text-[#b488d4] transition-colors">
                                <Video className="h-6 w-6 mb-1.5" />
                                <p className="text-[10px] font-bold uppercase tracking-wider">Drop Video File</p>
                              </label>
                            )}
                            <input id={`refvideo-${scene.id}`} type="file" accept="video/mp4, video/quicktime" className="hidden" onChange={(e) => handleRefVideoSelect(e, scene.id)} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary', kind: 'motionVideo' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="h-8 text-[10px] font-bold border-[#b488d4]/40 text-[#b488d4]/80 hover:text-[#b488d4] hover:border-[#b488d4]/60 bg-[#191D23] hover:bg-[#b488d4]/5 px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> From Library</Button>
                            <p className="text-[9px] text-[#57707A] font-medium flex-1">Guides camera + motion. Use <strong className="text-[#b488d4]">@Video1</strong> in your prompt.</p>
                          </div>
                        </div>

                        {/* Remix works on Seedance scenes too */}
                        {isGptImg2Img && renderRemixPanel(scene, index)}
                      </div>
                    ) : isGeminiOmniVideo ? (
                      // ── GEMINI OMNI VIDEO LAYOUT: optional reference images + optional video ──
                      <div className="flex flex-col gap-5">
                        {/* Slot counter */}
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[10px] font-bold text-[#00E5FF] uppercase tracking-wider block">Reference Images</label>
                            <p className="text-[9px] text-[#57707A]/70 mt-0.5">Up to 5 images · optional</p>
                          </div>
                          {(() => {
                            const imgCount = ensureArray(scene.gptRefPreviews || []).filter(Boolean).length;
                            const vidCount = scene.referenceVideoPreview ? 2 : 0;
                            const used = imgCount + vidCount;
                            return (
                              <span className={cn(
                                "text-[9px] font-bold px-2 py-1 rounded-lg border",
                                used > 0 ? "text-[#00E5FF] border-[#00E5FF]/30 bg-[#00E5FF]/10" : "text-[#57707A] border-[#57707A]/30 bg-[#191D23]"
                              )}>
                                {used}/7 slots
                              </span>
                            );
                          })()}
                        </div>

                        {/* Image slots */}
                        <div className="grid grid-cols-3 gap-2">
                          {[0, 1, 2, 3, 4].map((imgIdx) => {
                            const refPreviews: (string | null)[] = ensureArray(scene.gptRefPreviews || Array(5).fill(null));
                            const preview = refPreviews[imgIdx] || null;
                            const isGenningThis = generatingSlot?.index === index && generatingSlot.geminiIndex === imgIdx;
                            return (
                              <div key={imgIdx} className="flex flex-col gap-1.5">
                                <div className={cn(
                                  "relative aspect-square rounded-xl overflow-hidden bg-[#0F1115] border-2 flex items-center justify-center transition-all group/gi shadow-inner",
                                  preview ? "border-[#00E5FF]/40" : "border-dashed border-[#00E5FF]/20 hover:border-[#00E5FF]/50 hover:bg-[#00E5FF]/5 cursor-pointer"
                                )}>
                                  <div className="absolute top-1.5 left-1.5 z-20 bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 px-1.5 py-0.5 text-[9px] font-black rounded uppercase shadow-md">{imgIdx + 1}</div>
                                  {isGenningThis ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full bg-[#191D23]/90 backdrop-blur-sm">
                                      <Loader2 className="h-5 w-5 text-[#00E5FF] animate-spin" />
                                      <span className="text-[8px] font-bold text-[#00E5FF] uppercase tracking-wider">Generating…</span>
                                    </div>
                                  ) : preview ? (
                                    <>
                                      <img src={preview} className="w-full h-full object-cover" />
                                      <button type="button" onClick={() => {
                                        const p = [...ensureArray(scene.gptRefPreviews || Array(5).fill(null))];
                                        p[imgIdx] = null;
                                        updateScene(scene.id, "gptRefPreviews", p);
                                      }} className="absolute top-1.5 right-1.5 z-30 p-1 bg-red-500/90 text-white rounded-md opacity-0 group-hover/gi:opacity-100 transition-all shadow-sm">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <label htmlFor={`gemvid-img-${scene.id}-${imgIdx}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#00E5FF] transition-colors gap-1">
                                      <ImageIcon className="h-4 w-4" />
                                      <p className="text-[9px] font-bold">Add</p>
                                    </label>
                                  )}
                                  <input id={`gemvid-img-${scene.id}-${imgIdx}`} type="file" accept="image/jpeg,image/png,image/webp,image/jpg" className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {
                                        const p = [...ensureArray(scene.gptRefPreviews || Array(5).fill(null))];
                                        p[imgIdx] = ev.target?.result as string;
                                        updateScene(scene.id, "gptRefPreviews", p);
                                      };
                                      reader.readAsDataURL(file);
                                    }}
                                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                  />
                                </div>

                                {/* ✨ AI Generate / Re-Gen + Library for Gemini Omni reference slots */}
                                <div className="flex gap-1">
                                  {preview ? (
                                    <button type="button" title="Regenerate this reference image" onClick={() => openRegenModal(scene, index, 'primary', undefined, imgIdx)} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 flex items-center justify-center rounded-lg border border-[#57707A]/40 text-[#989DAA] hover:text-[#00E5FF] hover:border-[#00E5FF]/40 bg-[#191D23] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                      <Wand2 className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <button type="button" title="Generate a reference image with AI" onClick={() => openRegenModal(scene, index, 'primary', undefined, imgIdx)} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-7 flex items-center justify-center rounded-lg border border-[#57707A]/40 text-[#989DAA] hover:text-[#00E5FF] hover:border-[#00E5FF]/40 bg-[#191D23] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                      <Wand2 className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button type="button" title="Pick from library" onClick={() => setLibraryTarget({ index, type: 'primary', geminiIndex: imgIdx })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-7 flex items-center justify-center rounded-lg border border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                    <FolderOpen className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-[#57707A] -mt-3 font-medium">JPEG, PNG, WebP · Max 10MB each</p>

                        {/* Optional video slot */}
                        <div>
                          <label className="text-[10px] font-bold text-[#b488d4] uppercase tracking-wider block mb-2">
                            Reference Video <span className="text-[#57707A]/60 normal-case font-medium ml-1">(optional · uses 2 slots · duration set by model)</span>
                          </label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleRefVideoDrop(e, scene.id)} className="relative h-24 rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#b488d4]/40 hover:border-[#b488d4]/70 hover:bg-[#b488d4]/5 flex flex-col items-center justify-center transition-all group/vslot shadow-inner">
                            {scene.referenceVideoPreview ? (
                              <>
                                <video src={scene.referenceVideoPreview} className="w-full h-full object-cover opacity-80" muted loop autoPlay playsInline />
                                <button type="button" onClick={() => { updateScene(scene.id, "referenceVideoFile", null); updateScene(scene.id, "referenceVideoPreview", null); }} className="absolute top-2 right-2 p-1.5 bg-[#191D23]/80 border border-[#b488d4]/50 hover:bg-red-500/90 hover:border-red-400 text-white rounded-lg shadow-md opacity-0 group-hover/vslot:opacity-100 transition-all z-20"><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <label htmlFor={`gemvid-ref-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#b488d4]/60 hover:text-[#b488d4] transition-colors gap-1">
                                <Video className="h-5 w-5" />
                                <p className="text-[9px] font-bold uppercase tracking-wider">Drop or click to upload</p>
                              </label>
                            )}
                            <input id={`gemvid-ref-${scene.id}`} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => handleRefVideoSelect(e, scene.id)} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary', kind: 'motionVideo' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="w-full mt-2 h-8 text-[10px] font-bold border-[#b488d4]/40 text-[#b488d4]/80 hover:text-[#b488d4] hover:border-[#b488d4]/60 bg-[#191D23] hover:bg-[#b488d4]/5 px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> From Library</Button>
                        </div>

                        {/* Remix works on Gemini scenes too — separate from Gemini's own reference slots */}
                        {isGptImg2Img && renderRemixPanel(scene, index)}
                      </div>
                    ) : (
                      // STANDARD LAYOUT
                      <div className="flex flex-col sm:flex-row gap-5 w-full">
                        <div className="flex-1 flex flex-col gap-3">
                          <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.primary}</label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "primary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                            {generatingSlot?.index === index && generatingSlot.type === 'primary' ? (
                              <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                            ) : scene.primaryPreview ? (
                              <><img src={scene.primaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                <div className="absolute top-2 right-2 flex gap-2 z-20">
                                  <button type="button" onClick={() => setPreviewModalImg(scene.primaryPreview)} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-4 w-4" /></button>
                                  <button type="button" onClick={() => clearSlot(scene.id, "primary")} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-4 w-4" /></button>
                                </div></>
                            ) : (
                              <label htmlFor={`primary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop Start Frame</p><p className="text-[8px] font-medium mt-1 text-[#57707A]/70">OR leave blank for Text-to-Video</p></label>
                            )}
                            <input id={`primary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "primary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <div className="flex gap-2 shrink-0 mt-1">
                            {scene.primaryPreview ? (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-Gen</Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'primary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'primary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library</Button>
                          </div>
                        </div>

                        <div className={cn("flex-1 flex flex-col gap-3 transition-all duration-300", !scene.useEndFrame && "opacity-40 grayscale pointer-events-none")}>
                          <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block truncate">{labels.secondary}</label>
                          <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, scene.id, "secondary")} className="relative aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-dashed border-[#57707A]/40 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 flex items-center justify-center transition-all group/upload shadow-inner">
                            {!scene.useEndFrame ? (
                              <div className="text-center p-3"><p className="text-[10px] font-bold text-[#57707A]/50 uppercase tracking-widest">Disabled</p><p className="text-[8px] text-[#57707A]/40 mt-1.5 font-medium">Toggle "Use End Frame" to activate</p></div>
                            ) : generatingSlot?.index === index && generatingSlot.type === 'secondary' ? (
                              <div className="flex flex-col items-center justify-center gap-3 bg-[#191D23]/90 w-full h-full backdrop-blur-sm"><Loader2 className="h-8 w-8 text-[#C5BAC4] animate-spin" /><span className="text-[9px] font-bold text-[#C5BAC4] uppercase tracking-wider">Generating...</span></div>
                            ) : scene.secondaryPreview ? (
                              <><img src={scene.secondaryPreview} className="w-full h-full object-cover pointer-events-none opacity-90 group-hover/upload:opacity-100 transition-opacity" />
                                <div className="absolute top-2 right-2 flex gap-2 z-20">
                                  <button type="button" onClick={() => setPreviewModalImg(scene.secondaryPreview)} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:border-[#DEDCDC] text-[#989DAA] hover:text-[#DEDCDC] rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><Maximize2 className="h-4 w-4" /></button>
                                  <button type="button" onClick={() => clearSlot(scene.id, "secondary")} className="p-2 bg-[#191D23]/80 border border-[#57707A]/50 hover:bg-red-500/90 hover:border-red-400 text-[#989DAA] hover:text-white rounded-lg shadow-md opacity-0 group-hover/upload:opacity-100 transition-all scale-90 group-hover/upload:scale-100"><X className="h-4 w-4" /></button>
                                </div></>
                            ) : (
                              <label htmlFor={`secondary-${scene.id}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors"><ImageIcon className="h-8 w-8 mb-2" /><p className="text-[10px] font-bold uppercase tracking-wider">Drop File</p></label>
                            )}
                            <input id={`secondary-${scene.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleSceneFile(e, scene.id, "secondary")} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                          </div>
                          <div className="flex gap-2 shrink-0 mt-1">
                            {scene.secondaryPreview ? (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-Gen</Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => openRegenModal(scene, index, 'secondary')} disabled={generatingSlot !== null || isGeneratingAllImages} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setLibraryTarget({ index, type: 'secondary' })} disabled={generatingSlot !== null || isGeneratingAllImages || !!scene.videoUrl} className="flex-1 h-9 text-[10px] font-bold border-[#57707A]/40 text-[#989DAA] hover:text-[#DEDCDC] hover:border-[#DEDCDC]/40 bg-[#191D23] hover:bg-[#2A2F38] px-3 rounded-lg transition-colors"><FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Library</Button>
                          </div>
                        </div>

                        {/* Remix (GPT Image 2 · Image→Image) reference inputs */}
                        {isGptImg2Img && renderRemixPanel(scene, index)}

                        {/* GPT Image 2 info badge */}
                        {isGptImage2 && (
                          <div className="mt-3 flex items-start gap-2 bg-[#C5BAC4]/5 border border-[#C5BAC4]/20 rounded-xl p-3">
                            <Sparkles className="w-3.5 h-3.5 text-[#C5BAC4] shrink-0 mt-0.5" />
                            <p className="text-[9px] text-[#989DAA] leading-relaxed font-medium">
                              {isGptImg2Txt
                                ? <><strong className="text-[#C5BAC4]">GPT Image 2 · Text → Image:</strong> Describe what you want in the Scene Director prompt. Supports up to 20,000 characters.</>
                                : <><strong className="text-[#C5BAC4]">Remix mode:</strong> upload 1–5 source images, then tell the Scene Director what to do with them — e.g. "Place this exact product on a marble kitchen counter at golden hour. Keep the label sharp and legible."</>
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="w-full lg:w-1/2 flex flex-col relative gap-4">
                    <div className="flex items-center justify-between shrink-0 mb-1">
                      <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider flex items-center gap-1.5">
                        {scene.videoUrl
                          ? <><Video className="h-4 w-4 text-[#B3FF00]" /> <span className="text-[#B3FF00]">Generated Video</span></>
                          : <span className="text-[#DEDCDC]">Scene Director</span>
                        }
                      </label>
                      {!scene.videoUrl && (
                        <button onClick={() => handleSuggestPrompt(scene.id, index)} disabled={suggestingPromptIndex === index} className="text-[#191D23] bg-[#C5BAC4] hover:bg-white px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-md shadow-[#C5BAC4]/10 border-none">
                          {suggestingPromptIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggest
                        </button>
                      )}
                      {scene.videoUrl && (
                        <button onClick={() => handleDeleteVideo(scene.id)} className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 border border-red-500/30 hover:border-red-500 px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-sm">
                          <Trash2 className="h-3.5 w-3.5" /> Delete Video
                        </button>
                      )}
                    </div>

                    <div className="flex-1 rounded-xl overflow-hidden border border-[#57707A]/30 bg-[#191D23] flex flex-col shadow-inner">
                      {scene.isGeneratingVideo ? (
                        <div className="flex-1 flex flex-col items-center justify-center bg-[#191D23]/90 backdrop-blur-sm gap-4 p-8 min-h-[250px]">
                          <div className="relative">
                            <div className="absolute inset-0 bg-[#B3FF00]/20 blur-xl rounded-full animate-pulse"></div>
                            <Loader2 className="h-12 w-12 text-[#B3FF00] animate-spin relative z-10" />
                          </div>
                          <span className="text-xs font-bold text-[#DEDCDC] uppercase tracking-widest animate-pulse font-display mt-2">Rendering Video...</span>
                          <span className="text-[10px] text-[#989DAA] text-center font-medium">Media generation runs in the background.<br />It is safe to navigate away from this page.</span>
                          <button
                            onClick={() => updateScene(scene.id, "isGeneratingVideo", false)}
                            className="mt-6 text-[10px] font-bold text-[#57707A] hover:text-red-400 px-5 py-2.5 bg-[#2A2F38] border border-[#57707A]/40 hover:border-red-400/50 rounded-lg transition-colors shadow-sm"
                          >
                            Taking too long? Click here to cancel.
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col flex-1 h-full">

                          {scene.videoUrl ? (
                            <div className="w-full flex-1 bg-[#0F1115] relative shrink-0 border-b border-[#57707A]/30 flex items-center justify-center">
                              <video key={scene.videoUrl} src={scene.videoUrl} controls className="w-full h-full max-h-[300px] object-contain" playsInline />
                            </div>
                          ) : (
                            <div className="flex flex-col flex-1 relative">
                              <Textarea
                                value={scene.prompt}
                                onChange={(e) => { updateScene(scene.id, "prompt", e.target.value); if (!e.target.value.trim()) updateScene(scene.id, "imagePrompt", ""); }}
                                className="flex-1 w-full text-sm p-5 resize-none bg-transparent border-b border-[#57707A]/30 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-0 leading-relaxed custom-scrollbar rounded-none min-h-[140px]"
                                placeholder={
                                  isGptImg2Img
                                    ? "Describe the transformation of your uploaded images...\n\nExample: Place this exact product on a marble kitchen counter at golden hour. Keep the label sharp and legible."
                                    : scene.mode === 'ugc'
                                      ? "UGC Action: Describe the influencer (e.g., holding product, looking shocked, pointing at text)..."
                                      : isNativeAudio
                                        ? "Describe your scene...\n\nExample: A wide shot of a neon city. A man turns and says \"This is incredible!\""
                                        : "Describe your scene...\n\nExample: Cinematic tracking shot following a woman through a sunlit forest..."
                                }
                              />
                            </div>
                          )}

                          {/* PROMPT CHARACTER COUNTER */}
                          {!scene.videoUrl && (
                            <div className={cn("text-right text-[10px] font-mono px-5 py-2 border-b border-[#57707A]/30 bg-[#2A2F38]/50", (scene.prompt?.length || 0) > 500 ? "text-red-400 font-bold" : "text-[#57707A]")}>
                              {scene.prompt?.length || 0} / 500
                            </div>
                          )}

                          {/* ✨ MODEL-AWARE INJECTION TOOLBAR — presets follow the
                              chosen engine's prompting dialect (see INJECT_PRESETS) */}
                          {!scene.videoUrl && (() => {
                            const fam = getModelFamily(scene.aiModel);
                            const injects = INJECT_PRESETS[fam];
                            const famLabel = ({ kling: 'Kling', seedance: 'Seedance', pruna: 'P-Video', sora: 'Sora', gemini: 'Gemini', auto: 'Auto' } as const)[fam];
                            return (
                            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 bg-[#2A2F38] border-b border-[#57707A]/30 shrink-0">
                              <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider mr-1">Inject:</span>

                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                className="text-[10px] font-bold text-[#C5BAC4] bg-[#191D23] border border-[#C5BAC4]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#C5BAC4]/60 hover:bg-[#C5BAC4]/10 transition-colors appearance-none shadow-sm"
                              >
                                <option value="" disabled hidden>🎥 Camera · {famLabel}</option>
                                {injects.camera.map(p => (
                                  <option key={p.label} value={p.value} className="bg-[#191D23]">{p.label}</option>
                                ))}
                              </select>

                              {injects.sound.length > 0 && (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[10px] font-bold text-[#B3FF00] bg-[#191D23] border border-[#B3FF00]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#B3FF00]/60 hover:bg-[#B3FF00]/10 transition-colors appearance-none shadow-sm"
                                >
                                  <option value="" disabled hidden>🔊 Sound · {famLabel}</option>
                                  {injects.sound.map(p => (
                                    <option key={p.label} value={p.value} className="bg-[#191D23]">{p.label}</option>
                                  ))}
                                </select>
                              )}

                              <select
                                value=""
                                onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                className="text-[10px] font-bold text-[#00E5FF] bg-[#191D23] border border-[#00E5FF]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#00E5FF]/60 hover:bg-[#00E5FF]/10 transition-colors appearance-none shadow-sm"
                              >
                                <option value="" disabled hidden>🌌 Physics · {famLabel}</option>
                                {injects.physics.map(p => (
                                  <option key={p.label} value={p.value} className="bg-[#191D23]">{p.label}</option>
                                ))}
                              </select>

                              {injects.timing.length > 0 && (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { updateScene(scene.id, "prompt", (scene.prompt || "") + e.target.value); e.target.value = ""; } }}
                                  className="text-[10px] font-bold text-[#FFB300] bg-[#191D23] border border-[#FFB300]/30 px-3 py-2 rounded-lg cursor-pointer hover:border-[#FFB300]/60 hover:bg-[#FFB300]/10 transition-colors appearance-none shadow-sm"
                                  title="Timing beats and shot cuts in this engine's syntax"
                                >
                                  <option value="" disabled hidden>⏱️ Timing · {famLabel}</option>
                                  {injects.timing.map(p => (
                                    <option key={p.label} value={p.value} className="bg-[#191D23]">{p.label}</option>
                                  ))}
                                </select>
                              )}

                              <button
                                onClick={() => {
                                  const fam = getModelFamily(scene.aiModel);
                                  const dialogueFormat =
                                    fam === 'kling' ? '\nCharacter Name (confident tone, English): "Type exact dialogue here" '
                                    : fam === 'seedance' ? '\nCharacter Name (confident, English): "Type exact dialogue here" '
                                    : fam === 'sora' ? '\n\nDialogue:\nCharacter Name: "Type exact dialogue here" '
                                    : ' The character says "Type exact dialogue here" ';
                                  updateScene(scene.id, "prompt", (scene.prompt || "") + dialogueFormat);
                                }}
                                className="inline-flex items-center text-[10px] font-bold px-3 py-2 rounded-lg transition-all shadow-sm text-[#DEDCDC] bg-[#191D23] hover:bg-[#57707A]/30 border border-[#57707A]/50 hover:border-[#DEDCDC]/50"
                                title="Inserts model-specific TTS dialogue format"
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-[#57707A]" /> TTS Dialogue
                              </button>
                            </div>
                            );
                          })()}

                          {(() => {
                            return (
                              <div className="flex flex-col flex-1 bg-[#191D23]">
                                {isNativeAudio ? (
                                  <div className="p-4 border-b border-[#57707A]/30 flex-1">
                                    <div className="flex items-start gap-3 bg-[#191D23] text-[#DEDCDC] text-[10px] font-bold px-4 py-3 rounded-xl border border-[#57707A]/40 shadow-inner">
                                      <Zap className="w-4 h-4 shrink-0 text-[#B3FF00] mt-0.5" />
                                      <span className="leading-relaxed text-[#989DAA]">
                                        <strong className="text-[#B3FF00]">Native Text-To-Speech Active:</strong> Use the "TTS Dialogue" button above to inject spoken dialogue natively through the prompt. To lip-sync with an uploaded MP3, use the <strong>Audio-to-Video</strong> tool on the dashboard.
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-5 bg-[#2A2F38]/50 border-b border-[#57707A]/30 flex-1">
                                    <div className="flex items-start gap-3 bg-[#191D23] text-[#989DAA] text-[10px] font-bold px-4 py-3.5 rounded-xl border border-[#57707A]/40 shadow-inner">
                                      <Mic className="w-4 h-4 shrink-0 text-[#57707A] mt-0.5" />
                                      <span className="leading-relaxed">This AI model generates silent video.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {!scene.videoUrl && (
                            <div className="p-4 bg-[#191D23]/80 border-t border-[#57707A]/30 flex justify-between items-center shrink-0">
                              <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider pl-2">
                                {scene.primaryPreview ? "Ready for animation" : "Text-to-Video Ready"}
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateSingleVideo(index)}
                                disabled={scene.isGeneratingVideo}
                                className={cn("h-10 text-[10px] font-bold px-5 rounded-lg transition-all shadow-md", "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] border-none")}
                              >
                                <Film className="w-4 h-4 mr-2" /> Generate Scene Video
                              </Button>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={addEmptyScene} variant="outline" className="w-full mt-2 border-dashed border-2 border-[#57707A]/50 bg-[#191D23]/50 text-[#989DAA] hover:text-[#C5BAC4] hover:border-[#C5BAC4]/50 hover:bg-[#2A2F38]/80 py-8 rounded-2xl font-bold transition-all shadow-inner text-sm">
          <Plus className="mr-2 h-5 w-5" /> Add Another Scene
        </Button>
        </>)}
      </div>

      {/* ── RIGHT PANE: DIRECTOR & PREVIEW ── */}
      {/* Pins beside the storyboard so it stays visible no matter how many scenes
          exist; if the Director itself is taller than the viewport it scrolls
          internally instead of forcing a full-page scroll. */}
      <div className="w-full xl:w-[400px] shrink-0 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto custom-scrollbar flex flex-col gap-6 z-20">
        {/* CARD 1: MASTER DIRECTOR */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 shadow-xl relative overflow-hidden">
          {/* Card header */}
          <div className="px-6 pt-5 pb-4 border-b border-[#57707A]/20 bg-gradient-to-r from-[#191D23]/60 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 flex items-center justify-center">
                  <Settings2 className="w-3.5 h-3.5 text-[#C5BAC4]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#DEDCDC] tracking-tight leading-none">Master Director</h3>
                  <p className="text-[9px] text-[#57707A] font-medium mt-0.5 uppercase tracking-wider">Story concept + settings</p>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
          <div className="flex flex-col gap-4 mb-2">
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider block">Master Story Concept</label>
                <button
                  onClick={handleNewStoryboard}
                  title="Clear scenes and concept to start a fresh story (keeps actors + Environment Lock)"
                  className="flex items-center gap-1 text-[9px] font-bold text-[#57707A] hover:text-[#C5BAC4] uppercase tracking-wider transition-colors"
                >
                  <Plus className="w-3 h-3" /> New Storyboard
                </button>
              </div>
              <Textarea value={bRollConcept} onChange={(e) => setBRollConcept(e.target.value)} placeholder="Describe the full story flow AND dialogue..." className="flex-1 w-full resize-none h-40 text-sm p-4 bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar" />
            </div>

            {/* ✨ NEW: AI PROMPT ENHANCEMENT TOGGLE */}
            <div className="flex items-center justify-between bg-[#191D23] p-3 rounded-xl border border-[#57707A]/30 shadow-inner mt-2">
              <div>
                <p className="text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider">✨ AI Prompt Helper</p>
                <p className="text-[9px] text-[#57707A] font-medium mt-0.5">ON: AI rewrites prompt. OFF: Pro raw mode.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={aiEnhance} onChange={(e) => setAiEnhance(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-[#2A2F38] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#57707A] peer-checked:after:bg-[#B3FF00] after:border after:rounded-full after:h-4 after:w-4 after:transition-all border border-[#57707A]/50"></div>
              </label>
            </div>

            {/* ✨ RESTORED MODEL CONSISTENCY TOGGLE ✨ */}
            <div className="flex items-center justify-between bg-[#191D23] p-3 rounded-xl border border-[#57707A]/30 shadow-inner">
              <div>
                <p className="text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider">AI Model Selection</p>
                <p className="text-[9px] text-[#57707A] font-medium mt-0.5">Let AI pick dynamically per scene, or lock one model.</p>
              </div>
              <div className="flex gap-1 bg-[#2A2F38] p-1 rounded-lg border border-[#57707A]/40">
                <button onClick={() => setModelConsistency("dynamic")} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-md transition-all", modelConsistency === "dynamic" ? "bg-[#B3FF00] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>
                  Dynamic
                </button>
                <button onClick={() => setModelConsistency("consistent")} className={cn("px-3 py-1.5 text-[10px] font-bold rounded-md transition-all", modelConsistency === "consistent" ? "bg-[#C5BAC4] text-[#191D23] shadow-sm" : "text-[#989DAA] hover:text-[#DEDCDC]")}>
                  Consistent
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-1">
              <Button onClick={handleWriteScript} disabled={isWritingScript || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#C5BAC4] bg-[#191D23] hover:bg-[#C5BAC4] h-12 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
                {isWritingScript ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />} Write Scenes
              </Button>
            </div>
          </div>
          </div>
        </div>

        {/* CARD 2: CASTING ROOM */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl relative">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#57707A]/20">
            <label className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide">
              <Lock className="h-4 w-4 text-[#C5BAC4]" /> Character Lock
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-[#191D23] px-2.5 py-1.5 border border-[#57707A]/50 rounded-lg hover:bg-[#57707A]/30 hover:border-[#C5BAC4]/40 transition-all shadow-sm">
                <input type="checkbox" checked={enableCharacterLock} onChange={(e) => {
                  const checked = e.target.checked;
                  setEnableCharacterLock(checked);
                  if (checked && actors.length > 0) setIsCharacterLockModalOpen(true);
                }} className="rounded cursor-pointer border-[#57707A]/50 bg-[#2A2F38] text-[#C5BAC4] focus:ring-[#C5BAC4]" />
                <span className="text-[9px] font-bold text-[#989DAA] uppercase tracking-wider">Enable</span>
              </label>
            </div>
          </div>

          {enableCharacterLock && (
            <div className="flex flex-col gap-2 mt-1 animate-in fade-in">
              {[0, 1, 2].map(slot => {
                const actor = actors.find(a => a.id === selectedActors[slot]);
                return (
                  <div key={slot} className={cn(
                    "flex items-center gap-2.5 rounded-xl p-2 border transition-all",
                    actor ? "bg-[#191D23] border-[#C5BAC4]/25" : "bg-[#191D23]/50 border-[#57707A]/30"
                  )}>
                    <span className="text-[9px] font-black text-[#57707A] uppercase tracking-widest w-10 shrink-0">A{slot + 1}</span>
                    {actor ? (
                      <>
                        <div
                          className="w-8 h-8 rounded-lg overflow-hidden border border-[#57707A]/50 shrink-0 cursor-pointer relative group"
                          onClick={() => setPreviewModalImg(actor.stitchedSheetUrl)}
                        >
                          <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        </div>
                        <span className="text-[#C5BAC4] text-[11px] font-bold truncate flex-1">{actor.name}</span>
                        <button
                          onClick={() => { setCastingTargetSlot(slot); setIsCharacterLockModalOpen(true); }}
                          className="shrink-0 h-7 w-7 flex items-center justify-center bg-[#2A2F38] text-[#DEDCDC] hover:text-[#C5BAC4] rounded-lg border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setCastingTargetSlot(slot); setIsCharacterLockModalOpen(true); }}
                        className="flex-1 flex items-center gap-1.5 text-[#57707A] hover:text-[#C5BAC4] text-[10px] font-bold transition-colors py-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add actor
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ✨ Custom Style cast toggle — only in Custom Style mode with a locked cast */}
          {enableCharacterLock && selectedStyle === 'none' && styleLockUrl && selectedActors.some(Boolean) && (
            <button
              onClick={() => setCastFollowsCustomStyle(v => !v)}
              title="Toggle whether locked actors are re-rendered in your custom style image or keep their own look"
              className="w-full mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#191D23] border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-all"
            >
              <span className="text-[9px] font-bold text-[#57707A] uppercase tracking-wider flex items-center gap-1.5"><Palette className="w-3 h-3 text-[#C5BAC4]" /> Cast</span>
              <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg", castFollowsCustomStyle ? "bg-[#C5BAC4] text-[#191D23]" : "bg-[#2A2F38] text-[#989DAA] border border-[#57707A]/40")}>
                {castFollowsCustomStyle ? "✓ Matches style" : "Keeps own look"}
              </span>
            </button>
          )}

          <Button onClick={() => setIsCastingOpen(true)} variant="outline" className="w-full mt-4 h-11 text-xs font-bold border-[#57707A]/40 text-[#DEDCDC] hover:text-[#191D23] hover:bg-[#C5BAC4] hover:border-[#C5BAC4] bg-[#191D23] transition-all rounded-xl shadow-sm">
            <Users className="w-4 h-4 mr-2" /> Open Casting Room
          </Button>
        </div>

        {/* CARD 3: RENDER ENGINE & PREVIEWS */}
        <div className="bg-[#2A2F38] rounded-2xl border border-[#57707A]/30 p-6 shadow-xl flex flex-col relative">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#57707A]/20">
            <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 font-display tracking-wide"><Palette className="w-4 h-4 text-[#C5BAC4]" /> Render Engine</h3>
          </div>

          <div className="flex items-center gap-3 bg-[#191D23] p-2 rounded-xl border border-[#57707A]/40 shadow-inner mb-5">
            <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="bg-transparent text-xs font-bold text-[#DEDCDC] focus:outline-none cursor-pointer flex-1 appearance-none px-2 py-1">
              {VISUAL_STYLES.map(s => <option key={s.id} value={s.id} className="bg-[#191D23]">{s.label}</option>)}
            </select>
          </div>

          {/* ✨ Start-frame-only — skip end frames to halve image credits */}
          <button
            onClick={toggleStartFrameOnly}
            title="Skip end frames. Halves image credits; end frames rarely improve the outcome. Turn off for morph/reveal shots."
            className="w-full mb-5 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#191D23] border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-all"
          >
            <span className="text-[10px] font-bold text-[#989DAA] uppercase tracking-wider">Start frame only</span>
            <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0", startFrameOnly ? "bg-[#C5BAC4]" : "bg-[#57707A]/40")}>
              <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-[#191D23] transition-transform", startFrameOnly ? "translate-x-4" : "translate-x-1")} />
            </span>
          </button>

          {(() => {
            const isCustomStyleMode = selectedStyle === 'none';
            const stylePreview = frameReferencePreview || styleLockUrl;
            return (
            <div className="mb-6">
              <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Upload className="h-3.5 w-3.5 text-[#C5BAC4]" /> Custom Style Reference</label>
              {!isCustomStyleMode ? (
                // Named genre active — image path is disabled (either/or).
                <div className="h-28 w-full rounded-xl border-2 border-dashed border-[#57707A]/25 bg-[#191D23]/30 flex flex-col items-center justify-center text-center px-3 opacity-60">
                  <ImageIcon className="h-5 w-5 mb-1.5 text-[#57707A]" />
                  <span className="text-[9px] font-bold text-[#57707A] leading-relaxed">Switch Render Engine to <span className="text-[#989DAA]">None</span> to drive the style from an image.</span>
                </div>
              ) : (
                <>
                  <div onDragOver={handleDragOver} onDrop={handleRefDrop} className="h-28 relative w-full rounded-xl border-2 border-dashed border-[#C5BAC4]/50 bg-[#C5BAC4]/5 hover:border-[#C5BAC4]/70 transition-all overflow-hidden group/ref flex flex-col shadow-inner">
                    {stylePreview ? (
                      <>
                        <img src={stylePreview} className="w-full h-full object-cover opacity-90" />
                        <button onClick={() => { setFrameReferenceFile(null); setFrameReferencePreview(null); setStyleLockUrl(null); localStorage.removeItem(STYLE_LOCK_KEY); }} className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full shadow-md opacity-0 group-hover/ref:opacity-100 transition-all hover:scale-110 hover:bg-red-500 z-20"><X className="h-3 w-3" /></button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-[#C5BAC4] text-center py-1.5 font-bold tracking-widest uppercase z-10">Style Active</div>
                      </>
                    ) : (
                      <label htmlFor="sidebar-ref-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors">
                        <ImageIcon className="h-6 w-6 mb-2" />
                        <span className="text-[10px] font-bold text-center uppercase tracking-widest">Drop a Style<br />Image = Your Genre</span>
                      </label>
                    )}
                    <input id="sidebar-ref-upload" type="file" accept="image/*" className="hidden" onChange={handleFrameReferenceSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
                  </div>
                  <p className="text-[9px] text-[#57707A] font-medium mt-1.5 leading-relaxed">Drop any reference (a painting, screenshot, mood board) — every frame renders in that exact style. No genre name needed.</p>
                </>
              )}
            </div>
            );
          })()}

          {/* ✨ ENVIRONMENT LOCK — one location anchored across every scene */}
          <div className="mb-6">
            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-[#C5BAC4]" /> Environment Lock</label>
            <div className="h-28 relative w-full rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#C5BAC4]/5 transition-all overflow-hidden group/env flex flex-col shadow-inner">
              {environmentLockUrl ? (
                <>
                  <img src={environmentLockUrl} className="w-full h-full object-cover opacity-90" />
                  <button onClick={clearEnvironmentLock} className="absolute top-2 right-2 p-2 bg-red-500/90 text-white rounded-full shadow-md opacity-0 group-hover/env:opacity-100 transition-all hover:scale-110 hover:bg-red-500 z-20"><X className="h-3 w-3" /></button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm text-[9px] text-[#C5BAC4] text-center py-1.5 font-bold tracking-widest uppercase z-10">Location Locked</div>
                </>
              ) : (
                <label htmlFor="env-lock-upload" className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-[#57707A] hover:text-[#C5BAC4] transition-colors">
                  <ImageIcon className="h-6 w-6 mb-2" />
                  <span className="text-[10px] font-bold text-center uppercase tracking-widest">Lock a Location<br />Across All Scenes</span>
                </label>
              )}
              <input id="env-lock-upload" type="file" accept="image/*" className="hidden" onChange={handleEnvironmentSelect} onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} />
            </div>
            <p className="text-[9px] text-[#57707A] font-medium mt-1.5 leading-relaxed">Every frame keeps this location's terrain, landmarks and lighting. Clear it to let scenes roam.</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleGenerateAllImages} disabled={isGeneratingAllImages || generatingSlot !== null || !bRollConcept.trim()} variant="outline" className="w-full border-[#57707A]/50 text-[#DEDCDC] hover:text-[#191D23] hover:border-[#B3FF00] bg-[#191D23] hover:bg-[#B3FF00] h-12 text-xs font-bold justify-center rounded-xl shadow-sm transition-all">
              {isGeneratingAllImages ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Images className="h-4 w-4 mr-2" />} Generate Images ({filledImageSlots}/{totalImageSlots})
            </Button>
            {isGeneratingAllImages && (
              <p className="text-[9px] text-[#C5BAC4] font-bold uppercase tracking-wider text-center animate-pulse mt-1">
                Images generate in background. You can safely leave this page.
              </p>
            )}

            <div className="bg-[#191D23] border border-[#57707A]/40 p-3.5 rounded-xl mt-3 shadow-inner">
              <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3 text-center">Video Processing</p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleGenerateSceneVideos} disabled={isGeneratingVideos} className={cn("w-full h-11 justify-center text-xs font-bold rounded-lg transition-all shadow-md border-none", "bg-[#57707A]/30 hover:bg-[#57707A]/50 text-[#DEDCDC]")}>
                  {isGeneratingVideos ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Film className="h-4 w-4 mr-2" />} 1. Gen Scene Videos
                </Button>

                {isGeneratingVideos && (
                  <p className="text-[9px] text-[#B3FF00] font-bold uppercase tracking-wider text-center animate-pulse">
                    Videos rendering in background. You can safely leave this page.
                  </p>
                )}

                {/* V4: one honest sequence status. Partial success is visible —
                    finished scenes are never hidden behind a single failure, and
                    only failed scenes are offered for retry. */}
                {sequenceStatus.hasProgress && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="sequence-status"
                    className={cn(
                      "rounded-lg border p-3 text-[11px] font-semibold leading-relaxed",
                      sequenceStatus.state === "succeeded" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                      sequenceStatus.state === "running" && "border-[#C5BAC4]/30 bg-[#C5BAC4]/10 text-[#DEDCDC]",
                      sequenceStatus.state === "partial_success" && "border-amber-500/30 bg-amber-500/10 text-amber-200",
                      sequenceStatus.state === "failed" && "border-red-500/30 bg-red-500/10 text-red-300",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {sequenceStatus.isActive && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                      <span>{sequenceStatus.message}</span>
                    </div>
                    {sequenceStatus.retryableSceneNumbers.length > 0 && (
                      <p className="mt-1.5 text-[10px] font-medium opacity-80">
                        Use each scene&apos;s Generate Scene Video button to retry — finished scenes are left untouched.
                      </p>
                    )}
                  </div>
                )}

                {/* <Button onClick={() => { }} disabled={!allVideosGenerated} className={cn("w-full h-12 justify-center text-sm font-bold rounded-lg transition-all shadow-md border-none", allVideosGenerated ? "bg-gradient-to-r from-[#B3FF00]/80 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23]" : "bg-[#191D23] text-[#57707A] cursor-not-allowed border border-[#57707A]/30")}>
                  2. Render Final Sequence
                </Button> */}
              </div>
            </div>
          </div>
        </div>

      </div>

      <AssetSelectionModal open={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelect={handleLibrarySelect} mediaType={libraryTarget?.kind === 'motionVideo' ? 'video' : 'image'} />

      {previewModalImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191D23]/90 backdrop-blur-md animate-in fade-in" onClick={() => setPreviewModalImg(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewModalImg(null)} className="absolute -top-14 right-0 p-2.5 bg-[#2A2F38] border border-[#57707A]/50 hover:bg-red-500 hover:border-red-400 hover:text-white text-[#DEDCDC] rounded-full transition-all shadow-lg z-50">
              <X className="h-5 w-5" />
            </button>
            <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none rounded-2xl"></div>
            <img src={previewModalImg} className="w-full h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#57707A]/30 relative z-10 bg-black" alt="Preview Enlarged" />
          </div>
        </div>
      )}

      {/* ✨ CHARACTER LOCK SELECTION MODAL */}
      <Dialog open={isCharacterLockModalOpen} onOpenChange={(open) => !open && setIsCharacterLockModalOpen(false)}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl custom-scrollbar">
          <DialogHeader className="border-b border-[#57707A]/20 pb-4">
            <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl">
              <Lock className="w-5 h-5" /> Select Actor {castingTargetSlot + 1}
            </DialogTitle>
            <DialogDescription className="text-[#989DAA] font-medium mt-1">
              Choosing for slot <span className="text-[#C5BAC4] font-bold">Actor {castingTargetSlot + 1}</span>. This actor's character sheet will be injected into every scene.
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            {actors.length === 0 ? (
              <div className="text-center py-12 text-[#57707A] bg-[#191D23]/50 rounded-2xl border border-dashed border-[#57707A]/40">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-bold text-[#DEDCDC]">No actors yet</p>
                <p className="text-xs mt-1 text-[#989DAA]">Use the Casting Room to create actors first.</p>
                <Button size="sm" className="mt-5 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-md rounded-xl h-10 px-6 transition-all" onClick={() => { setIsCharacterLockModalOpen(false); setIsCastingOpen(true); }}>
                  <UserPlus className="w-4 h-4 mr-2" /> Open Casting Room
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {actors.map(actor => {
                  const isSelected = selectedActors[castingTargetSlot] === actor.id;
                  return (
                    <button
                      key={actor.id}
                      onClick={() => {
                        setSelectedActors(prev => { const next = [...prev]; next[castingTargetSlot] = isSelected ? "" : actor.id; return next; });
                      }}
                      className={cn(
                        "rounded-2xl p-2.5 flex flex-col gap-3 transition-all text-left border relative overflow-hidden group",
                        isSelected ? "bg-[#191D23] border-[#C5BAC4] ring-2 ring-[#C5BAC4]/50 shadow-lg" :
                          "bg-[#191D23]/60 border-[#57707A]/40 hover:border-[#C5BAC4]/60 hover:bg-[#191D23] hover:shadow-md"
                      )}
                    >
                      <div
                        className="aspect-video rounded-xl overflow-hidden bg-[#0F1115] border border-[#57707A]/30 relative cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setPreviewModalImg(actor.stitchedSheetUrl); }}
                      >
                        <img src={actor.stitchedSheetUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 className="w-5 h-5 text-white" /></div>
                        {isSelected && <div className="absolute top-1.5 left-1.5 bg-[#C5BAC4] text-[#191D23] text-[9px] font-black px-2 py-0.5 uppercase tracking-widest rounded shadow-md z-10">A{castingTargetSlot + 1}</div>}
                      </div>
                      <span className={cn(
                        "text-xs font-bold text-center truncate px-2 w-full",
                        isSelected ? "text-[#DEDCDC]" : "text-[#989DAA] group-hover:text-[#DEDCDC] transition-colors"
                      )}>{actor.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-[#57707A]/20 pt-4">
            <Button variant="outline" onClick={() => setSelectedActors(prev => { const next = [...prev]; next[castingTargetSlot] = ""; return next; })} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 font-bold rounded-xl h-11 px-6">Clear Slot</Button>
            <Button onClick={() => setIsCharacterLockModalOpen(false)} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl h-11 px-8 shadow-lg transition-all border-none">
              <CheckCircle className="w-4 h-4 mr-2" /> Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={regenDialogState.isOpen} onOpenChange={(open) => !open && setRegenDialogState(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="sm:max-w-[600px] bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl">
          <DialogHeader className="border-b border-[#57707A]/20 pb-4">
            <DialogTitle className="flex items-center gap-2 text-[#C5BAC4] font-display text-xl"><Wand2 className="h-5 w-5" /> Image Prompt · {regenDialogState.slotType === 'primary' ? 'Start Frame' : 'End Frame'}</DialogTitle>
            <DialogDescription className="text-[#989DAA] font-medium mt-1.5">Controls the still image for this slot in Scene {regenDialogState.index !== null ? regenDialogState.index + 1 : ''} only. Your Scene Director motion prompt stays untouched — the video engine keeps its own script.</DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 block">Refined Prompt</label>
            <Textarea
              value={regenDialogState.promptText}
              onChange={(e) => setRegenDialogState(prev => ({ ...prev, promptText: e.target.value }))}
              placeholder="Enter a detailed visual prompt..."
              className="h-40 resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm custom-scrollbar"
            />
          </div>
          <DialogFooter className="border-t border-[#57707A]/20 pt-4">
            <Button variant="outline" onClick={() => setRegenDialogState(prev => ({ ...prev, isOpen: false }))} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 font-bold rounded-xl h-11 px-6">Cancel</Button>
            <Button onClick={handleConfirmRegen} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl h-11 px-6 shadow-lg transition-all border-none">
              <Sparkles className="h-4 w-4 mr-2" /> Regenerate Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
