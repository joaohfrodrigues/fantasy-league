import { describe, it, expect } from "vitest";
import { computePositionEvolution } from "./position-evolution";
import type { ScoreLookup } from "./standings";

const P = (id: string) => ({ id });

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

describe("computePositionEvolution", () => {
  it("tracks cumulative rank per round, reusing Standings' tiebreak logic", () => {
    // r1: p1 leads. r2: p2 overtakes on cumulative total.
    const score = lookup({
      "p1:r1": 100,
      "p2:r1": 50,
      "p1:r2": 0,
      "p2:r2": 100,
    });
    const evo = computePositionEvolution({
      players: [P("p1"), P("p2")],
      rounds: [{ id: "r1" }, { id: "r2" }],
      score,
      tiebreak: "total",
    });
    expect(evo.get("p1")).toEqual([
      { roundId: "r1", rank: 1 },
      { roundId: "r2", rank: 2 },
    ]);
    expect(evo.get("p2")).toEqual([
      { roundId: "r1", rank: 2 },
      { roundId: "r2", rank: 1 },
    ]);
  });

  it("breaks a tie the same way Standings does (stable order, no duplicate ranks)", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 50, "p3:r1": 10 });
    const evo = computePositionEvolution({
      players: [P("p1"), P("p2"), P("p3")],
      rounds: [{ id: "r1" }],
      score,
      tiebreak: "total",
    });
    expect(evo.get("p1")?.[0].rank).toBe(1);
    expect(evo.get("p2")?.[0].rank).toBe(2);
    expect(evo.get("p3")?.[0].rank).toBe(3);
  });

  it("gives a player joining mid-tournament no point before their first score", () => {
    // Topê-style: everyone else has scored since r1; latecomer only from r2.
    const score = lookup({
      "p1:r1": 89,
      "p2:r1": 88,
      "p1:r2": 91,
      "p2:r2": 102,
      "late:r2": 77,
      "p1:r3": 83,
      "p2:r3": 85,
      "late:r3": 39,
    });
    const evo = computePositionEvolution({
      players: [P("p1"), P("p2"), P("late")],
      rounds: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
      score,
      tiebreak: "total",
    });
    expect(evo.get("late")?.map((pt) => pt.roundId)).toEqual(["r2", "r3"]);
    expect(evo.get("p1")?.map((pt) => pt.roundId)).toEqual(["r1", "r2", "r3"]);
    // Ranked among all 3 players once they've appeared (last of 3 at r2).
    expect(evo.get("late")?.[0]).toEqual({ roundId: "r2", rank: 3 });
  });

  it("excludes rounds nobody has played yet", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 40 });
    const evo = computePositionEvolution({
      players: [P("p1"), P("p2")],
      rounds: [{ id: "r1" }, { id: "r2" }],
      score,
      tiebreak: "total",
    });
    expect(evo.get("p1")?.map((pt) => pt.roundId)).toEqual(["r1"]);
    expect(evo.get("p2")?.map((pt) => pt.roundId)).toEqual(["r1"]);
  });

  it("returns an empty list for a player who has never scored", () => {
    const score = lookup({ "p1:r1": 50 });
    const evo = computePositionEvolution({
      players: [P("p1"), P("ghost")],
      rounds: [{ id: "r1" }],
      score,
      tiebreak: "total",
    });
    expect(evo.get("ghost")).toEqual([]);
  });

  it("only reflects the round set it's given — callers filter for Alternative Reality", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 40, "p1:r2": 10, "p2:r2": 60 });
    const withAllRounds = computePositionEvolution({
      players: [P("p1"), P("p2")],
      rounds: [{ id: "r1" }, { id: "r2" }],
      score,
      tiebreak: "total",
    });
    const withR1Excluded = computePositionEvolution({
      players: [P("p1"), P("p2")],
      rounds: [{ id: "r2" }],
      score,
      tiebreak: "total",
    });
    expect(withAllRounds.get("p1")?.map((pt) => pt.roundId)).toEqual(["r1", "r2"]);
    expect(withR1Excluded.get("p1")?.map((pt) => pt.roundId)).toEqual(["r2"]);
    // Rank at r2 differs once r1 no longer contributes to the cumulative total.
    expect(withAllRounds.get("p1")?.[1].rank).toBe(2); // 60 total vs p2's 100
    expect(withR1Excluded.get("p1")?.[0].rank).toBe(2); // 10 vs p2's 60, same order
  });
});
