'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
    CheckCircle,
    XCircle,
    Pencil,
    ImageIcon,
    Loader2,
    PartyPopper,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useClient } from '@/hooks/useClient'
import { triggerWorkflow } from '@/lib/workflows'
import type { Content, Platform } from '@/types/database'



export default function ApprovalsPage() {
    const { clientId, loading: clientLoading } = useClient()
    const [items, setItems] = useState<Content[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
    const [removingId, setRemovingId] = useState<string | null>(null)

    // Reject modal
    const [rejectTarget, setRejectTarget] = useState<Content | null>(null)
    const [rejectionReason, setRejectionReason] = useState('')

    useEffect(() => {
        if (!clientId) return

        async function fetchPending() {
            try {
                const { data, error } = await supabase
                    .from('content')
                    .select('*')
                    .eq('client_id', clientId)
                    .eq('status', 'pending_approval')
                    .order('created_at', { ascending: false })

                if (error) {
                    console.error('Error fetching approvals:', error)
                    return
                }

                setItems((data || []) as unknown as Content[])
            } catch (err) {
                console.error('Approvals fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchPending()
    }, [clientId])

    // Animate out then remove
    function animateOut(id: string) {
        setRemovingId(id)
        setTimeout(() => {
            setItems((prev) => prev.filter((c) => c.id !== id))
            setRemovingId(null)
        }, 400)
    }

    // Approve
    async function handleApprove(item: Content) {
        setActionLoadingId(item.id)

        try {
            await supabase
                .from('content')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString(),
                    approved_by: 'admin',
                })
                .eq('id', item.id)

            await triggerWorkflow('blink-approval-response', {
                client_id: clientId,
                post_id: item.id,
                action: 'approved',
            })

            animateOut(item.id)
        } catch (err) {
            console.error('Approve error:', err)
        } finally {
            setActionLoadingId(null)
        }
    }

    // Reject
    async function handleReject() {
        if (!rejectTarget || !rejectionReason.trim()) return
        setActionLoadingId(rejectTarget.id)

        try {
            await supabase
                .from('content')
                .update({
                    status: 'rejected',
                    rejection_reason: rejectionReason.trim(),
                })
                .eq('id', rejectTarget.id)

            await triggerWorkflow('blink-approval-response', {
                client_id: clientId,
                post_id: rejectTarget.id,
                action: 'rejected',
                reason: rejectionReason.trim(),
            })

            const id = rejectTarget.id
            setRejectTarget(null)
            setRejectionReason('')
            animateOut(id)
        } catch (err) {
            console.error('Reject error:', err)
        } finally {
            setActionLoadingId(null)
        }
    }

    if (loading || clientLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    // Empty state
    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-20 text-center">
                <PartyPopper className="h-12 w-12 mx-auto text-blink-secondary mb-4" />
                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                    All caught up! 🎉
                </h2>
                <p className="text-sm text-gray-500 mt-2">
                    No content is waiting for approval right now
                </p>
                <Link href="/dashboard/generate">
                    <Button className="mt-6 bg-blink-primary hover:bg-blink-primary/90 text-white gap-2">
                        Generate New Content
                    </Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header with counter */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                    <span className="text-lg font-bold text-blink-dark">{items.length}</span>{' '}
                    item{items.length !== 1 ? 's' : ''} pending approval
                </p>
            </div>

            {/* Approval cards */}
            <div className="space-y-3">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            'rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-400',
                            removingId === item.id
                                ? 'opacity-0 translate-x-8 max-h-0 border-0 mb-0 p-0'
                                : 'opacity-100 translate-x-0'
                        )}
                    >
                        <div className="flex flex-col sm:flex-row">
                            {/* Left: thumbnail */}
                            <div className="sm:w-40 h-32 sm:h-auto bg-gray-100 shrink-0 overflow-hidden">
                                {item.image_url ? (
                                    <img
                                        src={item.image_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center min-h-[128px]">
                                        <ImageIcon className="h-8 w-8 text-gray-300" />
                                    </div>
                                )}
                            </div>

                            {/* Middle: content info */}
                            <div className="flex-1 p-4 space-y-2 min-w-0">
                                <p className="text-sm font-medium text-blink-dark line-clamp-2">
                                    {item.caption || 'No caption'}
                                </p>

                                {item.hashtags && (
                                    <p className="text-xs text-gray-400 truncate">{item.hashtags}</p>
                                )}

                                <div className="flex items-center gap-2 flex-wrap">
                                    {item.target_platforms?.map((p) => (
                                        <PlatformIcon key={p} platform={p as Platform} />
                                    ))}
                                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium capitalize">
                                        {item.content_type}
                                    </span>
                                </div>
                            </div>

                            {/* Right: action buttons */}
                            <div className="flex sm:flex-col items-center justify-end gap-2 p-4 sm:pl-0">
                                <Button
                                    onClick={() => handleApprove(item)}
                                    disabled={actionLoadingId === item.id}
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                >
                                    {actionLoadingId === item.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <CheckCircle className="h-3.5 w-3.5" />
                                    )}
                                    Approve
                                </Button>
                                <Button
                                    onClick={() => setRejectTarget(item)}
                                    disabled={actionLoadingId === item.id}
                                    size="sm"
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                </Button>
                                <Link href={`/dashboard/content/${item.id}`}>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-amber-200 text-amber-600 hover:bg-amber-50 gap-1.5"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                        Edit
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Reject Dialog */}
            <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
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
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={!rejectionReason.trim() || actionLoadingId === rejectTarget?.id}
                            className="bg-red-600 hover:bg-red-700 text-white gap-2"
                        >
                            {actionLoadingId === rejectTarget?.id ? (
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
