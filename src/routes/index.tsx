import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gamepad2, Users, Globe, BookOpen, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo, Title, LegalLinks } from "@/components/brand";
import { showBanner } from "@/lib/ads";
import { triggerHaptic } from "@/lib/haptics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VARASAATA · Traditional Mill Stone Game" },
      {
        name: "description",
        content:
          "Varasaata (Nine Men's Morris / వరాస ఆట) classical strategy board game featuring AI toughness levels, customizable move timers, player stats, audio effects, avatar customization, and online multiplayer room lobby.",
      },
      { property: "og:title", content: "VARASAATA · Traditional Mill Stone Game" },
      {
        property: "og:description",
        content:
          "Play the traditional Nine Men's Morris strategy game on mobile. Online multiplayer, smart AI, and local 2-player.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/play", replace: true });
      } else {
        setSessionChecked(true);
        void showBanner();
      }
    });
  }, [navigate]);

  return (
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-between bg-gradient-to-b from-[#160f0a] via-[#120d09] to-[#0a0705] text-amber-50 px-4 select-none">
      {/* Ambient background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full bg-amber-600/10 blur-[100px]" />
      </div>

      {/* Main Content Area */}
      <main
        className="relative z-10 w-full max-w-md flex flex-col items-center flex-1 justify-center py-6 text-center space-y-5"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Emblem & Title */}
        <div className="flex flex-col items-center space-y-2">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-amber-500/15 blur-xl animate-pulse" />
            <Logo size={130} />
          </div>
          <Title />
          <p className="text-xs uppercase tracking-[0.25em] text-amber-200/70 font-display">
            The Ancient Indian Stone Game
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full grid grid-cols-3 gap-2 pt-1 text-left">
          <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-600/20 backdrop-blur-md flex flex-col items-center text-center">
            <Gamepad2 className="h-5 w-5 text-amber-400 mb-1" />
            <div className="text-[11px] font-bold text-amber-100">Smart AI</div>
            <div className="text-[9px] text-amber-200/60 mt-0.5">4 Levels</div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-600/20 backdrop-blur-md flex flex-col items-center text-center">
            <Users className="h-5 w-5 text-emerald-400 mb-1" />
            <div className="text-[11px] font-bold text-amber-100">Pass &amp; Play</div>
            <div className="text-[9px] text-amber-200/60 mt-0.5">Local 2P</div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-600/20 backdrop-blur-md flex flex-col items-center text-center">
            <Globe className="h-5 w-5 text-sky-400 mb-1" />
            <div className="text-[11px] font-bold text-amber-100">Live Lobby</div>
            <div className="text-[9px] text-amber-200/60 mt-0.5">Realtime</div>
          </div>
        </div>

        {/* Brief game premise */}
        <p className="text-xs sm:text-sm text-amber-100/75 max-w-xs leading-relaxed px-2">
          Align 3 stones to form a <strong className="text-amber-300">Mill</strong> and capture your opponent's gems in this timeless battle of wits.
        </p>

        {/* Primary Action Buttons */}
        <div className="w-full space-y-2.5 pt-2">
          <Button
            asChild
            size="lg"
            className="w-full h-13 text-base font-bold bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-stone-950 shadow-[0_4px_20px_rgba(217,119,6,0.35)] hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] transition-transform rounded-xl"
            onClick={() => triggerHaptic("medium")}
          >
            <Link to="/signup" className="flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>Create Account &amp; Play</span>
              <ArrowRight className="h-4 w-4 ml-0.5" />
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full h-12 text-sm font-semibold border-amber-600/35 bg-amber-950/20 text-amber-200 hover:bg-amber-900/40 active:scale-[0.98] transition-transform rounded-xl"
            onClick={() => triggerHaptic("light")}
          >
            <Link to="/signin">Sign In to Existing Account</Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              triggerHaptic("light");
              setShowRules(true);
            }}
            className="text-xs text-amber-300/80 hover:text-amber-200"
          >
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            How to Play &amp; Rules
          </Button>
        </div>
      </main>

      {/* Bottom Footer / Safe Area Padding */}
      <footer
        className="relative z-10 w-full max-w-md pb-4 pt-2 flex flex-col items-center gap-2"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <LegalLinks />
        <div className="text-[10px] text-amber-200/40 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          <span>v2.0 Native Edition · VARASAATA</span>
        </div>
      </footer>

      {/* Rules & How to Play Modal */}
      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent className="max-w-sm rounded-2xl bg-[#1a120c] border-amber-600/30 text-amber-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg text-amber-300 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-400" />
              How to Play VARASAATA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs leading-relaxed text-amber-100/85">
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/30">
              <span className="font-bold text-amber-300">Phase 1: Placing</span>
              <p className="mt-1 text-amber-200/70">
                Players take turns placing 9 stones onto vacant intersection points.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/30">
              <span className="font-bold text-amber-300">Forming a Mill (వరుస)</span>
              <p className="mt-1 text-amber-200/70">
                Line up 3 stones in a row to form a Mill and capture 1 opponent stone!
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/30">
              <span className="font-bold text-amber-300">Phase 2: Moving</span>
              <p className="mt-1 text-amber-200/70">
                Slide stones along the lines to adjacent vacant spots.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/30">
              <span className="font-bold text-amber-300">Phase 3: Flying</span>
              <p className="mt-1 text-amber-200/70">
                When reduced to only 3 stones, a player can fly to any vacant point!
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/30">
              <span className="font-bold text-amber-300">Winning</span>
              <p className="mt-1 text-amber-200/70">
                Leave your opponent with fewer than 3 stones or no legal moves.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
