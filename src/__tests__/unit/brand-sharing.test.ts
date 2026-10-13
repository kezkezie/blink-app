import { beforeEach, describe, expect, it, vi } from "vitest";

/** Shared brands (2026-10-13): which workspace a request works in and is charged to. */
type Row = Record<string, unknown>;
const db: { clients: Row[]; brand_profiles: Row[]; brand_members: Row[]; content: Row[] } = { clients: [], brand_profiles: [], brand_members: [], content: [] };
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { from } }));

function table(name: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    maybeSingle: async () => ({ data: db[name].find((r) => filters.every(([k, v]) => r[k] === v)) ?? null, error: null }),
  };
  return q;
}

import { brandAccess, clientIdMatches, requestWorkspace, sharedWorkspace, workspaceFor } from "@/lib/brand-access";
import { maskEmail, normaliseEmail, viewerCanOpen, whatsappShareUrl } from "@/lib/brand-sharing";

const KEZIE = "u-kezie", BRIAN = "u-brian", VIEWER = "u-viewer", STRANGER = "u-stranger";
const OWNER_WS = "c-kezie", BRIAN_WS = "c-brian", STRANGER_WS = "c-stranger";
const NUF = "11111111-1111-4111-8111-111111111111";
const PRIVATE = "22222222-2222-4222-8222-222222222222";
const ARCHIVED = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  from.mockReset();
  from.mockImplementation((name: keyof typeof db) => table(name));
  db.clients = [{ id: OWNER_WS, user_id: KEZIE, plan_tier: "starter" }, { id: BRIAN_WS, user_id: BRIAN, plan_tier: "free" }, { id: STRANGER_WS, user_id: STRANGER, plan_tier: "free" }];
  db.brand_profiles = [
    { id: NUF, client_id: OWNER_WS, is_active: true },
    { id: PRIVATE, client_id: OWNER_WS, is_active: true },
    { id: ARCHIVED, client_id: OWNER_WS, is_active: false },
  ];
  db.brand_members = [
    { brand_id: NUF, user_id: BRIAN, role: "editor" },
    { brand_id: NUF, user_id: VIEWER, role: "viewer" },
    { brand_id: ARCHIVED, user_id: BRIAN, role: "editor" },
  ];
  db.content = [{ id: "post-nuf", client_id: OWNER_WS, brand_id: NUF }, { id: "post-private", client_id: OWNER_WS, brand_id: PRIVATE }];
});

describe("workspaceFor", () => {
  it("the owner works in their own workspace", async () => {
    expect(await workspaceFor(KEZIE, { brandId: NUF })).toEqual({ clientId: OWNER_WS, ownClientId: OWNER_WS, role: "owner" });
  });

  it("an editor of the brand works in (and is charged to) the owner's workspace", async () => {
    expect(await workspaceFor(BRIAN, { brandId: NUF })).toEqual({ clientId: OWNER_WS, ownClientId: BRIAN_WS, role: "editor" });
    // Found from a post too, e.g. an X-ray edit of a shared brand's post.
    expect((await workspaceFor(BRIAN, { contentId: "post-nuf" }))?.clientId).toBe(OWNER_WS);
  });

  it("not for the owner's other brands, their posts, or an archived brand", async () => {
    expect((await workspaceFor(BRIAN, { brandId: PRIVATE }))?.clientId).toBe(BRIAN_WS);
    expect((await workspaceFor(BRIAN, { contentId: "post-private" }))?.clientId).toBe(BRIAN_WS);
    expect((await workspaceFor(BRIAN, { brandId: ARCHIVED }))?.clientId).toBe(BRIAN_WS);
  });

  it("a viewer only reads in the owner's workspace; making things stays in their own", async () => {
    expect((await workspaceFor(VIEWER, { brandId: NUF }))).toBeNull(); // no own workspace yet, so nothing
    db.clients.push({ id: "c-viewer", user_id: VIEWER });
    expect((await workspaceFor(VIEWER, { brandId: NUF }))?.clientId).toBe("c-viewer");
    expect((await workspaceFor(VIEWER, { brandId: NUF, write: false }))?.clientId).toBe(OWNER_WS);
  });

  it("a stranger gets their own workspace, where the usual ownership checks refuse the brand", async () => {
    expect(await workspaceFor(STRANGER, { brandId: NUF })).toEqual({ clientId: STRANGER_WS, ownClientId: STRANGER_WS, role: "owner" });
    expect(await brandAccess(STRANGER, NUF)).toBeNull();
    expect(await sharedWorkspace(STRANGER, NUF)).toBeNull();
  });

  it("a removed member loses access at once", async () => {
    db.brand_members = db.brand_members.filter((m) => m.user_id !== BRIAN);
    expect((await workspaceFor(BRIAN, { brandId: NUF }))?.clientId).toBe(BRIAN_WS);
  });

  it("sharedWorkspace: only for a brand shared with you, never your own; errors mean no", async () => {
    expect(await sharedWorkspace(BRIAN, NUF)).toBe(OWNER_WS);
    expect(await sharedWorkspace(KEZIE, NUF)).toBeNull();
    expect(await sharedWorkspace(VIEWER, NUF)).toBeNull();
    expect(await sharedWorkspace(VIEWER, NUF, false)).toBe(OWNER_WS);
    from.mockImplementation(() => { throw new Error("db down"); });
    expect(await sharedWorkspace(BRIAN, NUF)).toBeNull();
  });
});

