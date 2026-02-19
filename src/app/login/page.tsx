'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // If already logged in, redirect to dashboard
    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                router.replace('/dashboard')
            }
        }
        checkAuth()
    }, [router])

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/api/auth/callback`,
            },
        })

        setLoading(false)

        if (error) {
            setError(error.message)
        } else {
            setSent(true)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-blink-light px-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    <Zap className="h-8 w-8 text-blink-secondary" />
                    <span className="text-3xl font-bold text-blink-dark font-heading tracking-tight">
                        Blink
                    </span>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
                    {sent ? (
                        /* Success State */
                        <div className="text-center space-y-4">
                            <div className="mx-auto h-14 w-14 rounded-full bg-blink-accent/10 flex items-center justify-center">
                                <Mail className="h-7 w-7 text-blink-accent" />
                            </div>
                            <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                Check your email
                            </h2>
                            <p className="text-sm text-gray-500">
                                We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
                            </p>
                            <Button
                                variant="ghost"
                                className="text-blink-primary hover:text-blink-primary/80"
                                onClick={() => {
                                    setSent(false)
                                    setEmail('')
                                }}
                            >
                                Use a different email
                            </Button>
                        </div>
                    ) : (
                        /* Login Form */
                        <div className="space-y-6">
                            <div className="text-center">
                                <h2 className="text-xl font-semibold text-blink-dark font-heading">
                                    Sign in to your dashboard
                                </h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Enter your email and we&apos;ll send you a magic link
                                </p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label
                                        htmlFor="email"
                                        className="block text-sm font-medium text-gray-700 mb-1.5"
                                    >
                                        Email address
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@business.com"
                                        required
                                        className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blink-primary/30 focus:border-blink-primary transition-colors"
                                    />
                                </div>

                                {error && (
                                    <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                                        {error}
                                    </p>
                                )}

                                <Button
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full bg-blink-primary hover:bg-blink-primary/90 text-white py-2.5 rounded-lg font-medium transition-colors"
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <ArrowRight className="h-4 w-4 mr-2" />
                                    )}
                                    {loading ? 'Sending link...' : 'Send magic link'}
                                </Button>
                            </form>

                            {/* Signup CTA */}
                            <div className="text-center pt-2 border-t border-gray-100">
                                <p className="text-sm text-gray-500 pt-4">
                                    Don&apos;t have an account?{' '}
                                    <Link href="/get-started" className="text-blink-primary font-medium hover:underline">
                                        Get started for free
                                    </Link>
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="mt-6 text-center text-xs text-gray-400">
                    By signing in you agree to Blink&apos;s Terms of Service
                </p>
            </div>
        </div>
    )
}
