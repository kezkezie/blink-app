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
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  // --- Step 3: Visual Identity ---
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
  const [toneKeywords, setToneKeywords] = useState<string[]>([]);
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [assetPreviews, setAssetPreviews] = useState<string[]>([]);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setEmail(session.user.email || "");
        setStep(2);
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  async function handleGoogleSignUp() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/get-started`,
      },
    });
    if (error) alert(error.message);
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

      const brandPayload: any = {
        client_id: currentClientId,
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

      if (existingBrand) {
        const { error: brandError } = await supabase
          .from("brand_profiles")
          .update(brandPayload)
          .eq("id", existingBrand.id);
        if (brandError) throw new Error(`Brand Error: ${brandError.message}`);
      } else {
        const { error: brandError } = await supabase
          .from("brand_profiles")
          .insert({
            ...brandPayload,
            uploaded_assets: finalAssetUrls,
          });
        if (brandError) throw new Error(`Brand Error: ${brandError.message}`);
      }

      // 5. Unlock Middleware
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      await supabase.auth.refreshSession();

      // 6. Trigger DNA Extractor Background Workflow
      try {
        triggerWorkflow("blink-brand-extract-001", {
          client_id: currentClientId,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="h-12 w-12 bg-blink-primary rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-blink-dark font-heading">
          {step === 1 ? "Create your account" : "Welcome to Blink"}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {step === 1
            ? "Start automating your social media today."
            : "Let's set up your brand's AI brain."}
        </p>

        {step > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {[2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 w-12 rounded-full transition-colors",
                  step >= s ? "bg-blink-primary" : "bg-gray-200"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          {/* STEP 1: Sign Up */}
          {step === 1 && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignUp}
                className="w-full h-11 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 mb-6 font-medium shadow-sm"
              >
                <GoogleIcon className="mr-2 h-5 w-5" />
                Sign up with Google
              </Button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase font-medium tracking-wide">
                  <span className="bg-white px-3 text-gray-400">
                    Or continue with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-11"
                      placeholder="••••••••"
                      minLength={6}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blink-primary hover:bg-blink-primary/90 text-white mt-2 shadow-md"
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
            <div className="space-y-5">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-2">
                <Building2 className="h-5 w-5 text-blink-primary" />
                <h3 className="text-lg font-medium text-blink-dark">
                  Business Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone{" "}
                    <span className="text-gray-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 700 000 000"
                    className="h-11"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Lup Space"
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Industry
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. E-commerce"
                    className="h-11"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website URL
                  </label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://lupspace.com"
                    className="h-11"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What does your business do?{" "}
                  <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  This helps our AI generate highly accurate content for your
                  brand.
                </p>
                <Textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. We sell high-quality, modern minimalist furniture for homes and offices..."
                  rows={3}
                  className="resize-none"
                />
              </div>

              <Button
                onClick={() => setStep(3)}
                disabled={!companyName || !contactName || !description}
                className="w-full h-11 bg-blink-primary hover:bg-blink-primary/90 text-white mt-4 shadow-md"
              >
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STEP 3: Visual Identity (Colors, Fonts, Logo) */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-2">
                <Palette className="h-5 w-5 text-blink-primary" />
                <div>
                  <h3 className="text-lg font-medium text-blink-dark">
                    Visual Identity
                  </h3>
                  <p className="text-xs text-gray-500">
                    How should your content look?
                  </p>
                </div>
              </div>

              {/* 4 Colors */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: "Primary Color",
                    val: primaryColor,
                    set: setPrimaryColor,
                  },
                  {
                    label: "Secondary Color",
                    val: secondaryColor,
                    set: setSecondaryColor,
                  },
                  {
                    label: "Accent Color",
                    val: accentColor,
                    set: setAccentColor,
                  },
                  {
                    label: "Additional Color",
                    val: additionalColor,
                    set: setAdditionalColor,
                  },
                ].map((color, i) => (
                  <div key={i}>
                    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                      {color.label}
                    </label>
                    <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg hover:border-blink-primary/50 transition-colors bg-gray-50">
                      <input
                        type="color"
                        value={color.val}
                        onChange={(e) => color.set(e.target.value)}
                        className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
                      />
                      <Input
                        value={color.val}
                        onChange={(e) => color.set(e.target.value)}
                        className="border-none shadow-none focus-visible:ring-0 px-1 uppercase font-mono text-sm h-8 bg-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Fonts */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-gray-400" /> Primary Font
                  </label>
                  {isCustomPrimaryFont ? (
                    <div className="flex gap-2">
                      <Input
                        value={primaryFont}
                        onChange={(e) => setPrimaryFont(e.target.value)}
                        placeholder="Type font name..."
                        className="h-9 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCustomPrimaryFont(false);
                          setPrimaryFont("");
                        }}
                        className="h-9 px-2 text-gray-500"
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
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        {POPULAR_FONTS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-gray-400" /> Secondary
                    Font
                  </label>
                  {isCustomSecondaryFont ? (
                    <div className="flex gap-2">
                      <Input
                        value={secondaryFont}
                        onChange={(e) => setSecondaryFont(e.target.value)}
                        placeholder="Type font name..."
                        className="h-9 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCustomSecondaryFont(false);
                          setSecondaryFont("");
                        }}
                        className="h-9 px-2 text-gray-500"
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
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        {POPULAR_FONTS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Logo */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
                  Brand Logo
                </label>
                {logoPreview ? (
                  <div className="relative h-28 w-full rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center group">
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="max-h-full max-w-full object-contain p-4"
                    />
                    <button
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-white shadow-md text-red-500 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleLogoDrop}
                    className="flex flex-col items-center justify-center h-28 w-full rounded-lg border-2 border-dashed border-gray-300 hover:border-blink-primary hover:bg-blink-primary/5 cursor-pointer transition-all"
                  >
                    <Upload className="h-6 w-6 text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-600">
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

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="h-11 px-6"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  className="flex-1 h-11 bg-blink-primary hover:bg-blink-primary/90 text-white shadow-md"
                >
                  Next Step <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Brand Vibe & Assets */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-2">
                <Smile className="h-5 w-5 text-blink-primary" />
                <div>
                  <h3 className="text-lg font-medium text-blink-dark">
                    Brand Vibe & Assets
                  </h3>
                  <p className="text-xs text-gray-500">
                    Help the AI understand your personality.
                  </p>
                </div>
              </div>

              {/* Tone Keywords */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Brand Personality (Pick 2-4)
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TONES.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => toggleTone(tone.toLowerCase())}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                        toneKeywords.includes(tone.toLowerCase())
                          ? "bg-blink-primary/10 border-blink-primary text-blink-primary"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      {toneKeywords.includes(tone.toLowerCase()) && "✓ "}
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Assets */}
              <div className="pt-2 border-t border-gray-100 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Visual References
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Upload past posts, product photos, or inspiration to train the
                  AI.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {assetPreviews.map((preview, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group"
                    >
                      <img
                        src={preview}
                        alt="asset"
                        className="w-full h-full object-cover"
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
                        className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 shadow-sm hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleAssetDrop}
                    className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-blink-primary hover:bg-blink-primary/5 flex flex-col items-center justify-center cursor-pointer transition-colors"
                  >
                    <Plus className="h-6 w-6 text-gray-400 mb-1" />
                    <span className="text-xs font-medium text-gray-600 text-center px-1">
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

              <div className="flex gap-3 pt-6 border-t border-gray-100 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  className="h-11 px-6"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCompleteSetup}
                  disabled={saving}
                  className="flex-1 h-11 bg-blink-primary hover:bg-blink-primary/90 text-white shadow-md"
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
