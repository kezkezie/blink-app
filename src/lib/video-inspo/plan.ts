/**
 * What Claude sends back for Video Inspo, checked before anyone sees it (pure, unit tested).
 * "remake": the video rebuilt shot by shot for the brand, for the Storyboard.
 * "edit": the video's editing (cut lengths, words on screen) to apply to the user's own clips.
 */
export const SCENE_MODES = ["showcase", "ugc", "logo_reveal", "kling_keyframe", "clothing"] as const;
export type SceneMode = (typeof SCENE_MODES)[number];

export type InspoScene = { shot: number; shots: number[]; seconds: number; what: string; prompt: string; text: string; mode: SceneMode };
/** kind "motion": the reference is motion graphics or animation (2026-10-21), so it can be made as motion graphics instead. */
export type InspoPlan = { title: string; kind: "footage" | "motion"; concept: string; cast: string; why: string[]; style: { look: string; pace: string; camera: string; music: string; text: string }; hook: string; scenes: InspoScene[]; caption: string };

export type EditText = { at: number; duration: number; text: string; y: number; size: "big" | "medium" | "small"; style: "caption" | "plain" };
export type EditRecipe = { title: string; pace: string; cuts: number[]; texts: EditText[]; aspect: "9:16" | "1:1" | "16:9"; why: string[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };

export function validatePlan(raw: unknown, shotCount: number): InspoPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).slice(0, 10).map((x, i): InspoScene | null => {
    if (!x || typeof x !== "object") return null;
    const s = x as Record<string, unknown>;
    const prompt = str(s.prompt, 600);
    if (prompt.length < 15) return null;
    const mode = (SCENE_MODES as readonly string[]).includes(String(s.mode)) ? (s.mode as SceneMode) : "showcase";
    const shot = Math.round(num(s.shot, 1, Math.max(1, shotCount), i + 1));
    const shots = [...new Set((Array.isArray(s.shots) ? s.shots : [shot]).map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= Math.max(1, shotCount)))].sort((a, b) => a - b);
    return { shot: shots[0] ?? shot, shots: shots.length ? shots : [shot], seconds: Math.round(num(s.seconds, 0.5, 15, 3) * 10) / 10, what: str(s.what, 200), prompt, text: str(s.text, 80), mode };
  }).filter((s): s is InspoScene => !!s);
  if (scenes.length < 1) return null;
  const st = (o.style && typeof o.style === "object" ? o.style : {}) as Record<string, unknown>;
  return {
    title: str(o.title, 80) || "Your version",
    kind: o.kind === "motion" ? "motion" : "footage",
    concept: str(o.concept, 240),
    cast: str(o.cast, 300),
    why: (Array.isArray(o.why) ? o.why : []).map((w) => str(w, 200)).filter(Boolean).slice(0, 4),
    style: { look: str(st.look, 200), pace: str(st.pace, 120), camera: str(st.camera, 200), music: str(st.music, 120), text: str(st.text, 160) },
    hook: str(o.hook, 160),
    scenes,
    caption: str(o.caption, 400),
  };
}

export function validateRecipe(raw: unknown, duration: number): EditRecipe | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cuts = (Array.isArray(o.cuts) ? o.cuts : []).map((c) => Math.round(num(c, 0.3, 15, 2) * 10) / 10).slice(0, 60);
  if (!cuts.length) return null;
  const texts = (Array.isArray(o.texts) ? o.texts : []).slice(0, 30).map((x): EditText | null => {
    if (!x || typeof x !== "object") return null;
    const t = x as Record<string, unknown>;
    const text = str(t.text, 60);
    if (!text) return null;
    return {
      at: Math.round(num(t.at, 0, Math.max(1, duration), 0) * 10) / 10,
      duration: Math.round(num(t.duration, 0.4, 8, 1.5) * 10) / 10,
      text, y: Math.round(num(t.y, 8, 92, 50)),
      size: t.size === "big" || t.size === "small" ? t.size : "medium",
      style: t.style === "plain" ? "plain" : "caption",
    };
  }).filter((t): t is EditText => !!t);
  const aspect = o.aspect === "1:1" || o.aspect === "16:9" ? o.aspect : "9:16";
  return { title: str(o.title, 80) || "Edit like the inspo", pace: str(o.pace, 120), cuts, texts, aspect, why: (Array.isArray(o.why) ? o.why : []).map((w) => str(w, 200)).filter(Boolean).slice(0, 4) };
}

/** Where the Storyboard picks up a Video Inspo plan (one handoff, then it's cleared). */
export const INSPO_HANDOFF_KEY = "blink-video-inspo-plan";
/** Where the Editor finds the inspo's rhythm for "Cut like your inspo" (per brand, kept). */
export const inspoPatternKey = (brandId: string) => `blink-video-inspo-pattern::${brandId}`;

export type InspoPattern = { title: string; scenes: number; aspect?: "9:16" | "1:1" | "16:9"; cuts: Array<{ scene: number; seconds: number }>; texts: Array<{ at: number; duration: number; text: string }> };

/**
 * The inspo's edit, in scene numbers: which scene plays in each of its shots, for how long, and
 * when its words appear. A shot no scene claims goes to the scene with the nearest shot.
 */
export function inspoPattern(plan: InspoPlan, shots: Array<{ start: number; end: number }>, aspect?: InspoPattern["aspect"]): InspoPattern {
  const owner = (j: number) => {
    const exact = plan.scenes.findIndex((sc) => sc.shots.includes(j));
    if (exact >= 0) return exact;
    let best = 0, gap = Infinity;
    plan.scenes.forEach((sc, k) => sc.shots.forEach((n) => { if (Math.abs(n - j) < gap) { gap = Math.abs(n - j); best = k; } }));
    return best;
  };
  const cuts = shots.map((sh, i) => ({ scene: owner(i + 1), seconds: Math.round((sh.end - sh.start) * 100) / 100 })).filter((c) => c.seconds > 0.1);
  const texts: InspoPattern["texts"] = [];
  const said = new Set<number>();
  shots.forEach((sh, i) => {
    const k = owner(i + 1);
    const text = plan.scenes[k]?.text;
    if (text && !said.has(k)) { said.add(k); texts.push({ at: Math.round(sh.start * 100) / 100, duration: Math.max(1.2, Math.round((sh.end - sh.start) * 100) / 100), text }); }
  });
  return { title: plan.title, scenes: plan.scenes.length, ...(aspect ? { aspect } : {}), cuts, texts };
}
