import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageGenerationStatus } from "@/lib/image-generation-state";
import type { GenerationJobObserverOptions, GenerationJobSnapshot } from "@/lib/generation-job-observer";
import {
  fetchOwnedVideoJob,
  observeSceneSet,
  sceneSnapshotVideoUrl,
  type ObservedScene,
  type SceneSnapshot,
} from "@/lib/video-job-observer";

function status(over: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus {
  return {
    generationState: "generating",
    billingState: "charged",
    retryState: "none",
    message: null,
    errorCode: null,
    attempt: 1,
    ...over,
  };
}

function snapshot(contentId: string, over: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return { contentId, status: status(), imageUrls: [], observationTimedOut: false, ...over };
}

const SCENES: ObservedScene[] = [
  { sceneId: "scene-a", sceneNumber: 1, contentId: "11111111-1111-4111-8111-111111111111" },
  { sceneId: "scene-b", sceneNumber: 2, contentId: "22222222-2222-4222-8222-222222222222" },
];

/** A fake single-job observer that lets a test drive snapshots per content id. */
function makeFakeObserver() {
  const emitters = new Map<string, (s: GenerationJobSnapshot) => void>();
  const disposed: string[] = [];
  const observe = vi.fn((options: GenerationJobObserverOptions) => {
    emitters.set(options.contentId, options.onSnapshot);
    return { dispose: () => disposed.push(options.contentId) };
  });
  return { observe, emitters, disposed };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchOwnedVideoJob", () => {
  it("reads the owned video endpoint and maps video_urls into the shared field", async () => {
    const body = {
      id: "c1",
      status: status({ generationState: "succeeded" }),
      video_urls: ["https://cdn.example/clip.mp4", 42],
    };
    const doFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", doFetch);

    const result = await fetchOwnedVideoJob("c1", new AbortController().signal);
    expect(result).toEqual({ ok: true, status: body.status, imageUrls: ["https://cdn.example/clip.mp4"] });
    expect(String(doFetch.mock.calls[0][0])).toBe("/api/video-jobs?id=c1");
  });

  it("maps auth/not-found/other failures to stable codes", async () => {
    for (const [httpStatus, code] of [[401, "unauthorized"], [404, "not_found"], [500, "read_failed"]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: httpStatus })));
      expect(await fetchOwnedVideoJob("c1", new AbortController().signal)).toEqual({ ok: false, code });
    }
  });

  it("rejects a mismatched id or malformed status rather than trusting it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "other", status: status() }), { status: 200 }),
    ));
    expect(await fetchOwnedVideoJob("c1", new AbortController().signal)).toEqual({ ok: false, code: "invalid_response" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "c1", status: { nonsense: true } }), { status: 200 }),
    ));
    expect(await fetchOwnedVideoJob("c1", new AbortController().signal)).toEqual({ ok: false, code: "invalid_response" });
  });
});

describe("sceneSnapshotVideoUrl", () => {
  it("returns the first playable url, else null", () => {
    expect(sceneSnapshotVideoUrl(snapshot("c", { imageUrls: ["https://cdn/a.mp4"] }))).toBe("https://cdn/a.mp4");
    expect(sceneSnapshotVideoUrl(snapshot("c", { imageUrls: [] }))).toBeNull();
  });
});

