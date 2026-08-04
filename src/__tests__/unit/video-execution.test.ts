import { describe, expect, it } from "vitest";
import {
  parseVideoSuggestRequest,
  parseVideoStoryboardRequest,
  parseVideoSuggestFrameRequest,
  parseTtsRequest,
  parseVideoWorkflowRequest,
  validateNanoVideoPayload,
} from "@/lib/video-execution";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const HTTPS = "https://cdn.example/asset.png";

describe("parseVideoSuggestRequest", () => {
  it("accepts a valid body and defaults mode to showcase", () => {
    expect(parseVideoSuggestRequest({ userConcept: "a calm hero shot" })).toEqual({
      mode: "showcase", companyName: "", industry: "", description: "", userConcept: "a calm hero shot",
    });
  });
  it("rejects an unknown mode", () => {
    expect(parseVideoSuggestRequest({ mode: "hacker" })).toBeNull();
  });
  it("rejects unknown fields", () => {
    expect(parseVideoSuggestRequest({ userConcept: "x", evil: true })).toBeNull();
  });
  it("rejects an overlong concept", () => {
    expect(parseVideoSuggestRequest({ userConcept: "x".repeat(4001) })).toBeNull();
  });
});

describe("parseVideoStoryboardRequest", () => {
  it("accepts a valid concept", () => {
    expect(parseVideoStoryboardRequest({ concept: "escape story", brandName: "Acme", industry: "Retail" }))
      .toEqual({ concept: "escape story", brandName: "Acme", industry: "Retail" });
  });
  it("rejects a missing/empty concept", () => {
    expect(parseVideoStoryboardRequest({ brandName: "Acme" })).toBeNull();
    expect(parseVideoStoryboardRequest({ concept: "   " })).toBeNull();
  });
  it("rejects an overlong concept and unknown fields", () => {
    expect(parseVideoStoryboardRequest({ concept: "x".repeat(4001) })).toBeNull();
    expect(parseVideoStoryboardRequest({ concept: "ok", extra: 1 })).toBeNull();
  });
});

describe("parseVideoSuggestFrameRequest", () => {
  it("accepts a concept and rejects extras/oversize/empty", () => {
    expect(parseVideoSuggestFrameRequest({ concept: "a cat" })).toEqual({ concept: "a cat" });
    expect(parseVideoSuggestFrameRequest({ concept: "a cat", x: 1 })).toBeNull();
    expect(parseVideoSuggestFrameRequest({ concept: "x".repeat(4001) })).toBeNull();
    expect(parseVideoSuggestFrameRequest({})).toBeNull();
  });
});

describe("parseTtsRequest", () => {
  it("accepts text and a known voice, defaulting to onyx", () => {
    expect(parseTtsRequest({ text: "hello" })).toEqual({ text: "hello", voice: "onyx" });
    expect(parseTtsRequest({ text: "hello", voice: "nova" })).toEqual({ text: "hello", voice: "nova" });
  });
  it("rejects unknown voice, empty text, oversize text, and unknown fields", () => {
    expect(parseTtsRequest({ text: "hello", voice: "darth" })).toBeNull();
    expect(parseTtsRequest({ text: "" })).toBeNull();
    expect(parseTtsRequest({ text: "x".repeat(4001) })).toBeNull();
    expect(parseTtsRequest({ text: "hi", evil: 1 })).toBeNull();
  });
});

