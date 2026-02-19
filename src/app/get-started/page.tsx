'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Zap,
    ArrowLeft,
    ArrowRight,
    Briefcase,
    Share2,
    Image as ImageIcon,
    Palette,
    User,
    Upload,
    X,
    Loader2,
    CheckCircle,
    Plus,
    Minus,
    MessageCircle,
    Mail,
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
import { supabase } from '@/lib/supabase'

/* ─── Constants ─── */

const industries = [
    'Food & Beverage',
    'Retail & E-Commerce',
    'Beauty & Wellness',
    'Health & Fitness',
    'Technology',
    'Education',
    'Real Estate',
    'Hospitality & Travel',
    'Professional Services',
    'Creative & Design',
    'Other',
]

const vibeWords = [
    'warm', 'bold', 'playful', 'professional', 'luxurious', 'edgy',
    'minimal', 'vibrant', 'earthy', 'modern', 'elegant', 'fun',
]

const plans = [
    {
        id: 'starter',
        name: 'Starter',
        price: 'KES 5,000',
        priceNum: 5000,
        desc: 'Perfect for getting started with AI content',
        features: ['7 posts/month', 'Instagram + Facebook', 'AI captions'],
    },
    {
        id: 'growth',
        name: 'Growth',
        price: 'KES 12,000',
        priceNum: 12000,
        desc: 'Scale your content across platforms',
        features: ['20 posts/month', 'All platforms', 'AI images + captions', 'DM auto-replies'],
        popular: true,
    },
    {
        id: 'premium',
        name: 'Premium',
        price: 'KES 25,000',
        priceNum: 25000,
        desc: 'Full-service brand growth engine',
        features: ['30 posts/month', 'All platforms', 'AI images + video', 'DM + comment auto-replies', 'Dedicated strategist'],
    },
]

const stepsMeta = [
    { icon: Briefcase, label: 'Business' },
    { icon: Share2, label: 'Social' },
    { icon: ImageIcon, label: 'Assets' },
    { icon: Palette, label: 'Brand' },
    { icon: MessageCircle, label: 'Chat' },
    { icon: User, label: 'Review' },
]

const chatPlatformOptions = [
    { id: 'whatsapp', label: 'WhatsApp Business', emoji: '💬', description: 'Respond to customers on WhatsApp' },
    { id: 'telegram', label: 'Telegram', emoji: '✈️', description: 'Auto-reply via Telegram bot' },
    { id: 'instagram_dm', label: 'Instagram DMs', emoji: '📸', description: 'Reply to Instagram direct messages' },
    { id: 'facebook_messenger', label: 'Facebook Messenger', emoji: '📘', description: 'Reply to Facebook Messenger chats' },
]

const businessHoursOptions = [
    { id: '24_7', label: '24/7', description: 'AI replies any time, day or night' },
    { id: 'business_hours', label: 'Business hours only (8am–6pm)', description: 'Only during work hours' },
    { id: 'custom', label: 'Custom', description: 'You\'ll configure this later' },
]

/* ─── Social URL Helpers ─── */

function extractHandle(url: string, platform: 'instagram' | 'tiktok' | 'facebook' | 'twitter'): string {
    if (!url) return ''
    const trimmed = url.trim()

    // If it's already just a handle
    if (!trimmed.includes('/') && !trimmed.includes('.')) {
        return trimmed.replace(/^@/, '')
    }

    try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (parts.length > 0) {
            return parts[0].replace(/^@/, '')
        }
    } catch {
        // If URL parsing fails, try regex
        const match = trimmed.match(/(?:instagram\.com|tiktok\.com|facebook\.com|x\.com|twitter\.com)\/@?([^/?]+)/i)
        if (match) return match[1]
    }
    return ''
}

/* ─── Form Data Interface ─── */

interface FormData {
    // Step 1: Business Basics
    businessName: string
    industry: string
    websiteUrl: string
    description: string
    // Step 2: Social Presence
    instagramUrl: string
    tiktokUrl: string
    facebookUrl: string
    twitterUrl: string
    // Step 3: Brand Assets
    logo: File | null
    logoPreview: string | null
    brandPhotos: File[]
    brandPhotoPreviews: string[]
    // Step 4: Brand Preferences
    vibes: string[]
    colors: string[]
    colorInput: string
    avoidText: string
    plan: string
    // Step 5: Chat Integration
    chatPlatform: string
    chatHandle: string
    chatAutoReply: boolean
    chatBusinessHours: string
    // Step 6: Contact
    contactName: string
    email: string
    phone: string
}

/* ─── Component ─── */

