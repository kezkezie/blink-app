import { cn } from '@/lib/utils'
import type { Platform } from '@/types/database'

const platformMeta: Record<Platform, { label: string; color: string; icon: string }> = {
    instagram: {
        label: 'Instagram',
        color: 'text-pink-600 bg-pink-50',
        icon: '📸',
    },
    tiktok: {
        label: 'TikTok',
        color: 'text-gray-800 bg-gray-100',
        icon: '🎵',
    },
    facebook: {
        label: 'Facebook',
        color: 'text-blue-600 bg-blue-50',
        icon: '📘',
    },
    twitter: {
        label: 'Twitter',
        color: 'text-sky-600 bg-sky-50',
        icon: '🐦',
    },
    linkedin: {
        label: 'LinkedIn',
        color: 'text-blue-700 bg-blue-50',
        icon: '💼',
    },
    youtube: {
        label: 'YouTube',
        color: 'text-red-600 bg-red-50',
        icon: '▶️',
    },
    pinterest: {
        label: 'Pinterest',
        color: 'text-red-700 bg-red-50',
        icon: '📌',
    },
    shopify: {
        label: 'Shopify',
        color: 'text-green-700 bg-green-50',
        icon: '🛍️',
    },
}

interface PlatformIconProps {
    platform: Platform
    showLabel?: boolean
    className?: string
}

export function PlatformIcon({ platform, showLabel = false, className }: PlatformIconProps) {
    const meta = platformMeta[platform]
    if (!meta) return null

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                meta.color,
                className
            )}
            title={meta.label}
        >
            <span className="text-sm">{meta.icon}</span>
            {showLabel && <span>{meta.label}</span>}
        </span>
    )
}

export { platformMeta }