describe("parseVideoWorkflowRequest (blink-generate-video-v1)", () => {
  const valid = {
    client_id: CLIENT_ID, brand_id: BRAND_ID, post_id: POST_ID,
    video_mode: "ugc", primary_image_url: HTTPS, secondary_image_url: null,
    user_prompt: "a warm hero shot", is_sequence: false, brand_name: "Acme",
    brand_info: "we sell blankets", ai_model_override: "kling-3.0/video",
    duration: "10", strict_brand_alignment: true, aspect_ratio: "9:16", ai_enhance: true,
  };

  it("accepts a full valid payload and keeps identity separate", () => {
    const parsed = parseVideoWorkflowRequest(valid);
    expect(parsed).not.toBeNull();
    expect(parsed!.requestedClientId).toBe(CLIENT_ID);
    expect(parsed!.requestedBrandId).toBe(BRAND_ID);
    expect(parsed!.postId).toBe(POST_ID);
    expect(parsed!.payload.video_mode).toBe("ugc");
    expect(parsed!.payload.duration).toBe("10");
    expect(parsed!.payload.primary_image_url).toBe(HTTPS);
    // Absent optional URL is not forwarded.
    expect("secondary_image_url" in parsed!.payload).toBe(false);
  });

  it("accepts the minimal agent payload (standard mode, no brand)", () => {
    const parsed = parseVideoWorkflowRequest({ client_id: CLIENT_ID, post_id: POST_ID, user_prompt: "hi", video_mode: "standard" });
    expect(parsed).not.toBeNull();
    expect(parsed!.requestedBrandId).toBeUndefined();
  });

  it("accepts gemini durations and the Kling premium 300", () => {
    expect(parseVideoWorkflowRequest({ ...valid, ai_model_override: "gemini-omni-video", duration: "8" })).not.toBeNull();
    expect(parseVideoWorkflowRequest({ ...valid, duration: "300" })).not.toBeNull();
  });

  it("rejects unknown fields (closed key set)", () => {
    expect(parseVideoWorkflowRequest({ ...valid, webhook_url: "https://evil" })).toBeNull();
  });
  it("rejects an unknown video_mode", () => {
    expect(parseVideoWorkflowRequest({ ...valid, video_mode: "exfiltrate" })).toBeNull();
  });
  it("rejects an unknown model", () => {
    expect(parseVideoWorkflowRequest({ ...valid, ai_model_override: "gpt-secret" })).toBeNull();
  });
  it("rejects an invalid duration and aspect ratio", () => {
    expect(parseVideoWorkflowRequest({ ...valid, duration: "7" })).toBeNull();
    expect(parseVideoWorkflowRequest({ ...valid, aspect_ratio: "5:5" })).toBeNull();
  });
  it("rejects a non-https / malformed image URL", () => {
    expect(parseVideoWorkflowRequest({ ...valid, primary_image_url: "http://cdn.example/x.png" })).toBeNull();
    expect(parseVideoWorkflowRequest({ ...valid, primary_image_url: "javascript:alert(1)" })).toBeNull();
  });
  it("rejects an overlong prompt and a non-uuid identity", () => {
    expect(parseVideoWorkflowRequest({ ...valid, user_prompt: "x".repeat(8001) })).toBeNull();
    expect(parseVideoWorkflowRequest({ ...valid, brand_id: "not-a-uuid" })).toBeNull();
  });
  it("rejects a non-boolean flag", () => {
    expect(parseVideoWorkflowRequest({ ...valid, ai_enhance: "yes" })).toBeNull();
  });
});

describe("validateNanoVideoPayload (nano-banana video modes)", () => {
  it("accepts a director payload with no scene_data", () => {
    expect(validateNanoVideoPayload({ mode: "director", prompt: "write a story", style: "Anime" })).toBe(true);
  });

  it("accepts a full scene_video_generator payload", () => {
    expect(validateNanoVideoPayload({
      ai_model_override: "bytedance/seedance-2", aspect_ratio: "16:9", video_resolution: "720p",
      referenceVideoUrl: HTTPS,
      scene_data: {
        visual_prompt: "a dramatic reveal", video_mode: "showcase", duration: "5",
        frames: { start_frame: HTTPS, end_frame: null },
      },
    })).toBe(true);
  });

  it("accepts the '1K' resolution and 21:9 aspect used by the storyboard sheet", () => {
    expect(validateNanoVideoPayload({ aspect_ratio: "21:9", video_resolution: "1K" })).toBe(true);
  });

  it("rejects an unknown model / aspect / resolution", () => {
    expect(validateNanoVideoPayload({ ai_model_override: "secret-model" })).toBe(false);
    expect(validateNanoVideoPayload({ aspect_ratio: "100:1" })).toBe(false);
    expect(validateNanoVideoPayload({ video_resolution: "8K" })).toBe(false);
  });

  it("rejects an unknown scene video_mode and invalid duration", () => {
    expect(validateNanoVideoPayload({ scene_data: { video_mode: "exfiltrate" } })).toBe(false);
    expect(validateNanoVideoPayload({ scene_data: { duration: "99" } })).toBe(false);
  });

  it("rejects an unsafe frame or reference URL", () => {
    expect(validateNanoVideoPayload({ referenceVideoUrl: "http://evil/x.mp4" })).toBe(false);
    expect(validateNanoVideoPayload({ scene_data: { frames: { start_frame: "ftp://evil/x" } } })).toBe(false);
  });

  it("rejects an overlong prompt", () => {
    expect(validateNanoVideoPayload({ prompt: "x".repeat(8001) })).toBe(false);
    expect(validateNanoVideoPayload({ scene_data: { visual_prompt: "x".repeat(8001) } })).toBe(false);
  });

  it("rejects a non-object scene_data", () => {
    expect(validateNanoVideoPayload({ scene_data: "not-an-object" })).toBe(false);
  });
});
