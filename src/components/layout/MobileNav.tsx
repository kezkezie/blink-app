'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { navItems } from './Sidebar'

export function MobileNav() {
    const pathname = usePathname()

    return (
        <div className="md:hidden">
            {/* Bottom navigation bar for quick access */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-16 bg-blink-dark border-t border-white/10 px-2">
                {navItems.slice(0, 5).map((item) => {
                    const isActive =
                        item.href === '/dashboard'
                            ? pathname === '/dashboard'
                            : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs transition-colors',
                                isActive
                                    ? 'text-blink-secondary'
                                    : 'text-white/50 hover:text-white/80'
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    )
                })}

                {/* More menu trigger */}
                <Sheet>
                    <SheetTrigger asChild>
                        <button className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-white/50 hover:text-white/80 text-xs">
                            <Menu className="h-5 w-5" />
                            <span className="font-medium">More</span>
                        </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-64 bg-blink-dark border-white/10 p-0">
                        <SheetHeader className="px-5 py-5 border-b border-white/10">
                            <SheetTitle className="flex items-center gap-2 text-white">
                                <Zap className="h-5 w-5 text-blink-secondary" />
                                Blink
                            </SheetTitle>
                        </SheetHeader>
                        <nav className="flex flex-col gap-1 px-3 py-4">
                            {navItems.map((item) => {
                                const isActive =
                                    item.href === '/dashboard'
                                        ? pathname === '/dashboard'
                                        : pathname.startsWith(item.href)

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-blink-primary text-white'
                                                : 'text-white/60 hover:text-white hover:bg-white/8'
                                        )}
                                    >
                                        <item.icon className="h-5 w-5" />
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </nav>
                    </SheetContent>
                </Sheet>
            </nav>
        </div>
    )
}
