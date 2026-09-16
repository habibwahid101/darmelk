import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  FileText,
  GitFork,
  Inbox,
  LayoutDashboard,
  Menu,
  Megaphone,
  Settings,
  Store,
  Users,
  Wallet,
  CreditCard,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { ErrorState, SkeletonBlock, SkipToContent } from "@/components/states";
import { useMemberSession } from "@/components/layout/use-member";
import { cn } from "@/lib/utils";

type AdminPath =
  | "/admin"
  | "/admin/offers"
  | "/admin/bookings"
  | "/admin/users"
  | "/admin/network"
  | "/admin/commission"
  | "/admin/activation"
  | "/admin/documents"
  | "/admin/settings"
  | "/admin/payments"
  | "/admin/merchant"
  | "/admin/promotions"
  | "/admin/withdrawals"
  | "/admin/contact-requests"
  | "/admin/career"
  | "/admin/leadership-rewards";

type NavItem = {
  to: AdminPath;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/offers", label: "Properties", icon: Building2 },
  { to: "/admin/bookings", label: "Bookings", icon: FileText },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/merchant", label: "Merchant Management", icon: Store },
  { to: "/admin/promotions", label: "Promotion Management", icon: Megaphone },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: Wallet },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/contact-requests", label: "Contact Requests", icon: Inbox },
  { to: "/admin/career", label: "Career Management", icon: Briefcase },
  { to: "/admin/network", label: "Network", icon: GitFork },
  { to: "/admin/commission", label: "Commission", icon: Wallet },
  { to: "/admin/leadership-rewards", label: "Leadership Rewards", icon: Award },
  { to: "/admin/activation", label: "Activation", icon: BadgeCheck },
  { to: "/admin/documents", label: "Documents", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const MOBILE_TABS = [NAV[0], NAV[2], NAV[3], NAV[6]];

function isActive(pathname: string, to: string) {
  if (to === "/admin") return pathname === "/admin";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AdminShell() {
  const { user, member, isPending } = useMemberSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [more, setMore] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = more ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [more]);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-paper p-6">
        <SkeletonBlock className="h-12 w-48" />
        <p className="mt-4 text-sm text-muted">Loading operations console…</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || !member) return <RedirectToSignIn />;

  if (member.role !== "admin") {
    return (
      <div className="container-pg py-24">
        <ErrorState
          title="Permission denied"
          description="This console is limited to operators. Return to the member area."
          action={
            <Button asChild>
              <Link to="/app">Go to member area</Link>
            </Button>
          }
        />
      </div>
    );
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <SkipToContent />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-cream lg:flex">
        <div className="px-5 py-5">
          <Link to="/admin" aria-label="Admin home">
            <BrandMark />
          </Link>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
            Operations
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Admin">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine",
                isActive(pathname, item.to)
                  ? "bg-pine text-pine-fg"
                  : "text-ink/75 hover:bg-ink/5 hover:text-ink",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <Link to="/app" className="text-sm text-pine hover:underline">
            Member area
          </Link>
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="mt-2 block rounded-sm text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur lg:hidden">
        <Link to="/admin">
          <BrandMark />
        </Link>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
          aria-label={more ? "Close menu" : "Open menu"}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {more ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {more ? (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-paper pt-14 pb-[var(--darmelk-bottom-nav-clearance)] lg:hidden">
          <nav className="px-4 py-4">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium",
                  isActive(pathname, item.to) ? "bg-pine/10 text-pine-deep" : "text-ink",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            <Link to="/app" className="mt-2 flex min-h-11 items-center px-3 text-[15px] text-muted">
              Member area
            </Link>
          </nav>
        </div>
      ) : null}

      <div className="min-w-0 lg:pl-60">
        <div className="hidden h-14 items-center justify-between border-b border-line px-8 lg:flex">
          <p className="text-sm text-muted">Admin console</p>
          <Button asChild size="sm" variant="secondary">
            <Link to="/app">Member area</Link>
          </Button>
        </div>
        <main id="main-content" tabIndex={-1} className="app-main-with-nav px-[var(--darmelk-gutter)] py-6 outline-none md:px-8 md:py-8">
          <div className="mx-auto min-w-0 max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine",
                isActive(pathname, item.to) ? "text-pine" : "text-muted",
              )}
            >
              <item.icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMore(true)}
            className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            aria-label="Open menu"
            aria-expanded={more}
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
