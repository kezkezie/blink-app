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
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  const [businessInfo, setBusinessInfo] = useState({
    company_name: "",
    website_url: "",
    industry: "",
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
      setBusinessInfo({
        company_name: clientRes.data.company_name || "",
        website_url: clientRes.data.website_url || "",
        industry: clientRes.data.industry || "",
      });
    }

    if (brandRes.data) {
      const addColors = parseArray(brandRes.data.additional_colors);
      const tones = parseArray(brandRes.data.tone_keywords);
      const dosArr = parseArray(brandRes.data.dos);
      const dontsArr = parseArray(brandRes.data.donts);

      // Smart merging if the visual_style_guide is empty but the old image_style exists
      let vsg = brandRes.data.visual_style_guide || "";
      if (
        !vsg &&
        (brandRes.data.image_style || brandRes.data.composition_notes)
      ) {
        vsg = [brandRes.data.image_style, brandRes.data.composition_notes]
          .filter(Boolean)
          .join("\n\n");
      }

      setBrandProfile({
        logo_url: brandRes.data.logo_url || null,
        primary_color: brandRes.data.primary_color || "#2563EB",
        secondary_color: brandRes.data.secondary_color || "#F59E0B",
        accent_color: brandRes.data.accent_color || "#10B981",
        additional_colors: addColors.length > 0 ? addColors : ["#6B7280"],
        primary_font: brandRes.data.primary_font || "",
        secondary_font: brandRes.data.secondary_font || "",
        uploaded_assets: parseArray(brandRes.data.uploaded_assets),
        visual_style_guide: vsg,
        brand_voice: brandRes.data.brand_voice || "",
        tone_keywords: tones.join(", ") || "",
        vocabulary_notes: brandRes.data.vocabulary_notes || "",
        dos: dosArr.join("\n") || "",
        donts: dontsArr.join("\n") || "",
      });
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

      await supabase
        .from("brand_profiles")
        .update({
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
        })
        .eq("client_id", clientId);

      await supabase
        .from("clients")
        .update({
          company_name: businessInfo.company_name,
          website_url: businessInfo.website_url,
          industry: businessInfo.industry,
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

  // ✨ FIXED: Auto-save the URL, Trigger non-blocking, and Poll!
  async function handleExtractDNA() {
    if (!businessInfo.website_url) {
      setConnectionMessage({
        type: "error",
        text: "Please enter a Website URL first so the AI knows where to scrape.",
      });
      return;
    }

    setExtractingDNA(true);
    setConnectionMessage({
      type: "success",
      text: "AI is scraping your website and socials! You can navigate away, we will notify you when it's done.",
    });

    // Set global flag for TopBar
    localStorage.setItem("blink_extracting_dna", Date.now().toString());

    try {
      // 1. Save the URL so n8n can access it
      await supabase
        .from("clients")
        .update({
          website_url: businessInfo.website_url,
          company_name: businessInfo.company_name,
          industry: businessInfo.industry,
        })
        .eq("id", clientId);

      // Fetch current timestamp to compare against
      const { data: initialBrand } = await supabase
        .from("brand_profiles")
        .select("updated_at")
        .eq("client_id", clientId)
        .single();
      const initialTime = initialBrand?.updated_at;

      // 2. Trigger the scrape (don't await it so we don't hit a timeout)
      triggerWorkflow("blink-brand-extract-001", {
        client_id: clientId!,
      });

      // 3. Poll the database for changes
      let attempts = 0;
      const maxAttempts = 20; // 20 attempts * 3 seconds = 60 seconds

      const pollInterval = setInterval(async () => {
        attempts++;
        const { data: checkBrand } = await supabase
          .from("brand_profiles")
          .select("updated_at")
          .eq("client_id", clientId)
          .single();

        // If the timestamp changed, n8n successfully finished!
        if (checkBrand && checkBrand.updated_at !== initialTime) {
          clearInterval(pollInterval);
          await loadData(); // Magically inject the data into the UI
          setExtractingDNA(false);
          localStorage.removeItem("blink_extracting_dna");
          setConnectionMessage({
            type: "success",
            text: "Extraction complete! The fields below have been auto-filled.",
          });
        } else if (attempts >= maxAttempts) {
          // Timeout failsafe
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
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {connectionMessage && (
        <div
          className={cn(
            "px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2",
            connectionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          {connectionMessage.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="leading-relaxed">{connectionMessage.text}</span>
          <button
            onClick={() => setConnectionMessage(null)}
            className="ml-auto p-0.5 hover:bg-black/5 rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="bg-gradient-to-r from-purple-50 to-blink-primary/5 border border-purple-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-purple-900 flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> Auto-Extract Brand DNA
          </h3>
          <p className="text-sm text-purple-700/80 mt-1 max-w-md">
            Let our AI scrape your website, analyze your connected socials, and
            scan your logos to auto-fill your entire profile.
          </p>
        </div>
        <Button
          onClick={handleExtractDNA}
          disabled={extractingDNA}
          className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white shadow-md"
        >
          {extractingDNA ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {extractingDNA ? "Analyzing..." : "Extract DNA"}
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-blink-dark">
            Business Information
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            The core context the AI uses to understand your brand.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Website URL (Used for AI Extraction)
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Industry Context
            </label>
            <Input
              value={businessInfo.industry}
              onChange={(e) =>
                setBusinessInfo({ ...businessInfo, industry: e.target.value })
              }
              placeholder="e.g. Luxury Real Estate in Dubai"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div className="flex justify-between items-end">
          <div>
            <h3 className="text-base font-semibold text-blink-dark">
              Visual Style Guide
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
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
              className="text-xs text-purple-600 hover:bg-purple-50 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors"
            >
              {suggestingField === "visual_style_guide" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
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
          rows={4}
          placeholder="e.g., We use moody, cinematic lighting..."
          className="text-sm resize-none"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div className="flex justify-between items-end">
          <div>
            <h3 className="text-base font-semibold text-blink-dark">
              Brand Voice & Tone
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
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
              className="text-xs text-purple-600 hover:bg-purple-50 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors"
            >
              {suggestingField === "brand_voice" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}{" "}
              AI Suggest
            </button>
          )}
        </div>
        <Textarea
          value={brandProfile.brand_voice}
          onChange={(e) =>
            setBrandProfile({ ...brandProfile, brand_voice: e.target.value })
          }
          rows={3}
          placeholder="e.g., Witty, slightly sarcastic, but always highly informative..."
          className="text-sm resize-none mb-4"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
              className="text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-blink-dark">
            Brand Fonts
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
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
              className="text-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3 shadow-sm">
          <div className="flex justify-between items-end">
            <h3 className="text-base font-semibold text-emerald-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Do's
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
                className="text-xs text-purple-600 hover:bg-purple-50 font-medium flex items-center gap-1.5 px-2 py-1 rounded-lg border border-purple-200"
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
            rows={3}
            placeholder="e.g., Always mention our free shipping."
            className="text-sm resize-none"
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3 shadow-sm">
          <div className="flex justify-between items-end">
            <h3 className="text-base font-semibold text-red-600 flex items-center gap-2">
              <X className="h-4 w-4" /> Don'ts
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
                className="text-xs text-purple-600 hover:bg-purple-50 font-medium flex items-center gap-1.5 px-2 py-1 rounded-lg border border-purple-200"
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
            rows={3}
            placeholder="e.g., NEVER mention price directly."
            className="text-sm resize-none"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-blink-dark">
            Brand Colors
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Primary
            </label>
            <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg">
              <input
                type="color"
                value={brandProfile.primary_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    primary_color: e.target.value,
                  })
                }
                className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
              />
              <Input
                value={brandProfile.primary_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    primary_color: e.target.value,
                  })
                }
                className="border-none shadow-none focus-visible:ring-0 px-1 uppercase font-mono text-sm h-8 bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Secondary
            </label>
            <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg">
              <input
                type="color"
                value={brandProfile.secondary_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    secondary_color: e.target.value,
                  })
                }
                className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
              />
              <Input
                value={brandProfile.secondary_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    secondary_color: e.target.value,
                  })
                }
                className="border-none shadow-none focus-visible:ring-0 px-1 uppercase font-mono text-sm h-8 bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Accent
            </label>
            <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg">
              <input
                type="color"
                value={brandProfile.accent_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    accent_color: e.target.value,
                  })
                }
                className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
              />
              <Input
                value={brandProfile.accent_color}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    accent_color: e.target.value,
                  })
                }
                className="border-none shadow-none focus-visible:ring-0 px-1 uppercase font-mono text-sm h-8 bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              Additional
            </label>
            <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg">
              <input
                type="color"
                value={brandProfile.additional_colors[0] || "#6B7280"}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    additional_colors: [e.target.value],
                  })
                }
                className="h-8 w-10 rounded cursor-pointer bg-transparent border-0 p-0 ml-1"
              />
              <Input
                value={brandProfile.additional_colors[0] || "#6B7280"}
                onChange={(e) =>
                  setBrandProfile({
                    ...brandProfile,
                    additional_colors: [e.target.value],
                  })
                }
                className="border-none shadow-none focus-visible:ring-0 px-1 uppercase font-mono text-sm h-8 bg-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-blink-dark">
            Brand Logo
          </h3>
        </div>
        <div className="w-48">
          {brandProfile.logo_url ? (
            <div className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group">
              <img
                src={brandProfile.logo_url}
                alt="Company Logo"
                className="w-full h-full object-contain p-2"
              />
              <button
                onClick={removeLogo}
                className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 hover:border-blink-primary/50 hover:bg-blink-primary/5 flex flex-col items-center justify-center cursor-pointer transition-colors">
              {uploadingLogo ? (
                <Loader2 className="h-6 w-6 animate-spin text-blink-primary" />
              ) : (
                <Plus className="h-6 w-6 text-gray-400" />
              )}
              <span className="text-xs font-medium text-gray-500 mt-2">
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

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-blink-dark">
            Additional Brand Assets
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {brandProfile.uploaded_assets.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group"
            >
              <img
                src={url}
                alt="asset"
                className="w-full h-full object-contain p-2"
              />
              <button
                onClick={() => removeAsset(url)}
                className="absolute top-1.5 right-1.5 p-1.5 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 hover:border-blink-primary/50 hover:bg-blink-primary/5 flex flex-col items-center justify-center cursor-pointer transition-colors">
            {uploadingAsset ? (
              <Loader2 className="h-6 w-6 animate-spin text-blink-primary" />
            ) : (
              <Plus className="h-6 w-6 text-gray-400" />
            )}
            <span className="text-xs font-medium text-gray-500 mt-2">
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

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSaveBrand}
          disabled={savingBrand}
          className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 px-8 h-12 text-base w-full sm:w-auto"
        >
          {savingBrand ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}{" "}
          {savingBrand ? "Saving..." : "Save Brand Identity"}
        </Button>
      </div>
    </div>
  );
}
