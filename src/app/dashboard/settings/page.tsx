"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Save,
  CheckCircle,
  ExternalLink,
  MessageCircle,
  Bot,
  MessageSquare,
  Plus,
  X,
  Trash2,
  AlertCircle,
  Share2 as Share2Icon,
  Smartphone,
  User,
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
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useClient } from "@/hooks/useClient";

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

const defaultAutoReplyConfig = {
  dm_enabled: false,
  dm_allowed_topics: {},
  dm_custom_topics: [],
  dm_boundary_templates: [],
  dm_tone: "friendly" as const,
  comments_enabled: false,
  comment_categories: {},
  public_restrictions: {},
};

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  is_active: boolean;
  connected_at: string;
}

type MainTab = "account" | "ai-rules";

export default function SettingsPage() {
  const { clientId } = useClient();
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingAI, setSavingAI] = useState(false);

  const [accountInfo, setAccountInfo] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  });
  const [aiConfig, setAiConfig] = useState(defaultAutoReplyConfig);

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

  const [mainTab, setMainTab] = useState<MainTab>("account");
  const [aiTab, setAiTab] = useState<"dm" | "comments">("dm");
  const [socials, setSocials] = useState<SocialAccount[]>([]);

  useEffect(() => {
    if (!clientId) return;

    async function load() {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (data) {
        setAccountInfo({
          contact_name: data.contact_name || "",
          contact_email: data.contact_email || "",
          contact_phone: data.contact_phone || "",
        });
        if (data.auto_reply_config)
          setAiConfig({
            ...defaultAutoReplyConfig,
            ...(data.auto_reply_config as any),
          });
      }

      const socialsRes = await supabase
        .from("social_accounts")
        .select("*")
        .eq("client_id", clientId)
        .order("connected_at", { ascending: true });
      if (socialsRes.data) setSocials(socialsRes.data as SocialAccount[]);
      setLoading(false);
    }
    load();
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
        setActiveAuthUrl((await res.json()).url);
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
      await fetch("/api/social-accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      await supabase
        .from("social_accounts")
        .update({ is_active: false } as Record<string, unknown>)
        .eq("id", accountId);
      setSocials((prev) =>
        prev.map((s) => (s.id === accountId ? { ...s, is_active: false } : s))
      );
      setConnectionMessage({ type: "success", text: "Account disconnected." });
    } catch (err) {
      setConnectionMessage({
        type: "error",
        text: "Failed to disconnect account",
      });
    } finally {
      setDisconnecting(null);
    }
  }, []);

  async function handleSaveAccount() {
    setSavingAccount(true);
    try {
      await supabase
        .from("clients")
        .update({
          contact_name: accountInfo.contact_name,
          contact_email: accountInfo.contact_email,
          contact_phone: accountInfo.contact_phone,
        })
        .eq("id", clientId);
      setConnectionMessage({
        type: "success",
        text: "Account settings saved!",
      });
      setTimeout(() => setConnectionMessage(null), 3000);
    } catch (err) {
      setConnectionMessage({
        type: "error",
        text: "Failed to save account settings",
      });
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSaveAI() {
    setSavingAI(true);
    try {
      await supabase
        .from("clients")
        .update({ auto_reply_config: aiConfig as Record<string, unknown> })
        .eq("id", clientId);
      setConnectionMessage({
        type: "success",
        text: "AI Rules saved successfully!",
      });
      setTimeout(() => setConnectionMessage(null), 3000);
    } catch (err) {
      setConnectionMessage({ type: "error", text: "Failed to save AI Rules" });
    } finally {
      setSavingAI(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl pb-20">
      <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100 overflow-x-auto">
        <button
          onClick={() => setMainTab("account")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap",
            mainTab === "account"
              ? "bg-white text-blink-dark shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          <User className="h-4 w-4" /> Account Settings
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

      {mainTab === "account" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">
            <div>
              <h3 className="text-base font-semibold text-blink-dark">
                User Profile
              </h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name
                </label>
                <Input
                  value={accountInfo.contact_name}
                  onChange={(e) =>
                    setAccountInfo({
                      ...accountInfo,
                      contact_name: e.target.value,
                    })
                  }
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <Input
                  value={accountInfo.contact_email}
                  onChange={(e) =>
                    setAccountInfo({
                      ...accountInfo,
                      contact_email: e.target.value,
                    })
                  }
                  placeholder="john@example.com"
                  type="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number
                </label>
                <Input
                  value={accountInfo.contact_phone}
                  onChange={(e) =>
                    setAccountInfo({
                      ...accountInfo,
                      contact_phone: e.target.value,
                    })
                  }
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
            <Button
              onClick={handleSaveAccount}
              disabled={savingAccount}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
            >
              {savingAccount ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              Save Account Settings
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
            <div>
              <h3 className="text-base font-semibold text-blink-dark">
                Social Connections
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Link the social media accounts you want Blink to post to.
              </p>
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
            <details className="group border-t border-gray-100 pt-3 mt-3">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-500 hover:text-blink-primary transition-colors py-2 select-none">
                <Plus className="h-4 w-4" /> Connect more platforms
              </summary>
              <div className="mt-3 space-y-2 pl-0">
                {Object.entries(platformConfig).map(([key, cfg]) => {
                  if (socials.some((s) => s.platform === key && s.is_active))
                    return null;
                  return (
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
                        onClick={() => connectPlatform(key)}
                        disabled={connectingPlatform === key}
                      >
                        {connectingPlatform === key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3 w-3" />
                        )}
                        Connect
                      </Button>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        </div>
      )}

      {mainTab === "ai-rules" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
            <Bot className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p>AI Auto-Reply configuration UI goes here.</p>
            <p className="text-xs mt-2">
              Make sure to configure your Brand Voice in the Brand Identity tab
              first!
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveAI}
              disabled={savingAI}
              className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
            >
              {savingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              Save AI Rules
            </Button>
          </div>
        </div>
      )}

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
              Choose how you want to securely log in.
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
