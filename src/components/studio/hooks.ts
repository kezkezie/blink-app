"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";

/**
 * Loads the account's active brands into the shared brand store (the same store every reused page
 * reads), picking the first one when nothing is selected. Mirrors the classic TopBar so both looks
 * agree on which brand is active.
 */
export function useStudioBrands() {
  const { clientId } = useClient();
  const { setAvailableBrands, setActiveBrand } = useBrandStore();
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from("brand_profiles")
      .select("id, brand_name, logo_url")
      .eq("client_id", clientId)
      .eq("is_active", true);
    if (!data) return;
    setAvailableBrands(data);
    const current = useBrandStore.getState().activeBrand;
    // A persisted brand that was archived (or belongs to another account) must not stay active.
    if (current && !data.some((b) => b.id === current.id)) setActiveBrand(data[0] ?? null);
    else if (!current && data.length > 0) setActiveBrand(data[0]);
  }, [clientId, setAvailableBrands, setActiveBrand]);

  useEffect(() => {
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

  // A new page shows the current balance, not the one from when the tab opened.
  useEffect(() => { void refresh(); }, [pathname, refresh]);

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
