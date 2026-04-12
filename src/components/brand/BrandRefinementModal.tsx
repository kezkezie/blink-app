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
import { Sparkles, Loader2, Brain, Wand2 } from "lucide-react";
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
      const response = await triggerWorkflow("blink-enhance-brand", {
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

  async function handleSave() {
    if (!activeBrand) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("brand_profiles")
        .update({ visual_style_guide: visualGuide.trim() || null })
        .eq("id", activeBrand.id);

      if (error) throw error;

      alert("Brand AI Brain updated successfully!");
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
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-[#57707A] uppercase tracking-wider">
                  Visual Style Guide & Preferences
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggest}
                  disabled={suggesting || loading}
                  className="h-8 px-3 text-xs font-bold bg-transparent border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-[#DEDCDC] hover:border-[#C5BAC4]/50 transition-colors rounded-lg"
                >
                  {suggesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {suggesting ? "Analyzing..." : "Auto-Suggest"}
                </Button>
              </div>
              <Textarea
                value={visualGuide}
                onChange={(e) => setVisualGuide(e.target.value)}
                rows={8}
                placeholder="e.g., 'We prefer bright, airy shots with natural light. Our aesthetic is minimalist Scandinavian. Never use neon colors. We want to feel luxurious but approachable.'"
                className="resize-none text-sm leading-relaxed bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
              />
              <p className="text-[10px] font-bold text-[#57707A] mt-1 tracking-wide">
                This context will be added to every image generation and edit
                prompt.
              </p>
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