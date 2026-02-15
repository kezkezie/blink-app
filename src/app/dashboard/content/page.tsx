'use client'

import { useEffect, useState, useMemo } from 'react'
import {
    LayoutGrid,
    Calendar,
    Filter,
    Loader2,
    FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContentCard } from '@/components/content/ContentCard'
import { CalendarView } from '@/components/content/CalendarView'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Content, ContentStatus, Platform } from '@/types/database'

const TEST_CLIENT_ID = '1cc01f92-090a-43d2-b5db-15b1791fe131'

const statusFilters: { label: string; value: ContentStatus | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Draft', value: 'draft' },
    { label: 'Pending', value: 'pending_approval' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Published', value: 'posted' },
]

const platformFilters: { label: string; value: Platform | 'all' }[] = [
    { label: 'All Platforms', value: 'all' },
    { label: '📸 Instagram', value: 'instagram' },
    { label: '🎵 TikTok', value: 'tiktok' },
    { label: '📘 Facebook', value: 'facebook' },
    { label: '🐦 Twitter', value: 'twitter' },
    { label: '💼 LinkedIn', value: 'linkedin' },
]

export default function ContentPage() {
    const [content, setContent] = useState<Content[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'list' | 'calendar'>('list')
    const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all')
    const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all')
    const [currentMonth, setCurrentMonth] = useState(new Date())

    useEffect(() => {
        async function fetchContent() {
            try {
                const { data, error } = await supabase
                    .from('content')
                    .select('*')
                    .eq('client_id', TEST_CLIENT_ID)
                    .order('created_at', { ascending: false })

                if (error) {
                    console.error('Error fetching content:', error)
                    return
                }

                setContent((data || []) as unknown as Content[])
            } catch (err) {
                console.error('Content fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchContent()
    }, [])

    // Apply filters
    const filteredContent = useMemo(() => {
        let result = content

        if (statusFilter !== 'all') {
            result = result.filter((c) => c.status === statusFilter)
        }

        if (platformFilter !== 'all') {
            result = result.filter((c) =>
                c.target_platforms?.includes(platformFilter as Platform)
            )
        }

        return result
    }, [content, statusFilter, platformFilter])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blink-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* View toggle */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
                    <button
                        onClick={() => setView('list')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                            view === 'list'
                                ? 'bg-white text-blink-dark shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        )}
                    >
                        <LayoutGrid className="h-4 w-4" />
                        List
                    </button>
                    <button
                        onClick={() => setView('calendar')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                            view === 'calendar'
                                ? 'bg-white text-blink-dark shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        )}
                    >
                        <Calendar className="h-4 w-4" />
                        Calendar
                    </button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-4 w-4 text-gray-400" />

                    {/* Status filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as ContentStatus | 'all')}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blink-primary/20 focus:border-blink-primary"
                    >
                        {statusFilters.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </select>

                    {/* Platform filter */}
                    <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as Platform | 'all')}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blink-primary/20 focus:border-blink-primary"
                    >
                        {platformFilters.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </select>

                    {/* Result count */}
                    <span className="text-xs text-gray-400 ml-1">
                        {filteredContent.length} post{filteredContent.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Content */}
            {filteredContent.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
                    <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No content found</p>
                    <p className="text-sm text-gray-400 mt-1">
                        {statusFilter !== 'all' || platformFilter !== 'all'
                            ? 'Try adjusting your filters'
                            : 'Generate your first batch of content to get started'}
                    </p>
                </div>
            ) : view === 'list' ? (
                /* List View — 3-column grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredContent.map((item) => (
                        <ContentCard key={item.id} content={item} />
                    ))}
                </div>
            ) : (
                /* Calendar View */
                <CalendarView
                    content={filteredContent}
                    currentMonth={currentMonth}
                    onMonthChange={setCurrentMonth}
                />
            )}
        </div>
    )
}
