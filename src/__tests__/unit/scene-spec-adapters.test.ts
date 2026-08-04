import { describe, expect, it } from "vitest";
import { parseSceneSpec, SCENE_SPEC_VERSION, type SceneSpec } from "@/lib/scene-spec";
import {
  isLegacyReconstructedSpec,
  legacySceneSpecFromContentRow,
  readSceneSpecForContentRow,
  sceneSpecFromCreationMetadata,
  sceneSpecFromDirectorBeat,
  sceneSpecFromSheetPanel,
  sceneSpecFromStoryboardScene,
  sceneSpecToCreationMetadata,
  sceneSpecsFromDirectorOutput,
  sceneSpecsFromStoredSheetPanels,
} from "@/lib/scene-spec-adapters";

const SHEET_URL = "https://cdn.example/sheet.png";
const FRAME_URL = "https://cdn.example/frame.png";

/** The Master Director's real emitted shape (snake_case). */
const DIRECTOR_BEAT_SNAKE = {
  image_prompt: "a warm living room at dusk",
  video_prompt: "slow dolly in as the blanket is unfolded",
  end_frame_prompt: "the blanket fully draped",
  dialogue: "It holds.",
  audio_prompt: "low ambient room tone",
  location: "living room",
  ai_model: "kling-3.0/video",
  duration: 10,
  useEndFrame: true,
};

/** The camelCase variant some call sites produce. */
const DIRECTOR_BEAT_CAMEL = {
  imagePrompt: "a warm living room at dusk",
  videoPrompt: "slow dolly in as the blanket is unfolded",
  endFramePrompt: "the blanket fully draped",
  dialogue: "It holds.",
  audioPrompt: "low ambient room tone",
  location: "living room",
  aiModel: "kling-3.0/video",
  duration: "10",
};

describe("sceneSpecFromDirectorBeat", () => {
  it("maps the snake_case Director beat onto SceneSpec", () => {
    const spec = sceneSpecFromDirectorBeat(DIRECTOR_BEAT_SNAKE, 1);
    expect(spec.schemaVersion).toBe(SCENE_SPEC_VERSION);
    expect(spec.sceneNumber).toBe(1);
    expect(spec.imagePrompt).toBe("a warm living room at dusk");
    expect(spec.videoPrompt).toBe("slow dolly in as the blanket is unfolded");
    expect(spec.endFramePrompt).toBe("the blanket fully draped");
    expect(spec.dialogue).toBe("It holds.");
    expect(spec.audioDirection).toBe("low ambient room tone");
    expect(spec.locationLabel).toBe("living room");
    expect(spec.selectedModel).toBe("kling-3.0/video");
    expect(spec.durationSeconds).toBe("10");
    expect(spec.modelRequirements).toEqual({ endFrame: true });
  });

  it("produces an equivalent spec from the camelCase variant", () => {
    const snake = sceneSpecFromDirectorBeat(DIRECTOR_BEAT_SNAKE, 1);
    const camel = sceneSpecFromDirectorBeat(DIRECTOR_BEAT_CAMEL, 1);
    for (const key of ["imagePrompt", "videoPrompt", "endFramePrompt", "dialogue", "audioDirection", "locationLabel", "selectedModel", "durationSeconds"] as const) {
      expect(camel[key]).toBe(snake[key]);
    }
  });

  it("maps the /api/video/storyboard shape ({mode,duration,prompt})", () => {
    const spec = sceneSpecFromDirectorBeat({ mode: "logo_reveal", duration: "5", prompt: "dynamic 3D reveal" }, 2);
    expect(spec.videoMode).toBe("logo_reveal");
    expect(spec.videoPrompt).toBe("dynamic 3D reveal");
    expect(spec.imagePrompt).toBe("dynamic 3D reveal");
    expect(spec.durationSeconds).toBe("5");
  });

  it("quarantines a disallowed model instead of failing or trusting it", () => {
    const spec = sceneSpecFromDirectorBeat({ ...DIRECTOR_BEAT_SNAKE, ai_model: "totally-made-up" }, 1);
    expect(spec.selectedModel).toBeUndefined();
    expect(spec.quarantinedFields?.selectedModel).toBe("totally-made-up");
    // The rest of the beat still survives.
    expect(spec.videoPrompt).toBe("slow dolly in as the blanket is unfolded");
  });

  it("quarantines unknown Director keys", () => {
    const spec = sceneSpecFromDirectorBeat({ ...DIRECTOR_BEAT_SNAKE, mystery_field: "???" }, 1);
    expect(spec.quarantinedFields?.mystery_field).toBe("???");
  });

  it("synthesizes identity when the beat has none", () => {
    const spec = sceneSpecFromDirectorBeat({}, 3);
    expect(spec.sceneId).toBeTruthy();
    expect(spec.sceneNumber).toBe(3);
    expect(parseSceneSpec(spec).ok).toBe(true);
  });

  it("applies surface context without overriding scene-level values", () => {
    const spec = sceneSpecFromDirectorBeat(
      { ...DIRECTOR_BEAT_SNAKE, aspect_ratio: "9:16" },
      1,
      { sourceIdea: "blanket strength ad", aspectRatio: "16:9", sequenceId: "seq-1", styleLabel: "Anime" }
    );
    expect(spec.sourceIdea).toBe("blanket strength ad");
    expect(spec.sequenceId).toBe("seq-1");
    expect(spec.styleLabel).toBe("Anime");
    expect(spec.aspectRatio).toBe("9:16"); // scene wins over the studio default
  });

  it("numbers a Director array sequentially", () => {
    const specs = sceneSpecsFromDirectorOutput([DIRECTOR_BEAT_SNAKE, DIRECTOR_BEAT_CAMEL, {}]);
    expect(specs.map((s) => s.sceneNumber)).toEqual([1, 2, 3]);
    expect(sceneSpecsFromDirectorOutput("not-an-array")).toEqual([]);
  });
});

