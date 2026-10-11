import { NextRequest, NextResponse } from "next/server";
import { authenticateExecutionRequest } from "@/lib/execution-security";
import { consumeAiLimits } from "@/lib/ai-rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";
import { AssistantUnavailableError, assistantModelFor, assistantProvider, estimateUsd } from "@/lib/assistant/agent";
import { safeFetchBytes } from "@/lib/safe-fetch";
import { extractSite, instagramHandle, normaliseWebsite, verifiedContact, type SiteFacts } from "@/lib/brand-autofill";
import { brandBrief, cleanDna, CTAS, INDUSTRIES, LANGUAGES, PERSONALITY, PHOTO_VIBES } from "@/lib/brand-dna";

/**
 * Fill a brand in for the user (2026-10-11).
 *  - mode "site": read their website and/or Instagram and propose every answer (sign-up, Brand page).
 *  - mode "gaps": from what the brand already has, suggest values for the empty fields only.
 *  - mode "describe": no website yet; from a name and a sentence, suggest the rest (sign-up).
 * Uses the cheaper chat model (about $0.01-0.02 a run). Contacts are kept only when they really
 * appear on the site; the logo found on the site is copied into the user's own folder.
 */
export const maxDuration = 60;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 BlinkSpotBot/1.0";

const SHAPE = `{"name":"","tagline":"max 8 words","description":"1-2 sentences, what they sell and to whom","industry":"one of: ${INDUSTRIES.join(" | ")}",
 "audience":"","location":"city/country if stated","usps":["max 3"],"offer":"only a current promo if stated","products":[{"name":"","price":0,"currency":"KES","description":""}],
 "tone":["max 3 of: ${PERSONALITY.join(", ")}"],"languages":["from: ${LANGUAGES.join(", ")}"],"photoVibes":["max 3 of: ${PHOTO_VIBES.join(", ")}"],
 "cta":"one of: ${CTAS.join(" | ")}","whatsapp":"","phone":"","email":"","guessed":["keys you inferred rather than read"]}`;

