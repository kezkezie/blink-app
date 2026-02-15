import Link from 'next/link'
import {
  Zap,
  Brain,
  PenTool,
  Image,
  MessageSquare,
  Send,
  BarChart3,
  ArrowRight,
  CheckCircle,
  Briefcase,
  Sparkles,
  Eye,
} from 'lucide-react'

const features = [
  { icon: Brain, title: 'AI Content Strategy', desc: 'Get a full content calendar planned by AI, tailored to your brand and audience' },
  { icon: PenTool, title: 'Smart Captions', desc: 'Engaging captions written in your brand voice for every platform' },
  { icon: Image, title: 'Image Generation', desc: 'Stunning visuals created automatically to match your content' },
  { icon: MessageSquare, title: 'Telegram Approvals', desc: 'Review and approve posts right from your Telegram app' },
  { icon: Send, title: 'Auto-Posting', desc: 'Content published automatically at the best times for engagement' },
  { icon: BarChart3, title: 'Analytics', desc: 'Track performance and optimize your content strategy with data' },
]

const pricing = [
  {
    name: 'Starter',
    price: '5,000',
    desc: 'Perfect for getting started',
    popular: false,
    features: ['1 platform', '12 posts/month', 'AI captions', 'Image generation', 'Email support'],
  },
  {
    name: 'Growth',
    price: '12,000',
    desc: 'Most popular for growing businesses',
    popular: true,
    features: ['3 platforms', '30 posts/month', 'AI captions', 'Image generation', 'Auto-replies', 'Telegram approvals', 'Priority support'],
  },
  {
    name: 'Premium',
    price: '25,000',
    desc: 'Full management, zero effort',
    popular: false,
    features: ['Unlimited platforms', 'Daily posts', 'AI captions', 'Image generation', 'Auto-replies', 'Full management', 'Dedicated manager', 'Analytics dashboard'],
  },
]

const steps = [
  { icon: Briefcase, title: 'Tell Us About Your Business', desc: 'We learn your brand voice, colors, and style to create content that feels authentically you' },
  { icon: Eye, title: 'Approve AI Content', desc: 'Review and approve posts from your phone — one tap is all it takes' },
  { icon: Sparkles, title: 'Watch It Grow', desc: 'Content posts automatically, engagement is handled, and your audience grows' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ─── NAV ─── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-blink-primary" />
            <span className="text-xl font-bold tracking-tight text-blink-dark font-heading">
              Blink
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#how-it-works" className="hover:text-blink-primary transition-colors">How It Works</a>
            <a href="#features" className="hover:text-blink-primary transition-colors">Features</a>
            <a href="#pricing" className="hover:text-blink-primary transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-blink-dark transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/get-started"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blink-primary text-white text-sm font-semibold hover:bg-blink-primary/90 transition-colors shadow-md shadow-blink-primary/20"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blink-primary/5 via-white to-blink-secondary/5" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blink-primary/10 text-blink-primary text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            AI-Powered Social Media Management
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-blink-dark font-heading leading-tight max-w-3xl mx-auto">
            Your Social Media,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blink-primary to-blink-secondary">
              On Autopilot
            </span>{' '}
            ⚡
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            AI-powered content creation, scheduling, and engagement for your business.
            Stop spending hours on social media — let Blink handle it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-blink-primary text-white font-semibold text-base hover:bg-blink-primary/90 transition-all shadow-lg shadow-blink-primary/25 hover:shadow-xl hover:shadow-blink-primary/30 hover:-translate-y-0.5"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-base hover:border-blink-primary hover:text-blink-primary transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section className="border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-6xl mx-auto px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-8">
            Trusted by businesses in Nairobi
          </p>
          <div className="flex items-center justify-center gap-10 md:gap-16 flex-wrap opacity-40">
            {['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E'].map((brand) => (
              <div
                key={brand}
                className="text-lg font-bold text-gray-400 tracking-wide"
              >
                {brand}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-blink-dark font-heading">
            How It Works
          </h2>
          <p className="mt-3 text-gray-500 max-w-lg mx-auto">
            Three simple steps to autopilot your social media
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all text-center"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-blink-primary text-white text-sm font-bold flex items-center justify-center shadow-md shadow-blink-primary/25">
                {i + 1}
              </div>
              <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-blink-primary/10 flex items-center justify-center mt-2">
                <step.icon className="h-7 w-7 text-blink-primary" />
              </div>
              <h3 className="text-lg font-semibold text-blink-dark font-heading">{step.title}</h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-blink-dark font-heading">
              Everything You Need
            </h2>
            <p className="mt-3 text-gray-500 max-w-lg mx-auto">
              Powerful features to grow your social media presence effortlessly
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-gray-200 bg-white p-6 hover:shadow-md hover:border-blink-primary/20 transition-all"
              >
                <div className="h-11 w-11 rounded-lg bg-blink-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-blink-primary" />
                </div>
                <h3 className="text-base font-semibold text-blink-dark font-heading">{f.title}</h3>
                <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-blink-dark font-heading">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-gray-500 max-w-lg mx-auto">
            Choose the plan that fits your business
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border-2 p-8 transition-all ${plan.popular
                  ? 'border-blink-primary bg-white shadow-xl shadow-blink-primary/10 scale-[1.02]'
                  : 'border-gray-200 bg-white hover:shadow-md'
                }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blink-primary text-white text-xs font-bold shadow-md">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-blink-dark font-heading">{plan.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{plan.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-sm text-gray-500">KES</span>
                <span className="text-4xl font-bold text-blink-dark">{plan.price}</span>
                <span className="text-sm text-gray-500">/mo</span>
              </div>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-blink-primary shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link
                href="/get-started"
                className={`mt-8 block text-center px-6 py-3 rounded-lg font-semibold text-sm transition-colors ${plan.popular
                    ? 'bg-blink-primary text-white hover:bg-blink-primary/90 shadow-md shadow-blink-primary/20'
                    : 'border-2 border-gray-200 text-blink-dark hover:border-blink-primary hover:text-blink-primary'
                  }`}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="bg-gradient-to-r from-blink-primary to-blink-primary/80">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white font-heading">
            Ready to automate your social media?
          </h2>
          <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
            Join businesses across Nairobi that trust Blink to manage their social media presence
          </p>
          <Link
            href="/get-started"
            className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 rounded-xl bg-white text-blink-primary font-semibold text-base hover:bg-gray-50 transition-colors shadow-lg"
          >
            Get Started Free
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-blink-dark text-white/60">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-blink-secondary" />
                <span className="text-lg font-bold text-white font-heading">Blink</span>
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered social media management for businesses in Africa.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>

            {/* Social */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Connect</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition-colors">LinkedIn</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 text-center text-sm">
            © 2026 Blink. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
