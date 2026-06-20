// Standings (see CONTEXT.md: Standings, Tiebreak, Round win, Win probability).
//
// Deep module: scores + the league's tiebreak rule in, ranked rows out. It owns
// the league language — totals, round wins, the "best latest round" metric — and
// applies the tiebreak to the rank itself, so the #1/#2 badge reflects the rule
// (not total-only). The interface is the test surface.

// Tie-break rule for players level on total points. Always total first, then the
// configured rule. Kept in sync with the DB CHECK constraint on leagues.tiebreak
// and the server validator (which imports TIEBREAKS from here).
export type TiebreakMode = "total" | "wins" | "latest";
export const TIEBREAKS: TiebreakMode[] = ["total", "wins", "latest"];

type RankMetrics = { agg: number; wins: number; latest: number };

// Order two players for league rank; higher is better. Returns <0 when `a`
// should rank above `b`.
export function compareRank(a: RankMetrics, b: RankMetrics, mode: TiebreakMode): number {
  if (a.agg !== b.agg) return b.agg - a.agg;
  if (mode === "wins" && a.wins !== b.wins) return b.wins - a.wins;
  if (mode === "latest" && a.latest !== b.latest) return b.latest - a.latest;
  return 0;
}

export type ScoreLookup = (playerId: string, roundId: string) => number | undefined;

/** Highest score in each round (a Round win goes to whoever holds it). */
export function computeRoundMaxes(
  players: { id: string }[],
  rounds: { id: string }[],
  score: ScoreLookup,
): Map<string, number> {
  const m = new Map<string, number>();
  rounds.forEach((r) => {
    let max = Number.NEGATIVE_INFINITY;
    players.forEach((p) => {
      const v = score(p.id, r.id);
      if (typeof v === "number" && v > max) max = v;
    });
    if (max !== Number.NEGATIVE_INFINITY) m.set(r.id, max);
  });
  return m;
}

export type StandingRow<P> = {
  player: P;
  perRound: (number | null)[];
  /** Total points across all rounds. */
  agg: number;
  /** Number of rounds this player won (a Round win each). */
  wins: number;
  /** Score in the latest played round; the "best latest round" tiebreak metric. */
  latest: number;
  /** Win probability in [0, 1]. */
  prob: number;
  /** League rank (1 = first), with the tiebreak applied. */
  rank: number;
};

/**
 * Rank players into standings with the tiebreak rule applied. Rounds must be in
 * display order. `winProbability` and `roundMaxes` are accepted (not recomputed)
 * so callers can reuse work; `roundMaxes` defaults to computing from the scores.
 */
export function computeStandings<P extends { id: string }>(params: {
  players: P[];
  rounds: { id: string }[];
  score: ScoreLookup;
  winProbability: Map<string, number>;
  tiebreak: TiebreakMode;
  roundMaxes?: Map<string, number>;
}): StandingRow<P>[] {
  const { players, rounds, score, winProbability, tiebreak } = params;
  const roundMaxes = params.roundMaxes ?? computeRoundMaxes(players, rounds, score);

  // The latest played round is the last one (in display order) anyone scored.
  let latestRoundId: string | null = null;
  rounds.forEach((r) => {
    if (roundMaxes.has(r.id)) latestRoundId = r.id;
  });

  const rows = players.map((p) => {
    const perRound = rounds.map((r) => score(p.id, r.id) ?? null);
    const agg = perRound.reduce<number>((a, v) => a + (v ?? 0), 0);
    const wins = rounds.reduce((acc, r, idx) => {
      const max = roundMaxes.get(r.id);
      const mine = perRound[idx];
      return max !== undefined && mine !== null && mine === max ? acc + 1 : acc;
    }, 0);
    const latest = latestRoundId ? (score(p.id, latestRoundId) ?? 0) : 0;
    const prob = winProbability.get(p.id) ?? 0;
    return { player: p, perRound, agg, wins, latest, prob };
  });

  const rankMap = new Map<string, number>();
  [...rows]
    .sort((a, b) => compareRank(a, b, tiebreak))
    .forEach((r, i) => rankMap.set(r.player.id, i + 1));

  return rows.map((r) => ({ ...r, rank: rankMap.get(r.player.id) ?? 0 }));
}
