// Win-probability Simulation (see CONTEXT.md: Simulation, Trial, Win probability).
//
// Deep module: a small interface — players, rounds (with lock state), and a score
// lookup in; a probability per player out — hiding the priors, shrinkage, and
// lock-aware Monte Carlo. Deterministic for a given input.
//
// Lock awareness: locked rounds are FINAL and banked as a certain contribution.
// Unlocked rounds are not final and are re-simulated each trial, so locked points
// "count more" than provisional ones. An unlocked round that already has a score is
// treated as a floor that can still rise — the upside is larger when the score is
// low (few of the player's XI have played) and ~0 when it is already high (most have
// played). The skill estimate still uses all played scores, so a provisional result
// informs the projection without being banked.

// Valid score range for a round. Future-round draws are clamped to it; the score
// inputs in the UI use the same bounds. Single source of truth for both.
export const SCORE_MIN = -10;
export const SCORE_MAX = 150;

// How wildly an in-progress round can still swing, as a multiple of its expected
// remaining points (the "gap"). ~1.0 means a half-played round can move by roughly
// its own remaining total before it locks.
const ROUND_SPREAD = 1;

// Knockout rounds have fewer matches, so fewer players score — but everyone still
// fields 11 players plus a captain, so scores don't collapse to zero. Std is NOT
// tapered down with the mean: each of the 11 picks carries roughly the same
// per-player score volatility (blank vs. a big haul) regardless of round stage —
// only the mean shrinks, since later rounds have fewer matches contributing
// scoring chances across the player pool. A tapered std would make a knockout
// round look artificially more predictable than it is, letting an already-tight
// table lock in early — keeping std roughly flat preserves the unpredictability.
// Benchmarks derived from observed Champions League knockout-stage fantasy
// scores. Matched against a round's `short` label (e.g. "R32", "F"); unmatched
// rounds (group stage) fall back to the league's own observed mean/std.
const ROUND_BENCHMARKS: Record<string, { mean: number; std: number }> = {
  R32: { mean: 75, std: 24 },
  R16: { mean: 62, std: 22 },
  QF: { mean: 53, std: 20 },
  SF: { mean: 48, std: 20 },
  F: { mean: 44, std: 20 },
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Small deterministic PRNG (mulberry32) so the simulation is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ScoreLookup = (playerId: string, roundId: string) => number | undefined;

/** Trims a DB round row to the shape simulateWinProbability needs. */
export function toSimRound(r: { id: string; locked_at: string | null; short: string }): {
  id: string;
  locked: boolean;
  short: string;
} {
  return { id: r.id, locked: r.locked_at !== null, short: r.short };
}

/**
 * Probability each player ends the league in first place. Locked rounds are banked;
 * unlocked rounds (provisional or unplayed) are simulated. Returns a map of
 * playerId -> probability in [0, 1]; values sum to ~1. Deterministic.
 */
export function simulateWinProbability(params: {
  players: { id: string }[];
  rounds: { id: string; locked?: boolean; short?: string }[];
  score: ScoreLookup;
  /** Antithetic pairs; total trials = pairs * 2. Defaults to 3000 (6000 trials). */
  pairs?: number;
}): Map<string, number> {
  const { players, rounds, score } = params;
  const PAIRS = params.pairs ?? 3000;

  const counts = new Map<string, number>();
  players.forEach((p) => counts.set(p.id, 0));
  if (!players.length) return counts;

  const lockedRounds = rounds.filter((r) => r.locked);
  const openRounds = rounds.filter((r) => !r.locked); // unlocked: provisional or unplayed

  // Skill estimate uses ALL played scores (locked + unlocked) — an unlocked result
  // still informs a player's level, it just isn't banked as certain.
  const playedIds = rounds
    .filter((r) => players.some((p) => typeof score(p.id, r.id) === "number"))
    .map((r) => r.id);

  const all: number[] = [];
  playedIds.forEach((rid) => {
    players.forEach((p) => {
      const v = score(p.id, rid);
      if (typeof v === "number") all.push(v);
    });
  });
  const leagueStats = (() => {
    if (!all.length) return { mean: 70, std: 35 };
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length;
    return { mean, std: Math.max(20, Math.sqrt(variance)) };
  })();

  // Higher K keeps projections closer to the league mean for longer — with only a
  // handful of rounds played, an early hot streak shouldn't read as a confirmed
  // skill gap.
  const PRIOR_K = 8;
  const stats = players.map((p) => {
    let banked = 0;
    lockedRounds.forEach((r) => {
      const v = score(p.id, r.id);
      if (typeof v === "number") banked += v;
    });
    const vals = playedIds
      .map((rid) => score(p.id, rid))
      .filter((v): v is number => typeof v === "number");
    const n = vals.length;
    const rawMean = n ? vals.reduce((a, b) => a + b, 0) / n : leagueStats.mean;
    const projMean = (rawMean * n + leagueStats.mean * PRIOR_K) / (n + PRIOR_K);
    const skillSD = leagueStats.std / Math.sqrt(n + PRIOR_K);
    // Provisional score for each open round, or null when unplayed.
    const provisional = openRounds.map((r) => {
      const v = score(p.id, r.id);
      return typeof v === "number" ? v : null;
    });
    return { id: p.id, banked, projMean, skillSD, provisional };
  });

  // Deterministic finish: every round is locked, so totals are final.
  if (openRounds.length === 0) {
    const max = Math.max(...stats.map((c) => c.banked));
    const winners = stats.filter((c) => c.banked === max);
    winners.forEach((w) => counts.set(w.id, 1 / winners.length));
    return counts;
  }

  // Deterministic seed from the current data so probabilities don't flicker between
  // renders (same inputs -> same output).
  let seed = (0x9e3779b9 ^ openRounds.length) >>> 0;
  for (const c of stats) {
    seed = (Math.imul(seed, 31) + Math.round(c.banked) + Math.round(c.projMean * 1000)) >>> 0;
  }
  const rand = mulberry32(seed);
  const randn = () => {
    const u = rand() || 1e-9;
    const v = rand() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Per-round expected mean/std: the benchmark for the round's type (matched by
  // `short`, e.g. "F"), or the league's own observed stats when unmatched (group
  // stage rounds, which have real data to learn from instead).
  const openRoundStats = openRounds.map(
    (r) => (r.short && ROUND_BENCHMARKS[r.short.toUpperCase()]) || leagueStats,
  );

  // A floor on the league mean used as the skill-ratio denominator — distinct
  // from leagueStats.mean itself, which can legitimately be small. Without this,
  // a near-zero league mean would blow skillRatio up to an extreme multiplier.
  const ratioBase = Math.max(leagueStats.mean, 10);

  // Precompute per-(player, round) values that don't depend on the trial's random
  // draws, so the hot Monte Carlo loop (up to PAIRS*2 iterations) only does the
  // trial-specific work.
  const perPlayerRoundMean = stats.map((c) => {
    const skillRatio = c.projMean / ratioBase;
    return openRoundStats.map(({ mean: roundMean }) => roundMean * skillRatio);
  });
  const perPlayerRoundSkillSD = stats.map((c) =>
    openRoundStats.map(({ mean: roundMean }) => c.skillSD * (roundMean / ratioBase)),
  );

  // Antithetic variates: each pair of trials reuses the negated normals.
  const perTrial = stats.length * (1 + openRounds.length);
  const z = new Float64Array(perTrial);

  const runTrial = (sign: number) => {
    let bestId = stats[0].id;
    let bestTotal = -Infinity;
    let k = 0;
    for (let i = 0; i < stats.length; i++) {
      const c = stats[i];
      const zSkill = sign * z[k++];
      let sim = c.banked;
      for (let j = 0; j < openRounds.length; j++) {
        const { std: roundStd } = openRoundStats[j];
        const target = perPlayerRoundMean[i][j] + zSkill * perPlayerRoundSkillSD[i][j];
        const prov = c.provisional[j];
        const noise = sign * z[k++];
        if (prov === null) {
          // Unplayed round: a full round drawn from the player's skill level.
          sim += clamp(target + noise * roundStd, SCORE_MIN, SCORE_MAX);
        } else {
          // Provisional round: a floor that can still rise. Upside ~ gap (bigger when
          // the score is low and more of the XI is still to play), zero once it is
          // already at/above the expected full-round level.
          const gap = Math.max(0, target - prov);
          const upside = Math.max(0, gap + noise * gap * ROUND_SPREAD);
          sim += clamp(prov + upside, SCORE_MIN, SCORE_MAX);
        }
      }
      if (sim > bestTotal) {
        bestTotal = sim;
        bestId = c.id;
      }
    }
    counts.set(bestId, (counts.get(bestId) ?? 0) + 1);
  };

  for (let t = 0; t < PAIRS; t++) {
    for (let i = 0; i < perTrial; i++) z[i] = randn();
    runTrial(1);
    runTrial(-1);
  }

  const samples = PAIRS * 2;
  const out = new Map<string, number>();
  counts.forEach((v, k2) => out.set(k2, v / samples));
  return out;
}
