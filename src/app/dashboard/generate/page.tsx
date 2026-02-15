'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
    Brain,
    PenTool,
    Palette,
    CheckCircle,
    Loader2,
    AlertCircle,
    RefreshCw,
    ArrowRight,
    ArrowLeft,
    Send,
    Upload,
    X,
    ImageIcon,
    Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ContentCard } from '@/components/content/ContentCard'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { triggerWorkflow, triggerWorkflowWithFile } from '@/lib/workflows'
import type { Content, Platform } from '@/types/database'

const TEST_CLIENT_ID = '1cc01f92-090a-43d2-b5db-15b1791fe131'

const platformOptions: { label: string; value: Platform; icon: string }[] = [
    { label: 'Instagram', value: 'instagram', icon: '📸' },
    { label: 'TikTok', value: 'tiktok', icon: '🎵' },
    { label: 'Facebook', value: 'facebook', icon: '📘' },
    { label: 'Twitter', value: 'twitter', icon: '🐦' },
]

type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface PipelineStep {
    id: string
    icon: React.ElementType
    label: string
    status: StepStatus
    detail?: string
    error?: string
}

export default function GeneratePage() {
    const [wizardStep, setWizardStep] = useState(1)

    // Step 1 form state
    const [postCount, setPostCount] = useState(7)
    const [platforms, setPlatforms] = useState<Platform[]>(['instagram'])
    const [topics, setTopics] = useState('')

    // Step 2 — Visual Context
    const [referenceFile, setReferenceFile] = useState<File | null>(null)
    const [referencePreview, setReferencePreview] = useState<string | null>(null)
    const [enhanceMode, setEnhanceMode] = useState(false) // false = Pure AI, true = Enhance Source
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Step 3 pipeline state
    const [pipeline, setPipeline] = useState<PipelineStep[]>([
        { id: 'strategy', icon: Brain, label: 'Planning content strategy...', status: 'idle' },
        { id: 'captions', icon: PenTool, label: 'Writing captions...', status: 'idle' },
        { id: 'images', icon: Palette, label: 'Generating images...', status: 'idle' },
        { id: 'done', icon: CheckCircle, label: 'Done!', status: 'idle' },
    ])

    // Step 4 state
    const [generatedContent, setGeneratedContent] = useState<Content[]>([])
    const [sendingAll, setSendingAll] = useState(false)

    // Helpers
    const togglePlatform = (p: Platform) => {
        setPlatforms((prev) =>
            prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
        )
    }

    const updateStep = useCallback(
        (id: string, update: Partial<PipelineStep>) => {
            setPipeline((prev) =>
                prev.map((s) => (s.id === id ? { ...s, ...update } : s))
            )
        },
        []
    )

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    // File handlers
    function handleFileSelect(file: File) {
        if (!file.type.startsWith('image/')) return
        setReferenceFile(file)
        const reader = new FileReader()
        reader.onload = (e) => setReferencePreview(e.target?.result as string)
        reader.readAsDataURL(file)
    }

    function handleFileDrop(e: React.DragEvent) {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }

    function clearFile() {
        setReferenceFile(null)
        setReferencePreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // Start generation pipeline
    async function startGeneration() {
        setWizardStep(3)

        // Reset pipeline
        setPipeline((prev) => prev.map((s) => ({ ...s, status: 'idle' as StepStatus, error: undefined, detail: undefined })))

        try {
            // Step 1: Strategy
            updateStep('strategy', { status: 'running' })
            await triggerWorkflow('blink-generate-strategy', {
                client_id: TEST_CLIENT_ID,
                post_count: postCount,
                platforms,
                topics: topics || undefined,
            })
            updateStep('strategy', { status: 'done' })

            // Step 2: Captions
            updateStep('captions', { status: 'running' })
            await triggerWorkflow('blink-write-captions', {
                client_id: TEST_CLIENT_ID,
                post_count: postCount,
                platforms,
            })
            updateStep('captions', { status: 'done' })

            // Fetch newly created content entries
            const { data: newContent } = await supabase
                .from('content')
                .select('*')
                .eq('client_id', TEST_CLIENT_ID)
                .order('created_at', { ascending: false })
                .limit(postCount)

            const contentItems = (newContent || []) as unknown as Content[]

            // Step 3: Images — one at a time with 2s delays
            const imageLabel = enhanceMode
                ? '🎨 AI is enhancing your photo...'
                : '✨ AI is painting from your prompt...'
            updateStep('images', { status: 'running', label: imageLabel, detail: `Image 0 of ${contentItems.length}...` })

            for (let i = 0; i < contentItems.length; i++) {
                updateStep('images', { detail: `Image ${i + 1} of ${contentItems.length}...` })

                try {
                    if (referenceFile && enhanceMode) {
                        // Send multipart with reference image
                        await triggerWorkflowWithFile(
                            'blink-generate-images',
                            {
                                client_id: TEST_CLIENT_ID,
                                post_id: contentItems[i].id,
                                topic: contentItems[i].caption_short || contentItems[i].caption?.substring(0, 60) || '',
                                content_type: contentItems[i].content_type,
                                mode: 'enhance',
                            },
                            referenceFile
                        )
                    } else {
                        // Standard JSON call
                        await triggerWorkflow('blink-generate-images', {
                            client_id: TEST_CLIENT_ID,
                            post_id: contentItems[i].id,
                            topic: contentItems[i].caption_short || contentItems[i].caption?.substring(0, 60) || '',
                            content_type: contentItems[i].content_type,
                            mode: 'generate',
                        })
                    }
                } catch (imgErr) {
                    console.error(`Image ${i + 1} generation error:`, imgErr)
                    // Continue with remaining images
                }

                // 2 second delay between calls
                if (i < contentItems.length - 1) {
                    await delay(2000)
                }
            }

            updateStep('images', { status: 'done', detail: undefined, label: 'Images generated' })

            // Poll for final content with images (n8n updates image_url async)
            let pollAttempts = 0
            const maxPollAttempts = 10
            let finalItems: Content[] = []

            while (pollAttempts < maxPollAttempts) {
                const { data: polledContent } = await supabase
                    .from('content')
                    .select('*')
                    .eq('client_id', TEST_CLIENT_ID)
                    .order('created_at', { ascending: false })
                    .limit(postCount)

                finalItems = (polledContent || []) as unknown as Content[]
                const allHaveImages = finalItems.every((c) => !!c.image_url)

                if (allHaveImages && finalItems.length > 0) break

                pollAttempts++
                if (pollAttempts < maxPollAttempts) await delay(3000)
            }

            setGeneratedContent(finalItems)

            // Done!
            updateStep('done', { status: 'done' })

            // Auto-advance to step 4 after a brief pause
            await delay(1500)
            setWizardStep(4)
        } catch (err: unknown) {
            const currentRunning = pipeline.find((s) => s.status === 'running')
            if (currentRunning) {
                updateStep(currentRunning.id, {
                    status: 'error',
                    error: err instanceof Error ? err.message : 'An error occurred',
                })
            }
        }
    }

    // Send all for approval
    async function handleSendAllForApproval() {
        setSendingAll(true)

        try {
            for (const item of generatedContent) {
                await supabase
                    .from('content')
                    .update({ status: 'pending_approval' })
                    .eq('id', item.id)
            }

            // Update local state
            setGeneratedContent((prev) =>
                prev.map((c) => ({ ...c, status: 'pending_approval' as Content['status'] }))
            )
        } catch (err) {
            console.error('Send all for approval error:', err)
        } finally {
            setSendingAll(false)
        }
    }

    const totalSteps = 4
    const stepLabels = ['Plan', 'Visual Context', 'Generate', 'Review']

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Progress bar */}
            <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="flex items-center flex-1">
                        <div
                            className={cn(
                                'flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold shrink-0 transition-colors',
                                wizardStep >= step
                                    ? 'bg-blink-primary text-white'
                                    : 'bg-gray-200 text-gray-500'
                            )}
                        >
                            {wizardStep > step ? (
                                <CheckCircle className="h-5 w-5" />
                            ) : (
                                step
                            )}
                        </div>
                        {step < totalSteps && (
                            <div
                                className={cn(
                                    'flex-1 h-1 rounded-full mx-2 transition-colors',
                                    wizardStep > step ? 'bg-blink-primary' : 'bg-gray-200'
                                )}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Step labels */}
            <div className="flex justify-between text-xs text-gray-500 font-medium px-1">
                {stepLabels.map((label, i) => (
                    <span key={label} className={wizardStep >= i + 1 ? 'text-blink-primary' : ''}>
                        {label}
                    </span>
                ))}
            </div>

            {/* ─── STEP 1: Plan Your Content ─── */}
            {wizardStep === 1 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold text-blink-dark font-heading">
                            Plan Your Content
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Configure how many posts and for which platforms
                        </p>
                    </div>

                    {/* Post count slider */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">
                                How many posts?
                            </label>
                            <span className="text-2xl font-bold text-blink-primary">{postCount}</span>
                        </div>
                        <Slider
                            value={[postCount]}
                            onValueChange={(v) => setPostCount(v[0])}
                            min={3}
                            max={30}
                            step={1}
                            className="py-2"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>3</span>
                            <span>30</span>
                        </div>
                    </div>

                    {/* Platform checkboxes */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">
                            Which platforms?
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {platformOptions.map((p) => (
                                <label
                                    key={p.value}
                                    className={cn(
                                        'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                                        platforms.includes(p.value)
                                            ? 'border-blink-primary bg-blink-primary/5'
                                            : 'border-gray-200 hover:border-gray-300'
                                    )}
                                >
                                    <Checkbox
                                        checked={platforms.includes(p.value)}
                                        onCheckedChange={() => togglePlatform(p.value)}
                                    />
                                    <span className="text-lg">{p.icon}</span>
                                    <span className="text-sm font-medium text-blink-dark">{p.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Topics */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">
                            Any specific topics or themes? <span className="text-gray-400">(optional)</span>
                        </label>
                        <Textarea
                            value={topics}
                            onChange={(e) => setTopics(e.target.value)}
                            rows={3}
                            placeholder="e.g. Summer sale campaign, new product launch, behind-the-scenes..."
                            className="resize-none"
                        />
                    </div>

                    {/* Next button */}
                    <Button
                        onClick={() => setWizardStep(2)}
                        disabled={platforms.length === 0}
                        className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 h-12 text-base"
                    >
                        Next: Visual Context
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </div>
            )}

            {/* ─── STEP 2: Visual Context ─── */}
            {wizardStep === 2 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold text-blink-dark font-heading">
                            Visual Context
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Upload a reference photo or let AI generate everything from scratch
                        </p>
                    </div>

                    {/* Mode toggle */}
                    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    'p-2 rounded-lg transition-colors',
                                    enhanceMode ? 'bg-amber-50 text-amber-600' : 'bg-blink-primary/10 text-blink-primary'
                                )}>
                                    {enhanceMode ? <Wand2 className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-blink-dark">
                                        {enhanceMode ? 'Enhance Source Photo' : 'Pure AI Generation'}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {enhanceMode
                                            ? 'AI will enhance & stylize your uploaded photo'
                                            : 'AI generates images entirely from text prompts'}
                                    </p>
                                </div>
                            </div>
                            <Switch checked={enhanceMode} onCheckedChange={setEnhanceMode} />
                        </div>
                    </div>

                    {/* File upload zone — only shown in Enhance mode */}
                    {enhanceMode && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">
                                Reference Image <span className="text-red-500">*</span>
                            </label>

                            {referencePreview ? (
                                <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                                    <img
                                        src={referencePreview}
                                        alt="Reference"
                                        className="w-full max-h-64 object-contain bg-gray-50"
                                    />
                                    <div className="absolute top-2 right-2">
                                        <button
                                            onClick={clearFile}
                                            className="p-1.5 rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
                                        >
                                            <X className="h-4 w-4 text-gray-600" />
                                        </button>
                                    </div>
                                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                                        <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
                                        <span className="text-xs text-gray-500 truncate">
                                            {referenceFile?.name}
                                        </span>
                                        <span className="text-xs text-gray-400 ml-auto">
                                            {referenceFile && (referenceFile.size / 1024).toFixed(0)} KB
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-amber-300 bg-amber-50/30 hover:bg-amber-50/60"
                                >
                                    <Upload className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                                    <p className="text-sm font-medium text-blink-dark">
                                        Drag & drop your reference image
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        or click to browse · PNG, JPG, WEBP
                                    </p>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleFileSelect(file)
                                }}
                            />
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setWizardStep(1)}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                        <Button
                            onClick={startGeneration}
                            disabled={enhanceMode && !referenceFile}
                            className="flex-1 bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 h-12 text-base"
                        >
                            Generate {postCount} Posts
                            <ArrowRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* ─── STEP 3: Generating ─── */}
            {wizardStep === 3 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-blink-dark font-heading">
                            Generating Your Content
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Sit back — this may take a few minutes
                        </p>
                    </div>

                    {/* Pipeline steps */}
                    <div className="space-y-1">
                        {pipeline.map((step, i) => (
                            <div
                                key={step.id}
                                className={cn(
                                    'flex items-center gap-4 p-4 rounded-lg transition-colors',
                                    step.status === 'running' && 'bg-blink-primary/5',
                                    step.status === 'done' && 'bg-emerald-50',
                                    step.status === 'error' && 'bg-red-50'
                                )}
                            >
                                {/* Icon */}
                                <div
                                    className={cn(
                                        'flex items-center justify-center h-10 w-10 rounded-full shrink-0',
                                        step.status === 'idle' && 'bg-gray-100 text-gray-400',
                                        step.status === 'running' && 'bg-blink-primary/10 text-blink-primary',
                                        step.status === 'done' && 'bg-emerald-100 text-emerald-600',
                                        step.status === 'error' && 'bg-red-100 text-red-600'
                                    )}
                                >
                                    {step.status === 'running' ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : step.status === 'done' ? (
                                        <CheckCircle className="h-5 w-5" />
                                    ) : step.status === 'error' ? (
                                        <AlertCircle className="h-5 w-5" />
                                    ) : (
                                        <step.icon className="h-5 w-5" />
                                    )}
                                </div>

                                {/* Label + detail */}
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={cn(
                                            'text-sm font-medium',
                                            step.status === 'idle' && 'text-gray-400',
                                            step.status === 'running' && 'text-blink-dark',
                                            step.status === 'done' && 'text-emerald-700',
                                            step.status === 'error' && 'text-red-700'
                                        )}
                                    >
                                        {step.label}
                                    </p>
                                    {step.detail && (
                                        <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                                    )}
                                    {step.error && (
                                        <p className="text-xs text-red-500 mt-0.5">{step.error}</p>
                                    )}
                                </div>

                                {/* Status indicator */}
                                {step.status === 'done' && (
                                    <span className="text-xs text-emerald-600 font-medium">✓</span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Retry button on error */}
                    {pipeline.some((s) => s.status === 'error') && (
                        <Button
                            onClick={startGeneration}
                            variant="outline"
                            className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Retry
                        </Button>
                    )}
                </div>
            )}

            {/* ─── STEP 4: Review Your Content ─── */}
            {wizardStep === 4 && (
                <div className="space-y-6">
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
                        <div className="text-center space-y-2">
                            <div className="text-4xl">🎉</div>
                            <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                Content Generated!
                            </h2>
                            <p className="text-sm text-gray-500">
                                {generatedContent.length} post{generatedContent.length !== 1 ? 's' : ''} ready for
                                review
                            </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                            <Link href="/dashboard/content">
                                <Button variant="outline" className="gap-2">
                                    <ArrowRight className="h-4 w-4" />
                                    Go to Content Calendar
                                </Button>
                            </Link>
                            <Button
                                onClick={handleSendAllForApproval}
                                disabled={sendingAll}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
                            >
                                {sendingAll ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                                {sendingAll ? 'Sending...' : 'Send All for Approval'}
                            </Button>
                        </div>
                    </div>

                    {/* Generated content grid */}
                    {generatedContent.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {generatedContent.map((item) => (
                                <ContentCard key={item.id} content={item} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
