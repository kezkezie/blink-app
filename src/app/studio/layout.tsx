"use client";

import "./studio.css";
import "./legacy-theme.css";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudioNav, StudioTopBar } from "@/components/studio/StudioShell";
import { AskPanel } from "@/components/studio/AskPanel";
import { Dictation } from "@/components/studio/Dictation";
import { useAskStore } from "@/components/studio/ask-store";
import { SharedBrandBar, ViewerGate } from "@/components/studio/sharing/SharedBrand";
import { UI_COOKIE } from "@/lib/studio-routes";

/**
 * BlinkSpot v2 shell: four places (Create, Library, Plan, Brand), the account menu, the active
 * brand, the live credit balance and the Ask BlinkSpot assistant. The classic /dashboard layout is
 * untouched; reused classic pages render inside this shell and are re-skinned by legacy-theme.css.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setOpen, open } = useAskStore();

  // Dialogs and menus render in portals on <body>, outside this tree. Scope the look to <body>
  // while the studio is mounted so they match; the classic UI never has the class.
  useEffect(() => {
    document.body.classList.add("studio");
    return () => document.body.classList.remove("studio");
  }, []);

  // Growing prompt boxes (textarea.s-grow) where CSS field-sizing isn't there yet (Firefox, older
  // Safari): sized to their text as you type, up to their --max-lines.
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) return;
    const fit = (el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      const max = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
      el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    };
    const onInput = (e: Event) => { const t = e.target; if (t instanceof HTMLTextAreaElement && t.classList.contains("s-grow")) fit(t); };
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onInput, true);
    return () => { document.removeEventListener("input", onInput, true); document.removeEventListener("focusin", onInput, true); };
  }, []);

  // Seeing the studio switches you to the new look (only a page that actually renders can do this).
  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${UI_COOKIE}=studio`)) {
      document.cookie = `${UI_COOKIE}=studio; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
  }, []);

  // Cmd/Ctrl+K opens the assistant from anywhere in the studio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Editors use the whole viewport; reading pages get a centred column.
  const bleed = pathname.startsWith("/studio/video") || pathname.startsWith("/studio/image");

  return (
    <TooltipProvider delayDuration={0}>
      <div className="studio s-app">
        <StudioNav />
        <div className="s-main">
          <StudioTopBar />
          <main className={bleed ? "s-content bleed" : "s-content"}>
            {/* Shared brands (2026-10-13): whose brand this is and your role; viewers can't open makers. */}
            {bleed
              ? <><div className="px-4 pt-3 empty:hidden"><SharedBrandBar /></div><ViewerGate>{children}</ViewerGate></>
              : <div className="s-reading"><SharedBrandBar /><ViewerGate>{children}</ViewerGate></div>}
          </main>
        </div>
        <AskPanel />
        <Dictation />
      </div>
    </TooltipProvider>
  );
}
