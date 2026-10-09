"use client";

import { useCallback, useEffect, useState } from "react";
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

/** The live credit balance. Refreshes on focus and whenever a generation starts or finishes. */
export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const taskCount = useWorkflowStore((s) => s.activeTasks.length);

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

  return { balance, plan, refresh };
}

export function formatCredits(n: number | null | undefined) {
  if (n === null || n === undefined) return "…";
  return Math.round(n).toLocaleString("en-US");
}
