"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { isSharedBrand, useBrandStore, type BrandProfile } from "@/app/store/useBrandStore";
import { BRAND_HEADER } from "@/lib/brand-header";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";

/**
 * While a shared brand is active, every call to our /api routes says which brand it is for, so the
 * server works in (and charges) the owner's workspace once it has checked the user's access. Calls
 * for the user's own brands are left exactly as they were.
 */
let brandHeaderInstalled = false;
function installBrandHeader() {
  if (brandHeaderInstalled || typeof window === "undefined") return;
  brandHeaderInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const active = useBrandStore.getState().activeBrand;
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const local = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
      if (local && isSharedBrand(active)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has(BRAND_HEADER)) headers.set(BRAND_HEADER, active.id);
        return original(input, { ...init, headers });
      }
    } catch { /* never get in the way of a request */ }
    return original(input, init);
  };
}

/**
 * Loads the account's active brands, plus brands other people shared with this user, into the
 * shared brand store (the same store every reused page reads), picking the first one when nothing
 * is selected. Mirrors the classic TopBar so both looks agree on which brand is active.
 */
export function useStudioBrands() {
  const { ownClientId: clientId } = useClient();
  const { setAvailableBrands, setActiveBrand } = useBrandStore();
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    const [{ data }, shared] = await Promise.all([
      supabase
        .from("brand_profiles")
        .select("id, brand_name, logo_url")
        .eq("client_id", clientId)
        .eq("is_active", true),
      supabase.rpc("my_shared_brands"),
    ]);
    if (!data) return;
    const own: BrandProfile[] = data.map((b) => ({ ...b, role: "owner" as const }));
    const theirs: BrandProfile[] = ((shared.data ?? []) as Array<{ id: string; brand_name: string | null; logo_url: string | null; client_id: string; role: string; owner_name: string }>)
      .map((b) => ({ id: b.id, brand_name: b.brand_name || "Brand", logo_url: b.logo_url, client_id: b.client_id, role: b.role === "editor" ? "editor" as const : "viewer" as const, owner_name: b.owner_name }));
    // If the shared list failed to load, keep a selected shared brand rather than switching away.
    const list = [...own, ...theirs];
    setAvailableBrands(list);
    const current = useBrandStore.getState().activeBrand;
    const fresh = current ? list.find((b) => b.id === current.id) : undefined;
    // A persisted brand that was archived, unshared or belongs to another account must not stay active.
    if (current && !fresh) {
      if (!(shared.error && isSharedBrand(current))) setActiveBrand(list[0] ?? null);
    } else if (fresh && (fresh.role !== current?.role || fresh.client_id !== current?.client_id || fresh.brand_name !== current?.brand_name || fresh.logo_url !== current?.logo_url)) setActiveBrand(fresh);
    else if (!current && list.length > 0) setActiveBrand(list[0]);
  }, [clientId, setAvailableBrands, setActiveBrand]);

  // Joining, leaving or being removed from a shared brand reloads the list.
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("blink:brands", onChange);
    window.addEventListener("focus", onChange);
    return () => { window.removeEventListener("blink:brands", onChange); window.removeEventListener("focus", onChange); };
  }, [refresh]);

  useEffect(() => {
    installBrandHeader();
    void refresh();
    if (!clientId) return;
    supabase
      .from("clients")
      .select("contact_name, contact_email")
      .eq("id", clientId)
      .single()
      .then(({ data }) => {
        if (data) setProfile({ name: data.contact_name || "", email: data.contact_email || "" });
      });
  }, [clientId, refresh]);

  return { refresh, profile, clientId };
}

/**
 * Anything that can spend credits is a POST to one of our /api routes, so the balance listens for
 * those (QA-015, 2026-10-12: the header kept showing an old balance after uploads and X-ray edits).
 * Installed once; it only fires an event, it never changes a request.
 */
let spendWatch = false;
function watchSpends() {
  if (spendWatch || typeof window === "undefined") return;
  spendWatch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const local = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
      if (local && method !== "GET" && !url.includes("/api/credits/")) window.dispatchEvent(new Event("blink:credits"));
    } catch { /* never get in the way of a request */ }
    return res;
  };
}

/** The live credit balance. Refreshes on focus, on every page, and after anything that may spend. */
export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const taskCount = useWorkflowStore((s) => s.activeTasks.length);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    // State is only set when the response arrives (never synchronously inside an effect).
    return fetch("/api/credits/balance", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (typeof data.balance === "number") setBalance(data.balance);
        if (typeof data.plan_tier === "string") setPlan(data.plan_tier);
      })
      .catch(() => { /* offline or signed out: keep the last known value */ });
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    // A finished generation changes the balance a few seconds after the task clears.
    const t = setTimeout(() => void refresh(), 4000);
    return () => clearTimeout(t);
  }, [taskCount, refresh]);

  // A new page shows the current balance, not the one from when the tab opened. Switching to or
  // from a shared brand switches whose credits are shown.
  const brandId = useBrandStore((s) => s.activeBrand?.id);
  useEffect(() => { void refresh(); }, [pathname, brandId, refresh]);

  // After a spend: once soon, once more for charges n8n makes a few seconds later.
  useEffect(() => {
    watchSpends();
    let timers: number[] = [];
    const onSpend = () => {
      timers.forEach(clearTimeout);
      timers = [window.setTimeout(() => void refresh(), 1500), window.setTimeout(() => void refresh(), 6000)];
    };
    window.addEventListener("blink:credits", onSpend);
    return () => { window.removeEventListener("blink:credits", onSpend); timers.forEach(clearTimeout); };
  }, [refresh]);

  return { balance, plan, refresh };
}

export function formatCredits(n: number | null | undefined) {
  if (n === null || n === undefined) return "…";
  return Math.round(n).toLocaleString("en-US");
}
