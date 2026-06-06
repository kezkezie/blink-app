"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Zap, Sparkles, Wallet, ShieldCheck, Crown, Rocket, Building2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ─── Plan definitions ────────────────────────────────────────────────────────

const TIERS = [
    {
        id: "free",
        name: "Free",
        priceMonthly: "0",
        priceWeekly: "0",
        description: "Get started with the core tools at no cost.",
        icon: Gift,
        features: {
            monthly: [
                "1 Brand Workspace",
                "5 Posts per month",
                "100 AI Credits",
                "7-day Asset Storage",
                "Image Studio (basic)",
            ],
            weekly: [
                "1 Brand Workspace",
                "5 Posts per week",
                "25 AI Credits",
                "7-day Asset Storage",
                "Image Studio (basic)",
            ],
        },
        buttonText: "Your current plan",
        popular: false,
        highlight: "border-[#57707A]/40",
    },
    {
        id: "starter",
        name: "Starter",
        priceMonthly: "25",
        priceWeekly: "7",
        description: "Everything a small business needs to automate their socials.",
        icon: Zap,
        features: {
            monthly: [
                "2 Brand Workspaces",
                "30 Posts per month",
                "1,500 AI Credits",
                "30-day Asset Storage",
                "Image & Video AI Generation",
            ],
            weekly: [
                "2 Brand Workspaces",
                "7 Posts per week",
                "350 AI Credits",
                "7-day Asset Storage",
                "Image & Video AI Generation",
            ],
        },
        buttonText: "Upgrade to Starter",
        popular: false,
        highlight: "border-[#C5BAC4]/40",
    },
    {
        id: "pro",
        name: "Pro",
        priceMonthly: "49",
        priceWeekly: "14",
        description: "For creators and multi-brand managers who need more power.",
        icon: Rocket,
        features: {
            monthly: [
                "6 Brand Workspaces",
                "60 Posts per month",
                "3,000 AI Credits",
                "60-day Asset Storage",
                "All AI models",
                "Client approval workflows",
            ],
            weekly: [
                "6 Brand Workspaces",
                "15 Posts per week",
                "750 AI Credits",
                "14-day Asset Storage",
                "All AI models",
                "Client approval workflows",
            ],
        },
        buttonText: "Upgrade to Pro",
        popular: true,
        highlight: "border-[#C5BAC4]",
    },
    {
        id: "agency",
        name: "Agency",
        priceMonthly: "99",
        priceWeekly: "29",
        description: "High-volume generation for agencies and enterprise teams.",
        icon: Building2,
        features: {
            monthly: [
                "10 Brand Workspaces",
                "200 Posts per month",
                "6,000 AI Credits",
                "364-day Asset Storage",
                "All AI models",
                "Analytics dashboard",
            ],
            weekly: [
                "10 Brand Workspaces",
                "50 Posts per week",
                "1,500 AI Credits",
                "30-day Asset Storage",
                "All AI models",
                "Analytics dashboard",
            ],
        },
        buttonText: "Upgrade to Agency",
        popular: false,
        highlight: "border-[#57707A]/40",
    },
];

// ─── Tier ordering for upgrade/downgrade logic ────────────────────────────────

const TIER_ORDER = ["free", "starter", "pro", "agency"];

function getPlanLabel(currentPlan: string | null, tierId: string): string {
    if (!currentPlan) return TIERS.find(t => t.id === tierId)?.buttonText ?? "";
    const currentIdx = TIER_ORDER.indexOf(currentPlan);
    const tierIdx = TIER_ORDER.indexOf(tierId);
    if (currentIdx === tierIdx) return "Current plan";
    if (tierIdx > currentIdx) return `Upgrade to ${tierId.charAt(0).toUpperCase() + tierId.slice(1)}`;
    return `Downgrade to ${tierId.charAt(0).toUpperCase() + tierId.slice(1)}`;
}

// ─── Current plan banner data ─────────────────────────────────────────────────

