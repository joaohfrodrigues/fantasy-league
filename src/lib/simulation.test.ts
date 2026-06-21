import { describe, it, expect } from "vitest";
import { simulateWinProbability, type ScoreLookup } from "./simulation";

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
});
