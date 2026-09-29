import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/fake-supabase";

const { getUser, db } = vi.hoisted(() => ({ getUser: vi.fn(), db: { current: null as ReturnType<typeof fakeSupabase> | null } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase-server", () => ({
  get supabaseAdmin() { return db.current!.client; },
}));

import { archiveBrand, createBrandWorkspace, createQuickBrand, getBrandAllowance, saveBrandProfile } from "@/app/actions/brand";

const ME = "user-me";
const OTHER = "user-other";
const MY_CLIENT = "client-mine";
const THEIR_CLIENT = "client-theirs";

function seed({ myTier = "free", myBrands = 1, archived = 0 } = {}) {
  const brands = [
    ...Array.from({ length: myBrands }, (_, i) => ({ id: `mine-${i}`, client_id: MY_CLIENT, brand_name: `Mine ${i}`, is_active: true })),
    ...Array.from({ length: archived }, (_, i) => ({ id: `archived-${i}`, client_id: MY_CLIENT, brand_name: `Old ${i}`, is_active: false })),
    { id: "theirs-0", client_id: THEIR_CLIENT, brand_name: "Victim Brand", is_active: true },
  ];
  db.current = fakeSupabase({
    clients: [{ id: MY_CLIENT, user_id: ME, plan_tier: myTier }, { id: THEIR_CLIENT, user_id: OTHER, plan_tier: "agency" }],
    brand_profiles: brands,
  });
}
const brand = (id: string) => db.current!.tables.brand_profiles.find((b) => b.id === id)!;
const activeMine = () => db.current!.tables.brand_profiles.filter((b) => b.client_id === MY_CLIENT && b.is_active).length;

const PROFILE = {
  company_name: "Hacked Co", industry: "x", description: "x", website_url: "https://evil.example", social_urls: "",
  brand_name: "HACKED", logo_url: "https://evil.example/logo.png", primary_color: "#000000", secondary_color: "#000000",
  accent_color: "#000000", additional_colors: [], uploaded_assets: [], primary_font: "", secondary_font: "",
  visual_style_guide: "", brand_voice: "", tone_keywords: [], vocabulary_notes: "", dos: [], donts: [],
};

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: ME } } });
});

describe("brand actions: authentication", () => {
  it.each([
    ["saveBrandProfile", () => saveBrandProfile("mine-0", PROFILE as never)],
    ["createQuickBrand", () => createQuickBrand(MY_CLIENT, "New")],
    ["archiveBrand", () => archiveBrand("mine-0")],
  ])("%s refuses an unauthenticated caller and writes nothing", async (_n, call) => {
    seed({ myTier: "agency" });
    getUser.mockResolvedValue({ data: { user: null } });
    const before = JSON.stringify(db.current!.tables);
    expect((await call()).error).toBeTruthy();
    expect(JSON.stringify(db.current!.tables)).toBe(before);
  });
});

describe("brand actions: ownership (was an open write to every brand)", () => {
  it("saveBrandProfile cannot overwrite another customer's brand", async () => {
    seed();
    const r = await saveBrandProfile("theirs-0", PROFILE as never);
    expect(r.error).toBeTruthy();
    expect(brand("theirs-0").brand_name).toBe("Victim Brand");
  });

  it("saveBrandProfile updates my own brand", async () => {
    seed();
    expect((await saveBrandProfile("mine-0", { ...PROFILE, brand_name: "Renamed" } as never)).success).toBe(true);
    expect(brand("mine-0").brand_name).toBe("Renamed");
  });

  it("createQuickBrand ignores a caller-supplied client id that isn't mine", async () => {
    seed({ myTier: "agency" });
    const r = await createQuickBrand(THEIR_CLIENT, "Planted");
    expect(r.error).toBeTruthy();
    expect(db.current!.tables.brand_profiles.some((b) => b.client_id === THEIR_CLIENT && b.brand_name === "Planted")).toBe(false);
  });

  it("createBrandWorkspace uses the SESSION user, never the userId in the input", async () => {
    seed({ myTier: "agency" });
    const r = await createBrandWorkspace({ userId: OTHER, brandName: "Mine too" } as never);
    expect(r.error).toBeUndefined();
    const created = db.current!.tables.brand_profiles.find((b) => b.brand_name === "Mine too")!;
    expect(created.client_id).toBe(MY_CLIENT);
  });

  it("archiveBrand cannot archive another customer's brand", async () => {
    seed();
    expect((await archiveBrand("theirs-0")).error).toBeTruthy();
    expect(brand("theirs-0").is_active).toBe(true);
  });
});

