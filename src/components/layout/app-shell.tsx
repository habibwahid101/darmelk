import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Award,
  BadgeCheck,
  Building2,
  FileText,
  GitFork,
  LayoutDashboard,
  List,
  Megaphone,
  Menu,
  Settings,
  ShieldCheck,
  ShieldEllipsis,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { SkeletonBlock } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { cn } from "@/lib/utils";
import { isGrowthParticipant } from "@/lib/growth";

type AppPath =
  | "/app"
  | "/app/bookings"
  | "/app/network"
  | "/app/qualification"
  | "/app/commission"
  | "/app/leadership-reward"
  | "/app/merchant"
  | "/app/promotions"
  | "/app/transactions"
  | "/app/documents"
  | "/app/activation"
  | "/app/settings"
  | "/growth-program";

type NavItem = {
  to: AppPath;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

const GENERAL_PRIMARY: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/bookings", label: "Bookings", icon: Building2 },
];

const GROWTH_PRIMARY: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/bookings", label: "Bookings", icon: Building2 },
  { to: "/app/network", label: "Network", icon: GitFork },
  { to: "/app/qualification", label: "Qualification", icon: ShieldCheck },
  { to: "/app/commission", label: "Commission", icon: Wallet },
  { to: "/app/leadership-reward", label: "Leadership Reward", icon: Award },
];

const GENERAL_MORE: NavItem[] = [
  { to: "/growth-program", label: "Growth Program", icon: BadgeCheck },
  { to: "/app/promotions", label: "Promotions", icon: Megaphone },
  { to: "/app/transactions", label: "Transactions", icon: List },
  { to: "/app/documents", label: "Documents", icon: FileText },
  { to: "/app/settings", label: "Account", icon: Settings },
];

const GROWTH_MORE: NavItem[] = [
  { to: "/app/promotions", label: "Promotions", icon: Megaphone },
  { to: "/app/transactions", label: "Transactions", icon: List },
  { to: "/app/documents", label: "Documents", icon: FileText },
  { to: "/app/activation", label: "Activation", icon: BadgeCheck },
  { to: "/app/settings", label: "Account", icon: Settings },
];

const GROWTH_LOCKED = [
  "/app/network",
  "/app/qualification",
  "/app/commission",
  "/app/leadership-reward",
  "/app/activation",
];

function isActive(pathname: string, to: string) {
  if (to === "/app") return pathname === "/app";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell() {
  const { user, member, merchant, isPending } = useMemberSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-paper p-6">
        <SkeletonBlock className="h-12 w-48" />
        <p className="mt-4 text-sm text-muted">Loading member area…</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || !member) return <RedirectToSignIn />;

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
    }
  }

  const merchantNav: NavItem = {
    to: "/app/merchant",
    label: merchant?.status === "active" ? "Merchant" : "Become a Merchant",
    icon: Store,
  };
  const inGrowth = isGrowthParticipant(member);
  const primary = inGrowth ? GROWTH_PRIMARY : GENERAL_PRIMARY;
  const moreItems = inGrowth ? GROWTH_MORE : GENERAL_MORE;
  const allNav = [...primary, merchantNav, ...moreItems];
  const mobileTabs = inGrowth
    ? [GROWTH_PRIMARY[0], GROWTH_PRIMARY[1], GROWTH_PRIMARY[2], GROWTH_PRIMARY[4]]
    : [GENERAL_PRIMARY[0], GENERAL_PRIMARY[1], GENERAL_MORE[1], GENERAL_MORE[4]];
  const growthLocked =
    !inGrowth && GROWTH_LOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <div className="min-h-dvh bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-cream lg:flex">
        <div className="px-5 py-5">
          <Link to="/" aria-label="Darmelk home">
            <BrandMark />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Member">
          {allNav.map((item) => (
            <SideLink key={item.to} item={item} active={isActive(pathname, item.to)} />
          ))}
          {member.role === "admin" ? (
            <Link
              to="/admin"
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium",
                pathname.startsWith("/admin")
                  ? "bg-pine text-pine-fg"
                  : "text-ink/75 hover:bg-ink/5 hover:text-ink",
              )}
            >
              <ShieldEllipsis className="size-4" strokeWidth={1.75} />
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-medium">{user.displayName ?? "Member"}</p>
          <p className="truncate text-xs text-muted">{user.primaryEmail || "Member"}</p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="mt-3 text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 backdrop-blur lg:hidden">
        <Link to="/app" aria-label="Overview">
          <BrandMark />
        </Link>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-paper pt-14 pb-[var(--darmelk-bottom-nav-clearance)] lg:hidden">
          <nav className="px-4 py-4" aria-label="More">
            {allNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium",
                  isActive(pathname, item.to) ? "bg-pine/10 text-pine-deep" : "text-ink",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            ))}
            {member.role === "admin" ? (
              <Link
                to="/admin"
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink"
              >
                <ShieldEllipsis className="size-4" strokeWidth={1.75} />
                Admin
              </Link>
            ) : null}
            <Link
              to="/"
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-muted"
            >
              Public site
            </Link>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="mt-2 flex min-h-11 w-full items-center rounded-lg px-3 py-2.5 text-left text-[15px] text-clay"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </nav>
        </div>
      ) : null}

      <div className="min-w-0 lg:pl-60">
        <div className="hidden h-14 items-center justify-between border-b border-line px-8 lg:flex">
          <p className="text-sm text-muted">Member console</p>
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="secondary">
              <Link to="/properties">Explore properties</Link>
            </Button>
            <span className="text-sm font-medium">{user.displayName ?? "Member"}</span>
          </div>
        </div>
        <main className="app-main-with-nav px-[var(--darmelk-gutter)] py-6 md:px-8 md:py-8">
          <div className="mx-auto min-w-0 max-w-6xl">{growthLocked ? <JoinGrowthCard /> : <Outlet />}</div>
        </main>
      </div>

      <nav
        className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur lg:hidden"
        aria-label="Mobile"
      >
        <div className="grid grid-cols-5">
          {mobileTabs.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                isActive(pathname, item.to) ? "text-pine" : "text-muted",
              )}
            >
              <item.icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
              menuOpen ? "text-pine" : "text-muted",
            )}
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}

function JoinGrowthCard() {
  return (
    <div className="rounded-2xl bg-cream p-6 shadow-[var(--shadow-card)] sm:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">Growth Program</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">Join to use this area</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Network, qualification, commission, leadership, and activation belong to the Growth Program. A valid Referral ID is required to join.
      </p>
      <Button asChild className="mt-6">
        <Link to="/growth-program">Continue to Growth Program</Link>
      </Button>
    </div>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium",
        active ? "bg-pine text-pine-fg" : "text-ink/75 hover:bg-ink/5 hover:text-ink",
      )}
    >
      <item.icon className="size-4" strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}
