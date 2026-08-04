// Centralized, validated n8n webhook configuration.
//
// Every server route that reaches n8n resolves its target here instead of
// pasting a hard-coded production URL inline (the V1 video-security boundary
// removes those literals). The webhook path is chosen from a fixed allowlist,
// so a caller can never steer a request to an arbitrary webhook, and the base
// is validated to be an https origin before use.

const DEFAULT_N8N_WEBHOOK_BASE = "https://n8n.srv1166077.hstgr.cloud/webhook";

// Every webhook the application is allowed to invoke, by stable logical name.
// Adding a webhook here is a deliberate, reviewable change.
export const N8N_WEBHOOKS = {
  aiDirectorPrompts: "ai-director-prompts",
  generateSingleFrame: "generate-single-frame",
  generateVideoV1: "blink-generate-video-v1",
  motionBrushV1: "blink-motion-brush-v1",
  motionTransferV1: "blink-motion-transfer-v1",
  xrayImageV1: "blink-xray-image-v1",
  jsonEditV1: "blink-json-edit-v1",
} as const;

export type N8nWebhookName = keyof typeof N8N_WEBHOOKS;

// Resolve and validate the configured webhook base (server env first, then the
// public base, then the known default). A misconfigured, non-https, or invalid
// base falls back to the default rather than issuing a request to an untrusted
// origin.
export function resolveN8nWebhookBase(): string {
  const configured =
    process.env.N8N_WEBHOOK_BASE ||
    process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE ||
    DEFAULT_N8N_WEBHOOK_BASE;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") return DEFAULT_N8N_WEBHOOK_BASE;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return DEFAULT_N8N_WEBHOOK_BASE;
  }
}

// Build the full URL for an allowlisted webhook name.
export function n8nWebhookUrl(name: N8nWebhookName): string {
  return `${resolveN8nWebhookBase()}/${N8N_WEBHOOKS[name]}`;
}
