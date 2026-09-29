import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  CREATIVE_FORMATS,
  fallbackCreativeDirection,
  normalizeConceptsForFormats,
  parseCreativeDirection,
} from "@/lib/assisted-creation";
import { consumeAssistedCreationRateLimit } from "@/lib/assisted-creation-rate-limit";
import { loadOwnedAssistedBrandContext, parseAssistedCreationRequest, verifyOwnedInspirationImage } from "@/lib/assisted-creation-server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isTestFixtureRequest } from "@/lib/test-mode";
import { complete } from "@/lib/llm";
import { isDeductionSuccessful } from "@/lib/credit-deduction";

// Small fixed charge for an image-driven concept generation (a GPT-4o vision call).
// Text-only concepts stay free. Deducted upfront, refunded on failure/fallback.
const INSPIRATION_ANALYSIS_COST = 1;

function extractJson(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

async function askForJson(system: string, user: string, imageUrl?: string): Promise<unknown> {
  // Provider-neutral adapter: model/limits live in LLM_TASKS.assistedCreation,
  // and calls are time-bounded with retries on transient failures.
  const content = await complete({
    task: "assistedCreation",
    system,
    user,
    json: true,
    ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
  });
  return extractJson(content);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const input = parseAssistedCreationRequest(body);
    if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    // Caller capability: which formats the calling surface can execute.
    const allowedFormats = input.allowedFormats ?? CREATIVE_FORMATS;

    // A direction may only be developed for a concept the caller can execute.
    // Legacy drafts can still hold video/carousel selections; they must not
    // silently become an image direction. Reject before any quota or tenant work.
    if (input.operation === "direction" && !allowedFormats.includes(input.concept.format)) {
      return NextResponse.json(
        {
          error: "This concept format isn't available in Image Studio yet. Create new concepts to continue.",
          code: "unsupported_format",
        },
        { status: 400 }
      );
    }

    const rateLimit = await consumeAssistedCreationRateLimit(user.id, input.operation);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Assisted creation is temporarily unavailable" },
        { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
      );
    }
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many assisted-creation requests. Please try again later.",
          retryAt: rateLimit.resetAt,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const ownedBrand = await loadOwnedAssistedBrandContext(user.id, input.brandId);
    if (!ownedBrand.ok) return NextResponse.json({ error: ownedBrand.error }, { status: ownedBrand.status });

    const brandBrief = JSON.stringify(ownedBrand.context);
    if (input.operation === "concepts") {
      const brandName = ownedBrand.context.name;
      const inspirationImageUrl = input.inspirationImageUrl;

      if (isTestFixtureRequest(req.headers)) {
        // Deterministic fixture path stays free (no AI, no billing).
        const fixture = normalizeConceptsForFormats(null, allowedFormats, input.idea, brandName);
        return NextResponse.json({ concepts: fixture.concepts, fallback: true });
      }

      // Image-driven concepts: verify ownership of the image and charge a small,
      // refundable fee (a GPT-4o vision call). Text-only concepts remain free.
      let chargedClientId: string | null = null;
      if (inspirationImageUrl) {
        const owned = await verifyOwnedInspirationImage(ownedBrand.clientId, inspirationImageUrl);
        if (!owned) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

        const { data: deductData, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
          p_client_id: ownedBrand.clientId,
          p_amount: INSPIRATION_ANALYSIS_COST,
          p_operation: "inspiration_concepts",
          p_description: "Inspiration image → concepts",
        });
        if (!isDeductionSuccessful(deductData, deductError)) {
          return NextResponse.json({ error: "Insufficient credits. Please top up." }, { status: 402 });
        }
        chargedClientId = ownedBrand.clientId;
      }

      const refundInspiration = async () => {
        if (!chargedClientId) return;
        try {
          await supabaseAdmin.rpc("refund_credits", {
            p_client_id: chargedClientId,
            p_amount: INSPIRATION_ANALYSIS_COST,
            p_operation: "refund",
            p_description: "Refund: inspiration concepts unavailable",
          });
        } catch { /* best-effort; logged upstream */ }
        chargedClientId = null;
      };

      const formatEnum = allowedFormats.map((format) => `"${format}"`).join("|");
      const system = inspirationImageUrl
        ? `You are BlinkSpot's creative director. The user shares an INSPIRATION IMAGE. Study its colors, composition, lighting, subject, materials, and mood, then return exactly three genuinely distinct, brand-aware creative concepts INSPIRED BY it (never a copy). Every concept's format MUST be one of: ${allowedFormats.join(", ")}. Keep provider/model details hidden. JSON only: {"concepts":[{"title":string,"idea":string,"angle":string,"format":${formatEnum}}]}.`
        : `You are BlinkSpot's creative director. Return exactly three genuinely distinct, brand-aware creative concepts. Every concept's format MUST be one of the allowed formats: ${allowedFormats.join(", ")}. Keep provider/model details hidden. JSON only: {"concepts":[{"title":string,"idea":string,"angle":string,"format":${formatEnum}}]}.`;
      const userPrompt = inspirationImageUrl
        ? `Brand context: ${brandBrief}\n${input.idea ? `Extra steer from the user: ${input.idea}\n` : ""}Base the concepts on the attached inspiration image.`
        : `Brand context: ${brandBrief}\nUser idea: ${input.idea}`;

      try {
        const raw = await askForJson(system, userPrompt, inspirationImageUrl);
        // Enforce, never trust: disallowed formats are dropped (not relabelled)
        // and missing slots are repaired with distinct executable fallbacks.
        const { concepts, repaired } = normalizeConceptsForFormats(raw, allowedFormats, input.idea, brandName);
        // If the AI output had to be repaired to fallbacks, the user didn't get the
        // paid vision value — refund the inspiration charge.
        if (repaired) await refundInspiration();
        return NextResponse.json({ concepts, fallback: repaired });
      } catch {
        await refundInspiration();
        const repairedSet = normalizeConceptsForFormats(null, allowedFormats, input.idea, brandName);
        return NextResponse.json({ concepts: repairedSet.concepts, fallback: true });
      }
    }

    const safeConcept = input.concept;
    const fallback = fallbackCreativeDirection(safeConcept, allowedFormats);
    if (isTestFixtureRequest(req.headers)) {
      return NextResponse.json({ direction: fallback, fallback: true });
    }
    try {
      const raw = await askForJson(
        `Develop the selected concept into a concise production-ready creative direction. JSON only with visualDirection, tone, composition, outputType (${allowedFormats.join("|")}), style (studio|lifestyle|cinematic|poster|brand|abstract|flatlay), and editable summary. Do not mention AI models.`,
        `Brand context: ${brandBrief}\nOriginal idea: ${input.idea}\nSelected concept: ${JSON.stringify(safeConcept)}`
      );
      const direction = parseCreativeDirection(raw);
      // A direction whose outputType the caller cannot execute is replaced by an
      // executable fallback — never silently relabelled as if it were native.
      const usable = direction && allowedFormats.includes(direction.outputType) ? direction : null;
      return NextResponse.json({ direction: usable ?? fallback, fallback: !usable });
    } catch {
      return NextResponse.json({ direction: fallback, fallback: true });
    }
  } catch {
    return NextResponse.json({ error: "Unable to develop the idea" }, { status: 500 });
  }
}
