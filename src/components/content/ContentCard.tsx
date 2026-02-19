'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Loader2, RefreshCw, Palette } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { triggerWorkflow } from '@/lib/workflows'
import type { Content, ContentStatus, Platform } from '@/types/database'



interface ContentCardProps {
    content: Content
    clientId?: string | null
    onUpdate?: (updated: Content) => void
}

export function ContentCard({ content, clientId, onUpdate }: ContentCardProps) {
    const [regeneratingCaption, setRegeneratingCaption] = useState(false)
    const [regeneratingImage, setRegeneratingImage] = useState(false)
    const isActionable = content.status === 'draft' || content.status === 'rejected'

    async function handleRegenCaption(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        setRegeneratingCaption(true)

        try {
            await triggerWorkflow('blink-write-captions', {
                client_id: clientId,
                post_id: content.id,
                regenerate: true,
            })

            // Poll for updated caption
            let attempts = 0
            while (attempts < 10) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', content.id)
                    .single()

                if (data) {
                    const updated = data as unknown as Content
                    if (updated.caption !== content.caption || updated.updated_at !== content.updated_at) {
                        onUpdate?.(updated)
                        break
                    }
                }
                attempts++
                await new Promise((r) => setTimeout(r, 2000))
            }
        } catch (err) {
            console.error('Regenerate caption error:', err)
        } finally {
            setRegeneratingCaption(false)
        }
    }

    async function handleRegenImage(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        setRegeneratingImage(true)

        try {
            await triggerWorkflow('blink-generate-images', {
                client_id: clientId,
                post_id: content.id,
                topic: content.caption_short || content.caption?.substring(0, 60) || '',
                content_type: content.content_type,
                mode: 'generate',
            })

            // Poll for updated image
            let attempts = 0
            while (attempts < 20) {
                const { data } = await supabase
                    .from('content')
                    .select('*')
                    .eq('id', content.id)
                    .single()

                if (data) {
                    const updated = data as unknown as Content
                    if (updated.image_url !== content.image_url || updated.updated_at !== content.updated_at) {
                        onUpdate?.(updated)
                        break
                    }
                }
                attempts++
                await new Promise((r) => setTimeout(r, 3000))
            }
        } catch (err) {
            console.error('Regenerate image error:', err)
        } finally {
            setRegeneratingImage(false)
        }
    }

    const isLoading = regeneratingCaption || regeneratingImage

    return (
        <div className="relative group">
            <Link
                href={`/dashboard/content/${content.id}`}
                className="block rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition-all overflow-hidden"
            >
                {/* Image */}
                <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                    {content.image_url ? (
                        <img
                            src={content.image_url}
                            alt=""
                            className={cn(
                                'h-full w-full object-cover group-hover:scale-105 transition-transform duration-300',
                                isLoading && 'opacity-50'
                            )}
                        />
                    ) : (
                        <div className="h-full w-full flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-gray-300" />
                        </div>
                    )}

                    {/* Loading overlay */}
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                            <div className="flex items-center gap-2 bg-white/90 rounded-full px-3 py-1.5 shadow-md">
                                <Loader2 className="h-4 w-4 animate-spin text-blink-primary" />
                                <span className="text-xs font-medium text-blink-dark">
                                    {regeneratingCaption ? 'Regenerating caption...' : 'Regenerating image...'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Status badge overlay */}
                    <div className="absolute top-2 right-2">
                        <StatusBadge status={content.status as ContentStatus} />
                    </div>

                    {/* Hover action bar — only for draft/rejected */}
                    {isActionable && !isLoading && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <div className="flex gap-2">
                                <button
                                    onClick={handleRegenCaption}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-blink-dark text-xs font-medium transition-colors"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    Regen Caption
                                </button>
                                <button
                                    onClick={handleRegenImage}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-blink-dark text-xs font-medium transition-colors"
                                >
                                    <Palette className="h-3 w-3" />
                                    Regen Image
                                </button>
                            </div>
                        </div>
                    )}
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
        </div>
    )
}
