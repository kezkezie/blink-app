"use client";

import "@/app/studio/studio.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase, Check, Globe, Loader2, Rocket, Sparkles, Store, Upload, User, Wand2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { triggerWorkflow } from "@/lib/workflows";
import { createBrandWorkspace, saveBrandDna } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";
import { CTAS, LANGUAGES, PERSONALITY, PHOTO_VIBES, type BrandDna } from "@/lib/brand-dna";
import { canvasSafe, loadImage, paletteOf } from "@/components/studio/editor/util";
import { Dictation } from "@/components/studio/Dictation";

/**
 * The first five minutes (2026-10-11). Asks only what makes the first post usable: what you sell,
 * to whom, where, your look, how you sound, how people reach you. Everything else waits for the
 * Brand page. People without a brand go to the brand builder instead.
 */

type Step = "role" | "have" | "basics" | "look" | "voice" | "style" | "saving";
const ORDER: Step[] = ["role", "have", "basics", "look", "voice", "style"];

function Choice({ icon: Icon, title, line, selected, onClick }: { icon: typeof Store; title: string; line: string; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className="s-card text-left p-4 flex gap-3 items-start transition-colors"
      style={{ borderColor: selected ? "var(--s-accent)" : undefined, background: selected ? "color-mix(in oklab, var(--s-accent) 7%, var(--s-panel))" : undefined }}>
      <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "var(--s-raised)" }}><Icon className="h-5 w-5" style={{ color: "var(--s-accent)" }} /></span>
      <span className="min-w-0"><b className="text-[15px] block">{title}</b><span className="text-[13px]" style={{ color: "var(--s-soft)" }}>{line}</span></span>
    </button>
  );
}
function Chips({ options, value, onChange, max, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max: number; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" className="s-chip" aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o].slice(-max))}>{o}</button>)}
    </div>
  );
}
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <span className="block mb-1.5"><span className="text-[13px] font-medium">{children}</span>{hint && <span className="text-[12px] ml-2" style={{ color: "var(--s-mute)" }}>{hint}</span>}</span>;
}

