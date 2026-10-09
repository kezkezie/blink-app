import { SectionTabs } from "@/components/studio/SectionTabs";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs
        tabs={[
          { href: "/studio/account/billing", label: "Billing & credits" },
          { href: "/studio/account/settings", label: "Settings & social accounts" },
        ]}
      />
      {children}
    </>
  );
}
