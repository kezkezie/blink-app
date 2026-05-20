import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function dedupeHex(arr: string[]): string[] {
  return [...new Set(arr.map((c) => c.toLowerCase()))];
}

export async function POST(req: NextRequest) {
  const { website_url, social_urls } = await req.json();

  if (!website_url?.trim() && !social_urls?.trim()) {
    return NextResponse.json(
      { error: 'Provide at least a website URL or social URL.' },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI not configured.' }, { status: 500 });
  }

  // ── Scrape & extract technical signals from the website HTML ─────────────
  let websiteContent = '';
  let rawColors: string[] = [];
  let rawFonts: string[] = [];

  if (website_url?.trim()) {
    try {
      const res = await fetch(website_url.trim(), {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlinkBot/1.0)' },
      });
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch  = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

      // Extract hex color codes from CSS (inline styles + <style> blocks)
      const colorMatches = html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      rawColors = dedupeHex(colorMatches).slice(0, 30);

      // Extract font-family values from CSS
      const fontMatches = html.match(/font-family\s*:\s*([^;}"']+)/gi) ?? [];
      rawFonts = [...new Set(
        fontMatches
          .map((f) => f.replace(/font-family\s*:\s*/i, '').replace(/['"]/g, '').trim())
          .flatMap((f) => f.split(','))
          .map((f) => f.trim().replace(/^['"]+|['"]+$/g, ''))
          .filter((f) => f && !/inherit|initial|unset|var\(/i.test(f))
      )].slice(0, 12);

      const plainText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 2200);

      websiteContent = [
        titleMatch?.[1] ? `Page Title: ${titleMatch[1].trim()}` : null,
        descMatch?.[1]  ? `Meta Description: ${descMatch[1].trim()}` : null,
        rawColors.length ? `CSS Colors found: ${rawColors.join(', ')}` : null,
        rawFonts.length  ? `CSS Fonts found: ${rawFonts.join(', ')}` : null,
        `Page Text: ${plainText}`,
      ].filter(Boolean).join('\n');
    } catch {
      websiteContent = `Website URL (could not scrape, infer from domain): ${website_url}`;
    }
  }

  const socialContext = social_urls?.trim()
    ? `Social Media URLs:\n${social_urls.trim()}`
    : '';

  const prompt = `You are a brand identity analyst with deep expertise in visual design and brand systems.
Analyze the website data and/or social media URLs below and extract complete brand identity information.
Return ONLY valid JSON — no markdown, no code fences, no explanation.

${websiteContent}
${socialContext}

Return this exact JSON structure (all color values must be valid 6-digit hex codes like #1A2B3C):
{
  "brandName": "The marketing brand name. Short and punchy.",
  "companyName": "Legal entity name if different; otherwise same as brandName.",
  "description": "2–3 sentence description of what this brand does, who it serves, and its core value proposition.",
  "industry": "A single concise industry label (e.g. Fintech, Fashion, SaaS, Health & Wellness).",
  "brandVoice": "1–2 sentence description of the brand communication style and personality.",
  "toneKeywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "primaryColor": "#hexcode — the dominant brand color most prominent in the UI/logo",
  "secondaryColor": "#hexcode — a supporting color clearly used alongside the primary",
  "accentColor": "#hexcode — a highlight or call-to-action color",
  "primaryFont": "The main typeface name used for headings (e.g. Inter, Poppins). Return null if unknown.",
  "secondaryFont": "The secondary typeface for body text. Return null if unknown or same as primary."
}`;

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = (completion.choices[0].message.content ?? '')
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: 'AI returned unexpected data. Please try again.' },
        { status: 500 }
      );
    }

    // Validate hex codes — must start with # and be 4 or 7 chars
    const isValidHex = (v: unknown): v is string =>
      typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v.trim());

    return NextResponse.json({
      brandName:      String(extracted.brandName    ?? ''),
      companyName:    String(extracted.companyName  ?? ''),
      description:    String(extracted.description  ?? ''),
      industry:       String(extracted.industry     ?? ''),
      brandVoice:     String(extracted.brandVoice   ?? ''),
      toneKeywords:   Array.isArray(extracted.toneKeywords)
        ? (extracted.toneKeywords as unknown[]).map(String).slice(0, 6)
        : [],
      primaryColor:   isValidHex(extracted.primaryColor)   ? extracted.primaryColor.trim()   : null,
      secondaryColor: isValidHex(extracted.secondaryColor) ? extracted.secondaryColor.trim() : null,
      accentColor:    isValidHex(extracted.accentColor)    ? extracted.accentColor.trim()    : null,
      primaryFont:    extracted.primaryFont   && extracted.primaryFont   !== 'null' ? String(extracted.primaryFont)   : null,
      secondaryFont:  extracted.secondaryFont && extracted.secondaryFont !== 'null' ? String(extracted.secondaryFont) : null,
    });
  } catch (err: any) {
    if (err?.status === 429 || err?.code === 'insufficient_quota') {
      return NextResponse.json({ error: 'AI quota reached. Try again shortly.' }, { status: 429 });
    }
    console.error('[autofill] OpenAI error:', err?.message);
    return NextResponse.json(
      { error: 'Autofill failed. Please fill the form manually.' },
      { status: 500 }
    );
  }
}
