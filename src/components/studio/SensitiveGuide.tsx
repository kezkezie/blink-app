"use client";

import { ShieldCheck } from "lucide-react";
import { SENSITIVE_GUIDES, type SensitiveKind } from "@/lib/sensitive-subjects";

/**
 * What works for a medical, intimate or lingerie brand (lib/sensitive-subjects.ts), shown before
 * spending credits: the line, the ideas that make well (one tap fills the brief), the best model.
 */
export function SensitiveGuide({ kind, onIdea, onBest, showBest, video = false }: {
  kind: SensitiveKind; onIdea: (brief: string) => void; onBest?: () => void; showBest?: boolean; video?: boolean;
}) {
  const g = SENSITIVE_GUIDES[kind];
  return (
    <div className="rounded-xl p-3 grid gap-2" style={{ background: "color-mix(in oklab, var(--s-ai) 8%, var(--s-bg))", border: "1px solid color-mix(in oklab, var(--s-ai) 30%, transparent)" }} role="note" aria-label={g.title}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--s-ai)" }} />
        <div className="grid gap-1">
          <b className="text-[13px]">{g.title}</b>
          <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{g.line}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {g.ideas.map((i) => <button key={i.label} type="button" className="s-chip" title={i.brief} onClick={() => onIdea(i.brief)}>{i.label}</button>)}
      </div>
      <span className="text-[11.5px] flex flex-wrap items-center gap-2" style={{ color: "var(--s-mute)" }}>
        {video ? g.video : g.model}
        {showBest && onBest && <button type="button" className="s-btn ghost sm" onClick={onBest}>Use Best</button>}
      </span>
    </div>
  );
}
