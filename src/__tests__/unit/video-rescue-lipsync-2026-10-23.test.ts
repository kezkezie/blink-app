import { describe, expect, it } from "vitest";
import { specFromScene } from "@/lib/video-rescue";

/**
 * A failed lip-sync must not get a plain-video second try (2026-10-23 review). The scene route
 * writes a "speaks to camera" visual_prompt for every scene, so a lip-sync used to get a rescue spec
 * with no face (it comes in primary_image_url) and no voice (an audio file, not a script): the second
 * try made a silent stranger talking, and charged for it.
 */
describe("no second try for scenes a plain video model can't redo", () => {
  // What /api/video/nano-banana forwards for a lip-sync, after it writes the prompt.
  const lipsync = {
    mode: "scene_video_generator", video_mode: "audio_to_video", ai_model_override: "bytedance/seedance-2",
    primary_image_url: "https://x/face.jpg", duration: "5",
    scene_data: { visual_prompt: "The person in the start frame speaks naturally to the camera.", ai_enhance: false, audio: { audio_url: "https://x/voice.wav" } },
  };
  it("lip-sync gets no rescue spec", () => expect(specFromScene(lipsync)).toBeNull());
  it("an audio file anywhere means no rescue spec, whatever the mode says", () =>
    expect(specFromScene({ ...lipsync, video_mode: "showcase" })).toBeNull());
  it("motion copied from a reference gets no rescue spec", () => {
    expect(specFromScene({ ...lipsync, video_mode: "motion_transfer", scene_data: { visual_prompt: "move like the reference" } })).toBeNull();
    expect(specFromScene({ scene_data: { visual_prompt: "brush it", video_mode: "motion_brush" } })).toBeNull();
  });
  it("an ordinary scene still gets one", () =>
    expect(specFromScene({ ai_model_override: "bytedance/seedance-2", scene_data: { visual_prompt: "A slow push-in on the product", video_mode: "showcase", duration: "5", frames: { start_frame: "https://x/s.jpg" } } })).toMatchObject({ start: "https://x/s.jpg", audio: false }));
});
