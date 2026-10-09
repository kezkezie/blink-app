import { SectionTabs } from "@/components/studio/SectionTabs";
import { PlanStats } from "@/components/studio/PlanStats";

// Plan = everything after making: the calendar and approvals. Analytics stays out of the nav
// (it only counted BlinkSpot's own posts); real social analytics comes in a later version.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs
        tabs={[
          { href: "/studio/plan", label: "Calendar" },
          { href: "/studio/plan/approvals", label: "Approvals" },
        ]}
      >
        <PlanStats />
      </SectionTabs>
      {children}
    </>
  );
}
