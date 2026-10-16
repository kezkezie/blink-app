"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Film, ImagePlus, LayoutTemplate, Lightbulb, Loader2, RotateCcw, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { IMAGE_ENGINE_REGISTRY } from "@/lib/image-engine-pricing";
import { IMAGE_STUDIO_ALLOWED_FORMATS, type AssistedCreativeDirection, type CreativeConcept } from "@/lib/assisted-creation";
import { SENSITIVE, SENSITIVE_FAILURE, softenForAi } from "@/lib/ai-safe-text";
import { mustKeep } from "@/lib/design-pass";
import { GENERATE_LOOKS, buildGeneratePrompt, lookForVibes, routerTopic, type GenerateLook } from "@/lib/generate-prompt";
import type { BrandResearch } from "@/lib/brand-research";
import type { VisualRefs } from "@/lib/visual-refs";
import { thumbUrl } from "./media";
import { generateBrandImages, generationErrorMessage, useBrandKit, type GeneratedImage, type ImageEngine } from "./generate-image";

/**
 * Generate, simple by default: say what you want → (optionally) three ideas → pick one → check the
 * brief, look, size and quality → Generate. 2026-10-14: ideas follow how the brand's industry posts
 * (researched once per brand), picking an idea picks its look, "Plain" sends the words as they are,
 * and words, products and the logo go in exactly as given. Pro controls left the new look (the
 * classic studio stays in Vintage look).
 */
const FORMATS = ["4:5", "1:1", "3:4", "9:16", "16:9"] as const;
const MAX_PRODUCTS = 8;
type Quality = "best" | "fast" | "draft";

async function assisted<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/ai/assisted-creation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedFormats: IMAGE_STUDIO_ALLOWED_FORMATS, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "BlinkSpot couldn't think of ideas just now.");
  return data as T;
}

