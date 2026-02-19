'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useClient } from '@/hooks/useClient'
import {
    FileText,
    Send,
    CheckCircle,
    Clock,
    Loader2,
    BarChart3,
    PieChart as PieChartIcon,
    CalendarDays,
    ArrowRight,
} from 'lucide-react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import type { ContentStatus, Platform } from '@/types/database'



/* ─── Types ─── */
interface ContentRow {
    id: string
    caption: string | null
    caption_short: string | null
    content_type: string
    status: ContentStatus
    target_platforms: Platform[]
    image_url: string | null
    created_at: string
}

/* ─── Helpers ─── */
function getWeekStart(date: Date): string {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().slice(0, 10)
}

function formatWeekLabel(weekStart: string): string {
    const d = new Date(weekStart)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/* ─── Status colors for pie chart ─── */
const STATUS_COLORS: Record<string, string> = {
    draft: '#9ca3af',
    pending_approval: '#f59e0b',
    approved: '#22c55e',
    posted: '#3b82f6',
    rejected: '#ef4444',
    scheduled: '#6366f1',
    failed: '#dc2626',
}

const STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    pending_approval: 'Pending',
    approved: 'Approved',
    posted: 'Published',
    rejected: 'Rejected',
    scheduled: 'Scheduled',
    failed: 'Failed',
}

