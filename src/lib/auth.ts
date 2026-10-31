export const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export function validateUsername(u: string): string | null {
  const trimmed = u.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return "Username must be 3–30 characters long.";
  }
  if (!USERNAME_RE.test(trimmed)) {
    return "Username can only contain letters, numbers, and underscores.";
  }
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return "Enter your email address.";
  }
  if (!EMAIL_RE.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function usernameToAuthEmail(username: string): string {
  const clean = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return `${clean || "player"}@player.varasaata.local`;
}

export const normalizeLoginIdentifier = (input: string): string => {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return usernameToAuthEmail(trimmed);
};

export const normalizeEmail = normalizeLoginIdentifier;

export function validatePassword(p: string): string | null {
  if (p.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Username/email or password is incorrect.";
  if (m.includes("already registered") || m.includes("already exists"))
    return "An account with this email or username already exists. Please sign in.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "You appear to be offline. Check your connection.";
  if (m.includes("pwned") || m.includes("weak"))
    return "This password is too common or weak. Please choose a stronger password.";
  if (m.includes("email not confirmed"))
    return "Immediate sign-in requires 'Confirm email' to be disabled in your Supabase Dashboard under Authentication -> Providers -> Email.";
  if (
    m.includes("not allowed") ||
    m.includes("placeholder") ||
    m.includes("reserved") ||
    m.includes("mistyped domain")
  ) {
    return "Please enter a valid, deliverable email address (e.g. your Gmail or personal email).";
  }
  return message;
}
