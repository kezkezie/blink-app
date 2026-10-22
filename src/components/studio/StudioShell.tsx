"use client";

import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, LayoutGrid, CalendarDays, Palette, Globe, MessageCircle, ChevronDown, Check, Plus, Briefcase, Loader2, CreditCard, Settings, LogOut, Undo2, BookOpen, Users, Compass, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBrandAllowance, listArchivedBrands } from "@/app/actions/brand";
import { isSharedBrand, useBrandStore, type BrandProfile } from "@/app/store/useBrandStore";
import { SharePanel } from "./sharing/SharePanel";
import { useWorkflowStore } from "@/app/store/useWorkflowStore";
import { supabase } from "@/lib/supabase";
import { UI_COOKIE, dashboardPathFor, studioSectionFor, studioTitleFor, type StudioSection } from "@/lib/studio-routes";
import { formatCredits, useCredits, useStudioBrands } from "./hooks";
import { creditLevel, creditWarning } from "@/lib/credit-level";
import { useAskStore } from "./ask-store";
import { ManageBrands } from "./ManageBrands";

const PLACES: Array<{ id: StudioSection; label: string; href: string; icon: typeof Sparkles }> = [
  { id: "create", label: "Create", href: "/studio", icon: Sparkles },
  { id: "library", label: "Library", href: "/studio/library", icon: LayoutGrid },
  { id: "plan", label: "Plan", href: "/studio/plan", icon: CalendarDays },
  { id: "brand", label: "Brand", href: "/studio/brand", icon: Palette },
  { id: "site", label: "Website", href: "/studio/sites", icon: Globe },
];

/** A tab's icon and label; while its page is on the way, the tab lights up and shimmers (2026-10-16). */
function NavInner({ icon: Icon, label }: { icon: (typeof PLACES)[number]["icon"]; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending && <span className="s-navpending" aria-hidden />}
      <Icon strokeWidth={1.8} />
      {label}
    </>
  );
}

