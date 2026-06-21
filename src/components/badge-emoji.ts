import type { BadgeId } from "@/lib/badges";

// Emoji for each round Badge. Lives in the UI layer (the badges module stays
// id-only); shared so the live board and the landing demo never drift. Labels
// are localized separately via i18n (t.board.badges).
export const BADGE_EMOJI: Record<BadgeId, string> = {
  onFire: "🔥",
  onRise: "📈",
  bottler: "📉",
  ghost: "👻",
};
