import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wrap a promise with a timeout that resolves to null after the given ms.
 * Used to prevent the beforeLoad from hanging forever when there is no network.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. First check local session (instant, works offline without network delay)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        return { user: sessionData.session.user };
      }
    } catch {
      // Ignore local storage read errors and continue to getUser
    }

    // 2. If no valid local session exists, verify with Supabase Auth with a 3s timeout
    const result = await withTimeout(supabase.auth.getUser(), 3000);
    if (!result || result.error || !result.data.user) {
      throw redirect({ to: "/signin" });
    }
    return { user: result.data.user };
  },
  component: () => <Outlet />,
});
