import { describe, it, expect } from "vitest";
import { computePathToVictory, type ScoreLookup } from "./path-to-victory";

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

  it("computes the required average for a chasing player", () => {
    // Leader "a": 100 total, average 50/round over r1+r2 -> projects
    // 100 + 50*2 = 200 (no spread, single round each so buffer is 0).
    const score = lookup({ "a:r1": 50, "a:r2": 50, "b:r1": 40, "b:r2": 30 });
    const result = computePathToVictory({
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
    // (200 - 70) / 2 = 65
    expect(result.requiredAverage).toBeCloseTo(65);
    expect(result.impossible).toBe(false);
  });

  it("flags an impossible gap when the required average exceeds the max score", () => {
    const score = lookup({ "a:r1": 100, "a:r2": 100, "b:r1": 1, "b:r2": 1 });
    const result = computePathToVictory({
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
      rounds,
      score,
      ranks: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      subjectId: "a",
    });
    expect(result).toEqual({ status: "leading", requiredAverage: 65, chaserId: "b" });
  });

  it("returns an infinite buffer when the leader has no chaser (solo league)", () => {
    const result = computePathToVictory({
      rounds,
      score: lookup({ "a:r1": 50, "a:r2": 50 }),
      ranks: new Map([["a", 1]]),
      subjectId: "a",
    });
    expect(result).toEqual({ status: "leading", requiredAverage: Infinity, chaserId: null });
  });

  it("adds a one-round safety buffer from the target's own score spread", () => {
    // Leader "a" plays wildly inconsistent rounds (0 and 100): average 50,
    // but a nonzero spread should push the projection above the flat 200.
    const score = lookup({ "a:r1": 0, "a:r2": 100, "b:r1": 40, "b:r2": 30 });
    const result = computePathToVictory({
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
    // (100 + 50*2 + 50) / 2 - 70/2 = 125 - 35 = 90
    expect(result.requiredAverage).toBeCloseTo(90);
  });
});