/** The four places. A rail on desktop, a bottom tab bar on phones (with Ask as the fifth tab). */
export function StudioNav() {
  const pathname = usePathname();
  const section = studioSectionFor(pathname);
  const { setOpen } = useAskStore();
  const links = PLACES.map((p) => (
    <Link key={p.id} href={p.href} className="s-navbtn" aria-current={section === p.id ? "page" : undefined} data-tour={p.id}>
      <NavInner icon={p.icon} label={p.label} />
    </Link>
  ));
  return (
    <>
      <nav className="s-rail" aria-label="Main">
        <Link href="/studio" className="s-logo" aria-label="BlinkSpot home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-lime.png" alt="BlinkSpot" />
        </Link>
        {links}
        <div className="flex-1" />
        <button className="s-navbtn ask" onClick={() => setOpen(true)} title="Ask BlinkSpot (⌘K)" data-tour="ask">
          <MessageCircle strokeWidth={1.8} />
          Ask
        </button>
      </nav>
      <nav className="s-tabbar" aria-label="Main">
        {links}
        <button className="s-navbtn ask" onClick={() => setOpen(true)} data-tour="ask">
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
  const router = useRouter();
  const { activeBrand, availableBrands, setActiveBrand } = useBrandStore();
  const [managing, setManaging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const own = availableBrands.filter((b) => !isSharedBrand(b));
  const theirs = availableBrands.filter((b) => isSharedBrand(b));
  const item = (b: BrandProfile) => (
    <DropdownMenuItem key={b.id} onClick={() => setActiveBrand(b)} className="gap-3 py-2 cursor-pointer">
      <span className="h-6 w-6 rounded-md overflow-hidden grid place-items-center shrink-0" style={{ background: "var(--s-bg)", border: "1px solid var(--s-line-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {b.logo_url ? <img src={b.logo_url} alt="" className="h-full w-full object-contain bg-white p-0.5" /> : <Briefcase className="h-3 w-3" />}
      </span>
      <span className="min-w-0 grid">
        <span className="truncate">{b.brand_name || "Unnamed brand"}</span>
        {isSharedBrand(b) && <span className="truncate text-[11px]" style={{ color: "var(--s-mute)" }}>{b.owner_name || "Shared"} · {b.role === "viewer" ? "view only" : "editor"}</span>}
      </span>
      {activeBrand?.id === b.id && <Check className="h-4 w-4 ml-auto shrink-0" style={{ color: "var(--s-accent)" }} />}
    </DropdownMenuItem>
  );
  // Shown every time the menu opens, so the plan's brand limit is never a surprise.
  const [slots, setSlots] = useState<{ used: number; limit: number; archived: number } | null>(null);
  const loadSlots = async () => {
    const [a, list] = await Promise.all([getBrandAllowance(), listArchivedBrands()]);
    if (!("error" in a)) setSlots({ used: a.used, limit: a.limit, archived: "brands" in list ? list.brands.length : 0 });
  };
  return (
    <>
      <DropdownMenu onOpenChange={(o) => { if (o) void loadSlots(); }}>
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
          <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>
            Working on
            {slots && <span className="ml-auto normal-case tracking-normal font-normal" style={{ color: slots.used > slots.limit ? "var(--s-warn)" : "var(--s-mute)" }}>{slots.used} of {slots.limit} brands</span>}
          </DropdownMenuLabel>
          {own.map(item)}
          {own.length === 0 && <div className="px-2 py-3 text-xs" style={{ color: "var(--s-mute)" }}>{theirs.length ? "No brand of your own yet." : "No brand yet. Add one below: a website or one sentence is enough."}</div>}
          {theirs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider" style={{ color: "var(--s-mute)" }}>Shared with you</DropdownMenuLabel>
              {theirs.map(item)}
            </>
          )}
          <DropdownMenuSeparator />
          {activeBrand && !isSharedBrand(activeBrand) && (
            <DropdownMenuItem className="gap-3 py-2 cursor-pointer" onClick={() => setSharing(true)}>
              <Users className="h-4 w-4" style={{ color: "var(--s-ai)" }} /> Share {activeBrand.brand_name || "this brand"}
            </DropdownMenuItem>
          )}
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
              // The same two-screen set-up as sign-up (2026-10-12; the classic modal stays in Vintage).
              router.push("/studio/new-brand");
            }}
          >
            <Plus className="h-4 w-4" /> Add a brand
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-3 py-2 cursor-pointer">
            <Link href="/studio/brand-builder"><Sparkles className="h-4 w-4" style={{ color: "var(--s-accent)" }} /> Build a brand from scratch</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-3 py-2 cursor-pointer">
            <Link href="/studio/brand"><Palette className="h-4 w-4" /> Brand settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-3 py-2 cursor-pointer" onClick={() => setManaging(true)}>
            <Briefcase className="h-4 w-4" /> Manage brands
            {!!slots?.archived && <span className="ml-auto text-[11px]" style={{ color: "var(--s-mute)" }}>{slots.archived} archived</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageBrands open={managing} onClose={() => setManaging(false)} onChanged={onCreated} />
      {activeBrand && !isSharedBrand(activeBrand) && <SharePanel open={sharing} onClose={() => setSharing(false)} brandId={activeBrand.id} brandName={activeBrand.brand_name || "this brand"} />}
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
        <DropdownMenuItem asChild className="gap-3 cursor-pointer"><Link href="/studio/guide"><Compass className="h-4 w-4" /> Guide</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-3 cursor-pointer"><Link href="/studio/account/skills"><BookOpen className="h-4 w-4" /> Ask skills</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-3 cursor-pointer"
          onClick={() => {
            // The first BlinkSpot design, kept exactly as it was (like Blender's older versions).
            document.cookie = `${UI_COOKIE}=classic; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            window.location.href = dashboardPathFor(pathname);
          }}
        >
          <Undo2 className="h-4 w-4" /> Vintage look
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

/**
 * The balance in the top bar: plain while there's room, red under about one video, solid red under
 * one Best image, and shown on phones too once it's low. Dropping into a lower level says so once.
 */
function CreditPill({ shared }: { shared: boolean }) {
  const { balance } = useCredits();
  const level = creditLevel(balance);
  const last = useRef<{ balance: number | null; shared: boolean }>({ balance: null, shared });
  const router = useRouter();
  useEffect(() => {
    if (balance === null) return;
    // Switching to or from a shared brand switches whose credits these are: not a drop.
    const before = last.current.shared === shared ? last.current.balance : null;
    last.current = { balance, shared };
    const w = creditWarning(before, balance, shared);
    if (!w) return;
    // A shared brand spends the owner's credits: only the owner can top them up.
    const go = shared ? undefined : { label: "Get credits", onClick: () => router.push("/studio/account/billing") };
    if (w.level === "out") toast.error(w.text, { action: go, duration: 12_000 });
    else toast.warning(w.text, { action: go, duration: 9000 });
  }, [balance, shared, router]);
  const title = level === "out" ? "Nearly out of credits: top up to keep making" : level === "low" ? "Credits are running low" : "Credit balance";
  return (
    <Link href="/studio/account/billing" className={`s-pill ${level === "ok" ? "hidden sm:inline-flex" : `s-credits-${level}`}`} title={title} data-tour="credits" data-level={level} aria-label={`${formatCredits(balance)} credits${level === "ok" ? "" : level === "low" ? ", running low" : ", nearly out"}`}>
      <b>{formatCredits(balance)}</b> <span className={level === "ok" ? "" : "hidden sm:inline"}>credits</span>{level === "out" && <span className="hidden md:inline">· Top up</span>}
    </Link>
  );
}

export function StudioTopBar() {
  const pathname = usePathname();
  const { activeBrand } = useBrandStore();
  const { refresh, profile } = useStudioBrands();
  const { setOpen } = useAskStore();
  const title = studioTitleFor(pathname);
  return (
    <header className="s-top">
      <h1>{title}</h1>
      {activeBrand && <span className="s-crumb hidden sm:inline">· {activeBrand.brand_name}</span>}
      <div className="flex-1" />
      <ActivityChip />
      <Link href="/studio/guide" className="s-btn ghost sm hidden sm:inline-flex" title="Guide: where everything is and what it costs" aria-label="Guide"><CircleHelp className="h-4 w-4" /></Link>
      <CreditPill shared={isSharedBrand(activeBrand)} />
      <button className="s-btn ai hidden md:inline-flex" onClick={() => setOpen(true)}>
        <MessageCircle className="h-4 w-4" /> Ask BlinkSpot
      </button>
      <BrandSwitcher onCreated={refresh} />
      <AccountMenu profile={profile} />
    </header>
  );
}
