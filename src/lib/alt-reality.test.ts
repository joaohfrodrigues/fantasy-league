import { describe, it, expect } from "vitest";
import { resolveAlternativeReality } from "./alt-reality";

describe("resolveAlternativeReality", () => {
  const rounds = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

  it("returns every round when nothing is excluded", () => {
    const { activeRounds, isExploring } = resolveAlternativeReality({
      rounds,
      excludedRoundIds: new Set(),
    });
    expect(activeRounds).toEqual(rounds);
    expect(isExploring).toBe(false);
  });

  it("filters out excluded rounds", () => {
    const { activeRounds, isExploring } = resolveAlternativeReality({
      rounds,
      excludedRoundIds: new Set(["r2"]),
    });
    expect(activeRounds.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(isExploring).toBe(true);
  });
});
