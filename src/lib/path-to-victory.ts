// Path to Victory (see CONTEXT.md: Path to Victory). Deep module: standings-
// shaped inputs (rank, per-round scores, the full player list) in, one
// actionable per-round average out — hides the projection math behind a
// single question: "what does this player need to average to have a 90%
// chance of catching the leader?" Reuses simulation.ts's league-wide
// mean/std and shrinkage (see computeLeagueStats, projectPlayerSkill) so a
// bigger or more volatile field widens the answer, then runs its own small
// Monte Carlo over the target's remaining rounds — no new simulation
// engine, just simulation.ts's existing building blocks aimed at one player
// instead of a multi-player race (issue #21: "no new simulation
// infrastructure").
//
// Deliberately does NOT use simulation.ts's ROUND_BENCHMARKS (via
// roundDrawStats): those are Champions-League-knockout-calibrated absolute
// mean/std values, and this app targets any soccer fantasy league — for a
// league whose own scoring runs well above (or below) those fixed numbers,
// projecting every remaining round toward them understates the target's
// realistic finish and produces a required average that visibly doesn't
// square with current standings. Every remaining round instead draws from
// the league's own observed mean/std, which stays anchored to what this
// specific league has actually shown so far.

import {
  SCORE_MIN,
  SCORE_MAX,
  computeLeagueStats,
  projectPlayerSkill,
  createSeededRandom,
  type ScoreLookup,
} from "./simulation";
import { clamp } from "./utils";

export type { ScoreLookup };

// The confidence level the required average is solved for. Hardcoded per
// issue #37 — no UI control to change it in this iteration.
export const PATH_TO_VICTORY_CONFIDENCE = 0.9;

// Antithetic pairs for the target's finish projection; total samples = pairs * 2.
// Half of simulateWinProbability's default — this reads one percentile off a
// single player's distribution rather than racing an entire field, so it
// needs less precision per trial to be stable.
const PAIRS = 1500;

export type PathToVictoryResult =
  | { status: "no-rounds-left" }
  | { status: "leading"; requiredAverage: number; chaserId: string | null }
  | { status: "chasing"; requiredAverage: number; leaderId: string; impossible: boolean };

function deriveSeed(nums: number[]): number {
  let seed = (0x9e3779b9 ^ nums.length) >>> 0;
  for (const n of nums) {
    seed = (Math.imul(seed, 31) + Math.round(n * 1000)) >>> 0;
  }
  return seed;
}

/**
 * The target's total to date across every round with a recorded score
 * (locked or not — an in-progress unlocked round still counts toward the
 * total, same as the round itself still counting toward rounds remaining).
 */
function totalToDate(rounds: { id: string }[], score: ScoreLookup, playerId: string): number {
  return rounds.reduce((sum, r) => {
    const v = score(playerId, r.id);
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
}

/**
 * The target's projected finish at PATH_TO_VICTORY_CONFIDENCE: their banked
 * total plus a Monte Carlo draw of the rounds remaining, using the league's
 * own observed mean/std for every remaining round. Each trial draws one
 * shared "skill" offset for the whole remaining stretch (a hot or cold
 * patch persists across rounds) plus independent per-round noise, then the
 * samples are sorted and the requested percentile read off.
 */
function projectFinishAtConfidence(params: {
  banked: number;
  projMean: number;
  skillSD: number;
  roundStd: number;
  roundsRemaining: number;
  seed: number;
  confidence?: number;
  pairs?: number;
}): number {
  const {
    banked,
    projMean,
    skillSD,
    roundStd,
    roundsRemaining,
    seed,
    confidence = PATH_TO_VICTORY_CONFIDENCE,
    pairs = PAIRS,
  } = params;
  const { randn } = createSeededRandom(seed);
  const samples: number[] = [];
  for (let t = 0; t < pairs; t++) {
    const zSkill = randn();
    const roundNoise: number[] = [];
    for (let j = 0; j < roundsRemaining; j++) roundNoise.push(randn());
    for (const sign of [1, -1]) {
      let total = banked;
      const skillOffset = sign * zSkill * skillSD;
      for (let j = 0; j < roundsRemaining; j++) {
        const noise = sign * roundNoise[j];
        total += clamp(projMean + skillOffset + noise * roundStd, SCORE_MIN, SCORE_MAX);
      }
      samples.push(total);
    }
  }
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.ceil(confidence * samples.length) - 1);
  return samples[idx];
}

/**
 * The per-round average a chaser needs to have a `confidence` chance of
 * catching the target: the target's projected finish at that percentile
 * (accounting for their own shrunk skill projection and the league's field
 * size and round-to-round volatility) minus the chaser's current total,
 * spread over the rounds left.
 */
function requiredAverageToCatch(params: {
  targetId: string;
  chaserTotal: number;
  players: { id: string }[];
  rounds: { id: string; locked: boolean }[];
  score: ScoreLookup;
}): number {
  const { targetId, chaserTotal, players, rounds, score } = params;
  const roundsRemaining = rounds.filter((r) => !r.locked).length;
  const leagueStats = computeLeagueStats(players, rounds, score);
  const { projMean, skillSD } = projectPlayerSkill({
    playerId: targetId,
    rounds,
    score,
    leagueStats,
  });
  const banked = totalToDate(rounds, score, targetId);

  const seed = deriveSeed([
    banked,
    projMean,
    skillSD,
    leagueStats.std,
    roundsRemaining,
    chaserTotal,
  ]);
  const projectedFinish = projectFinishAtConfidence({
    banked,
    projMean,
    skillSD,
    roundStd: leagueStats.std,
    roundsRemaining,
    seed,
  });
  return (projectedFinish - chaserTotal) / roundsRemaining;
}

/**
 * The per-round average a chasing player needs to have a 90% chance of
 * catching the league leader — or, when the subject is already leading, the
 * same-confidence buffer their nearest chaser needs. Rounds remaining =
 * unlocked rounds (locked rounds are banked into each player's total).
 * Suppressed (`no-rounds-left`) once every round is locked.
 */
export function computePathToVictory(params: {
  players: { id: string }[];
  rounds: { id: string; locked: boolean }[];
  score: ScoreLookup;
  /** playerId -> league rank (1 = first); from computeStandings. */
  ranks: Map<string, number>;
  /** The player the widget is anchored to. */
  subjectId: string;
}): PathToVictoryResult {
  const { players, rounds, score, ranks, subjectId } = params;
  const roundsRemaining = rounds.filter((r) => !r.locked).length;
  if (roundsRemaining === 0) return { status: "no-rounds-left" };

  const leaderId = [...ranks.entries()].find(([, r]) => r === 1)?.[0] ?? null;
  if (!leaderId) return { status: "no-rounds-left" };

  const totalOf = (id: string) => totalToDate(rounds, score, id);

  if (subjectId === leaderId) {
    const chaserId = [...ranks.entries()].find(([, r]) => r === 2)?.[0] ?? null;
    if (!chaserId) return { status: "leading", requiredAverage: Infinity, chaserId: null };
    const requiredAverage = requiredAverageToCatch({
      targetId: subjectId,
      chaserTotal: totalOf(chaserId),
      players,
      rounds,
      score,
    });
    return { status: "leading", requiredAverage, chaserId };
  }

  const requiredAverage = requiredAverageToCatch({
    targetId: leaderId,
    chaserTotal: totalOf(subjectId),
    players,
    rounds,
    score,
  });
  return {
    status: "chasing",
    requiredAverage,
    leaderId,
    impossible: requiredAverage > SCORE_MAX,
  };
}
