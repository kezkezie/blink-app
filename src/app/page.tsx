import "@/app/studio/studio.css";
import "@/components/home/home.css";
import Link from "next/link";
import { ArrowRight, Check, Clapperboard, Languages, Layers, MessageCircle, Mic, PenTool, Shuffle, Sparkles, Store, Users, Wand2, Wrench } from "lucide-react";
import { EXAMPLES } from "@/lib/examples";
import { ExamplesGallery } from "@/components/studio/examples/ExamplesGallery";
import { HeroDemo } from "@/components/home/HeroDemo";
import { BeforeAfter, HomeNav, LazyVideo, VoiceRow } from "@/components/home/HomeBits";
import { HomeFooter } from "@/components/home/HomeFooter";
import { PLANS as PLAN_CARDS, TOP_UP } from "@/lib/plans";

/**
 * blinkspot.io (2026-10-11). Every picture and clip on this page was made in BlinkSpot for a
 * made-up brand (the examples gallery). No mock-ups, no invented numbers or testimonials.
 */

const ex = (id: string) => EXAMPLES.find((e) => e.id === id);
const thumbs = EXAMPLES.filter((e) => e.kind === "image" || e.kind === "remix").map((e) => ({ src: e.thumb ?? e.url, title: e.title, brand: e.brand }));

function StartButton({ children = "Start free" }: { children?: React.ReactNode }) {
  return <Link href="/get-started" className="h-btn">{children} <span className="h-ico"><ArrowRight className="h-4 w-4" /></span></Link>;
}

