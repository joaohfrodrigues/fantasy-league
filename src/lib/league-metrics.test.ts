import { describe, it, expect } from "vitest";
import { computeLiveMetrics } from "./league-metrics";
import type { ScoreLookup } from "./standings";

const player = (id: string) => ({ id, name: id });
const players = [player("p1"), player("p2")];

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

describe("computeLiveMetrics", () => {
  it("returns standings ranked by total with win probability applied", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
    ];
    const score = lookup({ "p1:r1": 90, "p1:r2": 80, "p2:r1": 10, "p2:r2": 20 });
    const { standings, winProbability } = computeLiveMetrics({
      players,
      rounds,
      score,
      tiebreak: "total",
    });
    expect(standings.find((r) => r.player.id === "p1")?.rank).toBe(1);
    expect(standings.find((r) => r.player.id === "p2")?.rank).toBe(2);
    // Every round locked -> deterministic finish, p1 banked the higher total.
    expect(winProbability.get("p1")).toBe(1);
    expect(winProbability.get("p2")).toBe(0);
  });

  it("applies the tiebreak rule to rank when totals are level", () => {
    const rounds = [
      { id: "r1", locked: true },
      { id: "r2", locked: true },
    ];
    // p1 wins both rounds it plays high in, p2 wins the latest round.
    const score = lookup({ "p1:r1": 90, "p1:r2": 40, "p2:r1": 10, "p2:r2": 120 });
    const { standings } = computeLiveMetrics({
      players,
      rounds,
      score,
      tiebreak: "latest",
    });
    // p2 scores higher in r2 (the latest round) -> "latest" tiebreak favours p2,
    // even though totals (p1: 130, p2: 130) are level.
    expect(standings.find((r) => r.player.id === "p2")?.rank).toBe(1);
  });
});
