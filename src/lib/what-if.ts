// What-if and Alternative Reality (see CONTEXT.md). Two small, separate
// functions rather than one shared "exploration" concept — they don't share
// logic: What-if layers hypothetical scores onto future rounds; Alternative
// Reality filters which past rounds are visible. Debouncing user input before
// it reaches these functions is a UI concern and stays in the route.

/**
 * Layer per-cell hypothetical overrides onto the saved score map. Never
 * mutates `scoreMap`; returns it unchanged (same reference) when there are no
 * overrides, so callers can cheaply detect "nothing changed".
 */
export function resolveWhatIf(params: {
  scoreMap: Map<string, number>;
  cellOverrides: Map<string, number>;
}): { effectiveScoreMap: Map<string, number>; isExploring: boolean } {
  const { scoreMap, cellOverrides } = params;
  if (cellOverrides.size === 0) return { effectiveScoreMap: scoreMap, isExploring: false };
  const effectiveScoreMap = new Map(scoreMap);
  cellOverrides.forEach((v, k) => effectiveScoreMap.set(k, v));
  return { effectiveScoreMap, isExploring: true };
}

/**
 * Exclude chosen played rounds from the round set used by live metrics
 * (Standings, Win probability). Badges and Round prize tallies never call
 * this — they're the record, immune to this hypothetical.
 */
export function resolveAlternativeReality<R extends { id: string }>(params: {
  rounds: R[];
  excludedRoundIds: Set<string>;
}): { activeRounds: R[]; isExploring: boolean } {
  const { rounds, excludedRoundIds } = params;
  if (excludedRoundIds.size === 0) return { activeRounds: rounds, isExploring: false };
  return {
    activeRounds: rounds.filter((r) => !excludedRoundIds.has(r.id)),
    isExploring: true,
  };
}
