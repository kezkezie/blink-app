"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Save,
  CheckCircle,
  ExternalLink,
  Crown,
  Mail,
  MessageCircle,
  Bot,
  MessageSquare,
  Plus,
  X,
  Shield,
  Trash2,
  AlertCircle,
  Share2 as Share2Icon,
  Palette,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

/* ─── Helpers ─── */
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

/* ─── Constants ─── */
const PFM_SUPPORTED_PLATFORMS = [
  "instagram",
  "tiktok",
  "facebook",
  "twitter",
  "linkedin",
  "youtube",
  "pinterest",
  "threads",
];

const platformConfig: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  instagram: {
    label: "Instagram",
    emoji: "📸",
    color: "bg-gradient-to-br from-purple-500 to-pink-500",
  },
  tiktok: { label: "TikTok", emoji: "🎵", color: "bg-black" },
  facebook: { label: "Facebook", emoji: "📘", color: "bg-blue-600" },
  twitter: { label: "Twitter / X", emoji: "🐦", color: "bg-gray-900" },
  linkedin: { label: "LinkedIn", emoji: "💼", color: "bg-blue-700" },
  youtube: { label: "YouTube", emoji: "▶️", color: "bg-red-600" },
  pinterest: { label: "Pinterest", emoji: "📌", color: "bg-red-700" },
  threads: { label: "Threads", emoji: "🔗", color: "bg-gray-800" },
};

const defaultDmTopics: Record<string, string> = {
  pricing: "Pricing",
  discounts: "Discounts",
  delivery_times: "Delivery times",
  opening_hours: "Opening hours",
  product_recommendations: "Product recommendations",
  refunds_exchanges: "Refunds/exchanges",
  competitor_comparisons: "Competitor comparisons",
};

const defaultBoundaryTemplates = [
  "I'm not able to discuss that right now. Please contact us directly!",
  "I can help with menu items and general questions!",
  "Let me connect you with our team for that. One moment!",
];

const toneOptions = ["friendly", "professional", "casual", "formal"] as const;

const defaultCommentCategories: Record<
  string,
  { enabled: boolean; template: string; action?: string }
> = {
  positive: { enabled: true, template: "Thank you for your support! 🧡" },
  complaints: {
    enabled: true,
    template: "Sorry to hear that — please DM us so we can help.",
  },
  questions: { enabled: true, template: "" },
  toxic_spam: {
    enabled: false,
    template: "We appreciate all feedback. For concerns, please DM us.",
    action: "ignore",
  },
};

const defaultPublicRestrictions: Record<string, boolean> = {
  never_discuss_prices_publicly: false,
  never_make_promises: false,
  never_argue_or_be_defensive: false,
  never_discuss_competitors: false,
  never_share_personal_opinions: false,
};

/* ─── Interfaces ─── */
interface AutoReplyConfig {
  dm_enabled: boolean;
  dm_allowed_topics: Record<string, boolean>;
  dm_custom_topics: string[];
  dm_boundary_templates: string[];
  dm_tone: "friendly" | "professional" | "casual" | "formal";
  comments_enabled: boolean;
  comment_categories: Record<
    string,
    { enabled: boolean; template: string; action?: string }
  >;
  public_restrictions: Record<string, boolean>;
}

const defaultAutoReplyConfig: AutoReplyConfig = {
  dm_enabled: false,
  dm_allowed_topics: Object.fromEntries(
    Object.keys(defaultDmTopics).map((k) => [k, true])
  ),
  dm_custom_topics: [],
  dm_boundary_templates: [...defaultBoundaryTemplates],
  dm_tone: "friendly",
  comments_enabled: false,
  comment_categories: { ...defaultCommentCategories },
  public_restrictions: { ...defaultPublicRestrictions },
};

interface ClientData {
  company_name: string;
  website_url: string;
  industry: string;
  plan_tier: string;
  contact_email: string;
  approval_channel: string;
}

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  is_active: boolean;
  connected_at: string;
}

