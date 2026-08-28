import { createRootRoute, HeadContent, Link, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HashScroll } from "@/components/hash-scroll";
import { Button } from "@/components/ui/button";
import appCss from "../styles.css?url";

const APP_NAME = "Property Gateway";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Explore curated property, hotel-share, and land offers. Book with defined terms and progress toward offer-specific benefits.",
      },
      { name: "theme-color", content: "#AC6D50" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/brand/darmelk-mark.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap",
      },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument() {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        <PreviewHostBridge />
        <AuthProvider>
          <HashScroll />
          <Toaster
            position="top-center"
            toastOptions={{
              classNames: {
                toast: "font-sans bg-cream text-ink border-line",
              },
            }}
          />
          <Shell />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function Shell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const framed = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (framed) {
    return <Outlet />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  );
}

function NotFound() {
  return (
    <main className="container-pg grid min-h-[70svh] place-items-center py-32 text-center">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-muted">
          That route doesn’t exist. Browse published property offers instead.
        </p>
        <Button asChild className="mt-6">
          <Link to="/properties">Explore properties</Link>
        </Button>
      </div>
    </main>
  );
}
