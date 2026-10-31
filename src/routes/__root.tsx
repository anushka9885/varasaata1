import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initAndroidBackButton } from "@/lib/back-button";
import { SplashScreen } from "@/components/SplashScreen";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {offline
            ? "You appear to be offline. Reconnect and try again."
            : "Something went wrong. You can try again or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              router.navigate({ to: "/" });
            }}
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { name: "theme-color", content: "#120d0a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "Varasaata - Traditional Mill Stone Game" },
      {
        name: "description",
        content:
          "Varasaata (Nine Men's Morris / వరాస ఆట) classical strategy board game featuring AI toughness levels, customizable move timers, Telugu/Hindi/English translations, player stats dashboard, audio effects, avatar customization, light/dark themes, and online multiplayer room lobby.",
      },
      { property: "og:title", content: "Varasaata - Traditional Mill Stone Game" },
      {
        property: "og:description",
        content:
          "Varasaata (Nine Men's Morris / వరాస ఆట) classical strategy board game featuring AI toughness levels, customizable move timers, Telugu/Hindi/English translations, player stats dashboard, audio effects, avatar customization, light/dark themes, and online multiplayer room lobby.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Non-blocking font load: media="print" prevents render-blocking; onload swaps to "all"
      // so fonts apply as soon as the CSS arrives without ever stalling first paint.
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Noto+Serif+Telugu:wght@500;700&family=Spectral:wght@400;600&display=swap",
        media: "print",
        onload: "this.media='all'",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/assets/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // In client SPA mode (e.g. Capacitor Android WebView), the <html>, <head>, and <body>
  // tags already exist in the host HTML document (index.cap.html). Rendering <html> inside
  // <div id="root"> causes a fatal DOM HierarchyRequestError in WebViews, producing a black screen.
  if (typeof document !== "undefined") {
    return <>{children}</>;
  }
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !sessionStorage.getItem("varasaata_splash_shown");
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void initAndroidBackButton();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      // Do NOT invalidate the router while the user is actively typing on the
      // sign-in or sign-up page. A Supabase token-refresh or SIGNED_IN event
      // fired while typing would remount the form and drop characters.
      const path = window.location.pathname;
      const onAuthPage = path === "/signin" || path === "/signup" || path === "/forgot-password";
      if (!onAuthPage) {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    setOnline(navigator.onLine);
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {showSplash && (
        <SplashScreen
          minDurationMs={1100}
          onFinish={() => {
            try {
              sessionStorage.setItem("varasaata_splash_shown", "true");
            } catch {
              /* ignore */
            }
            setShowSplash(false);
          }}
        />
      )}
      {!online && (
        <div
          role="status"
          className="sticky top-0 z-50 bg-destructive py-1 text-center text-sm text-destructive-foreground"
        >
          You're offline — saving and sign-in need a connection.
        </div>
      )}
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
