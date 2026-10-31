import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasCurrentConsent } from "@/lib/policies";
import { GameApp } from "@/components/game/GameApp";

export const Route = createFileRoute("/_authenticated/play")({
  head: () => ({
    meta: [
      { title: "Play · వరసాట VARASAATA" },
      { name: "description", content: "Play Varasaata against a friend or the computer." },
      { property: "og:title", content: "Play · VARASAATA" },
      { property: "og:description", content: "Play the traditional stone strategy game." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    try {
      const ok = await hasCurrentConsent(context.user.id);
      if (!ok) throw redirect({ to: "/consent" });
    } catch (e) {
      if (typeof e === "object" && e !== null && "to" in e) throw e;
      console.warn("[Play] Consent check notice:", e);
    }
  },
  component: Play,
});

function Play() {
  const { user } = Route.useRouteContext();
  return <GameApp userId={user.id} />;
}
