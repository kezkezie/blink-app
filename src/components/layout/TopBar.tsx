"use client";

import { useState, useEffect } from "react";
import { Bell, Brain, Loader2, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandRefinementModal } from "@/components/brand/BrandRefinementModal";
import { cn } from "@/lib/utils";

interface TopBarProps {
  pageTitle: string;
}

export function TopBar({ pageTitle }: TopBarProps) {
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // ✨ NEW: Global Background Task Listener
  useEffect(() => {
    const checkBackgroundTasks = () => {
      let activeGenerations = false;

      // Scan localStorage to see if any components left a "regenerating" token
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("regenerating_img_")) {
          const timestamp = parseInt(localStorage.getItem(key) || "0");
          // If the token is less than 5 minutes old, it's actively generating
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            activeGenerations = true;
            break;
          } else {
            // Clean up old stuck tokens
            localStorage.removeItem(key);
          }
        }
      }
      setIsGenerating(activeGenerations);
    };

    // Check immediately, then check every 2 seconds
    checkBackgroundTasks();
    const interval = setInterval(checkBackgroundTasks, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
        {/* Page Title */}
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-blink-dark font-heading">
            {pageTitle}
          </h1>
        </div>

        {/* ✨ NEW: Global Generation Indicator (Centered) */}
        <div className="flex-1 flex justify-center">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-xs font-semibold shadow-sm transition-all duration-500",
              isGenerating
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-4 pointer-events-none"
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            <span>AI is working in background...</span>
            <Sparkles className="h-3 w-3 text-blue-400 ml-1" />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex-1 flex items-center justify-end gap-3">
          {/* Refine AI Brain Button */}
          <button
            onClick={() => setBrandModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 shadow-sm"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden md:inline">Refine AI Brain</span>
          </button>

          {/* Notification Bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-500 hover:text-blink-dark"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blink-secondary" />
          </Button>

          {/* User Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-blink-primary text-white text-sm font-semibold">
                    K
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">Kez</p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Brand Refinement Modal */}
      <BrandRefinementModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
      />
    </>
  );
}
