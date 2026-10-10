import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  auth: vi.fn(), owned: vi.fn(), rpc: vi.fn(), upload: vi.fn(), bytes: vi.fn(),
}));
vi.mock("@/lib/execution-security", () => ({ authenticateExecutionRequest: h.auth }));
vi.mock("@/lib/assisted-creation-server", () => ({ verifyOwnedInspirationImage: h.owned }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetchBytes: h.bytes }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "client-1" } }) }) }) }),
    rpc: h.rpc,
    storage: { from: () => ({ upload: h.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://store.test/${p}` } }) }) },
  },
}));

import { POST } from "@/app/api/editor/face-swap/route";

const PHOTO = "https://store.test/images/client-1/editor_ai_1.png";
const FACE = "https://store.test/images/client-1/editor_face_1.jpg";
const req = (body: unknown) => new NextRequest("http://localhost/api/editor/face-swap", { method: "POST", body: JSON.stringify(body) });
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.REPLICATE_API_TOKEN = "r8_test";
  h.auth.mockResolvedValue({ ok: true, value: "user-1" });
  h.owned.mockResolvedValue(true);
  h.rpc.mockResolvedValue({ data: { success: true }, error: null });
  h.upload.mockResolvedValue({ error: null });
  h.bytes.mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("POST /api/editor/face-swap", () => {
  it("refuses photos that aren't the user's own, before charging anything", async () => {
    h.owned.mockImplementation(async (_c: string, u: string) => u === PHOTO);
    const res = await POST(req({ url: PHOTO, face: "https://evil.test/x.jpg" }));
    expect(res.status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("charges 3 credits, sends the photo as input_image and the face as swap_image, and re-hosts the result", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded", output: "https://replicate.delivery/out.jpg" })));
    const res = await POST(req({ url: PHOTO, face: FACE }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("deduct_credits", expect.objectContaining({ p_client_id: "client-1", p_amount: 3, p_operation: "debit" }));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.input).toEqual({ input_image: PHOTO, swap_image: FACE });
    expect(data.url).toMatch(/^https:\/\/store\.test\/images\/client-1\/faceswap_\d+\.jpg$/);
    expect(h.rpc).not.toHaveBeenCalledWith("refund_credits", expect.anything());
  });

  it("refunds and explains in plain words when no face is found", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", error: "No face detected in swap image" })));
    const res = await POST(req({ url: PHOTO, face: FACE }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/clear face.*refunded/);
    expect(h.rpc).toHaveBeenCalledWith("refund_credits", expect.objectContaining({ p_amount: 3, p_operation: "credit" }));
  });

  it("asks for a top-up when the user is out of credits", async () => {
    h.rpc.mockResolvedValueOnce({ data: { success: false }, error: null });
    const res = await POST(req({ url: PHOTO, face: FACE }));
    expect(res.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
