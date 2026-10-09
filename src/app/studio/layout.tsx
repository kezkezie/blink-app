"use client";

import "./studio.css";
import "./legacy-theme.css";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudioNav, StudioTopBar } from "@/components/studio/StudioShell";
import { AskPanel } from "@/components/studio/AskPanel";
import { useAskStore } from "@/components/studio/ask-store";

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
            {bleed ? children : <div className="s-reading">{children}</div>}
          </main>
        </div>
        <AskPanel />
      </div>
    </TooltipProvider>
  );
}
