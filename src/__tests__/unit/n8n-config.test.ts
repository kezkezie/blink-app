import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { n8nWebhookUrl, resolveN8nWebhookBase, N8N_WEBHOOKS } from "@/lib/n8n-config";

const DEFAULT = "https://n8n.srv1166077.hstgr.cloud/webhook";
const SNAP = { base: process.env.N8N_WEBHOOK_BASE, pub: process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE };

beforeEach(() => {
  delete process.env.N8N_WEBHOOK_BASE;
  delete process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE;
});
afterEach(() => {
  if (SNAP.base === undefined) delete process.env.N8N_WEBHOOK_BASE; else process.env.N8N_WEBHOOK_BASE = SNAP.base;
  if (SNAP.pub === undefined) delete process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE; else process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE = SNAP.pub;
});

describe("resolveN8nWebhookBase", () => {
  it("falls back to the known default when unset", () => {
    expect(resolveN8nWebhookBase()).toBe(DEFAULT);
  });
  it("uses a configured https base and strips trailing slashes", () => {
    process.env.N8N_WEBHOOK_BASE = "https://n8n.example.com/webhook/";
    expect(resolveN8nWebhookBase()).toBe("https://n8n.example.com/webhook");
  });
  it("rejects a non-https base and falls back to the default", () => {
    process.env.N8N_WEBHOOK_BASE = "http://insecure.example/webhook";
    expect(resolveN8nWebhookBase()).toBe(DEFAULT);
  });
  it("rejects a malformed base and falls back to the default", () => {
    process.env.N8N_WEBHOOK_BASE = "not a url";
    expect(resolveN8nWebhookBase()).toBe(DEFAULT);
  });
});

describe("n8nWebhookUrl", () => {
  it("builds a URL only from the fixed webhook allowlist", () => {
    expect(n8nWebhookUrl("generateVideoV1")).toBe(`${DEFAULT}/blink-generate-video-v1`);
    expect(n8nWebhookUrl("aiDirectorPrompts")).toBe(`${DEFAULT}/ai-director-prompts`);
    // The set of reachable webhooks is closed and explicit.
    expect(Object.keys(N8N_WEBHOOKS)).toEqual(
      expect.arrayContaining(["aiDirectorPrompts", "generateSingleFrame", "generateVideoV1"])
    );
  });
});
