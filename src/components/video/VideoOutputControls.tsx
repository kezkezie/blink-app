"use client";

import { useEffect } from "react";

/**
 * Registry-derived aspect / duration / cost controls, shared by every video setup.
 *
 * WHY THESE ARE SHARED
 * Each setup card used to hard-code its own `<option>` lists. The "Master AI
 * Engine" picker lets a user select ANY model in ANY mode, so those fixed lists
 * offered capabilities the selected model does not have. That is exactly how
 * 21:9 stayed on offer for Pruna: Video V3 forwards Pruna's aspect ratio verbatim
 * (`apiPayload.input.aspect_ratio = targetAspectRatio`), the value is not in the
 * provider's enum, and the request was charged upfront and then rejected with
 * HTTP 422 — the same charge -> 422 -> refund cycle Sora produced.
 *
 * Everything here reads `video-model-registry.ts`. Nothing is hard-coded, so a
 * capability correction in the registry reaches every surface at once.
 *
 * The estimate is DISPLAY ONLY; n8n computes and deducts the real amount.
 */

import {
  durationControlFor,
  allowedAspectRatiosFor,
  estimateVideoCredits,
  resolveEffectiveVideoModel,
  resolveVideoModel,
  routeVideoModelForFrames,
} from "@/lib/video-model-registry";

/** Mirrors n8n's dialogue surcharge trigger in `Parse Inputs & Calculate Cost`
 *  (`userPrompt.includes('"')`), so the shown estimate matches what is charged. */
export function promptImpliesAudio(prompt: string | null | undefined): boolean {
  return typeof prompt === "string" && prompt.includes('"');
}

export function AspectRatioSelect({
  model,
  videoMode,
  value,
  onChange,
  className,
}: {
  model: string | null | undefined;
  videoMode?: string | null;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const effective = resolveEffectiveVideoModel(model, videoMode ?? null);
  const options = allowedAspectRatiosFor(effective);
  return (
    <select
      data-testid="video-aspect-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title={`${resolveVideoModel(effective)?.label ?? effective} supports ${options.join(", ")}`}
    >
      {options.map((ar) => (
        <option key={ar} value={ar} className="bg-[#191D23]">
          📐 {ar}
        </option>
      ))}
    </select>
  );
}

/**
 * Duration picker that matches the model's PROVIDER SHAPE.
 *
 * A discrete model (Sora 4/8/12, Gemini 4/6/8/10) gets a select. A continuous
 * model (Pruna 1..20 whole seconds) gets a range control, so every renderable
 * length is reachable instead of the two arbitrary buttons the registry used to
 * list. The live credit readout updates as the range moves.
 */
export function DurationField({
  model,
  videoMode,
  value,
  onChange,
  hasAudio = false,
  hasStartFrame = true,
  className,
}: {
  model: string | null | undefined;
  videoMode?: string | null;
  value: string;
  onChange: (next: string) => void;
  hasAudio?: boolean;
  /** Every Video Studio mode starts from an image (actor, product, garment, storyboard frame). */
  hasStartFrame?: boolean;
  className?: string;
}) {
  const requested = resolveEffectiveVideoModel(model, videoMode ?? null);
  // The model that will actually render (Kling image-to-video falls back to Seedance 2.5).
  const effective = routeVideoModelForFrames(requested, { hasStartFrame, hasAudio });
  const rerouted = effective !== requested;
  const control = durationControlFor(effective);
  // A duration the rendering model cannot do would be rejected before billing: snap it.
  const allowed = control.kind === "range"
    ? (() => { const n = Number(value); return Number.isInteger(n) && n >= control.min && n <= control.max; })()
    : control.values.map(String).includes(String(value));
  const fallbackValue = control.kind === "range" ? String(control.min) : String(control.values[0]);
  useEffect(() => { if (!allowed) onChange(fallbackValue); }, [allowed, fallbackValue, onChange]);
  const reroutedNote = rerouted ? (
    <span className="text-[10px] text-[#989DAA]" data-testid="video-model-rerouted">
      Kling image-to-video is paused. Rendering on {resolveVideoModel(effective)?.label ?? effective}.
    </span>
  ) : null;

  if (control.kind === "range") {
    const seconds = Number(value);
    // A stale selection from another model is displayed at the range minimum
    // rather than silently submitted; the parent repairs it on model switch.
    const shown = Number.isInteger(seconds) && seconds >= control.min && seconds <= control.max
      ? seconds
      : control.min;
    const credits = estimateVideoCredits(effective, shown, { videoMode, hasAudio, hasStartFrame });
    return (
      <div
        data-testid="video-duration-range"
        className="flex items-center gap-2.5 rounded-xl border border-[#FFB300]/30 bg-[#191D23] px-3 h-10 shadow-sm"
        title={`${resolveVideoModel(effective)?.label ?? effective} renders ${control.min}-${control.max}s`}
      >
        <span className="text-xs font-bold text-[#FFB300] whitespace-nowrap tabular-nums" data-testid="video-duration-value">
          ⏱️ {shown}s
        </span>
        <input
          type="range"
          aria-label="Video duration in seconds"
          min={control.min}
          max={control.max}
          step={control.step}
          value={shown}
          onChange={(e) => onChange(String(Number(e.target.value)))}
          className="w-28 accent-[#FFB300] cursor-pointer"
        />
        {credits !== null && (
          <span className="text-[10px] font-bold text-[#B3FF00] whitespace-nowrap tabular-nums" data-testid="video-duration-credits">
            ≈ {credits} cr
          </span>
        )}
        {reroutedNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        data-testid="video-duration-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        title={`${resolveVideoModel(effective)?.label ?? effective} renders ${control.values.join(", ")}s`}
      >
        {control.values.map((secs) => {
          const credits = estimateVideoCredits(effective, secs, { videoMode, hasAudio, hasStartFrame });
          return (
            <option key={secs} value={secs} className="bg-[#191D23]">
              ⏱️ {secs} Secs{credits === null ? "" : ` · ${credits} cr`}
            </option>
          );
        })}
      </select>
      {reroutedNote}
    </div>
  );
}
