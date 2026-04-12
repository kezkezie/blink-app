"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import {
  Loader2,
  ArrowRight,
  Upload,
  Sparkles,
  Building2,
  Palette,
  CheckCircle,
  Mail,
  Lock,
  X,
  Plus,
  Trash2,
  Type,
  Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PREDEFINED_TONES = [
  "Luxurious",
  "Modern",
  "Earthy",
  "Professional",
  "Minimal",
  "Elegant",
  "Warm",
  "Playful",
  "Bold",
  "Trustworthy",
  "Edgy",
  "Friendly",
];

const POPULAR_FONTS = [
  "Inter",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "Open Sans",
  "Lato",
  "Oswald",
  "Custom...",
];

// Google Icon SVG Component
function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function GetStartedPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // --- Step 1: Auth State ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // --- Step 2: Business State ---
  const [contactName, setContactName] = useState("");
  const [brandName, setBrandName] = useState(""); // ✨ New State for Brand Name
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [socialMediaUrls, setSocialMediaUrls] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  // --- Step 3: Visual Identity ---
  const [visualStyleGuide, setVisualStyleGuide] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [secondaryColor, setSecondaryColor] = useState("#585954");
  const [accentColor, setAccentColor] = useState("#10B981");
  const [additionalColor, setAdditionalColor] = useState("#F2EAE3");

  const [primaryFont, setPrimaryFont] = useState("");
  const [secondaryFont, setSecondaryFont] = useState("");
  const [isCustomPrimaryFont, setIsCustomPrimaryFont] = useState(false);
  const [isCustomSecondaryFont, setIsCustomSecondaryFont] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // --- Step 4: Brand Vibe & Assets ---
  const [brandVoice, setBrandVoice] = useState("");
  const [toneKeywords, setToneKeywords] = useState<string[]>([]);
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [assetPreviews, setAssetPreviews] = useState<string[]>([]);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        if (session.user.user_metadata?.onboarding_completed === true) {
          router.replace("/dashboard");
          return;
        }

        setUserId(session.user.id);
        setEmail(session.user.email || "");
        setStep(2);
      }

      setLoading(false);
    }

    checkAuth();
  }, [router]);

  async function handleGoogleSignUp() {
    try {
      const res = await fetch("/api/auth/google", { method: "POST" });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to initiate Google login");
      }
    } catch (err) {
      console.error(err);
      alert("Could not connect to Google.");
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (data.user) {
      if (!data.session) {
        alert(
          "⚠️ Action Required: Supabase 'Confirm Email' is turned ON. Please check your email to verify your account, or turn off Email Confirmations in your Supabase Auth settings."
        );
        return;
      }
      setUserId(data.user.id);
      setStep(2);
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setLogoPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleLogoDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setLogoPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleAssetSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setAssetFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAssetPreviews((prev) => [...prev, event.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
    if (e.target) e.target.value = "";
  }

  function handleAssetDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;
    setAssetFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAssetPreviews((prev) => [...prev, event.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  function toggleTone(tone: string) {
    setToneKeywords((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  }

  async function handleCompleteSetup() {
    if (!userId) {
      alert("Authentication lost. Please log in again.");
      router.push("/login");
      return;
    }
    setSaving(true);

    try {
      // 1. Upload Logo
      let finalLogoUrl = null;
      if (logoFile) {
        const fileExt = logoFile.name.split(".").pop();
        const filePath = `onboarding/${userId}/logo_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(filePath, logoFile);
        if (!uploadError) {
          const { data } = supabase.storage
            .from("assets")
            .getPublicUrl(filePath);
          finalLogoUrl = data.publicUrl;
        }
      }

      // 2. Upload Additional Assets
      let finalAssetUrls: string[] = [];
      for (const file of assetFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `onboarding/${userId}/asset_${Date.now()}_${Math.random()
          .toString(36)
          .substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(filePath, file);
        if (!uploadError) {
          const { data } = supabase.storage
            .from("assets")
            .getPublicUrl(filePath);
          finalAssetUrls.push(data.publicUrl);
        }
      }

      // 3. Upsert Client Record
      let currentClientId = null;
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const clientPayload = {
        contact_name: contactName,
        company_name: companyName,
        website_url: websiteUrl,
        industry: industry,
        contact_phone: phone,
        social_links: socialMediaUrls ? socialMediaUrls.split('\n').filter(l => l.trim() !== '') : [],
        onboarding_notes: description ? { description } : null,
      };

      if (existingClient) {
        currentClientId = existingClient.id;
        await supabase
          .from("clients")
          .update(clientPayload)
          .eq("id", currentClientId);
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            user_id: userId,
            contact_email: email,
            plan_tier: "starter",
            ...clientPayload,
          })
          .select("id")
          .single();
        if (clientError)
          throw new Error(`Client Error: ${clientError.message}`);
        currentClientId = newClient.id;
      }

      // 4. Upsert Brand Profile
      const { data: existingBrand } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("client_id", currentClientId)
        .maybeSingle();

      // ✨ Include brand_name in payload
      const brandPayload: any = {
        client_id: currentClientId,
        brand_name: brandName || companyName, // Fallback to company name if empty
        visual_style_guide: visualStyleGuide,
        brand_voice: brandVoice,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        additional_colors: [additionalColor],
        primary_font: primaryFont || null,
        secondary_font: secondaryFont || null,
        tone_keywords: toneKeywords,
        is_active: true,
      };

      if (finalLogoUrl) brandPayload.logo_url = finalLogoUrl;
      if (finalAssetUrls.length > 0)
        brandPayload.uploaded_assets = finalAssetUrls;

      let targetBrandId = null;

      if (existingBrand) {
        targetBrandId = existingBrand.id;
        const { error: brandError } = await supabase
          .from("brand_profiles")
          .update(brandPayload)
          .eq("id", existingBrand.id);
        if (brandError) throw new Error(`Brand Error: ${brandError.message}`);
      } else {
        const { data: newBrand, error: brandError } = await supabase
          .from("brand_profiles")
          .insert({
            ...brandPayload,
            uploaded_assets: finalAssetUrls,
          })
          .select("id")
          .single();
        if (brandError) throw new Error(`Brand Error: ${brandError.message}`);
        if (newBrand) targetBrandId = newBrand.id;
      }

      // 5. Unlock Middleware
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      await supabase.auth.refreshSession();

      // 6. Trigger DNA Extractor Background Workflow
      try {
        triggerWorkflow("blink-brand-extract-001", {
          client_id: currentClientId,
          brand_id: targetBrandId, // Pass the new brand ID to the webhook
        }).catch((e) => {
          console.log("Silent workflow error:", e);
        });
      } catch (workflowErr) {
        console.error("Workflow trigger issue ignored.");
      }

      // 7. Route to Dashboard
      router.push("/dashboard/generate");
      router.refresh();
    } catch (err: any) {
      console.error("Onboarding failed:", err);
      alert(err.message || "Something went wrong saving your profile.");
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#191D23]">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );

  return (
    <div className="min-h-screen bg-[#191D23] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C5BAC4]/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="h-14 w-14 bg-[#2A2F38] border border-[#57707A]/50 rounded-2xl flex items-center justify-center shadow-inner">
            <Sparkles className="h-7 w-7 text-[#C5BAC4]" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold text-[#DEDCDC] font-display animate-in fade-in duration-500 delay-100">
          {step === 1 ? "Create your account" : "Welcome to Blink"}
        </h2>
        <p className="mt-3 text-center text-sm text-[#989DAA] animate-in fade-in duration-500 delay-200">
          {step === 1
            ? "Start automating your social media today."
            : "Let's set up your brand's AI brain."}
        </p>

        {step > 1 && (
          <div className="flex justify-center gap-3 mt-8 animate-in fade-in duration-500 delay-300">
            {[2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 w-12 rounded-full transition-all duration-300",
                  step >= s ? "bg-[#C5BAC4] shadow-[0_0_10px_rgba(197,186,196,0.5)]" : "bg-[#57707A]/30"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10 animate-in fade-in zoom-in-95 duration-500 delay-300">
        <div className="bg-[#2A2F38] py-8 px-6 shadow-2xl sm:rounded-3xl sm:px-12 border border-[#57707A]/30">

          {/* STEP 1: Sign Up */}
          {step === 1 && (
            <div>
              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#57707A]/30" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                  <span className="bg-[#2A2F38] px-4 text-[#57707A]">
                    Continue with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-[#57707A]" />
                    </div>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-[#57707A]" />
                    </div>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm"
                      placeholder="••••••••"
                      minLength={6}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-[#C5BAC4] hover:bg-white text-[#191D23] mt-4 shadow-lg shadow-[#C5BAC4]/10 font-bold rounded-xl text-base transition-all"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Sign Up with Email"
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* STEP 2: Business Info */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-[#57707A]/20 pb-4 mb-4">
                <Building2 className="h-5 w-5 text-[#C5BAC4]" />
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Business Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-[#C5BAC4] uppercase tracking-wider mb-2">
                    Workspace / Brand Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Lup Space"
                    className="h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Company Legal Name
                  </label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Lup Space LLC"
                    className="h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Your Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Industry
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Retail & E-Commerce"
                    className="h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                    Website URL
                  </label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://lupspace.com"
                    className="h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Social Media URLs <span className="text-[#57707A] opacity-70 font-normal">(One per line)</span>
                </label>
                <Textarea
                  value={socialMediaUrls}
                  onChange={(e) => setSocialMediaUrls(e.target.value)}
                  placeholder="https://instagram.com/yourbrand&#10;https://twitter.com/yourbrand"
                  rows={2}
                  className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-1.5">
                  What does your business do?{" "}
                  <span className="text-red-400">*</span>
                </label>
                <p className="text-[10px] text-[#989DAA] mb-3">
                  This helps our AI generate highly accurate content for your
                  brand.
                </p>
                <Textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Discover quality furniture that brings comfort and style to your home..."
                  rows={4}
                  className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>

              <Button
                onClick={() => setStep(3)}
                disabled={!brandName || !contactName || !description}
                className="w-full h-12 bg-[#C5BAC4] hover:bg-white text-[#191D23] mt-4 shadow-lg shadow-[#C5BAC4]/10 font-bold rounded-xl transition-all"
              >
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STEP 3: Visual Identity (Colors, Fonts, Logo) */}
          {step === 3 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-[#57707A]/20 pb-4 mb-2">
                <Palette className="h-5 w-5 text-[#C5BAC4]" />
                <div>
                  <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                    Visual Identity
                  </h3>
                  <p className="text-xs text-[#989DAA]">
                    How should your content look?
                  </p>
                </div>
              </div>

              {/* ✨ Visual Style Guide */}
              <div>
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-1.5">
                  Visual Style Guide
                </label>
                <p className="text-[10px] text-[#989DAA] mb-3">
                  Describe exactly how your images should look (e.g., modern, minimalist, soft neutrals with vibrant pops).
                </p>
                <Textarea
                  value={visualStyleGuide}
                  onChange={(e) => setVisualStyleGuide(e.target.value)}
                  placeholder="Embrace a modern and minimalist aesthetic..."
                  rows={3}
                  className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>

              {/* 4 Colors */}
              <div className="grid grid-cols-2 gap-5">
                {[
                  { label: "Primary Color", val: primaryColor, set: setPrimaryColor },
                  { label: "Secondary Color", val: secondaryColor, set: setSecondaryColor },
                  { label: "Accent Color", val: accentColor, set: setAccentColor },
                  { label: "Additional Color", val: additionalColor, set: setAdditionalColor },
                ].map((color, i) => (
                  <div key={i}>
                    <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                      {color.label}
                    </label>
                    <div className="flex items-center gap-2 p-1.5 border border-[#57707A]/40 rounded-xl bg-[#191D23] shadow-inner focus-within:ring-1 focus-within:ring-[#C5BAC4] transition-all">
                      <input
                        type="color"
                        value={color.val}
                        onChange={(e) => color.set(e.target.value)}
                        className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1 color-picker-custom"
                      />
                      <Input
                        value={color.val}
                        onChange={(e) => color.set(e.target.value)}
                        className="border-none shadow-none focus-visible:ring-0 px-2 uppercase font-mono text-sm h-8 bg-transparent text-[#DEDCDC]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Fonts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-[#57707A]/20">
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-[#C5BAC4]" /> Primary Font
                  </label>
                  {isCustomPrimaryFont ? (
                    <div className="flex gap-2">
                      <Input
                        value={primaryFont}
                        onChange={(e) => setPrimaryFont(e.target.value)}
                        placeholder="Type font name..."
                        className="h-11 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCustomPrimaryFont(false);
                          setPrimaryFont("");
                        }}
                        className="h-11 px-3 bg-[#191D23] border-[#57707A]/40 text-[#57707A] hover:text-[#DEDCDC] hover:bg-[#57707A]/20 rounded-xl"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={primaryFont}
                      onValueChange={(v) => {
                        if (v === "Custom...") setIsCustomPrimaryFont(true);
                        else setPrimaryFont(v);
                      }}
                    >
                      <SelectTrigger className="h-11 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] rounded-xl shadow-inner">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
                        {POPULAR_FONTS.map((f) => (
                          <SelectItem key={f} value={f} className="focus:bg-[#191D23] focus:text-white cursor-pointer">
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-[#C5BAC4]" /> Secondary Font
                  </label>
                  {isCustomSecondaryFont ? (
                    <div className="flex gap-2">
                      <Input
                        value={secondaryFont}
                        onChange={(e) => setSecondaryFont(e.target.value)}
                        placeholder="Type font name..."
                        className="h-11 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCustomSecondaryFont(false);
                          setSecondaryFont("");
                        }}
                        className="h-11 px-3 bg-[#191D23] border-[#57707A]/40 text-[#57707A] hover:text-[#DEDCDC] hover:bg-[#57707A]/20 rounded-xl"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={secondaryFont}
                      onValueChange={(v) => {
                        if (v === "Custom...") setIsCustomSecondaryFont(true);
                        else setSecondaryFont(v);
                      }}
                    >
                      <SelectTrigger className="h-11 text-sm bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] rounded-xl shadow-inner">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
                        {POPULAR_FONTS.map((f) => (
                          <SelectItem key={f} value={f} className="focus:bg-[#191D23] focus:text-white cursor-pointer">
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Logo */}
              <div className="pt-3 border-t border-[#57707A]/20">
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-3 mt-2">
                  Brand Logo
                </label>
                {logoPreview ? (
                  <div className="relative h-32 w-full rounded-xl border border-[#57707A]/40 bg-[#191D23] shadow-inner overflow-hidden flex items-center justify-center group">
                    <div className="absolute inset-0 bg-[url('/checkers.png')] opacity-10 pointer-events-none"></div>
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="max-h-full max-w-full object-contain p-4 relative z-10"
                    />
                    <button
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white shadow-md rounded-full hover:bg-red-500 hover:scale-110 transition-all opacity-0 group-hover:opacity-100 z-20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleLogoDrop}
                    className="flex flex-col items-center justify-center h-32 w-full rounded-xl border-2 border-dashed border-[#57707A]/50 hover:border-[#C5BAC4]/50 bg-[#191D23]/50 hover:bg-[#57707A]/20 cursor-pointer transition-all"
                  >
                    <Upload className="h-6 w-6 text-[#57707A] mb-2" />
                    <span className="text-[10px] font-bold text-[#989DAA] uppercase tracking-widest">
                      Click or drag to upload logo
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleLogoSelect}
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-3 pt-6 border-t border-[#57707A]/20">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="h-12 px-8 rounded-xl bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white font-bold"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  className="flex-1 h-12 bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/10 rounded-xl font-bold transition-all"
                >
                  Next Step <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Brand Vibe & Assets */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 border-b border-[#57707A]/20 pb-4 mb-2">
                <Smile className="h-5 w-5 text-[#C5BAC4]" />
                <div>
                  <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                    Brand Vibe & Assets
                  </h3>
                  <p className="text-xs text-[#989DAA]">
                    Help the AI understand your personality.
                  </p>
                </div>
              </div>

              {/* ✨ Brand Voice */}
              <div>
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-1.5">
                  Brand Voice
                </label>
                <p className="text-[10px] text-[#989DAA] mb-3">
                  Describe how your brand speaks to its audience.
                </p>
                <Textarea
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Friendly and approachable, fostering a sense of community..."
                  rows={3}
                  className="resize-none bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner custom-scrollbar"
                />
              </div>

              {/* Tone Keywords */}
              <div>
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-3">
                  Brand Personality (Pick 2-4)
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {PREDEFINED_TONES.map((tone) => {
                    const isActive = toneKeywords.includes(tone.toLowerCase());
                    return (
                      <button
                        key={tone}
                        onClick={() => toggleTone(tone.toLowerCase())}
                        className={cn(
                          "px-4 py-2 rounded-full text-[11px] font-bold transition-all border",
                          isActive
                            ? "bg-[#C5BAC4]/10 border-[#C5BAC4] text-[#C5BAC4] shadow-[0_0_10px_rgba(197,186,196,0.2)]"
                            : "bg-[#191D23] border-[#57707A]/40 text-[#57707A] hover:border-[#57707A] hover:text-[#DEDCDC]"
                        )}
                      >
                        {isActive && "✓ "}
                        {tone}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Additional Assets */}
              <div className="pt-4 border-t border-[#57707A]/20 mt-4">
                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase tracking-wider mb-1.5">
                  Visual References
                </label>
                <p className="text-[10px] text-[#989DAA] mb-4">
                  Upload past posts, product photos, or inspiration to train the AI.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {assetPreviews.map((preview, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-xl border border-[#57707A]/40 bg-[#191D23] shadow-inner overflow-hidden group"
                    >
                      <img
                        src={preview}
                        alt="asset"
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setAssetFiles((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          );
                          setAssetPreviews((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          );
                        }}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 shadow-md hover:bg-red-500 hover:scale-110 transition-all z-20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleAssetDrop}
                    className="aspect-square rounded-xl border-2 border-dashed border-[#57707A]/50 bg-[#191D23]/50 hover:border-[#C5BAC4]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer transition-colors"
                  >
                    <Plus className="h-6 w-6 text-[#57707A] mb-2" />
                    <span className="text-[10px] font-bold text-[#989DAA] uppercase tracking-widest text-center px-2">
                      Click or Drag
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleAssetSelect}
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-8 border-t border-[#57707A]/20 mt-8">
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  className="h-12 px-8 rounded-xl bg-transparent border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30 hover:text-white font-bold"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCompleteSetup}
                  disabled={saving}
                  className="flex-1 h-12 bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/10 rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                      Analyzing & Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" /> Let's Go!
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}