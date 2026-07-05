// Path to Victory (see CONTEXT.md: Path to Victory). Deep module: standings-
// shaped inputs (rank, per-round scores, the full player list) in, one
// actionable per-round average out — hides the projection math behind a
// single question: "what does this player need to average to have a 90%
// chance of catching the leader?" Reuses simulation.ts's league-wide
// mean/std, shrinkage, and per-round (knockout-benchmark-aware) draw stats
// — see computeLeagueStats, projectPlayerSkill, roundDrawStats — so a
// bigger or more volatile field, and a tighter Final-round variance, widen
// or narrow the answer the same way they do Win probability. It then runs
// its own small Monte Carlo over just the target's remaining rounds — no
// new simulation engine, just simulation.ts's existing building blocks
// aimed at one player instead of a multi-player race (issue #21: "no new
// simulation infrastructure").

import {
  SCORE_MIN,
  SCORE_MAX,
  computeLeagueStats,
  projectPlayerSkill,
  roundDrawStats,
  skillRatioBase,
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
 * total plus a Monte Carlo draw of the rounds remaining. Each open round
 * gets its own expected mean/std (`perRoundMean`/`perRoundStd`, from
 * roundDrawStats — a knockout benchmark or the league's own stats) scaled by
 * the target's skill ratio, mirroring simulateWinProbability's per-round
 * draw exactly. Each trial draws one shared "skill" offset for the whole
 * remaining stretch (a hot or cold patch persists across rounds) plus
 * independent per-round noise, then the samples are sorted and the
 * requested percentile read off.
 */
function projectFinishAtConfidence(params: {
  banked: number;
  perRoundMean: number[];
  perRoundSkillSD: number[];
  perRoundStd: number[];
  seed: number;
  confidence?: number;
  pairs?: number;
}): number {
  const {
    banked,
    perRoundMean,
    perRoundSkillSD,
    perRoundStd,
    seed,
    confidence = PATH_TO_VICTORY_CONFIDENCE,
    pairs = PAIRS,
  } = params;
  const roundsRemaining = perRoundMean.length;
  const { randn } = createSeededRandom(seed);
  const samples: number[] = [];
  for (let t = 0; t < pairs; t++) {
    const zSkill = randn();
    const roundNoise: number[] = [];
    for (let j = 0; j < roundsRemaining; j++) roundNoise.push(randn());
    for (const sign of [1, -1]) {
      let total = banked;
      for (let j = 0; j < roundsRemaining; j++) {
        const target = perRoundMean[j] + sign * zSkill * perRoundSkillSD[j];
        const noise = sign * roundNoise[j];
        total += clamp(target + noise * perRoundStd[j], SCORE_MIN, SCORE_MAX);
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
 * (accounting for their own shrunk skill projection, the league's field
 * size, and each remaining round's own expected variance) minus the
 * chaser's current total, spread over the rounds left.
 */
function requiredAverageToCatch(params: {
  targetId: string;
  chaserTotal: number;
  players: { id: string }[];
  rounds: { id: string; locked: boolean; short?: string }[];
  score: ScoreLookup;
}): number {
  const { targetId, chaserTotal, players, rounds, score } = params;
  const openRounds = rounds.filter((r) => !r.locked);
  const roundsRemaining = openRounds.length;
  const leagueStats = computeLeagueStats(players, rounds, score);
  const { projMean, skillSD } = projectPlayerSkill({
    playerId: targetId,
    rounds,
    score,
    leagueStats,
  });
  const banked = totalToDate(rounds, score, targetId);

  const ratioBase = skillRatioBase(leagueStats);
  const skillRatio = projMean / ratioBase;
  const openRoundStats = openRounds.map((r) => roundDrawStats(r, leagueStats));
  const perRoundMean = openRoundStats.map(({ mean }) => mean * skillRatio);
  const perRoundSkillSD = openRoundStats.map(({ mean }) => skillSD * (mean / ratioBase));
  const perRoundStd = openRoundStats.map(({ std }) => std);

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
    perRoundMean,
    perRoundSkillSD,
    perRoundStd,
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
  rounds: { id: string; locked: boolean; short?: string }[];
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
