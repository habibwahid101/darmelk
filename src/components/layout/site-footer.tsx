import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-cream">
      <div className="container-pg grid gap-7 py-8 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10 md:py-12">
        <div className="max-w-sm space-y-3">
          <BrandMark />
          <p className="text-sm leading-relaxed text-muted">
            A property-first platform for curated offers. Booking terms,
            progress, and benefits are offer-specific — always shown before you
            commit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:contents">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              Explore
            </p>
            <ul className="mt-2 space-y-0 text-sm">
              <li>
                <Link to="/properties" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  Properties
                </Link>
              </li>
              <li>
                <Link to="/" hash="how-it-works" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  How it works
                </Link>
              </li>
              <li>
                <Link to="/faq" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  FAQ
                </Link>
              </li>
              <li><Link to="/program-rules" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">Program Rules</Link></li>
              <li><Link to="/terms" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">Terms</Link></li>
              <li><Link to="/privacy" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">Privacy</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              Account
            </p>
            <ul className="mt-2 space-y-0 text-sm">
              <li>
                <Link to="/login" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  search={{ mode: "create" }}
                  className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink"
                >
                  Create account
                </Link>
              </li>
              <li>
                <Link to="/app" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  Member area
                </Link>
              </li>
              <li>
                <Link to="/forgot-password" className="inline-flex min-h-8 items-center text-ink/80 hover:text-ink">
                  Forgot password
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-pg flex flex-col gap-1 py-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:py-5">
          <p>© {new Date().getFullYear()} Darmelk. All rights reserved.</p>
          <p>Booking, commission, and property benefit are separate.</p>
        </div>
      </div>
    </footer>
  );
}
