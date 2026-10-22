import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { validateNanoVideoPayload, parseVideoWorkflowRequest, VIDEO_MODES } from "@/lib/video-execution";
import { videoModelIds, resolveVideoModel } from "@/lib/video-model-registry";

/**
 * Every AI-video feature must get past the app's own validation boundary (Kezie, 2026-10-22:
 * "all the features for the AI videos ... make sure that they all work"). A feature the boundary
 * rejects is dead before any provider is reached. This is the free guard; the live sweep renders.
 * It caught lip-sync (audio_to_video) being 400'd at the boundary.
 */
const MODELS = videoModelIds().filter((m) => m !== "auto");

/** A duration every model can render (sora is 4/8/12, gemini 4/6/8/10, the rest a range). */
function okDuration(model: string): string {
  const spec = resolveVideoModel(model);
  const values = spec?.providerDurationValues;
  if (values?.length) return String(values[0]);
  const range = spec?.providerDurationRange;
  return String(range ? Math.max(range[0], 5) : 5);
}

describe("video features pass the execution boundary", () => {
  it("every model is accepted by the scene route (showcase) at a duration it can render", () => {
    for (const m of MODELS) {
      const ok = validateNanoVideoPayload({ mode: "scene_video_generator", post_id: randomUUID(), client_id: randomUUID(), ai_model_override: m, aspect_ratio: "16:9", scene_data: { visual_prompt: "a shot", video_mode: "showcase", duration: okDuration(m) } });
      expect(ok, `scene route rejected ${m}`).toBe(true);
    }
  });

  it("the Story-by-scene modes are accepted by the single-shot route", () => {
    for (const vm of [...VIDEO_MODES]) {
      const p = parseVideoWorkflowRequest({ client_id: randomUUID(), brand_id: randomUUID(), post_id: randomUUID(), video_mode: vm, primary_image_url: "https://x/y.jpg", user_prompt: "hi", is_sequence: false, ai_model_override: "bytedance/seedance-2", duration: "5", aspect_ratio: "16:9", strict_brand_alignment: true });
      expect(p, `single-shot route rejected mode ${vm}`).not.toBeNull();
    }
  });

  it("lip-sync (audio_to_video) is accepted — the mode LipSyncSetup actually sends", () => {
    const ok = validateNanoVideoPayload({ mode: "scene_video_generator", post_id: randomUUID(), client_id: randomUUID(), ai_model_override: "bytedance/seedance-2", primary_image_url: "https://x/y.jpg", user_prompt: "hi", duration: "5", video_mode: "audio_to_video", scene_data: { ai_enhance: true, audio: { audio_url: "https://x/a.wav" } } });
    expect(ok, "lip-sync audio_to_video rejected at the boundary").toBe(true);
  });
});
