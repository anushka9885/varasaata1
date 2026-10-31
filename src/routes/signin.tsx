import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError, PasswordInput } from "@/components/brand";
import { EMAIL_RE, friendlyAuthError, normalizeEmail } from "@/lib/auth";
import { recordConsent } from "@/lib/policies";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign In · వరసాట VARASAATA" },
      { name: "description", content: "Sign in to continue your VARASAATA matches." },
      { property: "og:title", content: "Sign In · VARASAATA" },
      { property: "og:description", content: "Sign in to VARASAATA." },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Prevent duplicate submit calls
  const submitting = useRef(false);

  // Returning user with a valid session goes straight in.
  // We run this only once on mount and do NOT trigger any router
  // invalidation from here — that avoids remounting the form while typing.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/play" });
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable handlers — using functional updater is not needed for single
  // string fields, but wrapping in useCallback prevents new function
  // references on every render which could cause React to re-diff the input
  // element and briefly lose focus on older Android WebViews.
  const handleEmail = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handlePassword = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const raw = email.trim();
    if (!raw) return setError("Enter your username or email address.");
    if (!password) return setError("Enter your password.");

    setError("");
    setLoading(true);
    submitting.current = true;

    let targetEmail = raw;

    // If user provided a username without '@', try resolving it to their registered auth email
    if (!raw.includes("@")) {
      const cleanUser = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
      try {
        const { data: resolved } = await supabase.rpc("resolve_login_email", {
          p_username: cleanUser,
        });
        if (resolved && typeof resolved === "string") {
          targetEmail = resolved;
        }
      } catch {
        /* ignore RPC missing error and continue with standard attempts */
      }
    }

    let res = await supabase.auth.signInWithPassword({
      email: targetEmail.toLowerCase(),
      password,
    });

    // Fallback: if username login failed, try legacy domains
    if (res.error && !raw.includes("@") && targetEmail === raw) {
      const cleanUser = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
      const legacyEmails = [`${cleanUser}@player.varasaata.local`, `${cleanUser}@varasaata.app`];
      for (const legacy of legacyEmails) {
        const legacyRes = await supabase.auth.signInWithPassword({
          email: legacy,
          password,
        });
        if (!legacyRes.error) {
          res = legacyRes;
          break;
        }
      }
    }

    submitting.current = false;
    setLoading(false);
    if (res.error) {
      if (!raw.includes("@") && targetEmail === raw) {
        return setError(
          "Could not sign in with that username. Please enter your email address to sign in.",
        );
      }
      return setError(friendlyAuthError(res.error.message));
    }
    if (res.data?.user) {
      try {
        await recordConsent(res.data.user.id);
      } catch {
        /* auto consent fallback */
      }
    }
    navigate({ to: "/play" });
  };

  return (
    <AuthShell title="Welcome back">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="signin-email">Username or Email</Label>
          <Input
            id="signin-email"
            type="text"
            autoComplete="username"
            placeholder="e.g. anushka or player@email.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={handleEmail}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="signin-password"
            autoComplete="current-password"
            value={password}
            onChange={handlePassword}
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/signup" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