describe("sceneSpecFromStoryboardScene (legacy ad-hoc scene)", () => {
  const legacyScene = {
    id: "scene-abc",
    scene_number: 2,
    mode: "showcase",
    prompt: "slow dolly in",
    imagePrompt: "a warm living room",
    endFramePrompt: "draped blanket",
    audioPrompt: "room tone",
    location: "living room",
    aiModel: "bytedance/seedance-2",
    duration: "5",
    aspectRatio: "16:9",
    videoResolution: "720p",
    primaryPreview: FRAME_URL,
    secondaryPreview: null,
    useEndFrame: false,
    // engine plumbing / transient state — not spec fields
    seed: 1234,
    prunaDraft: true,
    imageEngine: "nb2",
    isGeneratingVideo: false,
    videoUrl: null,
  };

  it("wraps the scene, mapping prompt→videoPrompt and previews→frame refs", () => {
    const spec = sceneSpecFromStoryboardScene(legacyScene);
    expect(spec.sceneId).toBe("scene-abc");
    expect(spec.sceneNumber).toBe(2);
    expect(spec.videoPrompt).toBe("slow dolly in");
    expect(spec.imagePrompt).toBe("a warm living room");
    expect(spec.audioDirection).toBe("room tone");
    expect(spec.videoMode).toBe("showcase");
    expect(spec.selectedModel).toBe("bytedance/seedance-2");
    expect(spec.startFrameRef).toBe(FRAME_URL);
    expect(spec.endFrameRef).toBeUndefined();
    expect(spec.modelRequirements).toEqual({ endFrame: false });
  });

  it("quarantines engine plumbing rather than promoting it", () => {
    const spec = sceneSpecFromStoryboardScene(legacyScene);
    expect(spec.quarantinedFields).toMatchObject({ seed: 1234, prunaDraft: true, imageEngine: "nb2" });
    expect((spec as unknown as Record<string, unknown>).seed).toBeUndefined();
  });

  it("drops non-serializable browser handles so the spec stays persistable", () => {
    const spec = sceneSpecFromStoryboardScene({
      ...legacyScene,
      primaryFile: { name: "x.png", size: 1 },
      seedanceImages: [() => undefined],
    });
    expect(JSON.stringify(spec)).toBeTruthy();
    expect(spec.quarantinedFields?.seedanceImages).toBeUndefined();
  });

  it("carries Storyboard Sheet provenance from a prepared scene", () => {
    const spec = sceneSpecFromStoryboardScene({ ...legacyScene, storyboardSheetUrl: SHEET_URL, storyboardSheetPanel: 3 });
    expect(spec.storyboardSheet).toEqual({ sheetUrl: SHEET_URL, panelNumber: 3 });
  });

  it("always returns a valid spec even for an empty scene object", () => {
    expect(parseSceneSpec(sceneSpecFromStoryboardScene({})).ok).toBe(true);
  });
});

