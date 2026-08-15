"use client";

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
  className,
}: {
  model: string | null | undefined;
  videoMode?: string | null;
  value: string;
  onChange: (next: string) => void;
  hasAudio?: boolean;
  className?: string;
}) {
  const effective = resolveEffectiveVideoModel(model, videoMode ?? null);
  const control = durationControlFor(effective);

  if (control.kind === "range") {
    const seconds = Number(value);
    // A stale selection from another model is displayed at the range minimum
    // rather than silently submitted; the parent repairs it on model switch.
    const shown = Number.isInteger(seconds) && seconds >= control.min && seconds <= control.max
      ? seconds
      : control.min;
    const credits = estimateVideoCredits(effective, shown, { videoMode, hasAudio });
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
      </div>
    );
  }

  return (
    <select
      data-testid="video-duration-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title={`${resolveVideoModel(effective)?.label ?? effective} renders ${control.values.join(", ")}s`}
    >
      {control.values.map((secs) => {
        const credits = estimateVideoCredits(effective, secs, { videoMode, hasAudio });
        return (
          <option key={secs} value={secs} className="bg-[#191D23]">
            ⏱️ {secs} Secs{credits === null ? "" : ` · ${credits} cr`}
          </option>
        );
      })}
    </select>
  );
}
