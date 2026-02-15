'use client'

import { usePathname } from 'next/navigation'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'

const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/dashboard/content': 'Content',
    '/dashboard/generate': 'Generate Content',
    '/dashboard/approvals': 'Approvals',
    '/dashboard/brand': 'Brand Profile',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/settings': 'Settings',
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    // Resolve page title: exact match first, then prefix match
    const pageTitle =
        pageTitles[pathname] ||
        Object.entries(pageTitles).find(([path]) =>
            pathname.startsWith(path) && path !== '/dashboard'
        )?.[1] ||
        'Dashboard'

    return (
        <TooltipProvider delayDuration={0}>
            <div className="flex min-h-screen bg-blink-light">
                {/* Desktop Sidebar */}
                <Sidebar />

                {/* Main Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <TopBar pageTitle={pageTitle} />

                    <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
                        <div className="mx-auto max-w-7xl">
                            {children}
                        </div>
                    </main>
                </div>

                {/* Mobile Navigation */}
                <MobileNav />
            </div>
        </TooltipProvider>
    )
}
