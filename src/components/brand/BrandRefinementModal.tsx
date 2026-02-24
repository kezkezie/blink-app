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
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [visualGuide, setVisualGuide] = useState("");

  // Fetch existing guide on open
  useEffect(() => {
    async function fetchGuide() {
      if (open && clientId) {
        setFetching(true);
        try {
          const { data, error } = await supabase
            .from("brand_profiles")
            .select("visual_style_guide")
            .eq("client_id", clientId)
            .single();

          if (!error && data?.visual_style_guide) {
            setVisualGuide(data.visual_style_guide);
          }
        } catch (err) {
          console.error("Error fetching guide:", err);
        } finally {
          setFetching(false);
        }
      }
    }
    fetchGuide();
  }, [open, clientId]);

  async function handleSuggest() {
    if (!clientId) return;
    setSuggesting(true);
    try {
      const response = await triggerWorkflow("blink-suggest-visual", {
        client_id: clientId,
      });

      if (response && response.suggestion) {
        // ✨ FIXED: Added 'as string' to satisfy TypeScript
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
    if (!clientId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("brand_profiles")
        .update({ visual_style_guide: visualGuide.trim() || null })
        .eq("client_id", clientId);

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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blink-primary" /> Refine Your Brand's
            AI Brain
          </DialogTitle>
          <DialogDescription>
            Help the AI understand your specific visual identity. The more
            details you provide about how your content should{" "}
            <i>look and feel</i>, the better the results.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {fetching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-end mb-1">
                <label className="text-sm font-medium text-gray-700">
                  Visual Style Guide & Preferences
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSuggest}
                  disabled={suggesting || loading}
                  className="h-7 px-2 text-xs font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-100 transition-colors"
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
                className="resize-none text-[13px] leading-relaxed bg-purple-50/40 border-purple-100 focus-visible:ring-blink-primary"
              />
              <p className="text-xs text-gray-500 pt-1">
                This context will be added to every image generation and edit
                prompt.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || fetching || suggesting}
            className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}{" "}
            Save AI Brain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
