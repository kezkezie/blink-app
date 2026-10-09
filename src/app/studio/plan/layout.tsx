import { SectionTabs } from "@/components/studio/SectionTabs";

// Plan = everything after making: the calendar, approvals and how posts performed.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs
        tabs={[
          { href: "/studio/plan", label: "Calendar" },
          { href: "/studio/plan/approvals", label: "Approvals" },
          { href: "/studio/plan/analytics", label: "Analytics" },
        ]}
      />
      {children}
    </>
  );
}
