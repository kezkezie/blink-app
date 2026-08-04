import { describe, expect, it } from "vitest";
import { buildLogoPrompt } from "@/lib/logo-generation";

describe("buildLogoPrompt", () => {
  it("returns null without a name", () => {
    expect(buildLogoPrompt({ name: "" })).toBeNull();
    expect(buildLogoPrompt({ name: "   " })).toBeNull();
  });

  it("always renders the brand name as a quoted wordmark and stays square", () => {
    const out = buildLogoPrompt({ name: "Blink Spot" })!;
    expect(out.aspectRatio).toBe("1:1");
    expect(out.prompt).toContain('"Blink Spot"');
    expect(out.prompt).toContain("spell the brand name correctly");
    // Sensible default style when no hint is given.
    expect(out.prompt).toContain("modern minimalist");
  });

  it("incorporates industry, style hint, and valid brand colors when present", () => {
    const out = buildLogoPrompt({
      name: "Nimbus",
      industry: "cloud software",
      styleHint: "luxury",
      primaryColor: "#112233",
      secondaryColor: "gold",
    })!;
    expect(out.prompt).toContain("cloud software");
    expect(out.prompt).toContain("luxury");
    expect(out.prompt).toContain("#112233");
    expect(out.prompt).toContain("gold");
  });

  it("degrades gracefully with a generic palette when colors are missing/invalid", () => {
    const out = buildLogoPrompt({ name: "Acme", primaryColor: "not-a-real-color-because-way-too-long-string" })!;
    expect(out.prompt).toContain("balanced, confident color palette");
  });

  it("bounds and normalizes the name", () => {
    const long = "A".repeat(200);
    const out = buildLogoPrompt({ name: long })!;
    // Name is capped at 60 chars inside the quoted wordmark.
    expect(out.prompt).toContain(`"${"A".repeat(60)}"`);
    expect(out.prompt).not.toContain("A".repeat(61));
  });
});
