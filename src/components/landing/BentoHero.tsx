"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles, Zap, Users } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Spinning circular badge (Hex-style) ─────────────────────────────────────
function SpinBadge() {
  const text = "BLINKSPOT · AI SOCIAL OS · CREATE FAST · ";
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Outer spinning text ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0"
      >
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <path id="circle-path" d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0" />
          </defs>
          <text className="fill-[#C5BAC4]/60" style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.12em" }}>
            <textPath href="#circle-path">{text}</textPath>
          </text>
        </svg>
      </motion.div>
      {/* Center icon */}
      <div className="w-10 h-10 rounded-full bg-[#B3FF00]/15 border border-[#B3FF00]/30 flex items-center justify-center z-10">
        <Sparkles size={18} className="text-[#B3FF00]" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BentoHero() {
  return (
    <section
      aria-label="BlinkSpot hero"
      className="pt-20 sm:pt-24 pb-8 sm:pb-10 px-4 sm:px-6"
    >
      <div className="max-w-7xl mx-auto">

        {/*
          Desktop grid (3 columns):
          ┌──────────┬──────────┬─────────────────────┐
          │ portrait │ ai-cards │ headline panel       │
          │ (tall)   │ (short)  │                      │
          │          ├──────────┤                      │
          │          │ spin bdg │                      │
          └──────────┴──────────┴─────────────────────┘
          ┌─────────────────────┬─────────────────────┐
          │ laptop card (wide)  │ phone + creator info │
          └─────────────────────┴─────────────────────┘
        */}

        {/* ── Top row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_0.75fr_1.6fr] gap-3 sm:gap-4 mb-3 sm:mb-4">

          {/* Portrait — tall, spans 2 rows on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative rounded-[1.75rem] overflow-hidden bg-[#2A2F38]
                       aspect-[3/4] sm:aspect-[3/4] lg:row-span-2"
          >
            <Image
              src="/landing/hero-portrait.png"
              alt="Creator using BlinkSpot"
              fill
              priority
              className="object-cover object-top"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 22vw"
            />
            {/* Subtle bottom fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#191D23]/60 via-transparent to-transparent" />
            {/* Status chip */}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-[#191D23]/80 backdrop-blur-md rounded-xl px-4 py-2.5
                              border border-[#C5BAC4]/20 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#B3FF00] animate-pulse" />
                <span className="text-[11px] font-bold text-[#DEDCDC]">Brand DNA active</span>
              </div>
            </div>
          </motion.div>

          {/* Middle column: AI cards tile + spin badge */}
          <div className="flex flex-col gap-3 sm:gap-4 hidden lg:flex">

            {/* AI cards tile */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
              className="relative rounded-[1.75rem] overflow-hidden bg-[#2A2F38] flex-1"
            >
              <Image
                src="/landing/ai-cards.png"
                alt="AI-generated content cards"
                fill
                priority
                className="object-cover object-center"
                sizes="18vw"
              />
              <div className="absolute top-3 left-3">
                <span className="bg-[#B3FF00] text-[#191D23] text-[9px] font-black
                                 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  AI Studio
                </span>
              </div>
            </motion.div>

            {/* Spinning badge tile */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
              className="rounded-[1.75rem] bg-[#2A2F38]/60 border border-[#57707A]/30
                         flex items-center justify-center aspect-square"
            >
              <SpinBadge />
            </motion.div>

          </div>

          {/* Right: Headline + CTA panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="relative rounded-[1.75rem] bg-[#2A2F38]/50 border border-[#57707A]/20
                       p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden
                       sm:col-span-2 lg:col-span-1 min-h-[380px] lg:min-h-0 lg:row-span-2"
          >
            {/* Ambient glows */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#C5BAC4]/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -left-10 w-56 h-56 bg-[#B3FF00]/6 blur-[70px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex-1 flex flex-col justify-center">
              {/* Badge */}
              <div className="inline-flex w-fit px-3.5 py-1.5 rounded-full bg-[#B3FF00]/10
                              border border-[#B3FF00]/25 text-[#B3FF00] text-[10px] font-black
                              mb-7 uppercase tracking-[0.15em]">
                AI Social Media OS
              </div>

              {/* H1 */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black
                             leading-[0.9] font-display text-balance mb-6">
                Your brand.<br />
                <em className="text-[#C5BAC4] not-italic">Everywhere.</em><br />
                Automatically.
              </h1>

              <p className="text-base sm:text-lg text-[#989DAA] leading-relaxed max-w-md mb-9">
                Turn your brand guidelines into AI-generated images, videos, and captions.
                Schedule and publish across every platform — without lifting a finger.
              </p>

              {/* CTA row */}
              <div className="flex flex-wrap gap-3 items-center">
                <Link
                  href="/get-started"
                  className="bg-[#C5BAC4] text-[#191D23] px-7 py-3.5 rounded-2xl font-bold
                             text-base hover:bg-white transition-colors flex items-center gap-2
                             shadow-xl shadow-[#C5BAC4]/15"
                >
                  Start for free <ArrowRight size={16} />
                </Link>
                <Link
                  href="#features"
                  className="text-[#57707A] hover:text-[#C5BAC4] transition-colors
                             text-sm font-semibold flex items-center gap-1.5 px-3 py-3.5"
                >
                  See features →
                </Link>
              </div>
            </div>

            {/* Social proof */}
            <div className="relative z-10 pt-7 mt-7 border-t border-[#57707A]/20
                            flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {["A","K","Z","M"].map((l, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#2A2F38]
                                            bg-[#57707A]/40 flex items-center justify-center
                                            text-[10px] font-bold text-[#C5BAC4]">{l}</div>
                  ))}
                </div>
                <span className="text-xs text-[#57707A]">
                  <span className="text-[#989DAA] font-semibold">2,000+</span> creators
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#57707A]">
                <Zap size={12} className="text-[#B3FF00]" />
                <span>No credit card required</span>
              </div>
            </div>
          </motion.div>

        </div>

        {/* ── Bottom row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] gap-3 sm:gap-4">

          {/* Laptop — wide feature tile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
            className="relative rounded-[1.75rem] overflow-hidden bg-[#2A2F38] aspect-[16/9] sm:aspect-[16/9]"
          >
            <Image
              src="/landing/laptop-calendar.png"
              alt="BlinkSpot content calendar dashboard"
              fill
              className="object-cover object-top"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 38vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#191D23]/60 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-5">
              <p className="text-[10px] font-bold text-[#B3FF00] uppercase tracking-widest mb-1">Feature</p>
              <p className="text-sm font-bold text-[#DEDCDC]">Intelligent Content Calendar</p>
            </div>
          </motion.div>

          {/* Phone — publishing tile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.28, ease: EASE }}
            className="relative rounded-[1.75rem] overflow-hidden bg-[#2A2F38] aspect-square sm:aspect-auto"
          >
            <Image
              src="/landing/phone-grid.png"
              alt="Multi-platform social media publishing"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 50vw, 22vw"
            />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-[#191D23]/80 backdrop-blur-sm rounded-xl px-3 py-2.5
                              border border-[#57707A]/25">
                <p className="text-[10px] font-bold text-[#B3FF00] uppercase tracking-widest mb-0.5">Publish</p>
                <p className="text-xs font-semibold text-[#DEDCDC]">10+ social platforms</p>
              </div>
            </div>
          </motion.div>

          {/* Stats card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
            className="rounded-[1.75rem] bg-[#2A2F38]/60 border border-[#57707A]/25
                       p-6 flex flex-col justify-between aspect-square sm:aspect-auto"
          >
            <div className="w-10 h-10 rounded-xl bg-[#C5BAC4]/15 border border-[#C5BAC4]/25
                            flex items-center justify-center mb-4">
              <Users size={18} className="text-[#C5BAC4]" />
            </div>

            <div className="space-y-4 flex-1 flex flex-col justify-center">
              {[
                { n: "6+",   label: "AI models" },
                { n: "10+",  label: "Platforms" },
                { n: "100%", label: "Brand-aligned" },
              ].map(({ n, label }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-[#57707A] font-medium">{label}</span>
                  <span className="text-lg font-black text-[#C5BAC4] font-display">{n}</span>
                </div>
              ))}
            </div>

            <Link
              href="/get-started"
              className="mt-5 w-full bg-[#191D23] border border-[#57707A]/40 text-[#989DAA]
                         hover:bg-[#C5BAC4] hover:text-[#191D23] hover:border-[#C5BAC4]
                         transition-all rounded-xl py-2.5 text-xs font-bold text-center"
            >
              Get started free
            </Link>
          </motion.div>

        </div>

      </div>
    </section>
  );
}