interface BrandProfileData {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  additional_colors: string[];
  uploaded_assets: string[];
}

type MainTab = "general" | "brand" | "ai-rules";
type AITab = "dm" | "comments";

export default function SettingsPage() {
  const { clientId, loading: clientLoading } = useClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [savedAI, setSavedAI] = useState(false);

  const [brandProfile, setBrandProfile] = useState<BrandProfileData>({
    logo_url: null,
    primary_color: "#2563EB",
    secondary_color: "#F59E0B",
    accent_color: "#10B981",
    additional_colors: ["#6B7280"],
    uploaded_assets: [],
  });
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null
  );
  const [activeAuthUrl, setActiveAuthUrl] = useState<string | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [aiSaveError, setAiSaveError] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("general");
  const [aiTab, setAiTab] = useState<AITab>("dm");

  const [client, setClient] = useState<ClientData>({
    company_name: "",
    website_url: "",
    industry: "",
    plan_tier: "starter",
    contact_email: "",
    approval_channel: "telegram",
  });
  const [socials, setSocials] = useState<SocialAccount[]>([]);

  const [aiConfig, setAiConfig] = useState<AutoReplyConfig>(
    defaultAutoReplyConfig
  );
  const [newCustomTopic, setNewCustomTopic] = useState("");
  const [newTemplate, setNewTemplate] = useState("");

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      // 1. Fetch local app data
      const [clientRes, brandRes] = await Promise.all([
        supabase
          .from("clients")
          .select(
            "company_name, website_url, industry, plan_tier, contact_email, approval_channel"
          )
          .eq("id", clientId)
          .single(),
        supabase
          .from("brand_profiles")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle(),
      ]);

      if (clientRes.data) {
        const d = clientRes.data as ClientData;
        setClient({
          company_name: d.company_name || "",
          website_url: d.website_url || "",
          industry: d.industry || "",
          plan_tier: d.plan_tier || "starter",
          contact_email: d.contact_email || "",
          approval_channel: d.approval_channel || "telegram",
        });
      }

      if (brandRes.data) {
        const addColors = parseArray(brandRes.data.additional_colors);
        setBrandProfile({
          logo_url: brandRes.data.logo_url || null,
          primary_color: brandRes.data.primary_color || "#2563EB",
          secondary_color: brandRes.data.secondary_color || "#F59E0B",
          accent_color: brandRes.data.accent_color || "#10B981",
          additional_colors: addColors.length > 0 ? addColors : ["#6B7280"],
          uploaded_assets: parseArray(brandRes.data.uploaded_assets),
        });
      }

      try {
        const stored = localStorage.getItem(
          `blink_auto_reply_config_${clientId}`
        );
        if (stored)
          setAiConfig({ ...defaultAutoReplyConfig, ...JSON.parse(stored) });
      } catch {}

      // ✨ NEW: 2. Background Auto-Sync with Post For Me
      try {
        const syncRes = await fetch(
          `/api/social-accounts/list?clientId=${clientId}`
        );
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          const liveAccounts = syncData.accounts || [];

          if (liveAccounts.length > 0) {
            // Upsert the live truth from Post For Me into Supabase
            const upsertData = liveAccounts.map((acc: any) => ({
              id: acc.id,
              client_id: clientId,
              platform: acc.platform,
              account_name: acc.username || acc.platform,
              is_active: acc.status === "connected",
            }));
            await supabase
              .from("social_accounts")
              .upsert(upsertData, { onConflict: "id" });
          }
        }
      } catch (err) {
        console.error("Failed to sync accounts from Post For Me", err);
      }

      // 3. Fetch the final synced accounts for the UI
      const socialsRes = await supabase
        .from("social_accounts")
        .select("*")
        .eq("client_id", clientId)
        .order("connected_at", { ascending: true });
      if (socialsRes.data) setSocials(socialsRes.data as SocialAccount[]);

      setLoading(false);
    }

    load();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("success") === "account_connected") {
      setConnectionMessage({
        type: "success",
        text: "Social account connected successfully!",
      });
      window.history.replaceState({}, "", "/dashboard/settings");
      setTimeout(load, 1500);
    } else if (urlParams.get("error")) {
      const errorMsg =
        urlParams.get("error")?.replace(/_/g, " ") || "Connection failed";
      setConnectionMessage({
        type: "error",
        text: `Connection error: ${errorMsg}`,
      });
      window.history.replaceState({}, "", "/dashboard/settings");
    }
  }, [clientId]);

  const connectPlatform = useCallback(
    async (platform: string) => {
      setConnectingPlatform(platform);
      setConnectionMessage(null);
      try {
        const res = await fetch("/api/social-accounts/auth-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, clientId }),
        });
        if (!res.ok)
          throw new Error(
            (await res.json()).error || "Failed to generate auth URL"
          );

        const { url } = await res.json();
        setActiveAuthUrl(url);
        setConnectModalOpen(true);
      } catch (err) {
        setConnectionMessage({
          type: "error",
          text:
            err instanceof Error ? err.message : "Failed to connect account",
        });
      } finally {
        setConnectingPlatform(null);
      }
    },
    [clientId]
  );

  const disconnectPlatform = useCallback(async (accountId: string) => {
    setDisconnecting(accountId);
    setConnectionMessage(null);
    try {
      // ✨ NEW: Inform Post For Me to sever the connection via the new backend route
      await fetch("/api/social-accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      // Update Supabase and local UI
      await supabase
        .from("social_accounts")
        .update({ is_active: false } as Record<string, unknown>)
        .eq("id", accountId);
      setSocials((prev) =>
        prev.map((s) => (s.id === accountId ? { ...s, is_active: false } : s))
      );
      setConnectionMessage({
        type: "success",
        text: "Account disconnected successfully.",
      });
    } catch (err) {
      setConnectionMessage({
        type: "error",
        text: "Failed to disconnect account",
      });
    } finally {
      setDisconnecting(null);
    }
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("clients")
      .update({
        company_name: client.company_name,
        website_url: client.website_url,
        industry: client.industry,
      })
      .eq("id", clientId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSaveBrand() {
    setSavingBrand(true);
    try {
      await supabase
        .from("brand_profiles")
        .update({
          logo_url: brandProfile.logo_url,
          primary_color: brandProfile.primary_color,
          secondary_color: brandProfile.secondary_color,
          accent_color: brandProfile.accent_color,
          additional_colors: brandProfile.additional_colors,
          uploaded_assets: brandProfile.uploaded_assets,
        })
        .eq("client_id", clientId);
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
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
      if (type === "logo")
        setBrandProfile((prev) => ({ ...prev, logo_url: data.publicUrl }));
      else
        setBrandProfile((prev) => ({
          ...prev,
          uploaded_assets: [...prev.uploaded_assets, data.publicUrl],
        }));
    } catch (err) {
      alert(
        "Failed to upload image. Ensure you have an 'assets' bucket in Supabase."
      );
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

  async function handleSaveAI() {
    setSavingAI(true);
    setSavedAI(false);
    setAiSaveError(null);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ auto_reply_config: aiConfig } as Record<string, unknown>)
        .eq("id", clientId);
      if (error) throw error;
    } catch {
      localStorage.setItem(
        `blink_auto_reply_config_${clientId}`,
        JSON.stringify(aiConfig)
      );
      setAiSaveError(
        "Saved locally — will sync to database when the column is available"
      );
    } finally {
      setSavedAI(true);
      setTimeout(() => {
        setSavedAI(false);
        setAiSaveError(null);
      }, 4000);
      setSavingAI(false);
    }
  }

  function updateAI<K extends keyof AutoReplyConfig>(
    key: K,
    value: AutoReplyConfig[K]
  ) {
    setAiConfig((prev) => ({ ...prev, [key]: value }));
  }
  function toggleDmTopic(topic: string) {
    setAiConfig((prev) => ({
      ...prev,
      dm_allowed_topics: {
        ...prev.dm_allowed_topics,
        [topic]: !prev.dm_allowed_topics[topic],
      },
    }));
  }
  function addCustomTopic() {
    const topic = newCustomTopic.trim();
    if (!topic || aiConfig.dm_custom_topics.includes(topic)) return;
    setAiConfig((prev) => ({
      ...prev,
      dm_custom_topics: [...prev.dm_custom_topics, topic],
    }));
    setNewCustomTopic("");
  }
  function removeCustomTopic(topic: string) {
    setAiConfig((prev) => ({
      ...prev,
      dm_custom_topics: prev.dm_custom_topics.filter((t) => t !== topic),
    }));
  }
  function updateBoundaryTemplate(index: number, value: string) {
    setAiConfig((prev) => ({
      ...prev,
      dm_boundary_templates: prev.dm_boundary_templates.map((t, i) =>
        i === index ? value : t
      ),
    }));
  }
  function removeBoundaryTemplate(index: number) {
    setAiConfig((prev) => ({
      ...prev,
      dm_boundary_templates: prev.dm_boundary_templates.filter(
        (_, i) => i !== index
      ),
    }));
  }
  function addBoundaryTemplate() {
    const t = newTemplate.trim();
    if (!t) return;
    setAiConfig((prev) => ({
      ...prev,
      dm_boundary_templates: [...prev.dm_boundary_templates, t],
    }));
    setNewTemplate("");
  }
  function updateCommentCategory(
    category: string,
    update: Partial<{ enabled: boolean; template: string; action: string }>
  ) {
    setAiConfig((prev) => ({
      ...prev,
      comment_categories: {
        ...prev.comment_categories,
        [category]: { ...prev.comment_categories[category], ...update },
      },
    }));
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 overflow-x-auto">
        <button
          onClick={() => setMainTab("general")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap",
            mainTab === "general"
              ? "bg-white text-blink-dark shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <MessageCircle className="h-4 w-4" /> General Settings
        </button>
        <button
          onClick={() => setMainTab("brand")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap",
            mainTab === "brand"
              ? "bg-white text-blink-dark shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Palette className="h-4 w-4" /> Brand Identity
        </button>
        <button
          onClick={() => setMainTab("ai-rules")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap",
            mainTab === "ai-rules"
              ? "bg-white text-blink-dark shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Bot className="h-4 w-4" /> AI Reply Rules
        </button>
      </div>

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
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}{" "}
          {connectionMessage.text}
          <button
            onClick={() => setConnectionMessage(null)}
            className="ml-auto p-0.5 hover:bg-black/5 rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mainTab === "general" && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-blink-dark">
                Business Information
              </h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company Name
                </label>
                <Input
                  value={client.company_name}
                  onChange={(e) =>
                    setClient((p) => ({ ...p, company_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Website URL
                </label>
                <Input
                  value={client.website_url}
                  onChange={(e) =>
                    setClient((p) => ({ ...p, website_url: e.target.value }))
                  }
                  placeholder="https://yourbusiness.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Industry
                </label>
                <Input
                  value={client.industry}
                  onChange={(e) =>
                    setClient((p) => ({ ...p, industry: e.target.value }))
                  }
                  placeholder="e.g. Real Estate, Tech, E-commerce"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-blink-dark">
                Social Connections
              </h3>
            </div>
            {socials.filter((s) => s.is_active).length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                  <Share2Icon className="h-6 w-6 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blink-dark">
                    No social accounts connected yet
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {socials
                  .filter((s) => s.is_active)
                  .map((account) => {
                    const cfg = platformConfig[account.platform];
                    if (!cfg) return null;
                    return (
                      <div
                        key={account.id}
                        className="flex items-center justify-between py-3 px-4 rounded-lg border border-emerald-100 bg-emerald-50/30"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-9 w-9 rounded-lg flex items-center justify-center text-white text-base",
                              cfg.color
                            )}
                          >
                            {cfg.emoji}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-blink-dark">
                              {cfg.label}
                            </p>
                            {account.account_name && (
                              <p className="text-xs text-gray-400">
                                @{account.account_name.replace("@", "")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                            Connected
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
                            disabled={disconnecting === account.id}
                            onClick={() => disconnectPlatform(account.id)}
                          >
                            {disconnecting === account.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            {(() => {
              const connectedPlatforms = socials
                .filter((s) => s.is_active)
                .map((s) => s.platform);
              const available = Object.entries(platformConfig).filter(
                ([key]) => !connectedPlatforms.includes(key)
              );
              if (available.length === 0) return null;
              return (
                <details className="group border-t border-gray-100 pt-3 mt-3">
                  <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-500 hover:text-blink-primary transition-colors py-2 select-none">
                    <Plus className="h-4 w-4" /> Connect more platforms
                  </summary>
                  <div className="mt-3 space-y-2 pl-0">
                    {available.map(([key, cfg]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-9 w-9 rounded-lg flex items-center justify-center text-white text-base",
                              cfg.color
                            )}
                          >
                            {cfg.emoji}
                          </div>
                          <p className="text-sm font-medium text-blink-dark">
                            {cfg.label}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 h-8"
                          disabled={
                            connectingPlatform === key ||
                            !PFM_SUPPORTED_PLATFORMS.includes(key)
                          }
                          onClick={() => connectPlatform(key)}
                        >
                          {connectingPlatform === key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3 w-3" />
                          )}
                          {connectingPlatform === key
                            ? "Connecting..."
                            : "Connect"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })()}
          </div>
        </>
      )}

      {mainTab === "brand" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
            <div>
              <h3 className="text-base font-semibold text-blink-dark">
                Brand Colors
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Define your core colors so the AI applies them to generated
                content.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                  Primary Color
                </label>
                <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg hover:border-blink-primary/50 transition-colors bg-gray-50">
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
                  Secondary Color
                </label>
                <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg hover:border-blink-primary/50 transition-colors bg-gray-50">
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
                  Accent Color
                </label>
                <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg hover:border-blink-primary/50 transition-colors bg-gray-50">
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
                  Additional Color
                </label>
                <div className="flex items-center gap-2 p-1 border border-gray-200 rounded-lg hover:border-blink-primary/50 transition-colors bg-gray-50">
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
              <p className="text-sm text-gray-500 mt-0.5">
                Your official company logo.
              </p>
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
              <p className="text-sm text-gray-500 mt-0.5">
                Upload product photos, website screenshots, or reference images
                for the AI to study.
              </p>
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
          <div className="flex justify-start pt-2">
            <Button
              onClick={handleSaveBrand}
              disabled={savingBrand}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 px-6"
            >
              {savingBrand ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              {savingBrand ? "Saving..." : "Save Brand Identity"}
            </Button>
          </div>
        </div>
      )}

      {mainTab === "ai-rules" && (
        <>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
            <button
              onClick={() => setAiTab("dm")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                aiTab === "dm"
                  ? "bg-white text-blink-dark shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <MessageSquare className="h-4 w-4" /> DM Auto-Reply
            </button>
            <button
              onClick={() => setAiTab("comments")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                aiTab === "comments"
                  ? "bg-white text-blink-dark shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <MessageCircle className="h-4 w-4" /> Comment Auto-Reply
            </button>
          </div>

          {aiTab === "dm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2.5 rounded-lg transition-colors",
                        aiConfig.dm_enabled
                          ? "bg-blink-primary/10 text-blink-primary"
                          : "bg-gray-100 text-gray-400"
                      )}
                    >
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-blink-dark">
                        AI DM Auto-Replies
                      </h3>
                    </div>
                  </div>
                  <Switch
                    checked={aiConfig.dm_enabled}
                    onCheckedChange={(v) => updateAI("dm_enabled", v)}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-blink-dark">
                    Allowed Topics
                  </h3>
                </div>
                <div className="space-y-3">
                  {Object.entries(defaultDmTopics).map(([key, label]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-blink-dark">{label}</span>
                      <Switch
                        checked={aiConfig.dm_allowed_topics[key] ?? true}
                        onCheckedChange={() => toggleDmTopic(key)}
                      />
                    </div>
                  ))}
                  {aiConfig.dm_custom_topics.map((topic) => (
                    <div
                      key={topic}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-blink-dark flex items-center gap-1.5">
                        <span className="text-[10px] bg-blink-primary/10 text-blink-primary px-1.5 py-0.5 rounded font-medium">
                          Custom
                        </span>
                        {topic}
                      </span>
                      <button
                        onClick={() => removeCustomTopic(topic)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <Input
                    value={newCustomTopic}
                    onChange={(e) => setNewCustomTopic(e.target.value)}
                    placeholder="Add a custom topic..."
                    className="text-sm"
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), addCustomTopic())
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCustomTopic}
                    disabled={!newCustomTopic.trim()}
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-blink-dark">
                    Boundary Response Templates
                  </h3>
                </div>
                <div className="space-y-3">
                  {aiConfig.dm_boundary_templates.map((template, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <Textarea
                        value={template}
                        onChange={(e) =>
                          updateBoundaryTemplate(i, e.target.value)
                        }
                        rows={2}
                        className="resize-none text-sm flex-1"
                      />
                      <button
                        onClick={() => removeBoundaryTemplate(i)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors mt-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <Input
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder="Add a new template..."
                    className="text-sm"
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), addBoundaryTemplate())
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addBoundaryTemplate}
                    disabled={!newTemplate.trim()}
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-blink-dark">
                    Response Tone
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => updateAI("dm_tone", tone)}
                      className={cn(
                        "py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all capitalize text-center",
                        aiConfig.dm_tone === tone
                          ? "border-blink-primary bg-blink-primary/5 text-blink-primary"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      {tone === "friendly" && "😊 "}{" "}
                      {tone === "professional" && "💼 "}{" "}
                      {tone === "casual" && "✌️ "} {tone === "formal" && "🎩 "}{" "}
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {aiTab === "comments" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2.5 rounded-lg transition-colors",
                        aiConfig.comments_enabled
                          ? "bg-blink-primary/10 text-blink-primary"
                          : "bg-gray-100 text-gray-400"
                      )}
                    >
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-blink-dark">
                        AI Comment Auto-Replies
                      </h3>
                    </div>
                  </div>
                  <Switch
                    checked={aiConfig.comments_enabled}
                    onCheckedChange={(v) => updateAI("comments_enabled", v)}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-blink-dark">
                    Comment Categories
                  </h3>
                </div>
                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">😊</span>
                      <span className="text-sm font-medium text-blink-dark">
                        Positive Comments
                      </span>
                    </div>
                    <Switch
                      checked={
                        aiConfig.comment_categories.positive?.enabled ?? true
                      }
                      onCheckedChange={(v) =>
                        updateCommentCategory("positive", { enabled: v })
                      }
                    />
                  </div>
                  <Textarea
                    value={aiConfig.comment_categories.positive?.template || ""}
                    onChange={(e) =>
                      updateCommentCategory("positive", {
                        template: e.target.value,
                      })
                    }
                    rows={2}
                    placeholder="Response template..."
                    className="resize-none text-sm"
                  />
                </div>
                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">😟</span>
                      <span className="text-sm font-medium text-blink-dark">
                        Complaints
                      </span>
                    </div>
                    <Switch
                      checked={
                        aiConfig.comment_categories.complaints?.enabled ?? true
                      }
                      onCheckedChange={(v) =>
                        updateCommentCategory("complaints", { enabled: v })
                      }
                    />
                  </div>
                  <Textarea
                    value={
                      aiConfig.comment_categories.complaints?.template || ""
                    }
                    onChange={(e) =>
                      updateCommentCategory("complaints", {
                        template: e.target.value,
                      })
                    }
                    rows={2}
                    placeholder="Response template..."
                    className="resize-none text-sm"
                  />
                </div>
                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">❓</span>
                      <span className="text-sm font-medium text-blink-dark">
                        Questions
                      </span>
                    </div>
                    <Switch
                      checked={
                        aiConfig.comment_categories.questions?.enabled ?? true
                      }
                      onCheckedChange={(v) =>
                        updateCommentCategory("questions", { enabled: v })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-3 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚫</span>
                      <span className="text-sm font-medium text-blink-dark">
                        Toxic / Spam
                      </span>
                    </div>
                    <Switch
                      checked={
                        aiConfig.comment_categories.toxic_spam?.enabled ?? false
                      }
                      onCheckedChange={(v) =>
                        updateCommentCategory("toxic_spam", { enabled: v })
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateCommentCategory("toxic_spam", {
                          action: "ignore",
                        })
                      }
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all text-center",
                        aiConfig.comment_categories.toxic_spam?.action ===
                          "ignore"
                          ? "border-blink-primary bg-blink-primary/5 text-blink-primary"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      Ignore
                    </button>
                    <button
                      onClick={() =>
                        updateCommentCategory("toxic_spam", {
                          action: "reply_boundary",
                        })
                      }
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all text-center",
                        aiConfig.comment_categories.toxic_spam?.action ===
                          "reply_boundary"
                          ? "border-blink-primary bg-blink-primary/5 text-blink-primary"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      )}
                    >
                      Reply with boundary
                    </button>
                  </div>
                  {aiConfig.comment_categories.toxic_spam?.action ===
                    "reply_boundary" && (
                    <Textarea
                      value={
                        aiConfig.comment_categories.toxic_spam?.template || ""
                      }
                      onChange={(e) =>
                        updateCommentCategory("toxic_spam", {
                          template: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Boundary response..."
                      className="resize-none text-sm"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Button
              onClick={handleSaveAI}
              disabled={savingAI}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
            >
              {savingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedAI ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              {savingAI ? "Saving…" : savedAI ? "Saved!" : "Save AI Rules"}
            </Button>
          </div>
        </>
      )}

      {/* Dual-Mode Social Connection Modal */}
      <Dialog
        open={connectModalOpen}
        onOpenChange={(open) => {
          setConnectModalOpen(open);
          if (!open) setActiveAuthUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Account</DialogTitle>
            <DialogDescription>
              Choose how you want to securely log in to{" "}
              {connectingPlatform
                ? platformConfig[connectingPlatform]?.label
                : "this platform"}
              .
            </DialogDescription>
          </DialogHeader>
          {activeAuthUrl ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <div className="flex flex-col items-center justify-center space-y-4 p-5 rounded-xl border border-gray-200 bg-white shadow-sm text-center">
                <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                  <ExternalLink className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blink-dark">
                    This Device
                  </h4>
                  <p className="text-xs text-gray-500 mt-1 px-2">
                    Continue the login process in a new tab
                  </p>
                </div>
                <Button
                  onClick={() => (window.location.href = activeAuthUrl)}
                  className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white"
                >
                  Log In Here
                </Button>
              </div>
              <div className="flex flex-col items-center justify-center space-y-4 p-5 rounded-xl border border-gray-200 bg-white shadow-sm text-center">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=0&data=${encodeURIComponent(
                      activeAuthUrl
                    )}`}
                    alt="QR Code"
                    className="h-36 w-36 object-contain"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blink-dark flex items-center justify-center gap-1.5">
                    <Smartphone className="h-4 w-4" /> Use Phone
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Scan to securely log in on your mobile
                  </p>
                </div>
                <button
                  onClick={() => {
                    setConnectModalOpen(false);
                    window.location.reload();
                  }}
                  className="text-[10px] text-amber-700 font-bold bg-amber-100 border border-amber-200 hover:bg-amber-200 px-3 py-1.5 rounded-full w-full transition-colors"
                >
                  I finished logging in ↻
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
