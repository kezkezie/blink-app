"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useBrandStore } from "@/app/store/useBrandStore";
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
  RefreshCw,
  Briefcase,
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
    color: "bg-gradient-to-br from-pink-500 to-purple-600",
  },
  tiktok: { label: "TikTok", emoji: "🎵", color: "bg-black border border-gray-800" },
  facebook: { label: "Facebook", emoji: "📘", color: "bg-blue-600" },
  twitter: { label: "Twitter / X", emoji: "🐦", color: "bg-gray-900 border border-gray-800" },
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

function SettingsContent() {
  const { clientId } = useClient();
  const searchParams = useSearchParams();

  const { activeBrand } = useBrandStore();

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [accountInfo, setAccountInfo] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  });
  const [aiConfig, setAiConfig] = useState(defaultAutoReplyConfig);

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [activeAuthUrl, setActiveAuthUrl] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("account");
  const [aiTab, setAiTab] = useState<"dm" | "comments">("dm");
  const [socials, setSocials] = useState<SocialAccount[]>([]);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadData = useCallback(async () => {
    if (!clientId) return;

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

    // ✨ MULTI-BRAND FIX: Fetch only the social accounts tied to the active workspace!
    if (activeBrand) {
      const socialsRes = await supabase
        .from("social_accounts")
        .select("*")
        .eq("brand_id", activeBrand.id)
        .order("connected_at", { ascending: true });

      if (socialsRes.data) setSocials(socialsRes.data as SocialAccount[]);
    } else {
      setSocials([]);
    }

    setLoading(false);
  }, [clientId, activeBrand?.id]);

  const handleManualSync = useCallback(async () => {
    if (!clientId || !activeBrand) return;
    setSyncing(true);
    setConnectionMessage({ type: "info", text: "Syncing connected accounts..." });

    try {
      const res = await fetch("/api/social-accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync accounts");

      if (data.accounts && data.accounts.length > 0) {
        const { data: existing } = await supabase
          .from('social_accounts')
          .select('id, platform')
          .eq('brand_id', activeBrand.id);

        for (const acc of data.accounts) {
          const exists = existing?.find(e => e.platform === acc.platform);
          if (exists) {
            await supabase.from('social_accounts').update(acc).eq('id', exists.id);
          } else {
            // ✨ MULTI-BRAND FIX: Insert the account linked to BOTH the client and the brand
            const { error: insertErr } = await supabase.from('social_accounts').insert([{
              ...acc,
              client_id: clientId,
              brand_id: activeBrand.id
            }]);
            if (insertErr) {
              console.error("Insert error:", insertErr);
              throw new Error(insertErr.message);
            }
          }
        }
      } else {
        throw new Error("No accounts found in PostForMe for this client ID.");
      }

      await loadData();
      setConnectionMessage({ type: "success", text: "Accounts synced successfully!" });
      setTimeout(() => setConnectionMessage(null), 4000);
    } catch (err: any) {
      console.error("Sync process error:", err);
      setConnectionMessage({ type: "error", text: err.message });
    } finally {
      setSyncing(false);
    }
  }, [clientId, activeBrand, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!clientId || hasAutoSynced || !activeBrand) return;

    if (searchParams.get("success") === "account_connected") {
      setHasAutoSynced(true);
      handleManualSync();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [clientId, activeBrand, searchParams, hasAutoSynced, handleManualSync]);

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

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate auth URL");

        setActiveAuthUrl(data.url);
        setActivePlatform(platform);
        setConnectModalOpen(true);
      } catch (err) {
        setConnectionMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to connect account",
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
      await supabase
        .from("social_accounts")
        .delete()
        .eq("id", accountId);

      setSocials((prev) => prev.filter((s) => s.id !== accountId));
      setConnectionMessage({ type: "success", text: "Account disconnected." });
      setTimeout(() => setConnectionMessage(null), 3000);
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

  if (!isMounted || loading)
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ✨ BRAND WORKSPACE INDICATOR */}
      <div className="bg-[#2A2F38] border border-[#C5BAC4]/30 rounded-2xl p-4 shadow-sm flex items-center gap-3">
        {activeBrand ? (
          <>
            <Briefcase className="h-5 w-5 text-[#C5BAC4]" />
            <h3 className="text-sm font-bold text-[#DEDCDC]">Viewing Integrations for: <span className="text-white bg-[#191D23] px-2 py-1 rounded ml-1">{activeBrand.brand_name || "Unnamed Workspace"}</span></h3>
          </>
        ) : (
          <>
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <h3 className="text-sm font-bold text-amber-400">No Workspace Selected. Please select a workspace.</h3>
          </>
        )}
      </div>

      {/* ── TAB SWITCHER ── */}
      <div className="flex items-center gap-1 p-1.5 rounded-xl bg-[#191D23] border border-[#57707A]/30 overflow-x-auto shadow-inner">
        <button
          onClick={() => setMainTab("account")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex-1 justify-center whitespace-nowrap",
            mainTab === "account"
              ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50"
              : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
          )}
        >
          <User className="h-4 w-4" /> Account Settings
        </button>
        <button
          onClick={() => setMainTab("ai-rules")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex-1 justify-center whitespace-nowrap",
            mainTab === "ai-rules"
              ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm border border-[#57707A]/50"
              : "text-[#57707A] hover:text-[#989DAA] hover:bg-[#57707A]/10 border border-transparent"
          )}
        >
          <Bot className="h-4 w-4" /> AI Reply Rules
        </button>
      </div>

      {connectionMessage && (
        <div
          className={cn(
            "px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-3 transition-all shadow-lg animate-in slide-in-from-top-4",
            connectionMessage.type === "success"
              ? "bg-[#B3FF00]/10 text-[#B3FF00] border border-[#B3FF00]/20"
              : connectionMessage.type === "info"
                ? "bg-[#C5BAC4]/10 text-[#C5BAC4] border border-[#C5BAC4]/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          {connectionMessage.type === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : connectionMessage.type === "info" ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
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

      {mainTab === "account" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* USER PROFILE SECTION */}
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 space-y-6 shadow-lg">
            <div className="border-b border-[#57707A]/20 pb-4">
              <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                Master Account Info
              </h3>
              <p className="text-sm text-[#989DAA] mt-1">This email is used for billing and system notifications across all your brands.</p>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
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
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
                  Billing Email
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
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#57707A] uppercase tracking-wider mb-2">
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
                  className="bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl h-12 shadow-inner"
                />
              </div>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleSaveAccount}
                disabled={savingAccount}
                className="bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold gap-2 h-11 px-6 rounded-xl shadow-lg shadow-[#C5BAC4]/10 transition-all w-full sm:w-auto"
              >
                {savingAccount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Save Account Settings
              </Button>
            </div>
          </div>

          {/* SOCIAL CONNECTIONS SECTION */}
          <div className={cn("rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-6 md:p-8 space-y-6 shadow-lg relative", !activeBrand && "opacity-60 pointer-events-none")}>

            {/* ✨ DISABLED OVERLAY IF NO BRAND SELECTED */}
            {!activeBrand && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#191D23]/50 backdrop-blur-[2px] rounded-2xl">
                <div className="bg-[#2A2F38] border border-[#57707A]/50 px-6 py-3 rounded-xl shadow-xl flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-[#C5BAC4]" />
                  <p className="text-sm font-bold text-[#DEDCDC]">Please select a Workspace to connect socials.</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-[#57707A]/20 pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#DEDCDC] font-display">
                  Workspace Integrations
                </h3>
                <p className="text-sm text-[#989DAA] mt-1">
                  Link the social media accounts you want <b className="text-white">{activeBrand?.brand_name || "this workspace"}</b> to post to.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={syncing}
                className="text-xs font-bold bg-[#191D23] border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4]/10 hover:text-white transition-colors h-9"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
                Sync Accounts
              </Button>
            </div>

            {socials.filter((s) => s.is_active).length === 0 ? (
              <div className="text-center py-10 space-y-4">
                <div className="h-16 w-16 rounded-full bg-[#191D23] border border-[#57707A]/30 flex items-center justify-center mx-auto shadow-inner">
                  <Share2Icon className="h-6 w-6 text-[#57707A]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#DEDCDC]">
                    No social accounts connected yet
                  </p>
                  <p className="text-xs text-[#989DAA] mt-1">Connect a platform below to start automating your feed.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {socials
                  .filter((s) => s.is_active)
                  .map((account) => {
                    const displayPlatform = account.platform === 'x' ? 'twitter' : account.platform;
                    const cfg = platformConfig[displayPlatform] || { label: account.platform, emoji: "🔗", color: "bg-[#191D23] border border-[#57707A]/40" };

                    return (
                      <div
                        key={account.id}
                        className="flex items-center justify-between py-3 px-4 rounded-xl border border-[#B3FF00]/30 bg-[#B3FF00]/5 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-lg flex items-center justify-center text-white text-lg shadow-inner",
                              cfg.color
                            )}
                          >
                            {cfg.emoji}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#DEDCDC]">
                              {cfg.label}
                            </p>
                            {account.account_name && (
                              <p className="text-xs font-medium text-[#989DAA]">
                                @{account.account_name.replace("@", "")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-[#B3FF00]/30 bg-[#B3FF00]/10 text-[#B3FF00]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#B3FF00]" />{" "}
                            Connected
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-[#57707A] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            disabled={disconnecting === account.id}
                            onClick={() => disconnectPlatform(account.id)}
                            title="Disconnect Account"
                          >
                            {disconnecting === account.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Connect More Platforms Dropdown */}
            <details className="group border-t border-[#57707A]/30 pt-4 mt-6">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-bold text-[#C5BAC4] hover:text-white transition-colors py-2 select-none w-fit">
                <Plus className="h-4 w-4 bg-[#C5BAC4]/10 rounded p-0.5" /> Connect more platforms
              </summary>
              <div className="mt-4 space-y-2.5 pl-0 animate-in slide-in-from-top-2">
                {Object.entries(platformConfig).map(([key, cfg]) => {
                  const pfmKey = key === 'twitter' ? 'x' : key;
                  if (socials.some((s) => s.platform === pfmKey && s.is_active))
                    return null;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between py-3 px-4 rounded-xl border border-[#57707A]/40 bg-[#191D23] hover:border-[#C5BAC4]/50 transition-colors group/card"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center text-white text-lg shadow-inner",
                            cfg.color
                          )}
                        >
                          {cfg.emoji}
                        </div>
                        <p className="text-sm font-bold text-[#DEDCDC]">
                          {cfg.label}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs font-bold gap-1.5 h-9 bg-[#2A2F38] border-[#57707A]/50 text-[#C5BAC4] hover:bg-[#C5BAC4] hover:text-[#191D23] transition-colors"
                        onClick={() => connectPlatform(key)}
                        disabled={connectingPlatform === key}
                      >
                        {connectingPlatform === key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
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

      {/* ✨ AI RULES TAB (COMING SOON) */}
      {mainTab === "ai-rules" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="rounded-2xl border border-[#57707A]/30 bg-[#2A2F38] p-10 text-center shadow-lg flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
            {/* Subtle background element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#C5BAC4]/5 blur-[80px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              <div className="h-20 w-20 bg-[#191D23] border border-[#57707A]/40 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <Bot className="h-10 w-10 text-[#57707A]" />
              </div>
              <span className="text-[10px] font-bold text-[#191D23] uppercase tracking-widest bg-[#C5BAC4] px-3 py-1 rounded-full mb-4">Coming Soon</span>
              <h3 className="text-2xl font-bold text-[#DEDCDC] font-display mb-3">AI Auto-Reply Configuration</h3>
              <p className="text-[#989DAA] max-w-md leading-relaxed">
                Soon, you'll be able to configure your AI assistant to automatically reply to DMs and comments using your brand's unique voice and safety boundaries.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CONNECTION MODAL */}
      <Dialog
        open={connectModalOpen}
        onOpenChange={(open) => {
          setConnectModalOpen(open);
          if (!open) {
            setActiveAuthUrl(null);
            setActivePlatform(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0 border-b border-transparent">
            <DialogTitle className="text-xl font-display text-[#DEDCDC]">Connect Account</DialogTitle>
            <DialogDescription className="text-[#989DAA] mt-1.5">
              Choose how you want to securely log in to {activePlatform ? <span className="capitalize text-white font-bold">{activePlatform}</span> : 'this platform'}.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 bg-[#191D23]/50">
            {activeAuthUrl ? (
              <div className="flex flex-col space-y-5">
                {/* ✨ Strict Meta Connection Instructions */}
                {(activePlatform === 'instagram' || activePlatform === 'facebook') && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left space-y-2.5 shadow-inner animate-in fade-in">
                    <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> Required for Meta Login
                    </h4>
                    <ul className="text-xs text-amber-500/80 list-disc pl-4 space-y-1.5 leading-relaxed font-medium">
                      <li>Your Instagram must be a <b className="text-amber-400">Professional or Business</b> account.</li>
                      <li>It must be explicitly linked to a <b className="text-amber-400">Facebook Page</b>.</li>
                      <li>During login, you <b className="text-amber-400">must check the boxes</b> granting access to BOTH your Facebook Page and the connected Instagram account.</li>
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col items-center justify-center space-y-4 p-6 rounded-xl border border-[#57707A]/40 bg-[#2A2F38] shadow-md text-center hover:border-[#C5BAC4]/50 transition-colors group">
                    <div className="h-14 w-14 bg-[#191D23] border border-[#57707A]/40 text-[#C5BAC4] rounded-full flex items-center justify-center shadow-inner group-hover:bg-[#C5BAC4]/10 transition-colors">
                      <ExternalLink className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#DEDCDC]">
                        This Device
                      </h4>
                      <p className="text-xs text-[#989DAA] mt-1 px-2 leading-relaxed">
                        Continue the secure login process in a new tab.
                      </p>
                    </div>
                    <Button
                      onClick={() => (window.location.href = activeAuthUrl)}
                      className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold shadow-lg"
                    >
                      Log In Here
                    </Button>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-4 p-6 rounded-xl border border-[#57707A]/40 bg-[#2A2F38] shadow-md text-center">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-white/20">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=0&data=${encodeURIComponent(
                          activeAuthUrl
                        )}`}
                        alt="QR Code"
                        className="h-28 w-28 object-contain rounded-md"
                      />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#DEDCDC] flex items-center justify-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-[#57707A]" /> Use Phone
                      </h4>
                      <p className="text-xs text-[#989DAA] mt-1 leading-relaxed">
                        Scan QR code to securely log in on your mobile device.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setConnectModalOpen(false);
                        handleManualSync();
                      }}
                      className="text-[10px] text-[#C5BAC4] font-bold bg-[#191D23] border border-[#57707A]/40 hover:bg-[#57707A]/30 hover:border-[#C5BAC4] px-4 py-2 rounded-full w-full transition-colors uppercase tracking-wider"
                    >
                      I finished logging in ↻
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ✨ Wraps the component in Suspense to make it completely Vercel-safe!
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}