export default function AnalyticsPage() {
    const { clientId, loading: clientLoading } = useClient()
    const [allContent, setAllContent] = useState<ContentRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!clientId) return

        async function load() {
            const { data } = await supabase
                .from('content')
                .select('id, caption, caption_short, content_type, status, target_platforms, image_url, created_at')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })

            if (data) setAllContent(data as ContentRow[])
            setLoading(false)
        }
        load()
    }, [clientId])

    /* ─── Computed stats ─── */
    const stats = useMemo(() => {
        const total = allContent.length
        const published = allContent.filter((c) => c.status === 'posted').length
        const approvedOrPosted = allContent.filter((c) => c.status === 'approved' || c.status === 'posted').length
        const approvalRate = total > 0 ? ((approvedOrPosted / total) * 100).toFixed(1) : '0.0'
        const pending = allContent.filter((c) => c.status === 'pending_approval').length
        return { total, published, approvalRate, pending }
    }, [allContent])

    /* ─── Chart: Content created per week (last 8 weeks) ─── */
    const contentPerWeek = useMemo(() => {
        const weekMap: Record<string, number> = {}
        const now = new Date()
        // Initialize last 8 weeks
        for (let i = 7; i >= 0; i--) {
            const d = new Date(now)
            d.setDate(d.getDate() - i * 7)
            const ws = getWeekStart(d)
            weekMap[ws] = 0
        }
        allContent.forEach((c) => {
            const ws = getWeekStart(new Date(c.created_at))
            if (ws in weekMap) {
                weekMap[ws] += 1
            }
        })
        return Object.entries(weekMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([weekStart, count]) => ({
                week: formatWeekLabel(weekStart),
                posts: count,
            }))
    }, [allContent])

    /* ─── Chart: Content by platform ─── */
    const contentByPlatform = useMemo(() => {
        const platMap: Record<string, number> = {}
        allContent.forEach((c) => {
            const platforms = c.target_platforms || []
            platforms.forEach((p) => {
                platMap[p] = (platMap[p] || 0) + 1
            })
        })
        return Object.entries(platMap)
            .sort(([, a], [, b]) => b - a)
            .map(([platform, count]) => ({ platform, count }))
    }, [allContent])

    /* ─── Chart: Status breakdown ─── */
    const statusBreakdown = useMemo(() => {
        const statusMap: Record<string, number> = {}
        allContent.forEach((c) => {
            statusMap[c.status] = (statusMap[c.status] || 0) + 1
        })
        return Object.entries(statusMap)
            .filter(([, count]) => count > 0)
            .map(([status, count]) => ({
                name: STATUS_LABELS[status] || status,
                value: count,
                status,
            }))
    }, [allContent])

    /* ─── Recent activity (last 10) ─── */
    const recentContent = useMemo(() => {
        return allContent.slice(0, 10)
    }, [allContent])

    if (loading || clientLoading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    /* ─── Empty state ─── */
    if (allContent.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <BarChart3 className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-blink-dark">No content yet</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Generate your first batch of posts to see analytics here.
                    </p>
                </div>
                <Link href="/dashboard/generate">
                    <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blink-primary text-white text-sm font-medium hover:bg-blink-primary/90 transition-colors">
                        Generate Content
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </Link>
            </div>
        )
    }

    const statCards = [
        {
            label: 'Total Posts Created',
            value: stats.total.toString(),
            icon: FileText,
            color: 'text-blue-600 bg-blue-50',
        },
        {
            label: 'Published Posts',
            value: stats.published.toString(),
            icon: Send,
            color: 'text-emerald-600 bg-emerald-50',
        },
        {
            label: 'Approval Rate',
            value: stats.approvalRate + '%',
            icon: CheckCircle,
            color: 'text-violet-600 bg-violet-50',
        },
        {
            label: 'Pending Review',
            value: stats.pending.toString(),
            icon: Clock,
            color: 'text-amber-600 bg-amber-50',
        },
    ]

    return (
        <div className="space-y-6">
            {/* ─── Stats Overview ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div
                        key={card.label}
                        className="rounded-xl border border-gray-200 bg-white p-5 flex items-start gap-4"
                    >
                        <div className={`p-2.5 rounded-lg ${card.color}`}>
                            <card.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-500">{card.label}</p>
                            <p className="text-2xl font-bold text-blink-dark mt-0.5">
                                {card.value}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Charts row ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart — Content Output Over Time */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-blink-dark">
                                Content Output Over Time
                            </h3>
                            <p className="text-xs text-gray-400">Posts created per week (last 8 weeks)</p>
                        </div>
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={contentPerWeek}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                                dataKey="week"
                                tick={{ fontSize: 12, fill: '#9ca3af' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 12, fill: '#9ca3af' }}
                                axisLine={false}
                                tickLine={false}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 8,
                                    border: '1px solid #e5e7eb',
                                    fontSize: 13,
                                }}
                            />
                            <Bar
                                dataKey="posts"
                                fill="#2563EB"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Bar Chart — Content by Platform */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-blink-dark">
                                Content by Platform
                            </h3>
                            <p className="text-xs text-gray-400">Posts grouped by target platform</p>
                        </div>
                        <BarChart3 className="h-4 w-4 text-gray-400" />
                    </div>
                    {contentByPlatform.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={contentByPlatform} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                <XAxis
                                    type="number"
                                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                                    axisLine={false}
                                    tickLine={false}
                                    allowDecimals={false}
                                />
                                <YAxis
                                    dataKey="platform"
                                    type="category"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={80}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: '1px solid #e5e7eb',
                                        fontSize: 13,
                                    }}
                                />
                                <Bar
                                    dataKey="count"
                                    fill="#8b5cf6"
                                    radius={[0, 6, 6, 0]}
                                    maxBarSize={28}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
                            No platform data yet
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Status Breakdown (Donut chart) ─── */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-blink-dark">
                            Content Status Breakdown
                        </h3>
                        <p className="text-xs text-gray-400">Distribution of post statuses</p>
                    </div>
                    <PieChartIcon className="h-4 w-4 text-gray-400" />
                </div>
                {statusBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={statusBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={3}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                labelLine={false}
                            >
                                {statusBreakdown.map((entry) => (
                                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#d1d5db'} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 8,
                                    border: '1px solid #e5e7eb',
                                    fontSize: 13,
                                }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                formatter={(value: string) => (
                                    <span className="text-xs text-gray-600">{value}</span>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
                        No status data yet
                    </div>
                )}
            </div>

            {/* ─── Recent Content Activity Table ─── */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-blink-dark">
                        Recent Content Activity
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Last 10 content items created
                    </p>
                </div>

                {recentContent.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Caption
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Platforms
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Created
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentContent.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-5 py-3 max-w-xs">
                                            <Link
                                                href={`/dashboard/content/${item.id}`}
                                                className="text-blink-dark hover:text-blink-primary transition-colors font-medium truncate block"
                                            >
                                                {item.caption_short || (item.caption ? item.caption.slice(0, 60) + (item.caption.length > 60 ? '…' : '') : 'Untitled')}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-3">
                                            <StatusBadge status={item.status} />
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex gap-1 flex-wrap">
                                                {(item.target_platforms || []).map((p) => (
                                                    <PlatformIcon key={p} platform={p} />
                                                ))}
                                                {(!item.target_platforms || item.target_platforms.length === 0) && (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                                            {formatDate(item.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-5 py-12 text-center text-gray-400 text-sm">
                        No content activity yet
                    </div>
                )}
            </div>
        </div>
    )
}
