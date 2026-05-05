"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const TIERS = [
    {
        name: "Starter",
        price: "25",
        description: "Everything a small business needs to automate their socials.",
        features: [
            "2 Brand Workspaces",
            "30 Posts per month",
            "1,500 AI Credits",
            "30-day Asset Storage",
            "Image & Video AI Generation",
            "Refine AI Brain",
        ],
        buttonText: "Upgrade to Starter",
        popular: false,
    },
    {
        name: "Pro",
        price: "49",
        description: "For creators and multi-brand managers who need more power.",
        features: [
            "6 Brand Workspaces",
            "60 Posts per month",
            "3,000 AI Credits",
            "60-day Asset Storage",
            "Image & Video AI Generation",
            "Refine AI Brain",
        ],
        buttonText: "Upgrade to Pro",
        popular: true,
    },
    {
        name: "Agency",
        price: "99",
        description: "High-volume generation for agencies and enterprise teams.",
        features: [
            "10 Brand Workspaces",
            "200 Posts per month",
            "6,000 AI Credits",
            "364-day Asset Storage",
            "Image & Video AI Generation",
            "Refine AI Brain",
        ],
        buttonText: "Upgrade to Agency",
        popular: false,
    }
];

export default function BillingPage() {
    const { clientId } = useClient();
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const [loadingPack, setLoadingPack] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);

    // ✨ Fetch the user's current plan on mount
    useEffect(() => {
        async function fetchUserPlan() {
            if (!clientId) return;
            const { data } = await supabase
                .from('clients')
                .select('plan_tier')
                .eq('id', clientId)
                .single();

            if (data?.plan_tier) {
                setCurrentPlan(data.plan_tier.toLowerCase());
            } else {
                setCurrentPlan('starter'); // Fallback
            }
        }
        fetchUserPlan();
    }, [clientId]);

    const handleUpgrade = async (tierName: string) => {
        setLoadingTier(tierName);
        // TODO: Stripe Subscription Checkout Integration goes here
        setTimeout(() => {
            alert(`Stripe Checkout for the ${tierName} Plan would open here!`);
            setLoadingTier(null);
        }, 1500);
    };

    const handleBuyCreditPack = async () => {
        setLoadingPack(true);
        // TODO: Stripe One-Time Payment Checkout Integration goes here
        setTimeout(() => {
            alert(`Stripe Checkout for $5 Credit Pack would open here!`);
            setLoadingPack(false);
        }, 1500);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 pb-20">

            {/* HEADER */}
            <div className="text-center space-y-4">
                <h1 className="text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
                    Simple, transparent pricing
                </h1>
                <p className="text-[#989DAA] max-w-2xl mx-auto text-sm md:text-base">
                    Unlock the full power of the AI Director, expand your brand workspaces, and scale your social media automation.
                </p>
            </div>

            {/* PRICING CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 max-w-5xl mx-auto">
                {TIERS.map((tier) => {
                    const isPopular = tier.popular;
                    const isCurrentPlan = currentPlan === tier.name.toLowerCase();

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
                                        <span className="text-5xl font-bold text-[#DEDCDC] tracking-tight">{tier.price}</span>
                                        <span className="text-sm text-[#57707A] font-medium">/mo</span>
                                    </div>
                                </div>

                                <ul className="space-y-4 mb-8 flex-1">
                                    {tier.features.map((feature, i) => (
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
                                    disabled={loadingTier !== null || isCurrentPlan || currentPlan === null}
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

            {/* QUICK STATS / ONE-TIME CREDIT PACK */}
            <div className="mt-12 max-w-5xl mx-auto bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#2A2F38] border border-[#57707A]/40 flex items-center justify-center shadow-sm shrink-0">
                        <Zap className="w-6 h-6 text-[#B3FF00]" />
                    </div>
                    <div>
                        <h4 className="text-[#DEDCDC] font-bold font-display text-lg">Need more credits?</h4>
                        <p className="text-sm text-[#989DAA] mt-1">
                            Running low on AI power? Instantly add <strong className="text-[#DEDCDC]">5,000 Credits</strong> to your workspace for just <strong className="text-[#B3FF00]">$5.00</strong>.
                        </p>
                    </div>
                </div>
                <Button
                    onClick={handleBuyCreditPack}
                    disabled={loadingPack}
                    className="border-none bg-[#B3FF00]/10 text-[#B3FF00] hover:bg-[#B3FF00]/20 rounded-xl font-bold h-12 px-8 whitespace-nowrap transition-colors"
                >
                    {loadingPack ? "Processing..." : "Buy for $5.00"}
                </Button>
            </div>

        </div>
    );
}