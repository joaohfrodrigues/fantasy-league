import { describe, it, expect } from "vitest";
import { computePathToVictory, type ScoreLookup } from "./path-to-victory";

const players = [{ id: "a" }, { id: "b" }];

const rounds = [
  { id: "r1", locked: true },
  { id: "r2", locked: true },
  { id: "r3", locked: false },
  { id: "r4", locked: false },
];

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

describe("computePathToVictory", () => {
  it("suppresses the widget once every round is locked", () => {
    const allLocked = rounds.map((r) => ({ ...r, locked: true }));
    const result = computePathToVictory({
      players,
      rounds: allLocked,
      score: lookup({}),
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    });
    expect(result).toEqual({ status: "no-rounds-left" });
  });

  it("computes a required average for a chasing player", () => {
    const score = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 });
    const result = computePathToVictory({
      players,
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    });
    expect(result.status).toBe("chasing");
    if (result.status !== "chasing") throw new Error("expected chasing");
    expect(result.leaderId).toBe("a");
    expect(result.requiredAverage).toBeGreaterThan(0);
    expect(result.impossible).toBe(false);
  });

  it("is deterministic — same inputs, same output", () => {
    const score = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 });
    const params = {
      players,
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    };
    const first = computePathToVictory(params);
    const second = computePathToVictory(params);
    expect(first).toEqual(second);
  });

  it("flags an impossible gap when the required average exceeds the max score", () => {
    const score = lookup({ "a:r1": 100, "a:r2": 100, "b:r1": 1, "b:r2": 1 });
    const result = computePathToVictory({
      players,
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    });
    expect(result.status).toBe("chasing");
    if (result.status !== "chasing") throw new Error("expected chasing");
    expect(result.impossible).toBe(true);
  });

  it("reports the nearest chaser's required average as the leader's buffer", () => {
    const score = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 });
    const result = computePathToVictory({
      players,
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "a",
    });
    expect(result.status).toBe("leading");
    if (result.status !== "leading") throw new Error("expected leading");
    expect(result.chaserId).toBe("b");
    expect(result.requiredAverage).toBeGreaterThan(0);
  });

  it("returns an infinite buffer when the leader has no chaser (solo league)", () => {
    const result = computePathToVictory({
      players: [{ id: "a" }],
      rounds,
      score: lookup({ "a:r1": 50, "a:r2": 50 }),
      ranks: new Map([["a", 1]]),
      subjectId: "a",
    });
    expect(result).toEqual({ status: "leading", requiredAverage: Infinity, chaserId: null });
  });

  it("widens the required average for a more volatile league than a stable one with identical totals", () => {
    // Both leagues: leader "a" 100 total, chaser "b" 70 total, over the same
    // two locked rounds and two rounds remaining. The volatile league's
    // scores swing wildly round to round; the stable league's don't.
    const stableScore = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 35, "b:r2": 35 });
    const volatileScore = lookup({ "a:r1": 10, "a:r2": 90, "b:r1": 65, "b:r2": 5 });
    const ranks = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const stable = computePathToVictory({
      players,
      rounds,
      score: stableScore,
      ranks,
      subjectId: "b",
    });
    const volatile = computePathToVictory({
      players,
      rounds,
      score: volatileScore,
      ranks,
      subjectId: "b",
    });
    if (stable.status !== "chasing" || volatile.status !== "chasing") {
      throw new Error("expected chasing");
    }
    expect(volatile.requiredAverage).toBeGreaterThan(stable.requiredAverage);
  });

  it("widens the required average for a larger, noisier field than a small one with identical leader/chaser totals", () => {
    // Same leader ("a") and chaser ("b") totals in both cases; the bigger
    // field's extra players post much noisier scores, which should widen the
    // league-wide std used for the leader's remaining-round projection.
    const small = [{ id: "a" }, { id: "b" }];
    const large = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
    const ranks = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
      ["e", 5],
    ]);
    const baseScores: Record<string, number> = {
      "a:r1": 50,
      "a:r2": 50,
      "b:r1": 40,
      "b:r2": 30,
    };
    const smallResult = computePathToVictory({
      players: small,
      rounds,
      score: lookup(baseScores),
      ranks,
      subjectId: "b",
    });
    const largeResult = computePathToVictory({
      players: large,
      rounds,
      score: lookup({
        ...baseScores,
        "c:r1": 10,
        "c:r2": 130,
        "d:r1": 140,
        "d:r2": 5,
        "e:r1": 0,
        "e:r2": 145,
      }),
      ranks,
      subjectId: "b",
    });
    if (smallResult.status !== "chasing" || largeResult.status !== "chasing") {
      throw new Error("expected chasing");
    }
    expect(largeResult.requiredAverage).toBeGreaterThan(smallResult.requiredAverage);
  });

  it("locks in the exact required average for a fixed scenario (percentile-formula regression)", () => {
    // Guards the Monte Carlo/percentile math itself: a future refactor that
    // shifts the percentile index, the antithetic pairing, or the skill/round
    // scaling would move this number even though the directional tests above
    // would still pass.
    const score = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 });
    const result = computePathToVictory({
      players,
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    });
    expect(result.status).toBe("chasing");
    if (result.status !== "chasing") throw new Error("expected chasing");
    expect(result.requiredAverage).toBeCloseTo(79.45, 1);
  });

  it("stays anchored to the league's own observed scoring level for a high-scoring league, regardless of round naming", () => {
    // Regression guard: an earlier version pulled the remaining-round
    // projection toward simulation.ts's fixed Champions-League-knockout
    // benchmarks (e.g. a "Final" round's mean of 44) whenever a round's
    // `short` label matched one. For a league that actually scores far
    // above those fixed values (as this one does — group-stage rounds in
    // the 80-120 range), that produced a required average that didn't
    // square with the league's own standings. The target's projection must
    // track the league's own observed mean/std, not a fixed external prior,
    // no matter what a round is named.
    const highScoringPlayers = [{ id: "a" }, { id: "b" }];
    const locked = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
      { id: "r3", locked: true },
    ];
    const score = lookup({
      "a:r1": 90,
      "a:r2": 95,
      "a:r3": 90,
      "b:r1": 80,
      "b:r2": 81,
      "b:r3": 82,
    });
    const ranks = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const unnamedRound = computePathToVictory({
      players: highScoringPlayers,
      rounds: [...locked, { id: "r4", locked: false }],
      score,
      ranks,
      subjectId: "b",
    });
    const finalRound = computePathToVictory({
      players: highScoringPlayers,
      rounds: [...locked, { id: "r4", locked: false, short: "F" } as (typeof locked)[number]],
      score,
      ranks,
      subjectId: "b",
    });
    expect(finalRound).toEqual(unnamedRound);
  });

  it("produces a sensible, non-degenerate result for a 2-player (head-to-head) league", () => {
    const result = computePathToVictory({
      players: [{ id: "a" }, { id: "b" }],
      rounds,
      score: lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 }),
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "b",
    });
    expect(result.status).toBe("chasing");
    if (result.status !== "chasing") throw new Error("expected chasing");
    expect(Number.isFinite(result.requiredAverage)).toBe(true);
  });
});
