"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, MessageSquareText, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { createBrandWorkspace, saveBrandDna, saveProduct } from "@/app/actions/brand";
import { CTAS, LANGUAGES, PERSONALITY, PHOTO_VIBES, type BrandDna } from "@/lib/brand-dna";
import { canvasSafe, loadImage, paletteOf } from "@/components/studio/editor/util";

/**
 * Setting up a brand in two screens (Kezie, 2026-10-12: long forms tire people out). Used after
 * sign-up (/welcome) and for every new brand (/studio/brand/new), so there is one way to do it.
 * 1. Start: a website or Instagram (AI fills everything in), or one sentence, or "build one".
 * 2. Review: one card with what the AI found, the essentials open, the rest folded away.
 * Everything else (products, contacts, fonts) is on the Brand page later, with "Fill the gaps".
 */
export type QuickStartResult = { brandId: string; name: string; logo: string | null; style: "auto" | "pro" };

function Chips({ options, value, onChange, max, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max: number; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" className="s-chip" aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o].slice(-max))}>{o}</button>)}
    </div>
  );
}
function Label({ children, hint, guess }: { children: React.ReactNode; hint?: string; guess?: boolean }) {
  return (
    <span className="block mb-1.5">
      <span className="text-[13px] font-medium">{children}</span>
      {hint && <span className="text-[12px] ml-2" style={{ color: "var(--s-mute)" }}>{hint}</span>}
      {guess && <span className="s-badge ai ml-2" title="BlinkSpot suggested this. Check it.">AI guess · check</span>}
    </span>
  );
}

