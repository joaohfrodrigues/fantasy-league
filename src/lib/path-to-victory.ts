// Path to Victory (see CONTEXT.md: Path to Victory). Deep module: standings-
// shaped inputs (rank, per-round scores) in, one actionable per-round average
// out — hides the projection math behind a single question: "what does this
// player need to average to catch the leader?" Built alongside simulation.ts
// rather than on its Monte Carlo — the projection here is average + a
// one-round safety buffer, not a full simulation (issue #21: "no new
// simulation infrastructure").

import { SCORE_MAX, type ScoreLookup } from "./simulation";

export type { ScoreLookup };

export type PathToVictoryResult =
  | { status: "no-rounds-left" }
  | { status: "leading"; requiredAverage: number; chaserId: string | null }
  | { status: "chasing"; requiredAverage: number; leaderId: string; impossible: boolean };

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * The per-round average a chaser needs to catch a target: the target's
 * projected finish (current total + their own average over the rounds left,
 * plus a one-round safety buffer from their own score spread) minus the
 * chaser's current total, spread over the rounds left.
 */
function requiredAverageToCatch(params: {
  target: { total: number; played: number[] };
  chaserTotal: number;
  roundsRemaining: number;
}): number {
  const { target, chaserTotal, roundsRemaining } = params;
  const average = target.played.length
    ? target.played.reduce((a, b) => a + b, 0) / target.played.length
    : 0;
  const buffer = stdDev(target.played);
  const projectedFinish = target.total + average * roundsRemaining + buffer;
  return (projectedFinish - chaserTotal) / roundsRemaining;
}

/**
 * The per-round average a chasing player needs to catch the league leader —
 * or, when the subject is already leading, the buffer their nearest chaser
 * needs. Rounds remaining = unlocked rounds (locked rounds are banked into
 * each player's total). Suppressed (`no-rounds-left`) once every round is
 * locked.
 */
export function computePathToVictory(params: {
  rounds: { id: string; locked: boolean }[];
  score: ScoreLookup;
  /** playerId -> league rank (1 = first); from computeStandings. */
  ranks: Map<string, number>;
  /** The player the widget is anchored to. */
  subjectId: string;
}): PathToVictoryResult {
  const { rounds, score, ranks, subjectId } = params;
  const roundsRemaining = rounds.filter((r) => !r.locked).length;
  if (roundsRemaining === 0) return { status: "no-rounds-left" };

  const leaderId = [...ranks.entries()].find(([, r]) => r === 1)?.[0] ?? null;
  if (!leaderId) return { status: "no-rounds-left" };

  const statsFor = (id: string) => {
    const played = rounds
      .map((r) => score(id, r.id))
      .filter((v): v is number => typeof v === "number");
    const total = played.reduce((a, b) => a + b, 0);
    return { total, played };
  };

  if (subjectId === leaderId) {
    const chaserId = [...ranks.entries()].find(([, r]) => r === 2)?.[0] ?? null;
    if (!chaserId) return { status: "leading", requiredAverage: Infinity, chaserId: null };
    const requiredAverage = requiredAverageToCatch({
      target: statsFor(subjectId),
      chaserTotal: statsFor(chaserId).total,
      roundsRemaining,
    });
    return { status: "leading", requiredAverage, chaserId };
  }

  const requiredAverage = requiredAverageToCatch({
    target: statsFor(leaderId),
    chaserTotal: statsFor(subjectId).total,
    roundsRemaining,
  });
  return {
    status: "chasing",
    requiredAverage,
    leaderId,
    impossible: requiredAverage > SCORE_MAX,
  };
}
