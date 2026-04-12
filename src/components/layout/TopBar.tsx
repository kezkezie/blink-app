"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Bell, Brain, Loader2, Sparkles, Wand2, Search, Briefcase, ChevronDown, Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { BrandRefinementModal } from "@/components/brand/BrandRefinementModal";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { useBrandStore } from "@/app/store/useBrandStore";
import { cn } from "@/lib/utils";

interface TopBarProps {
  pageTitle: string;
}

export function TopBar({ pageTitle }: TopBarProps) {
  const { clientId } = useClient();
  const [brandModalOpen, setBrandModalOpen] = useState(false);

  const { activeTasks } = useWorkflowStore();
  const isGenerating = activeTasks.some(t => t.label.includes("Image") || t.label.includes("Video"));
  const isExtracting = activeTasks.some(t => t.label.includes("DNA") || t.label.includes("Extract"));
  const isAnalyzing = activeTasks.some(t => t.label.includes("Analyz") || t.label.includes("Media"));

  // ✨ Extracted setAvailableBrands so the TopBar can update the global list
  const { activeBrand, availableBrands, setActiveBrand, setAvailableBrands } = useBrandStore();

  // ✨ GLOBAL BRAND FETCHING
  // This ensures your brands are loaded on EVERY page (Settings, Grid, etc.)
  useEffect(() => {
    if (!clientId) return;

    supabase
      .from("brand_profiles")
      .select("id, brand_name, logo_url")
      .eq("client_id", clientId)
      .then(({ data }) => {
        if (data) {
          setAvailableBrands(data);

          // Auto-select the first brand if none is active
          const currentActive = useBrandStore.getState().activeBrand;
          if (!currentActive && data.length > 0) {
            setActiveBrand(data[0]);
          }
        }
      });
  }, [clientId, setAvailableBrands, setActiveBrand]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-[#191D23]/90 backdrop-blur-md border-b border-[#57707A]/30 shadow-sm transition-all">
        {/* Page Title */}
        <div className="flex-1 flex items-center gap-4">
          <h1 className="text-xl font-bold text-[#DEDCDC] font-display tracking-wide">
            {pageTitle}
          </h1>
        </div>

        {/* Global Generation Indicators */}
        <div className="flex-1 flex justify-center gap-3">
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2A2F38] border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold shadow-md animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              <span className="hidden sm:inline">Generating Media...</span>
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

          {/* ✨ MULTI-BRAND WORKSPACE SWITCHER ✨ */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#191D23] hover:text-white transition-all shadow-md">
                {activeBrand?.logo_url ? (
                  <img src={activeBrand.logo_url} alt="Logo" className="h-4 w-4 rounded-sm object-cover" />
                ) : (
                  <Briefcase className="h-4 w-4 text-[#C5BAC4]" />
                )}
                <span className="hidden sm:inline-block max-w-[120px] truncate font-bold text-xs">
                  {activeBrand ? (activeBrand.brand_name || "Unnamed Workspace") : "No Brand"}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-xl">
              <DropdownMenuLabel className="text-xs text-[#989DAA] uppercase tracking-wider font-bold">Your Brands</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#57707A]/30" />

              {/* ✨ NEW: NO BRAND OPTION ✨ */}
              <DropdownMenuItem
                onClick={() => setActiveBrand(null)}
                className="flex items-center gap-3 cursor-pointer focus:bg-[#191D23] focus:text-[#DEDCDC] py-2"
              >
                <div className="h-6 w-6 rounded-md bg-[#191D23] border border-[#57707A]/50 flex items-center justify-center shrink-0">
                  <Briefcase className="h-3 w-3 text-[#57707A]" />
                </div>
                <span className="truncate font-medium text-sm text-[#989DAA]">No Brand</span>
                {activeBrand === null && <Check className="h-4 w-4 ml-auto text-[#B3FF00]" />}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-[#57707A]/30" />

              {/* LIST OF SAVED BRANDS */}
              {availableBrands.length > 0 ? (
                availableBrands.map((brand) => (
                  <DropdownMenuItem
                    key={brand.id}
                    onClick={() => setActiveBrand(brand)}
                    className="flex items-center gap-3 cursor-pointer focus:bg-[#191D23] focus:text-[#DEDCDC] py-2"
                  >
                    <div className="h-6 w-6 rounded-md bg-[#191D23] border border-[#57707A]/50 flex items-center justify-center overflow-hidden shrink-0">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt="logo" className="h-full w-full object-cover" />
                      ) : (
                        <Briefcase className="h-3 w-3 text-[#57707A]" />
                      )}
                    </div>
                    <span className="truncate font-medium text-sm">{brand.brand_name || "Unnamed Workspace"}</span>
                    {activeBrand?.id === brand.id && <Check className="h-4 w-4 ml-auto text-[#B3FF00]" />}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-3 text-xs text-[#57707A] text-center">
                  No additional brands found.
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refine AI Brain Button */}
          <button
            onClick={() => setBrandModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#191D23] bg-[#C5BAC4] hover:bg-white rounded-lg transition-all shadow-md shadow-[#C5BAC4]/10"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden lg:inline uppercase tracking-wider">Refine AI Brain</span>
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
              <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-300 font-bold cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <BrandRefinementModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
      />
    </>
  );
}