export function BrandQuickStart({ clientId, firstName, onDone, onBuild, intro }: {
  clientId: string;
  firstName?: string;
  onDone: (r: QuickStartResult) => void;
  /** "No brand yet": where the brand builder lives. */
  onBuild: () => void;
  intro?: "signup" | "new";
}) {
  const [step, setStep] = useState<"start" | "review" | "saving">("start");
  const [role, setRole] = useState<BrandDna["role"]>("business");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [name, setName] = useState("");
  const [what, setWhat] = useState("");
  const [audience, setAudience] = useState("");
  const [location, setLocation] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [colors, setColors] = useState(["#111111", "#C6F432", "#FF6B35"]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [tone, setTone] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [whatsapp, setWhatsapp] = useState("");
  const [cta, setCta] = useState("Order on WhatsApp");
  const [uploading, setUploading] = useState(false);
  const [filling, setFilling] = useState<null | "site" | "describe">(null);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [style, setStyle] = useState<"auto" | "pro">("auto");
  const [extra, setExtra] = useState<{ tagline?: string; usps?: string[]; offer?: string; phone?: string; email?: string; industry?: string; socials?: string[]; products?: Array<{ name: string; description?: string; price?: number | null; currency?: string }> }>({});
  const logoRef = useRef<HTMLInputElement>(null);

  async function autofill(mode: "site" | "describe") {
    setFilling(mode);
    try {
      const res = await fetch("/api/brand/fill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "site" ? { mode, website, instagram, name } : { mode, name, description: what, location }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.fields) throw new Error(data.error || "Couldn't fill it in.");
      const f = data.fields as Record<string, unknown>;
      const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
      const a = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : undefined);
      if (s("name") && !name.trim()) setName(s("name")!);
      if (s("description") && (mode === "site" || !what.trim())) setWhat(s("description")!);
      if (s("audience") && !audience.trim()) setAudience(s("audience")!);
      if (s("location") && !location.trim()) setLocation(s("location")!);
      if (a("tone")?.length) setTone(a("tone")!.slice(0, 3));
      if (a("languages")?.length) setLanguages(a("languages")!.slice(0, 3));
      if (a("photoVibes")?.length) setVibes(a("photoVibes")!.slice(0, 3));
      if (s("whatsapp") && !whatsapp.trim()) setWhatsapp(s("whatsapp")!);
      if (s("cta")) setCta(s("cta")!);
      if (s("themeColor")) setColors((c) => [s("themeColor")!, c[1], c[2]]);
      if (s("logoUrl") && !logo) {
        setLogo(s("logoUrl")!);
        try {
          const pal = paletteOf(await loadImage(canvasSafe(s("logoUrl")!)), 6).filter((c) => !/^#(F{6}|FEFEFE|000000)$/i.test(c));
          if (pal.length) setColors((c) => [pal[0] ?? c[0], pal[1] ?? c[1], pal[2] ?? c[2]]);
        } catch { /* keep colours */ }
      }
      setExtra((e) => ({ ...e, tagline: s("tagline") ?? e.tagline, usps: a("usps") ?? e.usps, offer: s("offer") ?? e.offer, phone: s("phone") ?? e.phone, email: s("email") ?? e.email, industry: s("industry") ?? e.industry, socials: a("socials") ?? e.socials, products: (f.products as typeof e.products) ?? e.products }));
      setGuessed(Array.isArray(data.guessed) ? data.guessed : []);
      setFilledFrom(mode === "site" ? (data.sources?.website ?? (data.sources?.instagram ? `@${data.sources.instagram}` : "your page")) : "your description");
      setStep("review");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't fill it in."); }
    finally { setFilling(null); }
  }

  async function onLogo(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const path = `images/${clientId}/logo_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type || "image/png" });
      if (error) throw error;
      const url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
      setLogo(url);
      try {
        const pal = paletteOf(await loadImage(canvasSafe(url)), 6).filter((c) => !/^#(F{6}|FEFEFE|000000)$/i.test(c));
        if (pal.length) setColors((c) => [pal[0] ?? c[0], pal[1] ?? c[1], pal[2] ?? c[2]]);
      } catch { /* keep the picked colours */ }
    } catch { toast.error("Couldn't upload the logo. Try a PNG or JPG."); }
    finally { setUploading(false); }
  }

  async function create() {
    setStep("saving");
    const created = await createBrandWorkspace({
      userId: "", contactName: firstName ?? "", brandName: name.trim(), companyName: name.trim(), industry: extra.industry ?? "", description: what.trim(),
      websiteUrl: website.trim(), socialUrls: (extra.socials ?? []).join("\n"), visualStyleGuide: "", primaryColor: colors[0], secondaryColor: colors[1], accentColor: colors[2],
      additionalColor: "", primaryFont: null, brandVoice: "", toneKeywords: tone, logoUrl: null, uploadedAssets: [],
    });
    if (created.error || !created.brandId) { toast.error(created.error || "Couldn't create your brand."); setStep("review"); return; }
    await saveBrandDna(created.brandId, {
      brand_name: name.trim(), description: what.trim(), website_url: website.trim(), logo_url: logo, primary_color: colors[0], secondary_color: colors[1], accent_color: colors[2],
      tone_keywords: tone, industry: extra.industry, social_urls: (extra.socials ?? []).join("\n"),
      dna: { role, audience, location, languages, photoVibes: vibes, whatsapp, cta, tagline: extra.tagline, usps: extra.usps, offer: extra.offer, phone: extra.phone, email: extra.email },
    });
    for (const p of extra.products ?? []) await saveProduct(created.brandId, { name: p.name, description: p.description, price: p.price ?? null, currency: p.currency }).catch(() => null);
    try { localStorage.setItem("blink-work-style", style); } catch { /* private mode */ }
    onDone({ brandId: created.brandId, name: name.trim(), logo, style });
  }

  const canCreate = name.trim().length > 1 && what.trim().length > 8;
  const canSite = website.trim().length >= 4 || instagram.trim().length >= 2;

  if (step === "saving") {
    return (
      <section className="grid place-items-center gap-4 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-accent)" }} />
        <h1 className="text-[24px] font-semibold">Setting up {name || "your brand"}…</h1>
      </section>
    );
  }

  if (step === "start") {
    return (
      <section className="grid gap-6">
        <div>
          <h1 className="text-[30px] md:text-[32px] font-semibold tracking-tight leading-tight">{intro === "new" ? "Add a brand" : `Hi${firstName ? ` ${firstName}` : ""}. Let's set up your brand.`}</h1>
          <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>Give us your website or Instagram and we fill it all in. You check one page, and you&apos;re in. About a minute.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--s-soft)" }}>
          <span>It&apos;s for</span>
          {([["business", "my business"], ["agency", "a client"], ["creator", "me, as a creator"]] as const).map(([id, label]) => (
            <button key={id} type="button" className="s-chip" aria-pressed={role === id} onClick={() => setRole(id)}>{label}</button>
          ))}
        </div>
        <div className="s-card p-4 grid gap-3" style={{ borderColor: "color-mix(in oklab, var(--s-accent) 35%, var(--s-line))" }}>
          <b className="text-[15px] flex items-center gap-2"><Wand2 className="h-4 w-4" style={{ color: "var(--s-accent)" }} /> Fill it in from {role === "agency" ? "their" : "my"} website or Instagram</b>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="s-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbrand.com" aria-label="Website" inputMode="url" data-no-mic />
            <input className="s-input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@yourbrand (Instagram)" aria-label="Instagram" data-no-mic />
          </div>
          <button className="s-btn primary w-fit" disabled={!canSite || !!filling} onClick={() => autofill("site")}>
            {filling === "site" ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading the page…</> : <><Wand2 className="h-4 w-4" /> Fill it in for me</>}
          </button>
          {filling === "site" && <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>About 15 seconds. We copy only what&apos;s on the page; anything we guess is marked.</p>}
        </div>
        <div className="s-card p-4 grid gap-3">
          <b className="text-[15px] flex items-center gap-2"><MessageSquareText className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> No website? Say it in one sentence</b>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input className="s-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand name" aria-label="Brand name" />
            <input className="s-input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Home-cooked East African food, delivered in Westlands" aria-label="What you do" />
          </div>
          <button className="s-btn ai w-fit" disabled={name.trim().length < 2 || what.trim().length < 9 || !!filling} onClick={() => autofill("describe")}>
            {filling === "describe" ? <><Loader2 className="h-4 w-4 animate-spin" /> Filling it in…</> : <><Sparkles className="h-4 w-4" /> Fill in the rest</>}
          </button>
        </div>
        <div className="grid gap-2">
          <button type="button" className="text-left text-[13.5px] flex items-center gap-2" style={{ color: "var(--s-soft)" }} onClick={onBuild}>
            <Sparkles className="h-4 w-4" style={{ color: "var(--s-accent)" }} /> No brand yet? <span className="underline">Build one with me</span> (a name, colours, a voice and logos, free)
          </button>
          <button type="button" className="text-left text-[13px] w-fit underline" style={{ color: "var(--s-mute)" }} onClick={() => { setFilledFrom(null); setStep("review"); }}>Or type it in yourself</button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight leading-tight">Does this look right?</h1>
        <p className="text-[14px] mt-1.5" style={{ color: "var(--s-soft)" }}>{filledFrom ? <>Filled in from <b>{filledFrom}</b>. Change anything that&apos;s off; <span className="s-badge ai">AI guess</span> means we inferred it.</> : "Fill in what you can. Everything can change later."}</p>
      </div>
      <div className="s-card p-5 grid gap-4">
        <div className="flex gap-4 items-center">
          <button type="button" className="h-20 w-20 rounded-2xl grid place-items-center overflow-hidden border-2 border-dashed shrink-0" style={{ borderColor: "var(--s-line-2)", background: logo ? "#fff" : "var(--s-bg)" }} onClick={() => logoRef.current?.click()} aria-label={logo ? "Change logo" : "Upload logo"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : logo ? <img src={logo} alt="Logo" className="max-w-[80%] max-h-[80%] object-contain" /> : <span className="grid place-items-center gap-1 text-[11px]" style={{ color: "var(--s-mute)" }}><Upload className="h-4 w-4" />Logo</span>}
          </button>
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="grid gap-1.5 flex-1 min-w-0">
            <input className="s-input text-[16px] font-semibold" style={{ height: 44 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand name" aria-label="Brand name" />
            <div className="flex gap-1.5 items-center">
              {colors.map((c, i) => (
                <label key={i} className="relative h-8 w-8 rounded-lg border cursor-pointer" style={{ background: c, borderColor: "var(--s-line-2)" }} title={c}>
                  <input type="color" value={c} onChange={(e) => setColors((prev) => prev.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={["Main", "Second", "Accent"][i] + " colour"} />
                </label>
              ))}
              <span className="text-[11.5px] ml-1" style={{ color: "var(--s-mute)" }}>{logo ? "from your logo" : "your colours"}</span>
            </div>
          </div>
        </div>
        <label><Label hint="One or two sentences">What do you sell or do?</Label><textarea className="s-input" rows={2} value={what} onChange={(e) => setWhat(e.target.value)} aria-label="What you do" /></label>
        <div><Label hint="Up to three" guess={guessed.includes("tone")}>How you sound</Label><Chips options={PERSONALITY} value={tone} onChange={setTone} max={3} label="Personality" /></div>
        <button type="button" className="text-[13px] flex items-center gap-1.5 w-fit" style={{ color: "var(--s-soft)" }} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: more ? "rotate(180deg)" : undefined }} /> {more ? "Fewer details" : "More details (optional): audience, place, languages, contacts"}
        </button>
        {more && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label><Label guess={guessed.includes("audience")}>Who is it for?</Label><input className="s-input" value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Who it's for" /></label>
              <label><Label>Where are you based?</Label><input className="s-input" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Where you're based" /></label>
              <label><Label>WhatsApp for customers</Label><input className="s-input" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+254 7…" aria-label="WhatsApp" data-no-mic /></label>
              <label><Label guess={guessed.includes("cta")}>What should people do?</Label><select className="s-input" value={cta} onChange={(e) => setCta(e.target.value)} aria-label="Call to action">{CTAS.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
            <div><Label hint="We write in these" guess={guessed.includes("languages")}>Languages</Label><Chips options={LANGUAGES} value={languages} onChange={setLanguages} max={3} label="Languages" /></div>
            <div><Label hint="Up to three" guess={guessed.includes("photoVibes")}>Photo feel</Label><Chips options={PHOTO_VIBES} value={vibes} onChange={setVibes} max={3} label="Photo feel" /></div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--s-soft)" }}>
        <span>Start with</span>
        <button type="button" className="s-chip" aria-pressed={style === "auto"} onClick={() => setStyle("auto")}>Ask BlinkSpot does it for me</button>
        <button type="button" className="s-chip" aria-pressed={style === "pro"} onClick={() => setStyle("pro")}>I&apos;ll use the tools</button>
      </div>
      <div className="flex gap-2">
        <button className="s-btn ghost" onClick={() => setStep("start")}><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="flex-1" />
        <button className="s-btn primary lg" disabled={!canCreate} onClick={create}>Looks right, create {name.trim() || "my brand"}</button>
      </div>
    </section>
  );
}
