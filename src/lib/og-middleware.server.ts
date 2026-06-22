// Server-only: request middleware handlers for /api/og/:slug and /api/recap/:slug/:roundId.
// Called from src/start.ts before TanStack Router processes the route.
import { createElement as h } from "react";
import {
  makeOgPng,
  makeRecapPng,
  BRAND_BLUE,
  GOLD,
  TEXT,
  MUTED,
  SURFACE,
  ACCENT,
} from "./og-image.server";
import { computeStandings, computeRoundMaxes } from "./standings";
import { assignBadges } from "./badges";
import { simulateWinProbability } from "./simulation";

export async function handleOgRequest(pathname: string): Promise<Response | null> {
  const ogMatch = pathname.match(/^\/api\/og\/([^/]+)$/);
  if (ogMatch) {
    return generateLeagueOgImage(decodeURIComponent(ogMatch[1]));
  }
  const recapMatch = pathname.match(/^\/api\/recap\/([^/]+)\/([^/]+)$/);
  if (recapMatch) {
    return generateRecapImage(decodeURIComponent(recapMatch[1]), decodeURIComponent(recapMatch[2]));
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function generateLeagueOgImage(slug: string): Promise<Response> {
  try {
    const db = await fetchDb();
    const { data: lg } = await db.from("leagues").select("id, name").eq("slug", slug).maybeSingle();

    const leagueName = lg?.name ?? "Fantasy League";
    let leader: { name: string } | null = null;
    let roundsPlayed = 0;
    let totalRounds = 0;

    if (lg) {
      const [{ data: rounds }, { data: players }] = await Promise.all([
        db.from("rounds").select("id").eq("league_id", lg.id).order("display_order"),
        db.from("players").select("id, name").eq("league_id", lg.id).order("display_order"),
      ]);
      totalRounds = (rounds ?? []).length;
      const roundIds = (rounds ?? []).map((r: { id: string }) => r.id);
      if (roundIds.length && (players ?? []).length) {
        const { data: scores } = await db
          .from("scores")
          .select("player_id, round_id, points")
          .in("round_id", roundIds);
        const scoreList = (scores ?? []) as {
          player_id: string;
          round_id: string;
          points: number;
        }[];
        if (scoreList.length) {
          roundsPlayed = new Set(scoreList.map((s) => s.round_id)).size;
          const totals = new Map<string, number>();
          const nameMap = new Map<string, string>();
          (players ?? []).forEach((p: { id: string; name: string }) => {
            totals.set(p.id, 0);
            nameMap.set(p.id, p.name);
          });
          scoreList.forEach((s) =>
            totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.points),
          );
          let best: { name: string; total: number } | null = null;
          totals.forEach((total, pid) => {
            if (!best || total > best.total) best = { name: nameMap.get(pid) ?? "", total };
          });
          leader = best;
        }
      }
    }

    const png = await makeOgPng(LeagueOgCard({ leagueName, leader, roundsPlayed, totalRounds }));
    return new Response(Buffer.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[og-middleware] OG image error:", err);
    return new Response("Error", { status: 500 });
  }
}

async function generateRecapImage(slug: string, roundId: string): Promise<Response> {
  try {
    const db = await fetchDb();
    const { data: lg } = await db
      .from("leagues")
      .select("id, name, tiebreak")
      .eq("slug", slug)
      .maybeSingle();
    if (!lg) return new Response("League not found", { status: 404 });

    const [{ data: rounds }, { data: players }] = await Promise.all([
      db
        .from("rounds")
        .select("id, name, locked_at, display_order")
        .eq("league_id", lg.id)
        .order("display_order"),
      db
        .from("players")
        .select("id, name, display_order, drink")
        .eq("league_id", lg.id)
        .order("display_order"),
    ]);
    type PR = { id: string; name: string; locked_at: string | null; display_order: number };
    type PP = { id: string; name: string; display_order: number; drink: string };
    const roundList = (rounds ?? []) as PR[];
    const playerList = (players ?? []) as PP[];
    const roundIds = roundList.map((r) => r.id);
    const { data: scores } = roundIds.length
      ? await db.from("scores").select("player_id, round_id, points").in("round_id", roundIds)
      : { data: [] };
    type PS = { player_id: string; round_id: string; points: number };
    const scoreList = (scores ?? []) as PS[];
    const targetRound = roundList.find((r) => r.id === roundId);
    if (!targetRound) return new Response("Round not found", { status: 404 });

    const tiebreak = (lg.tiebreak as "total" | "wins" | "latest") ?? "total";
    const scoreOf = (pid: string, rid: string) =>
      scoreList.find((s) => s.player_id === pid && s.round_id === rid)?.points;
    const roundsWithLock = roundList.map((r) => ({ id: r.id, locked: r.locked_at !== null }));
    const roundMaxes = computeRoundMaxes(playerList, roundList, scoreOf);
    const winProbability = simulateWinProbability({
      players: playerList,
      rounds: roundsWithLock,
      score: scoreOf,
      pairs: 500,
    });
    const standingRows = computeStandings({
      players: playerList,
      rounds: roundList,
      score: scoreOf,
      winProbability,
      tiebreak,
      roundMaxes,
    });
    const badges = assignBadges({
      players: playerList,
      rounds: roundsWithLock,
      score: scoreOf,
      tiebreak,
    });
    const badgesInput = playerList.map((p) => ({ player: p.name, badges: badges.get(p.id) ?? [] }));
    const roundMax = roundMaxes.get(roundId);
    const roundWinner =
      roundMax !== undefined
        ? (playerList.find((p) => scoreOf(p.id, roundId) === roundMax)?.name ?? null)
        : null;
    const roundsPlayed = roundList.filter((r) => roundMaxes.has(r.id)).length;

    const { getBanter } = await import("./banter.server");
    const { text: banterText } = await getBanter({
      leagueId: lg.id,
      roundId: targetRound.id,
      leagueName: lg.name,
      roundName: targetRound.name,
      roundWinner,
      leader: standingRows[0]?.player.name ?? null,
      lastPlace: standingRows[standingRows.length - 1]?.player.name ?? null,
      badges: badgesInput,
      playerCount: playerList.length,
      roundsPlayed,
      totalRounds: roundList.length,
    });

    const standingsForCard = standingRows
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ name: r.player.name, total: r.agg, rank: r.rank, prob: r.prob }));
    const png = await makeRecapPng(
      RecapCard({
        leagueName: lg.name,
        roundName: targetRound.name,
        standings: standingsForCard,
        winner: roundWinner,
        banterText,
        roundsPlayed,
        totalRounds: roundList.length,
      }),
    );
    return new Response(Buffer.from(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[og-middleware] Recap image error:", err);
    return new Response("Error", { status: 500 });
  }
}

// ── image templates ───────────────────────────────────────────────────────────

function LeagueOgCard(props: {
  leagueName: string;
  leader: { name: string } | null;
  roundsPlayed: number;
  totalRounds: number;
}) {
  const { leagueName, leader, roundsPlayed, totalRounds } = props;
  const hasData = roundsPlayed > 0 && leader;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1200px",
        height: "630px",
        backgroundColor: BRAND_BLUE,
        padding: "56px 64px",
        fontFamily: "Space Grotesk",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "auto" } },
      h("div", { style: { fontSize: "32px", lineHeight: "1" } }, "🏆"),
      h(
        "span",
        {
          style: {
            fontSize: "20px",
            fontWeight: 600,
            color: MUTED,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          },
        },
        "Fantasy Tracker",
      ),
    ),
    h(
      "div",
      {
        style: {
          fontSize: leagueName.length > 24 ? "52px" : "64px",
          fontWeight: 700,
          color: TEXT,
          lineHeight: "1.1",
          marginBottom: "24px",
          maxWidth: "900px",
        },
      },
      leagueName,
    ),
    hasData
      ? h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "32px" } },
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "12px",
                backgroundColor: SURFACE,
                borderRadius: "12px",
                padding: "16px 24px",
              },
            },
            h("span", { style: { fontSize: "28px" } }, "🥇"),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column" } },
              h(
                "span",
                {
                  style: {
                    fontSize: "14px",
                    color: MUTED,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  },
                },
                "Leading",
              ),
              h("span", { style: { fontSize: "32px", fontWeight: 700, color: TEXT } }, leader.name),
            ),
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "4px" } },
            h(
              "span",
              {
                style: {
                  fontSize: "14px",
                  color: MUTED,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                },
              },
              "Progress",
            ),
            h(
              "span",
              { style: { fontSize: "32px", fontWeight: 700, color: GOLD } },
              `${roundsPlayed}/${totalRounds}`,
            ),
            h(
              "span",
              { style: { fontSize: "14px", color: MUTED } },
              `round${roundsPlayed === 1 ? "" : "s"} played`,
            ),
          ),
        )
      : h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              backgroundColor: SURFACE,
              borderRadius: "12px",
              padding: "16px 24px",
            },
          },
          h(
            "span",
            { style: { fontSize: "14px", color: MUTED, fontWeight: 600 } },
            totalRounds > 0
              ? `${totalRounds} round${totalRounds === 1 ? "" : "s"} · Ready to play`
              : "Just getting started",
          ),
        ),
    h("div", {
      style: {
        height: "4px",
        width: "120px",
        backgroundColor: ACCENT,
        borderRadius: "2px",
        marginTop: "40px",
      },
    }),
  );
}

