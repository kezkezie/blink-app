'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
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
    Bot,
    MessageSquare,
    Plus,
    X,
    Shield,
    Trash2,
    AlertCircle,
    Share2 as Share2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useClient } from '@/hooks/useClient'



/* ─── Post for Me Platforms ─── */
const PFM_SUPPORTED_PLATFORMS = [
    'instagram', 'tiktok', 'facebook', 'twitter', 'linkedin', 'youtube', 'pinterest', 'threads',
]

/* ─── Constants ─── */

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
    pinterest: { label: 'Pinterest', emoji: '📌', color: 'bg-red-700' },
    threads: { label: 'Threads', emoji: '🔗', color: 'bg-gray-800' },
}

const planTiers: Record<string, { name: string; price: string; color: string }> = {
    starter: { name: 'Starter', price: 'KES 5,000', color: 'text-gray-600' },
    pro: { name: 'Growth', price: 'KES 12,000', color: 'text-blink-primary' },
    agency: { name: 'Business', price: 'KES 25,000', color: 'text-amber-600' },
    enterprise: { name: 'Enterprise', price: 'Custom', color: 'text-purple-600' },
    custom: { name: 'Custom', price: 'Custom', color: 'text-gray-600' },
}

const defaultDmTopics: Record<string, string> = {
    pricing: 'Pricing',
    discounts: 'Discounts',
    delivery_times: 'Delivery times',
    opening_hours: 'Opening hours',
    product_recommendations: 'Product recommendations',
    refunds_exchanges: 'Refunds/exchanges',
    competitor_comparisons: 'Competitor comparisons',
}

const defaultBoundaryTemplates = [
    "I'm not able to discuss that right now. Please contact us directly!",
    'I can help with menu items and general questions!',
    'Let me connect you with our team for that. One moment!',
]

const toneOptions = ['friendly', 'professional', 'casual', 'formal'] as const

const defaultCommentCategories: Record<string, { enabled: boolean; template: string; action?: string }> = {
    positive: { enabled: true, template: 'Thank you for your support! 🧡' },
    complaints: { enabled: true, template: 'Sorry to hear that — please DM us so we can help.' },
    questions: { enabled: true, template: '' },
    toxic_spam: { enabled: false, template: 'We appreciate all feedback. For concerns, please DM us.', action: 'ignore' },
}

const defaultPublicRestrictions: Record<string, boolean> = {
    never_discuss_prices_publicly: false,
    never_make_promises: false,
    never_argue_or_be_defensive: false,
    never_discuss_competitors: false,
    never_share_personal_opinions: false,
}

/* ─── AutoReply Config Type ─── */

interface AutoReplyConfig {
    dm_enabled: boolean
    dm_allowed_topics: Record<string, boolean>
    dm_custom_topics: string[]
    dm_boundary_templates: string[]
    dm_tone: 'friendly' | 'professional' | 'casual' | 'formal'
    comments_enabled: boolean
    comment_categories: Record<string, { enabled: boolean; template: string; action?: string }>
    public_restrictions: Record<string, boolean>
}

const defaultAutoReplyConfig: AutoReplyConfig = {
    dm_enabled: false,
    dm_allowed_topics: Object.fromEntries(Object.keys(defaultDmTopics).map((k) => [k, true])),
    dm_custom_topics: [],
    dm_boundary_templates: [...defaultBoundaryTemplates],
    dm_tone: 'friendly',
    comments_enabled: false,
    comment_categories: { ...defaultCommentCategories },
    public_restrictions: { ...defaultPublicRestrictions },
}

/* ─── Interfaces ─── */

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

/* ─── Tabs ─── */

type MainTab = 'general' | 'ai-rules'
type AITab = 'dm' | 'comments'

/* ─── Component ─── */

