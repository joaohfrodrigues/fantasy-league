// Win-probability Simulation (see CONTEXT.md: Simulation, Trial, Win probability).
//
// Deep module: a small interface — players, rounds, and a score lookup in; a
// probability per player out — hiding the priors, shrinkage, antithetic-variate
// Monte Carlo, and seeded PRNG. The result is deterministic for a given input so
// it can be golden-tested and so probabilities don't flicker between renders.

// Valid score range for a round. Future-round draws are clamped to it; the score
// inputs in the UI use the same bounds. Single source of truth for both.
export const SCORE_MIN = -10;
export const SCORE_MAX = 150;

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

/**
 * Probability each player ends the league in first place, given the scores
 * recorded so far and the rounds still to play. Returns a map of playerId ->
 * probability in [0, 1]; values sum to ~1 across players.
 *
 * Deterministic: same inputs always produce the same output.
 */
export function simulateWinProbability(params: {
  players: { id: string }[];
  rounds: { id: string }[];
  score: ScoreLookup;
  /** Antithetic pairs; total trials = pairs * 2. Defaults to 3000 (6000 trials). */
  pairs?: number;
}): Map<string, number> {
  const { players, rounds, score } = params;
  const PAIRS = params.pairs ?? 3000;

  const counts = new Map<string, number>();
  players.forEach((p) => counts.set(p.id, 0));
  if (!players.length) return counts;

  const roundsPlayedIds = rounds
    .filter((r) => players.some((p) => typeof score(p.id, r.id) === "number"))
    .map((r) => r.id);
  const roundsRemaining = rounds.length - roundsPlayedIds.length;

  // League-wide mean/std across all played scores (with sane defaults early on).
  const all: number[] = [];
  roundsPlayedIds.forEach((rid) => {
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

  const playerMean = new Map<string, number>();
  players.forEach((p) => {
    const vals = roundsPlayedIds
      .map((rid) => score(p.id, rid))
      .filter((v): v is number => typeof v === "number");
    playerMean.set(
      p.id,
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : leagueStats.mean,
    );
  });

  const PRIOR_K = 3;
  const currentTotals = players.map((p) => {
    let t = 0;
    let n = 0;
    rounds.forEach((r) => {
      const v = score(p.id, r.id);
      if (typeof v === "number") {
        t += v;
        n += 1;
      }
    });
    const rawMean = playerMean.get(p.id) ?? leagueStats.mean;
    const projMean = (rawMean * n + leagueStats.mean * PRIOR_K) / (n + PRIOR_K);
    const skillSD = leagueStats.std / Math.sqrt(n + PRIOR_K);
    return { id: p.id, total: t, projMean, skillSD };
  });

  if (roundsRemaining === 0) {
    const max = Math.max(...currentTotals.map((c) => c.total));
    const winners = currentTotals.filter((c) => c.total === max);
    winners.forEach((w) => counts.set(w.id, 1 / winners.length));
    return counts;
  }

  // Deterministic seed from the current data so probabilities don't flicker
  // between renders (same inputs -> same output).
  let seed = (0x9e3779b9 ^ roundsRemaining) >>> 0;
  for (const c of currentTotals) {
    seed = (Math.imul(seed, 31) + Math.round(c.total) + Math.round(c.projMean * 1000)) >>> 0;
  }
  const rand = mulberry32(seed);
  const randn = () => {
    const u = rand() || 1e-9;
    const v = rand() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Antithetic variates: each pair of trials reuses the negated normals to
  // cancel sampling swings, cutting variance for roughly the same work.
  const perTrial = currentTotals.length * (1 + roundsRemaining);
  const z = new Float64Array(perTrial);

  const runTrial = (sign: number) => {
    let bestId = currentTotals[0].id;
    let bestTotal = -Infinity;
    let k = 0;
    for (const c of currentTotals) {
      const level = c.projMean + sign * z[k++] * c.skillSD;
      let sim = c.total;
      for (let r = 0; r < roundsRemaining; r++) {
        sim += clamp(level + sign * z[k++] * leagueStats.std, SCORE_MIN, SCORE_MAX);
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
  counts.forEach((v, k) => out.set(k, v / samples));
  return out;
}
