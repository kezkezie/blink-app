import { NextRequest, NextResponse } from "next/server";
import {
  authenticateExecutionRequest,
  authorizeGenericExecutionPayload,
  authorizeImageWorkflow,
  isExecutionBodySizeAllowed,
  parseImageWorkflowRequest,
} from "@/lib/execution-security";
import { consumeExecutionRateLimit } from "@/lib/execution-rate-limit";
import { parseVideoWorkflowRequest } from "@/lib/video-execution";
import { loadOwnedBrandCreativeContext, toVideoWorkflowFields } from "@/lib/brand-creative-context";

const ALLOWED_PATHS = new Set([
  "blink-generate-images",
  "blink-generate-images-async", // durable async lane (Slice 5) — same image contract
  "blink-generate-video-v1",
  "blink-approval-response",
  "blink-brand-extract-001",
  "blink-suggest-visual",
]);

function securityResponse(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function POST(req: NextRequest) {
  try {
    const authenticated = await authenticateExecutionRequest(req);
    if (!authenticated.ok) return securityResponse(authenticated);

    const path = req.nextUrl.searchParams.get("path");
    if (!path) return NextResponse.json({ error: "Missing workflow path" }, { status: 400 });
    if (!ALLOWED_PATHS.has(path)) return NextResponse.json({ error: "Invalid workflow path" }, { status: 400 });
    if (!isExecutionBodySizeAllowed(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const n8nBaseUrl = process.env.N8N_WEBHOOK_BASE
      || process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE
      || "https://n8n.srv1166077.hstgr.cloud/webhook";
    const targetUrl = `${n8nBaseUrl}/${path}`;
    const contentType = req.headers.get("content-type") || "";
    let response: Response;

    if (contentType.includes("multipart/form-data")) {
      if (path === "blink-generate-images") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const formData = await req.formData();
      const identityFields: Record<string, string> = {};
      for (const key of ["client_id", "clientId", "brand_id", "brandId", "post_id", "postId"]) {
        const value = formData.get(key);
        if (typeof value === "string") identityFields[key] = value;
      }
      const authorized = await authorizeGenericExecutionPayload(authenticated.value, identityFields);
      if (!authorized.ok) return securityResponse(authorized);
      for (const key of ["client_id", "clientId", "brand_id", "brandId", "post_id", "postId"]) {
        const value = authorized.value[key];
        if (typeof value === "string") formData.set(key, value);
      }
      response = await fetch(targetUrl, {
        method: "POST",
        headers: process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {},
        body: formData,
      });
    } else {
      if (!contentType.includes("application/json")) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      let payload: Record<string, unknown>;
      if (path === "blink-generate-images" || path === "blink-generate-images-async") {
        const parsed = parseImageWorkflowRequest(body);
        if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        const authorized = await authorizeImageWorkflow(authenticated.value, parsed);
        if (!authorized.ok) return securityResponse(authorized);
        payload = authorized.value;
      } else if (path === "blink-generate-video-v1") {
        // Strict, bounded video payload validation BEFORE any quota or n8n work,
        // then canonical tenant/ownership resolution. Rejects unknown fields,
        // unknown modes/models, invalid durations/aspects, and unsafe URLs.
        const parsed = parseVideoWorkflowRequest(body);
        if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        const rateLimit = await consumeExecutionRateLimit(authenticated.value, "video_job");
        if (!rateLimit.ok) {
          return NextResponse.json(
            { error: "Video service is temporarily unavailable" },
            { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
          );
        }
        if (!rateLimit.allowed) {
          return NextResponse.json(
            { error: "Too many video requests. Please try again later.", retryAt: rateLimit.resetAt },
            { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
          );
        }
        // Re-attach the format-validated identity fields so ownership is
        // verified and only the canonical server-derived ids are forwarded.
        const authorized = await authorizeGenericExecutionPayload(authenticated.value, {
          ...parsed.payload,
          ...(parsed.requestedClientId ? { client_id: parsed.requestedClientId } : {}),
          ...(parsed.requestedBrandId ? { brand_id: parsed.requestedBrandId } : {}),
          ...(parsed.postId ? { post_id: parsed.postId } : {}),
        });
        if (!authorized.ok) return securityResponse(authorized);
        payload = authorized.value;

        // V6: brand identity is server-owned. Whatever `brand_name`/`brand_info`
        // the browser sent is DISCARDED and replaced with the canonical Brand
        // Creative Context v1 for the ownership-verified brand, so no surface can
        // send a brand's name or description on its behalf.
        const canonicalBrandId = typeof payload.brand_id === "string" ? payload.brand_id : null;
        if (canonicalBrandId) {
          const brandContext = await loadOwnedBrandCreativeContext(authenticated.value, canonicalBrandId);
          if (!brandContext.ok) return securityResponse({ status: brandContext.status, error: brandContext.error });
          payload = { ...payload, ...toVideoWorkflowFields(brandContext.context) };
        } else {
          // No brand in scope: never forward browser-authored brand identity.
          delete payload.brand_name;
          delete payload.brand_info;
        }
      } else {
        const authorized = await authorizeGenericExecutionPayload(authenticated.value, body);
        if (!authorized.ok) return securityResponse(authorized);
        payload = authorized.value;
      }

      response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET ? { "x-blink-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      return NextResponse.json({ error: "Generation service request failed" }, { status: 502 });
    }
    const data = await response.json().catch(() => ({ success: true }));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
