import { describe, it, expect } from "vitest";
import { simulateWinProbability, playerAverage, type ScoreLookup } from "./simulation";

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

const players = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

function sum(m: Map<string, number>) {
  let s = 0;
  m.forEach((v) => (s += v));
  return s;
}

describe("simulateWinProbability (lock-aware)", () => {
  it("returns an empty map for no players", () => {
    const r = simulateWinProbability({
      players: [],
      rounds: [{ id: "r1", locked: true }],
      score: lookup({}),
    });
    expect(r.size).toBe(0);
  });

  it("is deterministic — same inputs, same output", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: false },
    ];
    const score = lookup({
      "p1:r1": 80,
      "p2:r1": 60,
      "p3:r1": 50,
      "p1:r2": 40,
      "p2:r2": 70,
      "p3:r2": 30,
    });
    const a = simulateWinProbability({ players, rounds, score });
    const b = simulateWinProbability({ players, rounds, score });
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("probabilities sum to ~1 while a round is open", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: false },
    ];
    const score = lookup({ "p1:r1": 80, "p2:r1": 60, "p3:r1": 50 });
    expect(sum(simulateWinProbability({ players, rounds, score }))).toBeCloseTo(1, 5);
  });

  it("is deterministic by total once every round is locked", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
      { id: "r3", locked: true },
    ];
    const score = lookup({
      "p1:r1": 50,
      "p1:r2": 50,
      "p1:r3": 50,
      "p2:r1": 10,
      "p2:r2": 10,
      "p2:r3": 10,
      "p3:r1": 10,
      "p3:r2": 10,
      "p3:r3": 10,
    });
    const probs = simulateWinProbability({ players, rounds, score });
    expect(probs.get("p1")).toBe(1);
    expect(probs.get("p2")).toBe(0);
  });

  it("splits probability on a finished (all-locked) tie for first", () => {
    const rounds = [{ id: "r1", locked: true }];
    const score = lookup({ "p1:r1": 50, "p2:r1": 50, "p3:r1": 10 });
    const probs = simulateWinProbability({ players, rounds, score });
    expect(probs.get("p1")).toBeCloseTo(0.5, 5);
    expect(probs.get("p2")).toBeCloseTo(0.5, 5);
    expect(probs.get("p3")).toBe(0);
  });

  it("a locked lead counts more than the same lead while unlocked", () => {
    const two = [{ id: "p1" }, { id: "p2" }];
    const score = lookup({ "p1:r1": 120, "p2:r1": 0 });
    const lockedLead = simulateWinProbability({
      players: two,
      rounds: [
        { id: "r1", locked: true },
        { id: "r2", locked: false },
      ],
      score,
    });
    const openLead = simulateWinProbability({
      players: two,
      rounds: [
        { id: "r1", locked: false },
        { id: "r2", locked: false },
      ],
      score,
    });
    expect(lockedLead.get("p1")!).toBeGreaterThan(openLead.get("p1")!);
    expect(lockedLead.get("p1")!).toBeGreaterThan(0.5);
  });

  it("keeps upside for a low provisional score (not eliminated while open)", () => {
    const two = [{ id: "p1" }, { id: "p2" }];
    const score = lookup({ "p1:r1": 60, "p2:r1": 10 });
    const probs = simulateWinProbability({
      players: two,
      rounds: [
        { id: "r1", locked: false },
        { id: "r2", locked: false },
      ],
      score,
    });
    expect(probs.get("p2")!).toBeGreaterThan(0);
  });

  it("a knockout-round benchmark (e.g. a Final) is tighter than an unbenchmarked round", () => {
    const two = [{ id: "p1" }, { id: "p2" }];
    // Locked round establishes a 60pt gap with high observed variance, so the
    // league-derived fallback std is wide (~30+) — a single open round under that
    // fallback gives the trailing player a real shot. A Final round's benchmark std
    // (9) is far tighter, so the same gap should be effectively uncatchable.
    const score = lookup({ "p1:r1": 120, "p2:r1": 60 });
    const genericRound = simulateWinProbability({
      players: two,
      rounds: [
        { id: "r1", locked: true },
        { id: "r2", locked: false },
      ],
      score,
    });
    const finalRound = simulateWinProbability({
      players: two,
      rounds: [
        { id: "r1", locked: true },
        { id: "r2", locked: false, short: "F" },
      ],
      score,
    });
    expect(finalRound.get("p2")!).toBeLessThan(genericRound.get("p2")!);
  });

  it("does not collapse a trailing player's odds after only a few rounds (shrinkage)", () => {
    // Mirrors the real-world shape that motivated PRIOR_K: a leader ~5%/round
    // ahead after 3 rounds, with 5 unplayed rounds still to come. The trailing
    // player should keep a meaningful (double-digit-ish) chance, not be near-zero.
    const players = [{ id: "leader" }, { id: "trailer" }];
    const locked = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
      { id: "r3", locked: true },
    ];
    const open = [
      { id: "r4", locked: false },
      { id: "r5", locked: false },
      { id: "r6", locked: false },
      { id: "r7", locked: false },
      { id: "r8", locked: false },
    ];
    const score = lookup({
      "leader:r1": 90,
      "leader:r2": 95,
      "leader:r3": 90,
      "trailer:r1": 80,
      "trailer:r2": 81,
      "trailer:r3": 82,
    });
    const probs = simulateWinProbability({
      players,
      rounds: [...locked, ...open],
      score,
    });
    expect(probs.get("trailer")!).toBeGreaterThan(0.1);
  });

  it("knockout benchmarks don't make a trailing player's odds worse than the unbenchmarked fallback", () => {
    // Regression guard: an earlier version tapered the benchmark std down with the
    // mean (e.g. F: std 9), which tightened future-round variance enough to undo
    // the PRIOR_K shrinkage fix above — the leader's odds went UP, not down, once
    // benchmarks were applied. Each of the 11 picks carries roughly the same
    // per-player score volatility regardless of round stage, so std should stay
    // roughly flat across benchmarked rounds; this asserts that property holds by
    // checking the trailing player is never worse off with benchmarks applied.
    const players = [{ id: "leader" }, { id: "trailer" }];
    const locked = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
      { id: "r3", locked: true },
    ];
    const score = lookup({
      "leader:r1": 90,
      "leader:r2": 95,
      "leader:r3": 90,
      "trailer:r1": 80,
      "trailer:r2": 81,
      "trailer:r3": 82,
    });
    const withoutBenchmarks = simulateWinProbability({
      players,
      rounds: [
        ...locked,
        { id: "r4", locked: false },
        { id: "r5", locked: false },
        { id: "r6", locked: false },
        { id: "r7", locked: false },
        { id: "r8", locked: false },
      ],
      score,
    });
    const withBenchmarks = simulateWinProbability({
      players,
      rounds: [
        ...locked,
        { id: "r32", locked: false, short: "R32" },
        { id: "r16", locked: false, short: "R16" },
        { id: "qf", locked: false, short: "QF" },
        { id: "sf", locked: false, short: "SF" },
        { id: "f", locked: false, short: "F" },
      ],
      score,
    });
    expect(withBenchmarks.get("trailer")!).toBeGreaterThanOrEqual(
      withoutBenchmarks.get("trailer")! - 0.01,
    );
  });
});

