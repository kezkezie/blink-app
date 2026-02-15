'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { statusConfig } from '@/components/shared/StatusBadge'
import type { Content, ContentStatus } from '@/types/database'

interface CalendarViewProps {
    content: Content[]
    currentMonth: Date
    onMonthChange: (date: Date) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ content, currentMonth, onMonthChange }: CalendarViewProps) {
    // Build calendar data
    const calendarData = useMemo(() => {
        const year = currentMonth.getFullYear()
        const month = currentMonth.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        // Group content by day
        const contentByDay: Record<number, Content[]> = {}
        content.forEach((item) => {
            const date = new Date(item.created_at)
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

    const monthLabel = currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    })

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <Button variant="ghost" size="icon" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-sm font-semibold text-blink-dark font-heading">
                    {monthLabel}
                </h3>
                <Button variant="ghost" size="icon" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
                {DAYS.map((day) => (
                    <div
                        key={day}
                        className="px-2 py-2 text-center text-xs font-medium text-gray-400"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
                {/* Empty cells for days before 1st */}
                {Array.from({ length: calendarData.firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50 bg-gray-50/50" />
                ))}

                {/* Day cells */}
                {Array.from({ length: calendarData.daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dayContent = calendarData.contentByDay[day] || []
                    const isToday =
                        new Date().getDate() === day &&
                        new Date().getMonth() === currentMonth.getMonth() &&
                        new Date().getFullYear() === currentMonth.getFullYear()

                    return (
                        <div
                            key={day}
                            className={cn(
                                'min-h-[80px] border-b border-r border-gray-50 p-1.5',
                                isToday && 'bg-blink-primary/5'
                            )}
                        >
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    isToday
                                        ? 'text-blink-primary font-bold'
                                        : 'text-gray-500'
                                )}
                            >
                                {day}
                            </span>
                            {/* Content dots */}
                            <div className="flex flex-wrap gap-1 mt-1">
                                {dayContent.slice(0, 4).map((item) => {
                                    const config = statusConfig[item.status as ContentStatus] || statusConfig.draft
                                    return (
                                        <Link
                                            key={item.id}
                                            href={`/dashboard/content/${item.id}`}
                                            className={cn(
                                                'h-2.5 w-2.5 rounded-full transition-transform hover:scale-150',
                                                config.dot
                                            )}
                                            title={item.caption_short || item.caption?.substring(0, 40) || 'Untitled'}
                                        />
                                    )
                                })}
                                {dayContent.length > 4 && (
                                    <span className="text-[10px] text-gray-400 leading-tight">
                                        +{dayContent.length - 4}
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
