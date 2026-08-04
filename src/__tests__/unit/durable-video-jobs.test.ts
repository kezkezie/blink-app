import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PERSISTED_SCENES,
  clearActiveSceneJob,
  clearAllActiveSceneJobs,
  persistActiveSceneJob,
  readActiveSceneJobs,
  type PersistedSceneJob,
} from "@/lib/durable-video-jobs";

const BRAND = "brand-1";
const OTHER_BRAND = "brand-2";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function makeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

let store: ReturnType<typeof makeStore>;
const jobA: PersistedSceneJob = { sceneId: "scene-a", sceneNumber: 1, contentId: ID_A };
const jobB: PersistedSceneJob = { sceneId: "scene-b", sceneNumber: 2, contentId: ID_B };

beforeEach(() => {
  store = makeStore();
});

describe("persist / read", () => {
  it("round-trips a set of in-flight scene jobs", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    persistActiveSceneJob(BRAND, jobB, store);
    expect(readActiveSceneJobs(BRAND, store)).toEqual([jobA, jobB]);
  });

  it("is scoped to the brand — another brand restores nothing", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    expect(readActiveSceneJobs(OTHER_BRAND, store)).toEqual([]);
  });

  it("replaces a scene's entry on retry rather than duplicating it", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    const retried = { ...jobA, contentId: ID_B };
    persistActiveSceneJob(BRAND, retried, store);
    const jobs = readActiveSceneJobs(BRAND, store);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].contentId).toBe(ID_B);
  });

  it("rejects malformed jobs instead of persisting junk", () => {
    persistActiveSceneJob(BRAND, { sceneId: "", sceneNumber: 1, contentId: ID_A }, store);
    persistActiveSceneJob(BRAND, { sceneId: "s", sceneNumber: 1, contentId: "not-a-uuid" } as PersistedSceneJob, store);
    persistActiveSceneJob(BRAND, { sceneId: "s", sceneNumber: 0, contentId: ID_A }, store);
    expect(readActiveSceneJobs(BRAND, store)).toEqual([]);
  });

  it("drops invalid entries found in storage", () => {
    store.setItem("blink-video-active-scenes", JSON.stringify({
      brandId: BRAND,
      jobs: [jobA, { sceneId: "bad", contentId: "nope", sceneNumber: 2 }, null, "x"],
    }));
    expect(readActiveSceneJobs(BRAND, store)).toEqual([jobA]);
  });

  it("survives corrupt JSON and a missing key", () => {
    expect(readActiveSceneJobs(BRAND, store)).toEqual([]);
    store.setItem("blink-video-active-scenes", "{not json");
    expect(readActiveSceneJobs(BRAND, store)).toEqual([]);
  });

  it("bounds the persisted set", () => {
    for (let i = 0; i < MAX_PERSISTED_SCENES + 10; i += 1) {
      persistActiveSceneJob(BRAND, { sceneId: `scene-${i}`, sceneNumber: i + 1, contentId: ID_A }, store);
    }
    expect(readActiveSceneJobs(BRAND, store).length).toBeLessThanOrEqual(MAX_PERSISTED_SCENES);
  });
});

describe("clear", () => {
  it("removes one settled scene and keeps the rest", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    persistActiveSceneJob(BRAND, jobB, store);
    clearActiveSceneJob(BRAND, jobA.sceneId, store);
    expect(readActiveSceneJobs(BRAND, store)).toEqual([jobB]);
  });

  it("removes the storage key entirely once the last scene settles", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    clearActiveSceneJob(BRAND, jobA.sceneId, store);
    expect(store.getItem("blink-video-active-scenes")).toBeNull();
  });

  it("clearAll drops everything", () => {
    persistActiveSceneJob(BRAND, jobA, store);
    clearAllActiveSceneJobs(store);
    expect(readActiveSceneJobs(BRAND, store)).toEqual([]);
  });
});