describe("requestWorkspace", () => {
  const req = (brand?: string) => new Request("http://x/api/y", { headers: brand ? { "x-blink-brand": brand } : {} });

  it("uses the studio's active-brand header when the body names no brand, with that workspace's plan", async () => {
    expect(await requestWorkspace(req(NUF), BRIAN)).toMatchObject({ id: OWNER_WS, role: "editor", plan_tier: "starter" });
    expect(await requestWorkspace(req(), BRIAN)).toMatchObject({ id: BRIAN_WS, role: "owner", plan_tier: "free" });
  });

  it("a forged header does nothing for someone without access", async () => {
    expect(await requestWorkspace(req(NUF), STRANGER)).toMatchObject({ id: STRANGER_WS, role: "owner" });
    expect(await requestWorkspace(req("not-a-uuid"), BRIAN)).toMatchObject({ id: BRIAN_WS });
  });

  it("the client id the browser sent may be the user's own or the shared workspace, nothing else", () => {
    const ws = { clientId: OWNER_WS, ownClientId: BRIAN_WS, role: "editor" as const };
    expect(clientIdMatches(OWNER_WS, ws)).toBe(true);
    expect(clientIdMatches(BRIAN_WS, ws)).toBe(true);
    expect(clientIdMatches(undefined, ws)).toBe(true);
    expect(clientIdMatches(STRANGER_WS, ws)).toBe(false);
  });
});

describe("sharing helpers", () => {
  it("emails are normalised and masked", () => {
    expect(normaliseEmail("  Brian@Gmail.COM ")).toBe("brian@gmail.com");
    expect(normaliseEmail("not an email")).toBe("");
    expect(maskEmail("brian@gmail.com")).toBe("b•••n@gmail.com");
    expect(maskEmail("bo@x.co")).toBe("b•••@x.co");
  });

  it("the WhatsApp message carries the link", () => {
    const url = whatsappShareUrl("https://blinkspot.io/join/abc", "Nuf Farms", "editor");
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Join me on BlinkSpot to work on Nuf Farms: https://blinkspot.io/join/abc");
  });

  it("viewers can open reading pages only", () => {
    for (const p of ["/studio", "/studio/library", "/studio/plan", "/studio/brand", "/studio/account/settings"]) expect(viewerCanOpen(p)).toBe(true);
    for (const p of ["/studio/image", "/studio/video", "/studio/library/upload", "/studio/plan/approvals", "/studio/sites", "/studio/examples"]) expect(viewerCanOpen(p)).toBe(false);
  });
});
