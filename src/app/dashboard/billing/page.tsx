"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Zap, Sparkles, Wallet, Video, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const TIERS = [
    {
        name: "Starter",
        priceMonthly: "25",
        priceWeekly: "7",
        description: "Everything a small business needs to automate their socials.",
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
            ]
        },
        buttonText: "Upgrade to Starter",
        popular: false,
    },
    {
        name: "Pro",
        priceMonthly: "49",
        priceWeekly: "14",
        description: "For creators and multi-brand managers who need more power.",
        features: {
            monthly: [
                "6 Brand Workspaces",
                "60 Posts per month",
                "3,000 AI Credits",
                "60-day Asset Storage",
                "Image & Video AI Generation",
            ],
            weekly: [
                "6 Brand Workspaces",
                "15 Posts per week",
                "750 AI Credits",
                "14-day Asset Storage",
                "Image & Video AI Generation",
            ]
        },
        buttonText: "Upgrade to Pro",
        popular: true,
    },
    {
        name: "Agency",
        priceMonthly: "99",
        priceWeekly: "29",
        description: "High-volume generation for agencies and enterprise teams.",
        features: {
            monthly: [
                "10 Brand Workspaces",
                "200 Posts per month",
                "6,000 AI Credits",
                "364-day Asset Storage",
                "Image & Video AI Generation",
            ],
            weekly: [
                "10 Brand Workspaces",
                "50 Posts per week",
                "1,500 AI Credits",
                "30-day Asset Storage",
                "Image & Video AI Generation",
            ]
        },
        buttonText: "Upgrade to Agency",
        popular: false,
    }
];

