import { describe, it, expect } from "vitest";
import { compareRank, computeRoundMaxes, computeStandings, type ScoreLookup } from "./standings";

const player = (id: string) => ({ id, name: id });
const rounds = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

// p2 and p1 finish level on total (130 each), but:
//   - p1 wins 2 rounds (r1, r2), p2 wins 1 (r3)  -> "wins" favours p1
//   - p2 scores higher in the latest round (r3)   -> "latest" favours p2
// Players are passed [p2, p1] so a plain total tie ranks p2 first (stable order),
// which lets each tiebreak mode demonstrably change the outcome.
const tiedScores = lookup({
  "p1:r1": 90,
  "p1:r2": 40,
  "p1:r3": 0,
  "p2:r1": 10,
  "p2:r2": 20,
  "p2:r3": 100,
});
const tiedPlayers = [player("p2"), player("p1")];
const noProb = new Map<string, number>();

function ranks(tiebreak: "total" | "wins" | "latest") {
  const rows = computeStandings({
    players: tiedPlayers,
    rounds,
    score: tiedScores,
    winProbability: noProb,
    tiebreak,
  });
  return Object.fromEntries(rows.map((r) => [r.player.id, r.rank]));
}

describe("computeStandings — tiebreak applied to rank", () => {
  it("ranks tied totals by input order under 'total'", () => {
    expect(ranks("total")).toEqual({ p2: 1, p1: 2 });
  });

  it("'wins' lifts the player with more round wins above a total tie", () => {
    expect(ranks("wins")).toEqual({ p1: 1, p2: 2 });
  });

  it("'latest' lifts the player with the better latest round above a total tie", () => {
    expect(ranks("latest")).toEqual({ p2: 1, p1: 2 });
  });

  it("ranks by total first regardless of mode when totals differ", () => {
    const score = lookup({ "p1:r1": 10, "p2:r1": 90 });
    for (const mode of ["total", "wins", "latest"] as const) {
      const rows = computeStandings({
        players: [player("p1"), player("p2")],
        rounds,
        score,
        winProbability: noProb,
        tiebreak: mode,
      });
      expect(rows.find((r) => r.player.id === "p2")!.rank).toBe(1);
    }
  });
});

describe("computeStandings — row metrics", () => {
  const rows = computeStandings({
    players: tiedPlayers,
    rounds,
    score: tiedScores,
    winProbability: new Map([["p1", 0.7]]),
    tiebreak: "total",
  });
  const p1 = rows.find((r) => r.player.id === "p1")!;
  const p2 = rows.find((r) => r.player.id === "p2")!;

  it("sums totals", () => {
    expect(p1.agg).toBe(130);
    expect(p2.agg).toBe(130);
  });

  it("counts round wins", () => {
    expect(p1.wins).toBe(2);
    expect(p2.wins).toBe(1);
  });

  it("reads the latest played round for the latest metric", () => {
    expect(p1.latest).toBe(0);
    expect(p2.latest).toBe(100);
  });

  it("copies win probability through, defaulting to 0", () => {
    expect(p1.prob).toBe(0.7);
    expect(p2.prob).toBe(0);
  });

  it("falls back to the last scored round when later rounds are empty", () => {
    const score = lookup({ "p1:r1": 5, "p1:r2": 9, "p2:r1": 8, "p2:r2": 3 });
    const r = computeStandings({
      players: [player("p1"), player("p2")],
      rounds, // r3 has no scores
      score,
      winProbability: noProb,
      tiebreak: "latest",
    });
    // latest played round is r2: p1=9 beats p2=3 on the tiebreak metric.
    expect(r.find((x) => x.player.id === "p1")!.latest).toBe(9);
  });
});

describe("computeRoundMaxes", () => {
  it("returns the top score per round and omits unplayed rounds", () => {
    const maxes = computeRoundMaxes(tiedPlayers, rounds, tiedScores);
    expect(maxes.get("r1")).toBe(90);
    expect(maxes.get("r2")).toBe(40);
    expect(maxes.get("r3")).toBe(100);
    const empty = computeRoundMaxes(tiedPlayers, [{ id: "rX" }], tiedScores);
    expect(empty.has("rX")).toBe(false);
  });
});

describe("compareRank", () => {
  it("orders by total first", () => {
    expect(
      compareRank({ agg: 10, wins: 0, latest: 0 }, { agg: 5, wins: 9, latest: 9 }, "wins"),
    ).toBeLessThan(0);
  });
  it("uses the mode metric only on a total tie", () => {
    expect(
      compareRank({ agg: 5, wins: 3, latest: 0 }, { agg: 5, wins: 1, latest: 9 }, "wins"),
    ).toBeLessThan(0);
    expect(
      compareRank({ agg: 5, wins: 3, latest: 0 }, { agg: 5, wins: 1, latest: 9 }, "total"),
    ).toBe(0);
  });
});
