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
    Sparkles,
    Layers,
    Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
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
    const [imageMode, setImageMode] = useState<'auto' | 'individual'>('auto')

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
    const [regeneratingCaption, setRegeneratingCaption] = useState<string | null>(null)
    const [regeneratingImage, setRegeneratingImage] = useState<string | null>(null)

    // Image generation modal (for individual mode / regenerate)
    const [imageModalOpen, setImageModalOpen] = useState(false)
    const [imageModalTarget, setImageModalTarget] = useState<Content | null>(null)
    const [modalEnhanceMode, setModalEnhanceMode] = useState(false)
    const [modalRefFile, setModalRefFile] = useState<File | null>(null)
    const [modalRefPreview, setModalRefPreview] = useState<string | null>(null)
    const [modalGenerating, setModalGenerating] = useState(false)
    const modalRefInputRef = useRef<HTMLInputElement>(null)

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

    // File handlers (step 2)
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

    // Modal file handlers
    function handleModalFileSelect(file: File) {
        if (!file.type.startsWith('image/')) return
        setModalRefFile(file)
        const reader = new FileReader()
        reader.onload = (e) => setModalRefPreview(e.target?.result as string)
        reader.readAsDataURL(file)
    }

    function clearModalFile() {
        setModalRefFile(null)
        setModalRefPreview(null)
        if (modalRefInputRef.current) modalRefInputRef.current.value = ''
    }

    // Start generation pipeline
    async function startGeneration() {
        setWizardStep(3)

        const isIndividual = imageMode === 'individual'

        // Build pipeline steps based on mode
        const pipelineSteps: PipelineStep[] = [
            { id: 'strategy', icon: Brain, label: 'Planning content strategy...', status: 'idle' },
            { id: 'captions', icon: PenTool, label: 'Writing captions...', status: 'idle' },
            ...(isIndividual
                ? []
                : [{ id: 'images', icon: Palette, label: 'Generating images...', status: 'idle' as StepStatus }]),
            { id: 'done', icon: CheckCircle, label: 'Done!', status: 'idle' as StepStatus },
        ]
        setPipeline(pipelineSteps)

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

            // Step 3: Images (only in auto mode)
            if (!isIndividual) {
                const imageLabel = enhanceMode
                    ? '🎨 AI is enhancing your photo...'
                    : '✨ AI is painting from your prompt...'
                updateStep('images', { status: 'running', label: imageLabel, detail: `Image 0 of ${contentItems.length}...` })

                for (let i = 0; i < contentItems.length; i++) {
                    updateStep('images', { detail: `Image ${i + 1} of ${contentItems.length}...` })

                    try {
                        if (referenceFile && enhanceMode) {
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
                    }

                    if (i < contentItems.length - 1) {
                        await delay(2000)
                    }
                }

                updateStep('images', { status: 'done', detail: undefined, label: 'Images generated' })

                // Poll for final content with images
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
            } else {
                // Individual mode — just use content as-is (no images yet)
                setGeneratedContent(contentItems)
            }

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

    // Regenerate caption for a single post
    async function handleRegenerateCaption(item: Content) {
        setRegeneratingCaption(item.id)
        try {
            await triggerWorkflow('blink-write-captions', {
                client_id: TEST_CLIENT_ID,
                post_id: item.id,
                regenerate: true,
            })

            // Poll for updated caption
            let attempts = 0
            while (attempts < 10) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', item.id)
                    .single()

                if (data) {
                    const updated = data as unknown as Content
                    if (updated.caption !== item.caption || updated.updated_at !== item.updated_at) {
                        setGeneratedContent((prev) =>
                            prev.map((c) => (c.id === item.id ? updated : c))
                        )
                        break
                    }
                }
                attempts++
                await delay(2000)
            }
        } catch (err) {
            console.error('Regenerate caption error:', err)
        } finally {
            setRegeneratingCaption(null)
        }
    }

    // Open image gen modal for a specific post
    function openImageModal(item: Content) {
        setImageModalTarget(item)
        setModalEnhanceMode(false)
        setModalRefFile(null)
        setModalRefPreview(null)
        setImageModalOpen(true)
    }

    // Generate image from modal
    async function handleModalGenerateImage() {
        if (!imageModalTarget) return
        setModalGenerating(true)
        setRegeneratingImage(imageModalTarget.id)

        try {
            if (modalRefFile && modalEnhanceMode) {
                await triggerWorkflowWithFile(
                    'blink-generate-images',
                    {
                        client_id: TEST_CLIENT_ID,
                        post_id: imageModalTarget.id,
                        topic: imageModalTarget.caption_short || imageModalTarget.caption?.substring(0, 60) || '',
                        content_type: imageModalTarget.content_type,
                        mode: 'enhance',
                    },
                    modalRefFile
                )
            } else {
                await triggerWorkflow('blink-generate-images', {
                    client_id: TEST_CLIENT_ID,
                    post_id: imageModalTarget.id,
                    topic: imageModalTarget.caption_short || imageModalTarget.caption?.substring(0, 60) || '',
                    content_type: imageModalTarget.content_type,
                    mode: 'generate',
                })
            }

            // Poll for updated image
            let attempts = 0
            while (attempts < 20) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', imageModalTarget.id)
                    .single()

                if (data) {
                    const updated = data as unknown as Content
                    if (updated.image_url && updated.image_url !== imageModalTarget.image_url) {
                        setGeneratedContent((prev) =>
                            prev.map((c) => (c.id === imageModalTarget.id ? updated : c))
                        )
                        break
                    }
                }
                attempts++
                await delay(3000)
            }

            // Final fetch
            const { data } = await supabase
                .from('content')
                .select('*')
                .eq('id', imageModalTarget.id)
                .single()
            if (data) {
                setGeneratedContent((prev) =>
                    prev.map((c) => (c.id === imageModalTarget.id ? (data as unknown as Content) : c))
                )
            }

            setImageModalOpen(false)
        } catch (err) {
            console.error('Image generation error:', err)
        } finally {
            setModalGenerating(false)
            setRegeneratingImage(null)
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
                    {/* Welcome intro */}
                    <div className="rounded-lg bg-gradient-to-r from-blink-primary/5 to-blink-secondary/5 border border-blink-primary/10 p-4 text-center">
                        <h2 className="text-xl font-semibold text-blink-dark font-heading">
                            Plan Your Content ✨
                        </h2>
                        <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                            Create a batch of AI-powered social media posts in 4 easy steps. Pick your settings, and our AI will handle the rest.
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
                        <p className="text-xs text-gray-400">💡 We recommend 7–14 posts for a 2-week content plan</p>
                    </div>

                    {/* Platform checkboxes */}
                    <div className="space-y-3">
                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Target Platforms
                            </label>
                            <p className="text-xs text-gray-400 mt-0.5">Select where you want to post</p>
                        </div>
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
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            Any specific topics or themes? <span className="text-gray-400">(optional)</span>
                        </label>
                        <Textarea
                            value={topics}
                            onChange={(e) => setTopics(e.target.value)}
                            rows={3}
                            placeholder="Describe what you want to post about — e.g. a new menu item, a seasonal sale, a behind-the-scenes look at your team. The more detail, the better the AI output."
                            className="resize-none"
                        />
                        {/* Smart topic suggestions */}
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                'New product launch',
                                'Behind the scenes',
                                'Customer testimonials',
                                'Seasonal promotion',
                                'Tips & tricks',
                                'Team spotlight',
                                'How-to guide',
                                'Industry news',
                                'Company milestone',
                                'Event announcement',
                            ].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => {
                                        setTopics((prev) => {
                                            const trimmed = prev.trim()
                                            if (trimmed.toLowerCase().includes(suggestion.toLowerCase())) return prev
                                            return trimmed ? `${trimmed}, ${suggestion}` : suggestion
                                        })
                                    }}
                                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 bg-gray-50 text-gray-600 hover:border-blink-primary/40 hover:bg-blink-primary/5 hover:text-blink-primary transition-colors"
                                >
                                    + {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Image Generation Mode Toggle */}
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    'p-2 rounded-lg transition-colors',
                                    imageMode === 'auto'
                                        ? 'bg-blink-primary/10 text-blink-primary'
                                        : 'bg-amber-50 text-amber-600'
                                )}>
                                    {imageMode === 'auto' ? <Layers className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-blink-dark">
                                        Image Generation Mode
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {imageMode === 'auto'
                                            ? 'Generate all images automatically in batch'
                                            : "I'll generate images one by one after captions"}
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={imageMode === 'individual'}
                                onCheckedChange={(checked) => setImageMode(checked ? 'individual' : 'auto')}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setImageMode('auto')}
                                className={cn(
                                    'flex-1 text-left py-2.5 px-3 rounded-lg text-xs font-medium transition-colors',
                                    imageMode === 'auto'
                                        ? 'bg-blink-primary/10 text-blink-primary border border-blink-primary/20'
                                        : 'bg-gray-50 text-gray-500 border border-gray-200'
                                )}
                            >
                                <span className="block">🚀 Auto (batch)</span>
                                <span className="font-normal text-[10px] opacity-70 block mt-0.5">AI creates all images in one go — fastest option</span>
                            </button>
                            <button
                                onClick={() => setImageMode('individual')}
                                className={cn(
                                    'flex-1 text-left py-2.5 px-3 rounded-lg text-xs font-medium transition-colors',
                                    imageMode === 'individual'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-gray-50 text-gray-500 border border-gray-200'
                                )}
                            >
                                <span className="block">🎯 Individual</span>
                                <span className="font-normal text-[10px] opacity-70 block mt-0.5">Generate images one at a time with full control</span>
                            </button>
                        </div>
                    </div>

                    {/* What happens next? mini-explainer */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 text-center">What happens next?</p>
                        <div className="flex items-center justify-center gap-3">
                            <div className="flex flex-col items-center gap-1.5 flex-1">
                                <div className="h-9 w-9 rounded-full bg-blink-primary/10 flex items-center justify-center">
                                    <Brain className="h-4 w-4 text-blink-primary" />
                                </div>
                                <span className="text-[11px] text-gray-500 text-center leading-tight">AI plans your strategy</span>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                            <div className="flex flex-col items-center gap-1.5 flex-1">
                                <div className="h-9 w-9 rounded-full bg-blink-primary/10 flex items-center justify-center">
                                    <PenTool className="h-4 w-4 text-blink-primary" />
                                </div>
                                <span className="text-[11px] text-gray-500 text-center leading-tight">Writes captions</span>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                            <div className="flex flex-col items-center gap-1.5 flex-1">
                                <div className="h-9 w-9 rounded-full bg-blink-primary/10 flex items-center justify-center">
                                    <Palette className="h-4 w-4 text-blink-primary" />
                                </div>
                                <span className="text-[11px] text-gray-500 text-center leading-tight">Generates images</span>
                            </div>
                        </div>
                    </div>

                    {/* Next button */}
                    <Button
                        onClick={() => {
                            if (imageMode === 'individual') {
                                // Skip visual context step for individual mode
                                startGeneration()
                            } else {
                                setWizardStep(2)
                            }
                        }}
                        disabled={platforms.length === 0}
                        className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 h-12 text-base"
                    >
                        {imageMode === 'individual' ? (
                            <>
                                Generate {postCount} Captions
                                <ArrowRight className="h-5 w-5" />
                            </>
                        ) : (
                            <>
                                Next: Visual Context
                                <ArrowRight className="h-5 w-5" />
                            </>
                        )}
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
                            {imageMode === 'individual'
                                ? 'Creating captions — you\'ll add images later'
                                : 'Sit back — this may take a few minutes'}
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
                                {imageMode === 'individual' && (
                                    <span className="block text-xs text-amber-600 mt-1">
                                        Individual mode — click &ldquo;Generate Image&rdquo; on each card to add visuals
                                    </span>
                                )}
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

                    {/* Generated content grid with action buttons */}
                    {generatedContent.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {generatedContent.map((item) => (
                                <div key={item.id} className="relative group">
                                    <ContentCard content={item} />

                                    {/* Regenerate action bar */}
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                handleRegenerateCaption(item)
                                            }}
                                            disabled={regeneratingCaption === item.id}
                                            className="flex-1 text-xs gap-1.5 h-8"
                                        >
                                            {regeneratingCaption === item.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <RefreshCw className="h-3 w-3" />
                                            )}
                                            Regen Caption
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                openImageModal(item)
                                            }}
                                            disabled={regeneratingImage === item.id}
                                            className={cn(
                                                'flex-1 text-xs gap-1.5 h-8',
                                                !item.image_url && imageMode === 'individual'
                                                    ? 'bg-blink-primary/5 border-blink-primary/30 text-blink-primary hover:bg-blink-primary/10'
                                                    : ''
                                            )}
                                        >
                                            {regeneratingImage === item.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-3 w-3" />
                                            )}
                                            {!item.image_url && imageMode === 'individual'
                                                ? 'Generate Image'
                                                : 'Regen Image'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Image Generation Modal ─── */}
            <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blink-primary" />
                            {imageModalTarget?.image_url ? 'Regenerate Image' : 'Generate Image'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-5">
                        {/* Caption preview */}
                        {imageModalTarget && (
                            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                <p className="text-xs text-gray-400 mb-1">Caption preview:</p>
                                <p className="text-sm text-blink-dark line-clamp-2">
                                    {imageModalTarget.caption_short || imageModalTarget.caption?.substring(0, 120) || 'No caption'}
                                </p>
                            </div>
                        )}

                        {/* Mode toggle */}
                        <div className="rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        modalEnhanceMode ? 'bg-amber-50 text-amber-600' : 'bg-blink-primary/10 text-blink-primary'
                                    )}>
                                        {modalEnhanceMode ? <Wand2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-blink-dark">
                                            {modalEnhanceMode ? 'Enhance Source Photo' : 'Pure AI Generation'}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {modalEnhanceMode
                                                ? 'Upload a reference photo to enhance'
                                                : 'Generate from text prompts only'}
                                        </p>
                                    </div>
                                </div>
                                <Switch checked={modalEnhanceMode} onCheckedChange={setModalEnhanceMode} />
                            </div>
                        </div>

                        {/* Reference image upload — only in enhance mode */}
                        {modalEnhanceMode && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Reference Photo <span className="text-red-500">*</span>
                                </label>

                                {modalRefPreview ? (
                                    <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                                        <img
                                            src={modalRefPreview}
                                            alt="Reference"
                                            className="w-full max-h-48 object-contain bg-gray-50"
                                        />
                                        <button
                                            onClick={clearModalFile}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
                                        >
                                            <X className="h-4 w-4 text-gray-600" />
                                        </button>
                                        <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                                            <ImageIcon className="h-3 w-3 text-gray-400" />
                                            <span className="text-xs text-gray-500 truncate">{modalRefFile?.name}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            const file = e.dataTransfer.files?.[0]
                                            if (file) handleModalFileSelect(file)
                                        }}
                                        onClick={() => modalRefInputRef.current?.click()}
                                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-amber-300 bg-amber-50/30 hover:bg-amber-50/60"
                                    >
                                        <Upload className="h-6 w-6 mx-auto mb-2 text-amber-400" />
                                        <p className="text-xs font-medium text-blink-dark">
                                            Drop your reference image here
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">or click to browse</p>
                                    </div>
                                )}

                                <input
                                    ref={modalRefInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleModalFileSelect(file)
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImageModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleModalGenerateImage}
                            disabled={modalGenerating || (modalEnhanceMode && !modalRefFile)}
                            className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
                        >
                            {modalGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    {modalEnhanceMode ? 'Enhance Photo' : 'Generate Image'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
