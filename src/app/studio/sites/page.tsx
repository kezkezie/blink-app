import { Suspense } from "react";
import { SitesHome } from "@/components/studio/sites/SitesHome";
import { PageSkeleton } from "@/components/studio/Skeletons";

export default function SitesPage() {
  return <Suspense fallback={<PageSkeleton />}><SitesHome /></Suspense>;
}
