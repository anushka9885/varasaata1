import { supabase } from "@/integrations/supabase/client";

/** Bump either version to require every user to re-consent before playing. */
export const PRIVACY_POLICY_VERSION = "2026-10-19"; // bumped: added Google AdMob advertising disclosure
export const TERMS_VERSION = "2026-10-16";

const consentKey = (userId: string) => `varasaata_consent_${userId}_${PRIVACY_POLICY_VERSION}_${TERMS_VERSION}`;

export async function hasCurrentConsent(userId: string): Promise<boolean> {
  // Check local cache first (instant, reliable offline)
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem(consentKey(userId)) === "true") {
        return true;
      }
    } catch {
      // Ignore localStorage issues
    }
  }

  try {
    const { data, error } = await supabase
      .from("policy_consents")
      .select("id")
      .eq("user_id", userId)
      .eq("privacy_policy_version", PRIVACY_POLICY_VERSION)
      .eq("terms_version", TERMS_VERSION)
      .limit(1);

    if (error) {
      console.warn("[Policies] Could not verify remote consent:", error.message);
      // If network fails, allow gameplay if session was already authenticated
      return true;
    }

    const consented = (data?.length ?? 0) > 0;
    if (consented && typeof window !== "undefined") {
      try {
        localStorage.setItem(consentKey(userId), "true");
      } catch {
        /* ignore */
      }
    }
    return consented;
  } catch (err) {
    console.warn("[Policies] Consent check error (offline fallback):", err);
    return true;
  }
}

export async function recordConsent(userId: string) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(consentKey(userId), "true");
    } catch {
      /* ignore */
    }
  }

  try {
    const { error } = await supabase.from("policy_consents").upsert(
      {
        user_id: userId,
        privacy_policy_version: PRIVACY_POLICY_VERSION,
        terms_version: TERMS_VERSION,
        consent_source: typeof window !== "undefined" && "Capacitor" in window ? "android" : "web",
      },
      { onConflict: "user_id,privacy_policy_version,terms_version", ignoreDuplicates: true },
    );
    if (error) {
      console.warn("[Policies] Remote consent recording notice:", error.message);
    }
  } catch (err) {
    console.warn("[Policies] Remote consent recording skipped (offline):", err);
  }
}
