import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: {} }));
import { needsRescue, rescuePlan, specFromScene, specFromShot, validVideoSpec } from "@/lib/video-rescue";
import { looksReadable, pictureKind } from "@/lib/image-refs";
import { PREVIEW_SCRIPT, previewDoc } from "@/lib/sites/code";

/** Videos that arrive and pictures the providers can read (2026-10-18). */
const scene = {
  post_id: "p", client_id: "c", aspect_ratio: "9:16", video_resolution: "1080p", ai_model_override: "bytedance/seedance-2",
  scene_data: { visual_prompt: "A mechanic finds the part on his phone", duration: "5", frames: { start_frame: "https://x/start.jpg", end_frame: null }, audio: { script: "Right part. Right now." } },
};

describe("video second tries", () => {
  it("keeps what a second try needs from a Storyboard scene and a single shot", () => {
    expect(specFromScene(scene)).toEqual({ prompt: "A mechanic finds the part on his phone", start: "https://x/start.jpg", end: null, seconds: 5, aspect: "9:16", resolution: "1080p", model: "bytedance/seedance-2", audio: true });
    expect(specFromScene({ scene_data: { visual_prompt: "  " } })).toBeNull();
    expect(specFromShot({ user_prompt: "Slow push in on the bottle", primary_image_url: "https://x/a.png", secondary_image_url: "javascript:x", duration: 8, ai_model_override: "replicate:prunaai/p-video" }))
      .toMatchObject({ start: "https://x/a.png", end: null, seconds: 8, model: "replicate:prunaai/p-video" });
  });

  it("moves Kie scenes to Seedance 2.0 on Replicate and Draft scenes to Pruna, with its filter on", () => {
    const seedance = rescuePlan(specFromScene(scene)!);
    expect(seedance.model).toBe("bytedance/seedance-2.0");
    expect(seedance.input).toMatchObject({ duration: 5, resolution: "1080p", aspect_ratio: "9:16", image: "https://x/start.jpg", generate_audio: true });
    const long = rescuePlan({ ...specFromScene(scene)!, seconds: 30, aspect: "5:4", model: "bytedance/seedance-2-5" });
    expect(long.input).toMatchObject({ duration: 15, aspect_ratio: "adaptive" });
    const draft = rescuePlan({ ...specFromScene(scene)!, model: "replicate:prunaai/p-video", start: null });
    expect(draft.model).toBe("prunaai/p-video");
    expect(draft.input).toMatchObject({ disable_safety_filter: false, aspect_ratio: "9:16" });
    expect(draft.input).not.toHaveProperty("image");
  });

  it("retries only a refunded provider failure, once, with a spec", () => {
    const job = { video_job: validVideoSpec(specFromScene(scene)) };
    const base = { generation_state: "failed", generation_error_code: "provider_failure", billing_state: "refunded", generation_attempt: 1, creation_metadata: job };
    expect(needsRescue(base)).toBe(true);
    expect(needsRescue({ ...base, generation_error_code: "stale_reconciled", billing_state: "not_charged" })).toBe(true);
    expect(needsRescue({ ...base, generation_error_code: "invalid_request" })).toBe(false);
    expect(needsRescue({ ...base, billing_state: "refund_failed" })).toBe(false); // money still stuck: don't charge again
    expect(needsRescue({ ...base, generation_attempt: 2 })).toBe(false);
    expect(needsRescue({ ...base, creation_metadata: { ...job, video_rescue: { state: "failed" } } })).toBe(false);
    expect(needsRescue({ ...base, creation_metadata: {} })).toBe(false);
    expect(needsRescue({ ...base, generation_state: "generating" })).toBe(false);
  });
});

describe("pictures the providers can read", () => {
  it("knows a file by its bytes", () => {
    expect(pictureKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(pictureKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
    expect(pictureKind(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
    expect(pictureKind(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(pictureKind(new TextEncoder().encode("GIF89a"))).toBe("gif");
    expect(pictureKind(new TextEncoder().encode("hello"))).toBe("other");
  });

  it("lets JPEG and PNG names through without a download", () => {
    expect(looksReadable("https://x.supabase.co/a/logo.PNG")).toBe(true);
    expect(looksReadable("https://x.supabase.co/a/photo.jpeg?v=2")).toBe(true);
    expect(looksReadable("https://x.supabase.co/a/logo_1792329486022.svg")).toBe(false);
    expect(looksReadable("https://x/a.webp")).toBe(false);
    expect(looksReadable("https://res.cloudinary.com/x/image/upload/f_auto,q_auto/v1/a.jpg")).toBe(false);
  });
});

describe("website preview links", () => {
  it("keeps links on the page and ships before the page's own scripts", () => {
    const doc = previewDoc("<!doctype html><html><head><script>window.x=1</script></head><body></body></html>");
    expect(doc.indexOf(PREVIEW_SCRIPT)).toBeGreaterThan(-1);
    expect(doc.indexOf(PREVIEW_SCRIPT)).toBeLessThan(doc.indexOf("window.x=1"));
    expect(PREVIEW_SCRIPT).toContain('window.open(h,"_blank","noopener")');
  });
});
