'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, ImageIcon, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, statusConfig } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Content, ContentStatus } from '@/types/database'

interface CalendarViewProps {
    content: Content[]
    currentMonth: Date
    onMonthChange: (date: Date) => void
    onContentUpdate?: (updated: Content) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ content, currentMonth, onMonthChange, onContentUpdate }: CalendarViewProps) {
    const router = useRouter()
    const [draggedItem, setDraggedItem] = useState<Content | null>(null)
    const [dropTarget, setDropTarget] = useState<number | null>(null)
    const [sidePanelDate, setSidePanelDate] = useState<number | null>(null)
    const [updatingItem, setUpdatingItem] = useState<string | null>(null)

    // Build calendar data
    const calendarData = useMemo(() => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        // Group content by day — use scheduled_date first, then created_at
        const contentByDay: Record<number, Content[]> = {}
        content.forEach((item) => {
            const dateStr = (item as Record<string, unknown>).scheduled_date as string | null
            const date = new Date(dateStr || item.created_at)
            if (date.getFullYear() === year && date.getMonth() === month) {
                const day = date.getDate()
                if (!contentByDay[day]) contentByDay[day] = []
                contentByDay[day].push(item)
            }
        })

        return { firstDay, daysInMonth, contentByDay }
    }, [content, currentMonth])

    const prevMonth = () => {
        const prev = new Date(currentMonth)
        prev.setMonth(prev.getMonth() - 1)
        onMonthChange(prev)
    }

    const nextMonth = () => {
        const next = new Date(currentMonth)
        next.setMonth(next.getMonth() + 1)
        onMonthChange(next)
    }

    const goToToday = () => {
        onMonthChange(new Date())
    }

    const monthLabel = currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    })

    const today = new Date()
    const isCurrentMonth = today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear()

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, item: Content) => {
        setDraggedItem(item)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', item.id)
        // Set a small drag image
        const elem = e.currentTarget as HTMLElement
        if (elem) {
            e.dataTransfer.setDragImage(elem, 10, 10)
        }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, day: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropTarget(day)
    }, [])

    const handleDragLeave = useCallback(() => {
        setDropTarget(null)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent, targetDay: number) => {
        e.preventDefault()
        setDropTarget(null)

        if (!draggedItem) return

        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const newDate = new Date(year, month, targetDay)
        const isoDate = newDate.toISOString()

        setUpdatingItem(draggedItem.id)

        try {
            // Try writing to scheduled_date first, fallback to updated_at
            const { error } = await supabase
                .from('content')
                .update({
                    scheduled_date: isoDate,
                    updated_at: new Date().toISOString(),
                } as Record<string, unknown>)
                .eq('id', draggedItem.id)

            if (error) {
                // Fallback — just update updated_at
                await supabase
                    .from('content')
                    .update({
                        updated_at: isoDate,
                    } as Record<string, unknown>)
                    .eq('id', draggedItem.id)
            }

            // Notify parent of update
            const updatedItem = {
                ...draggedItem,
                updated_at: isoDate,
            }
            ;(updatedItem as Record<string, unknown>).scheduled_date = isoDate
            onContentUpdate?.(updatedItem)
        } catch (err) {
            console.error('Failed to update content date:', err)
        } finally {
            setUpdatingItem(null)
            setDraggedItem(null)
        }
    }, [draggedItem, currentMonth, onContentUpdate])

    const handleDragEnd = useCallback(() => {
        setDraggedItem(null)
        setDropTarget(null)
    }, [])

    // Click handlers
    const handlePostClick = useCallback((e: React.MouseEvent, itemId: string) => {
        e.stopPropagation()
        router.push(`/dashboard/content/${itemId}`)
    }, [router])

    const handleDateClick = useCallback((day: number) => {
        setSidePanelDate((prev) => (prev === day ? null : day))
    }, [])

    // Side panel content
    const sidePanelContent = sidePanelDate ? (calendarData.contentByDay[sidePanelDate] || []) : []

    return (
        <div className="flex gap-4">
            {/* Main Calendar */}
            <div className={cn(
                'rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all',
                sidePanelDate ? 'flex-1' : 'w-full'
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={prevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <h3 className="text-sm font-semibold text-blink-dark font-heading min-w-[160px] text-center">
                            {monthLabel}
                        </h3>
                        <Button variant="ghost" size="icon" onClick={nextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    {!isCurrentMonth && (
                        <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7">
                            Today
                        </Button>
                    )}
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                    {DAYS.map((day, i) => (
                        <div
                            key={day}
                            className={cn(
                                'px-2 py-2 text-center text-xs font-medium',
                                i === 0 || i === 6 ? 'text-gray-400 bg-gray-50/50' : 'text-gray-500'
                            )}
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {/* Empty cells for days before 1st */}
                    {Array.from({ length: calendarData.firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-gray-50 bg-gray-50/30" />
                    ))}

                    {/* Day cells */}
                    {Array.from({ length: calendarData.daysInMonth }).map((_, i) => {
                        const day = i + 1
                        const dayContent = calendarData.contentByDay[day] || []
                        const dayOfWeek = (calendarData.firstDay + i) % 7
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                        const isToday = isCurrentMonth && today.getDate() === day
                        const isDragTarget = dropTarget === day
                        const isSelected = sidePanelDate === day
                        const visibleCount = 3
                        const extraCount = dayContent.length - visibleCount

                        return (
                            <div
                                key={day}
                                onClick={() => handleDateClick(day)}
                                onDragOver={(e) => handleDragOver(e, day)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, day)}
                                className={cn(
                                    'min-h-[100px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition-colors',
                                    isWeekend && 'bg-gray-50/40',
                                    isToday && 'bg-blink-primary/5 ring-1 ring-inset ring-blink-primary/20',
                                    isDragTarget && 'bg-blink-primary/10 ring-2 ring-inset ring-blink-primary/40',
                                    isSelected && 'bg-blink-primary/5'
                                )}
                            >
                                {/* Day number */}
                                <div className="flex items-center justify-between mb-1">
                                    <span
                                        className={cn(
                                            'text-xs font-medium h-5 w-5 flex items-center justify-center rounded-full',
                                            isToday
                                                ? 'bg-blink-primary text-white font-bold'
                                                : isWeekend
                                                    ? 'text-gray-400'
                                                    : 'text-gray-600'
                                        )}
                                    >
                                        {day}
                                    </span>
                                    {dayContent.length > 0 && (
                                        <span className="text-[9px] text-gray-400 font-medium">
                                            {dayContent.length}
                                        </span>
                                    )}
                                </div>

                                {/* Post cards */}
                                <div className="space-y-1">
                                    {dayContent.slice(0, visibleCount).map((item) => {
                                        const config = statusConfig[item.status as ContentStatus] || statusConfig.draft
                                        const isUpdating = updatingItem === item.id
                                        const isDragging = draggedItem?.id === item.id

                                        return (
                                            <div
                                                key={item.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, item)}
                                                onDragEnd={handleDragEnd}
                                                onClick={(e) => handlePostClick(e, item.id)}
                                                className={cn(
                                                    'flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all text-left group/card',
                                                    isDragging && 'opacity-40 scale-95',
                                                    isUpdating && 'opacity-60 animate-pulse'
                                                )}
                                            >
                                                {/* Status stripe */}
                                                <div className={cn('w-0.5 h-6 rounded-full shrink-0', config.dot)} />

                                                {/* Thumbnail */}
                                                {item.image_url ? (
                                                    <img
                                                        src={item.image_url}
                                                        alt=""
                                                        className="h-6 w-6 rounded object-cover shrink-0"
                                                    />
                                                ) : (
                                                    <div className="h-6 w-6 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                                        <ImageIcon className="h-3 w-3 text-gray-300" />
                                                    </div>
                                                )}

                                                {/* Caption snippet */}
                                                <span className="text-[10px] text-gray-600 truncate flex-1 leading-tight">
                                                    {item.caption_short || item.caption?.substring(0, 30) || 'Untitled'}
                                                </span>
                                            </div>
                                        )
                                    })}

                                    {extraCount > 0 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setSidePanelDate(day)
                                            }}
                                            className="w-full text-center py-0.5 text-[10px] text-blink-primary hover:text-blink-primary/80 font-medium"
                                        >
                                            +{extraCount} more
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Side Panel */}
            {sidePanelDate !== null && (
                <div className="w-72 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <div>
                            <h4 className="text-sm font-semibold text-blink-dark">
                                {currentMonth.toLocaleDateString('en-US', { month: 'short' })} {sidePanelDate}
                            </h4>
                            <p className="text-xs text-gray-500">
                                {sidePanelContent.length} post{sidePanelContent.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <button
                            onClick={() => setSidePanelDate(null)}
                            className="p-1 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            <X className="h-4 w-4 text-gray-500" />
                        </button>
                    </div>

                    <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
                        {sidePanelContent.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-6">No posts for this day</p>
                        ) : (
                            sidePanelContent.map((item) => {
                                const config = statusConfig[item.status as ContentStatus] || statusConfig.draft
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => router.push(`/dashboard/content/${item.id}`)}
                                        className="rounded-lg border border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all overflow-hidden"
                                    >
                                        {/* Image */}
                                        {item.image_url && (
                                            <div className="relative h-28 bg-gray-100">
                                                <img
                                                    src={item.image_url}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                                <div className="absolute top-1.5 right-1.5">
                                                    <StatusBadge status={item.status as ContentStatus} />
                                                </div>
                                            </div>
                                        )}

                                        <div className="p-2.5 space-y-1.5">
                                            {!item.image_url && (
                                                <StatusBadge status={item.status as ContentStatus} />
                                            )}
                                            <p className="text-xs text-blink-dark font-medium line-clamp-2 leading-relaxed">
                                                {item.caption_short || item.caption?.substring(0, 80) || 'No caption'}
                                            </p>
                                            <div className="flex items-center gap-1">
                                                {item.target_platforms?.slice(0, 3).map((p) => (
                                                    <PlatformIcon key={p} platform={p} />
                                                ))}
                                                <span className="text-[10px] text-gray-400 ml-auto capitalize">
                                                    {item.content_type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