describe("Storyboard Sheet panel adaptation", () => {
  const legacyPanel = {
    sceneNumber: 1,
    imagePrompt: "establishing shot",
    videoPrompt: "push in slowly",
    dialogue: "Here we go.",
    audioPrompt: "soft ambience",
    location: "kitchen",
    aiModel: "auto",
    duration: "5",
  };

  it("adapts a legacy ad-hoc panel and attaches provenance", () => {
    const spec = sceneSpecFromSheetPanel(legacyPanel, 1, SHEET_URL);
    expect(spec.imagePrompt).toBe("establishing shot");
    expect(spec.videoPrompt).toBe("push in slowly");
    expect(spec.dialogue).toBe("Here we go.");
    expect(spec.audioDirection).toBe("soft ambience");
    expect(spec.locationLabel).toBe("kitchen");
    expect(spec.selectedModel).toBe("auto");
    expect(spec.storyboardSheet).toEqual({ sheetUrl: SHEET_URL, panelNumber: 1 });
  });

  it("round-trips an already-migrated SceneSpec panel", () => {
    const migrated = sceneSpecFromSheetPanel(legacyPanel, 2, SHEET_URL);
    const again = sceneSpecFromSheetPanel(migrated as unknown as Record<string, unknown>, 2, SHEET_URL);
    expect(again.videoPrompt).toBe(migrated.videoPrompt);
    expect(again.sceneId).toBe(migrated.sceneId);
    expect(again.storyboardSheet).toEqual({ sheetUrl: SHEET_URL, panelNumber: 2 });
  });

  it("reads BOTH legacy and migrated arrays out of browser storage", () => {
    const legacyStored = [legacyPanel, { ...legacyPanel, sceneNumber: 2 }];
    const legacySpecs = sceneSpecsFromStoredSheetPanels(legacyStored, SHEET_URL);
    expect(legacySpecs).toHaveLength(2);
    expect(legacySpecs[0].videoPrompt).toBe("push in slowly");
    expect(legacySpecs[1].storyboardSheet?.panelNumber).toBe(2);

    const migratedStored = JSON.parse(JSON.stringify(legacySpecs));
    const migratedSpecs = sceneSpecsFromStoredSheetPanels(migratedStored, SHEET_URL);
    expect(migratedSpecs.map((s) => s.videoPrompt)).toEqual(legacySpecs.map((s) => s.videoPrompt));

    expect(sceneSpecsFromStoredSheetPanels(null, SHEET_URL)).toEqual([]);
  });

  it("omits provenance when the sheet URL is not yet known", () => {
    const spec = sceneSpecFromSheetPanel(legacyPanel, 1, "");
    expect(spec.storyboardSheet).toBeUndefined();
    expect(spec.videoPrompt).toBe("push in slowly");
  });
});

