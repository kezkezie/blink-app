"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { loadSVGFromString, StaticCanvas, util } from "fabric";
import { createBrandWorkspace, getBrandAllowance, setBrandLogo } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";
import { GOOGLE_FONTS_REGISTRY, injectGoogleFont } from "@/lib/fonts";
import { sanitizeSvg } from "@/lib/svg-sanitize";
import { supabase } from "@/lib/supabase";

/**
 * Build a brand from scratch: a few lines about the business become a starter identity (name,
 * tagline, story, voice, palette, fonts) and three vector logo options. Everything is editable
 * before the brand is created, and free: it uses the assistant model, not image credits.
 * Kezie asked for this 2026-10-10 ("the logo maker is a starter").
 */

type Proposal = {
  names: string[]; name: string; tagline: string; description: string; industry: string; audience: string;
  voice: { summary: string; keywords: string[]; dos: string[]; donts: string[] };
  palette: { primary: string; secondary: string; accent: string; neutral: string };
  fonts: { heading: string; body: string };
  visualStyle: string;
  logos: string[];
};
type Logo = { direction: string; svg: string | null; busy: boolean; error?: string };

const FEELS = ["Bold", "Minimal", "Playful", "Premium", "Natural", "Techy", "Warm", "Retro", "Calm", "Street"];
const EXAMPLE = "We sell cold-pressed juices in Nairobi, made from fruit we buy straight from farmers. Delivered in glass bottles to offices and gyms.";
const FONT_NAMES = GOOGLE_FONTS_REGISTRY.map((f) => f.family);

async function fontsReady(families: string[]) {
  families.forEach(injectGoogleFont);
  try { await Promise.all(families.flatMap((f) => [document.fonts.load(`700 48px "${f}"`), document.fonts.load(`400 16px "${f}"`)])); } catch { /* fall back to system fonts */ }
}

/**
 * The model sometimes sets a viewBox narrower than what it drew (a wordmark runs off the edge).
 * Measure the real drawing with the page's fonts and re-frame it with a little air around it.
 */
function fitViewBox(svg: string): string {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:800px;visibility:hidden";
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const el = host.querySelector("svg");
    if (!el) return svg;
    el.setAttribute("width", "800"); el.setAttribute("height", "800");
    const b = el.getBBox();
    if (!b.width || !b.height) return svg;
    const pad = Math.max(b.width, b.height) * 0.06;
    el.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
    el.removeAttribute("width"); el.removeAttribute("height");
    return el.outerHTML;
  } catch { return svg; }
  finally { host.remove(); }
}

