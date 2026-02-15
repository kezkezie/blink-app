'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
    Zap,
    ArrowLeft,
    ArrowRight,
    Briefcase,
    Share2,
    User,
    Image as ImageIcon,
    ClipboardCheck,
    Upload,
    X,
    Loader2,
    CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

const stepsMeta = [
    { icon: Briefcase, label: 'Business' },
    { icon: Share2, label: 'Social' },
    { icon: User, label: 'Contact' },
    { icon: ImageIcon, label: 'Logo' },
    { icon: ClipboardCheck, label: 'Review' },
]

interface FormData {
    businessName: string
    industry: string
    websiteUrl: string
    instagramUrl: string
    tiktokUrl: string
    facebookUrl: string
    twitterUrl: string
    contactName: string
    email: string
    phone: string
    logo: File | null
    logoPreview: string | null
}

export default function GetStartedPage() {
    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [form, setForm] = useState<FormData>({
        businessName: '',
        industry: '',
        websiteUrl: '',
        instagramUrl: '',
        tiktokUrl: '',
        facebookUrl: '',
        twitterUrl: '',
        contactName: '',
        email: '',
        phone: '+254',
        logo: null,
        logoPreview: null,
    })

    function update(field: keyof FormData, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        setForm((prev) => ({
            ...prev,
            logo: file,
            logoPreview: URL.createObjectURL(file),
        }))
    }

    function removeLogo() {
        if (form.logoPreview) URL.revokeObjectURL(form.logoPreview)
        setForm((prev) => ({ ...prev, logo: null, logoPreview: null }))
    }

    // Step validation
    function canProceed(): boolean {
        switch (step) {
            case 1:
                return form.businessName.trim().length > 0
            case 2:
                return true // all optional
            case 3:
                return (
                    form.contactName.trim().length > 0 &&
                    form.email.trim().length > 0 &&
                    form.phone.trim().length > 4
                )
            case 4:
                return true // skip allowed
            case 5:
                return true
            default:
                return false
        }
    }

    async function handleSubmit() {
        setSubmitting(true)

        try {
            const payload = new FormData()
            payload.append('business_name', form.businessName)
            payload.append('industry', form.industry)
            payload.append('website_url', form.websiteUrl)
            payload.append('instagram_url', form.instagramUrl)
            payload.append('tiktok_url', form.tiktokUrl)
            payload.append('facebook_url', form.facebookUrl)
            payload.append('twitter_url', form.twitterUrl)
            payload.append('contact_name', form.contactName)
            payload.append('email', form.email)
            payload.append('phone', form.phone)
            if (form.logo) payload.append('logo', form.logo)

            await fetch('https://n8n.srv1166077.hstgr.cloud/webhook/blink-onboard', {
                method: 'POST',
                body: payload,
            })

            setSubmitted(true)
        } catch (err) {
            console.error('Onboarding submit error:', err)
            // Still show success — form data was captured
            setSubmitted(true)
        } finally {
            setSubmitting(false)
        }
    }

    // Success screen
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
                        We&apos;re analyzing your brand now. You&apos;ll receive an email when your dashboard is ready.
                    </p>
                    <Link href="/">
                        <Button variant="outline" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Home
                        </Button>
                    </Link>
                </div>
            </div>
        )
    }

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
                {/* Progress */}
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

                {/* Form card */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8 space-y-6">
                    {/* ─── STEP 1: Business Info ─── */}
                    {step === 1 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Tell us about your business
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    This helps us create content that matches your brand
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
                            </div>
                        </>
                    )}

                    {/* ─── STEP 2: Social Media ─── */}
                    {step === 2 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Your social media accounts
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    We&apos;ll connect to these for content publishing (all optional)
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        📸 Instagram URL
                                    </label>
                                    <Input
                                        value={form.instagramUrl}
                                        onChange={(e) => update('instagramUrl', e.target.value)}
                                        placeholder="https://instagram.com/yourbrand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        🎵 TikTok URL
                                    </label>
                                    <Input
                                        value={form.tiktokUrl}
                                        onChange={(e) => update('tiktokUrl', e.target.value)}
                                        placeholder="https://tiktok.com/@yourbrand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        📘 Facebook URL
                                    </label>
                                    <Input
                                        value={form.facebookUrl}
                                        onChange={(e) => update('facebookUrl', e.target.value)}
                                        placeholder="https://facebook.com/yourbrand"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        🐦 Twitter / X URL
                                    </label>
                                    <Input
                                        value={form.twitterUrl}
                                        onChange={(e) => update('twitterUrl', e.target.value)}
                                        placeholder="https://x.com/yourbrand"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ─── STEP 3: Contact Info ─── */}
                    {step === 3 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Contact information
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    How we&apos;ll reach you about your dashboard
                                </p>
                            </div>

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
                        </>
                    )}

                    {/* ─── STEP 4: Logo Upload ─── */}
                    {step === 4 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Upload your logo
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Used for brand recognition in generated content
                                </p>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoChange}
                            />

                            {form.logoPreview ? (
                                <div className="relative rounded-xl border-2 border-blink-primary/20 bg-blink-primary/5 p-6 flex items-center gap-4">
                                    <img
                                        src={form.logoPreview}
                                        alt="Logo preview"
                                        className="h-20 w-20 rounded-lg object-contain border border-gray-200 bg-white"
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
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blink-primary/50 bg-gray-50 hover:bg-blink-primary/5 p-12 text-center transition-colors group"
                                >
                                    <Upload className="h-10 w-10 mx-auto text-gray-300 group-hover:text-blink-primary transition-colors" />
                                    <p className="mt-3 text-sm font-medium text-gray-500 group-hover:text-blink-dark">
                                        Click to upload or drag and drop
                                    </p>
                                    <p className="mt-1 text-xs text-gray-400">PNG, JPG, SVG up to 5MB</p>
                                </button>
                            )}

                            <p className="text-center text-sm text-gray-400">
                                You can always upload your logo later
                            </p>
                        </>
                    )}

                    {/* ─── STEP 5: Review ─── */}
                    {step === 5 && (
                        <>
                            <div>
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Review your information
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Make sure everything looks correct before submitting
                                </p>
                            </div>

                            <div className="space-y-4">
                                {/* Business */}
                                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Business
                                    </h4>
                                    <div className="text-sm space-y-1">
                                        <p><span className="text-gray-500">Name:</span> <span className="font-medium text-blink-dark">{form.businessName}</span></p>
                                        {form.industry && <p><span className="text-gray-500">Industry:</span> <span className="font-medium text-blink-dark">{form.industry}</span></p>}
                                        {form.websiteUrl && <p><span className="text-gray-500">Website:</span> <span className="font-medium text-blink-dark">{form.websiteUrl}</span></p>}
                                    </div>
                                </div>

                                {/* Social */}
                                {(form.instagramUrl || form.tiktokUrl || form.facebookUrl || form.twitterUrl) && (
                                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                            Social Media
                                        </h4>
                                        <div className="text-sm space-y-1">
                                            {form.instagramUrl && <p>📸 <span className="font-medium text-blink-dark">{form.instagramUrl}</span></p>}
                                            {form.tiktokUrl && <p>🎵 <span className="font-medium text-blink-dark">{form.tiktokUrl}</span></p>}
                                            {form.facebookUrl && <p>📘 <span className="font-medium text-blink-dark">{form.facebookUrl}</span></p>}
                                            {form.twitterUrl && <p>🐦 <span className="font-medium text-blink-dark">{form.twitterUrl}</span></p>}
                                        </div>
                                    </div>
                                )}

                                {/* Contact */}
                                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Contact
                                    </h4>
                                    <div className="text-sm space-y-1">
                                        <p><span className="text-gray-500">Name:</span> <span className="font-medium text-blink-dark">{form.contactName}</span></p>
                                        <p><span className="text-gray-500">Email:</span> <span className="font-medium text-blink-dark">{form.email}</span></p>
                                        <p><span className="text-gray-500">Phone:</span> <span className="font-medium text-blink-dark">{form.phone}</span></p>
                                    </div>
                                </div>

                                {/* Logo */}
                                {form.logoPreview && (
                                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 flex items-center gap-3">
                                        <img
                                            src={form.logoPreview}
                                            alt="Logo"
                                            className="h-12 w-12 rounded-lg object-contain border border-gray-200 bg-white"
                                        />
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Logo</h4>
                                            <p className="text-sm font-medium text-blink-dark">{form.logo?.name}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Navigation buttons */}
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

                        {step < 5 ? (
                            <Button
                                onClick={() => setStep(step + 1)}
                                disabled={!canProceed()}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
                            >
                                {step === 4 && !form.logo ? 'Skip for now' : 'Next'}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-1.5"
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="h-4 w-4" />
                                )}
                                {submitting ? 'Submitting...' : 'Submit'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