function RecapCard(props: {
  leagueName: string;
  roundName: string;
  standings: { name: string; total: number; rank: number; prob: number }[];
  winner: string | null;
  banterText: string;
  roundsPlayed: number;
  totalRounds: number;
}) {
  const { leagueName, roundName, standings, winner, banterText, roundsPlayed, totalRounds } = props;
  const top3 = standings.slice(0, 3);
  const rankEmoji = ["🥇", "🥈", "🥉"];

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1080px",
        height: "1080px",
        backgroundColor: BRAND_BLUE,
        padding: "60px",
        fontFamily: "Space Grotesk",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "48px",
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "4px" } },
        h(
          "span",
          {
            style: {
              fontSize: "14px",
              color: MUTED,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            },
          },
          "Fantasy Tracker",
        ),
        h("span", { style: { fontSize: "36px", fontWeight: 700, color: TEXT } }, leagueName),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" } },
        h(
          "span",
          {
            style: {
              fontSize: "14px",
              color: MUTED,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            },
          },
          roundName,
        ),
        h(
          "span",
          { style: { fontSize: "20px", fontWeight: 700, color: GOLD } },
          `${roundsPlayed}/${totalRounds} rounds`,
        ),
      ),
    ),
    winner &&
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "16px",
            backgroundColor: SURFACE,
            borderRadius: "16px",
            padding: "20px 28px",
            marginBottom: "32px",
            borderLeft: `4px solid ${GOLD}`,
          },
        },
        h("span", { style: { fontSize: "36px" } }, "🏆"),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          h(
            "span",
            {
              style: {
                fontSize: "13px",
                color: MUTED,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              },
            },
            "Round winner",
          ),
          h("span", { style: { fontSize: "32px", fontWeight: 700, color: TEXT } }, winner),
        ),
      ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "40px" } },
      ...top3.map((row, i) =>
        h(
          "div",
          {
            key: row.name,
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: i === 0 ? SURFACE : "rgba(30,40,64,0.5)",
              borderRadius: "12px",
              padding: "16px 24px",
              borderLeft: i === 0 ? `3px solid ${ACCENT}` : "3px solid transparent",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "16px" } },
            h("span", { style: { fontSize: "28px" } }, rankEmoji[i] ?? `#${row.rank}`),
            h(
              "span",
              { style: { fontSize: i === 0 ? "28px" : "24px", fontWeight: 700, color: TEXT } },
              row.name,
            ),
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
            h(
              "span",
              {
                style: {
                  fontSize: i === 0 ? "28px" : "22px",
                  fontWeight: 700,
                  color: i === 0 ? ACCENT : TEXT,
                },
              },
              `${row.total} pts`,
            ),
            h(
              "span",
              { style: { fontSize: "13px", color: MUTED } },
              `${Math.round(row.prob * 100)}% odds`,
            ),
          ),
        ),
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          backgroundColor: SURFACE,
          borderRadius: "16px",
          padding: "24px 28px",
          borderLeft: `4px solid ${ACCENT}`,
          marginTop: "auto",
        },
      },
      h(
        "span",
        { style: { fontSize: "20px", color: TEXT, lineHeight: "1.5", fontWeight: 600 } },
        banterText,
      ),
    ),
    h(
      "div",
      { style: { display: "flex", justifyContent: "flex-end", marginTop: "24px" } },
      h(
        "span",
        { style: { fontSize: "14px", color: MUTED, fontWeight: 600, letterSpacing: "0.1em" } },
        "fantasy-tracker.app",
      ),
    ),
  );
}
