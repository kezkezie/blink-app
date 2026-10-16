import { NextRequest, NextResponse, after } from "next/server";
import { authenticateExecutionRequest, isExecutionBodySizeAllowed } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { requestWorkspace } from "@/lib/brand-access";
import { assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { brandArg } from "@/lib/credits-meter";
import { isDeductionSuccessful } from "@/lib/credit-deduction";
import { loadBrandBrain } from "@/lib/sites/brain";
import { runSiteRefs } from "@/lib/sites/site-refs-server";
import { CODE_SYSTEM, SITE_LOOKS, SITE_PAGE_CREDITS, checkHtml, codeUserPrompt, extractHtml, fillImages, lookOf, pageTitle } from "@/lib/sites/code";

/**
 * POST { brandId, look, brief? }: Claude writes one landing page as a single HTML file (lib/sites/
 * code.ts) and the code streams back as it is written, as NDJSON lines:
 *   {"t":"code","d":"<text>"} ... then {"t":"done","page":{...}} or {"t":"error","error":"..."}.
 * One page per call (the studio asks for each look in parallel). SITE_PAGE_CREDITS each, taken
 * before and refunded if the page doesn't come back whole. The page is saved even if the browser
 * leaves before the end.
 */
export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PICTURES = 16;

type Usage = { input_tokens?: number; output_tokens?: number };

export async function POST(request: NextRequest) {
  if (!isExecutionBodySizeAllowed(request, 6_000)) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { brandId?: unknown; look?: unknown; brief?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" && UUID.test(body.brandId) ? body.brandId : null;
  const look = lookOf(body.look);
  const brief = typeof body.brief === "string" ? body.brief.replace(/\s+/g, " ").trim().slice(0, 1500) : "";
  if (!brandId || !look) return NextResponse.json({ error: "Pick a brand and a look." }, { status: 400 });

  const client = await requestWorkspace(request, auth.value, brandId);
  if (!client?.id) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["site_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });
  const brain = await loadBrandBrain(client.id, brandId);
  if (!brain) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

  let provider;
  try { provider = assistantProvider(); } catch { return NextResponse.json({ error: "The website studio isn't available right now." }, { status: 503 }); }
  if (provider.name !== "anthropic") return NextResponse.json({ error: "The website studio isn't available right now." }, { status: 503 });
  const model = assistantModelFor("chat", provider.name);

  const { data: deducted, error: deductError } = await supabaseAdmin.rpc("deduct_credits", {
    p_client_id: client.id, p_amount: SITE_PAGE_CREDITS, p_operation: "debit", p_description: `Website studio: ${SITE_LOOKS.find((l) => l.id === look)!.label} page`, ...brandArg(brandId),
  });
  if (!isDeductionSuccessful(deducted, deductError)) return NextResponse.json({ error: `A page is ${SITE_PAGE_CREDITS} credits and your balance is lower. Get more in Billing.` }, { status: 402 });
  const refund = (why: string) => supabaseAdmin.rpc("refund_credits", { p_client_id: client.id, p_amount: SITE_PAGE_CREDITS, p_operation: "refund", p_description: `Refund: ${why}`, ...brandArg(brandId) }).then(() => {}, () => {});

  const refs = await runSiteRefs(brandId, client.id, { cachedOnly: true }).catch(() => null);
  const images = brain.images.slice(0, MAX_PICTURES);
  const text = codeUserPrompt({
    brand: brain, look, brief, patterns: refs?.ok ? refs.value.patterns : null,
    captions: brain.chunks.filter((c) => c.kind === "post").map((c) => c.text),
  });
  // Claude looks at the pictures (small thumbnails) so it places them by what they show.
  const thumb = (u: string) => (u.includes("res.cloudinary.com") && u.includes("/upload/") ? u.replace("/upload/", "/upload/w_320,h_320,c_limit,f_jpg,q_70/") : u);
  const withPictures = [...images.flatMap((im, n) => [{ type: "text", text: `Picture ${n + 1}:` }, { type: "image", source: { type: "url", url: thumb(im.url) } }]), { type: "text", text }];
  const ask = (content: unknown) => fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 24000, stream: true, system: CODE_SYSTEM, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(285_000),
  }).catch(() => null);

  let upstream = await ask(images.length ? withPictures : text);
  // A picture Claude can't open fails the whole call; try once with words only.
  if (upstream && upstream.status === 400 && images.length) upstream = await ask(text);
  if (!upstream?.ok || !upstream.body) {
    console.warn("site code upstream", upstream?.status ?? "no response", (await upstream?.text().catch(() => ""))?.slice(0, 300));
    await refund("the website studio couldn't start");
    return NextResponse.json({ error: `Couldn't start writing the page. Your ${SITE_PAGE_CREDITS} credits were refunded. Try again.` }, { status: 502 });
  }

  const encoder = new TextEncoder();
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel() { open = false; } });
  const send = (o: object) => { if (!open || !controller) return; try { controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`)); } catch { open = false; } };
  // The work outlives the browser (after() keeps the function running), so a page that was paid for is saved.
  const work = (async () => {
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "", out = "", stop = "", failed = "";
    const usage: Usage = {};
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const event = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const data = event.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
          if (!data) continue;
          let e: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; message?: { usage?: Usage }; usage?: Usage; error?: { message?: string } };
          try { e = JSON.parse(data); } catch { continue; }
          if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) { out += e.delta.text; send({ t: "code", d: e.delta.text }); }
          else if (e.type === "message_start") Object.assign(usage, e.message?.usage);
          else if (e.type === "message_delta") { Object.assign(usage, e.usage); stop = e.delta?.stop_reason ?? stop; }
          else if (e.type === "error") failed = e.error?.message ?? "error";
        }
      }
    } catch (err) { failed = err instanceof Error ? err.message : "stream broke"; }

    const usd = estimateUsd(model, { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 });
    console.info("site code usage", JSON.stringify({ user: auth.value, brand: brandId, look, model, ...usage, stop, failed: failed || null, usd: usd === null ? null : Number(usd.toFixed(4)) }));
    const raw = failed ? null : extractHtml(out);
    const checked = raw ? checkHtml(fillImages(raw, images, brain.logoUrl)) : null;
    if (!checked?.ok) {
      await refund(stop === "max_tokens" ? "the page came out too long" : "the page didn't come back whole");
      send({ t: "error", error: `The page didn't come back whole. Your ${SITE_PAGE_CREDITS} credits were refunded. Try again.` });
    } else {
      const name = pageTitle(checked.html) || `${brain.name} · ${SITE_LOOKS.find((l) => l.id === look)!.label}`;
      const { data: page, error } = await supabaseAdmin.from("site_pages")
        .insert({ client_id: client.id, brand_id: brandId, name, html: checked.html, brief: brief || null, notes: look })
        .select("id, brand_id, name, html, brief, notes, parent_id, slug, published_at, created_at, updated_at").single();
      if (error || !page) { await refund("the page couldn't be saved"); send({ t: "error", error: `Couldn't save the page. Your ${SITE_PAGE_CREDITS} credits were refunded.` }); }
      else send({ t: "done", page });
    }
    if (open && controller) { try { (controller as ReadableStreamDefaultController<Uint8Array>).close(); } catch { /* closed by the browser */ } }
  })();
  after(work);
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
