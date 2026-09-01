import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Properties", to: "/properties", hash: "" },
  { label: "How It Works", to: "/", hash: "how-it-works" },
  { label: "FAQ", to: "/faq", hash: "" },
] as const;

function AuthSlot({ inverted }: { inverted: boolean }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-md bg-ink/10" />;
  }
  if (user) {
    return (
      <Button asChild variant={inverted ? "invertGhost" : "ghost"} size="sm">
        <Link to="/app">Dashboard</Link>
      </Button>
    );
  }
  return (
    <SignedOut>
      <Button asChild variant={inverted ? "invertGhost" : "ghost"} size="sm">
        <Link to="/login">Sign in</Link>
      </Button>
    </SignedOut>
  );
}

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const inverted = isHome && !scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-200",
        inverted
          ? "bg-gradient-to-b from-ink/50 to-transparent"
          : "border-b border-line/80 bg-paper/92 shadow-[0_1px_0_rgb(40_33_30/0.04)] backdrop-blur-md",
      )}
    >
      <div className="container-pg flex h-16 items-center justify-between gap-4 md:h-[4.25rem] lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link to="/" aria-label="Darmelk home" className="shrink-0 lg:justify-self-start">
          <BrandMark inverted={inverted} compact />
        </Link>

        <nav className="hidden items-center gap-4 lg:flex xl:gap-6" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              hash={item.hash || undefined}
              onClick={() => {
                window.setTimeout(() => {
                  if (item.hash) document.getElementById(item.hash)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 80);
              }}
              className={cn(
                "text-[13px] font-medium tracking-wide transition-colors duration-150",
                inverted ? "text-cream/80 hover:text-cream" : "text-ink/70 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex lg:justify-self-end">
          <AuthSlot inverted={inverted} />
          <Button asChild variant={inverted ? "invert" : "primary"} size="lg">
            <Link to="/login" search={{mode:"create"}}>Create Account</Link>
          </Button>
        </div>

        <button
          type="button"
          className={cn(
            "relative inline-flex size-11 items-center justify-center rounded-lg lg:hidden",
            inverted ? "text-cream" : "text-ink",
          )}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line bg-paper lg:hidden">
          <nav className="container-pg flex flex-col gap-1 py-4" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                hash={item.hash || undefined}
                onClick={() => {
                  setOpen(false);
                  window.setTimeout(() => {
                    if (item.hash) document.getElementById(item.hash)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 80);
                }}
                className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-ink/5"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-3 border-t border-line pt-4">
              {isPending ? (
                <div className="h-11 animate-pulse rounded-lg bg-ink/8" />
              ) : user ? (
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/app" onClick={() => setOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/login" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                </Button>
              )}
              <Button asChild className="w-full">
                <Link to="/login" search={{mode:"create"}} onClick={() => setOpen(false)}>
                  Create account
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
