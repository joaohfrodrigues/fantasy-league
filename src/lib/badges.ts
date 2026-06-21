// Round badges (see CONTEXT.md: Badge). Pure module: players, rounds, a saved-score
// lookup and the tiebreak in; a per-player list of badge ids out. Reuses the
// Standings module for ranking so badges and standings can never disagree.
//
// Badges are derived, never persisted, and computed from SAVED scores only (not
// What-if). Nothing is awarded until at least 2 rounds have been played.
import {
  computeStandings,
  computeRoundMaxes,
  type ScoreLookup,
  type TiebreakMode,
} from "./standings";

export type BadgeId = "onFire" | "onRise" | "bottler" | "ghost";

/** Minimum played rounds before any badge is awarded (streak, prev-rank, grace). */
const MIN_PLAYED = 2;

/**
 * Per-player badges for the current saved state. Returns a map keyed by player id
 * (every player present, empty array when none earned). Display order within a
 * player's list: onFire, onRise, bottler, ghost.
 */
export function assignBadges<P extends { id: string }>(params: {
  players: P[];
  rounds: { id: string; locked?: boolean }[];
  score: ScoreLookup;
  tiebreak: TiebreakMode;
}): Map<string, BadgeId[]> {
  const { players, score, tiebreak } = params;

  const result = new Map<string, BadgeId[]>();
  players.forEach((p) => result.set(p.id, []));

  // Badges are the finalized record: only locked rounds count. The MIN_PLAYED gate
  // therefore needs ≥2 LOCKED rounds before any badge can appear.
  const rounds = params.rounds.filter((r) => r.locked);

  const roundMaxes = computeRoundMaxes(players, rounds, score);
  const playedRounds = rounds.filter((r) => roundMaxes.has(r.id));
  if (playedRounds.length < MIN_PLAYED) return result;

  const add = (id: string, badge: BadgeId) => result.get(id)?.push(badge);
  const noProb = new Map<string, number>();

  const current = computeStandings({
    players,
    rounds,
    score,
    winProbability: noProb,
    tiebreak,
    roundMaxes,
  });

  // 🔥 On Fire — won the latest played round and the one(s) before it, ≥2 in a row.
  // A round is "won" by anyone whose score equals that round's max (ties co-win).
  for (const p of players) {
    let streak = 0;
    for (let i = playedRounds.length - 1; i >= 0; i--) {
      const r = playedRounds[i];
      const max = roundMaxes.get(r.id);
      const v = score(p.id, r.id);
      if (max !== undefined && typeof v === "number" && v === max) streak += 1;
      else break;
    }
    if (streak >= 2) add(p.id, "onFire");
  }

  // 📈 On the Rise / 📉 The Bottler — biggest rank move caused by the latest round.
  // Rank before = standings excluding the latest played round.
  const latestPlayed = playedRounds[playedRounds.length - 1];
  const previous = computeStandings({
    players,
    rounds: rounds.filter((r) => r.id !== latestPlayed.id),
    score,
    winProbability: noProb,
    tiebreak,
  });
  const prevRank = new Map(previous.map((row) => [row.player.id, row.rank]));
  const deltas = current.map((row) => ({
    id: row.player.id,
    // Positive = moved up (lower rank number).
    delta: (prevRank.get(row.player.id) ?? row.rank) - row.rank,
  }));
  const maxUp = Math.max(...deltas.map((d) => d.delta));
  const maxDown = Math.min(...deltas.map((d) => d.delta));
  if (maxUp > 0) deltas.filter((d) => d.delta === maxUp).forEach((d) => add(d.id, "onRise"));
  if (maxDown < 0) deltas.filter((d) => d.delta === maxDown).forEach((d) => add(d.id, "bottler"));

  // 👻 The Ghost — no points at all (grace period already satisfied by MIN_PLAYED).
  for (const row of current) {
    if (row.agg === 0) add(row.player.id, "ghost");
  }

  return result;
}