describe("playerAverage", () => {
  it("returns null for no scores", () => {
    expect(playerAverage([])).toBeNull();
  });

  it("returns the mean of played scores", () => {
    expect(playerAverage([80, 60, 40])).toBeCloseTo(60, 5);
  });
});

describe("simulateWinProbability (What-if slider mean)", () => {
  it("does not collapse odds to 0%/100% when a slider mean is set (variance preserved)", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: false },
      { id: "r3", locked: false },
      { id: "r4", locked: false },
    ];
    const score = lookup({
      "p1:r1": 70,
      "p2:r1": 65,
      "p3:r1": 60,
    });
    // Same slider mean for every player — if variance collapsed (e.g. the mean
    // were fed in as a flat per-round constant) this would converge to a tie
    // split with near-zero spread; it should instead keep a real distribution.
    const whatIfMean = new Map([
      ["p1", 70],
      ["p2", 70],
      ["p3", 70],
    ]);
    const probs = simulateWinProbability({ players, rounds, score, whatIfMean });
    probs.forEach((p) => {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    });
  });

  it("uses the player's own observed variance around the slider mean, not the league's", () => {
    const two = [{ id: "steady" }, { id: "volatile" }];
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
      { id: "r3", locked: true },
      { id: "r4", locked: false },
      { id: "r5", locked: false },
    ];
    const score = lookup({
      "steady:r1": 60,
      "steady:r2": 61,
      "steady:r3": 59,
      "volatile:r1": 90,
      "volatile:r2": 20,
      "volatile:r3": 55,
    });
    // Both players get the same slider mean going forward; the volatile player's
    // wider historical spread should give the trailing/leading dynamic more
    // uncertainty than if both used a shared (tight) variance.
    const sameMean = new Map([
      ["steady", 60],
      ["volatile", 60],
    ]);
    const probs = simulateWinProbability({ players: two, rounds, score, whatIfMean: sameMean });
    // Both banked totals are close (180 vs 165), so with meaningfully different
    // per-player variance neither should be a near-certain winner.
    expect(probs.get("steady")!).toBeLessThan(0.95);
    expect(probs.get("volatile")!).toBeLessThan(0.95);
  });

  it("falls back to league-wide variance for a slider mean when fewer than 2 rounds are played", () => {
    const two = [{ id: "rookie" }, { id: "veteran" }];
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: false },
      { id: "r3", locked: false },
    ];
    // rookie has only 1 played round (no own variance to derive); veteran has 3.
    const score = lookup({
      "rookie:r1": 60,
      "veteran:r1": 55,
      "veteran:r2": 58,
      "veteran:r3": 62,
    });
    const whatIfMean = new Map([
      ["rookie", 60],
      ["veteran", 60],
    ]);
    // Should not throw and should still produce a valid probability distribution
    // for the under-sampled player (the league fallback kicks in for them).
    const probs = simulateWinProbability({ players: two, rounds, score, whatIfMean });
    expect(probs.get("rookie")!).toBeGreaterThan(0);
    expect(probs.get("rookie")!).toBeLessThan(1);
  });
});
