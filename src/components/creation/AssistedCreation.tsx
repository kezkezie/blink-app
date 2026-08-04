"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, FolderOpen, ImageIcon, Loader2, RefreshCw, RotateCcw, Sparkles, UploadCloud, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { IMAGE_STUDIO_ALLOWED_FORMATS, type AssistedCreativeDirection, type CreativeConcept } from "@/lib/assisted-creation";
import { useAssistedCreationStore } from "@/app/store/useAssistedCreationStore";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { AssetSelectionModal } from "@/components/shared/AssetSelectionModal";

// A small fixed fee for the image → concepts vision call (mirrors the server).
const INSPIRATION_ANALYSIS_COST = 1;

/** Image Studio executes images only for now; video/carousel return via Create. */
const isSupportedConcept = (concept: CreativeConcept) => IMAGE_STUDIO_ALLOWED_FORMATS.includes(concept.format);

interface AssistedCreationProps {
  brandId: string;
  brandName: string;
  onCustomize: () => void;
  onContinue: (direction: AssistedCreativeDirection) => void;
}

export function AssistedCreation({ brandId, brandName, onCustomize, onContinue }: AssistedCreationProps) {
  const { draft, hasHydrated, initializeBrand, setIdea, setConcepts, selectConcept, setDirection, setSummary, revealAdvanced, clearDraft } = useAssistedCreationStore();
  const current = draft?.brandId === brandId ? draft : null;
  const idea = current?.idea ?? "";
  const concepts = current?.concepts ?? [];
  const selected = current?.selectedConcept ?? null;
  const direction = current?.direction ?? null;
  const [loading, setLoading] = useState<"concepts" | "direction" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const startOverConfirmRef = useRef<HTMLDivElement | null>(null);

  // Inspiration image: an OPTIONAL reference the AI turns into 3 concepts (a paid
  // GPT-4o vision call). The URL is an owned, scoped asset (upload or Content Grid).
  const { clientId } = useClient();
  const [inspirationUrl, setInspirationUrl] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadInspiration(file: File) {
    if (!clientId) { setError("Session lost. Please refresh."); return; }
    setError(null);
    setAttaching(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `images/${clientId}/inspiration_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(path, file);
      if (uploadError) throw uploadError;
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      setInspirationUrl(url);
    } catch {
      setError("Couldn't upload that image. Please try another.");
    } finally {
      setAttaching(false);
    }
  }

  // Bring the inline confirmation into view and move focus to its safe default
  // (keyboard and screen-reader users land on "Keep my draft").
  useEffect(() => {
    if (!confirmingStartOver) return;
    startOverConfirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    startOverConfirmRef.current?.querySelector("button")?.focus();
  }, [confirmingStartOver]);

  // Legacy drafts may hold video/carousel concepts from before the format-honesty
  // correction. They stay parseable and visible, but are quarantined: never
  // selectable, never developed into a direction, never handed to generation.
  const hasUnsupportedConcepts = concepts.some((concept) => !isSupportedConcept(concept));
  const selectedSupported = selected !== null && isSupportedConcept(selected);
  const directionUsable = Boolean(
    direction && selectedSupported && IMAGE_STUDIO_ALLOWED_FORMATS.includes(direction.outputType)
  );

  useEffect(() => {
    if (hasHydrated) initializeBrand(brandId);
  }, [brandId, hasHydrated, initializeBrand]);

  async function request(operation: "concepts" | "direction", concept?: CreativeConcept) {
    setLoading(operation);
    setError(null);
    try {
      const response = await fetch("/api/ai/assisted-creation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(new URLSearchParams(window.location.search).get("assistedFixture") === "1" ? { "X-BlinkSpot-Test-Fixture": "1" } : {}),
        },
        body: JSON.stringify({
          operation,
          brandId,
          idea: idea.trim(),
          allowedFormats: IMAGE_STUDIO_ALLOWED_FORMATS,
          ...(concept ? { concept } : {}),
          ...(operation === "concepts" && inspirationUrl ? { inspirationImageUrl: inspirationUrl } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "BlinkSpot could not develop this idea.");
      if (operation === "concepts") {
        setConcepts(brandId, data.concepts);
      } else {
        setDirection(brandId, data.direction);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BlinkSpot could not develop this idea.");
    } finally {
      setLoading(null);
    }
  }

  function chooseConcept(concept: CreativeConcept) {
    if (!isSupportedConcept(concept)) return; // quarantined legacy formats never continue
    selectConcept(brandId, concept);
    void request("direction", concept);
  }

  function customize() {
    revealAdvanced(brandId);
    onCustomize();
  }

  // Non-blocking Start over: no browser confirm/alert. The first activation
  // reveals an inline, keyboard-accessible confirmation; confirming clears only
  // the isolated assisted draft, cancelling preserves it completely.
  function requestStartOver() {
    setConfirmingStartOver(true);
  }

  function cancelStartOver() {
    setConfirmingStartOver(false);
  }

  function confirmStartOver() {
    setConfirmingStartOver(false);
    setError(null);
    clearDraft();
    initializeBrand(brandId);
  }

  const hasDraft = idea.trim().length > 0 || concepts.length > 0 || Boolean(direction) || Boolean(current?.advancedRevealed);

  return (
    <section aria-labelledby="assisted-creation-heading" className="rounded-2xl border border-[#C5BAC4]/35 bg-[#20252C] shadow-xl overflow-hidden">
      <div className="p-6 md:p-8 border-b border-[#57707A]/25 bg-gradient-to-br from-[#C5BAC4]/10 via-transparent to-[#B3FF00]/5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-[#C5BAC4] text-xs font-bold uppercase tracking-[0.18em]">
            <Sparkles className="h-4 w-4" /> Assisted creation
          </div>
          {hasDraft && <button type="button" onClick={requestStartOver} className="text-xs font-bold text-[#989DAA] hover:text-[#DEDCDC] flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Start over</button>}
        </div>
        <h2 id="assisted-creation-heading" className="text-2xl md:text-3xl font-bold text-[#DEDCDC] font-display">What would you like to create?</h2>
        <p className="mt-2 text-sm text-[#989DAA] max-w-2xl">Share the rough idea. BlinkSpot will think with {brandName || "your brand"}, then you can guide or take full control.</p>
        <div className="mt-5 space-y-3">
          <Textarea
            aria-label="Your idea"
            value={idea}
            onChange={(event) => setIdea(brandId, event.target.value)}
            placeholder="e.g. Create an ad that makes our soft blankets feel like the best part of coming home."
            className="min-h-28 bg-[#191D23] border-[#57707A]/45 text-[#DEDCDC] placeholder:text-[#57707A] rounded-xl"
          />

          {/* Inspiration image → 3 concepts. Optional. Costs 1 credit (vision call). */}
          <div className="rounded-xl border border-[#57707A]/30 bg-[#191D23]/40 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadInspiration(file);
                event.target.value = "";
              }}
            />
            {inspirationUrl ? (
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#C5BAC4]/40 shrink-0 bg-[#191D23]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inspirationUrl} alt="Selected inspiration image" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#DEDCDC] flex items-center gap-1.5"><ImageIcon className="h-4 w-4 text-[#C5BAC4]" aria-hidden="true" /> Inspiration image ready</p>
                  <p className="text-[11px] text-[#989DAA] mt-0.5">Creating concepts from this image uses {INSPIRATION_ANALYSIS_COST} credit.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspirationUrl(null)}
                  aria-label="Remove inspiration image"
                  className="ml-auto text-[#989DAA] hover:text-[#DEDCDC] p-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <span id="inspiration-hint" className="text-[11px] text-[#989DAA] mr-1">
                  Or start from an image — BlinkSpot reads it and gives you 3 concepts (uses {INSPIRATION_ANALYSIS_COST} credit).
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attaching || loading !== null}
                  aria-describedby="inspiration-hint"
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#57707A]/40 text-[#DEDCDC] hover:border-[#C5BAC4]/50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4]"
                >
                  {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />} Upload image
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={attaching || loading !== null}
                  aria-describedby="inspiration-hint"
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#57707A]/40 text-[#DEDCDC] hover:border-[#C5BAC4]/50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4]"
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Choose from Grid
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => request("concepts")} disabled={(idea.trim().length < 8 && !inspirationUrl) || attaching || loading !== null} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl">
              {loading === "concepts" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : inspirationUrl ? <ImageIcon className="h-4 w-4 mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              {inspirationUrl ? "Create concepts from image" : concepts.length ? "Create 3 new concepts" : "Develop my idea"}
            </Button>
            <button type="button" onClick={customize} className="text-xs font-bold text-[#989DAA] hover:text-[#DEDCDC] flex items-center gap-1.5 px-2 py-2">
              Customize advanced details <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {confirmingStartOver && (
        <div
          ref={startOverConfirmRef}
          role="group"
          aria-label="Confirm start over"
          onKeyDown={(event) => { if (event.key === "Escape") cancelStartOver(); }}
          className="m-6 rounded-xl border border-[#C5BAC4]/40 bg-[#2A2F38] p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-[#DEDCDC]">Start over? This clears your assisted-creation draft. Your other Image Studio settings stay unchanged.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={cancelStartOver} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] rounded-lg">Keep my draft</Button>
            <Button size="sm" onClick={confirmStartOver} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-lg">Clear draft</Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="m-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <Button size="sm" variant="outline" onClick={() => request(selectedSupported ? "direction" : "concepts", selectedSupported && selected ? selected : undefined)} disabled={loading !== null} className="border-red-400/40 text-red-100 bg-transparent">
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
          </Button>
        </div>
      )}

      {concepts.length > 0 && (
        <div className="p-6 md:p-8 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-[#DEDCDC]">Three directions for your idea</h3>
            <p className="text-sm text-[#989DAA] mt-1">Choose the one with the strongest potential. Nothing is generated yet.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3" aria-label="Creative concepts">
            {concepts.map((concept) => {
              const supported = isSupportedConcept(concept);
              return (
                <button
                  type="button"
                  key={concept.id}
                  onClick={() => chooseConcept(concept)}
                  disabled={!supported}
                  aria-disabled={!supported}
                  aria-pressed={supported && selected?.id === concept.id}
                  className={cn(
                    "text-left rounded-xl border p-5 transition-all min-h-56 flex flex-col",
                    !supported
                      ? "border-[#57707A]/25 bg-[#191D23]/40 opacity-60 cursor-not-allowed"
                      : selected?.id === concept.id
                        ? "border-[#B3FF00]/60 bg-[#B3FF00]/8 shadow-lg"
                        : "border-[#57707A]/35 bg-[#191D23]/70 hover:border-[#C5BAC4]/55"
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#C5BAC4]">{concept.format}</span>
                    {supported && selected?.id === concept.id && <Check className="h-4 w-4 text-[#B3FF00]" />}
                  </div>
                  <h4 className="font-bold text-[#DEDCDC] text-base">{concept.title}</h4>
                  <p className="text-sm text-[#989DAA] leading-relaxed mt-2">{concept.idea}</p>
                  <p className="text-xs text-[#57707A] mt-auto pt-4 border-t border-[#57707A]/20">
                    {concept.angle}
                    {!supported && <span className="block mt-2 font-bold text-[#989DAA]">Not available in Image Studio yet</span>}
                  </p>
                </button>
              );
            })}
          </div>
          {(hasUnsupportedConcepts || (selected && !selectedSupported)) && (
            <div className="rounded-xl border border-[#C5BAC4]/30 bg-[#C5BAC4]/8 p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[#C5BAC4]/90">
                Video and carousel concepts aren&apos;t available in Image Studio yet — they&apos;ll return with the shared Create flow. Your idea is saved.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => request("concepts")} disabled={loading !== null} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-lg">
                  Create image concepts
                </Button>
                <Button size="sm" variant="outline" onClick={requestStartOver} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] rounded-lg">
                  Start over
                </Button>
              </div>
            </div>
          )}
          {loading === "direction" && <div role="status" className="rounded-xl border border-[#57707A]/30 bg-[#191D23]/60 p-5 text-sm text-[#989DAA] flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-[#C5BAC4]" /> Developing the creative direction…</div>}
        </div>
      )}

      {directionUsable && direction && selected && (
        <div className="mx-6 mb-6 md:mx-8 md:mb-8 rounded-2xl border border-[#C5BAC4]/35 bg-[#2A2F38] p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] uppercase tracking-widest font-bold text-[#C5BAC4]">Creative direction</p><h3 className="text-xl font-bold text-[#DEDCDC] mt-1">{selected.title}</h3></div>
            <span className="rounded-full border border-[#57707A]/40 px-3 py-1 text-xs font-bold text-[#989DAA]">Recommended: {direction.outputType}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div><p className="text-[10px] uppercase font-bold tracking-wider text-[#57707A]">Visual direction</p><p className="text-[#DEDCDC] mt-1 leading-relaxed">{direction.visualDirection}</p></div>
            <div><p className="text-[10px] uppercase font-bold tracking-wider text-[#57707A]">Tone</p><p className="text-[#DEDCDC] mt-1 leading-relaxed">{direction.tone}</p></div>
            <div><p className="text-[10px] uppercase font-bold tracking-wider text-[#57707A]">Composition / scene</p><p className="text-[#DEDCDC] mt-1 leading-relaxed">{direction.composition}</p></div>
          </div>
          <div>
            <label htmlFor="creative-summary" className="text-xs font-bold text-[#DEDCDC]">Editable summary</label>
            <Textarea id="creative-summary" value={direction.summary} onChange={(event) => setSummary(brandId, event.target.value)} className="mt-2 min-h-28 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => onContinue(direction)} className="bg-[#B3FF00] hover:bg-[#d0ff69] text-[#191D23] font-bold rounded-xl">Continue with this direction <ArrowRight className="h-4 w-4 ml-2" /></Button>
            <Button variant="outline" onClick={() => request("concepts")} disabled={loading !== null} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] rounded-xl"><RefreshCw className="h-4 w-4 mr-2" /> Another take</Button>
            <Button variant="outline" onClick={customize} className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] rounded-xl">Customize advanced details <ChevronDown className="h-4 w-4 ml-2" /></Button>
          </div>
        </div>
      )}

      <AssetSelectionModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => { setInspirationUrl(url); setPickerOpen(false); }}
        mediaType="image"
      />
    </section>
  );
}
