"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Clapperboard, Film, Loader2, Mic, Plus, RotateCcw, Scissors, Shirt, ShoppingBag, Sparkles, UserCircle, X } from "lucide-react";
import {
  AUTO_VIDEO_MODEL,
  VIDEO_MODEL_REGISTRY,
  estimateVideoCredits,
  reconcileAspectRatioFor,
  reconcileDurationFor,
  resolveEffectiveVideoModel,
  resolveVideoModel,
  routeVideoModelForFrames,
} from "@/lib/video-model-registry";
import { VIDEO_MODES } from "@/components/video/video-modes";
import { useVideoStudio, type VideoStudio } from "@/components/video/useVideoStudio";
import { VideoEditorUI } from "@/components/layout/VideoEditorUI";
import { UgcSetup } from "@/components/video/UgcSetup";
import { CinematicSetup } from "@/components/video/CinematicSetup";
import { ClothingSetup } from "@/components/video/ClothingSetup";
import { ProductRevealSetup } from "@/components/video/ProductRevealSetup";
import { StorytellingSetup } from "@/components/video/StorytellingSetup";
import { formatCredits, useCredits } from "@/components/studio/hooks";
import { queueForEditor } from "@/components/studio/queue-clips";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Content } from "@/types/database";
import { useAskStore } from "@/components/studio/ask-store";

/**
 * Video Studio, v2 layout over the same engine as the classic page (useVideoStudio).
 * Kezie's flow, kept: 1 pick a style → 2 direct it (a long video is a story split into scenes) →
 * 3 render → 4 put it together in the editor. Every dial the classic page has is still here;
 * the quality picker leads, exact models sit under "Pro".
 */

const STEP_LABELS = ["Style", "Direct", "Render", "Edit"] as const;

// Quality first; the model is named small. "auto" keeps n8n's own pick per style.
const QUALITY = [
  { id: AUTO_VIDEO_MODEL, label: "Auto", hint: "Best model for this style" },
  { id: "replicate:prunaai/p-video", label: "Draft", hint: "Cheap preview" },
  { id: "bytedance/seedance-2", label: "Standard", hint: "Seedance 2 · 720p" },
  { id: "bytedance/seedance-2-5", label: "Cinema", hint: "Seedance 2.5 · 1080p" },
];


function sceneCost(model: string, duration: string | undefined, mode: string, hasStartFrame: boolean) {
  return estimateVideoCredits(model, duration || "5", { videoMode: mode, hasStartFrame }) ?? 0;
}

