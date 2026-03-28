"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import {
  Loader2,
  Save,
  CheckCircle,
  Plus,
  X,
  Trash2,
  AlertCircle,
  Wand2,
  Sparkles,
  Palette,
  Briefcase,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";

const parseArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
};

interface BrandProfileData {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  additional_colors: string[];
  primary_font: string;
  secondary_font: string;
  uploaded_assets: string[];
  visual_style_guide: string;
  brand_voice: string;
  tone_keywords: string;
  vocabulary_notes: string;
  dos: string;
  donts: string;
}

type TabType = "business" | "visual" | "voice";

export default function BrandIdentityPage() {
  const { clientId } = useClient();
  const [loading, setLoading] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [extractingDNA, setExtractingDNA] = useState(false);
  const [suggestingField, setSuggestingField] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showSetupPopup, setShowSetupPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("business");

  const [businessInfo, setBusinessInfo] = useState({
    company_name: "",
    website_url: "",
    industry: "",
    description: "",
    social_urls: "",
  });

  const [brandProfile, setBrandProfile] = useState<BrandProfileData>({
    logo_url: null,
    primary_color: "#2563EB",
    secondary_color: "#F59E0B",
    accent_color: "#10B981",
    additional_colors: ["#6B7280"],
    primary_font: "",
    secondary_font: "",
    uploaded_assets: [],
    visual_style_guide: "",
    brand_voice: "",
    tone_keywords: "",
    vocabulary_notes: "",
    dos: "",
    donts: "",
  });

  const loadData = useCallback(async () => {
    if (!clientId) return;

    const [clientRes, brandRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase
        .from("brand_profiles")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle(),
    ]);

    if (clientRes.data) {
      let desc = "";
      let socials = "";
      if (clientRes.data.onboarding_notes) {
        try {
          const notes = JSON.parse(clientRes.data.onboarding_notes);
          desc = notes.description || "";
          socials = notes.social_urls || "";
        } catch (e) {
          desc = clientRes.data.onboarding_notes;
        }
      }
      setBusinessInfo({
        company_name: clientRes.data.company_name || "",
        website_url: clientRes.data.website_url || "",
        industry: clientRes.data.industry || "",
        description: desc,
        social_urls: socials,
      });
    }

    if (brandRes.data) {
      const addColors = parseArray(brandRes.data.additional_colors);
      const tones = parseArray(brandRes.data.tone_keywords);
      const dosArr = parseArray(brandRes.data.dos);
      const dontsArr = parseArray(brandRes.data.donts);
      const messyGuide = brandRes.data.visual_style_guide || "";

      setBrandProfile({
        logo_url: brandRes.data.logo_url || null,
        primary_color: brandRes.data.primary_color || "#2563EB",
        secondary_color: brandRes.data.secondary_color || "#F59E0B",
        accent_color: brandRes.data.accent_color || "#10B981",
        additional_colors: addColors.length > 0 ? addColors : ["#6B7280"],
        primary_font: brandRes.data.primary_font || "",
        secondary_font: brandRes.data.secondary_font || "",
        uploaded_assets: parseArray(brandRes.data.uploaded_assets),
        visual_style_guide: messyGuide,
        brand_voice: brandRes.data.brand_voice || messyGuide || "",
        tone_keywords: tones.join(", ") || "",
        vocabulary_notes: brandRes.data.vocabulary_notes || "",
        dos: dosArr.join("\n") || "",
        donts: dontsArr.join("\n") || "",
      });
    } else {
      setShowSetupPopup(true);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveBrand() {
    setSavingBrand(true);
    try {
      const toneArray = brandProfile.tone_keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const dosArray = brandProfile.dos
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean);
      const dontsArray = brandProfile.donts
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean);

      await supabase.from("brand_profiles").upsert(
        {
          client_id: clientId,
          logo_url: brandProfile.logo_url,
          primary_color: brandProfile.primary_color,
          secondary_color: brandProfile.secondary_color,
          accent_color: brandProfile.accent_color,
          additional_colors: brandProfile.additional_colors,
          uploaded_assets: brandProfile.uploaded_assets,
          primary_font: brandProfile.primary_font,
          secondary_font: brandProfile.secondary_font,
          visual_style_guide: brandProfile.visual_style_guide,
          brand_voice: brandProfile.brand_voice,
          tone_keywords: toneArray,
          vocabulary_notes: brandProfile.vocabulary_notes,
          dos: dosArray,
          donts: dontsArray,
        },
        { onConflict: "client_id" }
      );

      await supabase
        .from("clients")
        .update({
          company_name: businessInfo.company_name,
          website_url: businessInfo.website_url,
          industry: businessInfo.industry,
          onboarding_notes: JSON.stringify({
            description: businessInfo.description,
            social_urls: businessInfo.social_urls,
          }),
        })
        .eq("id", clientId);

      setConnectionMessage({
        type: "success",
        text: "Brand Identity saved successfully!",
      });
      setTimeout(() => setConnectionMessage(null), 3000);
    } catch (err) {
      setConnectionMessage({
        type: "error",
        text: "Failed to save brand settings",
      });
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleExtractDNA() {
    if (!businessInfo.website_url && !businessInfo.social_urls) {
      setConnectionMessage({
        type: "error",
        text: "Please enter a Website URL or Social Links to scan.",
      });
      return;
    }
    setExtractingDNA(true);
    setConnectionMessage({
      type: "success",
      text: "AI is scraping your links! You can navigate away, we will notify you when it's done.",
    });
    localStorage.setItem("blink_extracting_dna", Date.now().toString());

    try {
      await supabase
        .from("clients")
        .update({
          website_url: businessInfo.website_url,
          company_name: businessInfo.company_name,
          industry: businessInfo.industry,
          onboarding_notes: JSON.stringify({
            description: businessInfo.description,
            social_urls: businessInfo.social_urls,
          }),
        })
        .eq("id", clientId);

      const { data: initialBrand } = await supabase
        .from("brand_profiles")
        .select("updated_at")
        .eq("client_id", clientId)
        .maybeSingle();
      const initialTime = initialBrand?.updated_at;

      triggerWorkflow("blink-brand-extract-001", { client_id: clientId! });

      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const { data: checkBrand } = await supabase
          .from("brand_profiles")
          .select("updated_at")
          .eq("client_id", clientId)
          .maybeSingle();
        if (checkBrand && checkBrand.updated_at !== initialTime) {
          clearInterval(pollInterval);
          await loadData();
          setExtractingDNA(false);
          localStorage.removeItem("blink_extracting_dna");
          setConnectionMessage({
            type: "success",
            text: "Extraction complete! The fields below have been auto-filled.",
          });
        } else if (attempts >= 20) {
          clearInterval(pollInterval);
          setExtractingDNA(false);
          localStorage.removeItem("blink_extracting_dna");
          await loadData();
        }
      }, 3000);
    } catch (err) {
      setConnectionMessage({
        type: "error",
        text: "Failed to trigger AI extraction. The URL might be blocked.",
      });
      setExtractingDNA(false);
      localStorage.removeItem("blink_extracting_dna");
    }
  }

  async function handleSuggest(
    field: keyof BrandProfileData,
    contextLabel: string
  ) {
    if (!businessInfo.company_name || !businessInfo.industry) {
      setConnectionMessage({
        type: "error",
        text: "Please enter your Company Name and Industry first!",
      });
      return;
    }
    setSuggestingField(field);
    try {
      const res = await fetch("/api/brand/suggest", {
        method: "POST",
        body: JSON.stringify({
          field,
          companyName: businessInfo.company_name,
          industry: businessInfo.industry,
          context: contextLabel,
        }),
      });
      const data = await res.json();
      if (data.suggestion)
        setBrandProfile((prev) => ({ ...prev, [field]: data.suggestion }));
    } catch (err) {
      console.error(err);
    } finally {
      setSuggestingField(null);
    }
  }

  async function handleUploadImage(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "logo" | "asset"
  ) {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (type === "logo") setUploadingLogo(true);
    else setUploadingAsset(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.${fileExt}`;
      const filePath = `onboarding/${fileName}`;
      await supabase.storage.from("assets").upload(filePath, file);
      const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
      if (type === "logo")
        setBrandProfile((prev) => ({ ...prev, logo_url: data.publicUrl }));
      else
        setBrandProfile((prev) => ({
          ...prev,
          uploaded_assets: [...prev.uploaded_assets, data.publicUrl],
        }));
    } catch (err) {
      alert("Failed to upload image.");
    } finally {
      if (type === "logo") setUploadingLogo(false);
      else setUploadingAsset(false);
      if (e.target) e.target.value = "";
    }
  }

  function removeAsset(urlToRemove: string) {
    setBrandProfile((prev) => ({
      ...prev,
      uploaded_assets: prev.uploaded_assets.filter(
        (url) => url !== urlToRemove
      ),
    }));
  }
  function removeLogo() {
    setBrandProfile((prev) => ({ ...prev, logo_url: null }));
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-4xl pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Dialog open={showSetupPopup} onOpenChange={setShowSetupPopup}>
        <DialogContent className="sm:max-w-md bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
          <DialogHeader>
            <div className="mx-auto h-16 w-16 bg-[#191D23] border border-[#C5BAC4]/30 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Palette className="h-8 w-8 text-[#C5BAC4]" />
            </div>
            <DialogTitle className="text-center text-xl font-display text-[#DEDCDC]">
              Let's set up your Brand!
            </DialogTitle>
            <DialogDescription className="text-center pt-3 text-[#989DAA] leading-relaxed">
              Your AI currently doesn't know anything about your brand identity.
              Without this, generated posts and images will look generic and
              off-brand.
              <br />
              <br />
              Please fill in your details below, or use the{" "}
              <b className="text-[#C5BAC4]">Auto-Extract Brand DNA</b> button to have the AI magically
              build it for you using your website and socials!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center mt-4 border-t border-[#57707A]/30 pt-4">
            <Button
              onClick={() => setShowSetupPopup(false)}
              className="bg-[#C5BAC4] hover:bg-white text-[#191D23] w-full font-bold shadow-lg shadow-[#C5BAC4]/10 transition-colors"
            >
              Let's Build It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {connectionMessage && (
        <div
          className={cn(
            "px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-3 transition-all shadow-lg animate-in slide-in-from-top-4",
            connectionMessage.type === "success"
              ? "bg-[#B3FF00]/10 text-[#B3FF00] border border-[#B3FF00]/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          {connectionMessage.type === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="leading-relaxed tracking-wide">{connectionMessage.text}</span>
          <button
            onClick={() => setConnectionMessage(null)}
            className="ml-auto p-1 hover:bg-black/20 rounded-full transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Global Action Bar */}
      <div className="bg-[#2A2F38] border border-[#C5BAC4]/30 rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-[#C5BAC4]/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <h3 className="text-xl font-bold text-[#DEDCDC] flex items-center gap-3 font-display">
            <Wand2 className="h-6 w-6 text-[#C5BAC4]" /> Auto-Extract Brand DNA
          </h3>
          <p className="text-sm text-[#989DAA] mt-2 max-w-md leading-relaxed">
            Let our AI scrape your website and provided social media links to
            auto-fill your entire profile below.
          </p>
        </div>
        <Button
          onClick={handleExtractDNA}
          disabled={extractingDNA}
          className="w-full sm:w-auto bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/20 font-bold h-12 px-8 rounded-xl transition-colors relative z-10"
        >
          {extractingDNA ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-5 w-5 mr-2" />
          )}{" "}
          {extractingDNA ? "Analyzing..." : "Extract DNA"}
        </Button>
      </div>

      {/* 🔹 THE NEW TAB NAVIGATION 🔹 */}
      <div className="flex bg-[#191D23] border border-[#57707A]/30 p-1.5 rounded-xl shadow-inner overflow-x-auto">
        <button
          onClick={() => setActiveTab("business")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap",
            activeTab === "business"
              ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50"
              : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
          )}
        >
          <Briefcase className="h-4 w-4" />{" "}
          <span>Business Profile</span>
        </button>
        <button
          onClick={() => setActiveTab("visual")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap",
            activeTab === "visual"
              ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50"
              : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
          )}
        >
          <Palette className="h-4 w-4" />{" "}
          <span>Visual Identity</span>
        </button>
        <button
          onClick={() => setActiveTab("voice")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap",
            activeTab === "voice"
              ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50"
              : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
          )}
        >
          <Megaphone className="h-4 w-4" />{" "}
          <span>Voice & Rules</span>
        </button>
      </div>

      {/* 🔹 TAB 1: BUSINESS PROFILE 🔹 */}
      {activeTab === "business" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6">
              <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                The Basics
              </h3>
              <p className="text-sm text-[#989DAA] mt-1">
                The core context the AI uses to understand who you are.
              </p>
            </div>
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Company Name
                  </label>
                  <Input
                    value={businessInfo.company_name}
                    onChange={(e) =>
                      setBusinessInfo({
                        ...businessInfo,
                        company_name: e.target.value,
                      })
                    }
                    placeholder="e.g. Lup Space"
                    className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Industry Context
                  </label>
                  <Input
                    value={businessInfo.industry}
                    onChange={(e) =>
                      setBusinessInfo({
                        ...businessInfo,
                        industry: e.target.value,
                      })
                    }
                    placeholder="e.g. Retail & E-Commerce"
                    className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Tell us about your business
                </label>
                <Textarea
                  value={businessInfo.description}
                  onChange={(e) =>
                    setBusinessInfo({
                      ...businessInfo,
                      description: e.target.value,
                    })
                  }
                  rows={4}
                  placeholder="What do you sell? Who are your customers? What makes you unique?"
                  className="text-sm resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6">
              <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                Extraction Links
              </h3>
              <p className="text-sm text-[#989DAA] mt-1">
                Provide links for the AI to study when you click "Extract DNA".
              </p>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Website URL
                </label>
                <Input
                  value={businessInfo.website_url}
                  onChange={(e) =>
                    setBusinessInfo({
                      ...businessInfo,
                      website_url: e.target.value,
                    })
                  }
                  placeholder="https://yourbusiness.com"
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Social Media URLs (One per line)
                </label>
                <Textarea
                  value={businessInfo.social_urls}
                  onChange={(e) =>
                    setBusinessInfo({
                      ...businessInfo,
                      social_urls: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="https://instagram.com/yourbrand&#10;https://twitter.com/yourbrand"
                  className="text-sm resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔹 TAB 2: VISUAL IDENTITY 🔹 */}
      {activeTab === "visual" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="flex justify-between items-end mb-6 border-b border-[#57707A]/20 pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Visual Style Guide
                </h3>
                <p className="text-sm text-[#989DAA] mt-1">
                  Describe exactly how your images should look.
                </p>
              </div>
              {!brandProfile.visual_style_guide && (
                <button
                  onClick={() =>
                    handleSuggest(
                      "visual_style_guide",
                      "Visual Style Guide (lighting, mood, aesthetics)"
                    )
                  }
                  disabled={suggestingField === "visual_style_guide"}
                  className="text-xs text-[#C5BAC4] hover:text-white hover:bg-[#C5BAC4]/20 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C5BAC4]/30 transition-colors shadow-sm bg-[#C5BAC4]/10"
                >
                  {suggestingField === "visual_style_guide" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}{" "}
                  AI Suggest
                </button>
              )}
            </div>
            <Textarea
              value={brandProfile.visual_style_guide}
              onChange={(e) =>
                setBrandProfile({
                  ...brandProfile,
                  visual_style_guide: e.target.value,
                })
              }
              rows={5}
              placeholder="e.g., We use moody, cinematic lighting..."
              className="text-sm resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
            />
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6">
              <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                Brand Colors
              </h3>
              <p className="text-sm text-[#989DAA] mt-1">
                The exact HEX codes used in your branding.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: "Primary", key: "primary_color" as const, val: brandProfile.primary_color },
                { label: "Secondary", key: "secondary_color" as const, val: brandProfile.secondary_color },
                { label: "Accent", key: "accent_color" as const, val: brandProfile.accent_color },
                { label: "Additional", key: "additional_colors" as const, val: brandProfile.additional_colors[0] || "#6B7280", isArray: true },
              ].map((item, idx) => (
                <div key={idx}>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    {item.label}
                  </label>
                  <div className="flex items-center gap-2 p-1.5 border border-[#57707A]/40 bg-[#191D23] rounded-xl shadow-inner focus-within:ring-1 focus-within:ring-[#C5BAC4]">
                    <input
                      type="color"
                      value={item.val}
                      onChange={(e) => {
                        if (item.isArray) {
                          setBrandProfile({ ...brandProfile, additional_colors: [e.target.value] });
                        } else {
                          setBrandProfile({ ...brandProfile, [item.key]: e.target.value });
                        }
                      }}
                      className="h-9 w-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 ml-1 color-picker-custom"
                    />
                    <Input
                      value={item.val}
                      onChange={(e) => {
                        if (item.isArray) {
                          setBrandProfile({ ...brandProfile, additional_colors: [e.target.value] });
                        } else {
                          setBrandProfile({ ...brandProfile, [item.key]: e.target.value });
                        }
                      }}
                      className="border-none shadow-none focus-visible:ring-0 px-2 uppercase font-mono text-sm h-9 bg-transparent text-[#DEDCDC]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg flex flex-col">
              <div className="border-b border-[#57707A]/20 pb-4 mb-6">
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Brand Logo
                </h3>
                <p className="text-sm text-[#989DAA] mt-1">Upload a high-res PNG.</p>
              </div>
              <div className="w-full flex-1">
                {brandProfile.logo_url ? (
                  <div className="relative aspect-video rounded-xl border border-[#57707A]/40 bg-[#191D23] shadow-inner overflow-hidden group">
                    <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                    <img
                      src={brandProfile.logo_url}
                      alt="Company Logo"
                      className="w-full h-full object-contain p-4 relative z-10"
                    />
                    <button
                      onClick={removeLogo}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-500 hover:scale-110 z-20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="h-full min-h-[160px] w-full rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer transition-all">
                    {uploadingLogo ? (
                      <Loader2 className="h-8 w-8 animate-spin text-[#C5BAC4]" />
                    ) : (
                      <Plus className="h-8 w-8 text-[#57707A]" />
                    )}
                    <span className="text-xs font-bold text-[#989DAA] uppercase tracking-wider mt-3">
                      {uploadingLogo ? "Uploading..." : "Upload Logo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadImage(e, "logo")}
                      disabled={uploadingLogo}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
              <div className="border-b border-[#57707A]/20 pb-4 mb-6">
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Brand Fonts
                </h3>
                <p className="text-sm text-[#989DAA] mt-1">Specify your typography.</p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Primary Font
                  </label>
                  <Input
                    value={brandProfile.primary_font}
                    onChange={(e) =>
                      setBrandProfile({
                        ...brandProfile,
                        primary_font: e.target.value,
                      })
                    }
                    placeholder="e.g., Inter, Helvetica"
                    className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Secondary Font
                  </label>
                  <Input
                    value={brandProfile.secondary_font}
                    onChange={(e) =>
                      setBrandProfile({
                        ...brandProfile,
                        secondary_font: e.target.value,
                      })
                    }
                    placeholder="e.g., Playfair Display"
                    className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6">
              <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                Additional Brand Assets
              </h3>
              <p className="text-sm text-[#989DAA] mt-1">
                Upload specific product photos or reference images for the AI to
                study.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
              {brandProfile.uploaded_assets.map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-xl border border-[#57707A]/40 bg-[#191D23] shadow-inner overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                  <img
                    src={url}
                    alt="asset"
                    className="w-full h-full object-contain p-2 relative z-10"
                  />
                  <button
                    onClick={() => removeAsset(url)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-500 hover:scale-110 z-20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <label className="aspect-square rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer transition-all">
                {uploadingAsset ? (
                  <Loader2 className="h-6 w-6 animate-spin text-[#C5BAC4]" />
                ) : (
                  <Plus className="h-6 w-6 text-[#57707A]" />
                )}
                <span className="text-[10px] font-bold text-[#989DAA] uppercase tracking-wider mt-3">
                  {uploadingAsset ? "Uploading..." : "Add Asset"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadImage(e, "asset")}
                  disabled={uploadingAsset}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 🔹 TAB 3: VOICE & RULES 🔹 */}
      {activeTab === "voice" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 shadow-lg">
            <div className="flex justify-between items-end mb-6 border-b border-[#57707A]/20 pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Brand Voice & Tone
                </h3>
                <p className="text-sm text-[#989DAA] mt-1">
                  How does your brand speak in captions?
                </p>
              </div>
              {!brandProfile.brand_voice && (
                <button
                  onClick={() =>
                    handleSuggest(
                      "brand_voice",
                      "Brand Voice & Tone for social media captions"
                    )
                  }
                  disabled={suggestingField === "brand_voice"}
                  className="text-xs text-[#C5BAC4] hover:text-white hover:bg-[#C5BAC4]/20 font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C5BAC4]/30 transition-colors shadow-sm bg-[#C5BAC4]/10"
                >
                  {suggestingField === "brand_voice" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}{" "}
                  AI Suggest
                </button>
              )}
            </div>
            <Textarea
              value={brandProfile.brand_voice}
              onChange={(e) =>
                setBrandProfile({
                  ...brandProfile,
                  brand_voice: e.target.value,
                })
              }
              rows={4}
              placeholder="e.g., Witty, slightly sarcastic, but always highly informative..."
              className="text-sm resize-none mb-6 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Tone Keywords (comma separated)
                </label>
                <Input
                  value={brandProfile.tone_keywords}
                  onChange={(e) =>
                    setBrandProfile({
                      ...brandProfile,
                      tone_keywords: e.target.value,
                    })
                  }
                  placeholder="playful, bold, friendly"
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Vocabulary Notes
                </label>
                <Input
                  value={brandProfile.vocabulary_notes}
                  onChange={(e) =>
                    setBrandProfile({
                      ...brandProfile,
                      vocabulary_notes: e.target.value,
                    })
                  }
                  placeholder="Use 'client' not 'customer'"
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-emerald-500/20 bg-[#191D23] p-6 md:p-8 shadow-lg">
              <div className="flex justify-between items-end mb-6 border-b border-emerald-500/10 pb-4">
                <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2 font-display">
                  <CheckCircle className="h-5 w-5" /> Do's
                </h3>
                {!brandProfile.dos && (
                  <button
                    onClick={() =>
                      handleSuggest(
                        "dos",
                        "Specific DOs or best practices for the brand"
                      )
                    }
                    disabled={suggestingField === "dos"}
                    className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 transition-colors"
                  >
                    {suggestingField === "dos" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}{" "}
                    Suggest
                  </button>
                )}
              </div>
              <Textarea
                value={brandProfile.dos}
                onChange={(e) =>
                  setBrandProfile({ ...brandProfile, dos: e.target.value })
                }
                rows={5}
                placeholder="e.g., Always mention our free shipping."
                className="text-sm resize-none bg-[#2A2F38] border-emerald-500/20 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-emerald-500/50 rounded-xl shadow-inner custom-scrollbar"
              />
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-[#191D23] p-6 md:p-8 shadow-lg">
              <div className="flex justify-between items-end mb-6 border-b border-red-500/10 pb-4">
                <h3 className="text-lg font-bold text-red-400 flex items-center gap-2 font-display">
                  <X className="h-5 w-5" /> Don'ts
                </h3>
                {!brandProfile.donts && (
                  <button
                    onClick={() =>
                      handleSuggest(
                        "donts",
                        "Specific DONTs or things to avoid for the brand"
                      )
                    }
                    disabled={suggestingField === "donts"}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 transition-colors"
                  >
                    {suggestingField === "donts" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}{" "}
                    Suggest
                  </button>
                )}
              </div>
              <Textarea
                value={brandProfile.donts}
                onChange={(e) =>
                  setBrandProfile({ ...brandProfile, donts: e.target.value })
                }
                rows={5}
                placeholder="e.g., NEVER mention price directly."
                className="text-sm resize-none bg-[#2A2F38] border-red-500/20 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-red-500/50 rounded-xl shadow-inner custom-scrollbar"
              />
            </div>
          </div>
        </div>
      )}

      {/* Global Save Button */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[260px] bg-[#191D23]/80 backdrop-blur-xl border-t border-[#57707A]/30 p-4 md:p-6 flex justify-end z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
        <div className="max-w-4xl mx-auto w-full flex justify-end">
          <Button
            onClick={handleSaveBrand}
            disabled={savingBrand}
            className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold gap-2 px-10 h-12 text-base w-full sm:w-auto shadow-lg shadow-[#C5BAC4]/10 rounded-xl transition-all disabled:opacity-50"
          >
            {savingBrand ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}{" "}
            {savingBrand ? "Saving Profile..." : "Save Brand Identity"}
          </Button>
        </div>
      </div>
    </div>
  );
}