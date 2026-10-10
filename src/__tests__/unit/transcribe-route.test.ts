import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock("@/lib/execution-security", () => ({ authenticateExecutionRequest: mocks.authenticate }));

import { POST } from "@/app/api/transcribe/route";
import { contactRule } from "@/lib/inspo";

function req(audio?: Blob, hint?: string) {
  const form = new FormData();
  if (audio) form.append("audio", audio, "voice");
  if (hint) form.append("hint", hint);
  return new NextRequest("http://localhost/api/transcribe", { method: "POST", body: form });
}

describe("voice input (/api/transcribe)", () => {
  const key = process.env.OPENAI_API_KEY;
  const realFetch = globalThis.fetch;
  beforeEach(() => { process.env.OPENAI_API_KEY = "sk-test"; mocks.authenticate.mockResolvedValue({ ok: true, value: "user-1" }); });
  afterEach(() => { process.env.OPENAI_API_KEY = key; globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("needs a signed-in user", async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    expect((await POST(req(new Blob(["x"], { type: "audio/webm" })))).status).toBe(401);
  });

  it("refuses non-audio and empty uploads", async () => {
    expect((await POST(req(new Blob(["<svg/>"], { type: "image/svg+xml" })))).status).toBe(415);
    expect((await POST(req())).status).toBe(400);
  });

  it("sends the clip to Whisper with the brand spelling hint and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: " Make a poster for Mama Njeri Kitchen " }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await POST(req(new Blob([new Uint8Array(4000)], { type: "audio/webm;codecs=opus" }), "The brand is Mama Njeri Kitchen."));
    expect(await res.json()).toEqual({ text: "Make a poster for Mama Njeri Kitchen" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const sent = init.body as FormData;
    expect(sent.get("model")).toBe("whisper-1");
    expect(sent.get("prompt")).toBe("The brand is Mama Njeri Kitchen.");
    expect((sent.get("file") as File).name).toBe("voice.webm");
  });

  it("says so when it is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await POST(req(new Blob(["x"], { type: "audio/webm" })))).status).toBe(503);
  });
});

describe("contact details on designs", () => {
  it("only allows the brand's own and forbids invented numbers", () => {
    const r = contactRule("https://annabelle.co.ke", "instagram.com/annabelleherself");
    expect(r).toMatch(/Never invent phone numbers/);
    expect(r).toMatch(/only contact details allowed are: https:\/\/annabelle\.co\.ke, instagram\.com\/annabelleherself/);
    expect(contactRule()).toMatch(/no contact details on file, so show none/);
  });
});
