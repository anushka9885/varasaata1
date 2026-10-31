import { useEffect, useState } from "react";
import { LOGO_SRC } from "@/components/brand";

interface Props {
  onFinish?: () => void;
  minDurationMs?: number;
}

export function SplashScreen({ onFinish, minDurationMs = 1200 }: Props) {
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      const hideTimer = setTimeout(() => {
        setVisible(false);
        onFinish?.();
      }, 350);
      return () => clearTimeout(hideTimer);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs, onFinish]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#120d0a] text-white transition-opacity duration-300 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-hidden={fading}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
        {/* Ambient warm gold glow */}
        <div className="relative">
          <div className="absolute -inset-8 rounded-full bg-amber-500/15 blur-2xl animate-pulse" />
          <img
            src={LOGO_SRC}
            alt="VARASAATA"
            width={140}
            height={140}
            className="relative drop-shadow-[0_10px_25px_rgba(200,155,60,0.35)]"
          />
        </div>

        <div className="mt-6 text-center">
          <div className="font-telugu text-4xl font-bold tracking-wide text-gold-gradient">
            వరసాట
          </div>
          <div className="mt-1 font-display text-sm tracking-[0.4em] text-amber-200/80">
            VARASAATA
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-widest text-amber-100/50">
            Ancient Stone Strategy Game
          </div>
        </div>

        {/* Loading shimmer bar */}
        <div className="mt-10 h-1 w-32 overflow-hidden rounded-full bg-amber-950/60">
          <div className="h-full w-full origin-left animate-pulse bg-gradient-to-r from-amber-600 via-amber-300 to-amber-600" />
        </div>
      </div>
    </div>
  );
}