describe("brand limits are enforced on the SERVER, per plan", () => {
  it.each([
    ["free", 1],
    ["starter", 2],
    ["pro", 6],
    ["agency", 10],
  ])("%s plan allows exactly %i active brands", async (tier, limit) => {
    seed({ myTier: tier, myBrands: limit - 1 });
    expect((await createQuickBrand(MY_CLIENT, "Last allowed")).brand).toBeTruthy();
    expect(activeMine()).toBe(limit);
    const over = await createQuickBrand(MY_CLIENT, "One too many");
    expect(over.error).toMatch(/limit/i);
    expect(over.limitReached).toBe(true);
    expect(activeMine()).toBe(limit);
  });

  it("the second creation path (createBrandWorkspace) enforces the same limit", async () => {
    seed({ myTier: "free", myBrands: 1 });
    const r = await createBrandWorkspace({ brandName: "Sneaky" } as never);
    expect(r.error).toMatch(/limit/i);
    expect(activeMine()).toBe(1);
  });

  it("archived brands do not count against the limit", async () => {
    seed({ myTier: "free", myBrands: 0, archived: 3 });
    expect((await createQuickBrand(MY_CLIENT, "Fresh")).brand).toBeTruthy();
  });

  it("an unknown plan tier gets the free limit, not unlimited", async () => {
    seed({ myTier: "legacy-mystery", myBrands: 1 });
    expect((await createQuickBrand(MY_CLIENT, "Nope")).error).toMatch(/limit/i);
  });

  it("a brand-new user (no client row yet) can create their first brand", async () => {
    db.current = fakeSupabase({ clients: [], brand_profiles: [] });
    const r = await createBrandWorkspace({ brandName: "First", contactName: "Me" } as never);
    expect(r.error).toBeUndefined();
    expect(db.current!.tables.clients).toHaveLength(1);
    expect(db.current!.tables.clients[0].user_id).toBe(ME);
  });
});

describe("archiveBrand: soft delete keeps history", () => {
  it("archives my brand without deleting the row, and frees a slot", async () => {
    seed({ myTier: "free", myBrands: 1 });
    expect((await archiveBrand("mine-0")).success).toBe(true);
    expect(brand("mine-0")).toBeTruthy(); // row still exists: posts/ledger keep their reference
    expect(brand("mine-0").is_active).toBe(false);
    expect((await createQuickBrand(MY_CLIENT, "Replacement")).brand).toBeTruthy();
  });

  it("rejects bad input", async () => {
    seed();
    expect((await createQuickBrand(MY_CLIENT, "   ")).error).toBeTruthy();
    expect((await createQuickBrand(MY_CLIENT, "x".repeat(121))).error).toBeTruthy();
  });
});

describe("getBrandAllowance (read-only, for the UI)", () => {
  it("reports used/limit and whether another brand fits", async () => {
    seed({ myTier: "starter", myBrands: 1, archived: 2 });
    expect(await getBrandAllowance()).toEqual({ used: 1, limit: 2, canCreate: true });
    seed({ myTier: "starter", myBrands: 2 });
    expect(await getBrandAllowance()).toEqual({ used: 2, limit: 2, canCreate: false });
  });

  it("a brand-new user can create their first brand", async () => {
    db.current = fakeSupabase({ clients: [], brand_profiles: [] });
    expect(await getBrandAllowance()).toEqual({ used: 0, limit: 1, canCreate: true });
  });

  it("requires a session and changes nothing", async () => {
    seed();
    getUser.mockResolvedValue({ data: { user: null } });
    const before = JSON.stringify(db.current!.tables);
    expect(await getBrandAllowance()).toHaveProperty("error");
    expect(JSON.stringify(db.current!.tables)).toBe(before);
  });
});