async function readPage(url: string) {
  const got = await safeFetchBytes(url, { maxBytes: 2_500_000, timeoutMs: 12_000, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  if (!got.ok || !/html/i.test(got.contentType)) return null;
  return { html: new TextDecoder().decode(got.bytes), finalUrl: got.finalUrl };
}

export async function POST(request: NextRequest) {
  const auth = await authenticateExecutionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const mode = body.mode === "gaps" ? "gaps" : body.mode === "describe" ? "describe" : "site";
  const { data: client } = await supabaseAdmin.from("clients").select("id").eq("user_id", auth.value).maybeSingle();
  if (!client?.id) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const limit = await consumeAiLimits(auth.value, ["brand_build"]);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status });

  let facts: SiteFacts | null = null;
  let insta: { handle: string; title?: string; description?: string } | null = null;
  let brandLines = "";
  let empty: string[] = [];

  if (mode === "site") {
    const site = typeof body.website === "string" ? normaliseWebsite(body.website) : null;
    const handle = typeof body.instagram === "string" ? instagramHandle(body.instagram) : null;
    if (!site && !handle) return NextResponse.json({ error: "Add your website or Instagram." }, { status: 400 });
    if (site) {
      const page = await readPage(site);
      if (page) {
        facts = extractSite(page.html, page.finalUrl);
        // One more page (about / menu / products) usually holds the story and the prices.
        const more = facts.moreLinks[0] ? await readPage(facts.moreLinks[0]) : null;
        if (more) { const f2 = extractSite(more.html, more.finalUrl); facts.text = `${facts.text}\n\n--- ${more.finalUrl}\n${f2.text}`.slice(0, 11000); facts.phones.push(...f2.phones); facts.emails.push(...f2.emails); facts.whatsapp.push(...f2.whatsapp); }
      }
    }
    if (handle) {
      const page = await readPage(`https://www.instagram.com/${handle}/`);
      if (page) { const f = extractSite(page.html, page.finalUrl); insta = { handle, title: f.title, description: f.description }; }
      else insta = { handle };
    }
    if (!facts && !insta?.description) return NextResponse.json({ error: "Couldn't read that site. Check the address, or fill it in by hand." }, { status: 422 });
  } else if (mode === "describe") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const what = typeof body.description === "string" ? body.description.trim().slice(0, 800) : "";
    if (what.length < 8) return NextResponse.json({ error: "Say what the business does first." }, { status: 400 });
    brandLines = `Brand: ${name || "(no name yet)"}\nWhat they do: ${what}${typeof body.location === "string" && body.location.trim() ? `\nBased in: ${body.location.trim().slice(0, 120)}` : ""}`;
    empty = ["tagline", "description", "industry", "audience", "usps", "tone", "languages", "photoVibes", "cta"];
  } else {
    const brandId = typeof body.brandId === "string" ? body.brandId : "";
    const [{ data: b }, { data: products }] = await Promise.all([
      supabaseAdmin.from("brand_profiles").select("*").eq("id", brandId).eq("client_id", client.id).maybeSingle(),
      supabaseAdmin.from("products").select("name, description, price, currency").eq("brand_id", brandId).eq("client_id", client.id).limit(12),
    ]);
    if (!b) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    const dna = cleanDna(b.dna);
    brandLines = brandBrief(b, dna, products ?? []);
    const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : !!v);
    const checks: Record<string, unknown> = { tagline: dna.tagline, description: b.description, industry: b.industry, audience: dna.audience, usps: dna.usps, tone: b.tone_keywords, languages: dna.languages, photoVibes: dna.photoVibes, cta: dna.cta };
    empty = Object.entries(checks).filter(([, v]) => !has(v)).map(([k]) => k);
    if (!empty.length) return NextResponse.json({ fields: {}, guessed: [], note: "Nothing left to fill." });
  }

  let provider;
  try { provider = assistantProvider(); } catch (e) {
    if (e instanceof AssistantUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const model = assistantModelFor("chat", provider.name);
  const system = mode === "site"
    ? `You fill in a brand profile from what a business says about itself online. Reply with JSON only, this shape:\n${SHAPE}\nRules: copy facts that are stated; never invent prices, contacts, addresses or offers. You may infer audience, tone, photoVibes, languages and cta from the content; list every inferred key in "guessed". Leave a field out when unknown. Products only if names are listed (prices only if shown).`
    : `You help finish a brand profile. Given what the brand already has, suggest values ONLY for these empty fields: ${empty.join(", ")}. Reply with JSON only, using these keys from this shape:\n${SHAPE}\nEverything you add is a suggestion: put every key you fill in "guessed". Never invent prices, contacts or offers.`;
  const user = mode === "site"
    ? [
        facts ? `Website ${facts.url}\nTitle: ${facts.title ?? ""}\nDescription: ${facts.description ?? ""}\nStructured data: ${JSON.stringify(facts.jsonld)}\nPhones seen: ${facts.phones.join(", ")}\nEmails seen: ${facts.emails.join(", ")}\nWhatsApp seen: ${facts.whatsapp.join(", ")}\nSocial links: ${facts.socials.join(", ")}\n\nPage text:\n${facts.text}` : "",
        insta ? `Instagram @${insta.handle}: ${[insta.title, insta.description].filter(Boolean).join(" — ") || "(profile not readable)"}` : "",
        typeof body.name === "string" && body.name.trim() ? `The owner says the brand is called: ${body.name.trim().slice(0, 80)}` : "",
      ].filter(Boolean).join("\n\n")
    : `The brand so far:\n${brandLines}`;

  const res = await fetch(provider.url, {
    method: "POST",
    headers: { ...provider.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1800, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(50_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "That took too long. Try again." }, { status: 504 });
  const data = (await res.json().catch(() => ({}))) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const usd = estimateUsd(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 });
  console.info("brand autofill usage", JSON.stringify({ user: auth.value, mode, model, ...data.usage, usd: usd === null ? null : Number(usd.toFixed(4)) }));
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let out: Record<string, unknown>;
  try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Couldn't read enough to fill it in. Try again or fill it in by hand." }, { status: 502 }); }

  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const pick = (v: unknown, allowed: string[], n: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))].slice(0, n) : undefined);
  const fields: Record<string, unknown> = {
    name: str(out.name, 80), tagline: str(out.tagline, 90), description: str(out.description, 600),
    industry: typeof out.industry === "string" && INDUSTRIES.includes(out.industry) ? out.industry : undefined,
    audience: str(out.audience, 300), location: str(out.location, 120),
    usps: Array.isArray(out.usps) ? out.usps.filter((x): x is string => typeof x === "string").slice(0, 3).map((x) => x.slice(0, 120)) : undefined,
    offer: str(out.offer, 200),
    tone: pick(out.tone, PERSONALITY, 3), languages: pick(out.languages, LANGUAGES, 3), photoVibes: pick(out.photoVibes, PHOTO_VIBES, 3),
    cta: typeof out.cta === "string" && CTAS.includes(out.cta) ? out.cta : undefined,
  };
  if (mode === "site" && facts) {
    // Contacts and products only from what was actually on the page.
    const seenPhones = [...facts.phones, ...facts.whatsapp, facts.jsonld.telephone ?? ""];
    fields.whatsapp = verifiedContact(out.whatsapp, [...facts.whatsapp, ...facts.phones], "phone");
    fields.phone = verifiedContact(out.phone, seenPhones, "phone");
    fields.email = verifiedContact(out.email, [...facts.emails, facts.jsonld.email ?? ""], "email");
    fields.website = facts.url;
    fields.socials = facts.socials.slice(0, 6);
    if (Array.isArray(out.products)) {
      const page = facts.text.toLowerCase();
      fields.products = out.products.slice(0, 12).map((p) => p as Record<string, unknown>)
        .filter((p) => typeof p.name === "string" && page.includes(String(p.name).toLowerCase().slice(0, 24)))
        .map((p) => ({ name: String(p.name).slice(0, 100), description: str(p.description, 300), price: typeof p.price === "number" && p.price > 0 && page.includes(String(p.price)) ? p.price : null, currency: typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : "KES" }));
    }
    fields.themeColor = facts.themeColor;
    // Copy the site's logo into the user's own folder (only real images, no SVG).
    for (const cand of facts.logoCandidates) {
      const got = await safeFetchBytes(cand, { maxBytes: 3_000_000, timeoutMs: 10_000, headers: { "User-Agent": UA } });
      if (!got.ok || !/^image\/(png|jpe?g|webp|gif)/i.test(got.contentType) || got.bytes.length < 600) continue;
      const ext = got.contentType.includes("png") ? "png" : got.contentType.includes("webp") ? "webp" : got.contentType.includes("gif") ? "gif" : "jpg";
      const path = `images/${client.id}/logo_site_${Date.now()}.${ext}`;
      const { error } = await supabaseAdmin.storage.from("assets").upload(path, got.bytes, { contentType: got.contentType });
      if (!error) { fields.logoUrl = supabaseAdmin.storage.from("assets").getPublicUrl(path).data.publicUrl; break; }
    }
  }
  if (mode !== "site") for (const k of Object.keys(fields)) if (!empty.includes(k)) delete fields[k];
  for (const k of Object.keys(fields)) if (fields[k] === undefined || (Array.isArray(fields[k]) && !(fields[k] as unknown[]).length)) delete fields[k];
  const guessed = Array.isArray(out.guessed) ? out.guessed.filter((x): x is string => typeof x === "string" && x in fields) : [];
  return NextResponse.json({ fields, guessed: mode === "site" ? guessed : Object.keys(fields), sources: { website: facts?.url ?? null, instagram: insta?.handle ?? null } });
}
