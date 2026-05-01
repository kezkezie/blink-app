"use client";

import { useState } from "react";
import { CheckCircle2, Zap, Briefcase, Film, HardDrive, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClient } from "@/hooks/useClient";
import { cn } from "@/lib/utils";

const TIERS = [
    {
        name: "Free",
        price: "0",
        description: "Perfect for testing the waters and exploring the AI.",
        features: [
            "1 Brand Workspace",
            "5 Posts per month",
            "100 AI Credits",
            "7-day Asset Storage",
            "Standard Image Gen",
        ],
        buttonText: "Current Plan",
        popular: false,
    },
    {
        name: "Starter",
        price: "25",
        description: "Everything a small business needs to automate their socials.",
        features: [
            "2 Brand Workspaces",
            "30 Posts per month",
            "1,500 AI Credits",
            "30-day Asset Storage",
            "Kling 3.0 Video Engine",
        ],
        buttonText: "Upgrade to Starter",
        popular: false,
    },
    {
        name: "Pro",
        price: "44",
        description: "For creators and multi-brand managers who need more power.",
        features: [
            "6 Brand Workspaces",
            "60 Posts per month",
            "3,000 AI Credits",
            "60-day Asset Storage",
            "Priority GPU Rendering",
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
            "Custom AI Brain Training",
        ],
        buttonText: "Upgrade to Agency",
        popular: false,
    }
];

export default function BillingPage() {
    const { clientId } = useClient();
    const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
    const [loadingTier, setLoadingTier] = useState<string | null>(null);

    const handleUpgrade = async (tierName: string) => {
        if (tierName === "Free") return;

        setLoadingTier(tierName);
        // TODO: Stripe Checkout Integration goes here
        setTimeout(() => {
            alert(`Stripe Checkout for ${tierName} would open here!`);
            setLoadingTier(null);
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

                {/* BILLING TOGGLE */}
                <div className="flex items-center justify-center mt-8">
                    <div className="bg-[#2A2F38] p-1 rounded-xl border border-[#57707A]/30 inline-flex">
                        <button
                            onClick={() => setBillingCycle("monthly")}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                                billingCycle === "monthly"
                                    ? "bg-[#191D23] text-[#DEDCDC] shadow-sm"
                                    : "text-[#57707A] hover:text-[#989DAA]"
                            )}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBillingCycle("yearly")}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                                billingCycle === "yearly"
                                    ? "bg-[#191D23] text-[#DEDCDC] shadow-sm"
                                    : "text-[#57707A] hover:text-[#989DAA]"
                            )}
                        >
                            Yearly <span className="text-[10px] bg-[#B3FF00]/20 text-[#B3FF00] px-2 py-0.5 rounded-full">Save 20%</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* PRICING CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-8">
                {TIERS.map((tier) => {
                    const isPopular = tier.popular;
                    const displayPrice = billingCycle === "yearly" && tier.price !== "0"
                        ? Math.floor(parseInt(tier.price) * 0.8)
                        : tier.price;

                    return (
                        <div
                            key={tier.name}
                            className={cn(
                                "relative flex flex-col bg-[#2A2F38] rounded-3xl border transition-all duration-300 hover:-translate-y-1 shadow-xl overflow-hidden",
                                isPopular ? "border-[#C5BAC4] shadow-[0_10px_40px_rgba(197,186,196,0.1)]" : "border-[#57707A]/30 hover:border-[#57707A]/60"
                            )}
                        >
                            {isPopular && (
                                <div className="bg-[#C5BAC4] text-[#191D23] text-[10px] font-bold uppercase tracking-wider text-center py-1.5 shadow-sm">
                                    Most Popular
                                </div>
                            )}

                            <div className="p-6 md:p-8 flex-1 flex flex-col">
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-[#DEDCDC] font-display mb-2">{tier.name}</h3>
                                    <p className="text-xs text-[#989DAA] h-10">{tier.description}</p>
                                </div>

                                <div className="mb-8">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-bold text-[#57707A]">$</span>
                                        <span className="text-5xl font-bold text-[#DEDCDC] tracking-tight">{displayPrice}</span>
                                        <span className="text-sm text-[#57707A] font-medium">/mo</span>
                                    </div>
                                    {billingCycle === "yearly" && tier.price !== "0" && (
                                        <p className="text-[10px] text-[#B3FF00] font-bold mt-2 uppercase tracking-wide">Billed annually</p>
                                    )}
                                </div>

                                <ul className="space-y-4 mb-8 flex-1">
                                    {tier.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className="mt-0.5 w-4 h-4 rounded-full bg-[#191D23] border border-[#57707A]/50 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className={cn("w-3 h-3", isPopular ? "text-[#C5BAC4]" : "text-[#57707A]")} />
                                            </div>
                                            <span className="text-sm text-[#DEDCDC]/80 font-medium">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    onClick={() => handleUpgrade(tier.name)}
                                    disabled={tier.name === "Free" || loadingTier !== null}
                                    variant={isPopular ? "default" : "outline"}
                                    className={cn(
                                        "w-full h-12 rounded-xl font-bold transition-all",
                                        isPopular
                                            ? "bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/20 border-none"
                                            : "bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white"
                                    )}
                                >
                                    {loadingTier === tier.name ? (
                                        <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                                    ) : null}
                                    {tier.buttonText}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* QUICK STATS / REMINDER */}
            <div className="mt-12 bg-[#191D23] border border-[#57707A]/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#2A2F38] border border-[#57707A]/40 flex items-center justify-center shadow-sm">
                        <Zap className="w-6 h-6 text-[#B3FF00]" />
                    </div>
                    <div>
                        <h4 className="text-[#DEDCDC] font-bold font-display">Need more credits?</h4>
                        <p className="text-xs text-[#989DAA]">You can always purchase one-time credit packs from your dashboard.</p>
                    </div>
                </div>
                <Button variant="outline" className="border-[#B3FF00]/30 text-[#B3FF00] hover:bg-[#B3FF00]/10 bg-transparent rounded-xl font-bold h-10 px-6">
                    Buy Credit Pack
                </Button>
            </div>

        </div>
    );
}