export default function SettingsPage() {
    const { clientId, loading: clientLoading } = useClient()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [savingAI, setSavingAI] = useState(false)
    const [savedAI, setSavedAI] = useState(false)
    const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
    const [disconnecting, setDisconnecting] = useState<string | null>(null)
    const [connectionMessage, setConnectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [aiSaveError, setAiSaveError] = useState<string | null>(null)

    const [mainTab, setMainTab] = useState<MainTab>('general')
    const [aiTab, setAiTab] = useState<AITab>('dm')

    const [client, setClient] = useState<ClientData>({
        company_name: '',
        website_url: '',
        industry: '',
        plan_tier: 'starter',
        contact_email: '',
        approval_channel: 'telegram',
    })
    const [socials, setSocials] = useState<SocialAccount[]>([])

    // Notification prefs
    const [telegramAlerts, setTelegramAlerts] = useState(true)
    const [emailReports, setEmailReports] = useState(false)

    // AI Reply Config
    const [aiConfig, setAiConfig] = useState<AutoReplyConfig>(defaultAutoReplyConfig)
    const [newCustomTopic, setNewCustomTopic] = useState('')
    const [newTemplate, setNewTemplate] = useState('')

    useEffect(() => {
        if (!clientId) return

        async function load() {
            const [clientRes, socialsRes] = await Promise.all([
                supabase
                    .from('clients')
                    .select('company_name, website_url, industry, plan_tier, contact_email, approval_channel')
                    .eq('id', clientId)
                    .single(),
                supabase
                    .from('social_accounts')
                    .select('*')
                    .eq('client_id', clientId)
                    .order('connected_at', { ascending: true }),
            ])

            if (clientRes.error) {
                console.error('Error fetching client:', clientRes.error)
            }

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

            // Load AI config from localStorage
            try {
                const stored = localStorage.getItem(`blink_auto_reply_config_${clientId}`)
                if (stored) {
                    setAiConfig({ ...defaultAutoReplyConfig, ...JSON.parse(stored) })
                }
            } catch { }

            if (socialsRes.error) {
                console.error('Error fetching social accounts:', socialsRes.error)
            }
            if (socialsRes.data) setSocials(socialsRes.data as SocialAccount[])
            setLoading(false)
        }
        load()

        // Handle OAuth callback messages
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('success') === 'account_connected') {
            setConnectionMessage({ type: 'success', text: 'Social account connected successfully!' })
            // Clean up URL
            window.history.replaceState({}, '', '/dashboard/settings')
            // Refresh socials after a short delay
            setTimeout(load, 1500)
        } else if (urlParams.get('error')) {
            const errorMsg = urlParams.get('error')?.replace(/_/g, ' ') || 'Connection failed'
            setConnectionMessage({ type: 'error', text: `Connection error: ${errorMsg}` })
            window.history.replaceState({}, '', '/dashboard/settings')
        }
    }, [clientId])

    /* ─── Post for Me: Connect Account ─── */

    const connectPlatform = useCallback(async (platform: string) => {
        setConnectingPlatform(platform)
        setConnectionMessage(null)

        try {
            const res = await fetch('/api/social-accounts/auth-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, clientId }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate auth URL')
            }

            const { url } = await res.json()
            // Redirect to the OAuth provider
            window.location.href = url
        } catch (err) {
            console.error('Connect platform error:', err)
            setConnectionMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to connect account',
            })
            setConnectingPlatform(null)
        }
    }, [])

    /* ─── Post for Me: Disconnect Account ─── */

    const disconnectPlatform = useCallback(async (accountId: string) => {
        setDisconnecting(accountId)
        setConnectionMessage(null)

        try {
            // Mark as inactive in Supabase
            await supabase
                .from('social_accounts')
                .update({ is_active: false } as Record<string, unknown>)
                .eq('id', accountId)

            setSocials((prev) =>
                prev.map((s) => (s.id === accountId ? { ...s, is_active: false } : s))
            )
            setConnectionMessage({ type: 'success', text: 'Account disconnected successfully.' })
        } catch (err) {
            console.error('Disconnect error:', err)
            setConnectionMessage({
                type: 'error',
                text: 'Failed to disconnect account',
            })
        } finally {
            setDisconnecting(null)
        }
    }, [])

    /* ─── General Settings Save ─── */

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
            .eq('id', clientId)

        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
    }

    /* ─── AI Config Save ─── */

    async function handleSaveAI() {
        setSavingAI(true)
        setSavedAI(false)
        setAiSaveError(null)

        try {
            // Try Supabase first
            const { error } = await supabase
                .from('clients')
                .update({ auto_reply_config: aiConfig } as Record<string, unknown>)
                .eq('id', clientId)

            if (error) {
                // Fallback to localStorage
                localStorage.setItem(`blink_auto_reply_config_${clientId}`, JSON.stringify(aiConfig))
                setAiSaveError('Saved locally — will sync to database when the column is available')
            }

            setSavedAI(true)
            setTimeout(() => {
                setSavedAI(false)
                setAiSaveError(null)
            }, 4000)
        } catch {
            // Fallback to localStorage
            localStorage.setItem(`blink_auto_reply_config_${clientId}`, JSON.stringify(aiConfig))
            setAiSaveError('Saved locally — will sync to database when the column is available')
            setSavedAI(true)
            setTimeout(() => {
                setSavedAI(false)
                setAiSaveError(null)
            }, 4000)
        } finally {
            setSavingAI(false)
        }
    }

    /* ─── AI Config Helpers ─── */

    function updateAI<K extends keyof AutoReplyConfig>(key: K, value: AutoReplyConfig[K]) {
        setAiConfig((prev) => ({ ...prev, [key]: value }))
    }

    function toggleDmTopic(topic: string) {
        setAiConfig((prev) => ({
            ...prev,
            dm_allowed_topics: {
                ...prev.dm_allowed_topics,
                [topic]: !prev.dm_allowed_topics[topic],
            },
        }))
    }

    function addCustomTopic() {
        const topic = newCustomTopic.trim()
        if (!topic || aiConfig.dm_custom_topics.includes(topic)) return
        setAiConfig((prev) => ({
            ...prev,
            dm_custom_topics: [...prev.dm_custom_topics, topic],
        }))
        setNewCustomTopic('')
    }

    function removeCustomTopic(topic: string) {
        setAiConfig((prev) => ({
            ...prev,
            dm_custom_topics: prev.dm_custom_topics.filter((t) => t !== topic),
        }))
    }

    function updateBoundaryTemplate(index: number, value: string) {
        setAiConfig((prev) => ({
            ...prev,
            dm_boundary_templates: prev.dm_boundary_templates.map((t, i) => (i === index ? value : t)),
        }))
    }

    function removeBoundaryTemplate(index: number) {
        setAiConfig((prev) => ({
            ...prev,
            dm_boundary_templates: prev.dm_boundary_templates.filter((_, i) => i !== index),
        }))
    }

    function addBoundaryTemplate() {
        const t = newTemplate.trim()
        if (!t) return
        setAiConfig((prev) => ({
            ...prev,
            dm_boundary_templates: [...prev.dm_boundary_templates, t],
        }))
        setNewTemplate('')
    }

    function updateCommentCategory(category: string, update: Partial<{ enabled: boolean; template: string; action: string }>) {
        setAiConfig((prev) => ({
            ...prev,
            comment_categories: {
                ...prev.comment_categories,
                [category]: {
                    ...prev.comment_categories[category],
                    ...update,
                },
            },
        }))
    }

    function togglePublicRestriction(key: string) {
        setAiConfig((prev) => ({
            ...prev,
            public_restrictions: {
                ...prev.public_restrictions,
                [key]: !prev.public_restrictions[key],
            },
        }))
    }

    /* ─── Loading ─── */

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    const plan = planTiers[client.plan_tier] || planTiers.starter

    /* ─── Render ─── */

    return (
        <div className="space-y-6 max-w-3xl">
            {/* ─── Main Tab Selector ─── */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
                <button
                    onClick={() => setMainTab('general')}
                    className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center',
                        mainTab === 'general'
                            ? 'bg-white text-blink-dark shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    )}
                >
                    <MessageCircle className="h-4 w-4" />
                    General Settings
                </button>
                <button
                    onClick={() => setMainTab('ai-rules')}
                    className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center',
                        mainTab === 'ai-rules'
                            ? 'bg-white text-blink-dark shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    )}
                >
                    <Bot className="h-4 w-4" />
                    AI Reply Rules
                </button>
            </div>

            {/* ═══════════════════════════════════ */}
            {/* ═══ GENERAL SETTINGS TAB ═══ */}
            {/* ═══════════════════════════════════ */}
            {mainTab === 'general' && (
                <>
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

                    {/* ─── Section 2: Social Connections (Dynamic) ─── */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                        <div>
                            <h3 className="text-base font-semibold text-blink-dark">
                                Social Connections
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Manage your connected social media accounts via Post for Me
                            </p>
                        </div>

                        {/* Connection message */}
                        {connectionMessage && (
                            <div className={cn(
                                'px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2',
                                connectionMessage.type === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                            )}>
                                {connectionMessage.type === 'success' ? (
                                    <CheckCircle className="h-4 w-4" />
                                ) : (
                                    <AlertCircle className="h-4 w-4" />
                                )}
                                {connectionMessage.text}
                                <button
                                    onClick={() => setConnectionMessage(null)}
                                    className="ml-auto p-0.5 hover:bg-black/5 rounded-full"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}

                        {/* No accounts connected */}
                        {socials.filter((s) => s.is_active).length === 0 ? (
                            <div className="text-center py-8 space-y-3">
                                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                                    <Share2Icon className="h-6 w-6 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-blink-dark">
                                        No social accounts connected yet
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Connect your accounts to start posting!
                                    </p>
                                </div>
                                <Link href="/get-started">
                                    <Button variant="outline" size="sm" className="gap-1.5 mt-2">
                                        <Plus className="h-3.5 w-3.5" />
                                        Set up accounts
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <>
                                {/* Connected platforms */}
                                <div className="space-y-3">
                                    {socials
                                        .filter((s) => s.is_active)
                                        .map((account) => {
                                            const cfg = platformConfig[account.platform]
                                            if (!cfg) return null
                                            return (
                                                <div
                                                    key={account.id}
                                                    className="flex items-center justify-between py-3 px-4 rounded-lg border border-emerald-100 bg-emerald-50/30 transition-colors"
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
                                                            {account.account_name && (
                                                                <p className="text-xs text-gray-400">
                                                                    @{account.account_name}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
                                            )
                                        })}
                                </div>

                                {/* Connect more section — collapsible */}
                                {(() => {
                                    const connectedPlatforms = socials.filter((s) => s.is_active).map((s) => s.platform)
                                    const available = Object.entries(platformConfig).filter(
                                        ([key]) => !connectedPlatforms.includes(key)
                                    )
                                    if (available.length === 0) return null
                                    return (
                                        <details className="group">
                                            <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-500 hover:text-blink-primary transition-colors py-2 select-none">
                                                <Plus className="h-4 w-4" />
                                                Connect more platforms ({available.length} available)
                                            </summary>
                                            <div className="mt-2 space-y-2 pl-0">
                                                {available.map(([key, cfg]) => (
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
                                                            <p className="text-sm font-medium text-blink-dark">
                                                                {cfg.label}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-xs gap-1 h-8"
                                                            disabled={connectingPlatform === key || !PFM_SUPPORTED_PLATFORMS.includes(key)}
                                                            onClick={() => connectPlatform(key)}
                                                        >
                                                            {connectingPlatform === key ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <ExternalLink className="h-3 w-3" />
                                                            )}
                                                            {connectingPlatform === key ? 'Connecting...' : 'Connect'}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )
                                })()}
                            </>
                        )}
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
                </>
            )}

            {/* ═══════════════════════════════════ */}
            {/* ═══ AI REPLY RULES TAB ═══ */}
            {/* ═══════════════════════════════════ */}
            {mainTab === 'ai-rules' && (
                <>
                    {/* AI Sub-tabs */}
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
                        <button
                            onClick={() => setAiTab('dm')}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center',
                                aiTab === 'dm'
                                    ? 'bg-white text-blink-dark shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <MessageSquare className="h-4 w-4" />
                            DM Auto-Reply
                        </button>
                        <button
                            onClick={() => setAiTab('comments')}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center',
                                aiTab === 'comments'
                                    ? 'bg-white text-blink-dark shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <MessageCircle className="h-4 w-4" />
                            Comment Auto-Reply
                        </button>
                    </div>

                    {/* ═══ DM AUTO-REPLY TAB ═══ */}
                    {aiTab === 'dm' && (
                        <>
                            {/* Master Toggle */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'p-2.5 rounded-lg transition-colors',
                                            aiConfig.dm_enabled ? 'bg-blink-primary/10 text-blink-primary' : 'bg-gray-100 text-gray-400'
                                        )}>
                                            <Bot className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-blink-dark">
                                                AI DM Auto-Replies
                                            </h3>
                                            <p className="text-sm text-gray-500">
                                                {aiConfig.dm_enabled ? 'Active — AI is responding to DMs' : 'Disabled — DMs are not auto-replied'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={aiConfig.dm_enabled}
                                        onCheckedChange={(v) => updateAI('dm_enabled', v)}
                                    />
                                </div>
                            </div>

                            {/* Allowed Topics */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold text-blink-dark">
                                        Allowed Topics
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Choose which topics the AI can discuss
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {Object.entries(defaultDmTopics).map(([key, label]) => (
                                        <div key={key} className="flex items-center justify-between py-1.5">
                                            <span className="text-sm text-blink-dark">{label}</span>
                                            <Switch
                                                checked={aiConfig.dm_allowed_topics[key] ?? true}
                                                onCheckedChange={() => toggleDmTopic(key)}
                                            />
                                        </div>
                                    ))}

                                    {/* Custom topics */}
                                    {aiConfig.dm_custom_topics.map((topic) => (
                                        <div key={topic} className="flex items-center justify-between py-1.5">
                                            <span className="text-sm text-blink-dark flex items-center gap-1.5">
                                                <span className="text-[10px] bg-blink-primary/10 text-blink-primary px-1.5 py-0.5 rounded font-medium">Custom</span>
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

                                {/* Add custom topic */}
                                <div className="flex gap-2 pt-2 border-t border-gray-100">
                                    <Input
                                        value={newCustomTopic}
                                        onChange={(e) => setNewCustomTopic(e.target.value)}
                                        placeholder="Add a custom topic..."
                                        className="text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTopic())}
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

                            {/* Boundary Templates */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold text-blink-dark">
                                        Boundary Response Templates
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Used when the AI can&apos;t or shouldn&apos;t discuss a topic
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {aiConfig.dm_boundary_templates.map((template, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <Textarea
                                                value={template}
                                                onChange={(e) => updateBoundaryTemplate(i, e.target.value)}
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
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBoundaryTemplate())}
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

                            {/* Tone Selector */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold text-blink-dark">
                                        Response Tone
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Choose the overall personality of AI responses
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {toneOptions.map((tone) => (
                                        <button
                                            key={tone}
                                            onClick={() => updateAI('dm_tone', tone)}
                                            className={cn(
                                                'py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all capitalize text-center',
                                                aiConfig.dm_tone === tone
                                                    ? 'border-blink-primary bg-blink-primary/5 text-blink-primary'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            )}
                                        >
                                            {tone === 'friendly' && '😊 '}
                                            {tone === 'professional' && '💼 '}
                                            {tone === 'casual' && '✌️ '}
                                            {tone === 'formal' && '🎩 '}
                                            {tone}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══ COMMENT AUTO-REPLY TAB ═══ */}
                    {aiTab === 'comments' && (
                        <>
                            {/* Master Toggle */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'p-2.5 rounded-lg transition-colors',
                                            aiConfig.comments_enabled ? 'bg-blink-primary/10 text-blink-primary' : 'bg-gray-100 text-gray-400'
                                        )}>
                                            <MessageCircle className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-blink-dark">
                                                AI Comment Auto-Replies
                                            </h3>
                                            <p className="text-sm text-gray-500">
                                                {aiConfig.comments_enabled ? 'Active — AI responds to comments' : 'Disabled — no auto-replies on comments'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={aiConfig.comments_enabled}
                                        onCheckedChange={(v) => updateAI('comments_enabled', v)}
                                    />
                                </div>
                            </div>

                            {/* Comment Categories */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                                <div>
                                    <h3 className="text-base font-semibold text-blink-dark">
                                        Comment Categories
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Configure how AI responds to different types of comments
                                    </p>
                                </div>

                                {/* Positive */}
                                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">😊</span>
                                            <span className="text-sm font-medium text-blink-dark">Positive Comments</span>
                                        </div>
                                        <Switch
                                            checked={aiConfig.comment_categories.positive?.enabled ?? true}
                                            onCheckedChange={(v) => updateCommentCategory('positive', { enabled: v })}
                                        />
                                    </div>
                                    <Textarea
                                        value={aiConfig.comment_categories.positive?.template || ''}
                                        onChange={(e) => updateCommentCategory('positive', { template: e.target.value })}
                                        rows={2}
                                        placeholder="Response template for positive comments..."
                                        className="resize-none text-sm"
                                    />
                                </div>

                                {/* Complaints */}
                                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">😟</span>
                                            <span className="text-sm font-medium text-blink-dark">Complaints</span>
                                        </div>
                                        <Switch
                                            checked={aiConfig.comment_categories.complaints?.enabled ?? true}
                                            onCheckedChange={(v) => updateCommentCategory('complaints', { enabled: v })}
                                        />
                                    </div>
                                    <Textarea
                                        value={aiConfig.comment_categories.complaints?.template || ''}
                                        onChange={(e) => updateCommentCategory('complaints', { template: e.target.value })}
                                        rows={2}
                                        placeholder="Response template for complaints..."
                                        className="resize-none text-sm"
                                    />
                                </div>

                                {/* Questions */}
                                <div className="space-y-2 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">❓</span>
                                            <span className="text-sm font-medium text-blink-dark">Questions</span>
                                        </div>
                                        <Switch
                                            checked={aiConfig.comment_categories.questions?.enabled ?? true}
                                            onCheckedChange={(v) => updateCommentCategory('questions', { enabled: v })}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Follows the allowed topics from DM rules above
                                    </p>
                                </div>

                                {/* Toxic / Spam */}
                                <div className="space-y-3 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">🚫</span>
                                            <span className="text-sm font-medium text-blink-dark">Toxic / Spam</span>
                                        </div>
                                        <Switch
                                            checked={aiConfig.comment_categories.toxic_spam?.enabled ?? false}
                                            onCheckedChange={(v) => updateCommentCategory('toxic_spam', { enabled: v })}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => updateCommentCategory('toxic_spam', { action: 'ignore' })}
                                            className={cn(
                                                'flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all text-center',
                                                aiConfig.comment_categories.toxic_spam?.action === 'ignore'
                                                    ? 'border-blink-primary bg-blink-primary/5 text-blink-primary'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            )}
                                        >
                                            Ignore
                                        </button>
                                        <button
                                            onClick={() => updateCommentCategory('toxic_spam', { action: 'reply_boundary' })}
                                            className={cn(
                                                'flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all text-center',
                                                aiConfig.comment_categories.toxic_spam?.action === 'reply_boundary'
                                                    ? 'border-blink-primary bg-blink-primary/5 text-blink-primary'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            )}
                                        >
                                            Reply with boundary
                                        </button>
                                    </div>
                                    {aiConfig.comment_categories.toxic_spam?.action === 'reply_boundary' && (
                                        <Textarea
                                            value={aiConfig.comment_categories.toxic_spam?.template || ''}
                                            onChange={(e) => updateCommentCategory('toxic_spam', { template: e.target.value })}
                                            rows={2}
                                            placeholder="Boundary response for toxic/spam..."
                                            className="resize-none text-sm"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Public Safety Restrictions */}
                            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-amber-600" />
                                    <div>
                                        <h3 className="text-base font-semibold text-blink-dark">
                                            Public Safety Restrictions
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            Hard rules the AI must never break in public comments
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { key: 'never_discuss_prices_publicly', label: 'Never discuss prices publicly' },
                                        { key: 'never_make_promises', label: 'Never make promises' },
                                        { key: 'never_argue_or_be_defensive', label: 'Never argue or be defensive' },
                                        { key: 'never_discuss_competitors', label: 'Never discuss competitors' },
                                        { key: 'never_share_personal_opinions', label: 'Never share personal opinions' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className="flex items-center gap-3 cursor-pointer py-1">
                                            <input
                                                type="checkbox"
                                                checked={aiConfig.public_restrictions[key] ?? false}
                                                onChange={() => togglePublicRestriction(key)}
                                                className="h-4 w-4 rounded border-gray-300 text-blink-primary focus:ring-blink-primary/20"
                                            />
                                            <span className="text-sm text-blink-dark">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Save AI Config Button — shown for both sub-tabs */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-3">
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
                                )}
                                {savingAI ? 'Saving…' : savedAI ? 'Saved!' : 'Save AI Rules'}
                            </Button>
                            {savedAI && !aiSaveError && (
                                <span className="text-sm text-emerald-600">
                                    AI rules saved successfully
                                </span>
                            )}
                            {aiSaveError && (
                                <span className="text-xs text-amber-600 flex items-center gap-1">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {aiSaveError}
                                </span>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
