// Alternative Reality (see CONTEXT.md). A "change the past" exploration mode:
// filters which past (locked) rounds feed live metrics. Debouncing user input
// before it reaches this function is a UI concern and stays in the route.

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
