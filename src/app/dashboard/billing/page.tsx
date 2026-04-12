"use client";

import { useState, useEffect } from "react";
import {
    CreditCard,
    Zap,
    Package,
    CheckCircle2,
    ArrowRight,
    Loader2,
    Sparkles,
    History,
    ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BalanceData {
    client_id: string;
    plan_tier: string;
    balance: number;
    lifetime_earned: number;
    lifetime_spent: number;
}

export default function BillingPage() {
    const [loading, setLoading] = useState(true);
    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

    useEffect(() => {
        async function fetchBillingInfo() {
            try {
                const res = await fetch("/api/credits/balance");
                if (res.ok) {
                    const data = await res.json();
                    setBalanceData(data);
                }
            } catch (error) {
                console.error("Failed to fetch balance:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchBillingInfo();
    }, []);

    const handleUpgrade = async (priceId: string, type: 'subscription' | 'topup') => {
        setCheckoutLoading(priceId);
        setTimeout(() => {
            alert(`Stripe Checkout Integration Coming Next! (ID: ${priceId})`);
            setCheckoutLoading(null);
        }, 1500);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
            </div>
        );
    }

    const currentTier = balanceData?.plan_tier || "starter";

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">

            {/* ─── PAGE HEADER ─── */}
            <div className="bg-[#2A2F38] border border-[#57707A]/30 rounded-2xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#C5BAC4]/5 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[#DEDCDC] font-display flex items-center gap-3">
                            <CreditCard className="h-6 w-6 text-[#C5BAC4]" /> Billing & Credits
                        </h1>
                        <p className="text-sm text-[#989DAA] mt-2 max-w-xl leading-relaxed">
                            Manage your subscription, purchase AI credits, and view your usage history.
                        </p>
                    </div>

                    {/* ACTIVE BALANCE CARD */}
                    <div className="bg-[#191D23] border border-[#57707A]/50 rounded-xl p-5 flex items-center gap-6 shadow-inner min-w-[300px]">
                        <div>
                            <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest mb-1">Available Credits</p>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-[#B3FF00] font-display leading-none">
                                    {balanceData?.balance?.toLocaleString() || 0}
                                </span>
                                <span className="text-sm text-[#989DAA] mb-1 font-medium">cr</span>
                            </div>
                        </div>
                        <div className="w-px h-12 bg-[#57707A]/30" />
                        <div>
                            <p className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest mb-1">Current Plan</p>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 text-[#C5BAC4] text-xs font-bold uppercase tracking-wider">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {currentTier}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* ─── LEFT COLUMN: SUBSCRIPTIONS (Spans 3 columns now) ─── */}
                <div className="lg:col-span-3 space-y-6">
                    <h2 className="text-lg font-bold text-[#DEDCDC] flex items-center gap-2">
                        <Package className="h-5 w-5 text-[#57707A]" /> Subscription Plans
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* STARTER PLAN */}
                        <div className={cn(
                            "relative bg-[#2A2F38] border rounded-2xl p-6 flex flex-col shadow-lg transition-all",
                            currentTier === "starter" ? "border-[#C5BAC4] shadow-[0_0_20px_rgba(197,186,196,0.1)]" : "border-[#57707A]/40 hover:border-[#C5BAC4]/30"
                        )}>
                            {currentTier === "starter" && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C5BAC4] text-[#191D23] text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                                    Current Plan
                                </div>
                            )}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-[#DEDCDC] font-display">Starter</h3>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="text-3xl font-bold text-white">$20</span>
                                    <span className="text-sm text-[#989DAA] font-medium">/month</span>
                                </div>
                                <p className="text-sm text-[#989DAA] mt-3 font-bold bg-[#191D23] w-fit px-3 py-1 rounded-lg border border-[#57707A]/30">
                                    6,000 Credits Monthly
                                </p>
                            </div>

                            <ul className="space-y-3 mb-8 flex-1">
                                {["1 Brand Workspace", "100 Auto-Posts / mo", "30-day Asset Storage", "Standard Video Rendering", "Blink Watermark Included"].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#DEDCDC]">
                                        <CheckCircle2 className="h-4 w-4 text-[#57707A] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <Button
                                onClick={() => handleUpgrade('price_starter', 'subscription')}
                                disabled={currentTier === "starter" || checkoutLoading === 'price_starter'}
                                className={cn(
                                    "w-full h-12 font-bold rounded-xl transition-all",
                                    currentTier === "starter"
                                        ? "bg-[#191D23] text-[#57707A] border border-[#57707A]/30"
                                        : "bg-[#191D23] hover:bg-[#57707A]/20 text-[#DEDCDC] border border-[#57707A]/40 shadow-sm"
                                )}
                            >
                                {checkoutLoading === 'price_starter' ? <Loader2 className="h-5 w-5 animate-spin" /> : currentTier === "starter" ? "Active" : "Downgrade"}
                            </Button>
                        </div>

                        {/* PRO PLAN */}
                        <div className={cn(
                            "relative bg-[#2A2F38] border rounded-2xl p-6 flex flex-col shadow-lg transition-all",
                            currentTier === "pro" ? "border-[#C5BAC4] shadow-[0_0_20px_rgba(197,186,196,0.1)]" : "border-[#57707A]/40 hover:border-[#C5BAC4]/50"
                        )}>
                            {currentTier === "pro" && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C5BAC4] text-[#191D23] text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                                    Current Plan
                                </div>
                            )}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-[#DEDCDC] font-display">Pro Plan</h3>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="text-3xl font-bold text-white">$49</span>
                                    <span className="text-sm text-[#989DAA] font-medium">/month</span>
                                </div>
                                <p className="text-sm text-[#C5BAC4] mt-3 font-bold bg-[#C5BAC4]/10 w-fit px-3 py-1 rounded-lg border border-[#C5BAC4]/20">
                                    18,000 Credits Monthly
                                </p>
                            </div>

                            <ul className="space-y-3 mb-8 flex-1">
                                {["Up to 3 Brand Workspaces", "300 Auto-Posts / mo", "6-month Asset Storage", "Priority Video Rendering", "Remove Blink Watermarks"].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#DEDCDC]">
                                        <CheckCircle2 className="h-4 w-4 text-[#B3FF00] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <Button
                                onClick={() => handleUpgrade('price_pro', 'subscription')}
                                disabled={currentTier === "pro" || checkoutLoading === 'price_pro'}
                                className={cn(
                                    "w-full h-12 font-bold rounded-xl transition-all",
                                    currentTier === "pro"
                                        ? "bg-[#191D23] text-[#57707A] border border-[#57707A]/30"
                                        : "bg-[#C5BAC4] hover:bg-white text-[#191D23] shadow-lg shadow-[#C5BAC4]/10"
                                )}
                            >
                                {checkoutLoading === 'price_pro' ? <Loader2 className="h-5 w-5 animate-spin" /> : currentTier === "pro" ? "Active" : "Upgrade to Pro"}
                            </Button>
                        </div>

                        {/* AGENCY PLAN */}
                        <div className={cn(
                            "relative bg-gradient-to-b from-[#2A2F38] to-[#191D23] border rounded-2xl p-6 flex flex-col shadow-lg transition-all",
                            currentTier === "agency" || currentTier === "admin" ? "border-[#B3FF00] shadow-[0_0_20px_rgba(179,255,0,0.1)]" : "border-[#57707A]/40 hover:border-[#B3FF00]/50"
                        )}>
                            {(currentTier === "agency" || currentTier === "admin") && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#B3FF00] text-[#191D23] text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                                    {currentTier === "admin" ? "Admin Override" : "Current Plan"}
                                </div>
                            )}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-[#DEDCDC] font-display flex items-center gap-2">
                                    Agency <Sparkles className="h-4 w-4 text-[#B3FF00]" />
                                </h3>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="text-3xl font-bold text-white">$99</span>
                                    <span className="text-sm text-[#989DAA] font-medium">/month</span>
                                </div>
                                <p className="text-sm text-[#B3FF00] mt-3 font-bold bg-[#B3FF00]/10 w-fit px-3 py-1 rounded-lg border border-[#B3FF00]/20">
                                    40,000 Credits Monthly
                                </p>
                            </div>

                            <ul className="space-y-3 mb-8 flex-1">
                                {["Unlimited Brand Workspaces", "Unlimited Auto-Posts", "Permanent Asset Storage", "Highest Priority Rendering", "Custom AI Voice Cloning", "API Access (Coming Soon)"].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#DEDCDC]">
                                        <CheckCircle2 className="h-4 w-4 text-[#B3FF00] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <Button
                                onClick={() => handleUpgrade('price_agency', 'subscription')}
                                disabled={currentTier === "agency" || currentTier === "admin" || checkoutLoading === 'price_agency'}
                                className={cn(
                                    "w-full h-12 font-bold rounded-xl transition-all border-none",
                                    currentTier === "agency" || currentTier === "admin"
                                        ? "bg-[#191D23] text-[#57707A] border border-[#57707A]/30"
                                        : "bg-gradient-to-r from-[#B3FF00]/90 to-[#B3FF00] hover:from-[#B3FF00] hover:to-[#B3FF00] text-[#191D23] shadow-lg shadow-[#B3FF00]/20"
                                )}
                            >
                                {checkoutLoading === 'price_agency' ? <Loader2 className="h-5 w-5 animate-spin text-[#191D23]" /> : (currentTier === "agency" || currentTier === "admin") ? "Active" : "Upgrade to Agency"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ─── RIGHT COLUMN: TOP UPS & HISTORY (Spans 1 column) ─── */}
                <div className="space-y-6">
                    <h2 className="text-lg font-bold text-[#DEDCDC] flex items-center gap-2">
                        <Zap className="h-5 w-5 text-[#57707A]" /> Credit Top-Ups
                    </h2>

                    <div className="bg-[#2A2F38] border border-[#57707A]/40 rounded-2xl p-5 shadow-lg space-y-4">
                        <p className="text-xs text-[#989DAA] leading-relaxed">
                            Running low on credits this month? Buy a one-time pack. Top-up credits never expire.
                        </p>

                        <button
                            onClick={() => handleUpgrade('price_topup_small', 'topup')}
                            disabled={checkoutLoading !== null}
                            className="w-full flex items-center justify-between p-4 rounded-xl border border-[#57707A]/40 bg-[#191D23] hover:border-[#C5BAC4]/60 hover:bg-[#57707A]/10 transition-all group"
                        >
                            <div className="text-left">
                                <p className="text-sm font-bold text-[#DEDCDC]">Small Pack</p>
                                <p className="text-xs font-medium text-[#C5BAC4] mt-0.5">7,000 Credits</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-white">$10</span>
                                <ArrowRight className="h-4 w-4 text-[#57707A] group-hover:text-[#C5BAC4] transition-colors" />
                            </div>
                        </button>

                        <button
                            onClick={() => handleUpgrade('price_topup_large', 'topup')}
                            disabled={checkoutLoading !== null}
                            className="w-full flex items-center justify-between p-4 rounded-xl border border-[#57707A]/40 bg-[#191D23] hover:border-[#B3FF00]/60 hover:bg-[#B3FF00]/5 transition-all group"
                        >
                            <div className="text-left">
                                <p className="text-sm font-bold text-[#DEDCDC]">Large Pack</p>
                                <p className="text-xs font-medium text-[#B3FF00] mt-0.5">15,000 Credits</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-white">$20</span>
                                <ArrowRight className="h-4 w-4 text-[#57707A] group-hover:text-[#B3FF00] transition-colors" />
                            </div>
                        </button>
                    </div>

                    <div className="bg-[#191D23]/50 border border-[#57707A]/20 rounded-2xl p-5">
                        <h3 className="text-sm font-bold text-[#DEDCDC] flex items-center gap-2 mb-4">
                            <History className="h-4 w-4 text-[#57707A]" /> Quick Stats
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-[#989DAA] font-medium">Lifetime Earned</span>
                                <span className="text-[#DEDCDC] font-bold">{balanceData?.lifetime_earned?.toLocaleString() || 0} cr</span>
                            </div>
                            <div className="flex justify-between items-center text-xs border-t border-[#57707A]/20 pt-3">
                                <span className="text-[#989DAA] font-medium">Lifetime Spent</span>
                                <span className="text-[#DEDCDC] font-bold">{balanceData?.lifetime_spent?.toLocaleString() || 0} cr</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}