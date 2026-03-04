import { NextResponse } from 'next/server';

const N8N_DIRECTOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts";
const N8N_GENERATOR_URL = "https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let targetUrl = N8N_GENERATOR_URL;
    if (body.mode === 'director') {
      targetUrl = N8N_DIRECTOR_URL;
    }

    const n8nRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const rawText = await n8nRes.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      throw new Error("n8n backend failed to return valid JSON. Check your n8n execution logs.");
    }

    if (!n8nRes.ok) {
      throw new Error(data.message || `n8n responded with status ${n8nRes.status}`);
    }

    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}