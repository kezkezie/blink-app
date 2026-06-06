"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowRight } from "lucide-react";

// ─── Character data ───────────────────────────────────────────────────────────
// imageUrl: swap in the AI-generated character image when available.
// Until then, each card renders a styled gradient placeholder.

export const CHARACTERS = [
  {
    id: "creator",
    name: "Leo",
    age: "Young Creator",
    tagline: "Start making content today",
    cta: "Create in minutes",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#B3FF00",
    gradient: "from-[#B3FF00]/20 to-[#B3FF00]/5",
    icon: "🚀",
    delay: 0,
  },
  {
    id: "social",
    name: "Zara",
    age: "Social Creator",
    tagline: "Schedule across every platform",
    cta: "Automate your posting",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#C5BAC4",
    gradient: "from-[#C5BAC4]/20 to-[#C5BAC4]/5",
    icon: "✨",
    delay: 0.1,
  },
  {
    id: "founder",
    name: "Kwame",
    age: "Business Owner",
    tagline: "Turn your brand into content that converts",
    cta: "Grow your brand",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#9B8EA8",
    gradient: "from-[#9B8EA8]/20 to-[#9B8EA8]/5",
    icon: "📊",
    delay: 0.2,
  },
  {
    id: "designer",
    name: "Amara",
    age: "Creative Agency",
    tagline: "Produce cinematic video for every client",
    cta: "Try the video studio",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#F472B6",
    gradient: "from-[#F472B6]/20 to-[#F472B6]/5",
    icon: "🎬",
    delay: 0.3,
  },
  {
    id: "legacy",
    name: "Marcus",
    age: "Legacy Brand",
    tagline: "Get your business on social — finally",
    cta: "Build your presence",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#60A5FA",
    gradient: "from-[#60A5FA]/20 to-[#60A5FA]/5",
    icon: "💼",
    delay: 0.4,
  },
  {
    id: "community",
    name: "Grace",
    age: "Community Creator",
    tagline: "Tell your story consistently, effortlessly",
    cta: "Stay consistent",
    route: "/get-started",
    imageUrl: null as string | null,
    accent: "#FB923C",
    gradient: "from-[#FB923C]/20 to-[#FB923C]/5",
    icon: "📅",
    delay: 0.5,
  },
];

// ─── Single character card ────────────────────────────────────────────────────

function CharacterCard({ character }: { character: typeof CHARACTERS[0] }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          onClick={() => router.push(character.route)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: character.delay, ease: [0.22, 1, 0.36, 1] }}
          animate={{
            y: hovered ? -6 : [0, -5, 0],
          }}
          whileHover={{ scale: 1.06 }}
          className="relative flex flex-col items-center gap-3 cursor-pointer group focus:outline-none"
          aria-label={`${character.name} — ${character.age}: ${character.tagline}`}
        >
          {/* Avatar area */}
          <div
            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden transition-all duration-300"
            style={{
              boxShadow: hovered
                ? `0 0 0 2px ${character.accent}, 0 12px 40px ${character.accent}30`
                : "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            {character.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.imageUrl}
                alt={`${character.name} — ${character.age}`}
                className="w-full h-full object-cover object-top"
                loading="lazy"
                decoding="async"
              />
            ) : (
              /* Placeholder: replace by adding imageUrl to CHARACTERS */
              <div className={`w-full h-full bg-gradient-to-b ${character.gradient} bg-[#2A2F38] flex flex-col items-center justify-center gap-1 border border-[#57707A]/20`}>
                <span className="text-3xl" role="img" aria-hidden>{character.icon}</span>
                <span className="text-[10px] font-bold text-[#57707A] uppercase tracking-widest">{character.name[0]}</span>
              </div>
            )}

            {/* Hover overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: hovered ? 1 : 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-end justify-center pb-2"
              style={{ background: `linear-gradient(to top, ${character.accent}40, transparent)` }}
            >
              <ArrowRight size={16} style={{ color: character.accent }} />
            </motion.div>
          </div>

          {/* Name + role */}
          <div className="text-center">
            <p className="text-xs font-bold text-[#DEDCDC] leading-none">{character.name}</p>
            <p className="text-[10px] text-[#57707A] mt-0.5 leading-tight max-w-[90px]">{character.age}</p>
          </div>
        </motion.button>
      </TooltipTrigger>

      <TooltipContent
        side="top"
        className="bg-[#2A2F38] border border-[#57707A]/40 text-[#DEDCDC] text-xs font-medium max-w-[180px] text-center px-3 py-2 rounded-xl shadow-xl"
      >
        <p className="font-bold mb-0.5" style={{ color: character.accent }}>{character.cta}</p>
        <p className="text-[#989DAA] text-[11px]">{character.tagline}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Showcase section ─────────────────────────────────────────────────────────

export function HumanoidShowcase() {
  return (
    <TooltipProvider delayDuration={200}>
      <section
        aria-label="BlinkSpot works for every type of creator"
        className="py-16 sm:py-20 relative overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#C5BAC4]/5 blur-[100px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#57707A] mb-3">
              Built for every creator type
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#DEDCDC] font-display">
              Whoever you are,<br className="hidden sm:block" />
              <span className="text-[#C5BAC4]"> BlinkSpot fits your workflow.</span>
            </h2>
          </motion.div>

          {/* Characters — horizontal scroll on mobile, centered row on desktop */}
          <div
            className="flex gap-6 sm:gap-8 md:gap-10 lg:gap-14 overflow-x-auto sm:overflow-visible justify-start sm:justify-center pb-4 sm:pb-0 px-2 sm:px-0 snap-x snap-mandatory sm:snap-none scrollbar-none"
            role="list"
            aria-label="Creator personas"
          >
            {CHARACTERS.map(character => (
              <div key={character.id} className="snap-center shrink-0 sm:shrink" role="listitem">
                <CharacterCard character={character} />
              </div>
            ))}
          </div>

          {/* CTA nudge */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-center text-xs text-[#57707A] mt-8 font-medium"
          >
            Hover any creator to see how BlinkSpot works for them ↑
          </motion.p>
        </div>
      </section>
    </TooltipProvider>
  );
}
