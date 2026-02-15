import { cn } from '@/lib/utils'
import type { ContentStatus } from '@/types/database'

const statusConfig: Record<
    ContentStatus,
    { label: string; color: string; bg: string; dot: string }
> = {
    draft: {
        label: 'Draft',
        color: 'text-gray-600',
        bg: 'bg-gray-100',
        dot: 'bg-status-draft',
    },
    pending_approval: {
        label: 'Pending',
        color: 'text-amber-700',
        bg: 'bg-amber-50',
        dot: 'bg-status-pending',
    },
    approved: {
        label: 'Approved',
        color: 'text-green-700',
        bg: 'bg-green-50',
        dot: 'bg-status-approved',
    },
    rejected: {
        label: 'Rejected',
        color: 'text-red-700',
        bg: 'bg-red-50',
        dot: 'bg-status-rejected',
    },
    scheduled: {
        label: 'Scheduled',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        dot: 'bg-status-published',
    },
    posted: {
        label: 'Published',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        dot: 'bg-status-published',
    },
    failed: {
        label: 'Failed',
        color: 'text-red-700',
        bg: 'bg-red-50',
        dot: 'bg-status-rejected',
    },
}

interface StatusBadgeProps {
    status: ContentStatus
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
    const config = statusConfig[status] ?? statusConfig.draft

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-medium',
                config.bg,
                config.color,
                size === 'sm' && 'px-2 py-0.5 text-xs',
                size === 'md' && 'px-3 py-1 text-sm',
                size === 'lg' && 'px-4 py-1.5 text-base',
                className
            )}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
            {config.label}
        </span>
    )
}

export { statusConfig }
