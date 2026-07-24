import { NextRequest, NextResponse } from "next/server";
import {
  authenticateExecutionRequest,
  authorizeGenericExecutionPayload,
  authorizeImageWorkflow,
  isExecutionBodySizeAllowed,
  parseImageWorkflowRequest,
} from "@/lib/execution-security";

const ALLOWED_PATHS = new Set([
  "blink-generate-images",
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
      response = await fetch(targetUrl, { method: "POST", body: formData });
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
      if (path === "blink-generate-images") {
        const parsed = parseImageWorkflowRequest(body);
        if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        const authorized = await authorizeImageWorkflow(authenticated.value, parsed);
        if (!authorized.ok) return securityResponse(authorized);
        payload = authorized.value;
      } else {
        const authorized = await authorizeGenericExecutionPayload(authenticated.value, body);
        if (!authorized.ok) return securityResponse(authorized);
        payload = authorized.value;
      }

      response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
