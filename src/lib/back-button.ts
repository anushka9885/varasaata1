/**
 * Android hardware back button coordination for VARASAATA.
 * Integrates with @capacitor/app on Android devices.
 */

type BackHandler = () => boolean; // returns true if event was handled

const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}

let isInitialized = false;

export async function initAndroidBackButton(): Promise<void> {
  if (isInitialized || typeof window === "undefined") return;
  isInitialized = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import("@capacitor/app");

    await App.addListener("backButton", ({ canGoBack }) => {
      // Execute the most recently registered handler (LIFO: modals first, then subtabs, then screen)
      for (let i = handlers.length - 1; i >= 0; i--) {
        const handled = handlers[i]();
        if (handled) return;
      }

      // If no custom handler consumed the back button
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch (error) {
    console.warn("[BackButton] Listener initialization skipped:", error);
  }
}
