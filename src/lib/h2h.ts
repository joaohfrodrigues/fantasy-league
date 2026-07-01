// Head-to-head comparison between two players.
//
// Deep module: two players' scores across a set of rounds in, the per-round
// record and running totals out. The caller decides which rounds count (e.g.
// only locked rounds) — this module just compares whatever rounds it's given.

export type ScoreLookup = (playerId: string, roundId: string) => number | undefined;

export type H2HRoundResult = {
  roundId: string;
  aScore: number;
  bScore: number;
  /** aScore - bScore; positive favours player A. */
  delta: number;
  winner: "a" | "b" | "draw";
};

export type H2HSummary = {
  aWins: number;
  bWins: number;
  draws: number;
  aTotal: number;
  bTotal: number;
  rounds: H2HRoundResult[];
};

/**
 * Head-to-head record between two players. A round only counts toward the
 * record when both players have a recorded score in it.
 */
export function computeH2H(params: {
  playerAId: string;
  playerBId: string;
  rounds: { id: string }[];
  score: ScoreLookup;
}): H2HSummary {
  const { playerAId, playerBId, rounds, score } = params;

  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let aTotal = 0;
  let bTotal = 0;
  const roundResults: H2HRoundResult[] = [];

  rounds.forEach((r) => {
    const aScore = score(playerAId, r.id);
    const bScore = score(playerBId, r.id);
    if (aScore === undefined || bScore === undefined) return;

    aTotal += aScore;
    bTotal += bScore;
    const delta = aScore - bScore;
    const winner = delta > 0 ? "a" : delta < 0 ? "b" : "draw";
    if (winner === "a") aWins += 1;
    else if (winner === "b") bWins += 1;
    else draws += 1;

    roundResults.push({ roundId: r.id, aScore, bScore, delta, winner });
  });

  return { aWins, bWins, draws, aTotal, bTotal, rounds: roundResults };
}
