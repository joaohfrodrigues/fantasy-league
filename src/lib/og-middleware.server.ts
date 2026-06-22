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
    let top3: { name: string; total: number; rank: number }[] = [];
    let roundsPlayed = 0;
    let totalRounds = 0;
    let playerCount = 0;

    if (lg) {
      const [{ data: rounds }, { data: players }] = await Promise.all([
        db.from("rounds").select("id").eq("league_id", lg.id).order("display_order"),
        db.from("players").select("id, name").eq("league_id", lg.id).order("display_order"),
      ]);
      totalRounds = (rounds ?? []).length;
      playerCount = (players ?? []).length;
      const roundIds = (rounds ?? []).map((r: { id: string }) => r.id);
      if (roundIds.length && playerCount) {
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
          top3 = Array.from(totals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([pid, total], i) => ({ name: nameMap.get(pid) ?? "", total, rank: i + 1 }));
        }
      }
    }

    const png = await makeOgPng(
      LeagueOgCard({ leagueName, top3, roundsPlayed, totalRounds, playerCount }),
    );
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
        .select("id, name, locked_at, display_order, summary")
        .eq("league_id", lg.id)
        .order("display_order"),
      db
        .from("players")
        .select("id, name, display_order, drink")
        .eq("league_id", lg.id)
        .order("display_order"),
    ]);
    type PR = {
      id: string;
      name: string;
      locked_at: string | null;
      display_order: number;
      summary: string | null;
    };
    type PP = { id: string; name: string; display_order: number; drink: string };
    const roundList = (rounds ?? []) as unknown as PR[];
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
    const roundMax = roundMaxes.get(roundId);
    const roundWinner =
      roundMax !== undefined
        ? (playerList.find((p) => scoreOf(p.id, roundId) === roundMax)?.name ?? null)
        : null;
    const roundsPlayed = roundList.filter((r) => roundMaxes.has(r.id)).length;

    // Use the stored summary (generated on lock) or fall back to templated banter.
    let banterText = targetRound.summary;
    if (!banterText) {
      const { templatedBanter } = await import("./banter.server");
      const playedRounds = roundList.filter((r) => roundMaxes.has(r.id));
      const recentRounds = playedRounds.map((r) => {
        const max = roundMaxes.get(r.id);
        const winner =
          max !== undefined
            ? (playerList.find((p) => scoreOf(p.id, r.id) === max)?.name ?? null)
            : null;
        return { roundName: r.name, winner };
      });
      const badges = assignBadges({
        players: playerList,
        rounds: roundsWithLock,
        score: scoreOf,
        tiebreak,
      });
      banterText = templatedBanter({
        leagueId: lg.id,
        roundId,
        leagueName: lg.name,
        roundName: targetRound.name,
        roundWinner,
        standings: standingRows
          .sort((a, b) => a.rank - b.rank)
          .map((r) => ({ name: r.player.name, total: r.agg, rank: r.rank, prob: r.prob })),
        recentRounds,
        badges: playerList.map((p) => ({ player: p.name, badges: badges.get(p.id) ?? [] })),
        roundsPlayed,
        totalRounds: roundList.length,
      });
    }

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
  top3: { name: string; total: number; rank: number }[];
  roundsPlayed: number;
  totalRounds: number;
  playerCount: number;
}) {
  const { leagueName, top3, roundsPlayed, totalRounds, playerCount } = props;
  const hasData = roundsPlayed > 0 && top3.length > 0;
  const progressPct = totalRounds > 0 ? Math.round((roundsPlayed / totalRounds) * 100) : 0;
  const nameFontSize = leagueName.length > 28 ? "48px" : leagueName.length > 18 ? "56px" : "68px";

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1200px",
        height: "630px",
        backgroundColor: BRAND_BLUE,
        padding: "52px 64px 48px",
        fontFamily: "Space Grotesk",
      },
    },
    // ── top bar ──────────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "48px",
        },
      },
      h(
        "span",
        {
          style: {
            fontSize: "16px",
            fontWeight: 600,
            color: MUTED,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          },
        },
        "Fantasy Tracker",
      ),
      totalRounds > 0 &&
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: SURFACE,
              borderRadius: "8px",
              padding: "8px 16px",
            },
          },
          h("span", { style: { fontSize: "15px", fontWeight: 600, color: MUTED } }, "Round"),
          h(
            "span",
            { style: { fontSize: "15px", fontWeight: 700, color: GOLD } },
            `${roundsPlayed} / ${totalRounds}`,
          ),
        ),
    ),
    // ── league name ──────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          fontSize: nameFontSize,
          fontWeight: 700,
          color: TEXT,
          lineHeight: "1.08",
          marginBottom: "40px",
          maxWidth: "1000px",
        },
      },
      leagueName,
    ),
    // ── standings ────────────────────────────────────────────────────────────
    hasData
      ? h(
          "div",
          { style: { display: "flex", gap: "16px", marginBottom: "auto" } },
          ...top3.map((row, i) =>
            h(
              "div",
              {
                key: row.name,
                style: {
                  display: "flex",
                  flexDirection: "column",
                  flex: i === 0 ? "1.4" : "1",
                  backgroundColor: SURFACE,
                  borderRadius: "14px",
                  padding: "20px 24px",
                  borderTop: `3px solid ${i === 0 ? ACCENT : "transparent"}`,
                },
              },
              h(
                "span",
                {
                  style: {
                    fontSize: "12px",
                    fontWeight: 600,
                    color: i === 0 ? ACCENT : MUTED,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: "8px",
                  },
                },
                i === 0 ? "Leader" : `#${row.rank}`,
              ),
              h(
                "span",
                {
                  style: {
                    fontSize: i === 0 ? "30px" : "24px",
                    fontWeight: 700,
                    color: TEXT,
                    lineHeight: "1.1",
                    marginBottom: "6px",
                  },
                },
                row.name,
              ),
              h(
                "span",
                {
                  style: {
                    fontSize: i === 0 ? "18px" : "15px",
                    fontWeight: 600,
                    color: i === 0 ? GOLD : MUTED,
                  },
                },
                `${row.total} pts`,
              ),
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
            { style: { fontSize: "16px", color: MUTED, fontWeight: 600 } },
            playerCount > 0
              ? `${playerCount} players · ${totalRounds} rounds · Season not started`
              : "Just getting started",
          ),
        ),
    // ── footer progress bar ──────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "32px",
        },
      },
      totalRounds > 0 &&
        h(
          "div",
          {
            style: {
              display: "flex",
              width: "100%",
              height: "4px",
              backgroundColor: SURFACE,
              borderRadius: "2px",
              overflow: "hidden",
            },
          },
          h("div", {
            style: {
              width: `${progressPct}%`,
              height: "4px",
              backgroundColor: ACCENT,
              borderRadius: "2px",
            },
          }),
        ),
    ),
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
  // Show up to 6 rows so the card fills without a dead zone.
  const rows = standings.slice(0, 6);

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1080px",
        height: "1080px",
        backgroundColor: BRAND_BLUE,
        padding: "56px 60px 48px",
        fontFamily: "Space Grotesk",
      },
    },
    // ── header ────────────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "36px",
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        h(
          "span",
          {
            style: {
              fontSize: "15px",
              color: MUTED,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
            },
          },
          "Fantasy Tracker",
        ),
        h(
          "span",
          {
            style: {
              fontSize: leagueName.length > 22 ? "36px" : "42px",
              fontWeight: 700,
              color: TEXT,
              lineHeight: "1.05",
              maxWidth: "640px",
            },
          },
          leagueName,
        ),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" } },
        h(
          "span",
          {
            style: {
              fontSize: "15px",
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
          { style: { fontSize: "22px", fontWeight: 700, color: GOLD } },
          `${roundsPlayed} / ${totalRounds} rounds`,
        ),
      ),
    ),
    // ── round winner strip ────────────────────────────────────────────────────
    winner &&
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "20px",
            backgroundColor: SURFACE,
            borderRadius: "14px",
            padding: "18px 28px",
            marginBottom: "28px",
            borderLeft: `4px solid ${GOLD}`,
          },
        },
        h(
          "span",
          {
            style: {
              fontSize: "13px",
              color: GOLD,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            },
          },
          `${roundName} winner`,
        ),
        h("span", { style: { fontSize: "30px", fontWeight: 700, color: TEXT } }, winner),
      ),
    // ── standings (fills remaining space) ─────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          flexGrow: 1,
        },
      },
      ...rows.map((row, i) =>
        h(
          "div",
          {
            key: row.name,
            style: {
              display: "flex",
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: i === 0 ? SURFACE : "rgba(30,40,64,0.45)",
              borderRadius: "14px",
              padding: "0 28px",
              borderLeft: i === 0 ? `4px solid ${ACCENT}` : "4px solid transparent",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "22px" } },
            // rank badge (number, no emoji)
            h(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: i === 0 ? ACCENT : "rgba(148,163,184,0.15)",
                },
              },
              h(
                "span",
                {
                  style: {
                    fontSize: "24px",
                    fontWeight: 700,
                    color: i === 0 ? BRAND_BLUE : MUTED,
                  },
                },
                String(row.rank),
              ),
            ),
            h(
              "span",
              { style: { fontSize: i === 0 ? "32px" : "28px", fontWeight: 700, color: TEXT } },
              row.name,
            ),
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "baseline", gap: "16px" } },
            h(
              "span",
              { style: { fontSize: "16px", color: MUTED, fontWeight: 600 } },
              `${Math.round(row.prob * 100)}%`,
            ),
            h(
              "span",
              {
                style: {
                  fontSize: i === 0 ? "30px" : "26px",
                  fontWeight: 700,
                  color: i === 0 ? ACCENT : TEXT,
                  minWidth: "120px",
                  textAlign: "right",
                },
              },
              `${row.total} pts`,
            ),
          ),
        ),
      ),
    ),
    // ── banter ────────────────────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          backgroundColor: SURFACE,
          borderRadius: "16px",
          padding: "24px 28px",
          borderLeft: `4px solid ${ACCENT}`,
          marginTop: "28px",
        },
      },
      h(
        "span",
        { style: { fontSize: "21px", color: TEXT, lineHeight: "1.5", fontWeight: 600 } },
        banterText,
      ),
    ),
    // ── footer ────────────────────────────────────────────────────────────────
    h(
      "div",
      { style: { display: "flex", justifyContent: "flex-end", marginTop: "20px" } },
      h(
        "span",
        { style: { fontSize: "15px", color: MUTED, fontWeight: 600, letterSpacing: "0.1em" } },
        "fantasy-tracker.app",
      ),
    ),
  );
}
