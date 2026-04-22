"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import { useBrandStore } from "@/app/store/useBrandStore";
import {
  Loader2, Save, CheckCircle, Plus, X, Trash2, AlertCircle,
  Wand2, Sparkles, Palette, Briefcase, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";

const parseArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch { return []; }
  }
  return [];
};

interface BrandProfileData {
  brand_name: string;
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
  const { activeBrand, availableBrands, setAvailableBrands, setActiveBrand } = useBrandStore();

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [extractingDNA, setExtractingDNA] = useState(false);
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [suggestingField, setSuggestingField] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ type: "success" | "error"; text: string; } | null>(null);
  const [showSetupPopup, setShowSetupPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("business");
  const [planTier, setPlanTier] = useState<string>("starter");

  const [businessInfo, setBusinessInfo] = useState({
    company_name: "", website_url: "", industry: "", description: "", social_urls: "",
  });

  const [brandProfile, setBrandProfile] = useState<BrandProfileData>({
    brand_name: "",
    logo_url: null, primary_color: "#2563EB", secondary_color: "#F59E0B", accent_color: "#10B981",
    additional_colors: ["#6B7280"], primary_font: "", secondary_font: "", uploaded_assets: [],
    visual_style_guide: "", brand_voice: "", tone_keywords: "", vocabulary_notes: "", dos: "", donts: "",
  });

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!clientId) return;
    supabase.from("brand_profiles").select("id, brand_name, logo_url").eq("client_id", clientId).then(({ data }) => {
      if (data) {
        setAvailableBrands(data);
        const currentActive = useBrandStore.getState().activeBrand;
        if (!currentActive && data.length > 0) {
          setActiveBrand(data[0]);
        }
      }
    });
  }, [clientId, setAvailableBrands, setActiveBrand]);

  const loadBrandData = useCallback(async () => {
    if (!clientId) return;
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true);

    try {
      const [clientRes, brandRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single(),
        supabase.from("brand_profiles").select("*").eq("id", activeBrand.id).single(), // ✨ Safely isolated
      ]);

      if (brandRes.error) {
        setActiveBrand(null);
        setLoading(false);
        return;
      }

      if (clientRes.data) {
        setPlanTier(clientRes.data.plan_tier || "starter");

        let desc = ""; let socials = "";
        if (clientRes.data.onboarding_notes) {
          try {
            const notes = JSON.parse(clientRes.data.onboarding_notes);
            desc = notes.description || ""; socials = notes.social_urls || "";
          } catch (e) { desc = clientRes.data.onboarding_notes; }
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
        setBrandProfile({
          brand_name: brandRes.data.brand_name || "",
          logo_url: brandRes.data.logo_url || null,
          primary_color: brandRes.data.primary_color || "#2563EB",
          secondary_color: brandRes.data.secondary_color || "#F59E0B",
          accent_color: brandRes.data.accent_color || "#10B981",
          additional_colors: parseArray(brandRes.data.additional_colors).length > 0 ? parseArray(brandRes.data.additional_colors) : ["#6B7280"],
          primary_font: brandRes.data.primary_font || "",
          secondary_font: brandRes.data.secondary_font || "",
          uploaded_assets: parseArray(brandRes.data.uploaded_assets),
          visual_style_guide: brandRes.data.visual_style_guide || "",
          brand_voice: brandRes.data.brand_voice || brandRes.data.visual_style_guide || "",
          tone_keywords: parseArray(brandRes.data.tone_keywords).join(", ") || "",
          vocabulary_notes: brandRes.data.vocabulary_notes || "",
          dos: parseArray(brandRes.data.dos).join("\n") || "",
          donts: parseArray(brandRes.data.donts).join("\n") || "",
        });
      } else {
        setShowSetupPopup(true);
      }
    } catch (err) {
      console.error(err);
      setActiveBrand(null);
    }
    setLoading(false);
  }, [clientId, activeBrand?.id, setActiveBrand]);

  useEffect(() => { loadBrandData(); }, [loadBrandData]);

  const PLAN_BRAND_LIMITS: Record<string, number> = {
    starter: 1,
    pro: 3,
    agency: Infinity,
    admin: Infinity,
    enterprise: Infinity,
    custom: Infinity,
  };

  async function handleCreateNewBrand() {
    const limit = PLAN_BRAND_LIMITS[planTier] ?? 1;
    if (availableBrands.length >= limit) {
      setConnectionMessage({
        type: "error",
        text: planTier === "starter"
          ? "Workspace limit reached. Please upgrade to Pro to manage multiple brands."
          : `You've reached the maximum of ${limit} workspaces on the ${planTier} plan. Please upgrade to add more.`,
      });
      return;
    }

    const name = window.prompt("Enter a name for your new brand workspace:");
    if (!name || !name.trim()) return;
    setIsCreatingBrand(true);
    try {
      const { data, error } = await supabase.from("brand_profiles").insert({
        client_id: clientId, brand_name: name.trim(), primary_color: "#2563EB", secondary_color: "#F59E0B", accent_color: "#10B981"
      }).select("id, brand_name, logo_url").single();
      if (error) throw error;
      if (data) {
        setAvailableBrands([...availableBrands, data]);
        setActiveBrand(data);
        setConnectionMessage({ type: "success", text: `${name.trim()} workspace created!` });
      }
    } catch (err) {
      setConnectionMessage({ type: "error", text: "Failed to create brand." });
    } finally { setIsCreatingBrand(false); }
  }

  async function handleSaveBrand() {
    if (!activeBrand) return;
    setSavingBrand(true);
    try {
      const toneArray = brandProfile.tone_keywords.split(",").map((k) => k.trim()).filter(Boolean);
      const dosArray = brandProfile.dos.split("\n").map((k) => k.trim()).filter(Boolean);
      const dontsArray = brandProfile.donts.split("\n").map((k) => k.trim()).filter(Boolean);

      // ✨ Safely updates ONLY the active brand profile
      await supabase.from("brand_profiles").update({
        brand_name: brandProfile.brand_name,
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
      }).eq("id", activeBrand.id);

      // (Note: Clients table data is intentionally global/shared across the account)
      await supabase.from("clients").update({
        company_name: businessInfo.company_name, website_url: businessInfo.website_url, industry: businessInfo.industry,
        onboarding_notes: JSON.stringify({ description: businessInfo.description, social_urls: businessInfo.social_urls }),
      }).eq("id", clientId);

      const updatedBrand = { ...activeBrand, brand_name: brandProfile.brand_name, logo_url: brandProfile.logo_url };
      setActiveBrand(updatedBrand);
      setAvailableBrands(availableBrands.map(b => b.id === updatedBrand.id ? updatedBrand : b));

      setConnectionMessage({ type: "success", text: "Brand Identity saved successfully!" });
      setTimeout(() => setConnectionMessage(null), 3000);
    } catch (err) {
      setConnectionMessage({ type: "error", text: "Failed to save settings." });
    } finally { setSavingBrand(false); }
  }

  async function handleExtractDNA() {
    if (!activeBrand) return;
    if (!businessInfo.website_url && !businessInfo.social_urls) {
      setConnectionMessage({ type: "error", text: "Please enter a Website URL or Social Links." }); return;
    }
    setExtractingDNA(true);
    setConnectionMessage({ type: "success", text: "AI is scraping your links! We'll notify you soon." });
    try {
      await supabase.from("clients").update({ website_url: businessInfo.website_url }).eq("id", clientId);
      // ✨ Passes the exact brand_id to n8n
      await triggerWorkflow("blink-brand-extract-001", { client_id: clientId, brand_id: activeBrand.id });
      setTimeout(() => { setExtractingDNA(false); loadBrandData(); }, 15000);
    } catch (err) { setExtractingDNA(false); }
  }

  async function handleSuggest(field: keyof BrandProfileData, contextLabel: string) {
    if (!businessInfo.company_name || !businessInfo.industry) {
      setConnectionMessage({ type: "error", text: "Fill Company Name & Industry first!" }); return;
    }
    setSuggestingField(field);
    try {
      const res = await fetch("/api/brand/suggest", { method: "POST", body: JSON.stringify({ field, companyName: businessInfo.company_name, industry: businessInfo.industry, context: contextLabel }) });
      const data = await res.json();
      if (data.suggestion) setBrandProfile((prev) => ({ ...prev, [field]: data.suggestion }));
    } finally { setSuggestingField(null); }
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>, type: "logo" | "asset") {
    const file = e.target.files?.[0];
    if (!file || !clientId || !activeBrand) return;

    if (type === "logo") setUploadingLogo(true); else setUploadingAsset(true);

    try {
      // ✨ FIXED: Saves strictly into a folder for this specific brand_id to prevent bleeding
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `brands/${activeBrand.id}/${type}_${Date.now()}-${cleanFileName}`;

      await supabase.storage.from("assets").upload(path, file);
      const { data } = supabase.storage.from("assets").getPublicUrl(path);

      if (type === "logo") setBrandProfile((prev) => ({ ...prev, logo_url: data.publicUrl }));
      else setBrandProfile((prev) => ({ ...prev, uploaded_assets: [...prev.uploaded_assets, data.publicUrl] }));
    } finally {
      setUploadingLogo(false);
      setUploadingAsset(false);
    }
  }

  function removeAsset(url: string) { setBrandProfile(p => ({ ...p, uploaded_assets: p.uploaded_assets.filter(u => u !== url) })); }
  function removeLogo() { setBrandProfile(p => ({ ...p, logo_url: null })); }

  if (!isMounted || loading) return <div className="flex items-center justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" /></div>;

  // ✨ NO BRAND FALLBACK
  if (!activeBrand) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in duration-500">
        <div className="mx-auto h-20 w-20 bg-[#191D23] border border-[#57707A]/40 rounded-2xl flex items-center justify-center mb-6 shadow-xl"><Briefcase className="h-10 w-10 text-[#57707A]" /></div>
        <h2 className="text-2xl font-bold text-[#DEDCDC] font-display">No Workspace Selected</h2>
        <p className="text-[#989DAA] mt-3 max-w-md mx-auto mb-8 leading-relaxed">Select a brand from the top navigation bar or create a new one below.</p>
        <Button onClick={handleCreateNewBrand} disabled={isCreatingBrand} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-lg rounded-xl h-12 px-8 transition-all">
          {isCreatingBrand ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Plus className="h-5 w-5 mr-2" />} Create New Brand
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#2A2F38] border border-[#C5BAC4]/30 rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-[#C5BAC4]" />
        <h3 className="text-sm font-bold text-[#DEDCDC]">Editing Workspace: <span className="text-white bg-[#191D23] px-2 py-1 rounded ml-1">{activeBrand.brand_name || "Unnamed"}</span></h3>
      </div>

      {connectionMessage && (
        <div className={cn("px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-3 shadow-lg animate-in slide-in-from-top-4", connectionMessage.type === "success" ? "bg-[#B3FF00]/10 text-[#B3FF00] border border-[#B3FF00]/20" : "bg-red-500/10 text-red-400 border border-red-500/20")}>
          {connectionMessage.type === "success" ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span className="leading-relaxed">{connectionMessage.text}</span>
          <button onClick={() => setConnectionMessage(null)} className="ml-auto p-1 hover:bg-black/20 rounded-full"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Global Action Bar */}
      <div className="bg-[#2A2F38] border border-[#C5BAC4]/30 rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-64 h-64 bg-[#C5BAC4]/10 blur-[80px] pointer-events-none" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-[#DEDCDC] flex items-center gap-3 font-display"><Wand2 className="h-6 w-6 text-[#C5BAC4]" /> Auto-Extract Brand DNA</h3>
          <p className="text-sm text-[#989DAA] mt-2 max-w-md leading-relaxed">Scrape your website to auto-fill your profile.</p>
        </div>
        <Button onClick={handleExtractDNA} disabled={extractingDNA} className="w-full sm:w-auto bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg font-bold h-12 px-8 rounded-xl transition-all relative z-10">
          {extractingDNA ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />} {extractingDNA ? "Analyzing..." : "Extract DNA"}
        </Button>
      </div>

      {/* Tab Nav */}
      <div className="flex bg-[#191D23] border border-[#57707A]/30 p-1.5 rounded-xl shadow-inner overflow-x-auto">
        <button onClick={() => setActiveTab("business")} className={cn("flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === "business" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50" : "text-[#57707A] hover:bg-[#57707A]/10")}>Business Profile</button>
        <button onClick={() => setActiveTab("visual")} className={cn("flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === "visual" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50" : "text-[#57707A] hover:bg-[#57707A]/10")}>Visual Identity</button>
        <button onClick={() => setActiveTab("voice")} className={cn("flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === "voice" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50" : "text-[#57707A] hover:bg-[#57707A]/10")}>Voice & Rules</button>
      </div>

      {/* TAB 1: BUSINESS PROFILE */}
      {activeTab === "business" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">The Basics</h3></div>
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#C5BAC4] uppercase tracking-wider mb-2">Brand Name</label>
                  <Input value={brandProfile.brand_name} onChange={(e) => setBrandProfile({ ...brandProfile, brand_name: e.target.value })} placeholder="brand name" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A]/40 focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">Company Name (Legal)</label>
                  <Input value={businessInfo.company_name} onChange={(e) => setBusinessInfo({ ...businessInfo, company_name: e.target.value })} placeholder="e.g. Lup Space LLC" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">Industry Context</label>
                  <Input value={businessInfo.industry} onChange={(e) => setBusinessInfo({ ...businessInfo, industry: e.target.value })} placeholder="e.g. Retail" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" />
                </div>
              </div>
              <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">Description</label>
              <Textarea value={businessInfo.description} onChange={(e) => setBusinessInfo({ ...businessInfo, description: e.target.value })} rows={4} placeholder="Describe your business..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC]" />
            </div>
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Extraction Links</h3></div>
            <div className="space-y-5">
              <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">Website URL</label>
              <Input value={businessInfo.website_url} onChange={(e) => setBusinessInfo({ ...businessInfo, website_url: e.target.value })} placeholder="https://..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" />
              <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">Social Media URLs</label>
              <Textarea value={businessInfo.social_urls} onChange={(e) => setBusinessInfo({ ...businessInfo, social_urls: e.target.value })} rows={3} placeholder="One per line..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC]" />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VISUAL */}
      {activeTab === "visual" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
            <div className="flex justify-between items-end mb-6 border-b border-[#57707A]/20 pb-4">
              <div><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Visual Style Guide</h3><p className="text-sm text-[#989DAA] mt-1">Describe exactly how your images should look.</p></div>
              {!brandProfile.visual_style_guide && (
                <button onClick={() => handleSuggest("visual_style_guide", "Visual Style Guide")} disabled={suggestingField === "visual_style_guide"} className="text-xs text-[#C5BAC4] hover:text-white font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C5BAC4]/30 bg-[#C5BAC4]/10">
                  {suggestingField === "visual_style_guide" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI Suggest
                </button>
              )}
            </div>
            <Textarea value={brandProfile.visual_style_guide} onChange={(e) => setBrandProfile({ ...brandProfile, visual_style_guide: e.target.value })} rows={5} placeholder="Mood, lighting, aesthetics..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] rounded-xl" />
          </div>

          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Brand Colors</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: "Primary", val: brandProfile.primary_color, key: 'primary_color' },
                { label: "Secondary", val: brandProfile.secondary_color, key: 'secondary_color' },
                { label: "Accent", val: brandProfile.accent_color, key: 'accent_color' },
                { label: "Additional", val: brandProfile.additional_colors[0], key: 'additional_colors' }
              ].map((c) => (
                <div key={c.label}>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase mb-2">{c.label}</label>
                  <div className="flex items-center gap-2 p-1.5 border border-[#57707A]/40 bg-[#191D23] rounded-xl shadow-inner">
                    <input type="color" value={c.val} onChange={(e) => {
                      if (c.key === 'additional_colors') setBrandProfile({ ...brandProfile, additional_colors: [e.target.value] });
                      else setBrandProfile({ ...brandProfile, [c.key]: e.target.value });
                    }} className="h-9 w-10 cursor-pointer bg-transparent" />
                    <Input value={c.val} readOnly className="border-none bg-transparent text-[#DEDCDC] text-xs font-mono h-9" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg flex flex-col">
              <div className="border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Brand Logo</h3></div>
              {brandProfile.logo_url ? (
                <div className="relative aspect-video rounded-xl bg-[#191D23] p-4 group">
                  <img src={brandProfile.logo_url} className="w-full h-full object-contain" />
                  <button onClick={removeLogo} className="absolute top-2 right-2 p-1.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-4 w-4 text-white" /></button>
                </div>
              ) : (
                <label className="h-40 w-full rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23] flex flex-col items-center justify-center cursor-pointer hover:border-[#C5BAC4]">
                  <Plus className="h-8 w-8 text-[#57707A]" /><span className="text-xs font-bold text-[#989DAA] mt-2">UPLOAD LOGO</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImage(e, "logo")} />
                </label>
              )}
            </div>
            <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
              <div className="border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Fonts</h3></div>
              <div className="space-y-4">
                <Input value={brandProfile.primary_font} onChange={(e) => setBrandProfile({ ...brandProfile, primary_font: e.target.value })} placeholder="Primary Font" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" />
                <Input value={brandProfile.secondary_font} onChange={(e) => setBrandProfile({ ...brandProfile, secondary_font: e.target.value })} placeholder="Secondary Font" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VOICE */}
      {activeTab === "voice" && (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-8 shadow-lg">
            <div className="flex justify-between border-b border-[#57707A]/20 pb-4 mb-6"><h3 className="text-lg font-bold text-[#DEDCDC] font-display">Voice & Tone</h3></div>
            <Textarea value={brandProfile.brand_voice} onChange={(e) => setBrandProfile({ ...brandProfile, brand_voice: e.target.value })} rows={4} placeholder="How does your brand sound?" className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC]" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div><label className="block text-xs font-bold text-[#57707A] mb-2">Tone Keywords</label><Input value={brandProfile.tone_keywords} onChange={(e) => setBrandProfile({ ...brandProfile, tone_keywords: e.target.value })} placeholder="Friendly, Bold..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" /></div>
              <div><label className="block text-xs font-bold text-[#57707A] mb-2">Vocabulary Notes</label><Input value={brandProfile.vocabulary_notes} onChange={(e) => setBrandProfile({ ...brandProfile, vocabulary_notes: e.target.value })} placeholder="Use 'Client' not 'User'..." className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] h-12" /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-emerald-500/20 bg-[#191D23] p-8 shadow-lg">
              <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2"><CheckCircle className="h-5 w-5" /> DO'S</h3>
              <Textarea value={brandProfile.dos} onChange={(e) => setBrandProfile({ ...brandProfile, dos: e.target.value })} rows={5} placeholder="Always mention..." className="bg-[#2A2F38] border-emerald-500/20 text-[#DEDCDC]" />
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-[#191D23] p-8 shadow-lg">
              <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2"><X className="h-5 w-5" /> DON'TS</h3>
              <Textarea value={brandProfile.donts} onChange={(e) => setBrandProfile({ ...brandProfile, donts: e.target.value })} rows={5} placeholder="Never use..." className="bg-[#2A2F38] border-red-500/20 text-[#DEDCDC]" />
            </div>
          </div>
        </div>
      )}

      {/* Global Save Button */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[260px] bg-[#191D23]/80 backdrop-blur-xl border-t border-[#57707A]/30 p-6 flex justify-end z-20">
        <div className="max-w-4xl mx-auto w-full flex justify-end">
          <Button onClick={handleSaveBrand} disabled={savingBrand} className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold px-10 h-12 rounded-xl transition-all shadow-lg shadow-[#C5BAC4]/20">
            {savingBrand ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Save Brand Identity
          </Button>
        </div>
      </div>
    </div>
  );
}