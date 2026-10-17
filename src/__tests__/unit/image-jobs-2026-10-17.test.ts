import { describe, expect, it } from "vitest";
import { FINAL_FAILURE, STATUS, classifyRouter, jobSpecFrom, jobView, rescueCredits, validJobSpec } from "@/lib/image-jobs";

/** Images that arrive (2026-10-17): read the router's answer, retry what can be retried, say it plainly. */
describe("the router's answer", () => {
  it("keeps the picture", () => {
    expect(classifyRouter(200, { success: true, imageUrls: ["https://res.cloudinary.com/x/a.jpg"] })).toEqual({ kind: "image", urls: ["https://res.cloudinary.com/x/a.jpg"] });
    expect(classifyRouter(200, { imageUrls: "https://res.cloudinary.com/x/b.jpg" })).toEqual({ kind: "image", urls: ["https://res.cloudinary.com/x/b.jpg"] });
  });

  it("stops on a refusal or a low balance (another try wouldn't help)", () => {
    expect(classifyRouter(200, { success: false, reason: "safety", message: "The safety filter refused this one." })).toEqual({ kind: "refused", message: "The safety filter refused this one." });
    expect(classifyRouter(200, { success: false, message: "Insufficient credits. Please upgrade your plan or buy a top-up." }).kind).toBe("no_credits");
  });

  it("retries everything else, including n8n being down or not connected", () => {
    expect(classifyRouter(200, { success: false, reason: "timeout", message: "too slow" })).toEqual({ kind: "retry", why: "timeout" });
    expect(classifyRouter(200, { success: false, reason: "generation_failed" }).kind).toBe("retry");
    expect(classifyRouter(200, { success: true }).kind).toBe("retry"); // answered, but no picture
    expect(classifyRouter(502, "Bad Gateway").kind).toBe("retry");
    expect(classifyRouter(403, null).kind).toBe("retry");
    expect(classifyRouter(null, null).kind).toBe("retry");
    expect(classifyRouter(200, { imageUrls: ["javascript:alert(1)"] }).kind).toBe("retry");
  });

  it("waits when the router is still working past our budget (it saves onto the post itself)", () => {
    expect(classifyRouter(null, null, true)).toEqual({ kind: "waiting" });
  });
});

describe("the second try", () => {
  it("costs what the first would have, never more than Nano Banana 2", () => {
    expect(rescueCredits("nb2")).toBe(18);
    expect(rescueCredits("nano-banana-2")).toBe(18);
    expect(rescueCredits("gpt-image-2-image-to-image")).toBe(6);
    expect(rescueCredits("z-image")).toBe(1);
    expect(rescueCredits("unknown-engine")).toBe(8);
  });

  it("keeps what it needs from the request", () => {
    const spec = jobSpecFrom({ prompt: "short", assembled_prompt: "the full designed prompt", reference_image_urls: ["https://a/logo.png", "https://a/logo.png", "http://insecure"], input_urls: ["https://a/ref.jpg"], aspect_ratio: "9:16", imageEngine: "gpt-image-2-image-to-image" });
    expect(spec).toEqual({ prompt: "the full designed prompt", references: ["https://a/logo.png", "https://a/ref.jpg"], aspect: "9:16", engine: "gpt-image-2-image-to-image" });
    expect(validJobSpec(spec)).toEqual(spec);
    expect(validJobSpec({ prompt: "", aspect: "1:1", engine: "nb2" })).toBeNull();
    expect(jobSpecFrom({ topic: "a launch post" }).aspect).toBe("4:5");
  });
});

describe("what the browser sees", () => {
  it("is done, still making, or failed with a plain reason", () => {
    expect(jobView({ id: "a", image_urls: ["https://x/1.jpg"], generation_state: "generating" })).toMatchObject({ state: "done", url: "https://x/1.jpg" });
    expect(jobView({ id: "b", image_urls: [], generation_state: "generating", generation_status_text: STATUS.rescue, generation_attempt: 2 })).toMatchObject({ state: "making", text: STATUS.rescue, attempt: 2 });
    expect(jobView({ id: "c", generation_state: "failed", generation_status_text: FINAL_FAILURE(18) })).toMatchObject({ state: "failed", text: expect.stringContaining("Your credits are back") });
    expect(FINAL_FAILURE(0)).not.toContain("credits are back");
  });
});
