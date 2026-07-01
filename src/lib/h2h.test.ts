import { describe, it, expect } from "vitest";
import { computeH2H, type ScoreLookup } from "./h2h";

const rounds = [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }];

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

describe("computeH2H", () => {
  it("counts wins, losses and draws from each player's perspective", () => {
    const score = lookup({
      "a:r1": 10,
      "b:r1": 5, // a wins
      "a:r2": 3,
      "b:r2": 8, // b wins
      "a:r3": 6,
      "b:r3": 6, // draw
    });
    const summary = computeH2H({ playerAId: "a", playerBId: "b", rounds, score });
    expect(summary.aWins).toBe(1);
    expect(summary.bWins).toBe(1);
    expect(summary.draws).toBe(1);
  });

  it("sums totals across counted rounds only", () => {
    const score = lookup({ "a:r1": 10, "b:r1": 5, "a:r2": 3, "b:r2": 8 });
    const summary = computeH2H({ playerAId: "a", playerBId: "b", rounds, score });
    expect(summary.aTotal).toBe(13);
    expect(summary.bTotal).toBe(13);
  });

  it("reports the per-round delta and winner, favouring player A when positive", () => {
    const score = lookup({ "a:r1": 10, "b:r1": 5 });
    const summary = computeH2H({
      playerAId: "a",
      playerBId: "b",
      rounds: [{ id: "r1" }],
      score,
    });
    expect(summary.rounds).toEqual([
      { roundId: "r1", aScore: 10, bScore: 5, delta: 5, winner: "a" },
    ]);
  });

  it("skips rounds where either player has no recorded score", () => {
    const score = lookup({ "a:r1": 10, "b:r1": 5, "a:r2": 7 /* b:r2 missing */ });
    const summary = computeH2H({ playerAId: "a", playerBId: "b", rounds, score });
    expect(summary.rounds).toHaveLength(1);
    expect(summary.rounds[0].roundId).toBe("r1");
  });

  it("returns an empty, zeroed summary when no rounds are comparable", () => {
    const summary = computeH2H({
      playerAId: "a",
      playerBId: "b",
      rounds,
      score: lookup({}),
    });
    expect(summary).toEqual({ aWins: 0, bWins: 0, draws: 0, aTotal: 0, bTotal: 0, rounds: [] });
  });
});
