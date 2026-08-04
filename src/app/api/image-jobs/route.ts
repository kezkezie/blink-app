import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { createImageJobPlaceholder, isValidContentId, loadOwnedImageJob, parseImageJobRequest } from "@/lib/image-job";
import { deriveStatusFromContentRow } from "@/lib/image-generation-state";

/**
 * GET /api/image-jobs?id=<contentId> — restore a job's durable state (Slice 5
 * polling fallback for refresh/navigation recovery). Authenticates, verifies the
 * job belongs to the caller's client, and returns the unified status derived
 * from the persisted envelope. Read-only: no provider, n8n, or billing work.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateExecutionRequest(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const id = req.nextUrl.searchParams.get("id");
    if (!isValidContentId(id)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await loadOwnedImageJob(auth.value, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const status = deriveStatusFromContentRow(result.value);
    // A row that exists but carries no generation envelope is not a job.
    if (!status) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

    const imageUrls = Array.isArray(result.value.image_urls)
      ? result.value.image_urls.filter((u): u is string => typeof u === "string")
      : [];

    return NextResponse.json(
      { id: result.value.id, status, image_urls: imageUrls },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/image-jobs — create a durable, tenant-owned image-generation
 * placeholder (Slice 4). Authenticates before any tenant work, validates input
 * strictly, and returns the same placeholder for a repeated idempotency key.
 * This endpoint never executes generation, billing, or n8n.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isExecutionBodySizeAllowed(req)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const auth = await authenticateExecutionRequest(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const input = parseImageJobRequest(body);
    if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await createImageJobPlaceholder(auth.value, input);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json(
      {
        id: result.value.id,
        generation_state: result.value.generationState,
        billing_state: result.value.billingState,
        retry_state: result.value.retryState,
        attempt: result.value.attempt,
        credit_cost: result.value.creditCost,
        idempotent: result.value.idempotent,
      },
      { status: result.value.idempotent ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
