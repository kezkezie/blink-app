"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, LayoutGrid, CalendarDays, Palette, MessageCircle, ChevronDown, Check, Plus, Briefcase, Loader2, CreditCard, Settings, LogOut, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandCreationModal } from "@/components/brand/info";
import { getBrandAllowance } from "@/app/actions/brand";
import { useBrandStore } from "@/app/store/useBrandStore";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { supabase } from "@/lib/supabase";
import { UI_COOKIE, dashboardPathFor, studioSectionFor, studioTitleFor, type StudioSection } from "@/lib/studio-routes";
import { formatCredits, useCredits, useStudioBrands } from "./hooks";
import { useAskStore } from "./ask-store";

const PLACES: Array<{ id: StudioSection; label: string; href: string; icon: typeof Sparkles }> = [
  { id: "create", label: "Create", href: "/studio", icon: Sparkles },
  { id: "library", label: "Library", href: "/studio/library", icon: LayoutGrid },
  { id: "plan", label: "Plan", href: "/studio/plan", icon: CalendarDays },
  { id: "brand", label: "Brand", href: "/studio/brand", icon: Palette },
];

/** The four places. A rail on desktop, a bottom tab bar on phones (with Ask as the fifth tab). */
export function StudioNav() {
  const pathname = usePathname();
  const section = studioSectionFor(pathname);
  const { setOpen } = useAskStore();
  const links = PLACES.map((p) => (
    <Link key={p.id} href={p.href} className="s-navbtn" aria-current={section === p.id ? "page" : undefined}>
      <p.icon strokeWidth={1.8} />
      {p.label}
    </Link>
  ));
  return (
    <>
      <nav className="s-rail" aria-label="Main">
        <Link href="/studio" className="s-logo" aria-label="BlinkSpot home">B</Link>
        {links}
        <div className="flex-1" />
        <button className="s-navbtn ask" onClick={() => setOpen(true)} title="Ask BlinkSpot (⌘K)">
          <MessageCircle strokeWidth={1.8} />
          Ask
        </button>
      </nav>
      <nav className="s-tabbar" aria-label="Main">
        {links}
        <button className="s-navbtn ask" onClick={() => setOpen(true)}>
          <MessageCircle strokeWidth={1.8} />
          Ask
        </button>
      </nav>
    </>
  );
}

function ActivityChip() {
  const tasks = useWorkflowStore((s) => s.activeTasks);
  if (tasks.length === 0) return null;
  const label = tasks.some((t) => /Image|Video/.test(t.label))
    ? "Generating"
    : tasks.some((t) => /DNA|Extract/.test(t.label))
      ? "Reading brand DNA"
      : tasks.some((t) => /Analyz|Media/.test(t.label))
        ? "Analysing media"
        : tasks[0].label;
  return (
    <span className="s-pill" role="status" aria-live="polite">
      <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--s-accent)" }} />
      {label}
      {tasks.length > 1 && <span style={{ color: "var(--s-mute)" }}>· {tasks.length}</span>}
    </span>
  );
}

function BrandSwitcher({ onCreated }: { onCreated: () => void }) {
  const { activeBrand, availableBrands, setActiveBrand } = useBrandStore();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="s-btn" style={{ maxWidth: 200 }} aria-label="Switch brand">
            {activeBrand?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeBrand.logo_url} alt="" className="h-5 w-5 rounded object-contain bg-white p-px" />
            ) : (
              <Briefcase className="h-4 w-4" style={{ color: "var(--s-mute)" }} />
            )}
            <span className="hidden sm:inline truncate">{activeBrand ? activeBrand.brand_name || "Unnamed brand" : "No brand"}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>Working on</DropdownMenuLabel>
          {availableBrands.map((b) => (
            <DropdownMenuItem key={b.id} onClick={() => setActiveBrand(b)} className="gap-3 py-2 cursor-pointer">
              <span className="h-6 w-6 rounded-md overflow-hidden grid place-items-center shrink-0" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line-2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-contain bg-white p-0.5" /> : <Briefcase className="h-3 w-3" />}
              </span>
              <span className="truncate">{b.brand_name || "Unnamed brand"}</span>
              {activeBrand?.id === b.id && <Check className="h-4 w-4 ml-auto" style={{ color: "var(--s-accent)" }} />}
            </DropdownMenuItem>
          ))}
          {availableBrands.length === 0 && <div className="px-2 py-3 text-xs" style={{ color: "var(--s-mute)" }}>No brands yet.</div>}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-3 py-2 cursor-pointer"
            onClick={async () => {
              // Explain the plan limit before the user fills in a whole form; the server still enforces it.
              const allowance = await getBrandAllowance();
              if ("error" in allowance) { toast.error(allowance.error); return; }
              if (!allowance.canCreate) {
                toast.error(`You're using ${allowance.used} of ${allowance.limit} brand${allowance.limit === 1 ? "" : "s"} on your plan. Upgrade, or archive a brand to free a slot.`);
                return;
              }
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> New brand
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-3 py-2 cursor-pointer">
            <Link href="/studio/brand"><Palette className="h-4 w-4" /> Brand settings</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BrandCreationModal isOpen={creating} onClose={() => setCreating(false)} onSuccess={onCreated} />
    </>
  );
}

function AccountMenu({ profile }: { profile: { name: string; email: string } | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const initial = (profile?.name || profile?.email || "?").charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-9 w-9 rounded-full grid place-items-center text-sm font-semibold" style={{ background: "var(--s-raised)", border: "1px solid var(--s-line-2)" }} aria-label="Account">
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <p className="text-sm font-medium truncate">{profile?.name || "Your account"}</p>
          <p className="text-xs truncate" style={{ color: "var(--s-mute)" }}>{profile?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-3 cursor-pointer"><Link href="/studio/account/billing"><CreditCard className="h-4 w-4" /> Billing &amp; credits</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-3 cursor-pointer"><Link href="/studio/account/settings"><Settings className="h-4 w-4" /> Settings &amp; accounts</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-3 cursor-pointer"
          onClick={() => {
            // The classic design is kept as it was. This only switches which one opens.
            document.cookie = `${UI_COOKIE}=classic; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            window.location.href = dashboardPathFor(pathname);
          }}
        >
          <Undo2 className="h-4 w-4" /> Classic look
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-3 cursor-pointer"
          style={{ color: "var(--s-danger)" }}
          onClick={async () => {
            await supabase.auth.signOut();
            useBrandStore.setState({ activeBrand: null, availableBrands: [] });
            router.push("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StudioTopBar() {
  const pathname = usePathname();
  const { activeBrand } = useBrandStore();
  const { refresh, profile } = useStudioBrands();
  const { balance } = useCredits();
  const { setOpen } = useAskStore();
  const title = studioTitleFor(pathname);
  return (
    <header className="s-top">
      <h1>{title}</h1>
      {activeBrand && <span className="s-crumb hidden sm:inline">· {activeBrand.brand_name}</span>}
      <div className="flex-1" />
      <ActivityChip />
      <Link href="/studio/account/billing" className="s-pill hidden sm:inline-flex" title="Credit balance">
        <b>{formatCredits(balance)}</b> credits
      </Link>
      <button className="s-btn ai hidden md:inline-flex" onClick={() => setOpen(true)}>
        <MessageCircle className="h-4 w-4" /> Ask BlinkSpot
      </button>
      <BrandSwitcher onCreated={refresh} />
      <AccountMenu profile={profile} />
    </header>
  );
}
