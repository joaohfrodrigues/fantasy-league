// Round-lock side effects (see CONTEXT.md: Locked round). Deep module: this is
// "everything that happens when a round locks" — recomputing this league's live
// + record metrics, generating the round's banter (AI or templated), and
// persisting it — behind one call. `setRoundLock` no longer needs to know any
// of this happens; it just calls onRoundLocked and decides what to do if it
// throws (see setRoundLock's try/catch in leagues.functions.ts, which is the
// one place responsible for "a banter failure must never block the lock").
import type { AdminClient, PlayerRow } from "./leagues.functions";
import { computeRoundMaxes } from "./standings";
import { computeLiveMetrics } from "./league-metrics";
import { computeRecordMetrics } from "./badges";
import { toSimRound } from "./simulation";
import { getBanter, type BanterInput } from "./banter.server";

type RoundRow = {
  id: string;
  name: string;
  short: string;
  locked_at: string | null;
  display_order: number;
  summary_en: string | null;
  banter_devices: string[] | null;
};
type ScoreRow = { player_id: string; round_id: string; points: number };

/**
 * Recompute standings/win-probability/badges for `roundId`'s league, generate
 * its banter, and persist it to the round row. Lets errors propagate — the
 * caller (setRoundLock) decides whether a failure here should block anything.
 * Returns which banter path was used, so the AI-fails -> templated-fallback
 * behavior is directly assertable through the interface instead of only via
 * logs or a DB round-trip. Returns null when there's nothing to summarize yet
 * (no rounds/players, or the round itself can't be found).
 */
export async function onRoundLocked(
  admin: AdminClient,
  leagueId: string,
  roundId: string,
): Promise<{ usedAi: boolean } | null> {
  const [{ data: lg }, { data: rounds }, { data: players }] = await Promise.all([
    admin.from("leagues").select("id, name, tiebreak").eq("id", leagueId).maybeSingle(),
    admin
      .from("rounds")
      .select("id, name, short, locked_at, display_order, summary_en, banter_devices")
      .eq("league_id", leagueId)
      .order("display_order"),
    admin
      .from("players")
      .select("id, name, display_order, round_prize")
      .eq("league_id", leagueId)
      .order("display_order"),
  ]);
  if (!lg || !rounds?.length || !players?.length) return null;

  const roundList = rounds as unknown as RoundRow[];
  const roundIds = roundList.map((r) => r.id);
  const { data: scores } = await admin
    .from("scores")
    .select("player_id, round_id, points")
    .in("round_id", roundIds);
  const playerList = players as unknown as PlayerRow[];
  const scoreList = (scores ?? []) as ScoreRow[];
  const targetRound = roundList.find((r) => r.id === roundId);
  if (!targetRound) return null;

  const scoreOf = (pid: string, rid: string) =>
    scoreList.find((s) => s.player_id === pid && s.round_id === rid)?.points;
  const roundsWithLock = roundList.map(toSimRound);
  const tiebreak = (lg.tiebreak as "total" | "wins" | "latest") ?? "total";

  const roundMaxes = computeRoundMaxes(playerList, roundList, scoreOf);
  const { standings, winProbability } = computeLiveMetrics({
    players: playerList,
    rounds: roundsWithLock,
    score: scoreOf,
    tiebreak,
    pairs: 500,
  });
  const { badges } = computeRecordMetrics({
    players: playerList,
    rounds: roundsWithLock,
    score: scoreOf,
    tiebreak,
  });

  const roundMax = roundMaxes.get(roundId);
  const roundWinnerPlayer =
    roundMax !== undefined ? playerList.find((p) => scoreOf(p.id, roundId) === roundMax) : null;
  const roundWinner = roundWinnerPlayer?.name ?? null;
  const roundPrize = roundWinnerPlayer?.round_prize ?? null;
  const roundsPlayed = roundList.filter((r) => roundMaxes.has(r.id)).length;

  const playedRounds = roundList.filter((r) => roundMaxes.has(r.id));
  const recentRounds = playedRounds.map((r) => {
    const max = roundMaxes.get(r.id);
    const winner =
      max !== undefined
        ? (playerList.find((p) => scoreOf(p.id, r.id) === max)?.name ?? null)
        : null;
    return { roundName: r.name, winner };
  });

  const upcomingRounds = roundList.filter((r) => !roundMaxes.has(r.id)).map((r) => r.name);

  // Prior generated banter, for steering the AI away from repeating recent jokes/themes.
  const priorPlayedRounds = playedRounds.filter((r) => r.id !== roundId);
  const priorSummaries = priorPlayedRounds
    .slice(-3)
    .map((r) => r.summary_en)
    .filter((s): s is string => !!s);
  const priorDevices = [
    ...new Set(priorPlayedRounds.slice(-10).flatMap((r) => r.banter_devices ?? [])),
  ];

  // Detect leader change: compare pre-round leader (by total excluding this round) vs post-round.
  const preRoundLeader = [...standings].sort(
    (a, b) =>
      b.agg - (scoreOf(b.player.id, roundId) ?? 0) - (a.agg - (scoreOf(a.player.id, roundId) ?? 0)),
  )[0]?.player.name;
  const postRoundLeader = standings.find((r) => r.rank === 1)?.player.name;
  const leaderChanged = !!preRoundLeader && preRoundLeader !== postRoundLeader;

  const input: BanterInput = {
    leagueId: lg.id,
    roundId,
    leagueName: lg.name,
    roundName: targetRound.name,
    roundWinner,
    roundPrize,
    standings: standings
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({
        name: r.player.name,
        total: r.agg,
        rank: r.rank,
        prob: winProbability.get(r.player.id) ?? r.prob,
        wins: r.wins,
        roundScore: scoreOf(r.player.id, roundId) ?? null,
      })),
    recentRounds,
    upcomingRounds,
    badges: playerList.map((p) => ({ player: p.name, badges: badges.get(p.id) ?? [] })),
    roundsPlayed,
    totalRounds: roundList.length,
    leaderChanged,
    priorSummaries,
    priorDevices,
  };

  const { en, pt, ai, devices } = await getBanter(input);

  // Bypass strict Supabase schema types until migration is applied and types regenerated.
  type RoundsSummaryUpdate = {
    update(d: {
      summary_en: string | null;
      summary_pt: string | null;
      banter_devices: string[] | null;
    }): {
      eq(col: string, val: string): Promise<unknown>;
    };
  };
  await (admin.from("rounds") as unknown as RoundsSummaryUpdate)
    .update({ summary_en: en, summary_pt: pt, banter_devices: devices.length ? devices : null })
    .eq("id", roundId);

  return { usedAi: ai };
}
