"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_COST = 6;

interface LogoGeneratorProps {
  brandId: string;
  /** Called with the saved logo URL after the user accepts one. */
  onSaved: (logoUrl: string) => void;
}

type Phase = "idle" | "generating" | "candidates" | "saving";

/**
 * Generate a brand logo from the brand's context (Ideogram v3 Turbo, 6 credits)
 * when a brand has none. Calls POST /api/brand/logo to generate, shows the
 * candidates, and PATCHes the chosen one onto the brand on accept. Non-blocking,
 * keyboard-accessible, no browser dialogs. The generation is refund-safe server-side.
 */
export function LogoGenerator({ brandId, onSaved }: LogoGeneratorProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPhase("generating");
    setError(null);
    try {
      const res = await fetch("/api/brand/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) { setError("You don't have enough credits (needs 6). Please top up."); setPhase("idle"); return; }
      if (!res.ok) { setError(data.error || "Logo generation is temporarily unavailable. Please try again."); setPhase("idle"); return; }
      const urls: string[] = Array.isArray(data.logoUrls) ? data.logoUrls : [];
      if (urls.length === 0) { setError("No logo was returned. Please try again."); setPhase("idle"); return; }
      setCandidates(urls);
      setSelected(urls[0]);
      setPhase("candidates");
    } catch {
      setError("Something went wrong generating your logo. Please try again.");
      setPhase("idle");
    }
  }

  async function accept() {
    if (!selected) return;
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch("/api/brand/logo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, logoUrl: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not save the logo. Please try again."); setPhase("candidates"); return; }
      onSaved(selected);
      setPhase("idle");
      setCandidates([]);
      setSelected(null);
    } catch {
      setError("Could not save the logo. Please try again.");
      setPhase("candidates");
    }
  }

  const busy = phase === "generating" || phase === "saving";

  return (
    <div className="mt-2 rounded-xl border border-[#C5BAC4]/30 bg-[#C5BAC4]/8 p-3.5" role="group" aria-label="Generate a brand logo">
      <p className="text-[12px] text-[#DEDCDC] font-bold flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-[#C5BAC4]" aria-hidden="true" /> No logo yet? Create one from your brand.
      </p>
      <p className="text-[11px] text-[#989DAA] mt-0.5">BlinkSpot designs a logo from your brand name, industry, and colors. Uses {LOGO_COST} credits.</p>

      {(phase === "idle" || phase === "generating") && (
        <Button
          onClick={generate}
          disabled={busy}
          className="mt-2.5 h-9 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-lg text-xs px-4"
        >
          {phase === "generating" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />}
          {phase === "generating" ? "Designing your logo…" : `Generate a logo (${LOGO_COST} credits)`}
        </Button>
      )}

      {(phase === "candidates" || phase === "saving") && candidates.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Choose a logo">
            {candidates.map((url, idx) => {
              const isSel = selected === url;
              return (
                <button
                  key={url}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  aria-label={`Logo option ${idx + 1}`}
                  onClick={() => setSelected(url)}
                  className={`relative w-24 h-24 rounded-xl overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5BAC4] ${isSel ? "border-[#C5BAC4]" : "border-[#57707A]/40 hover:border-[#C5BAC4]/50"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Generated logo option ${idx + 1}`} className="w-full h-full object-contain bg-white" />
                  {isSel && <span className="absolute top-1 right-1 bg-[#C5BAC4] text-[#191D23] rounded-full p-0.5"><Check className="h-3 w-3" aria-hidden="true" /></span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button onClick={accept} disabled={busy || !selected} className="h-9 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold rounded-lg text-xs px-4">
              {phase === "saving" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />}
              Use this logo
            </Button>
            <Button onClick={generate} disabled={busy} variant="outline" className="h-9 bg-transparent border-[#57707A]/50 text-[#DEDCDC] rounded-lg text-xs px-4">
              Regenerate ({LOGO_COST} credits)
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[11px] text-red-400 font-medium">{error}</p>}
    </div>
  );
}
