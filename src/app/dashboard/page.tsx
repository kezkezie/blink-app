'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
    FileText,
    Clock,
    CheckCircle,
    Send,
    Sparkles,
    ArrowRight,
    ImageIcon,
    Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { supabase } from '@/lib/supabase'
import type { Content, ContentStatus, Platform } from '@/types/database'

const TEST_CLIENT_ID = '1cc01f92-090a-43d2-b5db-15b1791fe131'

interface Stats {
    total: number
    pending: number
    approved: number
    published: number
}

const statCards = [
    {
        key: 'total' as const,
        label: 'Total Posts',
        icon: FileText,
        color: 'text-blink-primary',
        bg: 'bg-blink-primary/10',
    },
    {
        key: 'pending' as const,
        label: 'Pending Approval',
        icon: Clock,
        color: 'text-amber-500',
        bg: 'bg-amber-50',
    },
    {
        key: 'approved' as const,
        label: 'Approved',
        icon: CheckCircle,
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
    },
    {
        key: 'published' as const,
        label: 'Published',
        icon: Send,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
    },
]

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, approved: 0, published: 0 })
    const [recentContent, setRecentContent] = useState<Content[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch all content for the client
                const { data, error } = await supabase
                    .from('content')
                    .select('*')
                    .eq('client_id', TEST_CLIENT_ID)
                    .order('created_at', { ascending: false })

                if (error) {
                    console.error('Error fetching content:', error)
                    setLoading(false)
                    return
                }

                const all = (data || []) as unknown as Content[]

                // Compute stats
                setStats({
                    total: all.length,
                    pending: all.filter((c) => c.status === 'pending_approval').length,
                    approved: all.filter((c) => c.status === 'approved').length,
                    published: all.filter((c) => c.status === 'posted').length,
                })

                // Recent 5
                setRecentContent(all.slice(0, 5))
            } catch (err) {
                console.error('Dashboard fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div
                        key={card.key}
                        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2.5 ${card.bg}`}>
                                <card.icon className={`h-5 w-5 ${card.color}`} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-blink-dark">{stats[card.key]}</p>
                                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Generate CTA */}
            <div className="rounded-xl border border-dashed border-blink-primary/30 bg-gradient-to-r from-blink-primary/5 to-blink-secondary/5 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blink-primary/10 p-3">
                        <Sparkles className="h-6 w-6 text-blink-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-blink-dark font-heading">
                            Generate New Content
                        </h3>
                        <p className="text-sm text-gray-500">
                            Let AI create captions, images, and a full content plan in minutes
                        </p>
                    </div>
                </div>
                <Link href="/dashboard/generate">
                    <Button className="bg-blink-primary hover:bg-blink-primary/90 text-white gap-2 px-6 shadow-md shadow-blink-primary/20">
                        <Sparkles className="h-4 w-4" />
                        Generate
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </Link>
            </div>

            {/* Recent Content */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-blink-dark font-heading">
                        Recent Content
                    </h2>
                    <Link
                        href="/dashboard/content"
                        className="text-sm text-blink-primary hover:text-blink-primary/80 font-medium flex items-center gap-1"
                    >
                        View all <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {recentContent.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No content yet</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Hit &quot;Generate&quot; to create your first batch of posts
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {recentContent.map((item) => (
                            <li key={item.id}>
                                <Link
                                    href={`/dashboard/content/${item.id}`}
                                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                                >
                                    {/* Thumbnail */}
                                    <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                                        {item.image_url ? (
                                            <img
                                                src={item.image_url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <ImageIcon className="h-5 w-5 text-gray-300" />
                                        )}
                                    </div>

                                    {/* Caption + Meta */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-blink-dark truncate">
                                            {item.caption
                                                ? item.caption.length > 80
                                                    ? item.caption.substring(0, 80) + '…'
                                                    : item.caption
                                                : 'No caption'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {/* Platform icons */}
                                            {item.target_platforms?.map((p) => (
                                                <PlatformIcon key={p} platform={p} />
                                            ))}
                                            <span className="text-xs text-gray-400">
                                                {new Date(item.created_at!).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <StatusBadge status={item.status as ContentStatus} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
