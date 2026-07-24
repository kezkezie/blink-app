import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestFixtureRequest, testModeEnabled } from "@/lib/test-mode";

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("testModeEnabled", () => {
  it("is false in a production runtime even when the server flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    expect(testModeEnabled()).toBe(false);
  });

  it("is true only in a non-production runtime with the server-only flag set", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    expect(testModeEnabled()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(testModeEnabled()).toBe(true);
  });

  it("is false in non-production when the server flag is missing or disabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "");
    expect(testModeEnabled()).toBe(false);
    vi.stubEnv("BLINKSPOT_TEST_MODE", "0");
    expect(testModeEnabled()).toBe(false);
    vi.stubEnv("BLINKSPOT_TEST_MODE", "true");
    expect(testModeEnabled()).toBe(false);
  });
});

describe("isTestFixtureRequest", () => {
  it("never authorizes in production regardless of header or flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    expect(isTestFixtureRequest(headers({ "x-blinkspot-test-fixture": "1" }))).toBe(false);
  });

  it("requires both the enabled runtime and the exact header value", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "1");
    expect(isTestFixtureRequest(headers({ "x-blinkspot-test-fixture": "1" }))).toBe(true);
    expect(isTestFixtureRequest(headers({}))).toBe(false);
    expect(isTestFixtureRequest(headers({ "x-blinkspot-test-fixture": "0" }))).toBe(false);
  });

  it("does not authorize on the header alone when the runtime is not enabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BLINKSPOT_TEST_MODE", "");
    expect(isTestFixtureRequest(headers({ "x-blinkspot-test-fixture": "1" }))).toBe(false);
  });
});
