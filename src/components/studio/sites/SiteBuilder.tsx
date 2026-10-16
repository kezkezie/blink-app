"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Eye, EyeOff, Globe, Laptop, Loader2, Plus, RefreshCw, Smartphone, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore } from "@/app/store/useBrandStore";
import { getSite, publishSite, refreshSiteData, saveSite, unpublishSite } from "@/app/actions/sites";
import { SiteRenderer } from "@/components/sites/SiteRenderer";
import { SECTION_LABEL, type SiteSection, type SiteSpec, type SiteStyle } from "@/lib/sites/spec";
import { GOOGLE_FONTS_REGISTRY } from "@/lib/fonts";
import { Modal } from "../Modal";
import { PageSkeleton } from "@/components/studio/Skeletons";

/**
 * Website: a landing page built from the brand (Brand Brain), edited section by section, published
 * at blinkspot.io/s/<slug>. The AI writes the plan; the templates make it look finished.
 */

const STYLES: Array<{ id: SiteStyle; label: string; line: string }> = [
  { id: "editorial", label: "Editorial", line: "Calm, premium, magazine-like" },
  { id: "bold", label: "Bold", line: "Big type, strong colour" },
  { id: "soft", label: "Soft", line: "Rounded, warm, friendly" },
  { id: "minimal", label: "Minimal", line: "Clean and simple" },
];

/** Renders children into an iframe so the phone preview uses real phone breakpoints. */
function PreviewFrame({ width, children }: { width: number | "100%"; children: React.ReactNode }) {
  const [body, setBody] = useState<HTMLElement | null>(null);
  return (
    <>
      <iframe
        title="Preview" srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body style='margin:0'></body></html>"
        className="block mx-auto bg-white transition-[width] duration-500" style={{ width, height: "100%", border: 0, borderRadius: width === "100%" ? 12 : 28 }}
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (!doc) return;
          document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => doc.head.appendChild(n.cloneNode(true)));
          setBody(doc.body);
        }}
      />
      {body && createPortal(children, body)}
    </>
  );
}