function StepRail({ v, current }: { v: VideoStudio; current: number }) {
  const canGo = (n: number) => n === 1 || n === 4 || (n === 2 && current >= 2) || (n === 3 && v.step === 3);
  return (
    <div className="s-steps" role="navigation" aria-label="Steps">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        // In the editor, earlier steps only count as done if this session actually rendered something.
        const doneUpTo = v.activeTab === "editor" ? (v.generatedVideoUrl ? 3 : 0) : current - 1;
        const state = n === current ? "cur" : n <= doneUpTo ? "done" : "";
        return (
          <span key={label} className="contents">
            {i > 0 && <span className="s-step-sep" aria-hidden />}
            <button
              className={`s-step ${state}`}
              disabled={!canGo(n)}
              aria-current={n === current ? "step" : undefined}
              onClick={() => {
                if (n === 4) { v.setActiveTab("editor"); return; }
                v.setActiveTab("studio");
                if (n < 3 || v.step === 3) v.setStep(n);
              }}
            >
              <i>{state === "done" ? <Check className="h-3 w-3" /> : n}</i>{label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// The single-shot styles. Product reveal is not its own card: it is the "Reveal" side of Product shot
// (same inputs, same engine, a different direction), toggled on the next step.
const QUICK_SHOTS: Array<{ mode: string; title: string; line: string; icon: typeof Film }> = [
  { mode: "showcase", title: "Product shot", line: "Your product photo, a camera move or a reveal", icon: ShoppingBag },
  { mode: "ugc", title: "Creator talking", line: "A person talks about your product", icon: UserCircle },
  { mode: "clothing", title: "Try-on", line: "Your garment on a model", icon: Shirt },
];

function StylePicker({ v, onPick }: { v: VideoStudio; onPick: (mode: string) => void }) {
  return (
    <div className="max-w-[1100px] mx-auto">
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Make a video</h2>
      <p className="text-sm mb-6" style={{ color: "var(--s-soft)" }}>Most videos start here. Every setting can still be changed on the next step.</p>
      <button
        className="s-card w-full text-left p-6 mb-6 grid md:grid-cols-[1fr_auto] gap-4 items-center hover:border-[var(--s-line-2)] transition-colors"
        style={{ borderColor: "var(--s-line-2)" }}
        onClick={() => onPick("storytelling")}
      >
        <div>
          <div className="flex items-center gap-2 mb-2"><Clapperboard className="h-5 w-5" style={{ color: "var(--s-accent)" }} /><span className="s-badge">RECOMMENDED</span></div>
          <b className="text-lg font-semibold">Scene by scene</b>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--s-soft)" }}>
            Write the idea once. BlinkSpot splits it into scenes (one scene is fine for a single shot), each with a start frame you approve. Every scene can be a product shot, a reveal, a creator or a try-on. Then put them together in Edit.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs mono" style={{ color: "var(--s-mute)" }}>
          Idea <ChevronRight className="h-3 w-3" /> Scenes <ChevronRight className="h-3 w-3" /> Render <ChevronRight className="h-3 w-3" /> Edit
        </div>
      </button>
      <h3 className="s-section-h">Or a quick single shot</h3>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_SHOTS.map((m) => (
          <button key={m.mode} className="s-card text-left p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors" onClick={() => onPick(m.mode)}>
            <m.icon className="h-4 w-4" />
            <b className="text-sm font-medium">{m.title}</b>
            <span className="text-xs" style={{ color: "var(--s-mute)" }}>{m.line}</span>
            <span className="text-[11px] mono mt-auto pt-2" style={{ color: "var(--s-mute)" }}>5 s from {sceneCost(AUTO_VIDEO_MODEL, "5", m.mode, true)} cr</span>
          </button>
        ))}
        <Link href="/studio/library/upload?tab=audio_to_video" className="s-card text-left p-4 flex flex-col gap-2 hover:border-[var(--s-line-2)] transition-colors">
          <Mic className="h-4 w-4" />
          <b className="text-sm font-medium">Lip-sync to audio</b>
          <span className="text-xs" style={{ color: "var(--s-mute)" }}>Upload a voice track, a face speaks it</span>
        </Link>
      </div>
      <div className="mt-6 flex items-center gap-3 text-sm" style={{ color: "var(--s-soft)" }}>
        <Scissors className="h-4 w-4" /> Already have clips?
        <button className="s-btn sm" onClick={() => v.setActiveTab("editor")}>Open the editor</button>
      </div>
    </div>
  );
}

/** Product shot = Cinematic showcase (camera move) or Product reveal; same photo, one click apart. */
function ProductShotToggle({ v }: { v: VideoStudio }) {
  if (v.selectedMode !== "showcase" && v.selectedMode !== "logo_reveal") return null;
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="s-seg" role="tablist" aria-label="Product shot type">
        <button role="tab" aria-selected={v.selectedMode === "showcase"} onClick={() => v.setSelectedMode("showcase")}>Camera move</button>
        <button role="tab" aria-selected={v.selectedMode === "logo_reveal"} onClick={() => v.setSelectedMode("logo_reveal")}>Reveal</button>
      </div>
      <span className="text-xs" style={{ color: "var(--s-mute)" }}>
        {v.selectedMode === "showcase" ? "The camera moves around your product." : "Your product appears with a 3D or VFX reveal."}
      </span>
    </div>
  );
}

function EnginePicker({ v, pro }: { v: VideoStudio; pro: boolean }) {
  const pick = (id: string) => {
    v.setSelectedAiModel(id);
    // Same repair as the classic picker: never sit on an option the engine cannot render.
    v.setAspectRatio((cur: string) => reconcileAspectRatioFor(id, cur));
    v.setDuration((cur: string) => reconcileDurationFor(id, cur));
  };
  return (
    <div className="grid gap-1.5">
      {QUALITY.map((q) => (
        <button
          key={q.id}
          onClick={() => pick(q.id)}
          className="grid grid-cols-[1fr_auto] gap-x-3 text-left px-3 py-2.5 rounded-[10px]"
          style={{ border: `1px solid ${v.selectedAiModel === q.id ? "var(--s-accent)" : "var(--s-line-2)"}`, background: v.selectedAiModel === q.id ? "color-mix(in oklab, var(--s-accent) 6%, var(--s-bg))" : "var(--s-bg)" }}
        >
          <b className="text-[13px] font-semibold">{q.label}</b>
          <span className="text-xs mono text-right">{sceneCost(q.id, v.duration, v.selectedMode, true)} cr</span>
          <span className="text-[11.5px] col-span-2" style={{ color: "var(--s-mute)" }}>{q.hint} · {v.duration || 5} s</span>
        </button>
      ))}
      {pro && (
        <>
          <span className="s-label mt-3">Exact model</span>
          <select className="s-input" value={v.selectedAiModel} onChange={(e) => pick(e.target.value)} aria-label="Exact model">
            <option value={AUTO_VIDEO_MODEL}>Auto</option>
            {Object.values(VIDEO_MODEL_REGISTRY).map((m) => <option key={m.id} value={m.id}>{m.label} · {m.creditsPerSecond} cr/s</option>)}
          </select>
        </>
      )}
    </div>
  );
}

function Inspector({ v, total, effectiveModel, onRender }: { v: VideoStudio; total: number; effectiveModel: string; onRender: () => void }) {
  const [pro, setPro] = useState(false);
  const [open, setOpen] = useState<string | null>("quality");
  const { balance } = useCredits();
  const missingImage = !!v.activeModeConfig.primaryLabel && !v.primaryFile && !v.primaryPreview;
  const short = balance !== null && balance < total;
  // A render helper, not a component: a component declared here would remount its children every render.
  const row = (id: string, name: string, sum: string, children: React.ReactNode) => (
    <div className="s-acc" data-open={open === id}>
      <button onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
        <span className="ic"><Sparkles className="h-3.5 w-3.5" /></span>
        <span className="nm">{name}</span>
        <span className="sum">{sum}</span>
        <ChevronRight className="chev h-4 w-4" />
      </button>
      {open === id && <div className="b" style={{ paddingLeft: 14 }}>{children}</div>}
    </div>
  );
  const quality = QUALITY.find((q) => q.id === v.selectedAiModel)?.label ?? resolveVideoModel(v.selectedAiModel)?.label ?? "Auto";
  return (
    <aside className="flex flex-col min-h-0" style={{ background: "var(--s-panel)", borderLeft: "1px solid var(--s-line)" }}>
      <div className="flex items-center justify-between px-3.5 py-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
        <b className="text-[13px] font-semibold">Shot settings</b>
        <div className="s-seg">
          <button aria-pressed={!pro} onClick={() => setPro(false)}>Simple</button>
          <button aria-pressed={pro} onClick={() => setPro(true)}>Pro</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {row("quality", "Quality", quality, <EnginePicker v={v} pro={pro} />)}
        {row("format", "Format", `${v.aspectRatio} · ${v.duration || 5} s`,
          <p className="text-xs" style={{ color: "var(--s-soft)" }}>Set the shape and length in the setup on the left. The engine only offers what it can render.</p>)}
        {row("brand", "Brand lock", "On",
          <p className="text-xs" style={{ color: "var(--s-soft)" }}>Your brand&apos;s colours, look and voice are applied to every shot{v.activeBrand ? ` (${v.activeBrand.brand_name})` : ""}.</p>)}
        {pro && row("enhance", "Prompt enhance", v.aiEnhance ? "On" : "Off",
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={v.aiEnhance} onChange={(e) => v.setAiEnhance(e.target.checked)} style={{ accentColor: "var(--s-accent)" }} />
            Let the AI director improve the prompt
          </label>)}
        {!pro && (
          <div className="px-3.5 py-3 text-xs flex justify-between items-center" style={{ color: "var(--s-mute)", borderBottom: "1px solid var(--s-line)" }}>
            <span>More controls: exact model, prompt enhance</span>
            <button className="font-medium" style={{ color: "var(--s-accent)" }} onClick={() => setPro(true)}>Show</button>
          </div>
        )}
      </div>
      <div className="p-3.5 grid gap-2" style={{ borderTop: "1px solid var(--s-line)" }}>
        <div className="flex justify-between text-xs" style={{ color: "var(--s-soft)" }}>
          <span>{resolveVideoModel(effectiveModel)?.label ?? effectiveModel}</span>
          <span className="mono">{v.duration || 5} s</span>
        </div>
        <div className="flex justify-between text-[13px]"><span>Estimated total</span><b className="mono font-medium">{formatCredits(total)} cr</b></div>
        {short && <p className="text-xs" style={{ color: "var(--s-warn)" }}>You have {formatCredits(balance)} credits. <Link href="/studio/account/billing" className="underline">Top up</Link> or pick Draft.</p>}
        <button className="s-btn primary lg w-full" onClick={onRender} disabled={v.isGenerating || missingImage}>
          {v.isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Queuing…</> : <>Render video <span className="cost">{formatCredits(total)} cr</span></>}
        </button>
        {missingImage && <p className="text-xs text-center" style={{ color: "var(--s-mute)" }}>Add the {v.activeModeConfig.primaryLabel?.toLowerCase()} first.</p>}
        <p className="text-[11px] text-center" style={{ color: "var(--s-mute)" }}>Charged when the render starts. Failed renders are refunded.</p>
      </div>
    </aside>
  );
}

function SequenceBar({ v, total, onRender }: { v: VideoStudio; total: number; onRender: () => void }) {
  const seconds = v.bRollScenes.reduce((s, sc) => s + Number(sc.duration || 5), 0);
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap lg:flex-nowrap items-center gap-3 px-4 py-2.5"
      style={{ background: "color-mix(in oklab, var(--s-panel) 96%, transparent)", backdropFilter: "blur(10px)", borderTop: "1px solid var(--s-line)" }}>
      <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1" aria-label="Scenes in order">
        {v.bRollScenes.map((sc) => (
          <div key={sc.id} className="shrink-0 w-[112px] rounded-lg p-1" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line)" }}>
            <div className="rounded overflow-hidden aspect-video bg-black grid place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {sc.primaryPreview ? <img src={sc.primaryPreview} alt="" className="w-full h-full object-cover" /> : <span className="text-[9px] mono" style={{ color: "var(--s-mute)" }}>no frame yet</span>}
            </div>
            <div className="flex justify-between items-center px-0.5 pt-1 text-[10.5px]">
              <span>Scene {sc.scene_number}</span>
              <span className="mono" style={{ color: "var(--s-mute)" }}>{sc.duration || 5}s</span>
            </div>
          </div>
        ))}
        <button className="shrink-0 w-[72px] self-stretch rounded-lg grid place-items-center text-[11px]" style={{ border: "1px dashed var(--s-line-2)", color: "var(--s-mute)" }} onClick={v.addEmptyScene} aria-label="Add a scene">
          <span className="grid place-items-center gap-0.5"><Plus className="h-4 w-4" /> Scene</span>
        </button>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right leading-tight">
          <div className="text-sm">{v.bRollScenes.length} scene{v.bRollScenes.length === 1 ? "" : "s"} · {seconds} s</div>
          <div className="text-[11px]" style={{ color: "var(--s-mute)" }}>Renders each scene, then join them in Edit</div>
        </div>
        <button className="s-btn primary lg" onClick={onRender} disabled={v.isGenerating || v.bRollScenes.length === 0}>
          {v.isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Queuing…</> : <>Render all scenes <span className="cost">{formatCredits(total)} cr</span></>}
        </button>
      </div>
    </div>
  );
}

