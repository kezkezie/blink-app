"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  Calendar,
  Zap,
  Video,
  Image as ImageIcon,
  Upload,
  Palette,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Clock,
  Sparkles,
  Layout,
  MousePointer2,
  Layers,
  Share2,
  Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Image from "next/image";

// --- UI Mockup Components ---

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
        <div key={i} className={`aspect-square rounded-sm ${i === 8 ? 'bg-[#C5BAC4]/40' : 'bg-[#2A2F38]/50'}`} />
      ))}
    </div>
  </div>
);

const EditorMockup = ({ className = "" }) => (
  <div className={`bg-[#2A2F38]/50 rounded-2xl border border-[#57707A]/30 p-3 shadow-2xl backdrop-blur-md ${className}`}>
    <div className="aspect-video bg-[#191D23]/80 rounded-lg mb-3 flex items-center justify-center border border-[#57707A]/20">
      <Video className="text-[#C5BAC4]/40" size={32} />
    </div>
    <div className="space-y-2">
      <div className="h-1.5 w-full bg-[#57707A]/30 rounded" />
      <div className="h-1.5 w-2/3 bg-[#57707A]/30 rounded" />
    </div>
  </div>
);

// --- Sections ---

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-6 py-4 ${scrolled ? 'bg-[#191D23]/80 backdrop-blur-xl border-b border-[#57707A]/30' : ''}`}>
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-[#C5BAC4] text-[#191D23] rounded-xl flex items-center justify-center font-bold text-xl group-hover:rotate-12 transition-transform shadow-lg shadow-[#C5BAC4]/20">
            <Image
              src="/bsw.png"
              alt="Blink Logo"
              width={24}
              height={24}
              className="shrink-0"
            />
          </div>
          <span className="text-xl font-display font-bold tracking-tighter text-[#DEDCDC]">BlinkSpot</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-bold text-[#989DAA]">
          <a href="#features" className="hover:text-[#DEDCDC] transition-colors">Features</a>
          <a href="#workflow" className="hover:text-[#DEDCDC] transition-colors">Workflow</a>
          <a href="/login" className="hover:text-[#DEDCDC] transition-colors">Sign In</a>
          <a href="/get-started" className="bg-[#C5BAC4] text-[#191D23] px-6 py-2.5 rounded-full hover:bg-white transition-colors shadow-md">Get Started</a>
        </div>
      </div>
    </nav>
  );
};

export default function App() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 100]);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('waitlist')
        .insert({ email: email.trim().toLowerCase() });
      // Treat duplicate email (unique constraint) as a success
      if (error && error.code !== '23505') {
        console.error('Waitlist insert error:', error);
        alert('Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error('Waitlist error:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative bg-[#191D23] text-[#DEDCDC]">
      <Navbar />

      {/* Hero: Lifestyle Background & Floating Elements */}
      <section className="min-h-screen flex items-center pt-20 relative overflow-hidden">
        {/* Lifestyle Background with Blur */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=2000"
            alt="Workspace"
            className="w-full h-full object-cover opacity-10 grayscale-[0.8]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#191D23] via-[#191D23]/80 to-[#191D23]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 w-full grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex px-4 py-1.5 rounded-full bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 text-[#C5BAC4] text-[10px] font-bold mb-8 uppercase tracking-widest">
              Next-Gen Social OS
            </div>
            <h1 className="text-6xl md:text-8xl font-bold mb-8 text-balance leading-[0.95] font-display">
              Create at the <br />
              <span className="text-[#C5BAC4] italic pr-4">speed</span> of light.
            </h1>
            <p className="text-xl text-[#989DAA] max-w-lg mb-12 leading-relaxed">
              Blink is the first social media operating system designed for the modern creator. One workspace, zero friction.
            </p>
            <div className="flex flex-wrap gap-6 items-center">
              <a href="#waitlist" className="bg-[#C5BAC4] text-[#191D23] px-10 py-5 rounded-2xl font-bold text-lg hover:bg-white transition-colors flex items-center gap-3 shadow-xl shadow-[#C5BAC4]/10">
                Get Early Access <ArrowRight size={20} />
              </a>
              <div className="flex -space-x-3 items-center">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#191D23] bg-[#2A2F38] overflow-hidden">
                    <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="user" referrerPolicy="no-referrer" />
                  </div>
                ))}
                <span className="pl-6 text-sm text-[#989DAA] font-bold">Joined by 2k+ creators</span>
              </div>
            </div>
          </motion.div>

          {/* Floating Device & Elements inspired by the image */}
          <div className="relative h-[700px] flex items-center justify-center">
            {/* Main Floating Phone Mockup */}
            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-20 w-[300px] aspect-[9/19.5] bg-[#191D23] rounded-[3rem] border-[8px] border-[#2A2F38] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-[#2A2F38] rounded-b-2xl z-30" />
              <div className="p-6 pt-12 h-full bg-[#191D23] flex flex-col gap-4 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-[#C5BAC4]/5 to-transparent pointer-events-none" />
                <div className="h-4 w-20 bg-[#C5BAC4]/20 rounded relative z-10" />
                <div className="grid grid-cols-2 gap-3 relative z-10">
                  <div className="aspect-square bg-[#C5BAC4]/10 border border-[#C5BAC4]/20 rounded-xl" />
                  <div className="aspect-square bg-[#2A2F38]/50 border border-[#57707A]/30 rounded-xl" />
                  <div className="aspect-square bg-[#2A2F38]/30 border border-[#57707A]/20 rounded-xl" />
                  <div className="aspect-square bg-[#B3FF00]/10 border border-[#B3FF00]/20 rounded-xl" />
                </div>
                <div className="flex-1 bg-[#2A2F38]/40 rounded-2xl border border-[#57707A]/30 p-4 relative z-10 mt-2">
                  <div className="h-2 w-full bg-[#57707A]/40 rounded mb-3" />
                  <div className="h-2 w-2/3 bg-[#57707A]/40 rounded mb-6" />
                  <div className="h-24 w-full bg-[#191D23] rounded-lg border border-[#57707A]/20" />
                </div>
              </div>
            </motion.div>

            {/* Floating Cards around the phone */}
            <motion.div
              animate={{ y: [0, 15, 0], x: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-20 -left-10 z-30 w-32 h-32 bg-[#2A2F38]/80 backdrop-blur-md border border-[#57707A]/40 rounded-2xl p-3 shadow-2xl"
            >
              <div className="w-full h-full bg-[#C5BAC4]/10 rounded-xl border border-[#C5BAC4]/20 flex items-center justify-center">
                <ImageIcon className="text-[#C5BAC4]" size={28} />
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -15, 0], x: [0, -5, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-40 -right-16 z-30 w-40 h-24 bg-[#2A2F38]/80 backdrop-blur-md border border-[#57707A]/40 rounded-2xl p-4 shadow-2xl"
            >
              <div className="space-y-3">
                <div className="h-2 w-1/2 bg-[#B3FF00]/40 rounded" />
                <div className="flex items-end gap-1.5 h-10">
                  {[40, 70, 50, 90, 60].map((h, i) => (
                    <div key={i} className="flex-1 bg-[#B3FF00]/20 rounded-t-sm border-t border-[#B3FF00]/40" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="absolute bottom-40 -left-20 z-30 w-24 h-24 bg-[#C5BAC4] rounded-2xl p-4 shadow-[0_10px_30px_rgba(197,186,196,0.3)] flex items-center justify-center"
            >
              <Sparkles className="text-[#191D23]" size={32} />
            </motion.div>

            <motion.div
              animate={{ y: [0, -25, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-20 -right-10 z-30 w-36 h-36 bg-[#2A2F38]/80 backdrop-blur-md border border-[#57707A]/40 rounded-2xl p-2 shadow-2xl overflow-hidden"
            >
              <img src="https://picsum.photos/seed/content/200/200" alt="Content" className="w-full h-full object-cover rounded-xl opacity-80" referrerPolicy="no-referrer" />
            </motion.div>

            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C5BAC4]/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-[#B3FF00]/5 blur-[100px] rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Problem: Full Dark, Centered Contrast */}
      <section className="py-40 bg-[#191D23] relative border-t border-[#57707A]/20">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="space-y-12"
          >
            <h2 className="text-4xl md:text-6xl font-bold font-display">Stop tool-hopping. <br />Start <span className="text-[#C5BAC4]">building</span>.</h2>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {[
                { icon: Layers, title: "Fragmented Data", desc: "Your assets are scattered across 10 different cloud drives." },
                { icon: MousePointer2, title: "Manual Labor", desc: "Hours spent resizing and re-uploading the same video." },
                { icon: Share2, title: "Silent Feeds", desc: "Inconsistency is killing your reach. Blink fixes that." }
              ].map((item, i) => (
                <div key={i} className="p-8 rounded-3xl bg-[#2A2F38]/30 border border-[#57707A]/30 hover:bg-[#2A2F38]/50 transition-colors">
                  <item.icon className="text-[#C5BAC4] mb-6" size={28} />
                  <h4 className="text-lg font-bold mb-3 text-[#DEDCDC]">{item.title}</h4>
                  <p className="text-[#989DAA] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Solution: Light Contrast Block, Asymmetrical */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-7xl mx-auto bg-[#2A2F38] border border-[#57707A]/40 rounded-[3rem] p-12 md:p-24 text-[#DEDCDC] grid lg:grid-cols-[1fr_1.2fr] gap-20 items-center overflow-hidden relative shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#C5BAC4]/5 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold mb-8 font-display leading-tight">The first truly <br />human-centric <br />social tool.</h2>
            <p className="text-xl text-[#989DAA] mb-12 leading-relaxed">
              We didn't just build another scheduler. We built an engine that understands your brand and amplifies your creativity.
            </p>
            <div className="space-y-6">
              {["AI that learns your voice", "Real-time collaboration", "Native video processing"].map((text, i) => (
                <div key={i} className="flex items-center gap-4 font-bold text-lg text-[#DEDCDC]">
                  <div className="w-8 h-8 rounded-full bg-[#191D23] border border-[#57707A]/50 text-[#C5BAC4] flex items-center justify-center text-sm shadow-inner">✓</div>
                  {text}
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="bg-[#191D23] rounded-3xl p-8 shadow-2xl border border-[#57707A]/40 transform rotate-3 translate-x-12 relative z-10">
              <div className="flex gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-[#2A2F38] border border-[#57707A]/30" />
                <div className="space-y-3 flex-1 pt-1">
                  <div className="h-3 w-1/3 bg-[#57707A]/50 rounded" />
                  <div className="h-2 w-full bg-[#57707A]/30 rounded" />
                </div>
              </div>
              <div className="aspect-video bg-[#2A2F38]/50 rounded-2xl border border-[#57707A]/30 flex items-center justify-center shadow-inner">
                <Sparkles className="text-[#C5BAC4] opacity-50" size={48} />
              </div>
            </div>
            <div className="absolute -bottom-10 -left-10 bg-[#B3FF00] p-6 rounded-2xl shadow-xl transform -rotate-6 text-[#191D23] font-bold z-20">
              AI Generated Content
            </div>
          </div>
        </div>
      </section>

      {/* Features: Bento Grid Layout */}
      <section id="features" className="py-40 border-t border-[#57707A]/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-20">
            <h2 className="text-5xl md:text-7xl font-bold font-display">Built for <br />power users.</h2>
            <p className="text-[#989DAA] max-w-xs text-lg font-medium">Every feature is designed to eliminate a specific bottleneck in your workflow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Featured Large Card */}
            <div className="md:col-span-8 bg-[#2A2F38]/40 rounded-[2rem] p-12 border border-[#57707A]/30 relative overflow-hidden group hover:bg-[#2A2F38]/60 transition-colors">
              <div className="relative z-10 max-w-md">
                <Calendar className="text-[#C5BAC4] mb-8" size={40} />
                <h3 className="text-3xl font-bold mb-4 text-[#DEDCDC]">Intelligent Calendar</h3>
                <p className="text-[#989DAA] leading-relaxed">The only calendar that suggests posting times based on your specific audience behavior, not generic industry averages.</p>
              </div>
              <div className="absolute top-12 -right-20 w-[400px] opacity-30 group-hover:opacity-50 transition-opacity transform group-hover:-translate-x-2">
                <CalendarMockup />
              </div>
            </div>

            {/* Small Card */}
            <div className="md:col-span-4 bg-[#C5BAC4] rounded-[2rem] p-12 text-[#191D23] shadow-lg shadow-[#C5BAC4]/10">
              <Zap className="mb-8" size={40} />
              <h3 className="text-2xl font-bold mb-4">Auto-Pilot</h3>
              <p className="opacity-80 text-sm leading-relaxed font-medium">Set your strategy once and let Blink handle the daily grind of posting and tagging.</p>
            </div>

            {/* Small Card */}
            <div className="md:col-span-4 bg-[#2A2F38]/80 rounded-[2rem] p-12 border border-[#57707A]/40 hover:border-[#C5BAC4]/50 transition-colors">
              <Palette className="text-[#B3FF00] mb-8" size={40} />
              <h3 className="text-2xl font-bold mb-4 text-[#DEDCDC]">Brand DNA</h3>
              <p className="text-[#989DAA] text-sm leading-relaxed">Upload your brand guidelines and watch as Blink adapts every AI generation to your style.</p>
            </div>

            {/* Medium Card */}
            <div className="md:col-span-8 bg-[#191D23] rounded-[2rem] p-12 border border-[#57707A]/30 relative overflow-hidden hover:border-[#57707A]/60 transition-colors shadow-inner">
              <div className="flex flex-col md:flex-row gap-12 items-center">
                <div className="flex-1">
                  <Video className="text-[#C5BAC4] mb-8" size={40} />
                  <h3 className="text-3xl font-bold mb-4 text-[#DEDCDC]">Native Video Studio</h3>
                  <p className="text-[#989DAA] leading-relaxed">Clip, caption, and color-grade your videos without ever downloading a file.</p>
                </div>
                <div className="w-full md:w-1/2">
                  <EditorMockup />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow: Staggered Layout */}
      <section id="workflow" className="py-40 bg-[#191D23] border-t border-[#57707A]/20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-32">
            {[
              { step: "01", title: "Define your Identity", desc: "Connect your accounts and upload your brand assets. Blink learns your voice in minutes.", align: "left" },
              { step: "02", title: "Generate & Refine", desc: "Use our AI studio to create weeks of content in a single afternoon.", align: "right" },
              { step: "03", title: "Schedule with Confidence", desc: "Our intelligent calendar ensures your content hits the feed when it matters most.", align: "left" }
            ].map((item, i) => (
              <div key={i} className={`flex flex-col md:flex-row gap-12 items-center ${item.align === 'right' ? 'md:flex-row-reverse' : ''}`}>
                <div className="text-8xl font-bold text-[#2A2F38] select-none font-display">{item.step}</div>
                <div className="flex-1">
                  <h3 className="text-3xl md:text-4xl font-bold mb-4 text-[#DEDCDC]">{item.title}</h3>
                  <p className="text-lg text-[#989DAA] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist: Minimal & Bold */}
      <section id="waitlist" className="py-40 relative border-t border-[#57707A]/20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="bg-[#2A2F38] border border-[#57707A]/40 rounded-[3rem] p-12 md:p-32 text-[#DEDCDC] text-center relative overflow-hidden shadow-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative z-10"
            >
              <h2 className="text-5xl md:text-7xl font-bold mb-8 font-display">Join the <br />inner circle.</h2>
              <p className="text-xl text-[#989DAA] mb-12 max-w-xl mx-auto">We're onboarding creators in small batches to ensure the best experience. Secure your spot today.</p>

              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.form
                    key="form"
                    onSubmit={handleWaitlistSubmit}
                    className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto p-2 bg-[#191D23] rounded-3xl border border-[#57707A]/40 shadow-inner"
                  >
                    <input
                      type="email"
                      required
                      placeholder="Enter your email"
                      className="flex-1 bg-transparent px-8 py-5 text-[#DEDCDC] placeholder:text-[#57707A] outline-none text-lg disabled:opacity-50"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <button
                      disabled={isSubmitting}
                      className="bg-[#C5BAC4] text-[#191D23] px-10 py-5 rounded-2xl font-bold text-lg hover:bg-white transition-all disabled:opacity-70 flex items-center justify-center min-w-[160px] shadow-md"
                    >
                      {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Get Started"}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl font-bold text-[#B3FF00] flex flex-col items-center gap-4"
                  >
                    <CheckCircle2 size={48} className="text-[#B3FF00]" />
                    <div>
                      You're on the list. <br />
                      <span className="text-[#989DAA] text-xl">Welcome to Blink.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Background shapes */}
            <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-[#C5BAC4]/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#B3FF00]/5 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-[#57707A]/30 bg-[#191D23]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#C5BAC4] text-[#191D23] rounded-lg flex items-center justify-center font-bold shadow-sm">
              <Image
                src="/bsw.png"
                alt="Blink Logo"
                width={24}
                height={24}
              />
            </div>
            <span className="text-lg font-bold text-[#DEDCDC] font-display">BlinkSpot</span>
          </div>
          <div className="flex gap-12 text-sm text-[#989DAA] font-bold tracking-wide">
            <a href="#" className="hover:text-[#DEDCDC] transition-colors">Twitter</a>
            <a href="#" className="hover:text-[#DEDCDC] transition-colors">Instagram</a>
            <a href="/privacy" className="hover:text-[#DEDCDC] transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-[#DEDCDC] transition-colors">Terms and Conditions</a>
            <a href="/cookies" className="hover:text-[#DEDCDC] transition-colors">Cookie Policy</a>
            <a href="/acceptable-use" className="hover:text-[#DEDCDC] transition-colors">Acceptable Use Policy</a>
          </div>
          <p className="text-sm text-[#57707A] font-medium">© 2026 Blink AI. Crafted with intent.</p>
        </div>
      </footer>
    </div>
  );
}