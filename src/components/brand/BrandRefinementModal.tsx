"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Brain, Wand2, Pencil, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { triggerWorkflow } from "@/lib/workflows";

interface BrandRefinementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrandRefinementModal({
  open,
  onOpenChange,
}: BrandRefinementModalProps) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [visualGuide, setVisualGuide] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Detect whether content has our structured 3-section format
  const isStructured = visualGuide.includes("SECTION 1") && visualGuide.includes("SECTION 3");

  // Parse structured output into display-friendly sections
  function parseSections(raw: string) {
    const s1 = raw.match(/##\s*SECTION 1[^\n]*\n([\s\S]*?)(?=##\s*SECTION 2|$)/i)?.[1]?.trim() ?? "";
    const s2 = raw.match(/##\s*SECTION 2[^\n]*\n([\s\S]*?)(?=##\s*SECTION 3|$)/i)?.[1]?.trim() ?? "";
    const s3 = raw.match(/##\s*SECTION 3[^\n]*\n([\s\S]*?)(?=##|$)/i)?.[1]?.trim() ?? "";
    return { s1, s2, s3 };
  }

  // Fetch the active brand's visual style guide on open
  useEffect(() => {
    async function fetchGuide() {
      if (open && activeBrand) {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from("brand_profiles")
            .select("visual_style_guide")
            .eq("id", activeBrand.id)
            .single();

          if (!error && data?.visual_style_guide) {
            setVisualGuide(data.visual_style_guide);
          } else {
            setVisualGuide("");
          }
        } catch (err) {
          console.error("Error fetching guide:", err);
        } finally {
          setFetching(false);
        }
      }
    }
    fetchGuide();
  }, [open, activeBrand?.id]);

  async function handleSuggest() {
    if (!clientId || !activeBrand) return;
    setSuggesting(true);
    try {
      const response = await triggerWorkflow("blink-suggest-visual", {
        client_id: clientId,
        brand_id: activeBrand.id,
      });

      if (response && response.suggestion) {
        setVisualGuide(response.suggestion as string);
      } else {
        alert("Received an empty suggestion from the AI.");
      }
    } catch (error) {
      console.error("Error generating suggestion:", error);
      alert(
        "Failed to generate suggestion. Check if the n8n workflow is active."
      );
    } finally {
      setSuggesting(false);
    }
  }

  // Parse the 3-section AI output into individual brand profile fields
  function parseGuideIntoFields(raw: string): Record<string, string | null> {
    const fields: Record<string, string | null> = {};

    // Section 3 → visual_style_guide (the AI image prompt prefix — most important)
    const s3Match = raw.match(/SECTION 3[^]*?(?:##|$)/i);
    if (s3Match) {
      const aiPrompt = s3Match[0]
        .replace(/##.*SECTION 3.*?\n/i, "")
        .replace(/##[\s\S]*/m, "")
        .trim();
      fields.visual_style_guide = aiPrompt || raw.trim();
    } else {
      fields.visual_style_guide = raw.trim();
    }

    // Section 2 PHOTOGRAPHY bullet → image_style
    const photoMatch = raw.match(/\*\*PHOTOGRAPHY\*\*:?\s*([^•\n*]+(?:\n(?![•*\-])[^\n]+)*)/i);
    if (photoMatch) fields.image_style = photoMatch[1].trim().replace(/\n/g, " ");

    // Section 2 COMPOSITION bullet → composition_notes
    const compMatch = raw.match(/\*\*COMPOSITION\*\*:?\s*([^•\n*]+(?:\n(?![•*\-])[^\n]+)*)/i);
    if (compMatch) fields.composition_notes = compMatch[1].trim().replace(/\n/g, " ");

    return fields;
  }

  async function handleSave() {
    if (!activeBrand) return;
    setLoading(true);
    try {
      // Parse the structured AI output and update multiple brand profile fields
      const parsed = parseGuideIntoFields(visualGuide);
      const updatePayload: Record<string, string | null> = {
        visual_style_guide: parsed.visual_style_guide ?? visualGuide.trim() ?? null,
        ...(parsed.image_style     ? { image_style: parsed.image_style }         : {}),
        ...(parsed.composition_notes ? { composition_notes: parsed.composition_notes } : {}),
      };

      const { error } = await supabase
        .from("brand_profiles")
        .update(updatePayload)
        .eq("id", activeBrand.id);

      if (error) throw error;

      // close cleanly — no alert
      onOpenChange(false);
    } catch (err) {
      console.error("Error updating brand guide:", err);
      alert("Failed to update brand guide.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl rounded-2xl">
        <DialogHeader className="border-b border-[#57707A]/20 pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-xl font-display text-[#DEDCDC] tracking-wide">
            <Brain className="h-5 w-5 text-[#C5BAC4]" /> Refine Your Brand's
            AI Brain
          </DialogTitle>
          <DialogDescription className="text-[#989DAA] font-medium leading-relaxed mt-2">
            Help the AI understand your specific visual identity. The more
            details you provide about how your content should{" "}
            <i className="text-[#DEDCDC]">look and feel</i>, the better the results.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {fetching ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-[#C5BAC4]" />
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
              {/* ── Header row ── */}
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">
                  Visual Style Guide
                </label>
                <div className="flex items-center gap-2">
                  {isStructured && (
                    <button
                      type="button"
                      onClick={() => setEditMode((v) => !v)}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#57707A] hover:text-[#C5BAC4] transition-colors"
                    >
                      {editMode ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {editMode ? "Preview" : "Edit"}
                    </button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggest}
                    disabled={suggesting || loading}
                    className="h-8 px-3 text-xs font-bold bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-[#DEDCDC] hover:border-[#C5BAC4]/50 transition-colors rounded-lg"
                  >
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                    {suggesting ? "Analyzing..." : "Auto-Suggest"}
                  </Button>
                </div>
              </div>

              {/* ── Rendered 3-section view OR plain textarea ── */}
              {isStructured && !editMode ? (
                (() => {
                  const { s1, s2, s3 } = parseSections(visualGuide);
                  return (
                    <div className="space-y-3 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                      {/* Section 1 — Audit */}
                      <div className="bg-[#191D23] rounded-xl p-4 border border-[#57707A]/30">
                        <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                          Visual Identity Audit
                        </p>
                        <p className="text-xs text-[#DEDCDC] leading-relaxed">{s1}</p>
                      </div>

                      {/* Section 2 — Enhancement bullets */}
                      <div className="bg-[#191D23] rounded-xl p-4 border border-[#57707A]/30">
                        <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-3">
                          Enhancement Recommendations
                        </p>
                        <div className="space-y-2">
                          {s2.split(/\n(?=[-•*]|\*\*)/).filter(Boolean).map((line, i) => {
                            const clean = line.replace(/^[-•*]+\s*/, "").trim();
                            const boldMatch = clean.match(/^\*\*([^*]+)\*\*:?\s*([\s\S]*)/);
                            return (
                              <div key={i} className="flex gap-2 text-xs">
                                <span className="text-[#C5BAC4] mt-0.5 shrink-0">▸</span>
                                <span className="text-[#DEDCDC] leading-relaxed">
                                  {boldMatch ? (
                                    <><strong className="text-[#C5BAC4]">{boldMatch[1]}</strong>{boldMatch[2] ? ": " + boldMatch[2] : ""}</>
                                  ) : clean}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 3 — AI Image Brief (copy-pasteable) */}
                      <div className="bg-[#C5BAC4]/5 rounded-xl p-4 border border-[#C5BAC4]/20">
                        <p className="text-[10px] font-bold text-[#C5BAC4] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3" /> AI Image Generation Brief
                        </p>
                        <p className="text-xs text-[#DEDCDC] leading-relaxed italic">{s3}</p>
                        <p className="text-[9px] text-[#57707A] mt-2 font-medium">
                          This brief is saved to your brand and injected into every image prompt.
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <Textarea
                  value={visualGuide}
                  onChange={(e) => setVisualGuide(e.target.value)}
                  rows={10}
                  placeholder="e.g., 'We prefer bright, airy shots with natural light. Our aesthetic is minimalist Scandinavian. Never use neon colors.'"
                  className="resize-none text-xs leading-relaxed bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              )}

              {!isStructured && (
                <p className="text-[10px] font-bold text-[#57707A] tracking-wide">
                  This context will be added to every image generation and edit prompt.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-[#57707A]/20 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 font-bold rounded-xl h-11 px-6 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || fetching || suggesting}
            className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-xl h-11 px-6 shadow-lg shadow-[#C5BAC4]/10 transition-all border-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}{" "}
            Save AI Brain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}