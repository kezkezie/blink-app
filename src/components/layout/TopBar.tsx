"use client";

import { useState, useEffect } from "react";
import { Bell, Brain, Loader2, Sparkles, Wand2, Search } from "lucide-react";
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
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Global Background Task Listener
  useEffect(() => {
    const checkStatus = () => {
      // Check standard image gen
      const batchTime = localStorage.getItem("regenerating_img_batch");
      const modalTime = Object.keys(localStorage).some((k) =>
        k.startsWith("regenerating_img_")
      );
      setIsGenerating(!!batchTime || modalTime);

      // Check Brand DNA Extraction
      const extractingTime = localStorage.getItem("blink_extracting_dna");
      setIsExtracting(!!extractingTime);

      // Check Video Analysis
      const analyzingTime = Object.keys(localStorage).some((k) =>
        k.startsWith("blink_analyzing_media_")
      );
      setIsAnalyzing(analyzingTime);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200 shadow-sm">
        {/* Page Title */}
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-blink-dark font-heading">
            {pageTitle}
          </h1>
        </div>

        {/* Global Generation Indicators (Centered) */}
        <div className="flex-1 flex justify-center gap-2">
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-xs font-semibold shadow-sm animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              <span className="hidden sm:inline">Generating Images...</span>
              <Sparkles className="h-3 w-3 text-blue-400 sm:ml-1" />
            </div>
          )}

          {isExtracting && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-purple-700 text-xs font-semibold shadow-sm animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
              <span className="hidden sm:inline">Extracting Brand DNA...</span>
              <Wand2 className="h-3 w-3 text-purple-400 sm:ml-1" />
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 text-xs font-semibold shadow-sm animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
              <span className="hidden sm:inline">Analyzing Media...</span>
              <Search className="h-3 w-3 text-emerald-400 sm:ml-1" />
            </div>
          )}
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
