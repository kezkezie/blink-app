'use client'

import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    ImageIcon,
    Loader2,
    Save,
    Sparkles,
    Send,
    CheckCircle,
    XCircle,
    Pencil,
    Calendar as CalendarIcon,
    Clock,
    Upload,
    X,
    Wand2,
    Eye,
    Zap,
    ExternalLink,
    AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { supabase } from '@/lib/supabase'
import { useClient } from '@/hooks/useClient'
import { triggerWorkflow, triggerWorkflowWithFile } from '@/lib/workflows'
import type { Content, ContentStatus, Platform } from '@/types/database'
import { cn } from '@/lib/utils'



export default function ContentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = use(params)
    const { clientId } = useClient()
    const router = useRouter()

    const [content, setContent] = useState<Content | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [generatingImage, setGeneratingImage] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    // Editable fields
    const [caption, setCaption] = useState('')
    const [captionShort, setCaptionShort] = useState('')
    const [hashtags, setHashtags] = useState('')
    const [callToAction, setCallToAction] = useState('')

    // Reject modal
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectionReason, setRejectionReason] = useState('')

    // Post for Me posting state
    const [posting, setPosting] = useState(false)
    const [postError, setPostError] = useState<string | null>(null)
    const [postSuccess, setPostSuccess] = useState(false)
    const [postformePostId, setPostformePostId] = useState<string | null>(null)
    const [postResults, setPostResults] = useState<Array<{ id: string; success: boolean; error: unknown; platform_data: { id?: string; url?: string }; social_account_id: string }>>([]
    )
    const [scheduleMode, setScheduleMode] = useState(false)
    const [scheduleDate, setScheduleDate] = useState('')

    // Image generation modal
    const [imageModalOpen, setImageModalOpen] = useState(false)
    const [refFile, setRefFile] = useState<File | null>(null)
    const [refPreview, setRefPreview] = useState<string | null>(null)
    const [enhanceMode, setEnhanceMode] = useState(false)
    const refInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        async function fetchContent() {
            try {
                const { data, error } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', id)
                    .single()

                if (error || !data) {
                    console.error('Error fetching content:', error)
                    setLoading(false)
                    return
                }

                const item = data as unknown as Content
                setContent(item)
                setCaption(item.caption || '')
                setCaptionShort(item.caption_short || '')
                setHashtags(item.hashtags || '')
                setCallToAction(item.call_to_action || '')
            } catch (err) {
                console.error('Content detail fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchContent()
    }, [id])

    // Save changes
    async function handleSave() {
        if (!content) return
        setSaving(true)

        const { error } = await supabase
            .from('content')
            .update({
                caption,
                caption_short: captionShort,
                hashtags,
                call_to_action: callToAction,
            } as Record<string, unknown>)
            .eq('id', content.id)

        setSaving(false)

        if (!error) {
            setContent((prev) =>
                prev ? { ...prev, caption, caption_short: captionShort, hashtags, call_to_action: callToAction } : null
            )
        }
    }

    // Post via Post for Me API
    async function handlePost(scheduledAt: string | null) {
        if (!content) return
        setPosting(true)
        setPostError(null)
        setPostSuccess(false)

        try {
            const platforms = content.target_platforms || ['instagram']

            const res = await fetch('/api/social-posts/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentId: content.id,
                    clientId: clientId!,
                    platforms,
                    scheduledAt,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Failed to post')
            }

            setPostSuccess(true)
            setPostformePostId(data.postformePostId)

            // Update local content status
            const newStatus = scheduledAt ? 'scheduled' : 'posted'
            setContent((prev) =>
                prev ? { ...prev, status: newStatus as ContentStatus } : null
            )

            // Fetch results after a delay (give time for processing)
            if (!scheduledAt && data.postformePostId) {
                setTimeout(() => fetchPostResults(data.postformePostId), 5000)
            }
        } catch (err) {
            console.error('Post error:', err)
            setPostError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setPosting(false)
            setScheduleMode(false)
        }
    }

    // Fetch post results from Post for Me
    async function fetchPostResults(postId: string) {
        try {
            const res = await fetch(`/api/post-results?postId=${encodeURIComponent(postId)}`)
            if (res.ok) {
                const data = await res.json()
                if (data.results && data.results.length > 0) {
                    setPostResults(data.results)
                } else {
                    // Results may not be ready yet — retry once more after 10s
                    setTimeout(() => retryFetchResults(postId), 10000)
                }
            }
        } catch (err) {
            console.error('Failed to fetch post results:', err)
        }
    }

    async function retryFetchResults(postId: string) {
        try {
            const res = await fetch(`/api/post-results?postId=${encodeURIComponent(postId)}`)
            if (res.ok) {
                const data = await res.json()
                if (data.results) {
                    setPostResults(data.results)
                }
            }
        } catch (err) {
            console.error('Retry fetch results error:', err)
        }
    }

    // Generate image (with optional reference) + poll for result
    async function handleGenerateImage() {
        if (!content) return
        setGeneratingImage(true)

        try {
            if (refFile && enhanceMode) {
                await triggerWorkflowWithFile(
                    'blink-generate-images',
                    {
                        client_id: clientId!,
                        post_id: content.id,
                        topic: captionShort || caption?.substring(0, 60) || '',
                        content_type: content.content_type,
                        mode: 'enhance',
                    },
                    refFile
                )
            } else {
                await triggerWorkflow('blink-generate-images', {
                    client_id: clientId!,
                    post_id: content.id,
                    topic: captionShort || caption?.substring(0, 60) || '',
                    content_type: content.content_type,
                    mode: 'generate',
                })
            }

            // Poll Supabase for image_url (n8n updates the column async)
            let attempts = 0
            const maxAttempts = 20
            const pollInterval = 3000
            let found = false

            while (attempts < maxAttempts && !found) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', content.id)
                    .single()

                if (data) {
                    const item = data as unknown as Content
                    if (item.image_url && item.image_url !== content.image_url) {
                        setContent(item)
                        found = true
                        break
                    }
                }

                attempts++
                if (attempts < maxAttempts) {
                    await new Promise((r) => setTimeout(r, pollInterval))
                }
            }

            // Final fetch even if polling maxed out
            if (!found) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', content.id)
                    .single()
                if (data) setContent(data as unknown as Content)
            }

            // Clear modal state
            setImageModalOpen(false)
            setRefFile(null)
            setRefPreview(null)
        } catch (err) {
            console.error('Image generation error:', err)
        } finally {
            setGeneratingImage(false)
        }
    }

    // File helpers
    function handleRefFileSelect(file: File) {
        if (!file.type.startsWith('image/')) return
        setRefFile(file)
        const reader = new FileReader()
        reader.onload = (e) => setRefPreview(e.target?.result as string)
        reader.readAsDataURL(file)
    }

    function clearRefFile() {
        setRefFile(null)
        setRefPreview(null)
        if (refInputRef.current) refInputRef.current.value = ''
    }

    // Send for approval
    async function handleSendForApproval() {
        if (!content) return
        setActionLoading(true)

        try {
            await triggerWorkflow('blink-send-approval', {
                client_id: clientId!,
                post_id: content.id,
                caption: content.caption,
                image_url: content.image_url,
            })

            await supabase
                .from('content')
                .update({ status: 'pending_approval' } as Record<string, unknown>)
                .eq('id', content.id)

            setContent((prev) => (prev ? { ...prev, status: 'pending_approval' as ContentStatus } : null))
        } catch (err) {
            console.error('Send for approval error:', err)
        } finally {
            setActionLoading(false)
        }
    }

    // Approve
    async function handleApprove() {
        if (!content) return
        setActionLoading(true)

        try {
            await supabase
                .from('content')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString(),
                    approved_by: 'admin',
                } as Record<string, unknown>)
                .eq('id', content.id)

            await triggerWorkflow('blink-approval-response', {
                client_id: clientId!,
                post_id: content.id,
                action: 'approved',
            })

            setContent((prev) =>
                prev
                    ? { ...prev, status: 'approved' as ContentStatus, approved_at: new Date().toISOString() }
                    : null
            )
        } catch (err) {
            console.error('Approve error:', err)
        } finally {
            setActionLoading(false)
        }
    }

    // Reject
    async function handleReject() {
        if (!content || !rejectionReason.trim()) return
        setActionLoading(true)

        try {
            await supabase
                .from('content')
                .update({
                    status: 'rejected',
                    rejection_reason: rejectionReason.trim(),
                } as Record<string, unknown>)
                .eq('id', content.id)

            await triggerWorkflow('blink-approval-response', {
                client_id: clientId!,
                post_id: content.id,
                action: 'rejected',
                reason: rejectionReason.trim(),
            })

            setContent((prev) =>
                prev
                    ? { ...prev, status: 'rejected' as ContentStatus, rejection_reason: rejectionReason.trim() }
                    : null
            )
            setRejectOpen(false)
            setRejectionReason('')
        } catch (err) {
            console.error('Reject error:', err)
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    if (!content) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-500 font-medium">Content not found</p>
                <Button variant="ghost" className="mt-4" onClick={() => router.push('/dashboard/content')}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to content
                </Button>
            </div>
        )
    }

    const referenceImageUrl = (content as unknown as Record<string, unknown>).reference_image_url as string | null

    return (
        <div className="space-y-5">
            {/* Back button */}
            <button
                onClick={() => router.push('/dashboard/content')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blink-dark transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to content
            </button>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* LEFT COLUMN — 60% */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Image preview — with dual view when reference exists */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="relative aspect-video bg-gray-100">
                            {content.image_url ? (
                                <>
                                    <img
                                        src={content.image_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                    {/* Small reference thumbnail if exists */}
                                    {referenceImageUrl && (
                                        <div className="absolute bottom-3 left-3 group">
                                            <div className="relative">
                                                <img
                                                    src={referenceImageUrl}
                                                    alt="Source reference"
                                                    className="h-16 w-16 rounded-lg border-2 border-white shadow-lg object-cover"
                                                />
                                                <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[9px] font-medium flex items-center gap-0.5">
                                                    <Eye className="h-2 w-2" />
                                                    Source
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center gap-3">
                                    <ImageIcon className="h-12 w-12 text-gray-300" />
                                    <p className="text-sm text-gray-400">No image yet</p>
                                    <Button
                                        onClick={() => setImageModalOpen(true)}
                                        disabled={generatingImage}
                                        className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
                                    >
                                        {generatingImage ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-4 w-4" />
                                        )}
                                        {generatingImage ? 'Generating...' : 'Generate Image'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Regenerate button */}
                        {content.image_url && (
                            <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setImageModalOpen(true)}
                                    disabled={generatingImage}
                                    className="gap-1.5 text-xs"
                                >
                                    {generatingImage ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    {generatingImage ? 'Generating...' : 'Regenerate Image'}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Editable fields */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Caption (Long)
                            </label>
                            <Textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                rows={5}
                                placeholder="Write your caption..."
                                className="resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Caption (Short)
                            </label>
                            <Input
                                value={captionShort}
                                onChange={(e) => setCaptionShort(e.target.value)}
                                placeholder="Short version for stories / tweets"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Hashtags
                            </label>
                            <Input
                                value={hashtags}
                                onChange={(e) => setHashtags(e.target.value)}
                                placeholder="#blink #socialmedia"
                            />
                            {hashtags && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {hashtags.split(/[\s,]+/).filter(Boolean).map((tag, i) => (
                                        <span
                                            key={i}
                                            className="text-xs bg-blink-primary/10 text-blink-primary px-2 py-0.5 rounded-full font-medium"
                                        >
                                            {tag.startsWith('#') ? tag : `#${tag}`}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Call to Action
                            </label>
                            <Input
                                value={callToAction}
                                onChange={(e) => setCallToAction(e.target.value)}
                                placeholder="Shop now, Learn more..."
                            />
                        </div>

                        {/* Platform tags (read-only) */}
                        {content.target_platforms && content.target_platforms.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Platforms
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {content.target_platforms.map((p) => (
                                        <PlatformIcon key={p} platform={p} showLabel />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Save button */}
                        <div className="pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN — 40% */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Status card */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-blink-dark font-heading">Status</h3>
                            <StatusBadge status={content.status as ContentStatus} size="md" />
                        </div>

                        {/* Rejection reason */}
                        {content.status === 'rejected' && content.rejection_reason && (
                            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                                <p className="text-xs font-medium text-red-700 mb-1">Rejection Reason</p>
                                <p className="text-sm text-red-600">{content.rejection_reason}</p>
                            </div>
                        )}

                        {/* Action buttons based on status */}
                        <div className="space-y-2">
                            {/* Draft actions */}
                            {content.status === 'draft' && (
                                <>
                                    <Button
                                        onClick={() => setImageModalOpen(true)}
                                        disabled={generatingImage || actionLoading}
                                        variant="outline"
                                        className="w-full justify-start gap-2"
                                    >
                                        {generatingImage ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-4 w-4 text-blink-secondary" />
                                        )}
                                        {generatingImage ? 'Generating...' : 'Generate Image'}
                                    </Button>
                                    <Button
                                        onClick={handleSendForApproval}
                                        disabled={actionLoading}
                                        className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
                                    >
                                        {actionLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                        Send for Approval
                                    </Button>
                                </>
                            )}

                            {/* Pending approval actions */}
                            {content.status === 'pending_approval' && (
                                <>
                                    <Button
                                        onClick={handleApprove}
                                        disabled={actionLoading}
                                        className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                        {actionLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <CheckCircle className="h-4 w-4" />
                                        )}
                                        Approve
                                    </Button>
                                    <Button
                                        onClick={() => setRejectOpen(true)}
                                        disabled={actionLoading}
                                        variant="outline"
                                        className="w-full justify-start gap-2 border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Reject
                                    </Button>
                                    <Button
                                        onClick={() => { }}
                                        variant="outline"
                                        className="w-full justify-start gap-2 border-amber-200 text-amber-600 hover:bg-amber-50"
                                    >
                                        <Pencil className="h-4 w-4" />
                                        Request Edit
                                    </Button>
                                </>
                            )}

                            {/* Approved actions — Post Now / Schedule */}
                            {content.status === 'approved' && (
                                <div className="space-y-3">
                                    {/* Post Now */}
                                    <Button
                                        onClick={() => handlePost(null)}
                                        disabled={posting || postSuccess}
                                        className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
                                    >
                                        {posting && !scheduleMode ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Zap className="h-4 w-4" />
                                        )}
                                        {posting && !scheduleMode ? 'Publishing...' : 'Post Now'}
                                    </Button>

                                    {/* Schedule */}
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <Input
                                                type="datetime-local"
                                                value={scheduleDate}
                                                onChange={(e) => setScheduleDate(e.target.value)}
                                                className="flex-1 text-sm"
                                                min={new Date().toISOString().slice(0, 16)}
                                            />
                                            <Button
                                                onClick={() => {
                                                    if (!scheduleDate) return
                                                    setScheduleMode(true)
                                                    handlePost(new Date(scheduleDate).toISOString())
                                                }}
                                                disabled={posting || postSuccess || !scheduleDate}
                                                variant="outline"
                                                className="gap-1"
                                            >
                                                {posting && scheduleMode ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <CalendarIcon className="h-4 w-4" />
                                                )}
                                                Schedule
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Error */}
                                    {postError && (
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            {postError}
                                        </div>
                                    )}

                                    {/* Success */}
                                    {postSuccess && (
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                                            <CheckCircle className="h-4 w-4 shrink-0" />
                                            Post submitted successfully!
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Post Results (for posted content) */}
                            {(content.status === 'posted' || postformePostId) && postResults.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Post Results</h4>
                                    {postResults.map((r) => (
                                        <div key={r.id} className={cn(
                                            'flex items-center justify-between p-2.5 rounded-lg text-xs',
                                            r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                        )}>
                                            <span className="flex items-center gap-1.5">
                                                {r.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                {r.success ? 'Published' : 'Failed'}
                                            </span>
                                            {r.platform_data?.url && (
                                                <a href={r.platform_data.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                                    View <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rejected actions */}
                            {content.status === 'rejected' && (
                                <Button
                                    onClick={async () => {
                                        setActionLoading(true)
                                        await supabase
                                            .from('content')
                                            .update({ status: 'draft', rejection_reason: null } as Record<string, unknown>)
                                            .eq('id', content.id)
                                        setContent((prev) =>
                                            prev ? { ...prev, status: 'draft' as ContentStatus, rejection_reason: null } : null
                                        )
                                        setActionLoading(false)
                                    }}
                                    disabled={actionLoading}
                                    className="w-full justify-start gap-2 bg-blink-primary hover:bg-blink-primary/90 text-white"
                                >
                                    <Pencil className="h-4 w-4" />
                                    Edit & Resubmit
                                </Button>
                            )}

                            {/* Published info */}
                            {content.status === 'posted' && content.approved_at && (
                                <div className="text-sm text-gray-500 flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-status-published" />
                                    Published{' '}
                                    {new Date(content.approved_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Metadata card */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
                        <h3 className="text-sm font-semibold text-blink-dark font-heading">Details</h3>

                        <div className="space-y-2.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Content Type</span>
                                <span className="text-blink-dark font-medium capitalize">{content.content_type}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Created</span>
                                <span className="text-blink-dark font-medium">
                                    {new Date(content.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Last Updated</span>
                                <span className="text-blink-dark font-medium">
                                    {new Date(content.updated_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </span>
                            </div>
                            {content.ai_model && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">AI Model</span>
                                    <span className="text-blink-dark font-medium">{content.ai_model}</span>
                                </div>
                            )}
                            {content.approved_at && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Approved</span>
                                    <span className="text-blink-dark font-medium">
                                        {new Date(content.approved_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Image Generation Modal ─── */}
            <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blink-primary" />
                            Generate Image
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-5">
                        {/* Mode toggle */}
                        <div className="rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        enhanceMode ? 'bg-amber-50 text-amber-600' : 'bg-blink-primary/10 text-blink-primary'
                                    )}>
                                        {enhanceMode ? <Wand2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-blink-dark">
                                            {enhanceMode ? 'Enhance Source Photo' : 'Pure AI Generation'}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {enhanceMode
                                                ? 'Upload a reference photo to enhance'
                                                : 'Generate from text prompts only'}
                                        </p>
                                    </div>
                                </div>
                                <Switch checked={enhanceMode} onCheckedChange={setEnhanceMode} />
                            </div>
                        </div>

                        {/* Reference image upload — only shown in Enhance mode */}
                        {enhanceMode && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Reference Photo <span className="text-red-500">*</span>
                                </label>

                                {refPreview ? (
                                    <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                                        <img
                                            src={refPreview}
                                            alt="Reference"
                                            className="w-full max-h-48 object-contain bg-gray-50"
                                        />
                                        <button
                                            onClick={clearRefFile}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
                                        >
                                            <X className="h-4 w-4 text-gray-600" />
                                        </button>
                                        <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
                                            <ImageIcon className="h-3 w-3 text-gray-400" />
                                            <span className="text-xs text-gray-500 truncate">{refFile?.name}</span>
                                            <span className="text-xs text-gray-400 ml-auto">
                                                {refFile && (refFile.size / 1024).toFixed(0)} KB
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            const file = e.dataTransfer.files?.[0]
                                            if (file) handleRefFileSelect(file)
                                        }}
                                        onClick={() => refInputRef.current?.click()}
                                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-amber-300 bg-amber-50/30 hover:bg-amber-50/60"
                                    >
                                        <Upload className="h-6 w-6 mx-auto mb-2 text-amber-400" />
                                        <p className="text-xs font-medium text-blink-dark">
                                            Drop your reference image here
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            or click to browse
                                        </p>
                                    </div>
                                )}

                                <input
                                    ref={refInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleRefFileSelect(file)
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
                            onClick={handleGenerateImage}
                            disabled={generatingImage || (enhanceMode && !refFile)}
                            className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2"
                        >
                            {generatingImage ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {enhanceMode ? '🎨 AI is enhancing your photo...' : '✨ AI is painting from your prompt...'}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    {enhanceMode ? 'Enhance Photo' : 'Generate Image'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Content</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Reason for rejection
                        </label>
                        <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={3}
                            placeholder="Explain what needs to change..."
                            className="resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={!rejectionReason.trim() || actionLoading}
                            className="bg-red-600 hover:bg-red-700 text-white gap-2"
                        >
                            {actionLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <XCircle className="h-4 w-4" />
                            )}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