export default function BillingPage() {
    const { clientId } = useClient();
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const [loadingPack, setLoadingPack] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);
    const [creditBalance, setCreditBalance] = useState<number | null>(null);
    const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly">("monthly");

    // Fetch Plan & Credits
    useEffect(() => {
        async function fetchBillingData() {
            if (!clientId) return;
            const { data: clientData } = await supabase.from('clients').select('plan_tier').eq('id', clientId).single();
            if (clientData?.plan_tier) setCurrentPlan(clientData.plan_tier.toLowerCase());
            else setCurrentPlan('free');

            const { data: creditData } = await supabase.from('credit_balances').select('balance').eq('client_id', clientId).single();
            if (creditData) setCreditBalance(creditData.balance);
        }
        fetchBillingData();
    }, [clientId]);

    const handleUpgrade = async (tierName: string) => {
        setLoadingTier(tierName);
        setTimeout(() => {
            alert(`Stripe Checkout for ${tierName} (${billingCycle}) would open here!`);
            setLoadingTier(null);
        }, 1500);
    };

    const handleBuyCreditPack = async () => {
        setLoadingPack(true);
        setTimeout(() => {
            alert(`Stripe Checkout for $5 Credit Pack would open here!`);
            setLoadingPack(false);
        }, 1500);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 pb-20">

            {/* HEADER */}
            <div className="text-center space-y-4">
                <h1 className="text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
                    Simple, transparent pricing
                </h1>
                <p className="text-[#989DAA] max-w-2xl mx-auto text-sm md:text-base">
                    Unlock the full power of the AI Director, expand your brand workspaces, and scale your social media automation.
                </p>
            </div>

            {/* TOP BANNER: FREE TIER */}
            <div className="max-w-5xl mx-auto bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#2A2F38] border border-[#57707A]/40 flex items-center justify-center shrink-0">
                        <Video className="w-6 h-6 text-[#57707A]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-[#DEDCDC] font-bold font-display text-lg">Free Tier Active</h4>
                            {currentPlan === 'free' && (
                                <span className="bg-[#B3FF00]/10 text-[#B3FF00] text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-[#B3FF00]/20">Current Plan</span>
                            )}
                        </div>
                        <p className="text-sm text-[#989DAA] mt-1">
                            You currently have access to the <strong className="text-[#DEDCDC]">Base Video Editor</strong>. No brand workspaces or automated posting included.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[#57707A] text-sm font-medium bg-[#2A2F38] px-4 py-2 rounded-lg border border-[#57707A]/20">
                    <ShieldCheck className="w-4 h-4" /> No credit card required
                </div>
            </div>

            {/* BILLING TOGGLE */}
            <div className="flex justify-center pt-4">
                <div className="bg-[#191D23] p-1.5 rounded-full border border-[#57707A]/30 inline-flex shadow-inner">
                    <button
                        onClick={() => setBillingCycle("weekly")}
                        className={cn(
                            "px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-200",
                            billingCycle === "weekly" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm" : "text-[#57707A] hover:text-[#DEDCDC]"
                        )}
                    >
                        Weekly Billing
                    </button>
                    <button
                        onClick={() => setBillingCycle("monthly")}
                        className={cn(
                            "px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-200",
                            billingCycle === "monthly" ? "bg-[#2A2F38] text-[#DEDCDC] shadow-sm" : "text-[#57707A] hover:text-[#DEDCDC]"
                        )}
                    >
                        Monthly Billing
                        <span className="ml-2 text-[10px] bg-[#B3FF00]/20 text-[#B3FF00] px-1.5 py-0.5 rounded-full border border-[#B3FF00]/30">-20%</span>
                    </button>
                </div>
            </div>

            {/* PRICING CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {TIERS.map((tier) => {
                    const isPopular = tier.popular;
                    const isCurrentPlan = currentPlan === tier.name.toLowerCase();
                    const displayPrice = billingCycle === "monthly" ? tier.priceMonthly : tier.priceWeekly;
                    // 🔥 Magic happens here: grabbing the right feature list!
                    const displayFeatures = billingCycle === "monthly" ? tier.features.monthly : tier.features.weekly;

                    return (
                        <div
                            key={tier.name}
                            className={cn(
                                "relative flex flex-col bg-[#2A2F38] rounded-3xl border transition-all duration-300 hover:-translate-y-1 shadow-xl overflow-hidden",
                                isCurrentPlan ? "border-[#B3FF00] shadow-[0_0_30px_rgba(179,255,0,0.1)]" :
                                    isPopular ? "border-[#C5BAC4] shadow-[0_10px_40px_rgba(197,186,196,0.1)]" : "border-[#57707A]/30 hover:border-[#57707A]/60"
                            )}
                        >
                            {isCurrentPlan ? (
                                <div className="bg-[#B3FF00] text-[#191D23] text-[10px] font-bold uppercase tracking-wider text-center py-1.5 shadow-sm">
                                    Current Plan
                                </div>
                            ) : isPopular ? (
                                <div className="bg-[#C5BAC4] text-[#191D23] text-[10px] font-bold uppercase tracking-wider text-center py-1.5 shadow-sm">
                                    Most Popular
                                </div>
                            ) : null}

                            <div className="p-6 md:p-8 flex-1 flex flex-col">
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-[#DEDCDC] font-display mb-2">{tier.name}</h3>
                                    <p className="text-xs text-[#989DAA] h-10">{tier.description}</p>
                                </div>

                                <div className="mb-8">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-bold text-[#57707A]">$</span>
                                        <span className="text-5xl font-bold text-[#DEDCDC] tracking-tight">{displayPrice}</span>
                                        <span className="text-sm text-[#57707A] font-medium">/{billingCycle === "monthly" ? "mo" : "wk"}</span>
                                    </div>
                                </div>

                                <ul className="space-y-4 mb-8 flex-1">
                                    {displayFeatures.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className="mt-0.5 w-4 h-4 rounded-full bg-[#191D23] border border-[#57707A]/50 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className={cn("w-3 h-3", isCurrentPlan ? "text-[#B3FF00]" : isPopular ? "text-[#C5BAC4]" : "text-[#57707A]")} />
                                            </div>
                                            <span className="text-sm text-[#DEDCDC]/80 font-medium">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    onClick={() => handleUpgrade(tier.name)}
                                    disabled={loadingTier !== null || isCurrentPlan}
                                    variant={isCurrentPlan ? "outline" : isPopular ? "default" : "outline"}
                                    className={cn(
                                        "w-full h-12 rounded-xl font-bold transition-all",
                                        isCurrentPlan
                                            ? "bg-[#B3FF00]/10 border-[#B3FF00]/50 text-[#B3FF00] cursor-default opacity-100"
                                            : isPopular
                                                ? "bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/20 border-none"
                                                : "bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white"
                                    )}
                                >
                                    {loadingTier === tier.name ? (
                                        <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                                    ) : null}
                                    {isCurrentPlan ? "Active Plan" : tier.buttonText}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* BOTTOM BANNER: CREDIT PACK */}
            <div className="max-w-5xl mx-auto bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-[#B3FF00]/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-6 z-10 w-full md:w-auto">
                    <div className="w-16 h-16 rounded-2xl bg-[#2A2F38] border border-[#B3FF00]/30 flex items-center justify-center shadow-[0_0_15px_rgba(179,255,0,0.1)] shrink-0">
                        <Wallet className="w-8 h-8 text-[#B3FF00]" />
                    </div>
                    <div>
                        <h4 className="text-[#57707A] font-bold text-xs uppercase tracking-wider mb-1">Available Balance</h4>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
                                {creditBalance !== null ? creditBalance.toLocaleString() : "..."}
                            </span>
                            <span className="text-[#989DAA] font-medium text-sm">Credits</span>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-px h-px md:h-16 bg-[#57707A]/30 z-10" />

                <div className="flex items-center gap-4 z-10 w-full md:w-auto justify-between md:justify-end">
                    <div>
                        <h4 className="text-[#DEDCDC] font-bold font-display text-base">Running low?</h4>
                        <p className="text-xs text-[#989DAA] mt-0.5">
                            Add <strong className="text-[#DEDCDC]">5,000 Credits</strong> for <strong className="text-[#B3FF00]">$5.00</strong>.
                        </p>
                    </div>
                    <Button
                        onClick={handleBuyCreditPack}
                        disabled={loadingPack}
                        className="border-none bg-[#B3FF00]/10 text-[#B3FF00] hover:bg-[#B3FF00]/20 rounded-xl font-bold h-11 px-6 whitespace-nowrap transition-colors"
                    >
                        {loadingPack ? "Processing..." : "Buy Pack"}
                    </Button>
                </div>
            </div>

        </div>
    );
}