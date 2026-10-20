import { describe, expect, it } from "vitest";
import { ON_BRAND_RULES, fallbackVideoPrompt, validVideoPrompt, videoPromptUser } from "@/lib/video-prompt";

/** Video prompts written in the app (2026-10-20): never a refusal, inside the brand's world when asked. */
describe("video prompts", () => {
  it("never passes a refusal or a note on as the prompt", () => {
    const fb = fallbackVideoPrompt("Close-up of a brake disc", "LADI APP", "Auto parts marketplace");
    expect(validVideoPrompt("I'm sorry, but I can't fulfill that request without specific reference images.", fb)).toEqual({ prompt: fb, written: false });
    expect(validVideoPrompt("", fb).written).toBe(false);
    expect(validVideoPrompt("Too short.", fb).written).toBe(false);
    const swapped = validVideoPrompt("The scene's perfume bottle doesn't fit an auto parts brand, so I'm swapping in the brand's own product. A mechanic's gloved hand sprays brake cleaner over a polished steel disc, a fine mist catching a warm key light, slow push-in, one continuous take.", fb);
    expect(swapped.written).toBe(true);
    expect(swapped.prompt).not.toMatch(/swapping|doesn't fit|I'm/);
    expect(swapped.prompt.startsWith("A mechanic's gloved hand")).toBe(true);
    const line = validVideoPrompt('A mechanic wipes his hands and smiles at the car owner in a busy garage, warm afternoon light, handheld. He says "I\'m glad we found the part in time." Slow push-in.', fb);
    expect(line.prompt).toContain('He says "I\'m glad we found the part in time."');
  });

  it("names the brand's world on the fallback and in the request", () => {
    expect(fallbackVideoPrompt("A busy garage at dawn", "LADI APP", "Auto parts")).toBe("A busy garage at dawn This is an ad for LADI APP, Auto parts: everything shown belongs to that world.");
    expect(fallbackVideoPrompt("A busy garage at dawn", "LADI APP", "Auto parts", false)).toBe("A busy garage at dawn");
    const on = videoPromptUser({ scene: "A hand presses a perfume bottle", brand: "Name: LADI APP", onBrand: true, seconds: 5, hasStartFrame: false });
    expect(on).toContain(ON_BRAND_RULES);
    expect(on).toContain("No start frame");
    expect(videoPromptUser({ scene: "x", brand: "Name: LADI", onBrand: false, seconds: 5, hasStartFrame: true })).toContain("No brand rules");
  });
});

describe("scenes without words (2026-10-20)", () => {
  it("writes a usable scene for a lip-sync, a product, an outfit or a photo", async () => {
    const { sceneWithoutWords, IMAGE_MODES, validVideoPrompt } = await import("@/lib/video-prompt");
    for (const [mode, frame, audio, want] of [["audio_to_video", true, true, /speaks/], ["showcase", true, false, /product/], ["clothing", true, false, /outfit/], ["standard", true, false, /start frame/], [undefined, false, false, /brand/]] as const) {
      const scene = sceneWithoutWords(mode, frame, audio);
      expect(scene).toMatch(want);
      expect(validVideoPrompt(scene, "x").written).toBe(true);
    }
    expect(IMAGE_MODES.has("xray_image")).toBe(true);
    expect(IMAGE_MODES.has("showcase")).toBe(false);
  });
});

