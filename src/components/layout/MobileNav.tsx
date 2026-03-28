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
            <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-16 bg-[#191D23]/95 backdrop-blur-md border-t border-[#57707A]/30 px-2 shadow-[0_-5px_20px_rgba(0,0,0,0.3)] pb-safe">
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
                                'flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200',
                                isActive
                                    ? 'text-[#C5BAC4] drop-shadow-[0_0_8px_rgba(197,186,196,0.4)] font-bold'
                                    : 'text-[#57707A] hover:text-[#989DAA] font-medium'
                            )}
                        >
                            <item.icon className={cn("h-5 w-5", isActive ? "scale-110 transition-transform" : "")} />
                            <span>{item.label}</span>
                        </Link>
                    )
                })}

                {/* More menu trigger */}
                <Sheet>
                    <SheetTrigger asChild>
                        <button className="flex flex-col items-center gap-1 px-2 py-1.5 text-[#57707A] hover:text-[#989DAA] text-[10px] uppercase tracking-wider font-medium transition-colors">
                            <Menu className="h-5 w-5" />
                            <span>More</span>
                        </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-64 bg-[#191D23] border-l border-[#57707A]/30 p-0 shadow-2xl">
                        <SheetHeader className="px-5 py-5 border-b border-[#57707A]/20 bg-[#191D23]/40">
                            <SheetTitle className="flex items-center gap-2 text-[#DEDCDC] font-display text-xl tracking-wide">
                                <div className="h-8 w-8 bg-[#2A2F38] border border-[#57707A]/50 rounded-lg flex items-center justify-center shadow-inner">
                                    <Zap className="h-4 w-4 text-[#C5BAC4]" />
                                </div>
                                Blink
                            </SheetTitle>
                        </SheetHeader>
                        <nav className="flex flex-col gap-1.5 px-3 py-5 overflow-y-auto custom-scrollbar h-full pb-20">
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
                                            'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all duration-200',
                                            isActive
                                                ? 'bg-[#2A2F38] text-[#DEDCDC] border border-[#57707A]/50 shadow-sm'
                                                : 'text-[#989DAA] hover:text-[#DEDCDC] hover:bg-[#57707A]/10 border border-transparent'
                                        )}
                                    >
                                        <item.icon className={cn("h-5 w-5", isActive ? "text-[#C5BAC4]" : "text-[#57707A]")} />
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