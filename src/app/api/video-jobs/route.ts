import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import {
  createVideoJobPlaceholder,
  isValidContentId,
  loadOwnedVideoJob,
  parseVideoJobRequest,
} from "@/lib/video-job";
import { sceneSpecFromCreationMetadata } from "@/lib/scene-spec-adapters";

/**
 * GET /api/video-jobs?id=<contentId> — restore one owned video job's durable
 * envelope (state triplet, attempt, status text) together with its persisted
 * SceneSpec. Authenticates, verifies the job belongs to the caller's client, and
 * returns an identical 404 for missing and cross-tenant rows. Read-only: no
 * provider, n8n, or billing work.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateExecutionRequest(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const id = req.nextUrl.searchParams.get("id");
    if (!isValidContentId(id)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await loadOwnedVideoJob(auth.value, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const row = result.value;
    // A row that exists but carries no generation envelope is not a job.
    if (typeof row.generation_state !== "string") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    // `video_urls` may be an array or a JSON-encoded string in existing rows.
    const rawUrls = row.video_urls;
    let videoUrls: string[] = [];
    if (Array.isArray(rawUrls)) {
      videoUrls = rawUrls.filter((u): u is string => typeof u === "string");
    } else if (typeof rawUrls === "string") {
      try {
        const parsed = JSON.parse(rawUrls);
        videoUrls = Array.isArray(parsed)
          ? parsed.filter((u): u is string => typeof u === "string")
          : [rawUrls];
      } catch {
        videoUrls = [rawUrls];
      }
    }
    if (videoUrls.length === 0 && typeof row.video_url === "string") videoUrls = [row.video_url];

    // ── Compatibility bridge (remove once n8n writes the durable envelope) ───
    // The live video workflow currently reports completion by writing
    // `video_urls` (and failure via legacy `status`/`error_message`); it does not
    // yet advance `generation_state` — that is the separately-gated async-ack
    // change. Without this bridge a finished scene would sit at "queued"
    // forever and the client would never settle, which would REGRESS today's
    // working behaviour. So: a playable asset is reported as succeeded, and a
    // legacy failed row as failed, but ONLY while the envelope has not advanced
    // past an in-flight state. A durable state always wins over this inference.
    const IN_FLIGHT = new Set(["queued", "preparing", "generating", "saving"]);
    let generationState = row.generation_state as string;
    let message = typeof row.generation_status_text === "string" ? row.generation_status_text : null;
    let errorCode = typeof row.generation_error_code === "string" ? row.generation_error_code : null;

    if (IN_FLIGHT.has(generationState)) {
      const playable = videoUrls.some((u) => u.startsWith("http"));
      if (playable) {
        generationState = "succeeded";
      } else if (row.status === "failed") {
        generationState = "failed";
        message = typeof row.error_message === "string" && row.error_message ? row.error_message : message;
        errorCode = errorCode ?? "provider_failed";
      }
    }

    return NextResponse.json(
      {
        id: row.id,
        status: {
          generationState,
          billingState: typeof row.billing_state === "string" ? row.billing_state : "not_charged",
          retryState: typeof row.retry_state === "string" ? row.retry_state : "none",
          message,
          errorCode,
          attempt: typeof row.generation_attempt === "number" ? row.generation_attempt : 1,
        },
        video_urls: videoUrls,
        scene_spec: sceneSpecFromCreationMetadata(row.creation_metadata),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/video-jobs — create a durable, tenant-owned video-generation
 * placeholder carrying its validated SceneSpec (V3). Authenticates before any
 * tenant work, validates input strictly, and returns the same placeholder for a
 * repeated idempotency key so a double submit can never create two jobs (and so
 * never two n8n deductions). This endpoint never executes generation, billing,
 * or n8n.
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

    const input = parseVideoJobRequest(body);
    if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await createVideoJobPlaceholder(auth.value, input);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json(
      {
        id: result.value.id,
        generation_state: result.value.generationState,
        billing_state: result.value.billingState,
        retry_state: result.value.retryState,
        attempt: result.value.attempt,
        idempotent: result.value.idempotent,
      },
      { status: result.value.idempotent ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
