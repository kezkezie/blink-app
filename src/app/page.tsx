"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Zap,
  Video,
  Palette,
  ArrowRight,
  Menu,
  X,
  Layers,
  Share2,
  Wand2,
  Bot,
  BrainCircuit,
} from 'lucide-react';
import Image from "next/image";
import Link from 'next/link';
import { BentoHero } from '@/components/landing/BentoHero';

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


  return (
    <div className="relative bg-[#191D23] text-[#DEDCDC] overflow-x-hidden">
      <Navbar />

      <BentoHero />

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
              <Link href="/dashboard/billing" className="hover:text-[#DEDCDC] transition-colors">Pricing</Link>
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