/** Draw the SVG with Fabric (so web fonts render) onto a transparent 1024px PNG. */
async function svgToPng(svg: string, size = 1024): Promise<Blob> {
  const { objects, options } = await loadSVGFromString(svg);
  const group = util.groupSVGElements(objects.filter((o): o is NonNullable<typeof o> => !!o), options);
  const el = document.createElement("canvas");
  const c = new StaticCanvas(el, { width: size, height: size, enableRetinaScaling: false });
  const scale = (size * 0.9) / Math.max(group.width || 1, group.height || 1);
  group.scale(scale);
  c.add(group);
  c.centerObject(group);
  c.renderAll();
  const url = c.toDataURL({ format: "png", multiplier: 1 });
  c.dispose();
  return (await fetch(url)).blob();
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1.5 cursor-pointer">
      <span className="relative h-14 rounded-xl border" style={{ background: value, borderColor: "var(--s-line-2)" }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label} colour`} />
      </span>
      <span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{label} <span className="font-mono" style={{ color: "var(--s-soft)" }}>{value}</span></span>
    </label>
  );
}

export function BrandBuilder() {
  const router = useRouter();
  const { setActiveBrand, setAvailableBrands, availableBrands } = useBrandStore();
  const [business, setBusiness] = useState("");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("");
  const [colors, setColors] = useState("");
  const [vibe, setVibe] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [p, setP] = useState<Proposal | null>(null);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [drawnFor, setDrawnFor] = useState("");
  const [creating, setCreating] = useState(false);
  const [allowance, setAllowance] = useState<{ used: number; limit: number; canCreate: boolean } | null>(null);

  useEffect(() => {
    void getBrandAllowance().then((a) => { if (!("error" in a)) setAllowance(a); });
  }, []);
  useEffect(() => { if (p) void fontsReady([p.fonts.heading, p.fonts.body]); }, [p?.fonts.heading, p?.fonts.body]); // eslint-disable-line react-hooks/exhaustive-deps

  async function build() {
    if (business.trim().length < 8) { toast.info("Tell us a little more about the business first."); return; }
    setThinking(true);
    try {
      const res = await fetch("/api/brand/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business, name, audience, colors, vibe }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't build the brand.");
      const next = data as Proposal;
      setP(next);
      setPicked(null);
      await fontsReady([next.fonts.heading, next.fonts.body]);
      void drawLogos(next, next.logos);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't build the brand."); }
    finally { setThinking(false); }
  }

  async function drawOne(prop: Proposal, direction: string) {
    const res = await fetch("/api/editor/vector", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `A logo for "${prop.name}"${prop.tagline ? ` (${prop.tagline})` : ""}. ${direction} Include the wordmark "${prop.name}". Square composition, works small, transparent background.`,
        colors: [prop.palette.primary, prop.palette.secondary, prop.palette.accent], brandName: prop.name, font: prop.fonts.heading, style: "flat",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const clean = res.ok && data.svg ? sanitizeSvg(data.svg) : null;
    if (!clean) throw new Error(data.error || "Couldn't draw this one.");
    await fontsReady([prop.fonts.heading]);
    return fitViewBox(clean);
  }

  async function drawLogos(prop: Proposal, directions: string[]) {
    const list = (directions.length ? directions : ["A simple bold mark and a clean wordmark."]).slice(0, 3);
    setLogos(list.map((d) => ({ direction: d, svg: null, busy: true })));
    setDrawnFor(prop.name);
    await Promise.all(list.map(async (d, i) => {
      try {
        const svg = await drawOne(prop, d);
        setLogos((prev) => prev.map((l, j) => (j === i ? { ...l, svg, busy: false, error: undefined } : l)));
      } catch (e) {
        setLogos((prev) => prev.map((l, j) => (j === i ? { ...l, busy: false, error: e instanceof Error ? e.message : "Couldn't draw this one." } : l)));
      }
    }));
  }

  async function redraw(i: number) {
    if (!p) return;
    setLogos((prev) => prev.map((l, j) => (j === i ? { ...l, busy: true, error: undefined } : l)));
    try {
      const svg = await drawOne(p, logos[i].direction);
      setLogos((prev) => prev.map((l, j) => (j === i ? { ...l, svg, busy: false } : l)));
      setDrawnFor(p.name);
    } catch (e) {
      setLogos((prev) => prev.map((l, j) => (j === i ? { ...l, busy: false, error: e instanceof Error ? e.message : "Couldn't draw this one." } : l)));
    }
  }

  async function create() {
    if (!p || !p.name.trim()) { toast.info("Give the brand a name first."); return; }
    setCreating(true);
    try {
      const a = await getBrandAllowance();
      if ("error" in a) throw new Error(a.error);
      if (!a.canCreate) throw new Error(`You're using ${a.used} of ${a.limit} brand${a.limit === 1 ? "" : "s"} on your plan. Upgrade, or archive a brand to free a slot.`);
      const r = await createBrandWorkspace({
        userId: "", contactName: "",
        brandName: p.name.trim(), companyName: p.name.trim(), industry: p.industry,
        description: [p.tagline, p.description, p.audience ? `Audience: ${p.audience}` : ""].filter(Boolean).join("\n\n"),
        websiteUrl: "", socialUrls: "",
        visualStyleGuide: p.visualStyle,
        primaryColor: p.palette.primary, secondaryColor: p.palette.secondary, accentColor: p.palette.accent, additionalColor: p.palette.neutral,
        primaryFont: p.fonts.heading, secondaryFont: p.fonts.body,
        brandVoice: p.voice.summary, toneKeywords: p.voice.keywords, dos: p.voice.dos, donts: p.voice.donts,
        logoUrl: null, uploadedAssets: [],
      });
      if (r.error || !r.brandId || !r.clientId) throw new Error(r.error || "Couldn't create the brand.");
      let logoUrl: string | null = null;
      const svg = picked !== null ? logos[picked]?.svg : null;
      if (svg) {
        try {
          await fontsReady([p.fonts.heading]);
          const png = await svgToPng(svg);
          const path = `images/${r.clientId}/logo_${r.brandId}_${Date.now()}.png`;
          const up = await supabase.storage.from("assets").upload(path, png, { contentType: "image/png" });
          if (up.error) throw up.error;
          const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
          const set = await setBrandLogo(r.brandId, url);
          if (set.error) throw new Error(set.error);
          logoUrl = url;
        } catch { toast.error("The brand is ready, but the logo didn't save. Add it on the Brand page."); }
      }
      const brand = { id: r.brandId, brand_name: p.name.trim(), logo_url: logoUrl };
      setAvailableBrands([...availableBrands, brand]);
      setActiveBrand(brand);
      toast.success(`${brand.brand_name} is ready. Everything here can be changed on the Brand page.`);
      window.scrollTo({ top: 0 });
      router.push("/studio/brand");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the brand."); }
    finally { setCreating(false); }
  }

  const fontOptions = useMemo(() => FONT_NAMES.map((f) => <option key={f} value={f}>{f}</option>), []);
  const full = allowance && !allowance.canCreate;
  const stale = p && logos.length > 0 && drawnFor && drawnFor !== p.name;

  return (
    <div className="max-w-[980px] mx-auto pt-2 md:pt-6 pb-16">
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Brand builder · free</p>
      <h2 className="text-[26px] md:text-[32px] font-semibold leading-tight tracking-tight mb-2">Start a brand from scratch</h2>
      <p className="text-[14px] mb-6 max-w-[620px]" style={{ color: "var(--s-soft)" }}>
        Tell us what the business does. You get a name, colours, fonts, a voice and three logos to pick from. Change anything before you save it.
      </p>
      {full && (
        <div className="s-card p-3 mb-5 text-[13px]" style={{ borderColor: "var(--s-warn)" }}>
          You&apos;re using {allowance.used} of {allowance.limit} brand{allowance.limit === 1 ? "" : "s"} on your plan. You can still try the builder; to save the brand, upgrade or archive one from the brand menu → Manage brands.
        </div>
      )}

      <section className="s-card p-4 md:p-5 grid gap-4">
        <div>
          <label className="s-label" htmlFor="bb-business">What does the business do?</label>
          <textarea id="bb-business" className="s-input" rows={3} value={business} onChange={(e) => setBusiness(e.target.value)} placeholder={EXAMPLE} />
          {!business && <button className="s-btn ghost sm mt-1.5" onClick={() => setBusiness(EXAMPLE)}>Use the example</button>}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="min-w-0"><label className="s-label" htmlFor="bb-name">Name (optional)</label><input id="bb-name" className="s-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave empty for ideas" /></div>
          <div className="min-w-0"><label className="s-label" htmlFor="bb-aud">Who is it for? (optional)</label><input id="bb-aud" className="s-input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. busy office workers" /></div>
          <div className="min-w-0"><label className="s-label" htmlFor="bb-col">Colours you like (optional)</label><input id="bb-col" className="s-input" value={colors} onChange={(e) => setColors(e.target.value)} placeholder="e.g. green and cream" /></div>
        </div>
        <div>
          <span className="s-label">The feel</span>
          <div className="flex flex-wrap gap-1.5">
            {FEELS.map((f) => <button key={f} className="s-chip" aria-pressed={vibe.includes(f)} onClick={() => setVibe((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f].slice(0, 4)))}>{f}</button>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="s-btn primary" onClick={build} disabled={thinking}>
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {p ? "Build again" : "Build my brand"} <span className="cost">free</span>
          </button>
          {thinking && <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Thinking it through, about 20 seconds…</span>}
        </div>
      </section>

      {p && (
        <>
          <section className="s-card p-4 md:p-5 mt-5 grid gap-4">
            <h3 className="s-section-h !mb-0">1 · Name and story</h3>
            {p.names.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.names.map((n) => <button key={n} className="s-chip" aria-pressed={p.name === n} onClick={() => setP({ ...p, name: n })}>{n}</button>)}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0"><label className="s-label" htmlFor="bb-pname">Brand name</label><input id="bb-pname" className="s-input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
              <div className="min-w-0"><label className="s-label" htmlFor="bb-tag">Tagline</label><input id="bb-tag" className="s-input" value={p.tagline} onChange={(e) => setP({ ...p, tagline: e.target.value })} /></div>
            </div>
            <div><label className="s-label" htmlFor="bb-desc">What you do</label><textarea id="bb-desc" className="s-input" rows={2} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></div>
          </section>

          <section className="s-card p-4 md:p-5 mt-5 grid gap-4">
            <h3 className="s-section-h !mb-0">2 · Look</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["primary", "secondary", "accent", "neutral"] as const).map((k) => (
                <Swatch key={k} label={k[0].toUpperCase() + k.slice(1)} value={p.palette[k]} onChange={(v) => setP({ ...p, palette: { ...p.palette, [k]: v } })} />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0"><label className="s-label" htmlFor="bb-hf">Heading font</label><select id="bb-hf" className="s-input" value={p.fonts.heading} onChange={(e) => setP({ ...p, fonts: { ...p.fonts, heading: e.target.value } })}>{fontOptions}</select></div>
              <div className="min-w-0"><label className="s-label" htmlFor="bb-bf">Body font</label><select id="bb-bf" className="s-input" value={p.fonts.body} onChange={(e) => setP({ ...p, fonts: { ...p.fonts, body: e.target.value } })}>{fontOptions}</select></div>
            </div>
            <div className="rounded-xl p-5 md:p-7" style={{ background: p.palette.neutral, color: p.palette.primary }}>
              <div className="text-[30px] md:text-[40px] leading-[1.05] font-bold" style={{ fontFamily: `"${p.fonts.heading}"` }}>{p.name || "Your brand"}</div>
              <div className="mt-2 text-[15px] max-w-[520px]" style={{ fontFamily: `"${p.fonts.body}"`, opacity: 0.85 }}>{p.tagline || p.description}</div>
              <span className="inline-block mt-4 px-4 py-2 rounded-full text-[13px] font-semibold" style={{ background: p.palette.accent, color: p.palette.neutral, fontFamily: `"${p.fonts.body}"` }}>Order now</span>
              <span className="inline-block mt-4 ml-2 px-4 py-2 rounded-full text-[13px] font-semibold" style={{ background: p.palette.secondary, color: p.palette.primary, fontFamily: `"${p.fonts.body}"` }}>Learn more</span>
            </div>
            {p.visualStyle && <p className="text-[13px]" style={{ color: "var(--s-soft)" }}><b style={{ color: "var(--s-text)" }}>Photo style:</b> {p.visualStyle}</p>}
          </section>

          <section className="s-card p-4 md:p-5 mt-5 grid gap-3">
            <div className="flex items-center gap-2">
              <h3 className="s-section-h !mb-0">3 · Logo</h3>
              <div className="flex-1" />
              {stale && <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Logos use the old name.</span>}
              <button className="s-btn ghost sm" disabled={logos.some((l) => l.busy)} onClick={() => drawLogos(p, logos.map((l) => l.direction))}><RotateCcw className="h-3.5 w-3.5" /> Redraw all</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {logos.map((l, i) => (
                <div key={i} className="grid gap-2">
                  <button
                    className="relative rounded-xl overflow-hidden grid place-items-center p-5 border-2 transition-colors"
                    style={{ aspectRatio: "1", background: p.palette.neutral, borderColor: picked === i ? "var(--s-accent)" : "transparent" }}
                    onClick={() => l.svg && setPicked(picked === i ? null : i)}
                    aria-pressed={picked === i}
                    aria-label={`Logo option ${i + 1}`}
                    disabled={!l.svg}
                  >
                    {l.busy ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: p.palette.primary }} />
                      : l.svg ? <span className="w-full h-full [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: l.svg }} />
                      : <span className="text-[12px]" style={{ color: p.palette.primary }}>{l.error}</span>}
                    {picked === i && <span className="s-badge ok absolute left-2 top-2"><Check className="inline h-3 w-3 -mt-px" /> CHOSEN</span>}
                  </button>
                  <p className="text-[12px] leading-snug" style={{ color: "var(--s-mute)" }}>{l.direction}</p>
                  <button className="s-btn ghost sm justify-self-start" disabled={l.busy} onClick={() => redraw(i)}><Wand2 className="h-3.5 w-3.5" /> Redraw</button>
                </div>
              ))}
            </div>
            <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>Logos are vectors: open one in the Editor later to change the shapes or words. A starter, not a final logo.</p>
          </section>

          <section className="s-card p-4 md:p-5 mt-5 grid gap-3">
            <h3 className="s-section-h !mb-0">4 · Voice</h3>
            <p className="text-[14px]">{p.voice.summary}</p>
            <div className="flex flex-wrap gap-1.5">{p.voice.keywords.map((k) => <span key={k} className="s-badge">{k}</span>)}</div>
            <div className="grid gap-3 md:grid-cols-2 text-[13px]" style={{ color: "var(--s-soft)" }}>
              <ul className="grid gap-1">{p.voice.dos.map((d) => <li key={d}>✓ {d}</li>)}</ul>
              <ul className="grid gap-1">{p.voice.donts.map((d) => <li key={d}>✕ {d}</li>)}</ul>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button className="s-btn primary" onClick={create} disabled={creating || !p.name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create {p.name.trim() || "brand"}
            </button>
            <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{picked === null ? "No logo chosen: you can add one later." : "With the chosen logo."}</span>
          </div>
        </>
      )}
    </div>
  );
}
