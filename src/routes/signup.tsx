import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError, PasswordInput } from "@/components/brand";
import { friendlyAuthError, validateEmail, validatePassword, validateUsername } from "@/lib/auth";
import { recordConsent } from "@/lib/policies";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up · వరసాట VARASAATA" },
      {
        name: "description",
        content: "Create your VARASAATA account to play the traditional stone strategy game.",
      },
      { property: "og:title", content: "Sign Up · VARASAATA" },
      { property: "og:description", content: "Create your VARASAATA account." },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const handleName = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, name: v }));
  }, []);

  const handleEmail = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, email: v }));
  }, []);

  const handleUsername = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, username: v }));
  }, []);

  const handlePassword = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, password: v }));
  }, []);

  const handleConfirm = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((prev) => ({ ...prev, confirm: v }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;

    const er: Record<string, string> = {};
    const name = f.name.trim();
    const rawEmail = f.email.trim();
    const rawUsername = f.username.trim();

    if (name.length < 2 || name.length > 60) {
      er.name = "Enter your display name (2–60 characters).";
    }

    const emailErr = validateEmail(rawEmail);
    if (emailErr) {
      er.email = emailErr;
    }

    const uErr = validateUsername(rawUsername);
    if (uErr) {
      er.username = uErr;
    }

    const cleanUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "");

    const pw = validatePassword(f.password);
    if (pw) er.password = pw;
    if (f.password !== f.confirm) er.confirm = "Passwords do not match.";

    setErrors(er);
    if (Object.keys(er).length) return;

    setLoading(true);
    submitting.current = true;

    // Check case-insensitive uniqueness in profiles table
    try {
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (existingUser) {
        submitting.current = false;
        setLoading(false);
        return setErrors({
          username: `The username "${cleanUsername}" is already taken. Please choose another.`,
        });
      }
    } catch {
      // Continue if offline or table check fails
    }

    const realEmail = rawEmail.toLowerCase();

    // Call Supabase signUp with user's real email
    const { data, error } = await supabase.auth.signUp({
      email: realEmail,
      password: f.password,
      options: {
        data: {
          username: cleanUsername,
          display_name: name || cleanUsername,
        },
      },
    });

    if (error) {
      // If user already registered in Supabase auth, attempt sign-in with the provided credentials
      if (
        error.message.toLowerCase().includes("already registered") ||
        error.message.toLowerCase().includes("already exists")
      ) {
        const loginRes = await supabase.auth.signInWithPassword({
          email: realEmail,
          password: f.password,
        });

        if (!loginRes.error && loginRes.data.user) {
          try {
            await supabase.from("profiles").upsert(
              {
                user_id: loginRes.data.user.id,
                username: cleanUsername,
                display_name: name || cleanUsername,
              },
              { onConflict: "user_id" },
            );
            await recordConsent(loginRes.data.user.id);
          } catch {
            /* ignore consent errors */
          }
          submitting.current = false;
          setLoading(false);
          navigate({ to: "/play" });
          return;
        }

        submitting.current = false;
        setLoading(false);
        return setErrors({
          email: `An account with email "${realEmail}" already exists. Please sign in.`,
        });
      }

      submitting.current = false;
      setLoading(false);
      return setErrors({ form: friendlyAuthError(error.message) });
    }

    // Determine active session: if returned directly (email confirm off), use it
    let activeSession = data.session;
    let activeUser = data.user;

    // If session was not returned in signUp, attempt immediate sign-in
    if (!activeSession) {
      const signInRes = await supabase.auth.signInWithPassword({
        email: realEmail,
        password: f.password,
      });

      if (signInRes.data?.session && signInRes.data?.user) {
        activeSession = signInRes.data.session;
        activeUser = signInRes.data.user;
      } else if (signInRes.error) {
        submitting.current = false;
        setLoading(false);
        const msg = signInRes.error.message.toLowerCase();
        if (msg.includes("confirm") || msg.includes("email not confirmed")) {
          return setErrors({
            form: "Account created! Please check your email to confirm your account, or disable 'Confirm email' in Supabase Dashboard (Authentication → Providers → Email) for immediate sign-in.",
          });
        }
        return setErrors({
          form: friendlyAuthError(signInRes.error.message),
        });
      }
    }

    if (activeUser && activeSession) {
      try {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            user_id: activeUser.id,
            username: cleanUsername,
            display_name: name || cleanUsername,
          },
          { onConflict: "user_id" },
        );
        if (profileError) {
          console.warn("[Profile] Profile upsert notice:", profileError.message);
          if (profileError.code === "23505" || profileError.message.toLowerCase().includes("unique")) {
            submitting.current = false;
            setLoading(false);
            return setErrors({
              username: `The username "${cleanUsername}" is already taken. Please choose another username.`,
            });
          }
        }
        await recordConsent(activeUser.id);
      } catch (saveErr) {
        console.warn("[Consent] Consent recording notice:", saveErr);
      }

      submitting.current = false;
      setLoading(false);
      navigate({ to: "/play" });
      return;
    }

    // If still no session could be established
    submitting.current = false;
    setLoading(false);
    setErrors({
      form: "Could not establish an active session. If email confirmation is enabled in Supabase, please verify your email or disable 'Confirm email' under Authentication -> Providers -> Email in your Supabase Dashboard.",
    });
  };

  return (
    <AuthShell title="Create your account">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="signup-name">Display Name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            placeholder="e.g. Anushka"
            value={f.name}
            onChange={handleName}
          />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="e.g. anushkabonam@gmail.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.email}
            onChange={handleEmail}
          />
          <FieldError>{errors.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="signup-username">Username</Label>
          <Input
            id="signup-username"
            type="text"
            autoComplete="username"
            placeholder="e.g. anushkabonam"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.username}
            onChange={handleUsername}
          />
          <FieldError>{errors.username}</FieldError>
        </div>
        <div>
          <Label htmlFor="signup-password">Password</Label>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            placeholder="Enter password"
            value={f.password}
            onChange={handlePassword}
          />
          <FieldError>{errors.password}</FieldError>
        </div>
        <div>
          <Label htmlFor="signup-confirm">Confirm password</Label>
          <PasswordInput
            id="signup-confirm"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={f.confirm}
            onChange={handleConfirm}
          />
          <FieldError>{errors.confirm}</FieldError>
        </div>
        <FieldError>{errors.form}</FieldError>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Sign Up & Play"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/signin" className="text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
