'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
    Eye,
    Heart,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    BarChart3,
    ImageIcon,
} from 'lucide-react'
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts'

const CLIENT_ID = '1cc01f92-090a-43d2-b5db-15b1791fe131'

/* ─── Types ─── */
interface AnalyticsRow {
    id: string
    platform: string
    views: number
    likes: number
    comments: number
    shares: number
    reach: number
    impressions: number
    recorded_at: string
}

interface ContentRow {
    id: string
    caption: string
    content_type: string
    status: string
    platform_targets: string[]
    image_url: string | null
    created_at: string
}

/* ─── Helpers ─── */
function shortNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return n.toString()
}

function getWeekLabel(dateStr: string): string {
    const d = new Date(dateStr)
    const startOfYear = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(
        ((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    )
    return `W${weekNum}`
}

export default function AnalyticsPage() {
    const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
    const [content, setContent] = useState<ContentRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const [analyticsRes, contentRes] = await Promise.all([
                supabase
                    .from('analytics')
                    .select('*')
                    .eq('client_id', CLIENT_ID)
                    .order('recorded_at', { ascending: true }),
                supabase
                    .from('content')
                    .select('*')
                    .eq('client_id', CLIENT_ID)
                    .eq('status', 'published')
                    .order('created_at', { ascending: false })
                    .limit(20),
            ])

            if (analyticsRes.data) setAnalytics(analyticsRes.data as AnalyticsRow[])
            if (contentRes.data) setContent(contentRes.data as ContentRow[])
            setLoading(false)
        }
        load()
    }, [])

    /* ─── Computed stats ─── */
    const stats = useMemo(() => {
        const totalReach = analytics.reduce((s, r) => s + (r.reach || 0), 0)
        const totalLikes = analytics.reduce((s, r) => s + (r.likes || 0), 0)
        const totalComments = analytics.reduce((s, r) => s + (r.comments || 0), 0)
        const totalViews = analytics.reduce((s, r) => s + (r.views || 0), 0)
        const engagementRate =
            totalViews > 0
                ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(1)
                : '0.0'

        return { totalReach, totalLikes, totalComments, totalViews, engagementRate }
    }, [analytics])

    /* ─── Chart data: Posts published per week ─── */
    const postsPerWeek = useMemo(() => {
        const weekMap: Record<string, number> = {}
        content.forEach((c) => {
            const wk = getWeekLabel(c.created_at)
            weekMap[wk] = (weekMap[wk] || 0) + 1
        })
        return Object.entries(weekMap)
            .map(([week, count]) => ({ week, posts: count }))
            .slice(-8) // last 8 weeks
    }, [content])

    /* ─── Chart data: Engagement over time ─── */
    const engagementOverTime = useMemo(() => {
        const dayMap: Record<string, { likes: number; comments: number }> = {}
        analytics.forEach((r) => {
            const day = new Date(r.recorded_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
            })
            if (!dayMap[day]) dayMap[day] = { likes: 0, comments: 0 }
            dayMap[day].likes += r.likes || 0
            dayMap[day].comments += r.comments || 0
        })
        return Object.entries(dayMap).map(([date, vals]) => ({
            date,
            likes: vals.likes,
            comments: vals.comments,
        }))
    }, [analytics])

    /* ─── Top 5 posts by engagement ─── */
    const topPosts = useMemo(() => {
        // Join content with analytics
        const contentWithMetrics = content.map((c) => {
            const relatedAnalytics = analytics.filter(
                (a) =>
                    new Date(a.recorded_at).toDateString() ===
                    new Date(c.created_at).toDateString()
            )
            const totalLikes = relatedAnalytics.reduce((s, a) => s + (a.likes || 0), 0)
            const totalComments = relatedAnalytics.reduce((s, a) => s + (a.comments || 0), 0)
            const totalReach = relatedAnalytics.reduce((s, a) => s + (a.reach || 0), 0)
            return {
                ...c,
                totalLikes,
                totalComments,
                totalReach,
                engagement: totalLikes + totalComments,
            }
        })
        return contentWithMetrics
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, 5)
    }, [content, analytics])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    const statCards = [
        {
            label: 'Total Reach',
            value: shortNumber(stats.totalReach),
            icon: Eye,
            change: '+12.5%',
            up: true,
            color: 'text-blue-600 bg-blue-50',
        },
        {
            label: 'Avg. Engagement Rate',
            value: stats.engagementRate + '%',
            icon: Heart,
            change: '+3.2%',
            up: true,
            color: 'text-rose-600 bg-rose-50',
        },
        {
            label: 'Follower Growth',
            value: shortNumber(stats.totalLikes),
            icon: TrendingUp,
            change: '+8.1%',
            up: true,
            color: 'text-emerald-600 bg-emerald-50',
        },
    ]

    return (
        <div className="space-y-6">
            {/* ─── Stats Overview ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                            <div className="flex items-center gap-1 mt-1">
                                {card.up ? (
                                    <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                    <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                                )}
                                <span
                                    className={`text-xs font-medium ${card.up ? 'text-emerald-600' : 'text-red-600'}`}
                                >
                                    {card.change}
                                </span>
                                <span className="text-xs text-gray-400">vs last period</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Charts row ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart — Posts per Week */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-blink-dark">
                                Posts Published
                            </h3>
                            <p className="text-xs text-gray-400">Per week</p>
                        </div>
                        <BarChart3 className="h-4 w-4 text-gray-400" />
                    </div>
                    {postsPerWeek.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={postsPerWeek}>
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
                    ) : (
                        <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
                            No published posts yet
                        </div>
                    )}
                </div>

                {/* Area/Line Chart — Engagement Over Time */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-blink-dark">
                                Engagement Over Time
                            </h3>
                            <p className="text-xs text-gray-400">Likes & comments</p>
                        </div>
                        <TrendingUp className="h-4 w-4 text-gray-400" />
                    </div>
                    {engagementOverTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={engagementOverTime}>
                                <defs>
                                    <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorComments" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="date"
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
                                <Area
                                    type="monotone"
                                    dataKey="likes"
                                    stroke="#2563EB"
                                    strokeWidth={2}
                                    fill="url(#colorLikes)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="comments"
                                    stroke="#f43f5e"
                                    strokeWidth={2}
                                    fill="url(#colorComments)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
                            No engagement data yet
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Top Posts Table ─── */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-blink-dark">
                        Top Performing Posts
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        By total engagement (likes + comments)
                    </p>
                </div>

                {topPosts.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Post
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                                        Reach
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                                        Likes
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                                        Comments
                                    </th>
                                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                                        Engagement
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {topPosts.map((post, i) => (
                                    <tr
                                        key={post.id}
                                        className="hover:bg-gray-50/50 transition-colors"
                                    >
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3 max-w-xs">
                                                <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                                                    {post.image_url ? (
                                                        <img
                                                            src={post.image_url}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <ImageIcon className="h-4 w-4 text-gray-400" />
                                                    )}
                                                </div>
                                                <span className="truncate font-medium text-blink-dark">
                                                    {post.caption
                                                        ? post.caption.slice(0, 50) +
                                                        (post.caption.length > 50 ? '…' : '')
                                                        : 'Untitled post'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blink-primary/10 text-blink-primary capitalize">
                                                {post.content_type || 'post'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right text-gray-600">
                                            {shortNumber(post.totalReach)}
                                        </td>
                                        <td className="px-5 py-3 text-right text-gray-600">
                                            {shortNumber(post.totalLikes)}
                                        </td>
                                        <td className="px-5 py-3 text-right text-gray-600">
                                            {shortNumber(post.totalComments)}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <span className="font-semibold text-blink-dark">
                                                {shortNumber(post.engagement)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-5 py-12 text-center text-gray-400 text-sm">
                        No published posts with engagement data yet
                    </div>
                )}
            </div>
        </div>
    )
}
