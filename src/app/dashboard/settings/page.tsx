'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
    Loader2,
    Save,
    CheckCircle,
    ExternalLink,
    Crown,
    Bell,
    Mail,
    MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const CLIENT_ID = '1cc01f92-090a-43d2-b5db-15b1791fe131'

const industries = [
    'Food & Beverage',
    'Retail',
    'Beauty & Wellness',
    'Health & Fitness',
    'Technology',
    'Education',
    'Real Estate',
    'Other',
]

const platformConfig: Record<string, { label: string; emoji: string; color: string }> = {
    instagram: { label: 'Instagram', emoji: '📸', color: 'bg-gradient-to-br from-purple-500 to-pink-500' },
    tiktok: { label: 'TikTok', emoji: '🎵', color: 'bg-black' },
    facebook: { label: 'Facebook', emoji: '📘', color: 'bg-blue-600' },
    twitter: { label: 'Twitter / X', emoji: '🐦', color: 'bg-gray-900' },
    linkedin: { label: 'LinkedIn', emoji: '💼', color: 'bg-blue-700' },
    youtube: { label: 'YouTube', emoji: '▶️', color: 'bg-red-600' },
}

const planTiers: Record<string, { name: string; price: string; color: string }> = {
    starter: { name: 'Starter', price: 'KES 5,000', color: 'text-gray-600' },
    pro: { name: 'Growth', price: 'KES 12,000', color: 'text-blink-primary' },
    agency: { name: 'Business', price: 'KES 25,000', color: 'text-amber-600' },
    enterprise: { name: 'Enterprise', price: 'Custom', color: 'text-purple-600' },
    custom: { name: 'Custom', price: 'Custom', color: 'text-gray-600' },
}

interface ClientData {
    company_name: string
    website_url: string
    industry: string
    plan_tier: string
    contact_email: string
    approval_channel: string
}

interface SocialAccount {
    id: string
    platform: string
    account_name: string | null
    is_active: boolean
    connected_at: string
}

export default function SettingsPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const [client, setClient] = useState<ClientData>({
        company_name: '',
        website_url: '',
        industry: '',
        plan_tier: 'starter',
        contact_email: '',
        approval_channel: 'telegram',
    })
    const [socials, setSocials] = useState<SocialAccount[]>([])

    // Notification prefs (local state — would store in a prefs table in production)
    const [telegramAlerts, setTelegramAlerts] = useState(true)
    const [emailReports, setEmailReports] = useState(false)

    useEffect(() => {
        async function load() {
            const [clientRes, socialsRes] = await Promise.all([
                supabase
                    .from('clients')
                    .select('company_name, website_url, industry, plan_tier, contact_email, approval_channel')
                    .eq('id', CLIENT_ID)
                    .single(),
                supabase
                    .from('social_accounts')
                    .select('*')
                    .eq('client_id', CLIENT_ID)
                    .order('connected_at', { ascending: true }),
            ])

            if (clientRes.data) {
                const d = clientRes.data as ClientData
                setClient({
                    company_name: d.company_name || '',
                    website_url: d.website_url || '',
                    industry: d.industry || '',
                    plan_tier: d.plan_tier || 'starter',
                    contact_email: d.contact_email || '',
                    approval_channel: d.approval_channel || 'telegram',
                })
            }
            if (socialsRes.data) setSocials(socialsRes.data as SocialAccount[])
            setLoading(false)
        }
        load()
    }, [])

    async function handleSave() {
        setSaving(true)
        setSaved(false)

        await supabase
            .from('clients')
            .update({
                company_name: client.company_name,
                website_url: client.website_url,
                industry: client.industry,
            })
            .eq('id', CLIENT_ID)

        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    const connectedPlatforms = socials.filter((s) => s.is_active).map((s) => s.platform)
    const plan = planTiers[client.plan_tier] || planTiers.starter

    return (
        <div className="space-y-6 max-w-3xl">
            {/* ─── Section 1: Business Info ─── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <div>
                    <h3 className="text-base font-semibold text-blink-dark">
                        Business Information
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Update your company details
                    </p>
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
                        <Select
                            value={client.industry}
                            onValueChange={(v) =>
                                setClient((p) => ({ ...p, industry: v }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                            <SelectContent>
                                {industries.map((ind) => (
                                    <SelectItem key={ind} value={ind}>
                                        {ind}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                        )}
                        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                    </Button>
                    {saved && (
                        <span className="text-sm text-emerald-600">
                            Changes saved successfully
                        </span>
                    )}
                </div>
            </div>

            {/* ─── Section 2: Social Connections ─── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                    <h3 className="text-base font-semibold text-blink-dark">
                        Social Connections
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Manage your connected social media accounts
                    </p>
                </div>

                <div className="space-y-3">
                    {Object.entries(platformConfig).map(([key, cfg]) => {
                        const account = socials.find((s) => s.platform === key && s.is_active)
                        const isConnected = !!account

                        return (
                            <div
                                key={key}
                                className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            'h-9 w-9 rounded-lg flex items-center justify-center text-white text-base',
                                            cfg.color
                                        )}
                                    >
                                        {cfg.emoji}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-blink-dark">
                                            {cfg.label}
                                        </p>
                                        {isConnected && account.account_name && (
                                            <p className="text-xs text-gray-400">
                                                @{account.account_name}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {isConnected ? (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            Connected
                                        </span>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs gap-1 h-8"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        Connect
                                    </Button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ─── Section 3: Notifications ─── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                    <h3 className="text-base font-semibold text-blink-dark">
                        Notification Preferences
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Choose how you want to be notified
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                <MessageCircle className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-blink-dark">
                                    Telegram Approval Alerts
                                </p>
                                <p className="text-xs text-gray-400">
                                    Get notified when content needs approval
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={telegramAlerts}
                            onCheckedChange={setTelegramAlerts}
                        />
                    </div>

                    <div className="border-t border-gray-100" />

                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                <Mail className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-blink-dark">
                                    Email Weekly Reports
                                </p>
                                <p className="text-xs text-gray-400">
                                    Receive a summary of your analytics every Monday
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={emailReports}
                            onCheckedChange={setEmailReports}
                        />
                    </div>
                </div>
            </div>

            {/* ─── Section 4: Plan Details ─── */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <div>
                    <h3 className="text-base font-semibold text-blink-dark">
                        Your Plan
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Manage your subscription
                    </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blink-primary/5 to-blink-secondary/5 border border-blink-primary/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-blink-primary/10">
                            <Crown className={cn('h-5 w-5', plan.color)} />
                        </div>
                        <div>
                            <p className={cn('text-lg font-bold', plan.color)}>
                                {plan.name}
                            </p>
                            <p className="text-sm text-gray-500">
                                {plan.price}/month
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        className="gap-1.5 border-blink-primary/30 text-blink-primary hover:bg-blink-primary/5"
                    >
                        <Crown className="h-4 w-4" />
                        Upgrade Plan
                    </Button>
                </div>

                <div className="text-xs text-gray-400 px-1">
                    Contact us at{' '}
                    <a
                        href="mailto:hello@blink.africa"
                        className="text-blink-primary hover:underline"
                    >
                        hello@blink.africa
                    </a>{' '}
                    for custom plans or enterprise pricing.
                </div>
            </div>
        </div>
    )
}
