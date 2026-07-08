// Position evolution (see CONTEXT.md: Position evolution). Pure module: players,
// an already-filtered round set and the league's tiebreak in, each player's
// per-round rank out. Reuses the Standings module (one call per round-prefix)
// so the chart's ranks can never disagree with the table's.
import {
  computeStandings,
  computeRoundMaxes,
  type ScoreLookup,
  type TiebreakMode,
} from "./standings";

export type PositionPoint = { roundId: string; rank: number };

/**
 * Cumulative rank per player after each round, in round order. `rounds` is
 * taken as given — callers apply Alternative Reality's exclusion (or any
 * other round filtering) before calling this, so the evolution always
 * matches whichever round set is currently driving the standings.
 *
 * A round only appears once someone has actually scored in it (mirrors
 * Standings' own definition of "played"). A player's line only starts at
 * their first-ever scored round — rounds before that are omitted rather
 * than implying they existed at some rank they never occupied (e.g. a
 * player who joins the league mid-tournament).
 */
export function computePositionEvolution<P extends { id: string }>(params: {
  players: P[];
  rounds: { id: string }[];
  score: ScoreLookup;
  tiebreak: TiebreakMode;
}): Map<string, PositionPoint[]> {
  const { players, rounds, score, tiebreak } = params;

  const roundMaxes = computeRoundMaxes(players, rounds, score);
  const playedRounds = rounds.filter((r) => roundMaxes.has(r.id));

  const result = new Map<string, PositionPoint[]>();
  players.forEach((p) => result.set(p.id, []));

  // A player "has appeared" once any prefix's own perRound shows a real
  // score for them — read straight off Standings' own row data (perRound[i]
  // is this round, the last one in the current prefix) rather than
  // re-deriving the same "has this player scored" check independently.
  const hasAppeared = new Set<string>();
  const noProb = new Map<string, number>();
  for (let i = 0; i < playedRounds.length; i++) {
    const standings = computeStandings({
      players,
      rounds: playedRounds.slice(0, i + 1),
      score,
      winProbability: noProb,
      tiebreak,
      roundMaxes,
    });
    for (const row of standings) {
      if (row.perRound[i] !== null) hasAppeared.add(row.player.id);
      if (!hasAppeared.has(row.player.id)) continue;
      result.get(row.player.id)?.push({ roundId: playedRounds[i].id, rank: row.rank });
    }
  }

  return result;
}