export default function GetStartedPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [uploadingPhotos, setUploadingPhotos] = useState(false)
    const [authUserId, setAuthUserId] = useState<string | null>(null)
    const [checkingAuth, setCheckingAuth] = useState(true)
    const [signupEmail, setSignupEmail] = useState('')
    const [signupLoading, setSignupLoading] = useState(false)
    const [signupSent, setSignupSent] = useState(false)
    const [signupError, setSignupError] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)
    const photosInputRef = useRef<HTMLInputElement>(null)

    // Check if user is already logged in
    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setAuthUserId(user.id)
                // Pre-fill email if logged in
                setForm(prev => ({ ...prev, email: user.email || '' }))

                // Check if user already has a client (already onboarded)
                const { data: client } = await supabase
                    .from('clients')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle()

                if (client) {
                    // Already onboarded — go straight to dashboard
                    router.replace('/dashboard')
                    return
                }
            }
            setCheckingAuth(false)
        }
        checkAuth()

        // Listen for auth state changes (e.g. magic link clicked)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                setAuthUserId(session.user.id)
                setForm(prev => ({ ...prev, email: session.user.email || '' }))
                setCheckingAuth(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [router])

    // Sign up handler
    async function handleSignup(e: React.FormEvent) {
        e.preventDefault()
        setSignupLoading(true)
        setSignupError(null)

        const { error } = await supabase.auth.signInWithOtp({
            email: signupEmail,
            options: {
                emailRedirectTo: `${window.location.origin}/get-started`,
            },
        })

        setSignupLoading(false)

        if (error) {
            setSignupError(error.message)
        } else {
            setSignupSent(true)
        }
    }

    const [form, setForm] = useState<FormData>({
        businessName: '',
        industry: '',
        websiteUrl: '',
        description: '',
        instagramUrl: '',
        tiktokUrl: '',
        facebookUrl: '',
        twitterUrl: '',
        logo: null,
        logoPreview: null,
        brandPhotos: [],
        brandPhotoPreviews: [],
        vibes: [],
        colors: [],
        colorInput: '',
        avoidText: '',
        plan: 'growth',
        chatPlatform: '',
        chatHandle: '',
        chatAutoReply: true,
        chatBusinessHours: '24_7',
        contactName: '',
        email: '',
        phone: '',
    })

    /* ─── Field Helpers ─── */

    function update<K extends keyof FormData>(field: K, value: FormData[K]) {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    function toggleVibe(word: string) {
        setForm((prev) => ({
            ...prev,
            vibes: prev.vibes.includes(word)
                ? prev.vibes.filter((v) => v !== word)
                : [...prev.vibes, word],
        }))
    }

    function addColor() {
        const hex = form.colorInput.trim()
        if (!hex) return
        const normalized = hex.startsWith('#') ? hex : `#${hex}`
        if (/^#[0-9A-Fa-f]{3,8}$/.test(normalized) && !form.colors.includes(normalized)) {
            setForm((prev) => ({
                ...prev,
                colors: [...prev.colors, normalized],
                colorInput: '',
            }))
        }
    }

    function removeColor(hex: string) {
        setForm((prev) => ({
            ...prev,
            colors: prev.colors.filter((c) => c !== hex),
        }))
    }

    /* ─── Logo Handling ─── */

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setForm((prev) => ({
            ...prev,
            logo: file,
            logoPreview: URL.createObjectURL(file),
        }))
    }

    function handleLogoDrop(e: React.DragEvent) {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) {
            setForm((prev) => ({
                ...prev,
                logo: file,
                logoPreview: URL.createObjectURL(file),
            }))
        }
    }

    function removeLogo() {
        if (form.logoPreview) URL.revokeObjectURL(form.logoPreview)
        setForm((prev) => ({ ...prev, logo: null, logoPreview: null }))
    }

    /* ─── Brand Photos Handling ─── */

    function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'))
        addPhotos(files)
    }

    function handlePhotosDrop(e: React.DragEvent) {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
        addPhotos(files)
    }

    function addPhotos(files: File[]) {
        const remaining = 5 - form.brandPhotos.length
        const toAdd = files.slice(0, remaining)
        if (toAdd.length === 0) return

        setForm((prev) => ({
            ...prev,
            brandPhotos: [...prev.brandPhotos, ...toAdd],
            brandPhotoPreviews: [...prev.brandPhotoPreviews, ...toAdd.map((f) => URL.createObjectURL(f))],
        }))
    }

    function removePhoto(index: number) {
        URL.revokeObjectURL(form.brandPhotoPreviews[index])
        setForm((prev) => ({
            ...prev,
            brandPhotos: prev.brandPhotos.filter((_, i) => i !== index),
            brandPhotoPreviews: prev.brandPhotoPreviews.filter((_, i) => i !== index),
        }))
    }

    /* ─── Validation ─── */

    function canProceed(): boolean {
        switch (step) {
            case 1:
                return form.businessName.trim().length > 0
            case 2:
                return true // all optional
            case 3:
                return true // all optional
            case 4:
                return form.plan.length > 0
            case 5:
                return form.chatPlatform.length > 0
            case 6:
                return (
                    form.contactName.trim().length > 0 &&
                    form.email.trim().length > 0 &&
                    form.phone.trim().length > 4
                )
            default:
                return false
        }
    }

    /* ─── Submit ─── */

    async function handleSubmit() {
        setSubmitting(true)
        setSubmitError(null)

        try {
            // Upload files to Supabase Storage first
            let logoUrl: string | null = null
            const photoUrls: string[] = []

            if (form.logo) {
                const ext = form.logo.name.split('.').pop() || 'png'
                const safeName = form.logo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                const path = `onboarding/${Date.now()}-${safeName}`
                const { data, error: uploadError } = await supabase.storage
                    .from('assets')
                    .upload(path, form.logo, {
                        upsert: true,
                        contentType: form.logo.type || 'image/png',
                    })
                if (uploadError) {
                    console.warn('Logo upload failed:', uploadError.message)
                    // Don't block submission — logo is optional
                } else if (data) {
                    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(data.path)
                    logoUrl = urlData.publicUrl
                }
            }

            for (const photo of form.brandPhotos) {
                const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                const path = `onboarding/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
                const { data, error: uploadError } = await supabase.storage
                    .from('assets')
                    .upload(path, photo, {
                        upsert: true,
                        contentType: photo.type || 'image/jpeg',
                    })
                if (uploadError) {
                    console.warn('Photo upload failed:', uploadError.message)
                } else if (data) {
                    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(data.path)
                    photoUrls.push(urlData.publicUrl)
                }
            }

            // Build JSON payload
            const payload = {
                business_name: form.businessName,
                industry: form.industry,
                website_url: form.websiteUrl,
                description: form.description,
                instagram_url: form.instagramUrl,
                tiktok_url: form.tiktokUrl,
                facebook_url: form.facebookUrl,
                twitter_url: form.twitterUrl,
                logo_url: logoUrl,
                brand_photo_urls: photoUrls,
                brand_vibes: form.vibes,
                brand_colors: form.colors,
                avoid_text: form.avoidText,
                plan: form.plan,
                chat_platform: form.chatPlatform,
                chat_handle: form.chatHandle,
                chat_auto_reply: form.chatAutoReply,
                chat_business_hours: form.chatBusinessHours,
                contact_name: form.contactName,
                email: form.email,
                phone: form.phone,
                instagram_handle: extractHandle(form.instagramUrl, 'instagram'),
                tiktok_handle: extractHandle(form.tiktokUrl, 'tiktok'),
                facebook_handle: extractHandle(form.facebookUrl, 'facebook'),
                twitter_handle: extractHandle(form.twitterUrl, 'twitter'),
                // Link to authenticated user if logged in
                user_id: authUserId,
            }

            console.log('Submitting onboarding payload:', payload)

            // Call the proxy route (avoids CORS issues with n8n)
            const response = await fetch('/api/onboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                console.error('Onboard proxy error:', response.status, errorData)
                throw new Error(errorData.error || `Submission failed (${response.status}). Please try again.`)
            }

            console.log('Onboarding submitted successfully')
            setSubmitted(true)

            // Redirect to dashboard after a delay if authenticated
            if (authUserId) {
                setTimeout(() => router.push('/dashboard'), 3000)
            }
        } catch (err) {
            console.error('Onboarding submit error:', err)
            const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
            setSubmitError(message)
        } finally {
            setSubmitting(false)
        }
    }

    /* ─── Success Screen ─── */

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blink-primary/5 via-white to-blink-secondary/5 flex items-center justify-center px-6">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle className="h-10 w-10 text-emerald-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-blink-dark font-heading">
                        Welcome to Blink! ⚡
                    </h1>
                    <p className="text-gray-500 leading-relaxed">
                        Your dashboard is being set up. Redirecting you now...
                    </p>
                    <div className="pt-2">
                        <Link href="/dashboard">
                            <Button className="gap-2 bg-blink-primary hover:bg-blink-primary/90">
                                Go to Dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    /* ─── Loading State ─── */

    if (checkingAuth) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blink-primary/5 via-white to-blink-secondary/5 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    /* ─── Auth Gate: Sign up first ─── */

    if (!authUserId) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blink-primary/5 via-white to-blink-secondary/5 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <Zap className="h-8 w-8 text-blink-secondary" />
                        <span className="text-3xl font-bold text-blink-dark font-heading tracking-tight">
                            Blink
                        </span>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
                        {signupSent ? (
                            <div className="text-center space-y-4">
                                <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Mail className="h-7 w-7 text-emerald-600" />
                                </div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Check your email
                                </h2>
                                <p className="text-sm text-gray-500">
                                    We sent a magic link to <strong>{signupEmail}</strong>. Click the link to create your account and continue setup.
                                </p>
                                <button
                                    className="text-sm text-blink-primary hover:text-blink-primary/80 font-medium"
                                    onClick={() => {
                                        setSignupSent(false)
                                        setSignupEmail('')
                                    }}
                                >
                                    Use a different email
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                        Create your account
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Sign up first, then we&apos;ll set up your brand profile
                                    </p>
                                </div>

                                {/* Steps preview */}
                                <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">How it works</p>
                                    <div className="space-y-2">
                                        {[
                                            { num: '1', text: 'Create your account (you are here)', active: true },
                                            { num: '2', text: 'Tell us about your business' },
                                            { num: '3', text: 'Connect your social media accounts' },
                                            { num: '4', text: 'AI extracts your brand DNA' },
                                        ].map((item) => (
                                            <div key={item.num} className={`flex items-center gap-3 ${item.active ? 'text-blink-primary' : 'text-gray-400'}`}>
                                                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${item.active ? 'bg-blink-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                    {item.num}
                                                </div>
                                                <span className="text-sm">{item.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <form onSubmit={handleSignup} className="space-y-4">
                                    <div>
                                        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                                            Email address
                                        </label>
                                        <input
                                            id="signup-email"
                                            type="email"
                                            value={signupEmail}
                                            onChange={(e) => setSignupEmail(e.target.value)}
                                            placeholder="you@business.com"
                                            required
                                            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blink-primary/30 focus:border-blink-primary transition-colors"
                                        />
                                    </div>

                                    {signupError && (
                                        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                                            {signupError}
                                        </p>
                                    )}

                                    <Button
                                        type="submit"
                                        disabled={signupLoading || !signupEmail}
                                        className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white py-2.5 rounded-lg font-medium transition-colors"
                                    >
                                        {signupLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <ArrowRight className="h-4 w-4 mr-2" />
                                        )}
                                        {signupLoading ? 'Sending link...' : 'Create account & continue'}
                                    </Button>
                                </form>

                                <div className="text-center pt-2 border-t border-gray-100">
                                    <p className="text-sm text-gray-500 pt-4">
                                        Already have an account?{' '}
                                        <Link href="/login" className="text-blink-primary font-medium hover:underline">
                                            Sign in
                                        </Link>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    /* ─── Main Form (only shown when authenticated) ─── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-blink-primary/5 via-white to-blink-secondary/5">
            {/* Nav */}
            <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-lg">
                <div className="max-w-3xl mx-auto flex items-center justify-between px-6 h-16">
                    <Link href="/" className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-blink-primary" />
                        <span className="text-xl font-bold tracking-tight text-blink-dark font-heading">
                            Blink
                        </span>
                    </Link>
                    <Link href="/" className="text-sm text-gray-500 hover:text-blink-dark transition-colors">
                        Back to home
                    </Link>
                </div>
            </nav>

            <div className="max-w-xl mx-auto px-6 py-12 space-y-8">
                {/* ─── Progress Stepper ─── */}
                <div className="flex items-center justify-between">
                    {stepsMeta.map((s, i) => (
                        <div key={s.label} className="flex items-center flex-1">
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={cn(
                                        'flex items-center justify-center h-10 w-10 rounded-full transition-all',
                                        step > i + 1
                                            ? 'bg-emerald-100 text-emerald-600'
                                            : step === i + 1
                                                ? 'bg-blink-primary text-white shadow-md shadow-blink-primary/25'
                                                : 'bg-gray-100 text-gray-400'
                                    )}
                                >
                                    {step > i + 1 ? (
                                        <CheckCircle className="h-5 w-5" />
                                    ) : (
                                        <s.icon className="h-5 w-5" />
                                    )}
                                </div>
                                <span
                                    className={cn(
                                        'text-xs font-medium hidden sm:block',
                                        step >= i + 1 ? 'text-blink-dark' : 'text-gray-400'
                                    )}
                                >
                                    {s.label}
                                </span>
                            </div>
                            {i < stepsMeta.length - 1 && (
                                <div
                                    className={cn(
                                        'flex-1 h-0.5 mx-2 rounded-full',
                                        step > i + 1 ? 'bg-emerald-300' : 'bg-gray-200'
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* ─── Form Card ─── */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8 space-y-6">

                    {/* ═══════ STEP 1: Business Basics ═══════ */}
                    {step === 1 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Tell us about your business ✨
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    This is the foundation for your brand&apos;s AI-powered content
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Business Name <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        value={form.businessName}
                                        onChange={(e) => update('businessName', e.target.value)}
                                        placeholder="e.g. Jamii Coffee"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Industry
                                    </label>
                                    <Select value={form.industry} onValueChange={(v) => update('industry', v)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select your industry" />
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Website URL <span className="text-gray-400">(optional)</span>
                                    </label>
                                    <Input
                                        value={form.websiteUrl}
                                        onChange={(e) => update('websiteUrl', e.target.value)}
                                        placeholder="https://yourbusiness.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        What does your business do?
                                    </label>
                                    <Textarea
                                        value={form.description}
                                        onChange={(e) => update('description', e.target.value)}
                                        rows={3}
                                        placeholder="Tell us what you do in your own words — the more detail, the better AI content we'll create for you..."
                                        className="resize-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        {form.description.length}/500 characters
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══════ STEP 2: Social Presence ═══════ */}
                    {step === 2 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Your social media presence 📱
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Paste full URLs or just your handles — we&apos;ll figure it out
                                </p>
                            </div>

                            <div className="space-y-4">
                                {[
                                    { label: '📸 Instagram', field: 'instagramUrl' as const, placeholder: 'https://instagram.com/yourbrand or @yourbrand', platform: 'instagram' as const },
                                    { label: '🎵 TikTok', field: 'tiktokUrl' as const, placeholder: 'https://tiktok.com/@yourbrand or @yourbrand', platform: 'tiktok' as const },
                                    { label: '📘 Facebook', field: 'facebookUrl' as const, placeholder: 'https://facebook.com/yourbrand', platform: 'facebook' as const },
                                    { label: '🐦 Twitter / X', field: 'twitterUrl' as const, placeholder: 'https://x.com/yourbrand or @yourbrand', platform: 'twitter' as const },
                                ].map(({ label, field, placeholder, platform }) => {
                                    const value = form[field]
                                    const handle = extractHandle(value, platform)
                                    return (
                                        <div key={field}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                {label}
                                            </label>
                                            <Input
                                                value={value}
                                                onChange={(e) => update(field, e.target.value)}
                                                placeholder={placeholder}
                                            />
                                            {handle && (
                                                <p className="text-xs text-blink-primary mt-1 font-medium">
                                                    ✓ Detected handle: @{handle}
                                                </p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            <p className="text-xs text-gray-400 text-center">
                                All fields are optional — add what you have
                            </p>
                        </>
                    )}

                    {/* ═══════ STEP 3: Brand Assets ═══════ */}
                    {step === 3 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Upload your brand assets 🎨
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Your logo and photos help our AI understand your visual style
                                </p>
                            </div>

                            {/* Logo Upload */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Logo
                                </label>

                                <input
                                    ref={logoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogoChange}
                                />

                                {form.logoPreview ? (
                                    <div className="relative rounded-xl border-2 border-blink-primary/20 bg-blink-primary/5 p-4 flex items-center gap-4">
                                        <img
                                            src={form.logoPreview}
                                            alt="Logo preview"
                                            className="h-16 w-16 rounded-lg object-contain border border-gray-200 bg-white"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-blink-dark truncate">
                                                {form.logo?.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {form.logo ? (form.logo.size / 1024).toFixed(1) + ' KB' : ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={removeLogo}
                                            className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => logoInputRef.current?.click()}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={handleLogoDrop}
                                        className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blink-primary/50 bg-gray-50 hover:bg-blink-primary/5 p-8 text-center transition-colors group"
                                    >
                                        <Upload className="h-8 w-8 mx-auto text-gray-300 group-hover:text-blink-primary transition-colors" />
                                        <p className="mt-2 text-sm font-medium text-gray-500 group-hover:text-blink-dark">
                                            Click or drag &amp; drop your logo
                                        </p>
                                        <p className="mt-1 text-xs text-gray-400">PNG, JPG, SVG up to 5MB</p>
                                    </button>
                                )}
                            </div>

                            {/* Brand Photos Upload */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Brand Photos <span className="text-gray-400">(up to 5)</span>
                                </label>
                                <p className="text-xs text-gray-500">
                                    Menu, storefront, products, team — anything that shows your brand&apos;s personality
                                </p>

                                <input
                                    ref={photosInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handlePhotosChange}
                                />

                                {/* Photo thumbnails grid */}
                                {form.brandPhotoPreviews.length > 0 && (
                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                        {form.brandPhotoPreviews.map((preview, i) => (
                                            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                                                <img
                                                    src={preview}
                                                    alt={`Brand photo ${i + 1}`}
                                                    className="h-full w-full object-cover"
                                                />
                                                <button
                                                    onClick={() => removePhoto(i)}
                                                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upload zone */}
                                {form.brandPhotos.length < 5 && (
                                    <button
                                        onClick={() => photosInputRef.current?.click()}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={handlePhotosDrop}
                                        className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blink-secondary/50 bg-gray-50 hover:bg-blink-secondary/5 p-6 text-center transition-colors group"
                                    >
                                        <Plus className="h-6 w-6 mx-auto text-gray-300 group-hover:text-blink-secondary transition-colors" />
                                        <p className="mt-1.5 text-sm font-medium text-gray-500 group-hover:text-blink-dark">
                                            Add photos ({form.brandPhotos.length}/5)
                                        </p>
                                        <p className="mt-0.5 text-xs text-gray-400">Click or drag &amp; drop multiple files</p>
                                    </button>
                                )}
                            </div>

                            <p className="text-center text-sm text-gray-400">
                                You can always upload more later from your dashboard
                            </p>
                        </>
                    )}

                    {/* ═══════ STEP 4: Brand Preferences ═══════ */}
                    {step === 4 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Your brand vibe 💫
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Help us understand the personality behind your brand
                                </p>
                            </div>

                            {/* Vibe Tags */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    How would you describe your brand? <span className="text-gray-400">(pick a few)</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {vibeWords.map((word) => (
                                        <button
                                            key={word}
                                            onClick={() => toggleVibe(word)}
                                            className={cn(
                                                'px-3.5 py-1.5 rounded-full text-sm font-medium border-2 transition-all capitalize',
                                                form.vibes.includes(word)
                                                    ? 'bg-blink-primary text-white border-blink-primary shadow-sm shadow-blink-primary/20'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blink-primary/40 hover:text-blink-primary'
                                            )}
                                        >
                                            {word}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Colors */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Colors you love <span className="text-gray-400">(optional)</span>
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            value={form.colorInput}
                                            onChange={(e) => update('colorInput', e.target.value)}
                                            placeholder="#FF5733 or FF5733"
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={addColor}
                                        className="shrink-0"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                {form.colors.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {form.colors.map((hex) => (
                                            <span
                                                key={hex}
                                                className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700"
                                            >
                                                <span
                                                    className="h-4 w-4 rounded-full border border-gray-300"
                                                    style={{ backgroundColor: hex }}
                                                />
                                                {hex}
                                                <button onClick={() => removeColor(hex)} className="ml-0.5 text-gray-400 hover:text-red-500">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Avoid */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-gray-700">
                                    Anything we should AVOID? <span className="text-gray-400">(optional)</span>
                                </label>
                                <Textarea
                                    value={form.avoidText}
                                    onChange={(e) => update('avoidText', e.target.value)}
                                    rows={2}
                                    placeholder="e.g. Don't use red, avoid stock photos, no emojis in captions..."
                                    className="resize-none"
                                />
                            </div>

                            {/* Plan Selector */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700">
                                    Choose your plan <span className="text-red-500">*</span>
                                </label>
                                <div className="space-y-2">
                                    {plans.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => update('plan', p.id)}
                                            className={cn(
                                                'w-full text-left rounded-xl border-2 p-4 transition-all relative',
                                                form.plan === p.id
                                                    ? 'border-blink-primary bg-blink-primary/5 shadow-sm'
                                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                                            )}
                                        >
                                            {p.popular && (
                                                <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-blink-secondary text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                                                    Popular
                                                </span>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-blink-dark">{p.name}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-blink-dark">{p.price}</p>
                                                    <p className="text-[10px] text-gray-400">/month</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {p.features.map((f) => (
                                                    <span key={f} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══════ STEP 5: Chat Integration ═══════ */}
                    {step === 5 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Chat Integration 💬
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Blink&apos;s AI can automatically respond to your customers&apos; messages. Choose where you want us to connect.
                                </p>
                            </div>

                            {/* Chat Platform selector */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700">
                                    Chat Platform <span className="text-red-500">*</span>
                                </label>
                                <div className="space-y-2">
                                    {chatPlatformOptions.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                update('chatPlatform', p.id)
                                                // Clear handle when switching
                                                update('chatHandle', p.id === 'whatsapp' ? form.phone : '')
                                            }}
                                            className={cn(
                                                'w-full text-left rounded-xl border-2 p-4 transition-all flex items-center gap-4',
                                                form.chatPlatform === p.id
                                                    ? 'border-blink-primary bg-blink-primary/5 shadow-sm'
                                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                                            )}
                                        >
                                            <span className="text-2xl">{p.emoji}</span>
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-blink-dark">{p.label}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                                            </div>
                                            {form.chatPlatform === p.id && (
                                                <CheckCircle className="h-5 w-5 text-blink-primary shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dynamic handle/info field */}
                            {form.chatPlatform && (
                                <div className="space-y-2">
                                    {form.chatPlatform === 'whatsapp' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                Business Phone Number
                                            </label>
                                            <Input
                                                value={form.chatHandle}
                                                onChange={(e) => update('chatHandle', e.target.value)}
                                                placeholder="+254 700 000 000"
                                            />
                                            <p className="text-xs text-gray-400 mt-1">WhatsApp Business number for AI replies</p>
                                        </div>
                                    )}
                                    {form.chatPlatform === 'telegram' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                                Telegram Bot Username
                                            </label>
                                            <Input
                                                value={form.chatHandle}
                                                onChange={(e) => update('chatHandle', e.target.value)}
                                                placeholder="@yourbusinessbot"
                                            />
                                            <p className="text-xs text-gray-400 mt-1">We&apos;ll connect to this bot for auto-replies</p>
                                        </div>
                                    )}
                                    {form.chatPlatform === 'instagram_dm' && (
                                        <div className="rounded-lg bg-blink-primary/5 border border-blink-primary/10 p-3">
                                            <p className="text-sm text-blink-dark">
                                                📸 We&apos;ll use your Instagram account from step 2
                                                {form.instagramUrl && (
                                                    <span className="block text-xs text-gray-500 mt-1">
                                                        @{extractHandle(form.instagramUrl, 'instagram') || form.instagramUrl}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                    {form.chatPlatform === 'facebook_messenger' && (
                                        <div className="rounded-lg bg-blink-primary/5 border border-blink-primary/10 p-3">
                                            <p className="text-sm text-blink-dark">
                                                📘 We&apos;ll use your Facebook page from step 2
                                                {form.facebookUrl && (
                                                    <span className="block text-xs text-gray-500 mt-1">
                                                        {extractHandle(form.facebookUrl, 'facebook') || form.facebookUrl}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Auto-reply toggle */}
                            <div className="rounded-lg border border-gray-200 p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-blink-dark">
                                            Enable AI auto-replies from day one?
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            When enabled, our AI will start responding to messages as soon as setup is complete
                                        </p>
                                    </div>
                                    <Switch
                                        checked={form.chatAutoReply}
                                        onCheckedChange={(v) => update('chatAutoReply', v)}
                                    />
                                </div>
                            </div>

                            {/* Business Hours */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700">
                                    When should AI reply?
                                </label>
                                <div className="space-y-2">
                                    {businessHoursOptions.map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => update('chatBusinessHours', opt.id)}
                                            className={cn(
                                                'w-full text-left rounded-lg border-2 px-4 py-3 transition-all',
                                                form.chatBusinessHours === opt.id
                                                    ? 'border-blink-primary bg-blink-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            )}
                                        >
                                            <p className="text-sm font-medium text-blink-dark">{opt.label}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══════ STEP 6: Contact & Review ═══════ */}
                    {step === 6 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Almost there! 🎉
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Your contact details and a quick review
                                </p>
                            </div>

                            {/* Contact fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Your Name <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        value={form.contactName}
                                        onChange={(e) => update('contactName', e.target.value)}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Email <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => update('email', e.target.value)}
                                        placeholder="john@business.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Phone <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        value={form.phone}
                                        onChange={(e) => update('phone', e.target.value)}
                                        placeholder="+254 700 000 000"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Kenya format: +254...</p>
                                </div>
                            </div>

                            {/* Review Summary */}
                            <div className="border-t border-gray-100 pt-4">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                    Quick Summary
                                </h3>
                                <div className="space-y-3">
                                    {/* Business */}
                                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Briefcase className="h-3 w-3" /> Business
                                        </h4>
                                        <div className="text-sm space-y-0.5">
                                            <p><span className="text-gray-500">Name:</span> <span className="font-medium text-blink-dark">{form.businessName}</span></p>
                                            {form.industry && <p><span className="text-gray-500">Industry:</span> <span className="font-medium text-blink-dark">{form.industry}</span></p>}
                                            {form.websiteUrl && <p><span className="text-gray-500">Website:</span> <span className="font-medium text-blink-dark">{form.websiteUrl}</span></p>}
                                            {form.description && <p className="text-gray-500 text-xs italic">&ldquo;{form.description.substring(0, 100)}{form.description.length > 100 ? '...' : ''}&rdquo;</p>}
                                        </div>
                                    </div>

                                    {/* Social */}
                                    {(form.instagramUrl || form.tiktokUrl || form.facebookUrl || form.twitterUrl) && (
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Share2 className="h-3 w-3" /> Social
                                            </h4>
                                            <div className="text-sm space-y-0.5">
                                                {form.instagramUrl && <p>📸 @{extractHandle(form.instagramUrl, 'instagram') || form.instagramUrl}</p>}
                                                {form.tiktokUrl && <p>🎵 @{extractHandle(form.tiktokUrl, 'tiktok') || form.tiktokUrl}</p>}
                                                {form.facebookUrl && <p>📘 {extractHandle(form.facebookUrl, 'facebook') || form.facebookUrl}</p>}
                                                {form.twitterUrl && <p>🐦 @{extractHandle(form.twitterUrl, 'twitter') || form.twitterUrl}</p>}
                                            </div>
                                        </div>
                                    )}

                                    {/* Assets */}
                                    {(form.logoPreview || form.brandPhotoPreviews.length > 0) && (
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <ImageIcon className="h-3 w-3" /> Assets
                                            </h4>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {form.logoPreview && (
                                                    <div className="flex items-center gap-2">
                                                        <img src={form.logoPreview} alt="Logo" className="h-10 w-10 rounded-lg object-contain border border-gray-200 bg-white" />
                                                        <span className="text-xs text-gray-500">Logo</span>
                                                    </div>
                                                )}
                                                {form.brandPhotoPreviews.length > 0 && (
                                                    <span className="text-xs text-gray-500">+ {form.brandPhotoPreviews.length} photo{form.brandPhotoPreviews.length > 1 ? 's' : ''}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Brand */}
                                    {(form.vibes.length > 0 || form.colors.length > 0 || form.plan) && (
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Palette className="h-3 w-3" /> Brand
                                            </h4>
                                            {form.vibes.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {form.vibes.map((v) => (
                                                        <span key={v} className="text-[10px] bg-blink-primary/10 text-blink-primary px-2 py-0.5 rounded-full font-medium capitalize">{v}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {form.colors.length > 0 && (
                                                <div className="flex gap-1.5">
                                                    {form.colors.map((c) => (
                                                        <span key={c} className="h-5 w-5 rounded-full border border-gray-200" style={{ backgroundColor: c }} title={c} />
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-600">
                                                Plan: <span className="font-medium">{plans.find((p) => p.id === form.plan)?.name || form.plan} — {plans.find((p) => p.id === form.plan)?.price || ''}</span>
                                            </p>
                                        </div>
                                    )}

                                    {/* Chat Integration */}
                                    {form.chatPlatform && (
                                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <MessageCircle className="h-3 w-3" /> Chat Integration
                                            </h4>
                                            <div className="text-sm space-y-0.5">
                                                <p>
                                                    <span className="text-gray-500">Platform:</span>{' '}
                                                    <span className="font-medium text-blink-dark">
                                                        {chatPlatformOptions.find((p) => p.id === form.chatPlatform)?.label || form.chatPlatform}
                                                    </span>
                                                </p>
                                                {form.chatHandle && (
                                                    <p>
                                                        <span className="text-gray-500">Handle:</span>{' '}
                                                        <span className="font-medium text-blink-dark">{form.chatHandle}</span>
                                                    </p>
                                                )}
                                                <p>
                                                    <span className="text-gray-500">Auto-reply:</span>{' '}
                                                    <span className="font-medium text-blink-dark">{form.chatAutoReply ? 'Enabled' : 'Disabled'}</span>
                                                </p>
                                                <p>
                                                    <span className="text-gray-500">Hours:</span>{' '}
                                                    <span className="font-medium text-blink-dark">
                                                        {businessHoursOptions.find((o) => o.id === form.chatBusinessHours)?.label || form.chatBusinessHours}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ─── Navigation Buttons ─── */}
                    <div className="flex items-center justify-between pt-2">
                        {step > 1 ? (
                            <Button
                                variant="outline"
                                onClick={() => setStep(step - 1)}
                                className="gap-1.5"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Button>
                        ) : (
                            <div />
                        )}

                        {step < 6 ? (
                            <Button
                                onClick={() => setStep(step + 1)}
                                disabled={!canProceed()}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
                            >
                                Next
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={submitting || !canProceed()}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="h-4 w-4" />
                                )}
                                {submitting ? 'Submitting...' : 'Launch My Brand ⚡'}
                            </Button>
                        )}
                    </div>

                    {/* Error Banner */}
                    {submitError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                                <X className="h-4 w-4 text-red-500" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-800">Submission failed</p>
                                <p className="text-xs text-red-600 mt-0.5">{submitError}</p>
                            </div>
                            <button
                                onClick={() => setSubmitError(null)}
                                className="shrink-0 p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
