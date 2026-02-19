'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    FileText,
    Sparkles,
    CheckCircle,
    BarChart3,
    Settings,
    Zap,
    LogOut,
    User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { supabase } from '@/lib/supabase'

const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Content', href: '/dashboard/content', icon: FileText },
    { label: 'Generate', href: '/dashboard/generate', icon: Sparkles },
    { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircle },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
    collapsed?: boolean
    userEmail?: string | null
}

export function Sidebar({ collapsed = false, userEmail }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    async function handleLogout() {
        await supabase.auth.signOut()
        router.replace('/login')
    }

    return (
        <aside
            className={cn(
                'hidden md:flex flex-col h-screen bg-blink-dark text-white sticky top-0 transition-all duration-300',
                collapsed ? 'w-[68px]' : 'w-[240px]'
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
                <Zap className="h-6 w-6 text-blink-secondary shrink-0" />
                {!collapsed && (
                    <span className="text-xl font-bold tracking-tight font-heading">
                        Blink
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
                {navItems.map((item) => {
                    const isActive =
                        item.href === '/dashboard'
                            ? pathname === '/dashboard'
                            : pathname.startsWith(item.href)

                    const linkContent = (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-blink-primary text-white shadow-md shadow-blink-primary/25'
                                    : 'text-white/60 hover:text-white hover:bg-white/8'
                            )}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>{item.label}</span>}
                        </Link>
                    )

                    if (collapsed) {
                        return (
                            <Tooltip key={item.href} delayDuration={0}>
                                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                                <TooltipContent side="right" className="font-medium">
                                    {item.label}
                                </TooltipContent>
                            </Tooltip>
                        )
                    }

                    return linkContent
                })}
            </nav>

            {/* User Info + Logout */}
            <div className="px-3 py-3 border-t border-white/10 space-y-2">
                {/* User email */}
                {!collapsed && userEmail && (
                    <div className="flex items-center gap-2 px-3 py-2">
                        <div className="h-7 w-7 rounded-full bg-blink-primary/20 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-blink-secondary" />
                        </div>
                        <span className="text-xs text-white/50 truncate">{userEmail}</span>
                    </div>
                )}

                {/* Logout button */}
                {collapsed ? (
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <button
                                onClick={handleLogout}
                                className="flex items-center justify-center w-full px-3 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                            >
                                <LogOut className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                            Sign Out
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                    >
                        <LogOut className="h-5 w-5 shrink-0" />
                        <span>Sign Out</span>
                    </button>
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/10">
                {!collapsed && (
                    <p className="text-xs text-white/40">© 2026 Blink</p>
                )}
            </div>
        </aside>
    )
}

export { navItems }
