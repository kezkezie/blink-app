"use client";

import { FlaskConical } from "lucide-react";

/**
 * Auto-posting (connecting social accounts, Post now and scheduled posts through PostForMe) is in
 * beta (Kezie, 2026-10-27: "it's not all the way working... can we set up the automatic posting as
 * like a beta part of the platform"). One tag and one line, the same everywhere it shows.
 */
export const AUTO_POST_BETA_LINE = "Auto-posting is in beta. Most posts go out fine, but a network can still refuse one: BlinkSpot tells you what it said, and you can always download the post and put it up yourself.";

export function BetaTag({ title = AUTO_POST_BETA_LINE }: { title?: string }) {
  return <span className="s-badge ai inline-flex items-center gap-1 align-middle" title={title} aria-label="Beta"><FlaskConical className="h-2.5 w-2.5" aria-hidden />Beta</span>;
}

export function AutoPostBetaNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] flex items-start gap-1.5 ${className}`} style={{ color: "var(--s-mute)" }}>
      <FlaskConical className="h-3.5 w-3.5 mt-px shrink-0" style={{ color: "var(--s-ai)" }} aria-hidden />
      <span>{AUTO_POST_BETA_LINE}</span>
    </p>
  );
}
