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

// --- UI Mockup Components ---

const CalendarMockup = ({ className = "" }) => (
  <div className={`bg-brand-bg/90 rounded-2xl border border-brand-light/10 p-4 shadow-2xl ${className}`}>
    <div className="flex justify-between items-center mb-4">
      <div className="h-2 w-16 bg-brand-surface/30 rounded" />
      <div className="flex gap-1">
        {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-light/10" />)}
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 21 }).map((_, i) => (
        <div key={i} className={`aspect-square rounded-sm ${i === 8 ? 'bg-brand-accent/40' : 'bg-brand-surface/10'}`} />
      ))}
    </div>
  </div>
);

const EditorMockup = ({ className = "" }) => (
  <div className={`bg-brand-surface/20 rounded-2xl border border-brand-light/10 p-3 shadow-2xl backdrop-blur-md ${className}`}>
    <div className="aspect-video bg-brand-bg/60 rounded-lg mb-3 flex items-center justify-center">
      <Video className="text-brand-accent/40" size={32} />
    </div>
    <div className="space-y-2">
      <div className="h-1.5 w-full bg-brand-light/10 rounded" />
      <div className="h-1.5 w-2/3 bg-brand-light/10 rounded" />
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
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-6 py-4 ${scrolled ? 'bg-brand-bg/60 backdrop-blur-xl border-b border-brand-light/5' : ''}`}>
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-brand-light text-brand-bg rounded-xl flex items-center justify-center font-bold text-xl group-hover:rotate-12 transition-transform">B</div>
          <span className="text-xl font-display font-bold tracking-tighter">Blink</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-brand-secondary">
          <a href="#features" className="hover:text-brand-light transition-colors">Features</a>
          <a href="#workflow" className="hover:text-brand-light transition-colors">Workflow</a>
          <a href="/login" className="hover:text-brand-light transition-colors">Sign In</a>
          <a href="/get-started" className="bg-brand-light text-brand-bg px-6 py-2.5 rounded-full hover:bg-brand-accent transition-colors">Get Started</a>
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
    <div ref={containerRef} className="relative">
      <Navbar />

      {/* Hero: Lifestyle Background & Floating Elements */}
      <section className="min-h-screen flex items-center pt-20 relative overflow-hidden">
        {/* Lifestyle Background with Blur */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=2000"
            alt="Workspace"
            className="w-full h-full object-cover opacity-20 grayscale-[0.5]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-bg via-brand-bg/90 to-brand-bg" />
        </div>

        <div className="max-w-7xl mx-auto px-6 w-full grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-block px-4 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-bold mb-8 uppercase tracking-widest">
              Next-Gen Social OS
            </div>
            <h1 className="text-6xl md:text-8xl font-bold mb-8 text-balance leading-[0.95]">
              Create at the <br />
              <span className="text-brand-accent italic">speed</span> of light.
            </h1>
            <p className="text-xl text-brand-secondary max-w-lg mb-12 leading-relaxed">
              Blink is the first social media operating system designed for the modern creator. One workspace, zero friction.
            </p>
            <div className="flex flex-wrap gap-6">
              <a href="#waitlist" className="bg-brand-light text-brand-bg px-10 py-5 rounded-2xl font-bold text-lg hover:bg-brand-accent transition-colors flex items-center gap-3 shadow-xl shadow-brand-accent/10">
                Get Early Access <ArrowRight size={20} />
              </a>
              <div className="flex -space-x-3 items-center">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-brand-bg bg-brand-surface/40 overflow-hidden">
                    <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="user" referrerPolicy="no-referrer" />
                  </div>
                ))}
                <span className="pl-6 text-sm text-brand-secondary font-medium">Joined by 2k+ creators</span>
              </div>
            </div>
          </motion.div>

          {/* Floating Device & Elements inspired by the image */}
          <div className="relative h-[700px] flex items-center justify-center">
            {/* Main Floating Phone Mockup */}
            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-20 w-[300px] aspect-[9/19.5] bg-brand-bg rounded-[3rem] border-[8px] border-brand-surface/30 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-brand-surface/30 rounded-b-2xl z-30" />
              <div className="p-6 pt-12 h-full bg-brand-light/5 flex flex-col gap-4">
                <div className="h-4 w-20 bg-brand-accent/20 rounded" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="aspect-square bg-brand-accent/10 rounded-xl" />
                  <div className="aspect-square bg-brand-surface/20 rounded-xl" />
                  <div className="aspect-square bg-brand-surface/10 rounded-xl" />
                  <div className="aspect-square bg-brand-accent/30 rounded-xl" />
                </div>
                <div className="flex-1 bg-brand-surface/5 rounded-2xl border border-brand-light/5 p-3">
                  <div className="h-2 w-full bg-brand-light/10 rounded mb-2" />
                  <div className="h-2 w-2/3 bg-brand-light/10 rounded" />
                </div>
              </div>
            </motion.div>

            {/* Floating Cards around the phone */}
            <motion.div
              animate={{ y: [0, 15, 0], x: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-20 -left-10 z-30 w-32 h-32 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 shadow-xl"
            >
              <div className="w-full h-full bg-brand-accent/20 rounded-lg flex items-center justify-center">
                <ImageIcon className="text-brand-accent" size={24} />
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -15, 0], x: [0, -5, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-40 -right-16 z-30 w-40 h-24 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl"
            >
              <div className="space-y-2">
                <div className="h-2 w-1/2 bg-brand-accent/40 rounded" />
                <div className="flex items-end gap-1 h-8">
                  {[40, 70, 50, 90, 60].map((h, i) => (
                    <div key={i} className="flex-1 bg-brand-accent/20 rounded-t-sm" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="absolute bottom-40 -left-20 z-30 w-24 h-24 bg-brand-accent rounded-2xl p-4 shadow-2xl flex items-center justify-center"
            >
              <Sparkles className="text-brand-bg" size={32} />
            </motion.div>

            <motion.div
              animate={{ y: [0, -25, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-20 -right-10 z-30 w-36 h-36 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl overflow-hidden"
            >
              <img src="https://picsum.photos/seed/content/200/200" alt="Content" className="w-full h-full object-cover rounded-lg opacity-60" referrerPolicy="no-referrer" />
            </motion.div>

            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-accent/10 blur-[150px] rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Problem: Full Dark, Centered Contrast */}
      <section className="py-40 bg-brand-bg relative">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="space-y-12"
          >
            <h2 className="text-4xl md:text-6xl font-bold">Stop tool-hopping. <br />Start <span className="text-brand-accent">building</span>.</h2>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {[
                { icon: Layers, title: "Fragmented Data", desc: "Your assets are scattered across 10 different cloud drives." },
                { icon: MousePointer2, title: "Manual Labor", desc: "Hours spent resizing and re-uploading the same video." },
                { icon: Share2, title: "Silent Feeds", desc: "Inconsistency is killing your reach. Blink fixes that." }
              ].map((item, i) => (
                <div key={i} className="p-8 rounded-3xl bg-brand-surface/5 border border-brand-light/5">
                  <item.icon className="text-brand-accent mb-6" size={28} />
                  <h4 className="text-lg font-bold mb-3">{item.title}</h4>
                  <p className="text-brand-secondary text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
        <div className="glow-accent top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-surface/20" />
      </section>

      {/* Solution: Light Contrast Block, Asymmetrical */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto bg-brand-light rounded-5xl p-12 md:p-24 text-brand-bg grid lg:grid-cols-[1fr_1.2fr] gap-20 items-center overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold mb-8">The first truly <br />human-centric <br />social tool.</h2>
            <p className="text-xl opacity-70 mb-12 leading-relaxed">
              We didn't just build another scheduler. We built an engine that understands your brand and amplifies your creativity.
            </p>
            <div className="space-y-6">
              {["AI that learns your voice", "Real-time collaboration", "Native video processing"].map((text, i) => (
                <div key={i} className="flex items-center gap-4 font-bold text-lg">
                  <div className="w-6 h-6 rounded-full bg-brand-bg text-brand-light flex items-center justify-center text-xs">✓</div>
                  {text}
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="bg-brand-bg rounded-3xl p-8 shadow-2xl transform rotate-3 translate-x-12">
              <div className="flex gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-brand-surface/20" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-1/3 bg-brand-surface/20 rounded" />
                  <div className="h-2 w-full bg-brand-surface/10 rounded" />
                </div>
              </div>
              <div className="aspect-video bg-brand-surface/5 rounded-2xl border border-brand-light/5 flex items-center justify-center">
                <Sparkles className="text-brand-accent opacity-40" size={48} />
              </div>
            </div>
            <div className="absolute -bottom-10 -left-10 bg-brand-accent p-6 rounded-2xl shadow-xl transform -rotate-6 text-brand-bg font-bold">
              AI Generated Content
            </div>
          </div>
        </div>
      </section>

      {/* Features: Bento Grid Layout */}
      <section id="features" className="py-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-20">
            <h2 className="text-5xl md:text-7xl font-bold">Built for <br />power users.</h2>
            <p className="text-brand-secondary max-w-xs text-lg">Every feature is designed to eliminate a specific bottleneck in your workflow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Featured Large Card */}
            <div className="md:col-span-8 bg-brand-surface/10 rounded-4xl p-12 border border-brand-light/5 relative overflow-hidden group">
              <div className="relative z-10 max-w-md">
                <Calendar className="text-brand-accent mb-8" size={40} />
                <h3 className="text-3xl font-bold mb-4">Intelligent Calendar</h3>
                <p className="text-brand-secondary leading-relaxed">The only calendar that suggests posting times based on your specific audience behavior, not generic industry averages.</p>
              </div>
              <div className="absolute top-12 -right-20 w-[400px] opacity-20 group-hover:opacity-40 transition-opacity">
                <CalendarMockup />
              </div>
            </div>

            {/* Small Card */}
            <div className="md:col-span-4 bg-brand-accent rounded-4xl p-12 text-brand-bg">
              <Zap className="mb-8" size={40} />
              <h3 className="text-2xl font-bold mb-4">Auto-Pilot</h3>
              <p className="opacity-70 text-sm leading-relaxed">Set your strategy once and let Blink handle the daily grind of posting and tagging.</p>
            </div>

            {/* Small Card */}
            <div className="md:col-span-4 bg-brand-surface/20 rounded-4xl p-12 border border-brand-light/5">
              <Palette className="text-brand-light mb-8" size={40} />
              <h3 className="text-2xl font-bold mb-4">Brand DNA</h3>
              <p className="text-brand-secondary text-sm leading-relaxed">Upload your brand guidelines and watch as Blink adapts every AI generation to your style.</p>
            </div>

            {/* Medium Card */}
            <div className="md:col-span-8 bg-brand-bg rounded-4xl p-12 border border-brand-light/10 relative overflow-hidden">
              <div className="flex flex-col md:flex-row gap-12 items-center">
                <div className="flex-1">
                  <Video className="text-brand-accent mb-8" size={40} />
                  <h3 className="text-3xl font-bold mb-4">Native Video Studio</h3>
                  <p className="text-brand-secondary leading-relaxed">Clip, caption, and color-grade your videos without ever downloading a file.</p>
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
      <section id="workflow" className="py-40 bg-brand-surface/5">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-32">
            {[
              { step: "01", title: "Define your Identity", desc: "Connect your accounts and upload your brand assets. Blink learns your voice in minutes.", align: "left" },
              { step: "02", title: "Generate & Refine", desc: "Use our AI studio to create weeks of content in a single afternoon.", align: "right" },
              { step: "03", title: "Schedule with Confidence", desc: "Our intelligent calendar ensures your content hits the feed when it matters most.", align: "left" }
            ].map((item, i) => (
              <div key={i} className={`flex flex-col md:flex-row gap-12 items-center ${item.align === 'right' ? 'md:flex-row-reverse' : ''}`}>
                <div className="text-8xl font-bold text-brand-light/5 select-none">{item.step}</div>
                <div className="flex-1">
                  <h3 className="text-3xl md:text-4xl font-bold mb-6">{item.title}</h3>
                  <p className="text-xl text-brand-secondary leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist: Minimal & Bold */}
      <section id="waitlist" className="py-40 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-brand-light rounded-5xl p-12 md:p-32 text-brand-bg text-center relative overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative z-10"
            >
              <h2 className="text-5xl md:text-8xl font-bold mb-12">Join the <br />inner circle.</h2>
              <p className="text-xl opacity-60 mb-16 max-w-xl mx-auto">We're onboarding creators in small batches to ensure the best experience. Secure your spot today.</p>

              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.form
                    key="form"
                    onSubmit={handleWaitlistSubmit}
                    className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto p-2 bg-brand-bg rounded-3xl"
                  >
                    <input
                      type="email"
                      required
                      disabled={isSubmitting}
                      placeholder="Enter your email"
                      className="flex-1 bg-transparent px-8 py-5 text-brand-light outline-none text-lg disabled:opacity-50"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-brand-light text-brand-bg px-10 py-5 rounded-2xl font-bold text-lg hover:bg-brand-accent transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <><Loader2 className="animate-spin" size={20} /> Joining...</>
                      ) : 'Get Started'}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl font-bold text-brand-bg"
                  >
                    You're on the list. <br />
                    <span className="text-brand-surface opacity-50">Welcome to Blink.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Background shapes */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-brand-accent/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-surface/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-brand-light/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-light text-brand-bg rounded-lg flex items-center justify-center font-bold">B</div>
            <span className="text-lg font-bold">Blink</span>
          </div>
          <div className="flex gap-12 text-sm text-brand-secondary font-medium">
            <a href="#" className="hover:text-brand-light transition-colors">Twitter</a>
            <a href="#" className="hover:text-brand-text transition-colors">Instagram</a>
            <a href="#" className="hover:text-brand-text transition-colors">Privacy</a>
          </div>
          <p className="text-sm text-brand-secondary">© 2026 Blink AI. Crafted with intent.</p>
        </div>
      </footer>
    </div>
  );
}