export function StudioGenerate({ initialIdea, autoIdeas }: { initialIdea?: string; autoIdeas?: boolean }) {
  const { clientId } = useClient();
  const { activeBrand } = useBrandStore();
  const kit = useBrandKit(activeBrand?.id, activeBrand?.brand_name);
  const [idea, setIdea] = useState(initialIdea ?? "");
  const [concepts, setConcepts] = useState<CreativeConcept[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [look, setLook] = useState<GenerateLook | null>(null);
  const [words, setWords] = useState("");
  const [logoOn, setLogoOn] = useState<boolean | null>(null);
  const [basedOn, setBasedOn] = useState<string | null>(null);
  const [research, setResearch] = useState<BrandResearch | null | undefined>(undefined);
  // Reference pictures from the brand's category and the art direction Claude took from them (2026-10-16).
  const [visual, setVisual] = useState<VisualRefs | null>(null);
  const [visualFor, setVisualFor] = useState<string | null>(null);
  const [studying, setStudying] = useState(false);
  const [showRefs, setShowRefs] = useState(false);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("4:5");
  const [quality, setQuality] = useState<Quality>("best");
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<Array<{ url: string; preview: string }>>([]);
  const [thinking, setThinking] = useState<"research" | "ideas" | "brief" | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"refs" | "design" | "make" | null>(null);
  const [designNote, setDesignNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  // The brand's research, its photo vibe and its logo set the starting point; the user can change any.
  const brandResearch = research === undefined ? kit?.research ?? null : research;
  const activeLook: GenerateLook = look ?? lookForVibes(kit?.dna?.photoVibes);
  const withLogo = (logoOn ?? !!kit?.logoUrl) && !!kit?.logoUrl;
  const attached = refs.length + (withLogo ? 1 : 0);
  // Draft (Z-Image, 1 credit) can't take pictures in; Best keeps the logo and products most exactly.
  const draftable = attached === 0;
  const pick: Quality = quality === "draft" && !draftable ? "best" : quality;
  const engineFor = (q: Quality): ImageEngine => q === "best" ? "nb2" : q === "draft" ? "z-image" : attached ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image";
  const engine = engineFor(pick);
  const cost = IMAGE_ENGINE_REGISTRY[engine].creditCost * count;
  const ready = brief.trim().length >= 8;

  // The kept reference board, if this brand has one (free, never starts a study).
  useEffect(() => {
    if (!activeBrand) return;
    let cancelled = false;
    fetch("/api/brand/visual-refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id, cachedOnly: true }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) { setVisual(d?.refs ? (d as VisualRefs) : null); setVisualFor(activeBrand.id); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeBrand]);
  const brandVisual = visualFor === activeBrand?.id ? visual : null;

  /** Reference pictures from the brand's category: studied once per brand (about a minute, no credits). */
  async function ensureVisual(): Promise<VisualRefs | null> {
    if (brandVisual || !activeBrand) return brandVisual;
    setStudying(true);
    try {
      const res = await fetch("/api/brand/visual-refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id }) });
      const d = res.ok ? await res.json().catch(() => null) : null;
      const v = d?.refs ? (d as VisualRefs) : null;
      setVisual(v); setVisualFor(activeBrand.id);
      return v;
    } catch { return null; }
    finally { setStudying(false); }
  }

  /** How leading brands in this industry post: researched once per brand (about 30 s, no credits). */
  async function ensureResearch(): Promise<BrandResearch | null> {
    if (brandResearch || !activeBrand) return brandResearch;
    setThinking("research");
    try {
      const res = await fetch("/api/brand/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: activeBrand.id }) });
      const data = await res.json().catch(() => ({}));
      const r = res.ok ? (data.research as BrandResearch) : null;
      if (!r) toast.info("Couldn't study how brands like yours post this time, so these ideas are general. Try again later for industry-based ones.", { duration: 8000 });
      setResearch(r);
      return r;
    } catch { setResearch(null); return null; }
  }

  async function getIdeas(text = idea) {
    if (!activeBrand || text.trim().length < 8) { toast.info("Tell me a bit more first (a few words is enough)."); return; }
    setConcepts([]); setPicked(null);
    await ensureResearch();
    // The reference board is studied alongside, so it's ready when they press Generate.
    if (!brandVisual && !studying) void ensureVisual();
    setThinking("ideas");
    try {
      const data = await assisted<{ concepts: CreativeConcept[] }>({ operation: "concepts", brandId: activeBrand.id, idea: text.trim() });
      setConcepts((data.concepts ?? []).filter((c) => c.format === "image").slice(0, 3));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No ideas this time.");
    } finally { setThinking(null); }
  }

  // Arriving from Create (or Ask) with an idea: ideas straight away, no second prompt.
  useEffect(() => {
    if (!autoIdeas || autoRan.current || !activeBrand || !initialIdea || initialIdea.trim().length < 8) return;
    autoRan.current = true;
    const t = setTimeout(() => { void getIdeas(initialIdea); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIdeas, activeBrand?.id, initialIdea]);

  async function chooseConcept(c: CreativeConcept) {
    if (!activeBrand) return;
    setPicked(c.id);
    setBrief(`${c.title}. ${c.idea}`);
    setBasedOn(c.basedOn ?? null);
    if (c.look) setLook(c.look);
    setThinking("brief");
    try {
      const data = await assisted<{ direction: AssistedCreativeDirection }>({ operation: "direction", brandId: activeBrand.id, idea: idea.trim() || c.idea, concept: c });
      if (data.direction?.summary) setBrief(data.direction.summary);
      if (!c.look && data.direction?.style && GENERATE_LOOKS.some((l) => l.id === data.direction.style)) setLook(data.direction.style as GenerateLook);
    } catch {
      // the concept text is a fine brief on its own
    } finally {
      setThinking(null);
      setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  }

  function makeItNow() {
    if (idea.trim().length < 3) { toast.info("Type or say what you want first."); return; }
    setBrief(idea.trim());
    setBasedOn(null);
    setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  async function addRef(file: File | undefined) {
    if (!file || !clientId) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error("Use a JPG, PNG or WebP image."); return; }
    const preview = URL.createObjectURL(file);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `images/${clientId}/studio_ref_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type });
    if (error) { toast.error("Couldn't upload that photo."); return; }
    setRefs((r) => [...r, { url: supabase.storage.from("assets").getPublicUrl(path).data.publicUrl, preview }].slice(0, MAX_PRODUCTS));
  }

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(t); setElapsed(0); };
  }, [busy]);

  async function generate(override?: string) {
    const text = override ?? brief;
    if (!clientId || !activeBrand || !kit || text.trim().length < 8) return;
    setBusy(true);
    try {
      // Best looks at real references first (once per brand); Fast uses them if they're there.
      let board = brandVisual;
      if (!board && pick === "best" && activeLook !== "plain") { setPhase("refs"); board = await ensureVisual(); }
      let assembledPrompt = buildGeneratePrompt({
        brief: text, look: activeLook, colours: [kit.primaryColor, kit.secondaryColor], font: kit.primaryFont,
        words, logo: withLogo, products: refs.length, research: brandResearch, basedOn, visual: board,
      });
      // Design it before rendering (2026-10-14): Best and Fast get an art director's prompt from the
      // design playbook; Plain and Draft go as written. If design fails, the requirements go as they are.
      let note: string | null = null;
      if (activeLook !== "plain" && pick !== "draft") {
        setPhase("design");
        const designed = await fetch("/api/generate/design", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: activeBrand.id, look: activeLook, requirements: assembledPrompt }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { prompt?: string; notes?: string } | null;
        if (designed?.prompt) {
          const keep = mustKeep(assembledPrompt);
          assembledPrompt = `${designed.prompt}${keep ? `\n${keep}` : ""}`;
          note = designed.notes || null;
        }
      }
      setPhase("make");
      const saved = await generateBrandImages({
        clientId, brandId: activeBrand.id, kit,
        prompt: routerTopic(text.trim()), assembledPrompt,
        references: [...(withLogo && kit.logoUrl ? [kit.logoUrl] : []), ...refs.map((r) => r.url)],
        engine, aspect: format, style: activeLook, count,
        caption: (words.trim() || text.trim().split(/[.!?]/)[0]).slice(0, 120),
      });
      setResults((prev) => [...saved, ...prev]);
      setDesignNote(note);
      toast.success(`${saved.length} image${saved.length === 1 ? "" : "s"} made and saved to your Library.`);
    } catch (e) {
      const msg = generationErrorMessage(e);
      // A refused picture of a medical or intimate subject: say why and what to try (2026-10-14).
      const sensitive = SENSITIVE.test(`${text} ${kit.description ?? ""}`) && /could not make|couldn't make|refused|safety|internal error/i.test(msg);
      const softer = softenForAi(text);
      toast.error(sensitive ? SENSITIVE_FAILURE : msg, {
        duration: 15000,
        // Only on the user's say-so: their words are theirs (2026-10-14: a brief with anatomy words
        // failed on every model; the same brief in clinical wording worked).
        ...(sensitive && softer !== text ? { action: { label: "Retry in clinical wording", onClick: () => { setBrief(softer); void generate(softer); } } } : {}),
      });
    } finally { setBusy(false); setPhase(null); }
  }

  const name = kit?.name || activeBrand?.brand_name || "your brand";

  return (
    <div className="max-w-[1080px] mx-auto p-4 md:p-8">
      {/* 1 · the idea */}
      <div className="s-card p-3.5" style={{ borderColor: "var(--s-line-2)" }}>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void getIdeas(); }}
          rows={3}
          style={{ ["--min-lines" as string]: 3, ["--max-lines" as string]: 6 }}
          maxLength={1200}
          placeholder={`What do you want to make for ${name}? e.g. a poster for our weekend lunch special`}
          aria-label="Your idea"
          className="s-grow w-full bg-transparent outline-none resize-none text-base leading-relaxed px-1"
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button className="s-btn ghost sm" onClick={() => fileRef.current?.click()} disabled={refs.length >= MAX_PRODUCTS} title="One photo: the product stays exactly as it is. Several: they're arranged together in one scene.">
            <ImagePlus className="h-3.5 w-3.5" /> {refs.length ? "Add another product" : "Add your product photo"}
          </button>
          {refs.map((r, i) => (
            <span key={r.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.preview} alt="" className="h-8 w-8 rounded-md object-cover" style={{ border: "1px solid var(--s-line-2)" }} />
              <button className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full grid place-items-center" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }} onClick={() => setRefs((x) => x.filter((_, j) => j !== i))} aria-label="Remove photo"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          <div className="flex-1" />
          <button className="s-btn" onClick={() => getIdeas()} disabled={thinking !== null}>
            {thinking === "ideas" || thinking === "research" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" style={{ color: "var(--s-ai)" }} />} Get 3 ideas <span className="cost">free</span>
          </button>
          <button className="s-btn primary" onClick={makeItNow}>Use my words <ArrowRight className="h-4 w-4" /></button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void addRef(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-xs mt-2 px-1" style={{ color: "var(--s-mute)" }}>
        Have a design you love instead? <Link href="/studio/image?mode=remix" className="underline">Inspo Remix</Link> remakes it for {name}.
      </p>

      {/* 2 · three ideas */}
      {(thinking === "ideas" || thinking === "research" || concepts.length > 0) && (
        <section className="mt-6">
          <h3 className="s-section-h">Three ideas for {name}</h3>
          {thinking === "research" ? (
            <p className="text-[12.5px] mb-2 flex items-center gap-1.5" style={{ color: "var(--s-soft)" }} role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Studying how brands like {name} post, once for this brand (about 30 seconds)…</p>
          ) : brandResearch ? (
            <p className="text-[12px] mb-2" style={{ color: "var(--s-mute)" }}>Based on how {brandResearch.peers.slice(0, 3).map((p) => p.name).join(", ")} post, with your colours, logo and products.</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            {thinking === "ideas" || thinking === "research"
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="s-skel" style={{ height: 150 }} />)
              : concepts.map((c) => (
                <button key={c.id} onClick={() => chooseConcept(c)} disabled={thinking === "brief"} className="s-card p-4 text-left flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors"
                  style={picked === c.id ? { borderColor: "var(--s-accent)" } : undefined}>
                  <b className="text-sm font-semibold">{c.title}</b>
                  {(c.look || c.basedOn) && (
                    <span className="flex flex-wrap gap-1">
                      {c.look && <span className="s-badge">{GENERATE_LOOKS.find((l) => l.id === c.look)?.label ?? c.look}</span>}
                      {c.basedOn && <span className="s-badge ai">{c.basedOn}</span>}
                    </span>
                  )}
                  <span className="text-[13px] leading-relaxed" style={{ color: "var(--s-soft)" }}>{c.idea}</span>
                  <span className="text-xs mt-auto pt-1 flex items-center gap-1" style={{ color: picked === c.id ? "var(--s-accent)" : "var(--s-mute)" }}>
                    {picked === c.id ? (thinking === "brief" ? <><Loader2 className="h-3 w-3 animate-spin" /> Writing the brief…</> : <><Check className="h-3 w-3" /> Using this</>) : "Use this idea →"}
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* 3 · brief + simple settings */}
      {brief && (
        <section ref={briefRef} className="mt-6 s-card p-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="s-label">Your brief</span>
            <textarea className="s-input s-grow" rows={6} style={{ ["--min-lines" as string]: 5, ["--max-lines" as string]: 12 }} value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Your brief" />
            <span className="s-label mt-3">Look</span>
            <div className="flex flex-wrap gap-1.5">{GENERATE_LOOKS.map((l) => <button key={l.id} className="s-chip" aria-pressed={activeLook === l.id} title={l.line} onClick={() => setLook(l.id)}>{l.label}</button>)}</div>
            <p className="text-[11.5px] mt-1.5" style={{ color: "var(--s-mute)" }}>
              {activeLook === "plain" ? "Plain: your brief as you wrote it, no style or industry look added." : GENERATE_LOOKS.find((l) => l.id === activeLook)?.line}
            </p>
            <label className="grid gap-1 mt-3">
              <span className="s-label !mb-0">Words on the image <span className="normal-case tracking-normal font-normal" style={{ color: "var(--s-mute)" }}>(optional, written exactly)</span></span>
              <input className="s-input" value={words} maxLength={140} onChange={(e) => setWords(e.target.value)} placeholder='e.g. "Weekend 20% off"' aria-label="Words on the image" />
            </label>
            {kit?.logoUrl && (
              <label className="flex items-center gap-2 mt-3 text-[13px] cursor-pointer">
                <input type="checkbox" checked={withLogo} onChange={(e) => setLogoOn(e.target.checked)} aria-label="Put our logo on it" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={kit.logoUrl} alt="" className="h-5 w-5 rounded object-contain bg-white p-px" /> Put our logo on it
              </label>
            )}
            {refs.length > 0 && <p className="text-[11.5px] mt-2" style={{ color: "var(--s-mute)" }}>{refs.length === 1 ? "Your product stays exactly as photographed." : `Your ${refs.length} products are arranged together, each exactly as photographed.`}</p>}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <span className="s-label">Size</span>
              <div className="flex flex-wrap gap-1.5">{FORMATS.map((f) => <button key={f} className="s-chip" aria-pressed={format === f} onClick={() => setFormat(f)}>{f}</button>)}</div>
            </div>
            <div>
              <span className="s-label">Quality</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["best", "fast", "draft"] as const).map((q) => {
                  const e = engineFor(q);
                  const off = q === "draft" && !draftable;
                  return (
                    <button key={q} onClick={() => setQuality(q)} disabled={off} className="text-left px-3 py-2 rounded-[10px] disabled:opacity-40" aria-label={`Quality ${q}`}
                      title={off ? "Draft can't use your logo or product photos" : undefined}
                      style={{ border: `1px solid ${pick === q ? "var(--s-accent)" : "var(--s-line-2)"}`, background: pick === q ? "color-mix(in oklab, var(--s-accent) 6%, var(--s-bg))" : "var(--s-bg)" }}>
                      <div className="flex justify-between"><b className="text-[13px]">{q === "best" ? "Best" : q === "fast" ? "Fast" : "Draft"}</b><span className="text-xs mono">{IMAGE_ENGINE_REGISTRY[e].creditCost} cr</span></div>
                      <div className="text-[11px]" style={{ color: "var(--s-mute)" }}>{q === "best" ? "Nano Banana 2 · 4K" : q === "fast" ? "GPT Image 2" : "Z-Image, to try ideas"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="s-label">How many</span>
              <div className="flex gap-1.5">{[1, 2, 3, 4].map((n) => <button key={n} className="s-chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}</div>
            </div>
            <button className="s-btn primary lg w-full mt-auto" disabled={!ready || busy || !kit} onClick={() => void generate()}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {phase === "refs" ? "Studying references…" : phase === "design" ? "Designing it…" : "Making it…"} {elapsed > 0 && `${elapsed} s`}</> : <><Sparkles className="h-4 w-4" /> Generate <span className="cost">{cost} cr</span></>}
            </button>
            {/* What it learned from: reference pictures from the brand's category (2026-10-16). */}
            {studying ? (
              <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: "var(--s-soft)" }} role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Studying reference pictures for {name} from Pinterest, brands and design studios, once for this brand (about a minute)…</p>
            ) : brandVisual ? (
              <div className="grid gap-1.5">
                <button className="text-[11.5px] text-left flex items-center gap-1.5" style={{ color: "var(--s-soft)" }} onClick={() => setShowRefs((v) => !v)} aria-expanded={showRefs}>
                  <Sparkles className="h-3 w-3" style={{ color: "var(--s-ai)" }} /> Learning from {brandVisual.refs.length} reference pictures in your category <span className="underline">{showRefs ? "hide" : "see them"}</span>
                </button>
                {showRefs && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {brandVisual.refs.map((r) => <RefThumb key={r.url} r={r} />)}
                    </div>
                    {brandVisual.notes && <p className="text-[11px]" style={{ color: "var(--s-mute)" }}>{brandVisual.notes} References guide the craft; nothing is copied.</p>}
                  </>
                )}
              </div>
            ) : null}
            {/* Say what to expect and what you can do about it, not a disclaimer (Microsoft HAX: make
                clear how well the system can do what it can do; PAIR: set expectations, give control). */}
            <p className="text-[11px] text-center" style={{ color: "var(--s-mute)" }}>
              AI makes a first version of your brief. If it isn&apos;t quite right, change one thing with Edit with AI, add your exact words in the Editor, or make more. Failed images are refunded.
            </p>
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="mt-8">
          <h3 className="s-section-h">Made just now</h3>
          {designNote && <p className="text-[12px] -mt-1 mb-1" style={{ color: "var(--s-soft)" }}><Sparkles className="inline h-3 w-3" style={{ color: "var(--s-ai)" }} /> Designed as: {designNote}</p>}
          <p className="text-[12px] -mt-1 mb-3" style={{ color: "var(--s-mute)" }}>Close but not quite? <Wand2 className="inline h-3 w-3" /> changes one thing in the picture, <b>Add type</b> puts your words and logo on in the real font.</p>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((r) => (
              <div key={r.url} className="s-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="m" style={{ aspectRatio: "4 / 5" }}><img src={thumbUrl(r.url, 700)} alt="Generated" /></div>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {r.id && <Link href={`/studio/image?mode=design&content=${r.id}`} className="s-btn sm" title="Add your type and logo"><LayoutTemplate className="h-3.5 w-3.5" /> Add type</Link>}
                  {r.id && <Link href={`/studio/image?mode=edit&content=${r.id}`} className="s-btn sm" title="Change colours or objects"><Wand2 className="h-3.5 w-3.5" /></Link>}
                  <Link href={`/studio/video?mode=showcase&start=${encodeURIComponent(r.url)}`} className="s-btn sm" title="Animate"><Film className="h-3.5 w-3.5" /></Link>
                  {r.id && <Link href={`/studio/library/${r.id}`} className="s-btn ghost sm">Post</Link>}
                </div>
              </div>
            ))}
          </div>
          <button className="s-btn ghost sm mt-3" onClick={() => void generate()} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> More like this · {cost} cr</button>
        </section>
      )}

    </div>
  );
}

/** One reference: its picture linking to where it came from; a site that refuses the picture shows its name instead. */
function RefThumb({ r }: { r: VisualRefs["refs"][number] }) {
  const [failed, setFailed] = useState(false);
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" title={`${r.title} · ${r.source}`} className="h-14 w-14 rounded-lg overflow-hidden grid place-items-center text-center" style={{ border: "1px solid var(--s-line)", background: "var(--s-panel)" }}>
      {failed
        ? <span className="text-[9.5px] leading-tight px-1" style={{ color: "var(--s-soft)" }}>{r.source}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={r.image} alt={r.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </a>
  );
}