function RenderView({ v, renderStartedAt }: { v: VideoStudio; renderStartedAt: React.RefObject<string | null> }) {
  const [stacking, setStacking] = useState(false);
  async function putTogether() {
    if (v.selectedMode !== "storytelling" || !v.activeBrand) { v.setActiveTab("editor"); return; }
    setStacking(true);
    try {
      // Every scene this render made, oldest first (= scene order).
      const since = renderStartedAt.current ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("content")
        .select("caption, image_urls, video_urls, reference_image_url, created_at")
        .eq("brand_id", v.activeBrand.id)
        .eq("content_type", "sequence_clip")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      const n = await queueForEditor((data ?? []) as unknown as Content[]);
      if (n === 0) toast.info("The scenes are still rendering. They'll be in the editor's Scenes tab when ready.");
    } finally {
      setStacking(false);
      v.setActiveTab("editor");
    }
  }
  const reset = () => {
    v.setStep(1);
    v.setPrimaryFile(null);
    v.setSecondaryFile(null);
    v.setPrompt("");
    v.setBRollScenes([]);
    v.setGeneratedVideoUrl(null);
    v.setGeneratingPostId(null);
    v.setGenerationError(null);
    v.setIsGenerating(false);
  };
  const story = v.selectedMode === "storytelling";
  return (
    <div className="max-w-[880px] mx-auto">
      {v.generationError ? (
        <div className="s-card p-8 text-center">
          <div className="h-12 w-12 rounded-full grid place-items-center mx-auto mb-4" style={{ background: "color-mix(in oklab, var(--s-danger) 15%, transparent)", color: "var(--s-danger)" }}><X className="h-6 w-6" /></div>
          <h2 className="text-lg font-semibold">The render failed</h2>
          <p className="text-sm mt-2 mb-6" style={{ color: "var(--s-soft)" }}>{v.generationError}</p>
          <p className="text-xs mb-6" style={{ color: "var(--s-mute)" }}>If credits were taken, they are refunded automatically.</p>
          <button className="s-btn" onClick={() => { v.setStep(2); v.setGenerationError(null); v.setGeneratingPostId(null); v.setIsGenerating(false); }}><ArrowLeft className="h-4 w-4" /> Back to settings</button>
        </div>
      ) : !v.generatedVideoUrl ? (
        <div className="s-card p-8">
          <div className="aspect-video rounded-xl grid place-items-center mb-5" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line)" }}>
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--s-accent)" }} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <b className="text-[15px] font-semibold" role="status" aria-live="polite">{v.progressText}</b>
              <p className="text-xs mt-1" style={{ color: "var(--s-mute)" }}>{story ? "Your scenes render in parallel. " : ""}Usually 3 to 10 minutes. You can leave this page; it lands in your Library.</p>
            </div>
            <Link href="/studio/library" className="s-btn ghost">Library</Link>
          </div>
          <div className="h-1 rounded mt-4 overflow-hidden" style={{ background: "var(--s-line)" }}><i className="block h-full w-1/3 animate-pulse" style={{ background: "var(--s-accent)" }} /></div>
        </div>
      ) : (
        <div className="s-card p-4">
          <video src={v.generatedVideoUrl} controls autoPlay className="w-full rounded-xl bg-black" style={{ maxHeight: "62vh" }} />
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="s-badge ok">READY</span>
            <span className="text-sm" style={{ color: "var(--s-soft)" }}>Saved to your Library.</span>
            <div className="flex-1" />
            <button className="s-btn ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Make another</button>
            <button className="s-btn primary" onClick={putTogether} disabled={stacking}>
              {stacking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />} {story ? "Put the scenes together" : "Open in editor"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoStudioInner() {
  const v = useVideoStudio();
  const params = useSearchParams();
  const router = useRouter();
  const { ask } = useAskStore();
  const applied = useRef(false);
  const renderStartedAt = useRef<string | null>(null);
  const autoScenes = useRef(false);
  const render = () => {
    renderStartedAt.current = new Date(Date.now() - 5000).toISOString();
    void v.handleGenerate();
  };

  const chooseMode = (id: string) => {
    v.setSelectedMode(id);
    v.setPrimaryFile(null);
    v.setPrimaryPreview(null);
    v.setPrompt("");
    v.setBRollScenes([]);
    v.setAspectRatio(id === "ugc" ? "9:16" : "16:9");
    v.setStep(2);
  };

  // Deep links from Create, the Library and Ask BlinkSpot: ?mode=&brief=&aspect=&start=&tab=editor
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (params.get("tab") === "editor") { v.setActiveTab("editor"); return; }
    const mode = params.get("mode");
    if (!mode || !VIDEO_MODES.some((m) => m.id === mode)) return;
    chooseMode(mode);
    const brief = params.get("brief")?.slice(0, 1200);
    if (brief) {
      if (mode === "storytelling") { v.setBRollConcept(brief); autoScenes.current = true; }
      else v.setPrompt(brief);
    }
    const aspect = params.get("aspect");
    if (aspect && ["9:16", "16:9", "1:1", "4:5"].includes(aspect)) v.setAspectRatio(reconcileAspectRatioFor(v.selectedAiModel, aspect));
    const start = params.get("start");
    if (start && /^https:\/\//.test(start)) v.setPrimaryPreview(start);
    router.replace("/studio/video", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A brief from Create or Ask turns into scenes straight away (text only, no credits); the user
  // then approves the start frames. Waits until the empty scene slots exist so it can fill them.
  const generateScenes = useRef(v.handleGenerateScenes);
  useEffect(() => { generateScenes.current = v.handleGenerateScenes; });
  useEffect(() => {
    if (!autoScenes.current || !v.bRollConcept.trim() || v.isSuggesting) return;
    if (v.bRollScenes.some((sc) => sc.prompt?.trim())) { autoScenes.current = false; return; }
    // The flag is cleared when the timer fires (a re-render before then must not cancel it twice).
    const t = setTimeout(() => {
      if (!autoScenes.current) return;
      autoScenes.current = false;
      void generateScenes.current();
    }, 300);
    return () => clearTimeout(t);
  }, [v.bRollConcept, v.bRollScenes, v.isSuggesting]);

  const story = v.selectedMode === "storytelling";
  const hasStart = !!(v.primaryFile || v.primaryPreview);
  const effectiveModel = routeVideoModelForFrames(resolveEffectiveVideoModel(v.selectedAiModel, v.selectedMode), { hasStartFrame: hasStart });
  const total = useMemo(() => {
    if (story) {
      return v.bRollScenes.reduce((sum, sc) => {
        const model = sc.aiModel && sc.aiModel !== "auto" ? sc.aiModel : v.selectedAiModel;
        return sum + sceneCost(model, sc.duration || v.duration, sc.mode, !!(sc.primaryPreview || sc.primaryFile));
      }, 0);
    }
    return sceneCost(v.selectedAiModel, v.duration, v.selectedMode, hasStart);
  }, [story, v.bRollScenes, v.selectedAiModel, v.duration, v.selectedMode, hasStart]);

  if (!v.activeBrand) {
    return (
      <div className="p-6"><div className="s-empty"><h3>Pick a brand first</h3><p className="text-sm">Video Studio works for one brand at a time. Use the switcher at the top right.</p></div></div>
    );
  }

  const current = v.activeTab === "editor" ? 4 : v.step;
  const sharedProps = {
    primaryFile: v.primaryFile, setPrimaryFile: v.setPrimaryFile, primaryPreview: v.primaryPreview, setPrimaryPreview: v.setPrimaryPreview,
    primaryInputRef: v.primaryInputRef, handleFileSelect: v.handleFileSelect, secondaryFile: v.secondaryFile, setSecondaryFile: v.setSecondaryFile,
    secondaryPreview: v.secondaryPreview, setSecondaryPreview: v.setSecondaryPreview, secondaryInputRef: v.secondaryInputRef,
    prompt: v.prompt, setPrompt: v.setPrompt, isSuggesting: v.isSuggesting, handleAISuggest: v.handleAISuggest,
    activeModeConfig: v.activeModeConfig, aspectRatio: v.aspectRatio, setAspectRatio: v.setAspectRatio, duration: v.duration, setDuration: v.setDuration,
    aiModel: v.selectedAiModel, videoMode: v.selectedMode, aiEnhance: v.aiEnhance, setAiEnhance: v.setAiEnhance,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const setup = (() => {
    switch (v.selectedMode) {
      case "ugc": return <UgcSetup {...sharedProps} />;
      case "showcase": return <CinematicSetup {...sharedProps} />;
      case "clothing": return <ClothingSetup {...sharedProps} />;
      case "logo_reveal": return <ProductRevealSetup {...sharedProps} />;
      case "storytelling":
        return (
          <StorytellingSetup
            {...sharedProps}
            hideSheetMode
            bRollConcept={v.bRollConcept} setBRollConcept={v.setBRollConcept}
            bRollScenes={v.bRollScenes} setBRollScenes={v.setBRollScenes}
            handleGenerateScenes={v.handleGenerateScenes} addEmptyScene={v.addEmptyScene}
            updateScene={v.updateScene} removeScene={v.removeScene}
          />
        );
      default: return null;
    }
  })();

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 56px)" }}>
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-3" style={{ borderBottom: "1px solid var(--s-line)" }}>
        <StepRail v={v} current={current} />
        <div className="flex-1" />
        {current === 2 && <span className="text-xs" style={{ color: "var(--s-mute)" }}>{v.activeModeConfig.title}</span>}
        {v.activeTab === "editor" ? (
          <button className="s-btn ai sm" onClick={() => ask("")}>Edit with AI</button>
        ) : (
          <button className="s-btn ai sm" onClick={() => ask(story ? "Help me plan the scenes for my video" : "Help me write a better prompt for this shot")}>Ask for help</button>
        )}
      </div>

      {v.activeTab === "editor" ? (
        <div className="p-3"><VideoEditorUI variant="studio" /></div>
      ) : v.step === 1 ? (
        <div className="p-4 md:p-8"><StylePicker v={v} onPick={chooseMode} /></div>
      ) : v.step === 2 ? (
        story ? (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4 md:p-5">{setup}</div>
            <SequenceBar v={v} total={total} onRender={render} />
          </div>
        ) : (
          <div className="flex-1 grid lg:grid-cols-[1fr_336px] min-h-0">
            <div className="p-4 md:p-5 min-w-0"><ProductShotToggle v={v} />{setup}</div>
            <Inspector v={v} total={total} effectiveModel={effectiveModel} onRender={render} />
          </div>
        )
      ) : (
        <div className="p-4 md:p-8"><RenderView v={v} renderStartedAt={renderStartedAt} /></div>
      )}
    </div>
  );
}

export default function StudioVideoPage() {
  return (
    <Suspense fallback={<div className="p-6"><div className="s-skel h-64" /></div>}>
      <VideoStudioInner />
    </Suspense>
  );
}
