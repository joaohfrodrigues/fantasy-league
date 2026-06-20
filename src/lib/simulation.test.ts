import { describe, it, expect } from "vitest";
import { simulateWinProbability, type ScoreLookup } from "./simulation";

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

const players = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
const rounds = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

function sum(m: Map<string, number>) {
  let s = 0;
  m.forEach((v) => (s += v));
  return s;
}

describe("simulateWinProbability", () => {
  it("returns an empty map for no players", () => {
    expect(simulateWinProbability({ players: [], rounds, score: lookup({}) }).size).toBe(0);
  });

  it("is deterministic — same inputs, same output", () => {
    const score = lookup({ "p1:r1": 80, "p2:r1": 60, "p3:r1": 50 });
    const a = simulateWinProbability({ players, rounds, score });
    const b = simulateWinProbability({ players, rounds, score });
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("probabilities sum to ~1 with rounds remaining", () => {
    const score = lookup({ "p1:r1": 80, "p2:r1": 60, "p3:r1": 50 });
    const probs = simulateWinProbability({ players, rounds, score });
    expect(sum(probs)).toBeCloseTo(1, 5);
  });

  it("gives the outright leader probability 1 when no rounds remain", () => {
    // Every round played -> deterministic by total, no simulation.
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

  it("splits probability on a finished tie for first", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 50, "p3:r1": 10 });
    const probs = simulateWinProbability({
      players,
      rounds: [{ id: "r1" }],
      score,
    });
    expect(probs.get("p1")).toBeCloseTo(0.5, 5);
    expect(probs.get("p2")).toBeCloseTo(0.5, 5);
    expect(probs.get("p3")).toBe(0);
  });

  it("favours the player with a large lead and one round left", () => {
    const score = lookup({
      "p1:r1": 140,
      "p1:r2": 140,
      "p2:r1": 10,
      "p2:r2": 10,
      "p3:r1": 10,
      "p3:r2": 10,
    });
    // r3 still to play.
    const probs = simulateWinProbability({ players, rounds, score });
    expect(probs.get("p1")!).toBeGreaterThan(0.9);
    expect(probs.get("p1")!).toBeGreaterThan(probs.get("p2")!);
  });
});
