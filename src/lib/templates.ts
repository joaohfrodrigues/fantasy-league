// League round templates. Given a template id, the translation dictionary and a
// couple of size options, this builds the ordered list of rounds (localized name +
// short code) used when creating a league. Client-safe: no server-only imports.
import type { Dict } from "@/lib/i18n";

export type TemplateId = "worldCup" | "championsLeague" | "league" | "knockout";

export type TemplateRound = { name: string; short: string };

export const TEMPLATE_IDS: TemplateId[] = ["worldCup", "championsLeague", "league", "knockout"];

export const LEAGUE_MIN_ROUNDS = 1;
export const LEAGUE_MAX_ROUNDS = 40;
export const LEAGUE_DEFAULT_ROUNDS = 10;

export const KNOCKOUT_MIN_DEPTH = 1;
export const KNOCKOUT_MAX_DEPTH = 6;
export const KNOCKOUT_DEFAULT_DEPTH = 4;

export type TemplateOptions = { leagueRounds: number; knockoutDepth: number };

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  leagueRounds: LEAGUE_DEFAULT_ROUNDS,
  knockoutDepth: KNOCKOUT_DEFAULT_DEPTH,
};

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number.isFinite(value) ? value : min);
  return Math.min(max, Math.max(min, n));
}

/** Knockout ladder from the largest stage down to the final. */
function knockoutLadder(t: Dict): TemplateRound[] {
  const k = t.landing.templates.knockoutNames;
  return [
    { name: k.r64, short: "R64" },
    { name: k.r32, short: "R32" },
    { name: k.r16, short: "R16" },
    { name: k.qf, short: "QF" },
    { name: k.sf, short: "SF" },
    { name: k.final, short: "F" },
  ];
}

function matchdays(t: Dict, count: number): TemplateRound[] {
  return Array.from({ length: count }, (_, i) => ({
    name: t.landing.templates.matchday(i + 1),
    short: String(i + 1),
  }));
}

/** Build the ordered rounds for a template. */
export function buildTemplateRounds(
  id: TemplateId,
  t: Dict,
  opts: TemplateOptions,
): TemplateRound[] {
  const ladder = knockoutLadder(t);
  // R32/Playoffs, R16, QF, SF, Final — shared tail for the World Cup / Champions League formats.
  const knockoutTail = ladder.slice(-5);

  switch (id) {
    case "worldCup":
      return [...matchdays(t, 3), ...knockoutTail];
    case "championsLeague":
      return [...matchdays(t, 8), ...knockoutTail];
    case "league": {
      const n = clampInt(opts.leagueRounds, LEAGUE_MIN_ROUNDS, LEAGUE_MAX_ROUNDS);
      return Array.from({ length: n }, (_, i) => ({
        name: t.landing.templates.leagueRound(i + 1),
        short: String(i + 1),
      }));
    }
    case "knockout": {
      const d = clampInt(opts.knockoutDepth, KNOCKOUT_MIN_DEPTH, KNOCKOUT_MAX_DEPTH);
      return ladder.slice(-d);
    }
  }
}
