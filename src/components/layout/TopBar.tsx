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
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-[#191D23]/90 backdrop-blur-md border-b border-[#57707A]/30 shadow-sm transition-all">
        {/* Page Title */}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#DEDCDC] font-display tracking-wide">
            {pageTitle}
          </h1>
        </div>

        {/* Global Generation Indicators (Centered) */}
        <div className="flex-1 flex justify-center gap-3">
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2A2F38] border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold shadow-md animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              <span className="hidden sm:inline">Generating Images...</span>
              <Sparkles className="h-3 w-3 text-blue-400 sm:ml-1" />
            </div>
          )}

          {isExtracting && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2A2F38] border border-purple-500/30 rounded-full text-purple-400 text-xs font-bold shadow-md animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
              <span className="hidden sm:inline">Extracting Brand DNA...</span>
              <Wand2 className="h-3 w-3 text-purple-400 sm:ml-1" />
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2A2F38] border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold shadow-md animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span className="hidden sm:inline">Analyzing Media...</span>
              <Search className="h-3 w-3 text-emerald-400 sm:ml-1" />
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex-1 flex items-center justify-end gap-4">
          {/* Refine AI Brain Button */}
          <button
            onClick={() => setBrandModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#191D23] bg-[#C5BAC4] hover:bg-white rounded-lg transition-all shadow-md shadow-[#C5BAC4]/10"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden md:inline uppercase tracking-wider">Refine AI Brain</span>
          </button>

          {/* Notification Bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38] transition-colors"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-[#B3FF00] border-2 border-[#191D23] shadow-[0_0_8px_rgba(179,255,0,0.8)]" />
          </Button>

          {/* User Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ring-2 ring-transparent hover:ring-[#C5BAC4]/50 transition-all">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#2A2F38] text-[#C5BAC4] border border-[#57707A]/50 text-sm font-bold font-display">
                    K
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-xl">
              <div className="px-2 py-1.5">
                <p className="text-sm font-bold text-[#DEDCDC]">Kez</p>
                <p className="text-xs text-[#989DAA] font-medium">Admin</p>
              </div>
              <DropdownMenuSeparator className="bg-[#57707A]/30" />
              <DropdownMenuItem className="focus:bg-[#191D23] focus:text-[#DEDCDC] cursor-pointer">Profile</DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-[#191D23] focus:text-[#DEDCDC] cursor-pointer">Settings</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#57707A]/30" />
              <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-300 font-bold cursor-pointer">
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