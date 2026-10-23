"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { summarizePresence, type PresenceMeta } from "@/lib/admin";

/**
 * Who is on BlinkSpot right now (2026-10-23, the owner's dashboard): every studio tab joins one
 * Supabase Realtime presence channel. A tab shares only a short hash of the user id (to count
 * people, not tabs), the section it's on and whether it's in view: never an email or a name.
 * No table: presence lives on the channel and leaves when the tab closes.
 *
 * One channel per tab, shared by the tab's own presence and the dashboard's view of everyone:
 * Realtime keeps one join per channel name per connection, so a second channel object of the same
 * name pushed the first one off (the dashboard then counted nobody, itself included).
 */
export const LIVE_CHANNEL = "blink-live";

type Shared = { ch: ReturnType<typeof supabase.channel>; ready: boolean; meta: PresenceMeta | null; listeners: Set<() => void> };
let shared: Shared | null = null;

function liveChannel(): Shared {
  if (shared) return shared;
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
  const ch = supabase.channel(LIVE_CHANNEL, { config: { presence: { key } } });
  const s: Shared = { ch, ready: false, meta: null, listeners: new Set() };
  shared = s;
  ch.on("presence", { event: "sync" }, () => s.listeners.forEach((f) => f()))
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      s.ready = true;
      if (s.meta) void ch.track(s.meta);
      s.listeners.forEach((f) => f());
    });
  return s;
}
function share(meta: PresenceMeta) {
  const s = liveChannel();
  s.meta = meta;
  if (s.ready) void s.ch.track(meta);
}

async function shortHash(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`blinkspot:${text}`));
  return [...new Uint8Array(bytes)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Count this studio tab on the live channel, with the section it's on. */
export function useStudioPresence(section: string) {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      share({ u: await shortHash(data.user.id), p: section, v: document.visibilityState === "visible" });
    })();
    return () => { alive = false; };
  }, [section]);
  useEffect(() => {
    const onVisible = () => { const s = shared; if (s?.meta) share({ ...s.meta, v: document.visibilityState === "visible" }); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}

export type LivePresence = ReturnType<typeof summarizePresence> & { connected: boolean };

/** Everyone on the live channel (the admin dashboard): how many people are on, and where. */
export function useLivePresence(): LivePresence {
  const [live, setLive] = useState<LivePresence>({ people: 0, looking: 0, tabs: 0, bySection: {}, connected: false });
  useEffect(() => {
    const s = liveChannel();
    const sync = () => {
      const state = s.ch.presenceState() as unknown as Record<string, PresenceMeta[]>;
      const metas = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.filter((m) => typeof m?.u === "string")]));
      setLive({ ...summarizePresence(metas), connected: s.ready });
    };
    s.listeners.add(sync);
    sync();
    return () => { s.listeners.delete(sync); };
  }, []);
  return live;
}
