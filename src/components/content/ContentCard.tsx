import Link from 'next/link'
import { ImageIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import type { Content, ContentStatus, Platform } from '@/types/database'

interface ContentCardProps {
    content: Content
}

export function ContentCard({ content }: ContentCardProps) {
    return (
        <Link
            href={`/dashboard/content/${content.id}`}
            className="group block rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition-all overflow-hidden"
        >
            {/* Image */}
            <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                {content.image_url ? (
                    <img
                        src={content.image_url}
                        alt=""
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-gray-300" />
                    </div>
                )}
                {/* Status badge overlay */}
                <div className="absolute top-2 right-2">
                    <StatusBadge status={content.status as ContentStatus} />
                </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-2">
                {/* Caption preview */}
                <p className="text-sm font-medium text-blink-dark line-clamp-2 min-h-[2.5rem]">
                    {content.caption
                        ? content.caption.length > 80
                            ? content.caption.substring(0, 80) + '…'
                            : content.caption
                        : 'No caption'}
                </p>

                {/* Meta row */}
                <div className="flex items-center justify-between">
                    {/* Platforms */}
                    <div className="flex items-center gap-1">
                        {content.target_platforms?.slice(0, 3).map((p) => (
                            <PlatformIcon key={p} platform={p} />
                        ))}
                        {content.target_platforms && content.target_platforms.length > 3 && (
                            <span className="text-xs text-gray-400">
                                +{content.target_platforms.length - 3}
                            </span>
                        )}
                    </div>

                    {/* Content type */}
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium capitalize">
                        {content.content_type}
                    </span>
                </div>
            </div>
        </Link>
    )
}
