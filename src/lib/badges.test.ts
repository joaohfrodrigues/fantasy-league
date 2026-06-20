import { describe, it, expect } from "vitest";
import { assignBadges } from "./badges";
import type { ScoreLookup } from "./standings";

const P = (id: string) => ({ id });
const rounds = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

function lookup(scores: Record<string, number>): ScoreLookup {
  return (pid, rid) => scores[`${pid}:${rid}`];
}

function badges(players: { id: string }[], score: ScoreLookup) {
  return assignBadges({ players, rounds, score, tiebreak: "total" });
}

describe("assignBadges", () => {
  it("awards nothing until 2 rounds are played", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 10 });
    const b = badges([P("p1"), P("p2")], score);
    expect(b.get("p1")).toEqual([]);
    expect(b.get("p2")).toEqual([]);
  });

  it("🔥 On Fire for a player who wins 2+ rounds in a row", () => {
    const score = lookup({
      "p1:r1": 50,
      "p2:r1": 40,
      "p3:r1": 10,
      "p1:r2": 50,
      "p2:r2": 40,
      "p3:r2": 10,
    });
    const b = badges([P("p1"), P("p2"), P("p3")], score);
    expect(b.get("p1")).toContain("onFire");
    expect(b.get("p2")).not.toContain("onFire");
  });

  it("no On Fire when the latest round breaks the streak", () => {
    // p1 wins r1, p2 wins r2 (latest) -> neither has a 2-round streak.
    const score = lookup({ "p1:r1": 50, "p2:r1": 40, "p1:r2": 30, "p2:r2": 60 });
    const b = badges([P("p1"), P("p2")], score);
    expect(b.get("p1")).not.toContain("onFire");
    expect(b.get("p2")).not.toContain("onFire");
  });

  it("co-winners on a tie both keep the streak", () => {
    const score = lookup({
      "p1:r1": 50,
      "p2:r1": 50,
      "p3:r1": 10,
      "p1:r2": 50,
      "p2:r2": 50,
      "p3:r2": 10,
    });
    const b = badges([P("p1"), P("p2"), P("p3")], score);
    expect(b.get("p1")).toContain("onFire");
    expect(b.get("p2")).toContain("onFire");
    expect(b.get("p3")).not.toContain("onFire");
  });

  it("📈 On the Rise and 📉 The Bottler on a rank swap from the latest round", () => {
    // After r1: p1 leads. After r2: p2 overtakes.
    const score = lookup({ "p1:r1": 100, "p2:r1": 50, "p1:r2": 0, "p2:r2": 100 });
    const b = badges([P("p1"), P("p2")], score);
    expect(b.get("p2")).toContain("onRise");
    expect(b.get("p1")).toContain("bottler");
  });

  it("suppresses rise/bottler when nobody changes rank", () => {
    const score = lookup({ "p1:r1": 50, "p2:r1": 10, "p1:r2": 50, "p2:r2": 10 });
    const b = badges([P("p1"), P("p2")], score);
    expect(b.get("p1")).not.toContain("onRise");
    expect(b.get("p2")).not.toContain("bottler");
  });

  it("👻 The Ghost for a player on zero after the grace period", () => {
    const score = lookup({
      "p1:r1": 50,
      "p2:r1": 40,
      "p1:r2": 50,
      "p2:r2": 40,
    });
    // p3 never scored across 2 played rounds.
    const b = badges([P("p1"), P("p2"), P("p3")], score);
    expect(b.get("p3")).toContain("ghost");
    expect(b.get("p1")).not.toContain("ghost");
  });
});
