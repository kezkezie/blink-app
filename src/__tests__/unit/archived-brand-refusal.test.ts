import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/fake-supabase";

const { db } = vi.hoisted(() => ({ db: { current: null as ReturnType<typeof fakeSupabase> | null } }));
vi.mock("@/lib/supabase-server", () => ({ get supabaseAdmin() { return db.current!.client; } }));

import { loadOwnedBrandCreativeContext } from "@/lib/brand-creative-context";

/**
 * Archiving a brand must make it unusable everywhere, or the plan limit leaks:
 * create -> archive -> create again, while still generating on the archived one.
 * The brand-context loader is the shared gate used by generation surfaces.
 */
beforeEach(() => {
  db.current = fakeSupabase({
    clients: [{ id: "c1", user_id: "u1", company_name: "Co", industry: "x", website_url: null }],
    brand_profiles: [
      { id: "live", client_id: "c1", brand_name: "Live", is_active: true },
      { id: "archived", client_id: "c1", brand_name: "Archived", is_active: false },
      { id: "foreign", client_id: "c2", brand_name: "Someone else", is_active: true },
    ],
  });
});

describe("archived brands are refused by the shared brand gate", () => {
  it("loads an active brand I own", async () => {
    const r = await loadOwnedBrandCreativeContext("u1", "live");
    expect(r.ok).toBe(true);
  });

  it("refuses my ARCHIVED brand with the same 404 as a missing one", async () => {
    const r = await loadOwnedBrandCreativeContext("u1", "archived");
    expect(r).toEqual({ ok: false, status: 404, error: "Brand not found" });
  });

  it("still refuses another tenant's brand", async () => {
    expect((await loadOwnedBrandCreativeContext("u1", "foreign")).ok).toBe(false);
  });
});
