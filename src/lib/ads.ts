/**
 * Native-only Google AdMob integration. Test ad units are used unless
 * VITE_ADS_PRODUCTION is explicitly set to "true" for a release build.
 */
export const ADMOB_APP_ID = "ca-app-pub-9580341378631539~2782824357";

const PROD = {
  banner: "ca-app-pub-9580341378631539/7942072687",
  interstitial: "ca-app-pub-9580341378631539/5464828011",
};
const TEST = {
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
};

export const ADS_PRODUCTION = import.meta.env.VITE_ADS_PRODUCTION === "true";
export const IS_PRODUCTION = ADS_PRODUCTION;
export const AD_IDS = ADS_PRODUCTION ? PROD : TEST;
export const BANNER_AD_ID = AD_IDS.banner;
export const INTERSTITIAL_AD_ID = AD_IDS.interstitial;
export const INTERSTITIAL_MIN_GAP_MS = 3 * 60 * 1000;

/** Pure frequency-cap rule, kept separate so it can be tested without AdMob. */
export function canShowInterstitial(now: number, lastShownAt: number | null): boolean {
  return lastShownAt === null || now - lastShownAt >= INTERSTITIAL_MIN_GAP_MS;
}

type AdMobMod = typeof import("@capacitor-community/admob");

let ready: Promise<AdMobMod | null> | null = null;
let canRequestAds = false;
let lastInterstitialAt: number | null = null;
let interstitialBusy = false;
let bannerShown = false;

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch (error) {
    console.warn("[Ads] Could not detect native platform:", error);
    return false;
  }
}

/** Initialise once in the background; safe to call from web and server code. */
export function initAds(): Promise<AdMobMod | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (ready) return ready;

  ready = (async () => {
    if (!(await isNative())) return null;
    try {
      const mod = await import("@capacitor-community/admob");
      await mod.AdMob.initialize({ initializeForTesting: !ADS_PRODUCTION });
      try {
        let info = await mod.AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
          info = await mod.AdMob.showConsentForm();
        }
        canRequestAds = info.canRequestAds ?? info.status !== mod.AdmobConsentStatus.REQUIRED;
      } catch (error) {
        console.warn("[Ads] Consent status check notice:", error);
        canRequestAds = !ADS_PRODUCTION;
      }
      // In development/test mode, always allow test ad unit requests
      if (!ADS_PRODUCTION) {
        canRequestAds = true;
      }
      if (canRequestAds) void prepareInterstitial(mod);
      return mod;
    } catch (error) {
      console.warn("[Ads] AdMob unavailable:", error);
      return null;
    }
  })();
  return ready;
}

/** Cancels any pending interstitial state when navigating away or restarting */
export function cancelPendingAds(): void {
  interstitialBusy = false;
}

/** Lets users revisit their ad privacy choices on supported native platforms. */
export async function openAdPrivacyOptions(): Promise<boolean> {
  const mod = await initAds();
  if (!mod) return false;
  try {
    await mod.AdMob.showPrivacyOptionsForm();
    return true;
  } catch (error) {
    console.warn("[Ads] Privacy options could not be opened:", error);
    return false;
  }
}

/** Compatibility API retained for callers using the original local name. */
export async function showPrivacyOptions(): Promise<void> {
  await openAdPrivacyOptions();
}

async function prepareInterstitial(mod: AdMobMod): Promise<void> {
  try {
    await mod.AdMob.prepareInterstitial({
      adId: AD_IDS.interstitial,
      isTesting: !ADS_PRODUCTION,
    });
  } catch (error) {
    console.info("[Ads] Interstitial not ready:", error);
  }
}

export async function showBanner(): Promise<void> {
  const mod = await initAds();
  if (!mod || !canRequestAds || bannerShown) return;

  bannerShown = true;
  try {
    await mod.AdMob.showBanner({
      adId: AD_IDS.banner,
      isTesting: !ADS_PRODUCTION,
      adSize: mod.BannerAdSize.ADAPTIVE_BANNER,
      position: mod.BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    });
  } catch (error) {
    bannerShown = false;
    console.warn("[Ads] Banner could not be shown:", error);
  }
}

export async function hideBanner(): Promise<void> {
  if (!bannerShown) return;
  bannerShown = false;
  const mod = await initAds();
  try {
    await mod?.AdMob.removeBanner();
  } catch (error) {
    console.warn("[Ads] Banner could not be removed:", error);
  }
}

/** Call after a completed match; frequency-capped and non-blocking for the game. */
export async function maybeShowInterstitial(): Promise<void> {
  const mod = await initAds();
  if (
    !mod ||
    !canRequestAds ||
    interstitialBusy ||
    !canShowInterstitial(Date.now(), lastInterstitialAt)
  )
    return;

  interstitialBusy = true;
  try {
    await mod.AdMob.showInterstitial();
    lastInterstitialAt = Date.now();
  } catch (error) {
    console.warn("[Ads] Interstitial could not be shown:", error);
  } finally {
    interstitialBusy = false;
    void prepareInterstitial(mod);
  }
}

/** Compatibility API retained for callers using the original local name. */
export async function showInterstitialAfterMatch(): Promise<void> {
  await maybeShowInterstitial();
}
