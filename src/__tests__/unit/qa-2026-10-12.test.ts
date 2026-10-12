import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { estimateVideoCredits } from "@/lib/video-model-registry";
import { promptImpliesAudio } from "@/components/video/VideoOutputControls";
import { finishedVideoUrl } from "@/components/video/useVideoStudio";
import { adaptRecipePrompt } from "@/lib/examples/adapt";
import { canonicalIndustry } from "@/lib/brand-dna";
import { cloudinaryConformUrl, needsConform } from "@/lib/video/conform-frame";
import { voiceoverCredits } from "@/lib/voiceover";
import { parseConcepts } from "@/lib/assisted-creation";
import { STORYBOARD_FRAME_CREDITS } from "@/lib/image-engine-pricing";

/** Fixes from the live audit of 2026-10-12 (references/qa-reports/2026-10-12-live-audit). */
describe("QA-023 · the quote includes speech, like n8n's charge", () => {
  it("a quoted line on Pruna adds the audio rate: 5 s is 40, not 20", () => {
    const prompt = 'A chef presents the dish and says "Fresh food, made with care."';
    expect(promptImpliesAudio(prompt)).toBe(true);
    expect(estimateVideoCredits("replicate:prunaai/p-video", 5, { videoMode: "ugc", hasStartFrame: true, hasAudio: promptImpliesAudio(prompt) })).toBe(40);
    expect(estimateVideoCredits("replicate:prunaai/p-video", 5, { videoMode: "ugc", hasStartFrame: true, hasAudio: false })).toBe(20);
  });
});

describe("QA-013 · a finished render shows its video", () => {
  it("reads video_urls (array or JSON), then video_url, then image_urls", () => {
    expect(finishedVideoUrl({ video_urls: ["https://x/v.mp4"], image_urls: [] })).toBe("https://x/v.mp4");
    expect(finishedVideoUrl({ video_urls: '["https://x/j.mp4"]' })).toBe("https://x/j.mp4");
    expect(finishedVideoUrl({ video_urls: [], video_url: "https://x/one.mp4" })).toBe("https://x/one.mp4");
    expect(finishedVideoUrl({ image_urls: ["https://x/legacy.mp4"] })).toBe("https://x/legacy.mp4");
    expect(finishedVideoUrl({ video_urls: [], image_urls: [] })).toBeNull();
  });
});

describe("QA-014 · start frames fitted to the chosen shape", () => {
  it("only when the photo is more than 3% off the shape", () => {
    expect(needsConform(832, 1088, "16:9")).toBe(true);
    expect(needsConform(1920, 1080, "16:9")).toBe(false);
    expect(needsConform(1080, 1920, "9:16")).toBe(false);
    expect(needsConform(960, 960, "9:16")).toBe(true);
  });
  it("Cloudinary pads to the shape on a blurred copy in the URL; other hosts are done in the browser", () => {
    expect(cloudinaryConformUrl("https://res.cloudinary.com/a/image/upload/v1/x.jpg", "16:9")).toBe("https://res.cloudinary.com/a/image/upload/c_pad,ar_16:9,b_blurred:400:15,q_auto:good,f_jpg/v1/x.jpg");
    expect(cloudinaryConformUrl("https://hzk.supabase.co/storage/v1/object/public/assets/x.jpg", "16:9")).toBeNull();
  });
});

describe("QA-018 · a recipe opens for your brand", () => {
  it("drops the example brand's rules, swaps its name (keeping capitals) and cuts at a word", () => {
    const prompt = 'CRITICAL BRAND CONSTRAINT: This content belongs to the brand "Mavuno". Any visible text or signage MUST reflect "Mavuno" only. No other brand names, no website URLs, no placeholder logos. render "MAVUNO" in bold deep-green serif, upper-left. A Mavuno bottle on ice.';
    const r = adaptRecipePrompt(prompt, "Mama Njeri Kitchen");
    expect(r.from).toBe("Mavuno");
    expect(r.text).not.toMatch(/CRITICAL BRAND CONSTRAINT|Mavuno/i);
    expect(r.text).toBe('render "MAMA NJERI KITCHEN" in bold deep-green serif, upper-left. A Mama Njeri Kitchen bottle on ice.');
    const long = adaptRecipePrompt("word ".repeat(400), "X", 100).text;
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/wor…$/);
  });
});

describe("QA-007 · ideas are cut at a word, with an ellipsis", () => {
  it("a long idea ends on a whole word", () => {
    const idea = `${"Steaming ugali and sukuma wiki on a carved wooden board ".repeat(10)}against the deep green ocean`;
    const parsed = parseConcepts({ concepts: [1, 2, 3].map((n) => ({ title: `T${n}`, idea, angle: "warm", format: "image" })) });
    expect(parsed?.[0].idea.endsWith("…")).toBe(true);
    expect(parsed?.[0].idea.length).toBeLessThanOrEqual(420);
    expect(parsed?.[0].idea).not.toMatch(/\s\S{1,2}…$/);
  });
});

describe("QA-010 · an industry in other words is the matching option", () => {
  it("case, 'and' and punctuation don't matter", () => {
    expect(canonicalIndustry("Retail & E-Commerce")).toBe("Retail & e-commerce");
    expect(canonicalIndustry("food and drink")).toBe("Food & drink");
    expect(canonicalIndustry("Space tourism")).toBe("Space tourism");
    expect(canonicalIndustry(null)).toBe("");
  });
});

describe("QA-021 · voiceovers", () => {
  it("1 credit per started 300 characters, at least 1", () => {
    expect(voiceoverCredits(0)).toBe(1);
    expect(voiceoverCredits(120)).toBe(1);
    expect(voiceoverCredits(300)).toBe(1);
    expect(voiceoverCredits(301)).toBe(2);
    expect(voiceoverCredits(3000)).toBe(10);
  });
});

describe("QA-017 · storyboard frames priced as charged", () => {
  it("the frame workflow deducts a flat 5", () => expect(STORYBOARD_FRAME_CREDITS).toBe(5));
});
