"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Globe, ImagePlus, Loader2, Package, Plus, Sparkles, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, loadBrandDna, saveBrandDna, saveProduct } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useClient } from "@/hooks/useClient";
import { supabase } from "@/lib/supabase";
import { GOOGLE_FONTS_REGISTRY, injectGoogleFont } from "@/lib/fonts";
import { brandStrength, CTAS, INDUSTRIES, LANGUAGES, PERSONALITY, PHOTO_VIBES, type BrandDna, type BrandProduct } from "@/lib/brand-dna";
import { canvasSafe, loadImage, paletteOf } from "../editor/util";
import { thumbUrl } from "../media";

/**
 * The Brand page in the studio look (2026-10-11). Asks what decides whether content is usable:
 * what you sell and to whom, where you are, how you sound and in which language, how people
 * reach you, plus the look. Replaces the classic three-tab form (legal name, "industry context").
 */

type Form = {
  brand_name: string; description: string; industry: string; website_url: string; social_urls: string; logo_url: string | null;
  primary_color: string; secondary_color: string; accent_color: string; neutral: string;
  primary_font: string; secondary_font: string; brand_voice: string; tone_keywords: string[]; visual_style_guide: string;
  uploaded_assets: string[]; vocabulary_notes: string; dos: string[]; donts: string[]; dna: BrandDna;
};
const EMPTY: Form = {
  brand_name: "", description: "", industry: "", website_url: "", social_urls: "", logo_url: null,
  primary_color: "#111111", secondary_color: "#C6F432", accent_color: "#FF6B35", neutral: "#F5F3EF",
  primary_font: "", secondary_font: "", brand_voice: "", tone_keywords: [], visual_style_guide: "",
  uploaded_assets: [], vocabulary_notes: "", dos: [], donts: [], dna: {},
};
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : v.split(/\n|,/).map((x) => x.trim()).filter(Boolean); } catch { return v.split(/\n/).map((x) => x.trim()).filter(Boolean); } })() : []);
/** Readable text colour for a background: the brand colour when it has contrast, else near-black or white. */
function readable(fg: string, bg: string) {
  const lum = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return 0; const n = parseInt(m[1], 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  return ratio(fg, bg) >= 3 ? fg : ratio("#111111", bg) >= ratio("#FFFFFF", bg) ? "#111111" : "#FFFFFF";
}
const lines = (v: unknown) => (typeof v === "string" ? v.split("\n").map((x) => x.trim()).filter(Boolean) : arr(v));

function toForm(b: Record<string, unknown>): Form {
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const extra = arr(b.additional_colors);
  return {
    brand_name: s("brand_name"), description: s("description"), industry: s("industry"), website_url: s("website_url"), social_urls: s("social_urls"),
    logo_url: (b.logo_url as string) || null,
    primary_color: s("primary_color") || EMPTY.primary_color, secondary_color: s("secondary_color") || EMPTY.secondary_color,
    accent_color: s("accent_color") || EMPTY.accent_color, neutral: extra[0] || EMPTY.neutral,
    primary_font: s("primary_font"), secondary_font: s("secondary_font"), brand_voice: s("brand_voice"),
    tone_keywords: [...new Set(arr(b.tone_keywords).map((k) => PERSONALITY.find((p) => p.toLowerCase() === k.toLowerCase()) ?? k))], visual_style_guide: s("visual_style_guide"), uploaded_assets: arr(b.uploaded_assets),
    vocabulary_notes: s("vocabulary_notes"), dos: lines(b.dos), donts: lines(b.donts),
    dna: (b.dna && typeof b.dna === "object" ? b.dna : {}) as BrandDna,
  };
}

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "customers", label: "Customers & offer" },
  { id: "products", label: "Products & services" },
  { id: "look", label: "Look" },
  { id: "voice", label: "Voice" },
  { id: "contact", label: "Contact & call to action" },
] as const;
const MISSING_TO_SECTION: Record<string, string> = {
  "Say what you do in a sentence": "basics", "Add your logo": "basics", "Say where you're based": "basics",
  "Say who it's for": "customers", "Say why people choose you": "customers", "Add a product or service": "products",
  "Pick your colours": "look", "Add photos that feel like you": "look", "Describe how you sound": "voice", "Pick your languages": "voice",
  "Add how people reach you": "contact",
};

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="s-card p-5 md:p-6 scroll-mt-24">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="text-[12.5px] mt-0.5 mb-5" style={{ color: "var(--s-mute)" }}>{hint}</p>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}
function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="s-label">{label}</span>
      {children}
      {hint && <p className="text-[11.5px] mt-1.5" style={{ color: "var(--s-mute)" }}>{hint}</p>}
    </div>
  );
}
function Chips({ options, value, onChange, max = 6, custom = false, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max?: number; custom?: boolean; label: string }) {
  const [draft, setDraft] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {all.map((o) => (
        <button key={o} type="button" className="s-chip" aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o].slice(-max))}>{o}</button>
      ))}
      {custom && (
        <input className="s-input" data-no-mic style={{ height: 28, width: 130, borderRadius: 999, fontSize: 12 }} value={draft} placeholder="+ your own" aria-label={`Add your own ${label.toLowerCase()}`}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); onChange([...value, draft.trim().slice(0, 30)].slice(-max)); setDraft(""); } }} />
      )}
    </div>
  );
}
function ListInput({ value, onChange, placeholder, max = 5, label }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number; label: string }) {
  const rows = value.length < max ? [...value, ""] : value;
  return (
    <div className="grid gap-1.5">
      {rows.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <input className="s-input" value={v} placeholder={i === 0 ? placeholder : "Another one"} aria-label={`${label} ${i + 1}`}
            onChange={(e) => { const next = [...value]; next[i] = e.target.value; onChange(next.filter((x, j) => x.trim() || j === i)); }}
            onBlur={() => onChange(value.map((x) => x.trim()).filter(Boolean))} />
          {v && <button type="button" className="s-btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${label} ${i + 1}`}><X className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
    </div>
  );
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1.5 min-w-0 cursor-pointer">
      <span className="relative h-16 rounded-xl border" style={{ background: value, borderColor: "var(--s-line-2)" }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label} colour`} />
      </span>
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--s-mute)" }}>
        {label}
        <input className="s-input font-mono" data-no-mic style={{ height: 24, padding: "0 6px", fontSize: 11, width: 82 }} value={value} aria-label={`${label} hex`} onChange={(e) => onChange(e.target.value.trim().toUpperCase())} onClick={(e) => e.preventDefault()} />
      </span>
    </label>
  );
}

export function BrandEditor() {
  const { clientId } = useClient();
  const { activeBrand, availableBrands, setActiveBrand, setAvailableBrands } = useBrandStore();
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [draftProduct, setDraftProduct] = useState<BrandProduct & { priceText?: string } | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const productImgRef = useRef<HTMLInputElement>(null);

  const brandId = activeBrand?.id;
  const load = useCallback(() => {
    if (!brandId) return Promise.resolve();
    return loadBrandDna(brandId).then((r) => {
      if ("error" in r) { toast.error(r.error); return; }
      const f = toForm(r.brand);
      setForm(f); setSaved(JSON.stringify(f));
      setProducts(r.products as BrandProduct[]);
    });
  }, [brandId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (form?.primary_font) injectGoogleFont(form.primary_font); if (form?.secondary_font) injectGoogleFont(form.secondary_font); }, [form?.primary_font, form?.secondary_font]);

  const dirty = !!form && JSON.stringify(form) !== saved;
  const strength = useMemo(() => form ? brandStrength({ ...form, additional_colors: [form.neutral], dos: form.dos.join("\n"), donts: form.donts.join("\n") }, form.dna, products) : { score: 0, missing: [] }, [form, products]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setDna = <K extends keyof BrandDna>(k: K, v: BrandDna[K]) => setForm((f) => (f ? { ...f, dna: { ...f.dna, [k]: v } } : f));

  const save = useCallback(async () => {
    if (!form || !brandId) return;
    setSaving(true);
    const r = await saveBrandDna(brandId, { ...form, additional_colors: [form.neutral] });
    setSaving(false);
    if (r.error) { toast.error(r.error); return; }
    setSaved(JSON.stringify(form));
    const updated = { id: brandId, brand_name: form.brand_name, logo_url: form.logo_url };
    setActiveBrand(updated);
    setAvailableBrands(availableBrands.map((b) => (b.id === brandId ? updated : b)));
    toast.success("Saved. Everything you make now uses this.");
  }, [form, brandId, availableBrands, setActiveBrand, setAvailableBrands]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) void save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  async function upload(file: File, prefix: string) {
    if (!clientId) throw new Error("Not signed in");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    const path = `images/${clientId}/${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type || "image/png" });
    if (error) throw new Error("Couldn't upload that file.");
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }
  async function onLogo(file?: File) {
    if (!file) return;
    setBusy("logo");
    try { set("logo_url", await upload(file, "logo")); } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); }
  }
  async function coloursFromLogo() {
    if (!form?.logo_url) return;
    try {
      const pal = paletteOf(await loadImage(canvasSafe(form.logo_url)), 6).filter((c) => !/^#(F{6}|FEFEFE|000000)$/i.test(c));
      if (!pal.length) { toast.info("Couldn't read colours from that logo."); return; }
      setForm((f) => f ? { ...f, primary_color: pal[0] ?? f.primary_color, secondary_color: pal[1] ?? f.secondary_color, accent_color: pal[2] ?? f.accent_color } : f);
      toast.success("Colours taken from your logo. Change any you like.");
    } catch { toast.error("Couldn't read the logo."); }
  }
  async function onPhotos(files: FileList | null) {
    if (!files?.length || !form) return;
    setBusy("photos");
    try {
      const urls = await Promise.all([...files].slice(0, 8).map((f) => upload(f, "brand_ref")));
      set("uploaded_assets", [...form.uploaded_assets, ...urls].slice(0, 24));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); }
  }
  /**
   * Auto-fill (2026-10-11): read the website ("site") or suggest from what is already here
   * ("gaps"). Only EMPTY fields are filled, never the owner's own answers, and nothing is saved
   * until they press Save. Replaces the n8n extractor, which overwrote fields in the background.
   */
  async function autofill(mode: "site" | "gaps") {
    if (!form || !brandId) return;
    if (mode === "site" && !form.website_url.trim()) { toast.info("Add your website first."); return; }
    if (mode === "site") setExtracting(true); else setBusy("gaps");
    try {
      const res = await fetch("/api/brand/fill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "site" ? { mode, website: form.website_url, name: form.brand_name } : { mode, brandId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.fields) throw new Error(data.error || "Couldn't fill it in.");
      const f = data.fields as Record<string, unknown>;
      if (!Object.keys(f).length) { toast.info(data.note || "Nothing new to add."); return; }
      const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
      const list = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : undefined);
      const emptyS = (v: string | undefined | null) => !v || !v.trim();
      const emptyA = (v: string[] | undefined) => !v || v.length === 0;
      let n = 0;
      const s1 = (cur: string | undefined, next: string | undefined) => (next !== undefined && emptyS(cur) ? (n++, next) : cur);
      const a1 = (cur: string[] | undefined, next: string[] | undefined) => (next !== undefined && emptyA(cur) ? (n++, next) : cur);
      const d = form.dna;
      const nextForm: Form = {
        ...form,
        description: s1(form.description, str("description")) ?? "",
        industry: s1(form.industry, str("industry")) ?? "",
        logo_url: form.logo_url || (str("logoUrl") ? (n++, str("logoUrl")!) : null),
        social_urls: s1(form.social_urls, list("socials")?.join("\n")) ?? "",
        tone_keywords: a1(form.tone_keywords, list("tone")) ?? [],
        dna: {
          ...d,
          tagline: s1(d.tagline, str("tagline")), audience: s1(d.audience, str("audience")), location: s1(d.location, str("location")),
          usps: a1(d.usps, list("usps")), offer: s1(d.offer, str("offer")), languages: a1(d.languages, list("languages")),
          photoVibes: a1(d.photoVibes, list("photoVibes")), cta: s1(d.cta, str("cta")),
          whatsapp: s1(d.whatsapp, str("whatsapp")), phone: s1(d.phone, str("phone")), email: s1(d.email, str("email")),
        },
      };
      setForm(nextForm);
      // Products found on the site are added only when the brand has none yet.
      if (mode === "site" && products.length === 0 && Array.isArray(f.products)) {
        for (const p of f.products as Array<{ name: string; description?: string; price?: number | null; currency?: string }>) {
          const r = await saveProduct(brandId, { name: p.name, description: p.description, price: p.price ?? null, currency: p.currency });
          if (r.product) { n++; setProducts((prev) => [...prev, r.product as unknown as BrandProduct]); }
        }
      }
      toast.success(n ? `Filled ${n} empty field${n === 1 ? "" : "s"}. Check them, then Save.` : "Your answers were already filled in; nothing changed.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't fill it in."); }
    finally { setExtracting(false); setBusy(null); }
  }
  async function commitProduct() {
    if (!draftProduct || !brandId) return;
    setBusy("product");
    const price = draftProduct.priceText ? Number(draftProduct.priceText.replace(/[^\d.]/g, "")) : null;
    const r = await saveProduct(brandId, { id: draftProduct.id, name: draftProduct.name, description: draftProduct.description ?? "", price: Number.isFinite(price as number) ? price : null, currency: draftProduct.currency || "KES", image_url: draftProduct.image_url ?? null });
    setBusy(null);
    if (r.error || !r.product) { toast.error(r.error || "Couldn't save."); return; }
    const p = r.product as unknown as BrandProduct;
    setProducts((prev) => (draftProduct.id ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));
    setDraftProduct(null);
  }

  if (!activeBrand) {
    return (
      <div className="s-card p-10 text-center max-w-[560px] mx-auto mt-10">
        <b className="text-[16px]">No brand open</b>
        <p className="text-[13px] mt-1 mb-5" style={{ color: "var(--s-soft)" }}>Pick one from the brand menu at the top, or start a new one.</p>
        <Link href="/studio/brand-builder" className="s-btn primary"><Sparkles className="h-4 w-4" /> Build a brand</Link>
      </div>
    );
  }
  if (!form) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;

  const fonts = GOOGLE_FONTS_REGISTRY.map((f) => f.family);
  const formality = form.dna.formality ?? 40;
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] pb-28">
      {/* Side: strength + sections */}
      <aside className="lg:sticky lg:top-20 self-start grid gap-4">
        <div className="s-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="s-label !mb-0">Brand strength</span>
            <b className="text-[18px]" style={{ color: strength.score >= 80 ? "var(--s-ok)" : strength.score >= 50 ? "var(--s-accent)" : "var(--s-warn)" }}>{strength.score}%</b>
          </div>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: "var(--s-line)" }}><div className="h-full rounded-full transition-all" style={{ width: `${strength.score}%`, background: strength.score >= 80 ? "var(--s-ok)" : "var(--s-accent)" }} /></div>
          {strength.missing.length > 0 && (
            <ul className="mt-3 grid gap-1">
              {strength.missing.slice(0, 4).map((m) => (
                <li key={m}><a href={`#${MISSING_TO_SECTION[m] ?? "basics"}`} className="text-[12px] flex items-center gap-1.5 hover:underline" style={{ color: "var(--s-soft)" }}><Plus className="h-3 w-3 shrink-0" style={{ color: "var(--s-accent)" }} />{m}</a></li>
              ))}
            </ul>
          )}
          {strength.missing.length > 0 && (
            <button className="s-btn ai sm w-full justify-center mt-3" onClick={() => autofill("gaps")} disabled={busy === "gaps"}>
              {busy === "gaps" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Fill the gaps with AI
            </button>
          )}
          <p className="text-[11px] mt-3 leading-snug" style={{ color: "var(--s-mute)" }}>The more BlinkSpot knows, the less you rewrite. Every image, video, caption and page uses this.</p>
        </div>
        <nav className="hidden lg:grid gap-0.5" aria-label="Brand sections">
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="px-3 py-1.5 rounded-lg text-[13px] hover:bg-[var(--s-hover)]" style={{ color: "var(--s-soft)" }}>{s.label}</a>)}
        </nav>
      </aside>

      <div className="grid gap-5 min-w-0">
        {/* Auto-fill */}
        <div className="s-card p-4 md:p-5 flex flex-wrap items-center gap-3" style={{ background: "radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--s-ai) 16%, transparent), transparent 55%), var(--s-panel)" }}>
          <Wand2 className="h-5 w-5" style={{ color: "var(--s-ai)" }} />
          <div className="flex-1 min-w-[220px]">
            <b className="text-[14px]">Fill this in from your website</b>
            <p className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>We read your site and fill in the empty fields only. Your own answers stay. Check, then save.</p>
          </div>
          <input className="s-input" style={{ maxWidth: 280 }} value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="yourbrand.com" aria-label="Website" />
          <button className="s-btn ai" onClick={() => autofill("site")} disabled={extracting}>{extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Read my site</button>
        </div>

        <Section id="basics" title="Basics" hint="Who you are, in your words.">
          <div className="grid gap-5 md:grid-cols-[150px_minmax(0,1fr)]">
            <Field label="Logo">
              <button type="button" className="relative w-[150px] h-[150px] rounded-2xl grid place-items-center overflow-hidden border-2 border-dashed" style={{ borderColor: "var(--s-line-2)", background: form.logo_url ? "#fff" : "var(--s-bg)" }} onClick={() => logoRef.current?.click()} aria-label={form.logo_url ? "Change logo" : "Upload logo"}>
                {busy === "logo" ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--s-mute)" }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : form.logo_url ? <img src={form.logo_url} alt="Logo" className="max-w-[80%] max-h-[80%] object-contain" />
                  : <span className="grid place-items-center gap-1 text-[12px]" style={{ color: "var(--s-mute)" }}><Upload className="h-5 w-5" />Upload</span>}
              </button>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="flex gap-2 mt-2 text-[11.5px]">
                {form.logo_url && <button type="button" className="underline" style={{ color: "var(--s-mute)" }} onClick={() => set("logo_url", null)}>Remove</button>}
                {!form.logo_url && <Link href="/studio/brand-builder" className="underline" style={{ color: "var(--s-mute)" }}>Make one</Link>}
              </div>
            </Field>
            <div className="grid gap-5 min-w-0">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Brand name"><input className="s-input" value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} aria-label="Brand name" /></Field>
                <Field label="Tagline" hint="Optional. Under 8 words."><input className="s-input" value={form.dna.tagline ?? ""} onChange={(e) => setDna("tagline", e.target.value)} placeholder="e.g. Pressed this morning" aria-label="Tagline" /></Field>
              </div>
              <Field label="What you do" hint="One or two sentences, like you'd say it to a customer.">
                <textarea className="s-input" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. We cook East African home food and deliver it to offices in Westlands every weekday." aria-label="What you do" />
              </Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Industry">
                  <select className="s-input" value={INDUSTRIES.includes(form.industry) ? form.industry : form.industry ? "__other" : ""} onChange={(e) => set("industry", e.target.value === "__other" ? form.industry || " " : e.target.value)} aria-label="Industry">
                    <option value="">Pick one</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                    <option value="__other">Something else…</option>
                  </select>
                  {!!form.industry && !INDUSTRIES.includes(form.industry) && <input className="s-input mt-1.5" value={form.industry.trim()} onChange={(e) => set("industry", e.target.value)} placeholder="Your industry" aria-label="Your industry" />}
                </Field>
                <Field label="Where you're based" hint="City, and where you deliver or serve."><input className="s-input" value={form.dna.location ?? ""} onChange={(e) => setDna("location", e.target.value)} placeholder="e.g. Nairobi, delivers across Nairobi" aria-label="Where you're based" /></Field>
              </div>
            </div>
          </div>
        </Section>

        <Section id="customers" title="Customers & offer" hint="Who buys, and why they pick you over the next shop.">
          <Field label="Who it's for" hint="Be specific: who they are, what they care about.">
            <textarea className="s-input" rows={2} value={form.dna.audience ?? ""} onChange={(e) => setDna("audience", e.target.value)} placeholder="e.g. Busy office workers, 25 to 40, who want a real lunch, not fast food." aria-label="Who it's for" />
          </Field>
          <Field label="Why people choose you" hint="Up to three. These become headlines.">
            <ListInput value={form.dna.usps ?? []} onChange={(v) => setDna("usps", v)} placeholder="e.g. Cooked fresh every morning" max={3} label="Reason" />
          </Field>
          <Field label="What's on offer right now" hint="Optional. A promo, a launch, a season. Leave empty when there's none.">
            <input className="s-input" value={form.dna.offer ?? ""} onChange={(e) => setDna("offer", e.target.value)} placeholder="e.g. 20% off family platters this weekend" aria-label="Current offer" />
          </Field>
        </Section>

        <section id="products" className="s-card p-5 md:p-6 scroll-mt-24">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold">Products & services</h3>
              <p className="text-[12.5px] mt-0.5" style={{ color: "var(--s-mute)" }}>What you sell, with real names and prices, so the AI never invents them. Saved as you go.</p>
            </div>
            <button className="s-btn sm" onClick={() => setDraftProduct({ name: "", currency: "KES" })}><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
          <div className="grid gap-3 mt-5 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl overflow-hidden border flex" style={{ borderColor: "var(--s-line)", background: "var(--s-bg)" }}>
                <div className="w-20 shrink-0 grid place-items-center" style={{ background: "var(--s-raised)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image_url ? <img src={thumbUrl(p.image_url, 200)} alt="" className="w-full h-full object-cover" /> : <Package className="h-5 w-5" style={{ color: "var(--s-mute)" }} />}
                </div>
                <div className="p-3 min-w-0 flex-1">
                  <b className="text-[13px] block truncate">{p.name}</b>
                  {p.price ? <span className="text-[12px]" style={{ color: "var(--s-accent)" }}>{p.currency || "KES"} {Number(p.price).toLocaleString()}</span> : null}
                  {p.description && <p className="text-[11.5px] line-clamp-2 mt-0.5" style={{ color: "var(--s-mute)" }}>{p.description}</p>}
                  <div className="flex gap-2 mt-1.5 text-[11.5px]">
                    <button className="underline" style={{ color: "var(--s-soft)" }} onClick={() => setDraftProduct({ ...p, priceText: p.price ? String(p.price) : "" })}>Edit</button>
                    <button className="underline" style={{ color: "var(--s-danger)" }} onClick={async () => { if (!brandId || !p.id) return; const r = await deleteProduct(brandId, p.id); if (r.error) toast.error(r.error); else setProducts((prev) => prev.filter((x) => x.id !== p.id)); }}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
            {products.length === 0 && !draftProduct && (
              <button className="rounded-xl border-2 border-dashed p-5 text-left text-[12.5px] sm:col-span-2 xl:col-span-3" style={{ borderColor: "var(--s-line-2)", color: "var(--s-mute)" }} onClick={() => setDraftProduct({ name: "", currency: "KES" })}>
                <b style={{ color: "var(--s-text)" }}>Add your first product or service.</b> A name, a price and a photo are enough.
              </button>
            )}
          </div>
          {draftProduct && (
            <div className="mt-4 rounded-xl p-4 grid gap-3 md:grid-cols-[90px_minmax(0,1fr)]" style={{ border: "1px solid var(--s-line-2)", background: "var(--s-bg)" }}>
              <button type="button" className="h-[90px] w-[90px] rounded-lg grid place-items-center overflow-hidden border border-dashed" style={{ borderColor: "var(--s-line-2)" }} onClick={() => productImgRef.current?.click()} aria-label="Product photo">
                {busy === "productImg" ? <Loader2 className="h-4 w-4 animate-spin" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : draftProduct.image_url ? <img src={draftProduct.image_url} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="h-5 w-5" style={{ color: "var(--s-mute)" }} />}
              </button>
              <input ref={productImgRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy("productImg"); try { const url = await upload(f, "product"); setDraftProduct((d) => (d ? { ...d, image_url: url } : d)); } catch { toast.error("Upload failed"); } finally { setBusy(null); } }} />
              <div className="grid gap-2 min-w-0">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_90px_130px]">
                  <input className="s-input" autoFocus value={draftProduct.name} onChange={(e) => setDraftProduct({ ...draftProduct, name: e.target.value })} placeholder="Name, e.g. Family platter" aria-label="Product name" />
                  <select className="s-input" value={draftProduct.currency || "KES"} onChange={(e) => setDraftProduct({ ...draftProduct, currency: e.target.value })} aria-label="Currency">
                    {["KES", "UGX", "TZS", "RWF", "NGN", "GHS", "ZAR", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input className="s-input" inputMode="decimal" value={draftProduct.priceText ?? ""} onChange={(e) => setDraftProduct({ ...draftProduct, priceText: e.target.value })} placeholder="Price (optional)" aria-label="Price" />
                </div>
                <input className="s-input" value={draftProduct.description ?? ""} onChange={(e) => setDraftProduct({ ...draftProduct, description: e.target.value })} placeholder="One line about it (optional)" aria-label="Product description" />
                <div className="flex gap-2 justify-end">
                  <button className="s-btn ghost sm" onClick={() => setDraftProduct(null)}>Cancel</button>
                  <button className="s-btn primary sm" disabled={!draftProduct.name.trim() || busy === "product"} onClick={commitProduct}>{busy === "product" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save product</button>
                </div>
              </div>
            </div>
          )}
        </section>

        <Section id="look" title="Look" hint="Colours, fonts and the kind of photos that feel like you.">
          <Field label="Colours" hint={form.logo_url ? undefined : "Add your logo above to take colours from it."}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ColorField label="Main" value={form.primary_color} onChange={(v) => set("primary_color", v)} />
              <ColorField label="Second" value={form.secondary_color} onChange={(v) => set("secondary_color", v)} />
              <ColorField label="Accent" value={form.accent_color} onChange={(v) => set("accent_color", v)} />
              <ColorField label="Background" value={form.neutral} onChange={(v) => set("neutral", v)} />
            </div>
            {form.logo_url && <button type="button" className="s-btn ghost sm mt-2" onClick={coloursFromLogo}><Sparkles className="h-3.5 w-3.5" /> Take colours from my logo</button>}
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Heading font">
              <select className="s-input" value={form.primary_font} onChange={(e) => set("primary_font", e.target.value)} aria-label="Heading font"><option value="">Let BlinkSpot choose</option>{fonts.map((f) => <option key={f}>{f}</option>)}</select>
            </Field>
            <Field label="Body font">
              <select className="s-input" value={form.secondary_font} onChange={(e) => set("secondary_font", e.target.value)} aria-label="Body font"><option value="">Let BlinkSpot choose</option>{fonts.map((f) => <option key={f}>{f}</option>)}</select>
            </Field>
          </div>
          <div className="rounded-xl p-5 md:p-6" style={{ background: form.neutral, color: readable(form.primary_color, form.neutral) }} aria-label="Preview">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {form.logo_url && <img src={form.logo_url} alt="" className="h-10 w-10 object-contain" />}
              <div className="text-[28px] font-bold leading-none" style={{ fontFamily: form.primary_font ? `"${form.primary_font}"` : undefined }}>{form.brand_name || "Your brand"}</div>
            </div>
            <p className="mt-2 text-[14px] max-w-[520px]" style={{ fontFamily: form.secondary_font ? `"${form.secondary_font}"` : undefined, opacity: 0.85 }}>{form.dna.tagline || form.description || "Your tagline goes here."}</p>
            <div className="flex gap-2 mt-4">
              <span className="px-4 py-2 rounded-full text-[13px] font-semibold" style={{ background: form.accent_color, color: readable(form.neutral, form.accent_color) }}>{form.dna.cta || "Order now"}</span>
              <span className="px-4 py-2 rounded-full text-[13px] font-semibold" style={{ background: form.secondary_color, color: readable(form.primary_color, form.secondary_color) }}>Learn more</span>
            </div>
          </div>
          <Field label="Photo style">
            <Chips options={PHOTO_VIBES} value={form.dna.photoVibes ?? []} onChange={(v) => setDna("photoVibes", v)} max={3} label="Photo style" />
            <textarea className="s-input mt-2" rows={2} value={form.visual_style_guide} onChange={(e) => set("visual_style_guide", e.target.value)} placeholder="Anything else, e.g. warm natural light, real customers, food shot from above" aria-label="Photo style notes" />
          </Field>
          <Field label="Photos that feel like you" hint="Your shop, your products, past posts you love. The AI copies the feel, never the photo.">
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {form.uploaded_assets.map((u) => (
                <div key={u} className="relative aspect-square rounded-lg overflow-hidden group" style={{ background: "var(--s-raised)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(u, 300)} alt="" className="w-full h-full object-cover" />
                  <button type="button" className="absolute right-1 top-1 h-6 w-6 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => set("uploaded_assets", form.uploaded_assets.filter((x) => x !== u))} aria-label="Remove photo"><X className="h-3.5 w-3.5 text-white" /></button>
                </div>
              ))}
              <button type="button" className="aspect-square rounded-lg border-2 border-dashed grid place-items-center text-[11px]" style={{ borderColor: "var(--s-line-2)", color: "var(--s-mute)" }} onClick={() => photoRef.current?.click()}>
                {busy === "photos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="grid place-items-center gap-1"><ImagePlus className="h-4 w-4" />Add</span>}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void onPhotos(e.target.files); e.target.value = ""; }} />
          </Field>
          <Field label="Never show" hint="Optional. Things the AI must keep out of your visuals.">
            <input className="s-input" value={form.dna.avoidVisual ?? ""} onChange={(e) => setDna("avoidVisual", e.target.value)} placeholder="e.g. alcohol, plastic packaging, competitors' colours" aria-label="Never show" />
          </Field>
        </Section>

        <Section id="voice" title="Voice" hint="How you sound in captions, scripts and on your page.">
          <Field label="Personality" hint="Pick up to four.">
            <Chips options={PERSONALITY} value={form.tone_keywords} onChange={(v) => set("tone_keywords", v)} max={4} custom label="Personality" />
          </Field>
          <Field label="How you talk">
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Casual</span>
              <input type="range" min={0} max={100} step={5} value={formality} onChange={(e) => setDna("formality", Number(e.target.value))} className="flex-1 accent-[var(--s-accent)]" aria-label="Casual to formal" />
              <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>Formal</span>
            </div>
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Languages" hint="We write in these, mixed the way you pick.">
              <Chips options={LANGUAGES} value={form.dna.languages ?? []} onChange={(v) => setDna("languages", v)} max={3} label="Languages" />
            </Field>
            <Field label="Emoji">
              <div className="flex gap-1.5" role="group" aria-label="Emoji">
                {(["none", "some", "lots"] as const).map((e) => <button key={e} type="button" className="s-chip" aria-pressed={(form.dna.emoji ?? "some") === e} onClick={() => setDna("emoji", e)}>{e === "none" ? "None" : e === "some" ? "A few 🙂" : "Lots 🔥🎉"}</button>)}
              </div>
            </Field>
          </div>
          <Field label="In your own words" hint="Optional. How would a customer describe the way you talk?">
            <textarea className="s-input" rows={2} value={form.brand_voice} onChange={(e) => set("brand_voice", e.target.value)} placeholder="e.g. Like a friend who knows food. Short sentences, a little Sheng, never pushy." aria-label="Voice in your own words" />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Always"><ListInput value={form.dos} onChange={(v) => set("dos", v)} placeholder="e.g. Mention free delivery" label="Always" /></Field>
            <Field label="Never"><ListInput value={form.donts} onChange={(v) => set("donts", v)} placeholder="e.g. Make health claims" label="Never" /></Field>
          </div>
          <Field label="Words to use or avoid" hint="Optional.">
            <input className="s-input" value={form.vocabulary_notes} onChange={(e) => set("vocabulary_notes", e.target.value)} placeholder='e.g. say "home food", never "cheap"' aria-label="Words to use or avoid" />
          </Field>
        </Section>

        <Section id="contact" title="Contact & call to action" hint="The only contact details BlinkSpot will ever put on your content. Nothing here is made up.">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="WhatsApp"><input className="s-input" inputMode="tel" value={form.dna.whatsapp ?? ""} onChange={(e) => setDna("whatsapp", e.target.value)} placeholder="+254 7…" aria-label="WhatsApp" /></Field>
            <Field label="Phone"><input className="s-input" inputMode="tel" value={form.dna.phone ?? ""} onChange={(e) => setDna("phone", e.target.value)} placeholder="Optional" aria-label="Phone" /></Field>
            <Field label="Email"><input className="s-input" inputMode="email" value={form.dna.email ?? ""} onChange={(e) => setDna("email", e.target.value)} placeholder="Optional" aria-label="Email" /></Field>
          </div>
          <Field label="Social links" hint="One per line.">
            <textarea className="s-input" rows={2} value={form.social_urls} onChange={(e) => set("social_urls", e.target.value)} placeholder={"instagram.com/yourbrand\ntiktok.com/@yourbrand"} aria-label="Social links" />
          </Field>
          <Field label="What should people do next?">
            <Chips options={CTAS} value={form.dna.cta ? [form.dna.cta] : []} onChange={(v) => setDna("cta", v[v.length - 1])} max={1} custom label="Call to action" />
          </Field>
        </Section>
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 s-card px-4 py-2.5 flex items-center gap-3 shadow-2xl" style={{ borderColor: "var(--s-line-2)" }} role="status">
          <span className="text-[13px]" style={{ color: "var(--s-soft)" }}>Unsaved changes</span>
          <button className="s-btn ghost sm" onClick={() => { setForm(JSON.parse(saved)); }}>Discard</button>
          <button className="s-btn primary sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save <span className="opacity-60 hidden sm:inline">⌘S</span></button>
        </div>
      )}
    </div>
  );
}
