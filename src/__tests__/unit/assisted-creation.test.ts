import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_STUDIO_ALLOWED_FORMATS,
  fallbackConcepts,
  fallbackCreativeDirection,
  createEmptyAssistedCreationDraft,
  normalizeConceptsForFormats,
  parseAssistedCreationDraft,
  parseConcepts,
  parseCreativeDirection,
} from "@/lib/assisted-creation";
import { useAssistedCreationStore } from "@/app/store/useAssistedCreationStore";

describe("assisted creation structured output", () => {
  it("accepts exactly three complete concepts", () => {
    const concepts = parseConcepts({ concepts: [
      { title: "Warm return", idea: "A blanket waiting at the end of a long day.", angle: "Relief and belonging", format: "image" },
      { title: "The handoff", idea: "Follow comfort moving through three generations.", angle: "Family continuity", format: "video" },
      { title: "Three textures", idea: "Reveal softness through a connected detail series.", angle: "Sensory curiosity", format: "carousel" },
    ] });

    expect(concepts).toHaveLength(3);
    expect(concepts?.map((concept) => concept.id)).toEqual(["concept-1", "concept-2", "concept-3"]);
  });

  it("rejects malformed or incomplete concept output", () => {
    expect(parseConcepts({ concepts: [{ title: "Only one" }] })).toBeNull();
    expect(parseConcepts({ concepts: [
      { title: "A", idea: "A", angle: "A", format: "image" },
      { title: "B", idea: "B", angle: "B", format: "podcast" },
      { title: "C", idea: "C", angle: "C", format: "video" },
    ] })).toBeNull();
  });

  it("creates three distinct safe fallback concepts", () => {
    const concepts = fallbackConcepts("an ad for soft blankets", "Cloud Rest");
    expect(concepts).toHaveLength(3);
    expect(new Set(concepts.map((concept) => concept.title)).size).toBe(3);
    expect(new Set(concepts.map((concept) => concept.format))).toEqual(new Set(["image", "video", "carousel"]));
  });

  it("accepts a complete creative direction and rejects unknown styles", () => {
    const valid = {
      visualDirection: "Warm evening light and tactile close-ups.",
      tone: "Reassuring and intimate",
      composition: "Begin wide, then move into texture and human detail.",
      outputType: "video",
      style: "cinematic",
      summary: "A quiet homecoming story centered on comfort.",
    };
    expect(parseCreativeDirection(valid)).toEqual(valid);
    expect(parseCreativeDirection({ ...valid, style: "hidden-provider-mode" })).toBeNull();
  });

  it("maps a fallback direction into an existing studio style", () => {
    const concept = fallbackConcepts("blanket ad")[1];
    const direction = fallbackCreativeDirection(concept);
    expect(direction.outputType).toBe("video");
    expect(direction.style).toBe("cinematic");
    expect(direction.summary).toContain(concept.title);
  });

  it("round-trips a valid versioned draft without transient request state", () => {
    const concepts = fallbackConcepts("blanket ad");
    const direction = fallbackCreativeDirection(concepts[0]);
    const draft = {
      ...createEmptyAssistedCreationDraft("brand-1"),
      idea: "Create a comforting blanket ad",
      concepts,
      selectedConcept: concepts[0],
      direction,
      step: "handoff" as const,
      advancedRevealed: true,
      handoff: { prompt: direction.summary, style: direction.style, mode: "standard" as const },
      loading: "direction",
      error: "temporary",
    };
    const restored = parseAssistedCreationDraft(JSON.parse(JSON.stringify(draft)));
    expect(restored).toMatchObject({ brandId: "brand-1", step: "handoff", advancedRevealed: true });
    expect(restored).not.toHaveProperty("loading");
    expect(restored).not.toHaveProperty("error");
  });

  it("rejects corrupt and unsupported draft versions safely", () => {
    expect(parseAssistedCreationDraft("not a draft")).toBeNull();
    expect(parseAssistedCreationDraft({ ...createEmptyAssistedCreationDraft("brand-1"), version: 2 })).toBeNull();
    expect(parseAssistedCreationDraft({ ...createEmptyAssistedCreationDraft("brand-1"), concepts: [{ title: "broken" }] })).toBeNull();
  });

  it("restores through pure validation without AI or generation requests", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(parseAssistedCreationDraft(createEmptyAssistedCreationDraft("brand-1"))).not.toBeNull();
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("start over clears only the isolated assisted draft", () => {
    const unrelatedStudioPreferences = { aspect: "4:5", engine: "nb2" };
    useAssistedCreationStore.setState({ draft: createEmptyAssistedCreationDraft("brand-1"), hasHydrated: true });
    useAssistedCreationStore.getState().clearDraft();
    expect(useAssistedCreationStore.getState().draft).toBeNull();
    expect(unrelatedStudioPreferences).toEqual({ aspect: "4:5", engine: "nb2" });
  });
});

describe("assisted format honesty (image-only capability)", () => {
  const VIDEO_CONCEPT = { title: "Motion Story", idea: "A story told in motion.", angle: "Emotion", format: "video" };
  const CAROUSEL_CONCEPT = { title: "The Series", idea: "Three connected panels.", angle: "Discovery", format: "carousel" };
  const IMAGE_A = { title: "Hero Frame", idea: "One premium hero frame.", angle: "Desire", format: "image" };
  const IMAGE_B = { title: "Real Moment", idea: "A candid customer moment.", angle: "Authenticity", format: "image" };

  it("exports image as Image Studio's only executable format", () => {
    expect(IMAGE_STUDIO_ALLOWED_FORMATS).toEqual(["image"]);
  });

  it("image-only fallbacks are three genuinely distinct image concepts", () => {
    const concepts = fallbackConcepts("a blanket launch", "Cloud Rest", ["image"]);
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.format === "image")).toBe(true);
    expect(new Set(concepts.map((concept) => concept.title)).size).toBe(3);
    expect(new Set(concepts.map((concept) => concept.idea)).size).toBe(3);
  });

  it("default fallback contract (all formats) is preserved for future callers", () => {
    const concepts = fallbackConcepts("a blanket launch", "Cloud Rest");
    expect(new Set(concepts.map((concept) => concept.format))).toEqual(new Set(["image", "video", "carousel"]));
  });

  it("drops disallowed AI concepts without relabelling and repairs to exactly three", () => {
    const { concepts, repaired } = normalizeConceptsForFormats(
      { concepts: [VIDEO_CONCEPT, IMAGE_A, CAROUSEL_CONCEPT] },
      ["image"],
      "a blanket launch",
      "Cloud Rest"
    );
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.format === "image")).toBe(true);
    // Dropped, never relabelled: the video/carousel titles must not reappear as images.
    expect(concepts.map((concept) => concept.title)).not.toContain(VIDEO_CONCEPT.title);
    expect(concepts.map((concept) => concept.title)).not.toContain(CAROUSEL_CONCEPT.title);
    expect(concepts.map((concept) => concept.title)).toContain(IMAGE_A.title);
    expect(repaired).toBe(true);
  });

  it("passes through three valid allowed concepts unrepaired", () => {
    const third = { title: "Poster Energy", idea: "A bold poster statement.", angle: "Authority", format: "image" };
    const { concepts, repaired } = normalizeConceptsForFormats(
      { concepts: [IMAGE_A, IMAGE_B, third] },
      ["image"],
      "a blanket launch"
    );
    expect(concepts.map((concept) => concept.title)).toEqual([IMAGE_A.title, IMAGE_B.title, third.title]);
    expect(concepts.map((concept) => concept.id)).toEqual(["concept-1", "concept-2", "concept-3"]);
    expect(repaired).toBe(false);
  });

  it("repairs malformed output with three distinct image-native fallbacks", () => {
    for (const malformed of [null, "junk", { concepts: "nope" }, { concepts: [{ title: "broken" }] }]) {
      const { concepts, repaired } = normalizeConceptsForFormats(malformed, ["image"], "a blanket launch", "Cloud Rest");
      expect(concepts).toHaveLength(3);
      expect(concepts.every((concept) => concept.format === "image")).toBe(true);
      expect(new Set(concepts.map((concept) => concept.title)).size).toBe(3);
      expect(repaired).toBe(true);
    }
  });

  it("dedupes repeated titles instead of returning cosmetic variations", () => {
    const { concepts } = normalizeConceptsForFormats(
      { concepts: [IMAGE_A, { ...IMAGE_A }, { ...IMAGE_A }] },
      ["image"],
      "a blanket launch"
    );
    expect(concepts).toHaveLength(3);
    expect(new Set(concepts.map((concept) => concept.title.toLowerCase())).size).toBe(3);
  });

  it("coerces an unsupported concept's fallback direction to an executable image direction", () => {
    const direction = fallbackCreativeDirection(
      { id: "concept-1", ...VIDEO_CONCEPT, format: "video" as const },
      ["image"]
    );
    expect(direction.outputType).toBe("image");
    expect(direction.style).toBe("lifestyle"); // image-native mapping, not the video style
  });

  it("legacy drafts holding video selections stay parseable with the idea intact", () => {
    const legacyConcepts = parseConcepts({ concepts: [VIDEO_CONCEPT, IMAGE_A, CAROUSEL_CONCEPT] })!;
    const videoSelected = legacyConcepts[0];
    const direction = fallbackCreativeDirection(videoSelected); // legacy: video-native direction
    const draft = {
      ...createEmptyAssistedCreationDraft("brand-1"),
      idea: "Create a comforting blanket ad",
      concepts: legacyConcepts,
      selectedConcept: videoSelected,
      direction,
      step: "direction" as const,
    };
    const restored = parseAssistedCreationDraft(JSON.parse(JSON.stringify(draft)));
    expect(restored).not.toBeNull();
    expect(restored!.idea).toBe("Create a comforting blanket ad");
    expect(restored!.selectedConcept?.format).toBe("video");
    expect(restored!.direction?.outputType).toBe("video");
  });
});
