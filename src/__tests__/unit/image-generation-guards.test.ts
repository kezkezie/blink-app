import { describe, expect, it } from "vitest";
import {
  checkReferenceEngineCompatibility,
  isReferenceCapableEngine,
  willAttachReference,
} from "@/lib/image-generation-guards";

const ALL_STYLES = ["studio", "lifestyle", "cinematic", "poster", "brand", "abstract", "flatlay"];
const ENGINES = ["nb2", "gpt-image-2-text-to-image", "gpt-image-2-image-to-image"];

describe("isReferenceCapableEngine", () => {
  it("accepts nb2 and gpt-image-2-image-to-image, rejects text-to-image", () => {
    expect(isReferenceCapableEngine("nb2")).toBe(true);
    expect(isReferenceCapableEngine("gpt-image-2-image-to-image")).toBe(true);
    expect(isReferenceCapableEngine("gpt-image-2-text-to-image")).toBe(false);
    expect(isReferenceCapableEngine("unknown")).toBe(false);
  });
});

describe("willAttachReference", () => {
  it("attaches the logo only for Brand Integrated when a brand logo exists", () => {
    for (const style of ALL_STYLES) {
      const withLogo = willAttachReference({ style, hasBrandLogo: true, uploadCount: 0, libraryCount: 0 });
      expect(withLogo).toBe(style === "brand");
    }
  });

  it("does not attach for Brand Integrated when the brand has no logo", () => {
    expect(willAttachReference({ style: "brand", hasBrandLogo: false, uploadCount: 0, libraryCount: 0 })).toBe(false);
  });

  it("attaches when uploads or library picks are present, regardless of style", () => {
    for (const style of ALL_STYLES) {
      expect(willAttachReference({ style, hasBrandLogo: false, uploadCount: 1, libraryCount: 0 })).toBe(true);
      expect(willAttachReference({ style, hasBrandLogo: false, uploadCount: 0, libraryCount: 2 })).toBe(true);
    }
  });
});

describe("checkReferenceEngineCompatibility (engine x reference matrix)", () => {
  it("rejects Brand Integrated + logo on a text-to-image engine (before billing)", () => {
    const attach = willAttachReference({ style: "brand", hasBrandLogo: true, uploadCount: 0, libraryCount: 0 });
    const result = checkReferenceEngineCompatibility({ engine: "gpt-image-2-text-to-image", willAttachReference: attach });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reference-capable|Nano Banana|I2I/);
  });

  it("allows Brand Integrated + logo on reference-capable engines", () => {
    const attach = willAttachReference({ style: "brand", hasBrandLogo: true, uploadCount: 0, libraryCount: 0 });
    expect(checkReferenceEngineCompatibility({ engine: "nb2", willAttachReference: attach }).ok).toBe(true);
    expect(checkReferenceEngineCompatibility({ engine: "gpt-image-2-image-to-image", willAttachReference: attach }).ok).toBe(true);
  });

  it("allows text-to-image when no reference is attached (Brand without a logo, or reference-less styles)", () => {
    const noLogoBrand = willAttachReference({ style: "brand", hasBrandLogo: false, uploadCount: 0, libraryCount: 0 });
    expect(checkReferenceEngineCompatibility({ engine: "gpt-image-2-text-to-image", willAttachReference: noLogoBrand }).ok).toBe(true);
    for (const style of ALL_STYLES.filter((s) => s !== "brand")) {
      const attach = willAttachReference({ style, hasBrandLogo: true, uploadCount: 0, libraryCount: 0 });
      expect(checkReferenceEngineCompatibility({ engine: "gpt-image-2-text-to-image", willAttachReference: attach }).ok).toBe(true);
    }
  });

  it("rejects any style that attaches an upload/library reference on text-to-image", () => {
    for (const style of ALL_STYLES) {
      const attach = willAttachReference({ style, hasBrandLogo: false, uploadCount: 1, libraryCount: 0 });
      const result = checkReferenceEngineCompatibility({ engine: "gpt-image-2-text-to-image", willAttachReference: attach });
      expect(result.ok).toBe(false);
    }
  });

  it("full matrix: reference-capable engines never reject; text-to-image rejects iff a reference attaches", () => {
    for (const style of ALL_STYLES) {
      for (const engine of ENGINES) {
        for (const hasBrandLogo of [true, false]) {
          for (const uploadCount of [0, 1]) {
            const attach = willAttachReference({ style, hasBrandLogo, uploadCount, libraryCount: 0 });
            const result = checkReferenceEngineCompatibility({ engine, willAttachReference: attach });
            const expectReject = engine === "gpt-image-2-text-to-image" && attach;
            expect(result.ok).toBe(!expectReject);
          }
        }
      }
    }
  });
});
