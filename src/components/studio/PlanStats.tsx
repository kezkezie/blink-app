"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useBrandStore } from "@/app/store/useBrandStore";
import { NOT_STORYBOARD_FRAME, PART_TYPES } from "./media";

/**
 * The post counts that used to be the Dashboard cards. BlinkSpot's own data only: real social
 * analytics (reach, likes) needs the platform APIs and is parked for a later version.
 */
export function PlanStats() {
  const { activeBrand } = useBrandStore();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!activeBrand) return;
    let cancelled = false;
    const count = (status: string) => supabase.from("content").select("id", { count: "exact", head: true }).eq("brand_id", activeBrand.id)
      .not("content_type", "in", `(${PART_TYPES.join(",")})`).or(NOT_STORYBOARD_FRAME).eq("status", status);
    Promise.all(["draft", "pending_approval", "scheduled", "posted"].map(count)).then(([d, p, s, po]) => {
      if (!cancelled) setCounts({ Drafts: d.count ?? 0, "Needs approval": p.count ?? 0, Scheduled: s.count ?? 0, Posted: po.count ?? 0 });
    });
    return () => { cancelled = true; };
  }, [activeBrand]);
  if (!counts) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Post counts">
      {Object.entries(counts).map(([label, n]) => (
        <span key={label} className="s-pill"><b>{n}</b> {label}</span>
      ))}
    </div>
  );
}