const PLAN_BANNER: Record<string, { title: string; desc: string; iconColor: string }> = {
    free:    { title: "Free Plan",    desc: "You have access to the base Image Studio and 1 brand workspace. Upgrade to unlock video generation and multi-brand management.", iconColor: "text-[#57707A]" },
    starter: { title: "Starter Plan", desc: "2 brand workspaces, 1,500 credits/month, and full Image & Video AI generation. Upgrade to Pro to unlock 6 workspaces.", iconColor: "text-[#C5BAC4]" },
    pro:     { title: "Pro Plan",     desc: "6 brand workspaces, 3,000 credits/month, all AI models, and client approval workflows. You're fully equipped.", iconColor: "text-[#B3FF00]" },
    agency:  { title: "Agency Plan",  desc: "10 brand workspaces, 6,000 credits/month, analytics dashboard, and dedicated support. You have the full suite.", iconColor: "text-[#B3FF00]" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
    const { clientId } = useClient();
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const [loadingPack, setLoadingPack] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);
    const [creditBalance, setCreditBalance] = useState<number | null>(null);
    const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly">("monthly");

    useEffect(() => {
        if (!clientId) return;
        (async () => {
            const { data: clientData } = await supabase
                .from("clients")
                .select("plan_tier")
                .eq("id", clientId)
                .single();
            setCurrentPlan(clientData?.plan_tier?.toLowerCase() ?? "free");

            const { data: creditData } = await supabase
                .from("credit_balances")
                .select("balance")
                .eq("client_id", clientId)
                .single();
            setCreditBalance(creditData?.balance ?? 0);
        })();
    }, [clientId]);

    const handleUpgrade = async (tierName: string) => {
        setLoadingTier(tierName);
        // TODO: Replace with real Paystack checkout URL once plan codes are configured
        setTimeout(() => {
            alert(`Paystack Checkout for ${tierName} (${billingCycle}) plan — integration coming soon. Contact info@blinkspot.io to upgrade now.`);
            setLoadingTier(null);
        }, 800);
    };

    const handleBuyCreditPack = async () => {
        setLoadingPack(true);
        // TODO: Replace with real Paystack checkout URL for credit pack
        setTimeout(() => {
            alert("Paystack Checkout for 800 Credits ($5) — integration coming soon. Contact info@blinkspot.io to top up now.");
            setLoadingPack(false);
        }, 800);
    };

    const banner = PLAN_BANNER[currentPlan ?? "free"] ?? PLAN_BANNER.free;
    const currentTier = TIERS.find(t => t.id === currentPlan) ?? TIERS[0];
    const BannerIcon = currentTier.icon;

    return (
        <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 pb-20">

            {/* Header */}
            <div className="text-center space-y-3">
                <h1 className="text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
                    Plans &amp; Billing
                </h1>
                <p className="text-[#989DAA] max-w-2xl mx-auto text-sm md:text-base">
                    Manage your subscription, AI credits, and billing cycle.
                </p>
            </div>

            {/* Current plan banner — dynamic */}
            <div className="max-w-5xl mx-auto bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border",
                        currentPlan === "pro" || currentPlan === "agency"
                            ? "bg-[#B3FF00]/10 border-[#B3FF00]/30"
                            : currentPlan === "starter"
                                ? "bg-[#C5BAC4]/10 border-[#C5BAC4]/30"
                                : "bg-[#2A2F38] border-[#57707A]/40"
                    )}>
                        <BannerIcon className={cn("w-5 h-5", banner.iconColor)} />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-[#DEDCDC] font-bold font-display text-base">
                                {currentPlan ? banner.title : "Loading plan…"}
                            </h4>
                            {currentPlan && (
                                <span className={cn(
                                    "text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border",
                                    currentPlan === "pro" || currentPlan === "agency"
                                        ? "bg-[#B3FF00]/10 text-[#B3FF00] border-[#B3FF00]/20"
                                        : "bg-[#C5BAC4]/10 text-[#C5BAC4] border-[#C5BAC4]/20"
                                )}>Active</span>
                            )}
                        </div>
                        <p className="text-sm text-[#989DAA] mt-1 max-w-xl">{banner.desc}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[#57707A] text-sm font-medium bg-[#2A2F38] px-4 py-2 rounded-lg border border-[#57707A]/20 shrink-0">
                    <ShieldCheck className="w-4 h-4" /> Powered by Paystack
                </div>
            </div>

            {/* Billing cycle toggle */}
            <div className="flex justify-center pt-2">
                <div className="bg-[#191D23] p-1.5 rounded-full border border-[#57707A]/30 inline-flex shadow-inner">
                    {(["weekly", "monthly"] as const).map(cycle => (
                        <button
                            key={cycle}
                            onClick={() => setBillingCycle(cycle)}
                            className={cn(
                                "px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 capitalize",
                                billingCycle === cycle ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm" : "text-[#57707A] hover:text-[#DEDCDC]"
                            )}
                        >
                            {cycle} billing
                            {cycle === "monthly" && (
                                <span className="ml-2 text-[10px] bg-[#B3FF00]/20 text-[#B3FF00] px-1.5 py-0.5 rounded-full border border-[#B3FF00]/30">Save 20%</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 max-w-5xl mx-auto">
                {TIERS.map((tier) => {
                    const isCurrentPlan = currentPlan === tier.id;
                    const isPopular = tier.popular;
                    const displayPrice = billingCycle === "monthly" ? tier.priceMonthly : tier.priceWeekly;
                    const displayFeatures = billingCycle === "monthly" ? tier.features.monthly : tier.features.weekly;
                    const isFree = tier.id === "free";
                    const buttonLabel = getPlanLabel(currentPlan, tier.id);
                    const TierIcon = tier.icon;

                    const currentIdx = TIER_ORDER.indexOf(currentPlan ?? "free");
                    const tierIdx = TIER_ORDER.indexOf(tier.id);
                    const isDowngrade = tierIdx < currentIdx;

                    return (
                        <div
                            key={tier.id}
                            className={cn(
                                "relative flex flex-col bg-[#2A2F38] rounded-3xl border transition-all duration-300 overflow-hidden",
                                isCurrentPlan
                                    ? "border-[#B3FF00] shadow-[0_0_30px_rgba(179,255,0,0.1)]"
                                    : isPopular
                                        ? "border-[#C5BAC4] shadow-[0_10px_40px_rgba(197,186,196,0.08)] hover:-translate-y-1"
                                        : "border-[#57707A]/30 hover:border-[#57707A]/60 hover:-translate-y-1"
                            )}
                        >
                            {/* Top badge */}
                            {isCurrentPlan ? (
                                <div className="bg-[#B3FF00] text-[#191D23] text-[10px] font-bold uppercase tracking-wider text-center py-1.5">
                                    Current Plan
                                </div>
                            ) : isPopular && !isCurrentPlan ? (
                                <div className="bg-[#C5BAC4] text-[#191D23] text-[10px] font-bold uppercase tracking-wider text-center py-1.5">
                                    Most Popular
                                </div>
                            ) : (
                                <div className="py-1.5" />
                            )}

                            <div className="p-5 md:p-6 flex-1 flex flex-col">
                                {/* Plan name + icon */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center border shrink-0",
                                        isCurrentPlan ? "bg-[#B3FF00]/15 border-[#B3FF00]/30" :
                                        isPopular ? "bg-[#C5BAC4]/15 border-[#C5BAC4]/30" :
                                        "bg-[#191D23] border-[#57707A]/30"
                                    )}>
                                        <TierIcon size={15} className={isCurrentPlan ? "text-[#B3FF00]" : isPopular ? "text-[#C5BAC4]" : "text-[#57707A]"} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-[#DEDCDC] font-display leading-none">{tier.name}</h3>
                                        <p className="text-[11px] text-[#57707A] mt-0.5 leading-snug">{tier.description}</p>
                                    </div>
                                </div>

                                {/* Price */}
                                <div className="mb-5">
                                    <div className="flex items-baseline gap-0.5">
                                        {!isFree && <span className="text-lg font-bold text-[#57707A]">$</span>}
                                        <span className="text-4xl font-black text-[#DEDCDC] tracking-tight">
                                            {isFree ? "Free" : displayPrice}
                                        </span>
                                        {!isFree && (
                                            <span className="text-xs text-[#57707A] font-medium ml-0.5">
                                                /{billingCycle === "monthly" ? "mo" : "wk"}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Features */}
                                <ul className="space-y-3 mb-6 flex-1">
                                    {displayFeatures.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2.5">
                                            <CheckCircle2 size={13} className={cn(
                                                "mt-0.5 shrink-0",
                                                isCurrentPlan ? "text-[#B3FF00]" : isPopular ? "text-[#C5BAC4]" : "text-[#57707A]"
                                            )} />
                                            <span className="text-xs text-[#DEDCDC]/75 font-medium leading-snug">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA button */}
                                <Button
                                    onClick={() => !isCurrentPlan && handleUpgrade(tier.name)}
                                    disabled={loadingTier !== null || isCurrentPlan}
                                    className={cn(
                                        "w-full h-10 rounded-xl font-bold text-sm transition-all border-0",
                                        isCurrentPlan
                                            ? "bg-[#B3FF00]/10 text-[#B3FF00] cursor-default"
                                            : isDowngrade
                                                ? "bg-[#2A2F38] border border-[#57707A]/40 text-[#57707A] hover:text-[#DEDCDC] hover:border-[#57707A]/70"
                                                : isPopular
                                                    ? "bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-md shadow-[#C5BAC4]/20"
                                                    : isFree
                                                        ? "bg-[#2A2F38] text-[#57707A] cursor-default"
                                                        : "bg-[#191D23] border border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20"
                                    )}
                                >
                                    {loadingTier === tier.name ? (
                                        <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                                    ) : null}
                                    {buttonLabel}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Credit balance + top-up */}
            <div className="max-w-5xl mx-auto bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-[#B3FF00]/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-5 z-10 w-full md:w-auto">
                    <div className="w-14 h-14 rounded-2xl bg-[#2A2F38] border border-[#B3FF00]/30 flex items-center justify-center shadow-[0_0_15px_rgba(179,255,0,0.08)] shrink-0">
                        <Wallet className="w-7 h-7 text-[#B3FF00]" />
                    </div>
                    <div>
                        <p className="text-[#57707A] font-bold text-xs uppercase tracking-wider mb-1">AI Credit Balance</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
                                {creditBalance !== null ? creditBalance.toLocaleString() : "—"}
                            </span>
                            <span className="text-[#989DAA] font-medium text-sm">credits remaining</span>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-px h-px md:h-14 bg-[#57707A]/30 z-10" />

                <div className="flex items-center gap-4 z-10 w-full md:w-auto justify-between md:justify-end">
                    <div>
                        <h4 className="text-[#DEDCDC] font-bold font-display text-sm">Need more credits?</h4>
                        <p className="text-xs text-[#989DAA] mt-0.5">
                            <strong className="text-[#DEDCDC]">800 credits</strong> for <strong className="text-[#B3FF00]">$5.00</strong> — top up any time.
                        </p>
                    </div>
                    <Button
                        onClick={handleBuyCreditPack}
                        disabled={loadingPack}
                        className="border-none bg-[#B3FF00]/10 text-[#B3FF00] hover:bg-[#B3FF00]/20 rounded-xl font-bold h-10 px-5 whitespace-nowrap"
                    >
                        {loadingPack ? "Opening…" : "Buy Pack"}
                    </Button>
                </div>
            </div>

            <p className="text-center text-xs text-[#57707A] max-w-xl mx-auto">
                Payments are processed securely by <strong className="text-[#989DAA]">Paystack</strong>.
                Questions about your plan? Email <a href="mailto:info@blinkspot.io" className="text-[#C5BAC4] hover:underline">info@blinkspot.io</a>
            </p>
        </div>
    );
}
