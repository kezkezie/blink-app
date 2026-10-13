"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Clapperboard, Copy, Film, Link2, Loader2, Scissors, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useCredits } from "@/components/studio/hooks";
import { readVideo, type VideoReading } from "@/lib/video-inspo/analyze";
import { INSPO_HANDOFF_KEY, inspoPattern, inspoPatternKey, type InspoPlan } from "@/lib/video-inspo/plan";

/**
 * Video Inspo (Kezie, 2026-10-12: "the inspo for stealing videos ... replicate the video but for our
 * own brand"). The browser reads the video (shots and one still each); Claude explains why it works
 * and rebuilds it shot by shot for the brand; one button turns that into Storyboard scenes.
 */
const MAX_MB = 150;

export function VideoInspo() {
  const router = useRouter();
  const { activeBrand } = useBrandStore();
  const { balance, refresh } = useCredits();
  const [src, setSrc] = useState<{ url: string; name: string } | null>(null);
  const [link, setLink] = useState("");
  const [purpose, setPurpose] = useState("");
  const [stage, setStage] = useState<null | "reading" | "thinking">(null);
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState<VideoReading | null>(null);
  const [plan, setPlan] = useState<InspoPlan | null>(null);
  const [credits, setCredits] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = activeBrand?.brand_name || "your brand";

  useEffect(() => () => { if (src?.url.startsWith("blob:")) URL.revokeObjectURL(src.url); }, [src]);

  function takeFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("That isn't a video file."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`That video is over ${MAX_MB} MB. Trim it first.`); return; }
    setPlan(null); setReading(null);
    setSrc({ url: URL.createObjectURL(f), name: f.name });
  }
  function takeLink() {
    const url = link.trim();
    if (!/^https:\/\/\S+$/.test(url)) { toast.error("Paste a full https link to a video file."); return; }
    if (/tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com/i.test(url)) {
      toast.info("Those apps don't let other sites read their videos. Save the video to your phone (Share > Save video), then drop the file here.", { duration: 9000 });
      return;
    }
    setPlan(null); setReading(null);
    setSrc({ url, name: url.split("/").pop()?.split("?")[0] || "video" });
    setLink("");
  }

  async function run() {
    if (!src || !activeBrand) return;
    try {
      setStage("reading"); setProgress(0);
      const r = reading ?? await readVideo(src.url, setProgress);
      setReading(r);
      setStage("thinking");
      const res = await fetch("/api/inspo/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "remake", shots: r.shots.map(({ start, end, data }) => ({ start, end, data })), duration: r.duration, width: r.width, height: r.height, brandId: activeBrand.id, purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.plan) throw new Error(data.error || "Couldn't read that video.");
      setPlan(data.plan); setCredits(data.credits ?? 0);
      void refresh?.();
      toast.success(`Read ${r.shots.length} shot${r.shots.length === 1 ? "" : "s"} · ${data.credits} credits`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't read that video."); }
    finally { setStage(null); }
  }

  function toStoryboard() {
    if (!plan || !reading) return;
    const aspect: "9:16" | "16:9" | "1:1" = reading.height > reading.width * 1.15 ? "9:16" : reading.width > reading.height * 1.15 ? "16:9" : "1:1";
    try {
      sessionStorage.setItem(INSPO_HANDOFF_KEY, JSON.stringify({ plan, aspect, at: Date.now() }));
      // The rhythm, for the Editor's "Cut like your inspo" once the scenes are rendered.
      if (activeBrand) localStorage.setItem(inspoPatternKey(activeBrand.id), JSON.stringify(inspoPattern(plan, reading.shots, aspect)));
    } catch { toast.error("Couldn't hand the plan over. Try again."); return; }
    router.push("/studio/video?mode=storytelling&from=inspo");
  }

  const words = plan?.scenes.filter((s) => s.text).map((s) => s.text) ?? [];

  return (
    <div className="max-w-[1180px] mx-auto p-4 md:p-8">
      <Link href="/studio/video" className="s-btn ghost sm -ml-2 mb-3"><ArrowLeft className="h-3.5 w-3.5" /> Video Studio</Link>
      <div className="mb-6">
        <span className="s-badge" style={{ background: "color-mix(in oklab, var(--s-accent) 16%, transparent)", color: "var(--s-accent)" }}>VIDEO INSPO</span>
        <h2 className="text-[26px] md:text-[30px] font-semibold tracking-tight mt-3">Seen a video you love? Make it yours.</h2>
        <p className="text-sm mt-1.5 max-w-2xl" style={{ color: "var(--s-soft)" }}>Drop in a Reel, TikTok or ad you like. BlinkSpot reads it shot by shot (the hook, the pace, the camera moves, the look) and rebuilds it for {name}: your products, your place, your words. Then you render the scenes and finish it in the Editor.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="s-card p-4 grid gap-3 content-start">
          <span className="s-label" style={{ margin: 0 }}>1 · Your inspo video</span>
          {src ? (
            <div className="relative rounded-xl overflow-hidden" style={{ background: "#000" }}>
              <video src={src.url} controls playsInline muted className="w-full max-h-[460px] object-contain" crossOrigin="anonymous" />
              <button className="s-btn sm absolute top-2 right-2" onClick={() => { setSrc(null); setReading(null); setPlan(null); }} aria-label="Remove the video"><X className="h-3.5 w-3.5" /> Change</button>
            </div>
          ) : (
            <>
              <button className="rounded-xl grid place-items-center text-center p-10 gap-2" style={{ border: "1.5px dashed var(--s-line-2)", background: "var(--s-bg)" }}
                onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); takeFile(e.dataTransfer.files?.[0]); }}>
                <Upload className="h-6 w-6" style={{ color: "var(--s-soft)" }} />
                <b className="text-[15px]">Drop a video here</b>
                <span className="text-[12.5px]" style={{ color: "var(--s-mute)" }}>MP4 or MOV, up to 90 seconds are read · it stays on your device; only stills are sent</span>
              </button>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); takeLink(); }}>
                <div className="relative flex-1">
                  <Link2 className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--s-mute)" }} />
                  <input className="s-input" style={{ paddingLeft: 30 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="…or paste a link to a video file (.mp4)" aria-label="Video link" data-no-mic />
                </div>
                <button className="s-btn" type="submit" disabled={!link.trim()}>Use link</button>
              </form>
              <p className="text-[11.5px]" style={{ color: "var(--s-mute)" }}>From TikTok or Instagram: tap Share, Save video, then drop the file here.</p>
            </>
          )}
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <div className="s-card p-4 grid gap-4 content-start">
          <label className="grid gap-1.5">
            <span className="s-label" style={{ margin: 0 }}>2 · What&apos;s it for? (optional)</span>
            <input className="s-input" value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} placeholder={`e.g. Launch of our new menu at ${name}`} aria-label="What is it for" />
          </label>
          <ul className="grid gap-2 text-[12.5px]" style={{ color: "var(--s-soft)" }}>
            <li className="flex gap-2"><Film className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} /> Finds every cut and reads one still per shot.</li>
            <li className="flex gap-2"><Sparkles className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} /> Explains why it works, then plans the same video for {name}.</li>
            <li className="flex gap-2"><Clapperboard className="h-4 w-4 shrink-0" style={{ color: "var(--s-ai)" }} /> One click puts the scenes in the Storyboard. Rendering is priced there, as usual.</li>
          </ul>
          <button className="s-btn primary lg w-full" disabled={!src || !!stage || !activeBrand} onClick={run}>
            {stage === "reading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading the shots · {Math.round(progress * 100)}%</>
              : stage === "thinking" ? <><Loader2 className="h-4 w-4 animate-spin" /> Planning it for {name}…</>
              : <><Sparkles className="h-4 w-4" /> {plan ? "Read it again" : `Remake it for ${name}`} <span className="cost">up to 30 cr</span></>}
          </button>
          <p className="text-[11px] text-center" style={{ color: "var(--s-mute)" }}>{balance !== null && balance < 30 ? "You need a few more credits for this: get more in Billing." : "Charged for what the reading costs, usually 5-15 credits. Your inspo is a reference only: the result uses your brand, never their logo, faces or words."}</p>
        </div>
      </div>

      {plan && reading && (
        <section className="mt-8 grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-[20px] font-semibold">{plan.title}</h3>
              {plan.hook && <p className="text-[13px] mt-1" style={{ color: "var(--s-soft)" }}>Your hook: {plan.hook}</p>}
            </div>
            <span className="text-[12px] mono" style={{ color: "var(--s-mute)" }}>{reading.shots.length} shots · {reading.duration.toFixed(0)} s · {credits} cr</span>
          </div>
          {plan.why.length > 0 && (
            <div className="s-card p-4 grid gap-2">
              <span className="s-label" style={{ margin: 0 }}>Why it works</span>
              <ul className="grid gap-1.5">{plan.why.map((w) => <li key={w} className="text-[13px] flex gap-2" style={{ color: "var(--s-soft)" }}><span style={{ color: "var(--s-accent)" }}>•</span>{w}</li>)}</ul>
              <div className="flex flex-wrap gap-1.5 mt-1">{Object.entries(plan.style).filter(([, v]) => v).map(([k, v]) => <span key={k} className="s-badge" title={v}>{k}: {v.length > 38 ? `${v.slice(0, 37)}…` : v}</span>)}</div>
            </div>
          )}
          <div className="grid gap-2">
            {plan.scenes.map((s, i) => {
              const shot = reading.shots[Math.min(reading.shots.length - 1, s.shot - 1)];
              return (
                <div key={i} className="s-card p-3 grid gap-3 items-center" style={{ gridTemplateColumns: "minmax(0,150px) 20px minmax(0,1fr)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/jpeg;base64,${shot.data}`} alt={`Inspo shot ${s.shot}`} className="w-full rounded-lg object-cover" style={{ aspectRatio: `${reading.width || 9} / ${reading.height || 16}`, maxHeight: 180 }} />
                  <ArrowRight className="h-4 w-4" style={{ color: "var(--s-mute)" }} />
                  <div className="grid gap-1 min-w-0">
                    <span className="text-[11px] mono" style={{ color: "var(--s-mute)" }}>Scene {i + 1} · {s.seconds} s on screen · {s.mode.replace("_", " ")}{s.shots.length > 1 ? ` · cut into shots ${s.shots.join(", ")}` : ""}</span>
                    <b className="text-[13.5px]">{s.what || "Scene"}</b>
                    <span className="text-[12.5px]" style={{ color: "var(--s-soft)" }}>{s.prompt}</span>
                    {s.text && <span className="s-badge self-start" title="Add these words in the Editor (AI video can't spell)">On screen: “{s.text}”</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {plan.caption && <div className="s-card p-4 text-[13px]" style={{ color: "var(--s-soft)" }}><span className="s-label" style={{ margin: 0 }}>Caption</span><p className="mt-1">{plan.caption}</p></div>}
          <div className="flex flex-wrap gap-2">
            <button className="s-btn primary" onClick={toStoryboard}><Clapperboard className="h-4 w-4" /> Make it in the Storyboard</button>
            {words.length > 0 && <button className="s-btn" onClick={() => { void navigator.clipboard.writeText(words.join("\n")).then(() => toast.success("On-screen words copied")); }}><Copy className="h-4 w-4" /> Copy the on-screen words</button>}
            <Link href="/studio/video?tab=editor" className="s-btn ghost"><Scissors className="h-4 w-4" /> Or edit my own clips like it</Link>
          </div>
          <p className="text-[12px]" style={{ color: "var(--s-mute)" }}>Each scene renders once (about 5 s). After rendering, press Put them together, then in the Editor&apos;s AI tools use Cut like your inspo: it cuts your scenes into the same rhythm and adds the words, spelled right.</p>
        </section>
      )}
    </div>
  );
}
