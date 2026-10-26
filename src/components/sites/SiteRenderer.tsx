import "./sites.css";
import type { CSSProperties } from "react";
import { whatsappLink, type SiteImage, type SiteProduct, type SiteSection, type SiteSpec } from "@/lib/sites/spec";
import { fontsCssAbsolute } from "@/lib/google-fonts";

/**
 * Renders a SiteSpec (the AI's plan, edited by the owner) as a finished landing page. No hooks,
 * so the same component serves the builder's live preview and the public /s/<slug> page.
 */

function lum(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const readableOn = (bg: string, preferred: string) => (contrast(preferred, bg) >= 3.2 ? preferred : contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF");

/** Cloudinary images come in at 4K; ask for a sensible width. Other hosts are left alone. */
function sized(url: string, w: number) {
  return url.includes("res.cloudinary.com") && url.includes("/upload/") && !/\/upload\/[^/]*w_\d+/.test(url) ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`) : url;
}

function themeVars(spec: SiteSpec): CSSProperties {
  const t = spec.theme;
  const dark = t.mode === "dark";
  const bg = dark ? "#0E0E10" : lum(t.background) < 0.5 ? "#FAF8F4" : t.background;
  const ink = dark ? "#F4F2EE" : readableOn(bg, t.primary);
  const accent = contrast(t.accent, bg) >= 1.6 ? t.accent : t.primary;
  const style = t.style;
  return {
    "--bg": bg,
    "--ink": ink,
    "--muted": `color-mix(in oklab, ${ink} 68%, transparent)`,
    "--line": `color-mix(in oklab, ${ink} 12%, transparent)`,
    "--line-strong": `color-mix(in oklab, ${ink} 28%, transparent)`,
    "--card": dark ? "rgba(255,255,255,.05)" : `color-mix(in oklab, ${t.secondary} 14%, ${bg})`,
    "--accent": accent,
    "--on-accent": readableOn(accent, "#FFFFFF"),
    "--primary": t.primary,
    "--secondary": t.secondary,
    "--eyebrow": contrast(accent, bg) >= 3 ? accent : `color-mix(in oklab, ${accent} 45%, ${ink})`,
    "--font-head": `"${t.headingFont}"`,
    "--font-body": `"${t.bodyFont}"`,
    "--radius": style === "editorial" ? "4px" : style === "bold" ? "10px" : style === "soft" ? "26px" : "16px",
    "--btn-radius": style === "editorial" ? "2px" : style === "soft" || style === "minimal" ? "999px" : "8px",
    "--h-weight": style === "editorial" ? "500" : style === "bold" ? "800" : style === "soft" ? "700" : "600",
    "--h-track": style === "editorial" ? "-0.01em" : style === "bold" ? "-0.035em" : "-0.03em",
    "--h-case": style === "bold" ? "uppercase" : "none",
  } as CSSProperties;
}

function fontsHref(spec: SiteSpec) {
  const fams = [...new Set([spec.theme.headingFont, spec.theme.bodyFont])].map((f) => `family=${f.trim().replace(/\s+/g, "+")}:wght@400;500;600;700;800`);
  return fontsCssAbsolute(`${fams.join("&")}&display=swap`);
}

function primaryAction(spec: SiteSpec, label?: string, product?: string) {
  const c = spec.contact;
  const wa = whatsappLink(c.whatsapp, product ? `Hi ${spec.brand.name}, I'd like ${product}.` : `Hi ${spec.brand.name}!`);
  if (wa) return { href: wa, label: label || c.cta || "Order on WhatsApp", external: true };
  if (c.phone) return { href: `tel:${c.phone.replace(/[^\d+]/g, "")}`, label: label || "Call us", external: false };
  if (c.email) return { href: `mailto:${c.email}`, label: label || "Email us", external: false };
  return { href: "#contact", label: label || "Get in touch", external: false };
}

function Img({ img, w, className = "", style, alt }: { img?: SiteImage; w: number; className?: string; style?: CSSProperties; alt?: string }) {
  if (!img) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={sized(img.url, w)} alt={alt ?? img.caption ?? ""} loading="lazy" className={className} style={{ objectFit: "cover", width: "100%", ...style }} />;
}

function Hero({ s, spec, img }: { s: Extract<SiteSection, { type: "hero" }>; spec: SiteSpec; img?: SiteImage }) {
  const act = primaryAction(spec, s.cta);
  const ctas = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34 }}>
      <a className="btn primary" href={act.href} target={act.external ? "_blank" : undefined} rel={act.external ? "noopener" : undefined}>{act.label}</a>
      {s.secondaryCta && <a className="btn ghost" href={spec.sections.some((x) => x.type === "products" && !x.hidden) ? "#products" : "#about"}>{s.secondaryCta}</a>}
    </div>
  );
  const text = (light?: boolean) => (
    <div style={light ? { color: "#fff" } : undefined}>
      {s.eyebrow && <p className="eyebrow" style={light ? { color: "#fff", opacity: 0.85 } : undefined}>{s.eyebrow}</p>}
      <h1 className="h h1" style={{ marginTop: s.eyebrow ? 18 : 0 }}>{s.headline}</h1>
      {s.sub && <p className="lead" style={{ marginTop: 22, ...(light ? { color: "rgba(255,255,255,.85)" } : {}) }}>{s.sub}</p>}
      {ctas}
    </div>
  );
  if (s.variant === "full" && img) {
    return (
      <section style={{ position: "relative", minHeight: "min(92dvh, 860px)", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
        <Img img={img} w={2000} style={{ position: "absolute", inset: 0, height: "100%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.2) 40%, rgba(0,0,0,.72) 100%)" }} />
        <div className="w" style={{ position: "relative", width: "100%", padding: "160px 20px 72px" }}><div style={{ maxWidth: 760 }}>{text(true)}</div></div>
      </section>
    );
  }
  if (s.variant === "split" && img) {
    return (
      <section className="w" style={{ display: "grid", gap: 48, alignItems: "center", padding: "56px 20px 88px", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {text()}
        <div className="frame" style={{ aspectRatio: "4 / 5", maxHeight: 680 }}><Img img={img} w={1200} style={{ height: "100%" }} /></div>
      </section>
    );
  }
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", right: "-8vw", top: "-10vw", width: "42vw", height: "42vw", borderRadius: "50%", background: "var(--secondary)", opacity: 0.35 }} />
      <div aria-hidden style={{ position: "absolute", right: "14vw", bottom: "-6vw", width: "16vw", height: "16vw", borderRadius: "50%", background: "var(--accent)", opacity: 0.5 }} />
      <div className="w" style={{ position: "relative", padding: "120px 20px 120px" }}><div style={{ maxWidth: 900 }}>{text()}</div></div>
    </section>
  );
}

function ProductCard({ p, spec }: { p: SiteProduct; spec: SiteSpec }) {
  const act = primaryAction(spec, undefined, p.name);
  return (
    <div className="card rise" style={{ display: "flex", flexDirection: "column" }}>
      {p.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sized(p.image_url, 800)} alt={p.name} loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} />
      ) : (
        <div style={{ aspectRatio: "4 / 3", display: "grid", placeItems: "center", background: "color-mix(in oklab, var(--secondary) 35%, var(--bg))" }}>
          <span className="h h2" style={{ opacity: 0.35 }}>{p.name.charAt(0)}</span>
        </div>
      )}
      <div style={{ padding: 22, display: "grid", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <h3 className="h h3">{p.name}</h3>
          {p.price ? <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{p.currency || "KES"} {Number(p.price).toLocaleString()}</span> : null}
        </div>
        {p.description && <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>{p.description}</p>}
        <a className="btn ghost" style={{ height: 42, marginTop: "auto", fontSize: 14 }} href={act.href} target={act.external ? "_blank" : undefined} rel={act.external ? "noopener" : undefined}>{act.external ? "Order on WhatsApp" : act.label}</a>
      </div>
    </div>
  );
}

function Section({ s, spec }: { s: SiteSection; spec: SiteSpec }) {
  const img = (id?: string) => spec.images.find((i) => i.id === id);
  switch (s.type) {
    case "hero": return <Hero s={s} spec={spec} img={img(s.imageId)} />;
    case "highlights":
      return (
        <section className="sec line" id="why">
          <div className="w">
            {s.title && <h2 className="h h2 rise" style={{ maxWidth: "18ch" }}>{s.title}</h2>}
            <div style={{ display: "grid", gap: 1, marginTop: s.title ? 48 : 0, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {s.items.map((it, i) => (
                <div key={i} className="rise" style={{ background: "var(--bg)", padding: 28 }}>
                  <span style={{ fontFamily: "var(--font-head)", fontSize: 15, color: "var(--eyebrow)", fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="h h3" style={{ marginTop: 14 }}>{it.title}</h3>
                  {it.body && <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>{it.body}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    case "products": {
      const list = s.productIds?.length ? s.productIds.map((id) => spec.products.find((p) => p.id === id)).filter((p): p is SiteProduct => !!p) : spec.products;
      if (!list.length) return null;
      return (
        <section className="sec line" id="products">
          <div className="w">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 20 }}>
              <h2 className="h h2" style={{ maxWidth: "16ch" }}>{s.title || "What we make"}</h2>
              {s.sub && <p className="lead" style={{ maxWidth: "44ch", margin: 0 }}>{s.sub}</p>}
            </div>
            <div style={{ display: "grid", gap: 18, marginTop: 44, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {list.map((p) => <ProductCard key={p.id} p={p} spec={spec} />)}
            </div>
          </div>
        </section>
      );
    }
    case "gallery":
      return (
        <section className="sec line" id="gallery">
          <div className="w">
            {s.title && <h2 className="h h2" style={{ marginBottom: 40 }}>{s.title}</h2>}
            <div className="masonry">{s.imageIds.map((id) => <div key={id} className="frame rise"><Img img={img(id)} w={900} /></div>)}</div>
          </div>
        </section>
      );
    case "about": {
      const im = img(s.imageId);
      return (
        <section className="sec line" id="about">
          <div className="w" style={{ display: "grid", gap: 56, alignItems: "center", gridTemplateColumns: im ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr" }}>
            {im && <div className="frame rise" style={{ aspectRatio: "5 / 6" }}><Img img={im} w={1100} style={{ height: "100%" }} /></div>}
            <div className="rise" style={{ maxWidth: 620 }}>
              <h2 className="h h2">{s.title}</h2>
              {s.body.split(/\n+/).map((para, i) => <p key={i} className="lead" style={{ marginTop: i ? 14 : 24 }}>{para}</p>)}
            </div>
          </div>
        </section>
      );
    }
    case "faq":
      return (
        <section className="sec line" id="faq">
          <div className="w" style={{ display: "grid", gap: 40, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <h2 className="h h2">{s.title || "Questions"}</h2>
            <div>
              {s.items.map((f, i) => (
                <details key={i} style={{ borderTop: "1px solid var(--line)", padding: "20px 0" }}>
                  <summary style={{ display: "flex", justifyContent: "space-between", gap: 16, fontWeight: 600, fontSize: 17 }}>{f.q}<span className="plus" aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>+</span></summary>
                  <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    case "contact": {
      const c = spec.contact;
      const wa = whatsappLink(c.whatsapp, `Hi ${spec.brand.name}!`);
      return (
        <section className="sec" id="contact">
          <div className="w">
            <div className="rise" style={{ borderRadius: "var(--radius)", padding: "clamp(36px, 6vw, 80px)", background: "var(--accent)", color: "var(--on-accent)" }}>
              <h2 className="h h2" style={{ maxWidth: "16ch" }}>{s.title}</h2>
              {s.sub && <p style={{ fontSize: 18, marginTop: 18, maxWidth: "50ch", opacity: 0.85 }}>{s.sub}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
                {wa && <a className="btn" style={{ background: "var(--on-accent)", color: "var(--accent)" }} href={wa} target="_blank" rel="noopener">WhatsApp us</a>}
                {c.phone && <a className="btn" style={{ boxShadow: "inset 0 0 0 1.5px currentColor" }} href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>Call {c.phone}</a>}
                {c.email && <a className="btn" style={{ boxShadow: "inset 0 0 0 1.5px currentColor" }} href={`mailto:${c.email}`}>{c.email}</a>}
              </div>
              {(!!c.location || !!c.socials?.length) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", marginTop: 28, fontSize: 14.5, opacity: 0.85 }}>
                  {c.location && <span>{c.location}</span>}
                  {c.socials?.map((u) => <a key={u} href={/^https?:\/\//.test(u) ? u : `https://${u}`} target="_blank" rel="noopener" style={{ textDecoration: "underline" }}>{u.replace(/^https?:\/\/(www\.)?/, "")}</a>)}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }
  }
}

export function SiteRenderer({ spec, preview = false }: { spec: SiteSpec; preview?: boolean }) {
  const visible = spec.sections.filter((s) => !s.hidden);
  const act = primaryAction(spec);
  const anchors = [
    visible.some((s) => s.type === "products") && { href: "#products", label: "Menu & products" },
    visible.some((s) => s.type === "about") && { href: "#about", label: "About" },
    visible.some((s) => s.type === "faq") && { href: "#faq", label: "Questions" },
    visible.some((s) => s.type === "contact") && { href: "#contact", label: "Contact" },
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  return (
    <div className="bs-site" style={themeVars(spec)}>
      <link rel="stylesheet" href={fontsHref(spec)} />
      <header style={{ position: preview ? "relative" : "sticky", top: 0, zIndex: 20, background: "color-mix(in oklab, var(--bg) 86%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--line)" }}>
        <div className="w" style={{ display: "flex", alignItems: "center", gap: 20, height: 68 }}>
          <a href="#" style={{ display: "flex", alignItems: "center", gap: 10 }} aria-label={`${spec.brand.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {spec.brand.logoUrl && <img src={spec.brand.logoUrl} alt="" style={{ height: 36, width: "auto", maxWidth: 120, objectFit: "contain" }} />}
            <span className="h" data-brand-name={spec.brand.logoUrl ? "with-logo" : undefined} style={{ fontSize: 19, textTransform: "none", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{spec.brand.name}</span>
          </a>
          <nav style={{ display: "flex", gap: 24, marginLeft: "auto", fontSize: 14.5 }} className="muted" aria-label="Sections">
            {anchors.slice(0, 3).map((a) => <a key={a.href} href={a.href} style={{ display: "none" }} data-desktop>{a.label}</a>)}
          </nav>
          <a className="btn primary" style={{ height: 40, padding: "0 18px", fontSize: 14 }} href={act.href} target={act.external ? "_blank" : undefined} rel={act.external ? "noopener" : undefined}>{act.label}</a>
        </div>
        <style>{`@media (min-width: 860px) { .bs-site [data-desktop] { display: inline !important; } } @media (max-width: 560px) { .bs-site [data-brand-name="with-logo"] { display: none; } }`}</style>
      </header>
      <main>{visible.map((s, i) => <Section key={`${s.type}-${i}`} s={s} spec={spec} />)}</main>
      <footer className="line" style={{ padding: "36px 0 48px" }}>
        <div className="w muted" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", fontSize: 13.5 }}>
          <span>© {new Date().getFullYear()} {spec.brand.name}</span>
          <a href="https://www.blinkspot.io" target="_blank" rel="noopener" style={{ textDecoration: "underline" }}>Made with BlinkSpot</a>
        </div>
      </footer>
    </div>
  );
}
