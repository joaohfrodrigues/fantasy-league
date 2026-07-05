// Live league metrics (see CONTEXT.md: Standings, Win probability). Deep module:
// wraps the Standings + Simulation primitives behind one call, so a caller asks
// for "this league's live metrics" once instead of re-deriving round maxes, then
// win probability, then tiebreak-aware rank at every call site. Record metrics
// (Badge, Round prize tallies) are a separate concept — see computeRecordMetrics
// in ./badges, since they never respond to Alternative Reality.
import {
  computeStandings,
  computeRoundMaxes,
  type ScoreLookup,
  type TiebreakMode,
  type StandingRow,
} from "./standings";
import { simulateWinProbability } from "./simulation";

export function computeLiveMetrics<P extends { id: string }>(params: {
  players: P[];
  rounds: { id: string; locked?: boolean; short?: string }[];
  score: ScoreLookup;
  tiebreak: TiebreakMode;
  /** Antithetic pairs for the simulation; see simulateWinProbability. */
  pairs?: number;
}): { standings: StandingRow<P>[]; winProbability: Map<string, number> } {
  const { players, rounds, score, tiebreak, pairs } = params;
  const roundMaxes = computeRoundMaxes(players, rounds, score);
  const winProbability = simulateWinProbability({ players, rounds, score, pairs });
  const standings = computeStandings({
    players,
    rounds,
    score,
    winProbability,
    tiebreak,
    roundMaxes,
  });
  return { standings, winProbability };
}