describe("creation_metadata persistence and reopening", () => {
  it("serializes a versioned spec into the shared metadata column", () => {
    const spec = sceneSpecFromDirectorBeat(DIRECTOR_BEAT_SNAKE, 1, { sequenceId: "seq-9" });
    const fragment = sceneSpecToCreationMetadata(spec);
    expect(fragment.creation_metadata_version).toBe(1);
    expect(fragment.creation_metadata.scene_spec_version).toBe(SCENE_SPEC_VERSION);
    expect(fragment.creation_metadata.sequence_id).toBe("seq-9");
    // Survives a real JSONB round trip.
    const roundTripped = JSON.parse(JSON.stringify(fragment.creation_metadata));
    expect(sceneSpecFromCreationMetadata(roundTripped)?.videoPrompt).toBe(spec.videoPrompt);
  });

  it("returns null for metadata that holds no SceneSpec", () => {
    expect(sceneSpecFromCreationMetadata(null)).toBeNull();
    expect(sceneSpecFromCreationMetadata({ operation: "standard" })).toBeNull();
  });

  it("returns null for a corrupt persisted spec rather than trusting it", () => {
    expect(sceneSpecFromCreationMetadata({ scene_spec: { schemaVersion: 99 } })).toBeNull();
  });

  it("reconstructs a legacy fallback spec for a pre-SceneSpec row", () => {
    const spec = legacySceneSpecFromContentRow({
      id: "content-legacy",
      caption: "🎬 Scene 1 Video",
      ai_model: "kling-3.0/video",
      content_type: "sequence_clip",
      generation_state: "succeeded",
      billing_state: "charged",
    });
    expect(spec.contentId).toBe("content-legacy");
    expect(spec.selectedModel).toBe("kling-3.0/video");
    expect(spec.generationState).toBe("succeeded");
    expect(isLegacyReconstructedSpec(spec)).toBe(true);
    expect(spec.quarantinedFields?.caption).toBe("🎬 Scene 1 Video");
  });

  it("quarantines a legacy row's unmappable model instead of inventing one", () => {
    const spec = legacySceneSpecFromContentRow({ id: "c1", ai_model: "legacy-engine-x" });
    expect(spec.selectedModel).toBeUndefined();
    expect(spec.quarantinedFields?.selectedModel).toBe("legacy-engine-x");
  });

  it("readSceneSpecForContentRow prefers the persisted spec, else the fallback", () => {
    const spec = sceneSpecFromDirectorBeat(DIRECTOR_BEAT_SNAKE, 4);
    const { creation_metadata } = sceneSpecToCreationMetadata(spec);

    const withSpec = readSceneSpecForContentRow({ id: "c1", creation_metadata });
    expect(withSpec.sceneNumber).toBe(4);
    expect(isLegacyReconstructedSpec(withSpec)).toBe(false);

    const withoutSpec = readSceneSpecForContentRow({ id: "c2", ai_model: "auto" });
    expect(isLegacyReconstructedSpec(withoutSpec)).toBe(true);
    expect(withoutSpec.contentId).toBe("c2");
  });
});