function Marquee({ items, reverse = false }: { items: typeof thumbs; reverse?: boolean }) {
  const loop = [...items, ...items];
  return (
    <div className="h-marquee-mask overflow-hidden">
      <div className={`h-marquee ${reverse ? "rev" : ""}`}>
        {loop.map((t, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={t.src} alt={i < items.length ? `${t.title} for ${t.brand}` : ""} loading="lazy" className="h-[240px] md:h-[300px] w-auto rounded-2xl object-cover" style={{ aspectRatio: "4 / 5" }} />
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01", title: "Teach it your brand, once.",
    text: "Your logo, colours, fonts, who you sell to, how you talk and how people reach you. Add your website and BlinkSpot fills most of it in. No brand yet? It builds one with you.",
    visual: "brand",
  },
  {
    n: "02", title: "Say what you want, in a sentence.",
    text: "Type it, say it, or drop a post you love from Pinterest. Ask BlinkSpot turns it into ideas, picks the settings and shows the price before anything is made.",
    visual: "ask",
  },
  {
    n: "03", title: "See it first, then post it.",
    text: "Videos start from a still you approve, so you never pay for a bad render. Edit in the Editor, send it for approval, put it on the calendar.",
    visual: "frame",
  },
] as const;

function StepVisual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "brand") {
    const logo = ex("logo-mavuno");
    return (
      <div className="h-panel p-6 md:p-8 grid gap-5">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo.url} alt="Mavuno logo" className="h-16 w-16 rounded-2xl object-contain p-1.5" style={{ background: "#F5F3EF" }} />}
          <div><div className="text-[22px] font-semibold tracking-tight">Mavuno</div><div className="text-[13px] h-muted">Cold-pressed juice · Nairobi</div></div>
          <span className="ml-auto h-chip" style={{ color: "var(--s-accent)" }}>Brand strength 92%</span>
        </div>
        <div className="flex gap-2">{["#1F4D3A", "#E8913A", "#B8432F", "#F7F3EA"].map((c) => <span key={c} className="h-14 flex-1 rounded-xl" style={{ background: c }} title={c} />)}</div>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl p-3" style={{ background: "var(--s-bg)" }}><div className="h-muted text-[11px] uppercase tracking-wider mb-1">For</div>Gym goers and office teams</div>
          <div className="rounded-xl p-3" style={{ background: "var(--s-bg)" }}><div className="h-muted text-[11px] uppercase tracking-wider mb-1">Voice</div>Warm · Honest · a little Swahili</div>
        </div>
        <div className="flex flex-wrap gap-1.5">{["Mango passion · KES 350", "Green detox · KES 380", "Order on WhatsApp"].map((c) => <span key={c} className="h-chip">{c}</span>)}</div>
      </div>
    );
  }
  if (kind === "ask") {
    return (
      <div className="h-panel p-5 md:p-6 grid gap-3">
        <div className="flex items-center gap-2 text-[13px] h-muted"><MessageCircle className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Ask BlinkSpot</div>
        <div className="justify-self-end max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px]" style={{ background: "var(--s-raised)" }}>A poster for our weekend family platter, 20% off. Make it warm.</div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md px-4 py-3 text-[14px] grid gap-2.5" style={{ background: "color-mix(in oklab, var(--s-ai) 10%, var(--s-bg))" }}>
          <span>Three ways to do it, in your colours:</span>
          {["Overhead platter on your wooden table, big “20% OFF” stamp", "Family hands reaching in, warm golden light, offer in the corner", "Bold orange poster, the platter floating, WhatsApp to order"].map((t, k) => (
            <span key={k} className="flex gap-2 text-[13px]" style={{ color: "var(--s-soft)" }}><span className="h-5 w-5 rounded-full grid place-items-center text-[11px] shrink-0" style={{ background: "var(--s-raised)" }}>{k + 1}</span>{t}</span>
          ))}
          <span className="h-btn justify-self-start" style={{ height: 36, fontSize: 13, padding: "0 16px" }}>Make number 1 · 18 credits</span>
        </div>
      </div>
    );
  }
  const frame = ex("kitenge-tryon");
  return (
    <div className="h-panel p-5 md:p-6 grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-wider h-muted">Step 1 · the still · 6 cr</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame?.input} alt="The approved first frame" className="w-full rounded-xl object-cover" style={{ aspectRatio: "4 / 5" }} />
        <span className="h-chip justify-self-start" style={{ color: "var(--s-ok)" }}><Check className="h-3 w-3" /> Approved</span>
      </div>
      <div className="grid gap-2">
        <span className="text-[11px] uppercase tracking-wider h-muted">Step 2 · the video</span>
        {frame && <LazyVideo src={frame.url} poster={frame.input} className="w-full rounded-xl object-cover" style={{ aspectRatio: "4 / 5" }} />}
        <span className="h-chip justify-self-start">Paid only once you like it</span>
      </div>
    </div>
  );
}

// From lib/plans.ts, the same list the billing page shows.
const PLANS = PLAN_CARDS.map((p) => ({
  name: p.name, price: `$${p.price.monthly}`, brands: `${p.brands} brand${p.brands === 1 ? "" : "s"}`, credits: p.credits.monthly, note: p.note, pop: p.popular,
}));

const FAQ = [
  { q: "What can I make?", a: "Posters, product photos and lifestyle shots, short videos (product shots, reveals, creators talking, try-ons, lip-sync, scene-by-scene stories), voiceovers, logos and captions. All in your brand's look." },
  { q: "Do I need design skills?", a: "No. Say what you want and Ask BlinkSpot does the rest. If you are a designer, the Editor gives you layers, pen, shapes, text and AI tools, and every setting is open." },
  { q: "How do credits work?", a: "Each thing you make costs credits, and the price is on the button before you press it: an image from 6 credits, a 5-second video from 20. Failed renders are refunded. Logos and brand building are free, and every new account gets 100 credits to start." },
  { q: "Will it use my real products and contacts?", a: "Yes. You add your products, prices and contact details once. BlinkSpot never invents phone numbers, prices or offers; it only uses what you gave it." },
  { q: "Can I write in Swahili or Sheng?", a: "Yes. Pick your languages on the Brand page and captions, scripts and on-image text follow them." },
  { q: "I run an agency. Can I manage clients?", a: "Yes. Each client is its own brand with its own look and voice. Send posts for approval, archive a client when they pause and bring them back any time." },
];

