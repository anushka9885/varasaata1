import { describe, expect, it } from "vitest";
import {
  EMAIL_RE,
  friendlyAuthError,
  normalizeLoginIdentifier,
  usernameToAuthEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from "./auth";

describe("auth helpers", () => {
  describe("validateUsername", () => {
    it("rejects usernames shorter than 3 characters", () => {
      expect(validateUsername("ab")).toBe("Username must be 3–30 characters long.");
      expect(validateUsername("")).toBe("Username must be 3–30 characters long.");
    });

    it("rejects usernames longer than 30 characters", () => {
      const longName = "a".repeat(31);
      expect(validateUsername(longName)).toBe("Username must be 3–30 characters long.");
    });

    it("rejects invalid characters (spaces, hyphens, symbols)", () => {
      expect(validateUsername("user name")).toBe(
        "Username can only contain letters, numbers, and underscores.",
      );
      expect(validateUsername("user-name")).toBe(
        "Username can only contain letters, numbers, and underscores.",
      );
      expect(validateUsername("user@name")).toBe(
        "Username can only contain letters, numbers, and underscores.",
      );
    });

    it("rejects email addresses entered into the username field", () => {
      expect(validateUsername("anushkabonam@gmail.com")).toBe(
        "Username can only contain letters, numbers, and underscores.",
      );
      expect(validateUsername("player@domain.org")).toBe(
        "Username can only contain letters, numbers, and underscores.",
      );
    });

    it("accepts valid usernames with letters, numbers, and underscores", () => {
      expect(validateUsername("anushka")).toBeNull();
      expect(validateUsername("anushkabonam")).toBeNull();
      expect(validateUsername("player_01")).toBeNull();
      expect(validateUsername("VARASAATA_PRO")).toBeNull();
    });
  });

  describe("validateEmail", () => {
    it("rejects empty or whitespace email", () => {
      expect(validateEmail("")).toBe("Enter your email address.");
      expect(validateEmail("   ")).toBe("Enter your email address.");
    });

    it("rejects invalid email formats", () => {
      expect(validateEmail("anushka")).toBe("Please enter a valid email address.");
      expect(validateEmail("anushka@")).toBe("Please enter a valid email address.");
      expect(validateEmail("@gmail.com")).toBe("Please enter a valid email address.");
      expect(validateEmail("user@domain")).toBe("Please enter a valid email address.");
    });

    it("accepts valid deliverable emails", () => {
      expect(validateEmail("anushkabonam@gmail.com")).toBeNull();
      expect(validateEmail("player@varasaata.com")).toBeNull();
      expect(validateEmail("bonamvvsatyanarayan@gmail.com")).toBeNull();
    });
  });

  describe("usernameToAuthEmail and normalizeLoginIdentifier", () => {
    it("converts a username to a deterministic fallback email", () => {
      const email = usernameToAuthEmail("anushka");
      expect(email).toBe("anushka@player.varasaata.local");
      expect(EMAIL_RE.test(email)).toBe(true);
    });

    it("normalizes usernames via normalizeLoginIdentifier", () => {
      expect(normalizeLoginIdentifier("player_one")).toBe("player_one@player.varasaata.local");
    });

    it("preserves real email addresses in normalizeLoginIdentifier", () => {
      expect(normalizeLoginIdentifier("user@example.com")).toBe("user@example.com");
      expect(normalizeLoginIdentifier("  User@Example.COM  ")).toBe("user@example.com");
    });
  });

  describe("validatePassword", () => {
    it("requires at least 6 characters", () => {
      expect(validatePassword("12345")).toBe("Password must be at least 6 characters.");
      expect(validatePassword("123456")).toBeNull();
      expect(validatePassword("strong_Pass_2026!")).toBeNull();
    });
  });

  describe("friendlyAuthError", () => {
    it("translates invalid credentials", () => {
      expect(friendlyAuthError("Invalid login credentials")).toBe(
        "Username/email or password is incorrect.",
      );
    });

    it("translates duplicate accounts", () => {
      expect(friendlyAuthError("User already registered")).toBe(
        "An account with this email or username already exists. Please sign in.",
      );
    });

    it("translates placeholder and reserved domain errors", () => {
      expect(
        friendlyAuthError(
          "This email address is not allowed. Placeholder, reserved, or mistyped domains such as example.com or gmai.com cannot receive email.",
        ),
      ).toBe(
        "Please enter a valid, deliverable email address (e.g. your Gmail or personal email).",
      );
    });

    it("translates weak/pwned passwords", () => {
      expect(friendlyAuthError("Password should be stronger: pwned")).toBe(
        "This password is too common or weak. Please choose a stronger password.",
      );
    });

    it("provides clear instructions for email confirmation", () => {
      expect(friendlyAuthError("Email not confirmed")).toContain(
        "Immediate sign-in requires 'Confirm email' to be disabled in your Supabase Dashboard",
      );
    });
  });
});
