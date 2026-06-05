"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  Calendar,
  Zap,
  Video,
  Image as ImageIcon,
  Palette,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Sparkles,
  Layers,
  Share2,
  Loader2,
  Wand2,
  Bot,
  Film,
  BrainCircuit,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Image from "next/image";
import Link from 'next/link';

// ─── Mockups ─────────────────────────────────────────────────────────────────

const CalendarMockup = ({ className = "" }) => (
  <div className={`bg-[#191D23]/90 rounded-2xl border border-[#57707A]/30 p-4 shadow-2xl ${className}`}>
    <div className="flex justify-between items-center mb-4">
      <div className="h-2 w-16 bg-[#2A2F38] rounded" />
      <div className="flex gap-1">
        {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#57707A]/40" />)}
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 21 }).map((_, i) => (
        <div key={i} className={`aspect-square rounded-sm ${i === 8 ? 'bg-[#C5BAC4]/40' : i === 13 ? 'bg-[#B3FF00]/30' : 'bg-[#2A2F38]/50'}`} />
      ))}
    </div>
  </div>
);

// ─── Navbar ───────────────────────────────────────────────────────────────────

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#workflow" },
    { label: "Pricing", href: "#pricing" },
  ];

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-4 sm:px-6 py-4 ${scrolled ? 'bg-[#191D23]/90 backdrop-blur-xl border-b border-[#57707A]/30' : ''}`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group cursor-pointer">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#C5BAC4] rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-[#C5BAC4]/20">
              <Image src="/bsw.png" alt="BlinkSpot" width={22} height={22} className="shrink-0" />
            </div>
            <span className="text-lg sm:text-xl font-display font-bold tracking-tighter text-[#DEDCDC]">BlinkSpot</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-[#989DAA]">
            {links.map(l => (
              <a key={l.href} href={l.href} className="hover:text-[#DEDCDC] transition-colors">{l.label}</a>
            ))}
            <a href="/login" className="hover:text-[#DEDCDC] transition-colors">Sign In</a>
            <a href="/get-started" className="bg-[#C5BAC4] text-[#191D23] px-6 py-2.5 rounded-full hover:bg-white transition-colors shadow-md">
              Get Started
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden w-10 h-10 flex items-center justify-center text-[#989DAA] hover:text-[#DEDCDC] transition-colors"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed top-[65px] left-0 right-0 z-40 bg-[#191D23]/95 backdrop-blur-xl border-b border-[#57707A]/30 px-6 py-6 flex flex-col gap-5 md:hidden"
          >
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                className="text-lg font-bold text-[#989DAA] hover:text-[#DEDCDC] transition-colors">
                {l.label}
              </a>
            ))}
            <a href="/login" onClick={() => setMobileOpen(false)}
              className="text-lg font-bold text-[#989DAA] hover:text-[#DEDCDC] transition-colors">
              Sign In
            </a>
            <a href="/get-started" onClick={() => setMobileOpen(false)}
              className="bg-[#C5BAC4] text-[#191D23] px-6 py-4 rounded-2xl font-bold text-lg text-center hover:bg-white transition-colors mt-2">
              Get Started Free
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -80]);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() });
      if (error && error.code !== '23505') {
        alert('Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative bg-[#191D23] text-[#DEDCDC] overflow-x-hidden">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="min-h-screen flex items-center pt-24 sm:pt-28 pb-16 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#C5BAC4]/8 blur-[140px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#B3FF00]/5 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="inline-flex px-4 py-1.5 rounded-full bg-[#B3FF00]/10 border border-[#B3FF00]/25 text-[#B3FF00] text-[10px] font-bold mb-6 uppercase tracking-widest">
                AI Social Media OS for creators &amp; agencies
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-7xl font-bold mb-6 leading-[0.95] font-display text-balance">
                Your brand.<br />
                <span className="text-[#C5BAC4] italic">Everywhere.</span><br />
                <span className="text-[#DEDCDC]">Automatically.</span>
              </h1>

              <p className="text-lg sm:text-xl text-[#989DAA] max-w-lg mb-10 leading-relaxed">
                BlinkSpot turns your brand guidelines into AI-generated images, videos, and captions — then schedules and publishes them across every platform without lifting a finger.
              </p>

              <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center">
                <a href="/get-started" className="bg-[#C5BAC4] text-[#191D23] px-8 py-4 rounded-2xl font-bold text-base sm:text-lg hover:bg-white transition-colors flex items-center gap-3 shadow-xl shadow-[#C5BAC4]/10">
                  Start for free <ArrowRight size={18} />
                </a>
                <a href="#features" className="text-[#989DAA] hover:text-[#C5BAC4] transition-colors font-semibold flex items-center gap-2 text-sm">
                  See how it works →
                </a>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 mt-8">
                <div className="flex -space-x-2">
                  {["A","B","C","D"].map((l, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#191D23] bg-[#2A2F38] flex items-center justify-center text-[10px] font-bold text-[#989DAA]">{l}</div>
                  ))}
                </div>
                <p className="text-sm text-[#57707A] font-medium">Trusted by <span className="text-[#989DAA] font-bold">2,000+</span> creators and agencies</p>
              </div>
            </motion.div>

            {/* Right: Product preview cards */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative hidden lg:block"
            >
              <motion.div style={{ y: y1 }} className="relative h-[520px]">
                {/* Main card */}
                <div className="absolute inset-0 bg-[#2A2F38]/60 rounded-[2rem] border border-[#57707A]/40 p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#B3FF00]/20 flex items-center justify-center">
                        <Sparkles size={14} className="text-[#B3FF00]" />
                      </div>
                      <span className="text-sm font-bold text-[#C5BAC4]">AI Studio — Aveli Consulting</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-[#B3FF00]/15 text-[#B3FF00] px-3 py-1 rounded-full border border-[#B3FF00]/25">GENERATING</span>
                  </div>
                  <div className="aspect-[4/3] bg-[#191D23] rounded-2xl border border-[#57707A]/30 overflow-hidden relative mb-5">
                    <div className="absolute inset-0 flex items-center justify-center flex-col gap-3">
                      <Film size={40} className="text-[#C5BAC4]/30" />
                      <div className="w-40 h-1.5 bg-[#2A2F38] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-[#B3FF00]/60 rounded-full"
                          animate={{ width: ["0%", "80%", "0%"] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                      <p className="text-xs text-[#57707A]">Building cinematic scene…</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[ImageIcon, Video, Calendar].map((Icon, i) => (
                      <div key={i} className="bg-[#191D23]/80 rounded-xl p-3 flex flex-col gap-2 border border-[#57707A]/25">
                        <Icon size={16} className="text-[#C5BAC4]" />
                        <div className="h-1.5 w-full bg-[#57707A]/40 rounded" />
                        <div className="h-1.5 w-2/3 bg-[#57707A]/25 rounded" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating stat chip — top right */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -top-4 -right-4 bg-[#B3FF00] text-[#191D23] rounded-2xl px-4 py-3 shadow-lg font-bold text-sm z-10"
                >
                  <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">Posts scheduled</p>
                  <p className="text-2xl font-black">247</p>
                </motion.div>

                {/* Floating brand chip — bottom left */}
                <motion.div
                  animate={{ y: [0, 12, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -bottom-4 -left-4 bg-[#2A2F38] border border-[#57707A]/50 rounded-2xl px-4 py-3 shadow-xl z-10 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#C5BAC4]/20 flex items-center justify-center shrink-0">
                    <BrainCircuit size={16} className="text-[#C5BAC4]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#57707A] font-semibold uppercase tracking-wide">Brand DNA active</p>
                    <p className="text-sm font-bold text-[#C5BAC4]">Aveli Consulting</p>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Problem ───────────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32 bg-[#191D23] border-t border-[#57707A]/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="space-y-10">
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold font-display">
              Stop juggling tools.<br /><span className="text-[#C5BAC4]">Start shipping content.</span>
            </h2>
            <div className="grid sm:grid-cols-3 gap-6 text-left">
              {[
                { icon: Layers, title: "Scattered workflow", desc: "Canva for design, CapCut for video, Buffer for scheduling, ChatGPT for captions. Every switch costs you time." },
                { icon: Bot, title: "Generic AI output", desc: "Other tools don't know your brand. Every generated piece needs manual editing to sound and look like you." },
                { icon: Share2, title: "Inconsistent presence", desc: "You post in bursts, then go quiet. The algorithm punishes it. Your audience stops paying attention." }
              ].map((item, i) => (
                <div key={i} className="p-6 sm:p-8 rounded-3xl bg-[#2A2F38]/30 border border-[#57707A]/30 hover:bg-[#2A2F38]/50 transition-colors">
                  <item.icon className="text-[#C5BAC4] mb-5" size={24} />
                  <h4 className="text-base sm:text-lg font-bold mb-2 text-[#DEDCDC]">{item.title}</h4>
                  <p className="text-[#989DAA] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 sm:py-32 border-t border-[#57707A]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-14 sm:mb-20">
            <h2 className="text-4xl sm:text-5xl md:text-7xl font-bold font-display leading-tight">Everything<br />in one OS.</h2>
            <p className="text-[#989DAA] max-w-xs text-base md:text-lg font-medium">Built specifically for creators and agencies who can't afford to be slow.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-6">
            {/* Large card */}
            <div className="lg:col-span-8 bg-[#2A2F38]/40 rounded-[2rem] p-8 sm:p-12 border border-[#57707A]/30 relative overflow-hidden group hover:bg-[#2A2F38]/60 transition-colors">
              <div className="relative z-10 max-w-md">
                <Wand2 className="text-[#B3FF00] mb-6" size={36} />
                <h3 className="text-2xl sm:text-3xl font-bold mb-3 text-[#DEDCDC]">Brand-aware AI Generation</h3>
                <p className="text-[#989DAA] leading-relaxed">Upload your brand profile once — name, colors, voice, style guidelines. Every image, video, and caption BlinkSpot generates automatically reflects your brand. No prompt engineering needed.</p>
              </div>
              <div className="absolute top-8 sm:top-12 -right-16 sm:-right-20 w-[320px] sm:w-[400px] opacity-20 group-hover:opacity-40 transition-opacity transform group-hover:-translate-x-2 pointer-events-none">
                <CalendarMockup />
              </div>
            </div>

            {/* Accent card */}
            <div className="lg:col-span-4 bg-[#C5BAC4] rounded-[2rem] p-8 sm:p-12 text-[#191D23] shadow-lg shadow-[#C5BAC4]/10">
              <Zap className="mb-6" size={36} />
              <h3 className="text-xl sm:text-2xl font-bold mb-3">Multi-platform publish</h3>
              <p className="opacity-80 text-sm leading-relaxed font-medium">One click sends your content to Instagram, TikTok, LinkedIn, Twitter, and more. Schedules it for the optimal time automatically.</p>
            </div>

            {/* Feature card */}
            <div className="lg:col-span-4 bg-[#2A2F38]/80 rounded-[2rem] p-8 sm:p-12 border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors">
              <Palette className="text-[#B3FF00] mb-6" size={36} />
              <h3 className="text-xl sm:text-2xl font-bold mb-3 text-[#DEDCDC]">Image &amp; Video Studio</h3>
              <p className="text-[#989DAA] text-sm leading-relaxed">Generate AI images with Nano Banana 2, GPT Image 2, and Gemini Omni. Produce cinematic video with Kling 3.0, Seedance 2, and Sora 2 — all from one interface.</p>
            </div>

            {/* Feature card */}
            <div className="lg:col-span-8 bg-[#191D23] rounded-[2rem] p-8 sm:p-12 border border-[#57707A]/30 relative overflow-hidden hover:border-[#57707A]/60 transition-colors shadow-inner">
              <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 items-start sm:items-center">
                <div className="flex-1">
                  <Video className="text-[#C5BAC4] mb-6" size={36} />
                  <h3 className="text-2xl sm:text-3xl font-bold mb-3 text-[#DEDCDC]">Client Approval Workflows</h3>
                  <p className="text-[#989DAA] leading-relaxed text-sm sm:text-base">Agencies can route every post through a client approval queue before scheduling. Notifications via Telegram when a decision is needed.</p>
                </div>
                <div className="w-full sm:w-auto flex flex-col gap-3 shrink-0 sm:min-w-[200px]">
                  {["Draft", "Pending Approval", "Approved", "Scheduled"].map((s, i) => (
                    <div key={s} className={`rounded-xl px-4 py-2.5 text-xs font-bold border ${i === 2 ? "bg-[#B3FF00]/15 border-[#B3FF00]/30 text-[#B3FF00]" : i === 1 ? "bg-[#C5BAC4]/10 border-[#C5BAC4]/20 text-[#C5BAC4]" : "bg-[#2A2F38]/50 border-[#57707A]/25 text-[#57707A]"}`}>{s}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="workflow" className="py-24 sm:py-32 bg-[#191D23] border-t border-[#57707A]/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-5xl font-bold font-display mb-16 sm:mb-20 text-center">Up and running<br /><span className="text-[#C5BAC4]">in three steps.</span></h2>
          <div className="space-y-16 sm:space-y-24">
            {[
              { step: "01", title: "Define your Brand DNA", desc: "Connect your social accounts and fill in your brand profile — name, voice, colors, dos and don'ts. BlinkSpot uses this as the foundation for every AI generation.", icon: BrainCircuit },
              { step: "02", title: "Generate in seconds", desc: "Describe what you need, pick a style, and let the AI Studio produce images, videos, and captions that already match your brand. Refine with one click.", icon: Wand2, reverse: true },
              { step: "03", title: "Schedule and publish", desc: "Drop content onto the calendar, pick your platforms and time slots, and hit publish. BlinkSpot handles the rest — including approval routing if you need it.", icon: Calendar }
            ].map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                className={`flex flex-col ${item.reverse ? 'sm:flex-row-reverse' : 'sm:flex-row'} gap-8 sm:gap-12 items-start sm:items-center`}
              >
                <div className="text-7xl sm:text-9xl font-black text-[#2A2F38] select-none font-display shrink-0">{item.step}</div>
                <div className="flex-1">
                  <item.icon size={28} className="text-[#C5BAC4] mb-4" />
                  <h3 className="text-2xl sm:text-4xl font-bold mb-3 text-[#DEDCDC]">{item.title}</h3>
                  <p className="text-base sm:text-lg text-[#989DAA] leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 sm:py-32 border-t border-[#57707A]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14 sm:mb-16">
            <h2 className="text-3xl sm:text-5xl font-bold font-display mb-4">Simple, honest pricing.</h2>
            <p className="text-[#989DAA] text-base sm:text-lg max-w-xl mx-auto">Start free, upgrade when you&apos;re ready. All plans include the core AI generation suite.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: "Free", price: "$0", period: "forever", color: "border-[#57707A]/40", features: ["1 brand workspace", "5 posts / month", "Image Studio", "Basic scheduling"], cta: "Get started", ctaStyle: "bg-[#2A2F38] text-[#DEDCDC] hover:bg-[#2A2F38]/80 border border-[#57707A]/40" },
              { name: "Starter", price: "$29", period: "per month", color: "border-[#C5BAC4]/40", features: ["2 brand workspaces", "30 posts / month", "Image + Video Studio", "AI caption generator", "7-day asset storage"], cta: "Start free trial", ctaStyle: "bg-[#C5BAC4] text-[#191D23] hover:bg-white" },
              { name: "Pro", price: "$79", period: "per month", color: "border-[#B3FF00]/40", badge: "Most popular", features: ["6 brand workspaces", "60 posts / month", "All AI models", "Approval workflows", "14-day asset storage", "Priority support"], cta: "Start free trial", ctaStyle: "bg-[#B3FF00] text-[#191D23] hover:brightness-110" },
              { name: "Agency", price: "$199", period: "per month", color: "border-[#57707A]/40", features: ["10 brand workspaces", "200 posts / month", "All AI models", "Client approval portal", "Analytics dashboard", "Dedicated support"], cta: "Contact us", ctaStyle: "bg-[#2A2F38] text-[#DEDCDC] hover:bg-[#2A2F38]/80 border border-[#57707A]/40" },
            ].map((plan) => (
              <div key={plan.name} className={`relative bg-[#2A2F38]/40 border rounded-[2rem] p-7 flex flex-col ${plan.color} ${plan.badge ? 'ring-1 ring-[#B3FF00]/30 shadow-[0_0_40px_rgba(179,255,0,0.08)]' : ''}`}>
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#B3FF00] text-[#191D23] text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-6">
                  <p className="text-sm font-bold text-[#57707A] uppercase tracking-widest mb-2">{plan.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-[#DEDCDC]">{plan.price}</span>
                    <span className="text-sm text-[#57707A] mb-1.5">/{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-[#989DAA]">
                      <CheckCircle2 size={14} className="text-[#C5BAC4] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="/get-started" className={`w-full py-3.5 rounded-xl font-bold text-sm text-center transition-all ${plan.ctaStyle}`}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[#57707A] mt-8">
            Payments processed securely by <strong className="text-[#989DAA]">Paystack</strong>. Need a custom plan?{" "}
            <Link href="/contact" className="text-[#C5BAC4] hover:underline">Talk to us.</Link>
          </p>
        </div>
      </section>

      {/* ── CTA / Waitlist ────────────────────────────────────────────────── */}
      <section id="waitlist" className="py-24 sm:py-32 border-t border-[#57707A]/20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-[#2A2F38] border border-[#57707A]/40 rounded-[2.5rem] sm:rounded-[3rem] p-10 sm:p-20 text-center relative overflow-hidden shadow-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative z-10"
            >
              <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold mb-6 font-display">
                Join the <span className="text-[#C5BAC4]">inner circle.</span>
              </h2>
              <p className="text-base sm:text-xl text-[#989DAA] mb-10 max-w-xl mx-auto leading-relaxed">
                We're rolling out access in batches to give every early user a personal onboarding. Get early access and lock in the founding member price.
              </p>

              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.form key="form" onSubmit={handleWaitlistSubmit}
                    className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto p-2 bg-[#191D23] rounded-3xl border border-[#57707A]/40 shadow-inner">
                    <input
                      type="email"
                      required
                      placeholder="your@email.com"
                      className="flex-1 bg-transparent px-5 sm:px-8 py-4 text-[#DEDCDC] placeholder:text-[#57707A] outline-none text-base disabled:opacity-50"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <button
                      disabled={isSubmitting}
                      className="bg-[#C5BAC4] text-[#191D23] px-8 py-4 rounded-2xl font-bold text-base hover:bg-white transition-all disabled:opacity-70 flex items-center justify-center gap-2 min-w-[140px]"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles size={16} /> Get Access</>}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    className="text-2xl sm:text-3xl font-bold text-[#B3FF00] flex flex-col items-center gap-4">
                    <CheckCircle2 size={48} />
                    You&apos;re on the list. Welcome to BlinkSpot.
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <div className="absolute top-0 left-0 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-[#C5BAC4]/8 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] sm:w-[500px] h-[400px] sm:h-[500px] bg-[#B3FF00]/5 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="py-14 sm:py-20 px-4 sm:px-6 border-t border-[#57707A]/30 bg-[#191D23]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#C5BAC4] rounded-lg flex items-center justify-center shadow-sm">
                <Image src="/bsw.png" alt="BlinkSpot" width={20} height={20} />
              </div>
              <span className="text-lg font-bold text-[#DEDCDC] font-display">BlinkSpot</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#989DAA] font-semibold">
              <a href="#features" className="hover:text-[#DEDCDC] transition-colors">Features</a>
              <a href="#pricing" className="hover:text-[#DEDCDC] transition-colors">Pricing</a>
              <Link href="/contact" className="hover:text-[#DEDCDC] transition-colors">Contact</Link>
              <Link href="/privacy" className="hover:text-[#DEDCDC] transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-[#DEDCDC] transition-colors">Terms</Link>
              <Link href="/cookies" className="hover:text-[#DEDCDC] transition-colors">Cookies</Link>
              <Link href="/acceptable-use" className="hover:text-[#DEDCDC] transition-colors">Acceptable Use</Link>
            </div>
          </div>
          <div className="border-t border-[#57707A]/20 pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <p className="text-sm text-[#57707A]">© 2026 Mubia Investment Limited (operating as BlinkSpot). All rights reserved.</p>
            <p className="text-sm text-[#57707A]">
              Questions? <a href="mailto:info@blinkspot.io" className="text-[#989DAA] hover:text-[#C5BAC4] transition-colors">info@blinkspot.io</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