export default function Home() {
  const remix = ex("mavuno-remix");
  const remixBefore = remix?.before ? { url: remix.before, thumb: remix.before } : undefined;
  const pour = ex("tano-pour");
  const talk = ex("mavuno-lipsync");
  const creator = ex("sauti-creator");
  const logos = EXAMPLES.filter((e) => e.kind === "logo");
  const voices = EXAMPLES.filter((e) => e.kind === "voice");
  const editorImg = ex("kasi-poster");
  return (
    <div className="studio home min-h-dvh">
      <div className="h-grain" aria-hidden />
      <HomeNav />

      {/* Hero */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24" style={{ background: "radial-gradient(60% 50% at 10% 0%, color-mix(in oklab, var(--s-accent) 10%, transparent), transparent 60%)" }}>
        <div className="h-wrap grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center relative z-[2]">
          <div>
            <p className="h-eyebrow">The AI content studio for brands</p>
            <h1 className="h-h1 mt-5">Your brand&apos;s posts, ads and videos. <span className="h-dim">From one sentence.</span></h1>
            <p className="h-lead mt-6">BlinkSpot learns your brand once, then makes on-brand images, videos, voiceovers and captions for every channel. You see a preview before you pay for a video.</p>
            <div className="flex flex-wrap items-center gap-3 mt-9">
              <StartButton />
              <a href="#examples" className="h-btn ghost">See real examples</a>
            </div>
            <p className="text-[13px] h-muted mt-5">Free to start · No card needed · Prices on every button</p>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* Wall of work */}
      <section className="relative z-[2] grid gap-3.5 pb-8" aria-label="Made with BlinkSpot">
        <Marquee items={thumbs} />
        <Marquee items={[...thumbs].reverse()} reverse />
        <p className="h-wrap text-[12.5px] h-muted mt-3">Every picture on this page was made in BlinkSpot, for brands we made up to show you.</p>
      </section>

      {/* How it works */}
      <section id="how" className="h-section">
        <div className="h-wrap">
          <p className="h-eyebrow">How it works</p>
          <h2 className="h-h2 mt-4 max-w-[16ch]">Three steps. Then it&apos;s just you saying what you need.</h2>
          <div className="grid gap-20 md:gap-28 mt-16 md:mt-24">
            {STEPS.map((s, i) => (
              <div key={s.n} className={`h-reveal grid gap-8 md:gap-16 items-center md:grid-cols-[1fr_1.15fr] ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
                <div>
                  <span className="font-mono text-[13px]" style={{ color: "var(--s-accent)" }}>{s.n}</span>
                  <h3 className="text-[28px] md:text-[36px] font-semibold tracking-tight leading-tight mt-3">{s.title}</h3>
                  <p className="h-lead mt-4">{s.text}</p>
                </div>
                <StepVisual kind={s.visual} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="h-section h-divider">
        <div className="h-wrap">
          <div className="grid gap-6 md:grid-cols-[1fr_1fr] items-end">
            <div><p className="h-eyebrow">What you can make</p><h2 className="h-h2 mt-4">A whole studio. One brand kit.</h2></div>
            <p className="h-lead">Image Studio, Video Studio, an Editor with layers and AI, voiceovers and a brand builder. Each one already knows your colours, your products and your voice.</p>
          </div>
          <div className="grid gap-4 mt-14 md:grid-cols-12">
            {remixBefore && remix && (
              <div className="h-reveal md:col-span-7 h-panel overflow-hidden grid md:grid-cols-[1fr_1.05fr]">
                <div className="p-7 md:p-8 flex flex-col">
                  <Shuffle className="h-5 w-5" style={{ color: "var(--s-accent)" }} />
                  <h3 className="text-[22px] font-semibold tracking-tight mt-4">Inspo Remix</h3>
                  <p className="text-[14.5px] mt-2 leading-relaxed" style={{ color: "var(--s-soft)" }}>Drop a post you love from Pinterest or anywhere. Get the same feel with your product, your colours and your words. Drag the line to compare.</p>
                  <span className="h-chip mt-auto pt-0 w-fit" style={{ marginTop: 24 }}>18 credits · about 40 seconds</span>
                </div>
                <div className="relative min-h-[360px]"><BeforeAfter before={remixBefore.thumb ?? remixBefore.url} after={remix.thumb ?? remix.url} labelBefore="Found online" labelAfter="Your brand" /></div>
              </div>
            )}
            {pour && (
              <div className="h-reveal md:col-span-5 h-panel overflow-hidden flex flex-col">
                <div className="relative flex-1 min-h-[300px]"><LazyVideo src={pour.url} poster={pour.input} className="absolute inset-0 w-full h-full object-cover" /></div>
                <div className="p-6"><Clapperboard className="h-5 w-5" style={{ color: "#5EC8FF" }} /><h3 className="text-[19px] font-semibold tracking-tight mt-3">Your photo, moving</h3><p className="text-[14px] mt-1.5" style={{ color: "var(--s-soft)" }}>Steam, light, a hand, a slow push-in. From 20 credits.</p></div>
              </div>
            )}
            {talk && creator && (
              <div className="h-reveal md:col-span-5 h-panel overflow-hidden flex flex-col">
                <div className="relative flex-1 min-h-[320px] grid grid-cols-2 gap-1">
                  <LazyVideo src={talk.url} poster={talk.input} className="w-full h-full object-cover" />
                  <LazyVideo src={creator.url} poster={creator.input} className="w-full h-full object-cover" />
                </div>
                <div className="p-6"><Mic className="h-5 w-5" style={{ color: "#E68BFF" }} /><h3 className="text-[19px] font-semibold tracking-tight mt-3">Creators that talk</h3><p className="text-[14px] mt-1.5" style={{ color: "var(--s-soft)" }}>A face photo and a line of script, or your own recorded voice, becomes a talking video.</p></div>
              </div>
            )}
            {editorImg && (
              <div className="h-reveal md:col-span-7 h-panel overflow-hidden grid md:grid-cols-[1fr_200px]">
                <div className="relative min-h-[320px] p-6 grid place-items-center" style={{ background: "repeating-conic-gradient(#17191c 0% 25%, #121316 0% 50%) 50% / 22px 22px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editorImg.thumb ?? editorImg.url} alt="A poster open in the Editor" className="max-h-[300px] rounded-md shadow-2xl" style={{ outline: "1.5px solid var(--s-accent)", outlineOffset: 4 }} />
                </div>
                <div className="p-5 grid content-start gap-2" style={{ borderLeft: "1px solid var(--s-line)" }}>
                  <PenTool className="h-5 w-5" style={{ color: "#FF8A5C" }} />
                  <h3 className="text-[19px] font-semibold tracking-tight mt-1">The Editor</h3>
                  <p className="text-[13px]" style={{ color: "var(--s-soft)" }}>Layers, pen, shapes, real text. Remove a background, swap a face, turn a photo into vectors.</p>
                  <div className="grid gap-1 mt-2 text-[12px]">
                    {["Headline · KASI", "Date · Drop 01", "Sneaker (cut out)", "Background"].map((l, k) => <span key={l} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: k === 0 ? "color-mix(in oklab, var(--s-accent) 14%, transparent)" : "var(--s-bg)" }}><Layers className="h-3 w-3 h-muted" />{l}</span>)}
                  </div>
                </div>
              </div>
            )}
            <div className="h-reveal md:col-span-6 h-panel p-7">
              <Wand2 className="h-5 w-5" style={{ color: "var(--s-accent)" }} />
              <h3 className="text-[19px] font-semibold tracking-tight mt-3">No brand yet? Build one.</h3>
              <p className="text-[14px] mt-1.5" style={{ color: "var(--s-soft)" }}>Describe the business. Get names, colours, fonts, a voice and three logos you can edit. Free.</p>
              <div className="flex gap-3 mt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logos.map((l) => <img key={l.id} src={l.url} alt={l.title} className="h-20 w-20 md:h-24 md:w-24 rounded-2xl object-contain p-2" style={{ background: "#F5F3EF" }} />)}
              </div>
            </div>
            <div className="h-reveal md:col-span-6 h-panel p-7">
              <Languages className="h-5 w-5" style={{ color: "#5EC8FF" }} />
              <h3 className="text-[19px] font-semibold tracking-tight mt-3">Voiceovers, in your voice or ours</h3>
              <p className="text-[14px] mt-1.5 mb-3" style={{ color: "var(--s-soft)" }}>Ads, property tours, event promos. Press play.</p>
              {voices.map((v) => <VoiceRow key={v.id} src={v.url} title={v.title.replace("Voiceover: ", "")} script={v.prompt} voice={v.settings.voice ?? ""} />)}
            </div>
          </div>
        </div>
      </section>

      {/* Examples with recipes */}
      <section id="examples" className="h-section h-divider">
        <div className="h-wrap">
          <div className="grid gap-6 md:grid-cols-[1fr_1fr] items-end mb-12">
            <div><p className="h-eyebrow">Every example shows its recipe</p><h2 className="h-h2 mt-4">Click one. See exactly how it was made.</h2></div>
            <p className="h-lead">The prompt, the settings, the price and the photo it started from. Then make your own from it.</p>
          </div>
          <ExamplesGallery limit={12} />
        </div>
      </section>

      {/* Two speeds */}
      <section className="h-section h-divider">
        <div className="h-wrap">
          <p className="h-eyebrow">Two ways to work</p>
          <h2 className="h-h2 mt-4 max-w-[18ch]">Let it do the work, or take every control.</h2>
          <div className="grid gap-4 mt-14 md:grid-cols-[1.1fr_1fr]">
            <div className="h-reveal h-panel p-8 md:p-10" style={{ background: "radial-gradient(120% 120% at 0% 0%, color-mix(in oklab, var(--s-accent) 12%, transparent), transparent 55%), var(--s-panel)" }}>
              <Sparkles className="h-6 w-6" style={{ color: "var(--s-accent)" }} />
              <h3 className="text-[26px] font-semibold tracking-tight mt-5">Do it for me</h3>
              <p className="h-lead mt-3">Tell Ask BlinkSpot what you need: “plan my week”, “a poster for Saturday”, “make this punchier”. It plans, picks the model and shows the price. You press go.</p>
            </div>
            <div className="h-reveal h-panel p-8 md:p-10">
              <Wrench className="h-6 w-6" style={{ color: "var(--s-soft)" }} />
              <h3 className="text-[26px] font-semibold tracking-tight mt-5">I&apos;ll use the tools</h3>
              <p className="h-lead mt-3">Pick the exact model, aspect and length. Edit layers and timelines. Every setting is one click away, for designers and marketers who like control.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="h-section h-divider">
        <div className="h-wrap grid gap-10 md:grid-cols-[1fr_1.3fr]">
          <div><p className="h-eyebrow">Built for</p><h2 className="h-h2 mt-4">Whoever runs the posting.</h2></div>
          <div className="grid">
            {[
              { icon: Store, t: "Businesses", d: "Restaurants, shops, salons, property. Fresh posts every week without hiring a designer.", tags: ["Your products and prices", "WhatsApp to order"] },
              { icon: Users, t: "Agencies and freelancers", d: "Every client is its own brand. Approvals, archiving and swapping clients in and out of your plan.", tags: ["Up to 10 brands", "Client approvals"] },
              { icon: Mic, t: "Creators", d: "Talking videos, voiceovers and thumbnails that look like you, in your language.", tags: ["Lip-sync", "Your own voice"] },
            ].map((r) => (
              <div key={r.t} className="h-reveal grid gap-3 py-7" style={{ borderTop: "1px solid var(--s-line)" }}>
                <div className="flex items-center gap-3"><r.icon className="h-5 w-5" style={{ color: "var(--s-accent)" }} /><h3 className="text-[22px] font-semibold tracking-tight">{r.t}</h3></div>
                <p className="text-[15px]" style={{ color: "var(--s-soft)" }}>{r.d}</p>
                <div className="flex flex-wrap gap-1.5">{r.tags.map((t) => <span key={t} className="h-chip">{t}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="h-section h-divider">
        <div className="h-wrap grid gap-12 lg:grid-cols-[1fr_1.35fr]">
          <div>
            <p className="h-eyebrow">Pricing</p>
            <h2 className="h-h2 mt-4">Pay for what you make.</h2>
            <p className="h-lead mt-5">Every plan comes with credits. The price is on every button before you press it, and a failed render is refunded.</p>
            <div className="grid gap-2 mt-8 text-[14px]">
              {[["An image", "from 6 credits"], ["A 5-second video", "from 20 credits"], ["A voiceover", "1 credit"], ["Logos and brand building", "free"], ["Top up on Starter and up", `${TOP_UP.credits} credits for $${TOP_UP.usd}`]].map(([a, b]) => (
                <div key={a} className="flex justify-between py-2.5" style={{ borderBottom: "1px solid var(--s-line)" }}><span style={{ color: "var(--s-soft)" }}>{a}</span><span className="font-mono">{b}</span></div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLANS.map((p) => (
              <div key={p.name} className="h-reveal h-panel p-6 flex flex-col" style={p.pop ? { borderColor: "color-mix(in oklab, var(--s-accent) 55%, var(--s-line))" } : undefined}>
                <div className="flex items-center justify-between"><b className="text-[16px]">{p.name}</b>{p.pop && <span className="h-chip" style={{ height: 22, fontSize: 11, color: "var(--s-accent)" }}>Most teams</span>}</div>
                <div className="mt-4"><span className="text-[40px] font-semibold tracking-tight">{p.price}</span><span className="h-muted text-[13px]"> / month</span></div>
                <p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>{p.note}</p>
                <div className="grid gap-1.5 mt-5 text-[13.5px]">
                  {[p.brands, p.credits, "Every studio and the Editor"].map((f) => <span key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: "var(--s-accent)" }} />{f}</span>)}
                </div>
                <Link href="/get-started" className="h-btn ghost mt-6 justify-center" style={{ height: 44 }}>{p.price === "$0" ? "Start free" : `Choose ${p.name}`}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="h-section h-divider">
        <div className="h-wrap grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div><p className="h-eyebrow">Questions</p><h2 className="h-h2 mt-4">The short answers.</h2></div>
          <div>
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5" style={{ borderTop: "1px solid var(--s-line)" }}>
                <summary className="flex items-center justify-between cursor-pointer list-none text-[17px] font-medium">{f.q}<span className="h-8 w-8 rounded-full grid place-items-center transition-transform group-open:rotate-45" style={{ background: "var(--s-raised)" }}>+</span></summary>
                <p className="text-[15px] mt-3 leading-relaxed max-w-[62ch]" style={{ color: "var(--s-soft)" }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="h-section">
        <div className="h-wrap">
          <div className="h-panel p-10 md:p-16 relative overflow-hidden" style={{ background: "radial-gradient(80% 120% at 100% 0%, color-mix(in oklab, var(--s-accent) 16%, transparent), transparent 60%), var(--s-panel)" }}>
            <h2 className="h-h2 max-w-[14ch]">Your next post is one sentence away.</h2>
            <p className="h-lead mt-5">Set up your brand in two minutes. Your first images are on us.</p>
            <div className="flex flex-wrap gap-3 mt-9"><StartButton>Create your account</StartButton><Link href="/login" className="h-btn ghost">Sign in</Link></div>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
