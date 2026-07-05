import { describe, it, expect } from "vitest";
import { resolveWhatIf, resolveAlternativeReality } from "./what-if";

describe("resolveWhatIf", () => {
  it("returns the saved score map unchanged when there are no overrides", () => {
    const scoreMap = new Map([["p1:r1", 50]]);
    const { effectiveScoreMap } = resolveWhatIf({ scoreMap, cellOverrides: new Map() });
    expect(effectiveScoreMap).toBe(scoreMap);
  });

  it("layers cell overrides on top of the saved scores without mutating the input", () => {
    const scoreMap = new Map([
      ["p1:r1", 50],
      ["p2:r1", 30],
    ]);
    const { effectiveScoreMap } = resolveWhatIf({
      scoreMap,
      cellOverrides: new Map([["p1:r2", 80]]),
    });
    expect(effectiveScoreMap.get("p1:r1")).toBe(50);
    expect(effectiveScoreMap.get("p1:r2")).toBe(80);
    expect(scoreMap.has("p1:r2")).toBe(false);
  });

  it("lets a cell override replace an existing saved score", () => {
    const scoreMap = new Map([["p1:r1", 50]]);
    const { effectiveScoreMap } = resolveWhatIf({
      scoreMap,
      cellOverrides: new Map([["p1:r1", 999]]),
    });
    expect(effectiveScoreMap.get("p1:r1")).toBe(999);
  });

  it("reports isExploring true only when there are overrides", () => {
    const scoreMap = new Map([["p1:r1", 50]]);
    expect(resolveWhatIf({ scoreMap, cellOverrides: new Map() }).isExploring).toBe(false);
    expect(resolveWhatIf({ scoreMap, cellOverrides: new Map([["p1:r2", 10]]) }).isExploring).toBe(
      true,
    );
  });
});

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
