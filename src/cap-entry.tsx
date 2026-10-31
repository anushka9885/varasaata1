import React, { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initAds } from "./lib/ads";
import "./styles.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SafeAppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[VARASAATA Crash Caught]:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#120d0a] text-amber-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 mb-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
            🦚
          </div>
          <h1 className="font-display text-2xl font-bold text-amber-300">VARASAATA</h1>
          <p className="mt-2 text-sm text-amber-200/70 max-w-xs">
            The game encountered a startup hiccup. Tap below to reload fresh.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold shadow-lg active:scale-95 transition-transform"
          >
            Restart Game
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Render React immediately so the game screen is visible and interactive
// before any native plugin I/O runs.
const router = getRouter();
const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <SafeAppErrorBoundary>
      <RouterProvider router={router} />
    </SafeAppErrorBoundary>,
  );
}

// Guard against calling initAds() more than once. Both the deviceready
// listener path and the safety-net setTimeout share this flag.
let adsStarted = false;

function startAds() {
  if (adsStarted) return;
  adsStarted = true;
  initAds().catch(() => {
    /* non-fatal — game works without ads */
  });
}

// Initialize AdMob AFTER the "deviceready" event, which is Capacitor /
// Cordova's authoritative signal that the native bridge and all registered
// plugins are fully loaded and ready to receive calls.
// On web (no native bridge) this event is never fired, so initAds() is
// guarded by Capacitor.isNativePlatform() inside ads.ts and is a safe no-op.
if (document.readyState === "complete") {
  // The page already fired DOMContentLoaded, so listen for deviceready directly.
  document.addEventListener("deviceready", startAds, { once: true });
} else {
  // Wait for the DOM to be ready first, then wait for deviceready.
  window.addEventListener(
    "load",
    () => {
      document.addEventListener("deviceready", startAds, { once: true });
    },
    { once: true },
  );
}

// Safety net: if deviceready has not fired within 4 s (e.g., running in a
// plain browser during dev), kick off ads anyway so nothing is permanently
// blocked. Capacitor.isNativePlatform() inside ads.ts will still be false
// and the function returns immediately.
// The adsStarted guard above ensures this does NOT re-run if deviceready
// already fired.
setTimeout(() => {
  document.removeEventListener("deviceready", startAds);
  startAds();
}, 4000);