describe("observeSceneSet", () => {
  it("observes every scene concurrently, one observer each", () => {
    const fake = makeFakeObserver();
    const set = observeSceneSet({ scenes: SCENES, onSceneSnapshot: () => {}, observe: fake.observe });
    expect(fake.observe).toHaveBeenCalledTimes(2);
    expect(set.activeSceneIds().sort()).toEqual(["scene-a", "scene-b"]);
  });

  it("never double-observes the same scene", () => {
    const fake = makeFakeObserver();
    observeSceneSet({
      scenes: [SCENES[0], { ...SCENES[0] }],
      onSceneSnapshot: () => {},
      observe: fake.observe,
    });
    expect(fake.observe).toHaveBeenCalledTimes(1);
  });

  it("delivers per-scene snapshots carrying scene identity and the video url", () => {
    const fake = makeFakeObserver();
    const seen: SceneSnapshot[] = [];
    observeSceneSet({ scenes: SCENES, onSceneSnapshot: (s) => seen.push(s), observe: fake.observe });

    fake.emitters.get(SCENES[1].contentId)!(
      snapshot(SCENES[1].contentId, { status: status({ generationState: "succeeded" }), imageUrls: ["https://cdn/b.mp4"] }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sceneId: "scene-b", sceneNumber: 2, videoUrl: "https://cdn/b.mp4" });
  });

  it("settles a scene exactly once on a durable terminal state", () => {
    const fake = makeFakeObserver();
    const settled: SceneSnapshot[] = [];
    observeSceneSet({ scenes: SCENES, onSceneSnapshot: () => {}, onSceneSettled: (s) => settled.push(s), observe: fake.observe });

    const emit = fake.emitters.get(SCENES[0].contentId)!;
    emit(snapshot(SCENES[0].contentId, { status: status({ generationState: "succeeded" }) }));
    emit(snapshot(SCENES[0].contentId, { status: status({ generationState: "succeeded" }) }));

    expect(settled).toHaveLength(1);
    expect(settled[0].sceneId).toBe("scene-a");
  });

  it("does NOT settle on a local observation timeout — the job may still finish", () => {
    const fake = makeFakeObserver();
    const settled: SceneSnapshot[] = [];
    const seen: SceneSnapshot[] = [];
    observeSceneSet({
      scenes: [SCENES[0]],
      onSceneSnapshot: (s) => seen.push(s),
      onSceneSettled: (s) => settled.push(s),
      observe: fake.observe,
    });

    fake.emitters.get(SCENES[0].contentId)!(
      snapshot(SCENES[0].contentId, { status: status({ generationState: "timed_out" }), observationTimedOut: true }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].observationTimedOut).toBe(true);
    expect(settled).toEqual([]); // critically: not settled
  });

  it("one scene failing does not stop the others reporting (partial success)", () => {
    const fake = makeFakeObserver();
    const seen: SceneSnapshot[] = [];
    observeSceneSet({ scenes: SCENES, onSceneSnapshot: (s) => seen.push(s), observe: fake.observe });

    fake.emitters.get(SCENES[0].contentId)!(snapshot(SCENES[0].contentId, { status: status({ generationState: "failed" }) }));
    fake.emitters.get(SCENES[1].contentId)!(snapshot(SCENES[1].contentId, { status: status({ generationState: "succeeded" }), imageUrls: ["https://cdn/b.mp4"] }));

    expect(seen.map((s) => [s.sceneId, s.status.generationState])).toEqual([
      ["scene-a", "failed"],
      ["scene-b", "succeeded"],
    ]);
  });

  it("disposes one scene and everything, idempotently", () => {
    const fake = makeFakeObserver();
    const set = observeSceneSet({ scenes: SCENES, onSceneSnapshot: () => {}, observe: fake.observe });

    set.disposeScene("scene-a");
    set.disposeScene("scene-a"); // idempotent
    expect(fake.disposed).toEqual([SCENES[0].contentId]);
    expect(set.activeSceneIds()).toEqual(["scene-b"]);

    set.dispose();
    set.dispose(); // idempotent
    expect(fake.disposed).toEqual([SCENES[0].contentId, SCENES[1].contentId]);
    expect(set.activeSceneIds()).toEqual([]);
  });

  it("stops delivering snapshots after dispose", () => {
    const fake = makeFakeObserver();
    const seen: SceneSnapshot[] = [];
    const set = observeSceneSet({ scenes: [SCENES[0]], onSceneSnapshot: (s) => seen.push(s), observe: fake.observe });
    set.dispose();
    fake.emitters.get(SCENES[0].contentId)!(snapshot(SCENES[0].contentId));
    expect(seen).toEqual([]);
  });

  it("a throwing callback never breaks observation lifecycle", () => {
    const fake = makeFakeObserver();
    const set = observeSceneSet({
      scenes: [SCENES[0]],
      onSceneSnapshot: () => { throw new Error("boom"); },
      observe: fake.observe,
    });
    expect(() => fake.emitters.get(SCENES[0].contentId)!(snapshot(SCENES[0].contentId))).not.toThrow();
    expect(() => set.dispose()).not.toThrow();
  });
});
