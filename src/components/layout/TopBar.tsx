"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { Bell, Brain, Loader2, Sparkles, Wand2, Search, Briefcase, ChevronDown, Check, Plus, Trash2 } from "lucide-react";
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
import { BrandCreationModal } from "@/components/brand/info"; // ✨ IMPORT NEW CREATION MODAL
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { useBrandStore } from "@/app/store/useBrandStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { archiveBrand, getBrandAllowance } from "@/app/actions/brand";

interface TopBarProps {
  pageTitle: string;
}

export function TopBar({ pageTitle }: TopBarProps) {
  const { clientId } = useClient();
  const router = useRouter();

  // Modal States
  const [brandRefinementModalOpen, setBrandRefinementModalOpen] = useState(false);
  const [brandCreationModalOpen, setBrandCreationModalOpen] = useState(false); // ✨ NEW MODAL STATE

  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);
  const [userProfile, setUserProfile] = useState<{ name: string; email: string } | null>(null);

  const { activeTasks } = useWorkflowStore();
  const isGenerating = activeTasks.some(t => t.label.includes("Image") || t.label.includes("Video"));
  const isExtracting = activeTasks.some(t => t.label.includes("DNA") || t.label.includes("Extract"));
  const isAnalyzing = activeTasks.some(t => t.label.includes("Analyz") || t.label.includes("Media"));

  const { activeBrand, availableBrands, setActiveBrand, setAvailableBrands } = useBrandStore();

  const fetchBrands = () => {
    if (!clientId) return;
    supabase
      .from("brand_profiles")
      .select("id, brand_name, logo_url")
      .eq("client_id", clientId)
      .eq("is_active", true) // archived brands are hidden, never shown as switchable
      .then(({ data }) => {
        if (data) {
          setAvailableBrands(data);
          const currentActive = useBrandStore.getState().activeBrand;
          // If no active brand, or if a new brand was just created, update active
          if (!currentActive && data.length > 0) {
            setActiveBrand(data[0]);
          }
        }
      });
  };

  useEffect(() => {
    fetchBrands();

    if (!clientId) return;
    supabase
      .from("clients")
      .select("contact_name, contact_email")
      .eq("id", clientId)
      .single()
      .then(({ data }) => {
        if (data) {
          setUserProfile({
            name: data.contact_name || "User",
            email: data.contact_email || "",
          });
        }
      });
  }, [clientId, setAvailableBrands, setActiveBrand]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    useBrandStore.setState({ activeBrand: null, availableBrands: [] });
    router.push("/login");
  };

  // Archive (soft delete) with an inline two-step confirm. The first click arms the
  // button ("Archive?"); the second archives through the server action, which checks
  // the session and ownership. The old version hard-deleted from the browser, which
  // failed for any brand with posts (content/social_accounts reference the row).
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  // An armed "Archive?" disarms after 4 s or when the menu closes. It used to disarm on blur, but the
  // dropdown moves focus to the row on every pointer move, so the button disarmed before the second
  // click could land and brands could never be archived (reported by Kezie, 2026-10-05).
  useEffect(() => {
    if (!confirmArchiveId) return;
    const t = setTimeout(() => setConfirmArchiveId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmArchiveId]);

  const handleArchiveBrand = async (brandId: string, brandName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirmArchiveId !== brandId) {
      setConfirmArchiveId(brandId);
      return;
    }
    setArchivingId(brandId);
    try {
      const result = await archiveBrand(brandId);
      if (result.error) throw new Error(result.error);
      const updatedBrands = availableBrands.filter((b) => b.id !== brandId);
      setAvailableBrands(updatedBrands);
      if (activeBrand?.id === brandId) {
        setActiveBrand(updatedBrands.length > 0 ? updatedBrands[0] : null);
      }
      toast.success(`Archived "${brandName || "Unnamed"}". Its posts and history are kept.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive the brand. Please try again.");
    } finally {
      setArchivingId(null);
      setConfirmArchiveId(null);
    }
  };

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

          {/* MULTI-BRAND WORKSPACE SWITCHER */}
          <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmArchiveId(null); }}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#191D23] hover:text-white transition-all shadow-md">
                {activeBrand?.logo_url ? (
                  <img src={activeBrand.logo_url} alt="Logo" className="h-4 w-4 rounded-sm object-contain bg-[#DEDCDC] p-px" />
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

              {/* ✨ NEW ADD BRAND BUTTON ✨ */}
              <DropdownMenuItem
                onClick={async () => {
                  // Explain the plan limit BEFORE the user fills in a whole form.
                  // The server still enforces it at creation time.
                  const allowance = await getBrandAllowance();
                  if ("error" in allowance) { toast.error(allowance.error); return; }
                  if (!allowance.canCreate) {
                    toast.error(`You're using ${allowance.used} of ${allowance.limit} brand${allowance.limit === 1 ? "" : "s"} on your plan. Upgrade, or archive a brand to free a slot.`);
                    return;
                  }
                  setBrandCreationModalOpen(true);
                }}
                className="flex items-center gap-3 cursor-pointer focus:bg-[#C5BAC4]/10 focus:text-[#C5BAC4] py-2 text-[#C5BAC4] font-bold"
              >
                <div className="h-6 w-6 rounded-md bg-[#C5BAC4]/10 border border-[#C5BAC4]/30 flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="truncate text-sm">Add New Brand</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-[#57707A]/30" />

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

              {availableBrands.length > 0 ? (
                availableBrands.map((brand) => (
                  <DropdownMenuItem
                    key={brand.id}
                    onClick={() => setActiveBrand(brand)}
                    className="flex items-center gap-3 cursor-pointer focus:bg-[#191D23] focus:text-[#DEDCDC] py-2 group relative pr-10"
                  >
                    <div className="h-6 w-6 rounded-md bg-[#191D23] border border-[#57707A]/50 flex items-center justify-center overflow-hidden shrink-0">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt="logo" className="h-full w-full object-contain bg-[#DEDCDC] p-0.5" />
                      ) : (
                        <Briefcase className="h-3 w-3 text-[#57707A]" />
                      )}
                    </div>

                    <span className="truncate font-medium text-sm">
                      {brand.brand_name || "Unnamed Workspace"}
                    </span>

                    {/* Checkmark (hides when hovering to make room for trash) */}
                    {activeBrand?.id === brand.id && (
                      <Check className="h-4 w-4 ml-auto text-[#B3FF00] group-hover:opacity-0 transition-opacity" />
                    )}

                    {/* Archive: first click arms, second click archives */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleArchiveBrand(brand.id, brand.brand_name, e)}
                      disabled={archivingId === brand.id}
                      aria-label={confirmArchiveId === brand.id ? `Confirm archiving ${brand.brand_name || "this brand"}` : `Archive ${brand.brand_name || "this brand"}`}
                      className={cn(
                        "absolute right-2 flex items-center gap-1 rounded-md transition-all z-10 text-xs font-bold",
                        confirmArchiveId === brand.id
                          ? "opacity-100 px-2 py-1 bg-red-500/20 text-red-300"
                          : "opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 p-1.5 hover:bg-red-500/20 text-[#57707A] hover:text-red-400",
                      )}
                    >
                      {archivingId === brand.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : confirmArchiveId === brand.id ? (
                        "Archive?"
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>

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
            onClick={() => setBrandRefinementModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#191D23] bg-[#C5BAC4] hover:bg-white rounded-lg transition-all shadow-md shadow-[#C5BAC4]/10"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden lg:inline uppercase tracking-wider">Refine AI Brain</span>
          </button>

          {/* FUNCTIONAL NOTIFICATION BELL */}
          <DropdownMenu onOpenChange={(open) => { if (open) setHasUnreadNotifications(false); }}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-[#57707A] hover:text-[#C5BAC4] hover:bg-[#2A2F38] transition-colors"
              >
                <Bell className="h-5 w-5" />
                {hasUnreadNotifications && (
                  <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-[#B3FF00] border-2 border-[#191D23] shadow-[0_0_8px_rgba(179,255,0,0.8)] animate-pulse" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-xl p-2 rounded-xl">
              <div className="px-3 py-2 border-b border-[#57707A]/30 mb-2">
                <h4 className="font-bold text-[#DEDCDC]">What's New</h4>
              </div>
              <div className="space-y-1">
                <div className="flex gap-3 p-2 hover:bg-[#191D23] rounded-lg transition-colors cursor-pointer">
                  <div className="mt-0.5 bg-[#B3FF00]/10 p-2 rounded-md text-[#B3FF00] h-fit"><Briefcase className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-bold text-[#DEDCDC]">Multi-Brand Workspaces</p>
                    <p className="text-xs text-[#989DAA] mt-1 leading-relaxed">You can now create and manage multiple brands from a single account! Switch workspaces using the top menu.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-2 hover:bg-[#191D23] rounded-lg transition-colors cursor-pointer">
                  <div className="mt-0.5 bg-[#C5BAC4]/10 p-2 rounded-md text-[#C5BAC4] h-fit"><Sparkles className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-bold text-[#DEDCDC]">Nano Banana 2 is Live</p>
                    <p className="text-xs text-[#989DAA] mt-1 leading-relaxed">Our new flagship image engine is now the default in the Image Studio for standard generation.</p>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* DYNAMIC USER AVATAR DROPDOWN */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 ring-2 ring-transparent hover:ring-[#C5BAC4]/50 transition-all">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#2A2F38] text-[#C5BAC4] border border-[#57707A]/50 text-sm font-bold font-display uppercase">
                    {userProfile?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-xl rounded-xl">
              <div className="px-3 py-2.5">
                <p className="text-sm font-bold text-[#DEDCDC] truncate">{userProfile?.name || "Loading..."}</p>
                <p className="text-xs text-[#989DAA] font-medium truncate mt-0.5">{userProfile?.email || ""}</p>
              </div>
              <DropdownMenuSeparator className="bg-[#57707A]/30" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-red-400 focus:bg-red-500/10 focus:text-red-300 font-bold cursor-pointer py-2.5"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <BrandRefinementModal
        open={brandRefinementModalOpen}
        onOpenChange={setBrandRefinementModalOpen}
      />

      {/* ✨ MOUNT THE CREATION MODAL ✨ */}
      <BrandCreationModal
        isOpen={brandCreationModalOpen}
        onClose={() => setBrandCreationModalOpen(false)}
        onSuccess={() => {
          fetchBrands(); // Refresh the list when a new brand is added
        }}
      />
    </>
  );
}