export default function WelcomePage() {
  const router = useRouter();
  const { clientId, loading } = useClient();
  const { setActiveBrand, setAvailableBrands } = useBrandStore();
  const [firstName, setFirstName] = useState("");
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<BrandDna["role"]>();
  const [website, setWebsite] = useState("");
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
  const logoRef = useRef<HTMLInputElement>(null);

  // Signed out → sign in. Already set up (has a brand) → straight into the studio.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/login?redirect=/welcome"); return; }
      setFirstName(String(user.user_metadata?.full_name || "").split(" ")[0]);
    });
  }, [router]);
  useEffect(() => {
    if (!clientId) return;
    supabase.from("brand_profiles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("is_active", true).then(({ count }) => {
      if ((count ?? 0) > 0) router.replace("/studio");
    });
  }, [clientId, router]);

  const index = ORDER.indexOf(step);
  const go = (s: Step) => { setStep(s); window.scrollTo({ top: 0 }); };
  const next = () => go(ORDER[Math.min(ORDER.length - 1, index + 1)]);
  const back = () => go(ORDER[Math.max(0, index - 1)]);

  async function onLogo(file?: File) {
    if (!file || !clientId) return;
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

  async function finish(style: "auto" | "pro") {
    try { localStorage.setItem("blink-work-style", style); } catch { /* private mode */ }
    go("saving");
    const created = await createBrandWorkspace({
      userId: "", contactName: firstName, brandName: name.trim(), companyName: name.trim(), industry: "", description: what.trim(),
      websiteUrl: website.trim(), socialUrls: "", visualStyleGuide: "", primaryColor: colors[0], secondaryColor: colors[1], accentColor: colors[2],
      additionalColor: "", primaryFont: null, brandVoice: "", toneKeywords: tone, logoUrl: null, uploadedAssets: [],
    });
    if (created.error || !created.brandId) { toast.error(created.error || "Couldn't create your brand."); go("style"); return; }
    await saveBrandDna(created.brandId, {
      brand_name: name.trim(), description: what.trim(), website_url: website.trim(), logo_url: logo, primary_color: colors[0], secondary_color: colors[1], accent_color: colors[2],
      tone_keywords: tone, dna: { role, audience, location, languages, photoVibes: vibes, whatsapp, cta },
    });
    if (website.trim()) void triggerWorkflow("blink-brand-extract-001", { client_id: created.clientId, brand_id: created.brandId, website_url: website.trim() }).catch(() => {});
    await supabase.auth.updateUser({ data: { onboarding_completed: true } }).catch(() => {});
    const brand = { id: created.brandId, brand_name: name.trim(), logo_url: logo };
    setAvailableBrands([brand]);
    setActiveBrand(brand);
    router.replace(style === "auto" ? "/studio?welcome=auto" : "/studio?welcome=pro");
  }

  if (loading) return <div className="studio min-h-dvh grid place-items-center" style={{ background: "var(--s-bg)" }}><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--s-mute)" }} /></div>;

  const canBasics = name.trim().length > 1 && what.trim().length > 8;
  return (
    <div className="studio min-h-dvh" style={{ background: "radial-gradient(90% 60% at 50% -10%, color-mix(in oklab, var(--s-accent) 9%, transparent), transparent 60%), var(--s-bg)", color: "var(--s-text)" }}>
      <header className="flex items-center gap-3 px-6 py-5 max-w-[880px] mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-lime.png" alt="BlinkSpot" className="h-8 w-8 object-contain" />
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--s-line)" }} aria-label={`Step ${Math.max(1, index + 1)} of ${ORDER.length}`}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${step === "saving" ? 100 : ((index + 1) / ORDER.length) * 100}%`, background: "var(--s-accent)" }} />
        </div>
        <Link href="/studio" className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>Skip for now</Link>
      </header>

      <main className="max-w-[640px] mx-auto px-6 pb-20 pt-6 md:pt-12">
        {step === "role" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">Hi{firstName ? ` ${firstName}` : ""}. Who are you making content for?</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>Six quick questions, about two minutes. You can change everything later.</p></div>
            <div className="grid gap-2.5">
              <Choice icon={Store} title="My business" line="One brand: your shop, restaurant, product or service." selected={role === "business"} onClick={() => { setRole("business"); next(); }} />
              <Choice icon={Briefcase} title="My clients' brands" line="You run content for several brands (an agency or freelancer)." selected={role === "agency"} onClick={() => { setRole("agency"); next(); }} />
              <Choice icon={User} title="Me, as a creator" line="Your personal brand, channel or influencer work." selected={role === "creator"} onClick={() => { setRole("creator"); next(); }} />
            </div>
          </section>
        )}

        {step === "have" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">{role === "agency" ? "Let's add your first client." : "Do you already have a brand?"}</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>A name, a logo, colours. If not, we&apos;ll make one with you.</p></div>
            <div className="s-card p-4 grid gap-3">
              <div className="flex gap-3 items-start">
                <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "var(--s-raised)" }}><Globe className="h-5 w-5" style={{ color: "var(--s-accent)" }} /></span>
                <div className="min-w-0 flex-1"><b className="text-[15px] block">Yes, and it has a website</b><span className="text-[13px]" style={{ color: "var(--s-soft)" }}>We&apos;ll read it and fill in what we can.</span></div>
              </div>
              <div className="flex gap-2">
                <input className="s-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbrand.com" aria-label="Website" inputMode="url" />
                <button className="s-btn primary" disabled={website.trim().length < 4} onClick={() => { if (!name) setName(website.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0].replace(/^./, (c) => c.toUpperCase())); next(); }}>Continue <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
            <Choice icon={Check} title="Yes, but no website" line="Tell us about it in the next steps." onClick={() => { setWebsite(""); next(); }} />
            <Choice icon={Sparkles} title="Not yet, build one with me" line="Describe the business; get a name, colours, fonts, a voice and logos. Free." onClick={async () => { await supabase.auth.updateUser({ data: { onboarding_completed: true } }).catch(() => {}); router.push("/studio/brand-builder"); }} />
            <button className="s-btn ghost w-fit" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</button>
          </section>
        )}

        {step === "basics" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">The basics</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>Like you&apos;d explain it to a new customer. Tap the mic to talk instead of typing.</p></div>
            <div className="grid gap-4">
              <label><Label>Brand name</Label><input className="s-input" style={{ height: 44 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mama Njeri Kitchen" aria-label="Brand name" autoFocus /></label>
              <label><Label hint="One or two sentences">What do you sell or do?</Label><textarea className="s-input" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Home-cooked East African food, delivered to offices in Westlands every weekday." aria-label="What you do" /></label>
              <label><Label hint="Optional">Who is it for?</Label><input className="s-input" style={{ height: 44 }} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Busy office workers who want a real lunch" aria-label="Who it's for" /></label>
              <label><Label hint="Optional">Where are you based?</Label><input className="s-input" style={{ height: 44 }} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Nairobi" aria-label="Where you're based" /></label>
            </div>
            <div className="flex gap-2"><button className="s-btn ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</button><div className="flex-1" /><button className="s-btn primary" disabled={!canBasics} onClick={next}>Continue <ArrowRight className="h-4 w-4" /></button></div>
          </section>
        )}

        {step === "look" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">Your look</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>Add your logo and we&apos;ll take the colours from it.</p></div>
            <div className="flex gap-4 items-center">
              <button type="button" className="h-28 w-28 rounded-2xl grid place-items-center overflow-hidden border-2 border-dashed shrink-0" style={{ borderColor: "var(--s-line-2)", background: logo ? "#fff" : "var(--s-panel)" }} onClick={() => logoRef.current?.click()} aria-label={logo ? "Change logo" : "Upload logo"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : logo ? <img src={logo} alt="Your logo" className="max-w-[80%] max-h-[80%] object-contain" /> : <span className="grid place-items-center gap-1 text-[12px]" style={{ color: "var(--s-mute)" }}><Upload className="h-5 w-5" />Logo</span>}
              </button>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="grid gap-2">
                <span className="text-[13px] font-medium">Colours</span>
                <div className="flex gap-2">
                  {colors.map((c, i) => (
                    <label key={i} className="relative h-12 w-12 rounded-xl border cursor-pointer" style={{ background: c, borderColor: "var(--s-line-2)" }} title={c}>
                      <input type="color" value={c} onChange={(e) => setColors((prev) => prev.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={["Main", "Second", "Accent"][i] + " colour"} />
                    </label>
                  ))}
                </div>
                <span className="text-[12px]" style={{ color: "var(--s-mute)" }}>{logo ? "Taken from your logo. Tap one to change it." : "No logo yet? Pick three, or make a logo later in the Brand builder."}</span>
              </div>
            </div>
            <div><Label hint="Pick up to three">What should your photos feel like?</Label><Chips options={PHOTO_VIBES} value={vibes} onChange={setVibes} max={3} label="Photo feel" /></div>
            <div className="flex gap-2"><button className="s-btn ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</button><div className="flex-1" /><button className="s-btn ghost" onClick={next}>Skip</button><button className="s-btn primary" onClick={next}>Continue <ArrowRight className="h-4 w-4" /></button></div>
          </section>
        )}

        {step === "voice" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">How you sound</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>So captions and scripts sound like you, not like a robot.</p></div>
            <div><Label hint="Up to three">Personality</Label><Chips options={PERSONALITY} value={tone} onChange={setTone} max={3} label="Personality" /></div>
            <div><Label hint="We write in these">Languages</Label><Chips options={LANGUAGES} value={languages} onChange={setLanguages} max={3} label="Languages" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><Label hint="Optional">WhatsApp for customers</Label><input className="s-input" style={{ height: 44 }} inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+254 7…" aria-label="WhatsApp" /></label>
              <label><Label>What should people do?</Label>
                <select className="s-input" style={{ height: 44 }} value={cta} onChange={(e) => setCta(e.target.value)} aria-label="Call to action">{CTAS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
            </div>
            <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>We only ever put the contact details you give us on your posts. Nothing is made up.</p>
            <div className="flex gap-2"><button className="s-btn ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</button><div className="flex-1" /><button className="s-btn ghost" onClick={next}>Skip</button><button className="s-btn primary" onClick={next}>Continue <ArrowRight className="h-4 w-4" /></button></div>
          </section>
        )}

        {step === "style" && (
          <section className="grid gap-6">
            <div><h1 className="text-[32px] font-semibold tracking-tight leading-tight">How do you like to work?</h1>
              <p className="text-[15px] mt-2" style={{ color: "var(--s-soft)" }}>Both get the same tools. This only sets where you start.</p></div>
            <Choice icon={Wand2} title="Do it for me" line="Tell Ask BlinkSpot what you need in a sentence. It plans it, picks the settings and shows you the price before anything is made." onClick={() => finish("auto")} />
            <Choice icon={Wrench} title="I'll use the tools" line="Studios, the editor and every setting open. For designers and marketers who like control." onClick={() => finish("pro")} />
            <button className="s-btn ghost w-fit" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</button>
          </section>
        )}

        {step === "saving" && (
          <section className="grid place-items-center gap-4 py-24 text-center">
            <Rocket className="h-8 w-8" style={{ color: "var(--s-accent)" }} />
            <h1 className="text-[26px] font-semibold">Setting up {name || "your brand"}…</h1>
            <p className="text-[14px]" style={{ color: "var(--s-soft)" }}>{website ? "We're also reading your website to fill in the rest." : "A few seconds."}</p>
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--s-mute)" }} />
          </section>
        )}
      </main>
      <Dictation />
    </div>
  );
}