describe("five-boundary continuity", () => {
  it("preserves scene intent from Director output to scene reopening", () => {
    // BOUNDARY 1 — Director output (raw, snake_case, as the n8n Director emits).
    const directorOutput = {
      scenes: [
        {
          image_prompt: "a warm living room at dusk, blanket folded on the sofa",
          video_prompt: "slow dolly in as two adults unfold the blanket",
          end_frame_prompt: "the blanket stretched taut between them",
          dialogue: "It holds.",
          audio_prompt: "low ambient room tone, no music",
          location: "third-floor living room",
          ai_model: "kling-3.0/video",
          duration: 10,
          useEndFrame: true,
          scene_purpose: "establish",
          narrative_beat: "the ordinary evening",
          camera_movement: "dolly in",
          lighting: "warm practical",
        },
      ],
    };

    const context = {
      sequenceId: "seq-continuity",
      sourceIdea: "prove the blanket is strong enough to escape a third-floor window",
      aspectRatio: "16:9",
      styleLabel: "Cinematic Realism",
      castRefs: [{ name: "Sam", actorId: "actor-1", sheetUrl: FRAME_URL, pinned: false }],
      wardrobe: "navy jumper throughout",
      environmentRef: FRAME_URL,
    };

    // BOUNDARY 2 — SceneSpec parser/adapter.
    const [spec] = sceneSpecsFromDirectorOutput(directorOutput.scenes, context);
    expect(parseSceneSpec(spec).ok).toBe(true);

    // BOUNDARY 3 — Storyboard Sheet panel representation (sheet → prepared scene).
    const sheetPanel = sceneSpecFromSheetPanel(spec as unknown as Record<string, unknown>, 1, SHEET_URL, context);
    // The prepared scene is the ad-hoc object the component actually builds.
    const preparedScene: Record<string, unknown> = {
      id: sheetPanel.sceneId,
      scene_number: sheetPanel.sceneNumber,
      prompt: sheetPanel.videoPrompt,
      imagePrompt: sheetPanel.imagePrompt,
      endFramePrompt: sheetPanel.endFramePrompt,
      audioPrompt: sheetPanel.audioDirection,
      dialogue: sheetPanel.dialogue,
      location: sheetPanel.locationLabel,
      aiModel: sheetPanel.selectedModel,
      duration: sheetPanel.durationSeconds,
      aspectRatio: sheetPanel.aspectRatio,
      primaryPreview: FRAME_URL,
      useEndFrame: true,
      storyboardSheetUrl: SHEET_URL,
      storyboardSheetPanel: 1,
      seed: 42, // engine plumbing that must not leak into the spec
      // The component attaches the originating spec so narrative/direction
      // metadata the ad-hoc scene object has no field for is not lost here.
      sceneSpec: sheetPanel,
    };
    const sceneSpec = sceneSpecFromStoryboardScene(preparedScene, context);

    // BOUNDARY 4 — content.creation_metadata persistence payload (real JSONB round trip).
    const fragment = sceneSpecToCreationMetadata(sceneSpec);
    const persistedRow = {
      id: "content-continuity",
      creation_metadata: JSON.parse(JSON.stringify(fragment.creation_metadata)),
    };

    // BOUNDARY 5 — reopening the scene downstream.
    const reopened: SceneSpec = readSceneSpecForContentRow(persistedRow);

    expect(isLegacyReconstructedSpec(reopened)).toBe(false);
    expect(reopened.schemaVersion).toBe(SCENE_SPEC_VERSION);
    expect(reopened.sceneId).toBe(spec.sceneId);
    expect(reopened.sceneNumber).toBe(1);
    expect(reopened.scenePurpose).toBe("establish");
    expect(reopened.narrativeBeat).toBe("the ordinary evening");
    expect(reopened.imagePrompt).toBe("a warm living room at dusk, blanket folded on the sofa");
    expect(reopened.videoPrompt).toBe("slow dolly in as two adults unfold the blanket");
    expect(reopened.endFramePrompt).toBe("the blanket stretched taut between them");
    expect(reopened.dialogue).toBe("It holds.");
    expect(reopened.audioDirection).toBe("low ambient room tone, no music");
    expect(reopened.castRefs).toEqual([{ name: "Sam", actorId: "actor-1", sheetUrl: FRAME_URL, pinned: false }]);
    expect(reopened.wardrobe).toBe("navy jumper throughout");
    expect(reopened.locationLabel).toBe("third-floor living room");
    expect(reopened.environmentRef).toBe(FRAME_URL);
    expect(reopened.cameraMovement).toBe("dolly in");
    expect(reopened.lighting).toBe("warm practical");
    expect(reopened.durationSeconds).toBe("10");
    expect(reopened.aspectRatio).toBe("16:9");
    expect(reopened.selectedModel).toBe("kling-3.0/video");
    expect(reopened.modelRequirements).toEqual({ endFrame: true });
    expect(reopened.startFrameRef).toBe(FRAME_URL);
    expect(reopened.storyboardSheet).toEqual({ sheetUrl: SHEET_URL, panelNumber: 1 });
    expect(reopened.sourceIdea).toBe("prove the blanket is strong enough to escape a third-floor window");
    expect(reopened.sequenceId).toBe("seq-continuity");
    // Engine plumbing stayed quarantined across all five boundaries.
    expect(reopened.quarantinedFields?.seed).toBe(42);
  });
});