function ImagePick({ spec, value, onChange, label }: { spec: SiteSpec; value?: string; onChange: (id?: string) => void; label: string }) {
  if (!spec.images.length) return <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>No images yet. Make some in Image Studio, then press Refresh brand info.</p>;
  return (
    <div>
      <span className="s-label">{label}</span>
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" className="aspect-square rounded-md grid place-items-center text-[10px]" style={{ background: "var(--s-bg)", border: `2px solid ${!value ? "var(--s-accent)" : "var(--s-line)"}`, color: "var(--s-mute)" }} onClick={() => onChange(undefined)}>None</button>
        {spec.images.slice(0, 19).map((im) => (
          <button key={im.id} type="button" className="aspect-square rounded-md overflow-hidden" style={{ border: `2px solid ${value === im.id ? "var(--s-accent)" : "transparent"}` }} onClick={() => onChange(im.id)} title={im.caption} aria-label={im.caption || "Image"} aria-pressed={value === im.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url.includes("cloudinary") ? im.url.replace("/upload/", "/upload/w_200,f_auto,q_auto/") : im.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

const In = ({ label, value, onChange, area = false, rows = 3 }: { label: string; value?: string; onChange: (v: string) => void; area?: boolean; rows?: number }) => (
  <label className="block">
    <span className="s-label">{label}</span>
    {area ? <textarea className="s-input" rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label} /> : <input className="s-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label} />}
  </label>
);

function SectionFields({ s, spec, set }: { s: SiteSection; spec: SiteSpec; set: (next: SiteSection) => void }) {
  switch (s.type) {
    case "hero":
      return (
        <div className="grid gap-3">
          <div className="flex gap-1.5" role="group" aria-label="Hero layout">
            {(["split", "full", "type"] as const).map((v) => <button key={v} type="button" className="s-chip" aria-pressed={s.variant === v} onClick={() => set({ ...s, variant: v })}>{v === "split" ? "Text + photo" : v === "full" ? "Full photo" : "Big type"}</button>)}
          </div>
          <In label="Small line above" value={s.eyebrow} onChange={(v) => set({ ...s, eyebrow: v })} />
          <In label="Headline" value={s.headline} onChange={(v) => set({ ...s, headline: v })} />
          <In label="Under the headline" value={s.sub} onChange={(v) => set({ ...s, sub: v })} area rows={2} />
          <div className="grid grid-cols-2 gap-2"><In label="Button" value={s.cta} onChange={(v) => set({ ...s, cta: v })} /><In label="Second button" value={s.secondaryCta} onChange={(v) => set({ ...s, secondaryCta: v })} /></div>
          {s.variant !== "type" && <ImagePick spec={spec} value={s.imageId} onChange={(id) => set({ ...s, imageId: id })} label="Photo" />}
        </div>
      );
    case "highlights":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          {s.items.map((it, i) => (
            <div key={i} className="grid gap-1.5 rounded-lg p-2" style={{ background: "var(--s-bg)" }}>
              <div className="flex gap-1.5"><input className="s-input" value={it.title} aria-label={`Point ${i + 1}`} onChange={(e) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <button type="button" className="s-btn ghost sm" aria-label="Remove point" onClick={() => set({ ...s, items: s.items.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></button></div>
              <input className="s-input" value={it.body ?? ""} placeholder="One sentence" aria-label={`Point ${i + 1} detail`} onChange={(e) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
            </div>
          ))}
          {s.items.length < 4 && <button type="button" className="s-btn ghost sm w-fit" onClick={() => set({ ...s, items: [...s.items, { title: "Another reason" }] })}><Plus className="h-3.5 w-3.5" /> Add a point</button>}
        </div>
      );
    case "products":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          <In label="Under the title" value={s.sub} onChange={(v) => set({ ...s, sub: v })} />
          <div>
            <span className="s-label">Show</span>
            <div className="grid gap-1">
              {spec.products.map((p) => {
                const on = !s.productIds || s.productIds.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => { const all = spec.products.map((x) => x.id); const cur = s.productIds ?? all; const next = on ? cur.filter((x) => x !== p.id) : [...cur, p.id]; set({ ...s, productIds: next.length === all.length ? undefined : next }); }} />
                    {p.name}{p.price ? <span style={{ color: "var(--s-mute)" }}>· {p.currency || "KES"} {p.price}</span> : null}
                  </label>
                );
              })}
            </div>
            <Link href="/studio/brand#products" className="text-[12px] underline" style={{ color: "var(--s-mute)" }}>Add or change products on the Brand page</Link>
          </div>
        </div>
      );
    case "gallery":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          <span className="s-label !mb-0">Photos ({s.imageIds.length})</span>
          <div className="grid grid-cols-5 gap-1.5">
            {spec.images.slice(0, 20).map((im) => {
              const on = s.imageIds.includes(im.id);
              return (
                <button key={im.id} type="button" className="aspect-square rounded-md overflow-hidden relative" style={{ border: `2px solid ${on ? "var(--s-accent)" : "transparent"}`, opacity: on ? 1 : 0.55 }} aria-pressed={on} aria-label={im.caption || "Image"}
                  onClick={() => set({ ...s, imageIds: on ? s.imageIds.filter((x) => x !== im.id) : [...s.imageIds, im.id].slice(0, 9) })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url.includes("cloudinary") ? im.url.replace("/upload/", "/upload/w_200,f_auto,q_auto/") : im.url} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        </div>
      );
    case "about":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          <In label="Your story" value={s.body} onChange={(v) => set({ ...s, body: v })} area rows={5} />
          <ImagePick spec={spec} value={s.imageId} onChange={(id) => set({ ...s, imageId: id })} label="Photo" />
        </div>
      );
    case "faq":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          {s.items.map((f, i) => (
            <div key={i} className="grid gap-1.5 rounded-lg p-2" style={{ background: "var(--s-bg)" }}>
              <div className="flex gap-1.5"><input className="s-input" value={f.q} aria-label={`Question ${i + 1}`} onChange={(e) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                <button type="button" className="s-btn ghost sm" aria-label="Remove question" onClick={() => set({ ...s, items: s.items.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></button></div>
              <textarea className="s-input" rows={2} value={f.a} aria-label={`Answer ${i + 1}`} onChange={(e) => set({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            </div>
          ))}
          {s.items.length < 6 && <button type="button" className="s-btn ghost sm w-fit" onClick={() => set({ ...s, items: [...s.items, { q: "A question customers ask", a: "The answer." }] })}><Plus className="h-3.5 w-3.5" /> Add a question</button>}
        </div>
      );
    case "contact":
      return (
        <div className="grid gap-3">
          <In label="Title" value={s.title} onChange={(v) => set({ ...s, title: v })} />
          <In label="Under the title" value={s.sub} onChange={(v) => set({ ...s, sub: v })} />
          <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>WhatsApp, phone, email and links come from the <Link href="/studio/brand#contact" className="underline">Brand page</Link>. Nothing is made up.</p>
        </div>
      );
  }
}

const NEW_SECTION: Record<SiteSection["type"], (spec: SiteSpec) => SiteSection | null> = {
  hero: () => null,
  highlights: () => ({ type: "highlights", title: "Why people choose us", items: [{ title: "Your first reason" }, { title: "Your second reason" }] }),
  products: (spec) => (spec.products.length ? { type: "products", title: "What we make" } : null),
  gallery: (spec) => (spec.images.length >= 2 ? { type: "gallery", title: "A look inside", imageIds: spec.images.slice(0, 6).map((i) => i.id) } : null),
  about: () => ({ type: "about", title: "Our story", body: "Tell people how you started and what you care about." }),
  faq: () => ({ type: "faq", title: "Questions", items: [{ q: "A question customers ask", a: "The answer." }] }),
  contact: () => ({ type: "contact", title: "Get in touch" }),
};

export function SiteBuilder() {
  const { activeBrand } = useBrandStore();
  const brandId = activeBrand?.id;
  const [spec, setSpec] = useState<SiteSpec | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<{ slug: string | null; published: boolean; suggestedSlug: string; changes?: boolean }>({ slug: null, published: false, suggestedSlug: "" });
  // Where the design starts: what works for this kind of business, or a site the owner likes.
  const [playbook, setPlaybook] = useState<{ label: string; line: string } | null>(null);
  const [start, setStart] = useState<"playbook" | "inspo">("playbook");
  const [inspoUrl, setInspoUrl] = useState("");
  const [building, setBuilding] = useState<null | "full" | number>(null);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number>(0);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [publishing, setPublishing] = useState(false);
  const [slug, setSlug] = useState("");
  const dirty = useRef(false);

  const load = useCallback(() => {
    if (!brandId) return Promise.resolve();
    return getSite(brandId).then((r) => {
      if ("error" in r) { toast.error(r.error); return; }
      setSpec(r.spec); setMeta({ slug: r.slug, published: r.published, suggestedSlug: r.suggestedSlug, changes: r.unpublishedChanges }); setSlug(r.slug ?? r.suggestedSlug); setPlaybook(r.playbook); setLoaded(true);
    });
  }, [brandId]);
  useEffect(() => { void load(); }, [load]);

  // Autosave edits a moment after the last change.
  useEffect(() => {
    if (!spec || !brandId || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      setSaving("saving");
      void saveSite(brandId, spec).then((r) => { if (r.error) { toast.error(r.error); setSaving("idle"); } else setSaving("saved"); });
    }, 1200);
    return () => clearTimeout(t);
  }, [spec, brandId]);
  const edit = (next: SiteSpec) => { dirty.current = true; setSaving("idle"); setSpec(next); setMeta((m) => (m.published ? { ...m, changes: true } : m)); };
  const setSection = (i: number, s: SiteSection) => spec && edit({ ...spec, sections: spec.sections.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    if (!spec) return;
    const j = i + d;
    if (j < 1 || j >= spec.sections.length || i === 0) return; // the hero stays first
    const next = [...spec.sections]; [next[i], next[j]] = [next[j], next[i]];
    edit({ ...spec, sections: next }); setOpen(j);
  };

  async function build(mode: "full" | "section", sectionIndex?: number) {
    if (!brandId) return;
    setBuilding(mode === "full" ? "full" : sectionIndex!);
    try {
      const res = await fetch("/api/sites/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, mode, sectionIndex, instruction: mode === "full" ? note : notes[sectionIndex!] ?? "", ...(mode === "full" && start === "inspo" && inspoUrl.trim() ? { inspirationUrl: inspoUrl.trim() } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.spec) throw new Error(data.error || "Couldn't build the page.");
      dirty.current = false;
      setSpec(data.spec); setMeta((m) => ({ ...m, suggestedSlug: data.suggestedSlug || m.suggestedSlug, changes: m.published ? true : m.changes })); if (!meta.slug) setSlug(data.suggestedSlug || slug);
      if (mode === "section") setNotes((n) => ({ ...n, [sectionIndex!]: "" }));
      toast.success(mode === "full" ? "Your page is ready. Change anything on the left." : "Section rewritten.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't build the page."); }
    finally { setBuilding(null); }
  }

  if (!activeBrand) return <div className="s-card p-10 text-center max-w-[560px] mx-auto mt-10"><b>Pick a brand first</b><p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>Use the brand menu at the top.</p></div>;
  if (!loaded) return <PageSkeleton />;

  if (!spec) {
    return (
      <div className="max-w-[880px] mx-auto pt-4 md:pt-10">
        <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Website · for {activeBrand.brand_name}</p>
        <h2 className="text-[28px] md:text-[36px] font-semibold tracking-tight leading-tight">A landing page that already knows your brand</h2>
        <p className="text-[15px] mt-3 max-w-[620px]" style={{ color: "var(--s-soft)" }}>BlinkSpot reads your Brand page, your products and your best Library images, then writes and designs a one-page site in your colours and fonts. Edit any section, then publish it at blinkspot.io/s/your-name.</p>
        <div className="grid gap-2 mt-8 sm:grid-cols-2" role="radiogroup" aria-label="Start from">
          <button type="button" role="radio" aria-checked={start === "playbook"} className="s-card p-4 text-left grid gap-1" style={{ borderColor: start === "playbook" ? "var(--s-accent)" : undefined }} onClick={() => setStart("playbook")}>
            <b className="text-[14px]">What works for {playbook?.label.toLowerCase() ?? "your kind of business"}</b>
            <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{playbook?.line ?? "The sections that sell for businesses like yours, in your colours."}</span>
          </button>
          <div role="radio" aria-checked={start === "inspo"} tabIndex={0} className="s-card p-4 text-left grid gap-2 cursor-pointer" style={{ borderColor: start === "inspo" ? "var(--s-accent)" : undefined }} onClick={() => setStart("inspo")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStart("inspo"); }}>
            <b className="text-[14px]">Like a site I love</b>
            <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>Paste a link. We copy its layout and feel, never its words or pictures.</span>
            {start === "inspo" && <input className="s-input" value={inspoUrl} onChange={(e) => setInspoUrl(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="e.g. a competitor or a brand you admire" aria-label="A website you like" autoFocus />}
          </div>
        </div>
        <div className="s-card p-4 mt-3 grid gap-3">
          <textarea className="s-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: anything it should know, e.g. push the weekend platter, keep it short" aria-label="Note for the page" />
          <button className="s-btn primary w-fit" onClick={() => build("full")} disabled={building !== null || (start === "inspo" && !inspoUrl.trim())}>
            {building === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Build my landing page <span className="cost">free</span>
          </button>
          {building === "full" && <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>Writing and designing it, about 30 to 60 seconds…</p>}
        </div>
        <p className="text-[12.5px] mt-4" style={{ color: "var(--s-mute)" }}>Better input, better page: fill in the <Link href="/studio/brand" className="underline">Brand page</Link> (products, who it&apos;s for, WhatsApp) first.</p>
      </div>
    );
  }

  const present = new Set(spec.sections.map((s) => s.type));
  const addable = (Object.keys(NEW_SECTION) as SiteSection["type"][]).filter((t) => !present.has(t) && NEW_SECTION[t](spec));
  const liveUrl = meta.slug ? `${typeof window !== "undefined" ? window.location.origin : "https://www.blinkspot.io"}/s/${meta.slug}` : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]" style={{ height: "calc(100dvh - 110px)" }}>
      {/* Left: theme + sections */}
      <aside className="s-card overflow-y-auto min-h-0 flex flex-col">
        <div className="p-4 grid gap-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
          <div className="flex items-center gap-2">
            <b className="text-[14px]">Website</b>
            <span className={`s-badge ${meta.published ? "ok" : ""}`}>{meta.published ? "Live" : "Draft"}</span>
            {meta.published && meta.changes && <span className="s-badge warn" title="Your edits are saved but not on the live page until you press Publish changes">changes not live</span>}
            <span className="ml-auto text-[11px]" style={{ color: "var(--s-mute)" }}>{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {STYLES.map((st) => (
              <button key={st.id} type="button" className="rounded-lg p-2 text-left" style={{ background: spec.theme.style === st.id ? "color-mix(in oklab, var(--s-accent) 10%, var(--s-bg))" : "var(--s-bg)", border: `1px solid ${spec.theme.style === st.id ? "var(--s-accent)" : "var(--s-line)"}` }} onClick={() => edit({ ...spec, theme: { ...spec.theme, style: st.id } })} aria-pressed={spec.theme.style === st.id}>
                <b className="text-[12.5px] block">{st.label}</b><span className="text-[11px]" style={{ color: "var(--s-mute)" }}>{st.line}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {(["light", "dark"] as const).map((m) => <button key={m} type="button" className="s-chip" aria-pressed={spec.theme.mode === m} onClick={() => edit({ ...spec, theme: { ...spec.theme, mode: m } })}>{m === "light" ? "Light" : "Dark"}</button>)}
            <select className="s-input ml-auto" style={{ height: 28, fontSize: 12, width: 150 }} value={spec.theme.headingFont} onChange={(e) => edit({ ...spec, theme: { ...spec.theme, headingFont: e.target.value } })} aria-label="Heading font">
              {[spec.theme.headingFont, ...GOOGLE_FONTS_REGISTRY.map((f) => f.family).filter((f) => f !== spec.theme.headingFont)].map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="p-2 grid gap-1">
          {spec.sections.map((s, i) => (
            <div key={`${s.type}-${i}`} className="rounded-xl" style={{ background: open === i ? "var(--s-bg)" : "transparent", border: `1px solid ${open === i ? "var(--s-line-2)" : "transparent"}` }}>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button type="button" className="flex-1 text-left text-[13px] font-medium py-1" onClick={() => setOpen(open === i ? -1 : i)} style={{ opacity: s.hidden ? 0.45 : 1 }}>{SECTION_LABEL[s.type]}</button>
                {i > 1 && <button type="button" className="s-btn ghost sm" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>}
                {i > 0 && i < spec.sections.length - 1 && <button type="button" className="s-btn ghost sm" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>}
                {i > 0 && <button type="button" className="s-btn ghost sm" aria-label={s.hidden ? "Show section" : "Hide section"} onClick={() => setSection(i, { ...s, hidden: !s.hidden })}>{s.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>}
                {i > 0 && <button type="button" className="s-btn ghost sm" aria-label="Remove section" onClick={() => edit({ ...spec, sections: spec.sections.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
              {open === i && (
                <div className="px-3 pb-3 grid gap-3">
                  <SectionFields s={s} spec={spec} set={(next) => setSection(i, next)} />
                  <div className="flex gap-1.5 pt-1" style={{ borderTop: "1px solid var(--s-line)" }}>
                    <input className="s-input mt-2" style={{ height: 32 }} value={notes[i] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))} placeholder="Rewrite with AI: e.g. shorter, more Swahili" aria-label={`Rewrite note for ${SECTION_LABEL[s.type]}`}
                      onKeyDown={(e) => { if (e.key === "Enter") void build("section", i); }} />
                    <button type="button" className="s-btn ai sm mt-2" disabled={building !== null} onClick={() => build("section", i)} aria-label={`Rewrite ${SECTION_LABEL[s.type]} with AI`}>{building === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {addable.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {addable.map((t) => <button key={t} type="button" className="s-chip" onClick={() => { const sec = NEW_SECTION[t](spec)!; const idx = Math.max(1, spec.sections.findIndex((x) => x.type === "contact")); const at = idx > 0 ? idx : spec.sections.length; edit({ ...spec, sections: [...spec.sections.slice(0, at), sec, ...spec.sections.slice(at)] }); setOpen(at); }}><Plus className="h-3 w-3 inline -mt-0.5" /> {SECTION_LABEL[t]}</button>)}
            </div>
          )}
        </div>
        <div className="mt-auto p-3 grid gap-2" style={{ borderTop: "1px solid var(--s-line)" }}>
          <div className="flex gap-1.5">
            <input className="s-input" style={{ height: 32 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={start === "inspo" && inspoUrl ? "Rebuild (still like the site you gave)" : "Rebuild the whole page with a note"} aria-label="Rebuild note" />
            <button type="button" className="s-btn sm" disabled={building !== null} onClick={() => build("full")}>{building === "full" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Rebuild</button>
          </div>
          <button type="button" className="s-btn ghost sm w-fit" onClick={async () => { if (!brandId) return; const r = await refreshSiteData(brandId); if (r.error || !r.spec) toast.error(r.error || "Couldn't refresh."); else { setSpec(r.spec); toast.success("Brand info, products and images updated."); } }}><RefreshCw className="h-3.5 w-3.5" /> Refresh brand info</button>
        </div>
      </aside>

      {/* Right: preview */}
      <section className="min-h-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Preview size">
            <button className="s-chip" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Laptop className="h-3.5 w-3.5 inline -mt-0.5" /> Desktop</button>
            <button className="s-chip" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone className="h-3.5 w-3.5 inline -mt-0.5" /> Phone</button>
          </div>
          <div className="flex-1" />
          {meta.published && liveUrl && <a href={liveUrl} target="_blank" rel="noopener" className="s-btn ghost sm"><ExternalLink className="h-3.5 w-3.5" /> Open live page</a>}
          <button className="s-btn primary sm" onClick={() => setPublishing(true)}><Globe className="h-3.5 w-3.5" /> {meta.published ? "Publish changes" : "Publish"}</button>
        </div>
        <div className="flex-1 min-h-0 rounded-2xl p-2 md:p-3" style={{ background: "var(--s-raised)" }}>
          <PreviewFrame width={device === "phone" ? 390 : "100%"}><SiteRenderer spec={spec} preview /></PreviewFrame>
        </div>
      </section>

      <Modal open={publishing} onClose={() => setPublishing(false)} label="Publish your page" width={520} padded>
        <div className="flex items-center justify-between mb-2"><b className="text-[15px]">Publish your page</b><button className="s-btn ghost sm" onClick={() => setPublishing(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <p className="text-[13px] mb-4" style={{ color: "var(--s-soft)" }}>Anyone with the link can see it. Changes you make later go live when you press Publish again.</p>
        <label className="s-label" htmlFor="site-slug">Address</label>
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--s-line-2)", background: "var(--s-bg)" }}>
          <span className="pl-3 text-[13px] whitespace-nowrap" style={{ color: "var(--s-mute)" }}>blinkspot.io/s/</span>
          <input id="site-slug" className="s-input" style={{ border: 0, background: "transparent", paddingLeft: 2 }} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48))} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="s-btn primary" onClick={async () => {
            if (!brandId) return;
            if (dirty.current) { dirty.current = false; await saveSite(brandId, spec); }
            const r = await publishSite(brandId, slug);
            if (r.error || !r.slug) { toast.error(r.error || "Couldn't publish."); return; }
            setMeta((m) => ({ ...m, slug: r.slug!, published: true, changes: false }));
            const url = `${window.location.origin}/s/${r.slug}`;
            void navigator.clipboard?.writeText(url).catch(() => {});
            toast.success(`Live at ${url.replace(/^https?:\/\//, "")} (link copied).`);
            setPublishing(false);
          }}><Check className="h-4 w-4" /> Publish</button>
          {liveUrl && <button className="s-btn ghost" onClick={() => { void navigator.clipboard?.writeText(liveUrl); toast.success("Link copied."); }}><Copy className="h-4 w-4" /> Copy link</button>}
          {meta.published && <button className="s-btn ghost" style={{ color: "var(--s-danger)" }} onClick={async () => { if (!brandId) return; const r = await unpublishSite(brandId); if (r.error) toast.error(r.error); else { setMeta((m) => ({ ...m, published: false })); toast.success("Taken offline."); setPublishing(false); } }}>Take offline</button>}
        </div>
      </Modal>
    </div>
  );
}
