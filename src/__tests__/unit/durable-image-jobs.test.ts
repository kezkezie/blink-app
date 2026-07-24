import { describe, expect, it } from "vitest";
import {
  clearActiveImageJob,
  isDurableImageJobsEnabled,
  persistActiveImageJob,
  readActiveImageJob,
} from "@/lib/durable-image-jobs";

const BRAND_A = "brand-a";
const BRAND_B = "brand-b";
const JOB = "33333333-3333-4333-8333-333333333333";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    _map: map,
  };
}

describe("isDurableImageJobsEnabled (guarded rollout seam)", () => {
  it("is enabled anywhere when the explicit rollout flag is set", () => {
    expect(isDurableImageJobsEnabled({ rolloutFlag: "1" })).toBe(true);
    expect(isDurableImageJobsEnabled({ rolloutFlag: "1", testingMode: "false", search: "" })).toBe(true);
  });

  it("honours ?durableJobs=1 only in a non-production test runtime", () => {
    expect(isDurableImageJobsEnabled({ testingMode: "true", search: "?durableJobs=1" })).toBe(true);
    expect(isDurableImageJobsEnabled({ testingMode: "true", search: "?foo=bar" })).toBe(false);
    expect(isDurableImageJobsEnabled({ testingMode: "true", search: "" })).toBe(false);
    // Not a test runtime → the URL param cannot enable it.
    expect(isDurableImageJobsEnabled({ testingMode: undefined, search: "?durableJobs=1" })).toBe(false);
  });

  it("defaults to disabled (synchronous fallback)", () => {
    expect(isDurableImageJobsEnabled({})).toBe(false);
  });
});

describe("active-job restoration persistence (per brand)", () => {
  it("persists and restores one job for a brand, scoped by brand id", () => {
    const store = memoryStore();
    persistActiveImageJob(BRAND_A, JOB, store);
    expect(readActiveImageJob(BRAND_A, store)).toBe(JOB);
    expect(readActiveImageJob(BRAND_B, store)).toBeNull(); // different brand → no restore
  });

  it("rejects a stored non-UUID content id", () => {
    const store = memoryStore();
    store.setItem("blink-image-active-job", JSON.stringify({ brandId: BRAND_A, contentId: "not-a-uuid" }));
    expect(readActiveImageJob(BRAND_A, store)).toBeNull();
  });

  it("clears only when the content id matches", () => {
    const store = memoryStore();
    persistActiveImageJob(BRAND_A, JOB, store);
    clearActiveImageJob("some-other-id", store);
    expect(readActiveImageJob(BRAND_A, store)).toBe(JOB); // untouched
    clearActiveImageJob(JOB, store);
    expect(readActiveImageJob(BRAND_A, store)).toBeNull(); // removed
  });

  it("ignores empty brand or content id and malformed storage", () => {
    const store = memoryStore();
    persistActiveImageJob("", JOB, store);
    persistActiveImageJob(BRAND_A, "", store);
    expect(store._map.size).toBe(0);
    store.setItem("blink-image-active-job", "not json");
    expect(readActiveImageJob(BRAND_A, store)).toBeNull();
  });
});
