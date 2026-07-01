// Server-only: AI banter generation for round summaries.
// Called once when a round is locked; result is stored in rounds.summary_en/_pt.
// Primary: Gemini 3.1 Flash Lite (GOOGLE_AI_API_KEY), returns EN + PT-PT in one
// JSON call. Fallback: locale-aware templated text.
import type { BadgeId } from "./badges";

export type BanterInput = {
  leagueId: string;
  roundId: string;
  leagueName: string;
  roundName: string;
  roundWinner: string | null;
  /** Round prize earned by the round winner; null if no winner or no prize set. */
  roundPrize: string | null;
  /** Full current standings after this round, sorted by rank. */
  standings: {
    name: string;
    total: number;
    rank: number;
    prob: number;
    /** Number of rounds this player has won. */
    wins: number;
    /** This player's score in the round just finished. */
    roundScore: number | null;
  }[];
  /** All rounds played so far, newest last. */
  recentRounds: { roundName: string; winner: string | null }[];
  /** Names of rounds not yet played, in display order. */
  upcomingRounds: string[];
  badges: { player: string; badges: BadgeId[] }[];
  roundsPlayed: number;
  totalRounds: number;
  /** True when the overall league leader changed as a result of this round. */
  leaderChanged: boolean;
};

export type BanterLocale = "en" | "pt";

export function templatedBanter(input: BanterInput, locale: BanterLocale): string {
  const { roundWinner, standings, badges, roundName, roundsPlayed, totalRounds } = input;
  const leader = standings[0]?.name ?? null;
  const lastPlace = standings[standings.length - 1]?.name ?? null;
  const remaining = totalRounds - roundsPlayed;

  const onFire = badges.find((b) => b.badges.includes("onFire"));
  const bottler = badges.find((b) => b.badges.includes("bottler"));
  const ghost = badges.find((b) => b.badges.includes("ghost"));

  const tpl =
    locale === "pt"
      ? {
          onFireWinner: (p: string) => `${p} está a arrasar — rondas seguidas dominadas.`,
          winner: (p: string, r: string) => `${p} arrecada ${r} — resultado limpo, sem discussão.`,
          bottler: (p: string) => `${p} está em queda livre — chamem uma equipa de resgate.`,
          lastPlace: (p: string) => `${p} na cauda — o jantar está a ficar caro a partir daqui.`,
          leaderRemaining: (p: string, n: number) =>
            `${p} lidera com ${n} ronda${n === 1 ? "" : "s"} por jogar — ainda não está seguro.`,
          leaderDone: (p: string) => `${p} ganha o prémio — bem jogado.`,
          ghost: (p: string) => `${p} ainda não marcou um único ponto. Notável dedicação a perder.`,
          fallback: (r: string) => `${r} terminada. A classificação não mente.`,
        }
      : {
          onFireWinner: (p: string) =>
            `${p} is absolutely on fire — back-to-back rounds dominated.`,
          winner: (p: string, r: string) => `${p} takes ${r} — clean result, no arguments.`,
          bottler: (p: string) => `${p} is in freefall — someone call a rescue team.`,
          lastPlace: (p: string) => `${p} at the bottom — dinner's looking expensive from here.`,
          leaderRemaining: (p: string, n: number) =>
            `${p} leads with ${n} round${n === 1 ? "" : "s"} left — not safe yet.`,
          leaderDone: (p: string) => `${p} wins the prize — well played.`,
          ghost: (p: string) => `${p} hasn't scored a point yet. Remarkable commitment to losing.`,
          fallback: (r: string) => `${r} done. The standings don't lie.`,
        };

  const parts: string[] = [];

  if (roundWinner) {
    parts.push(
      onFire && onFire.player === roundWinner
        ? tpl.onFireWinner(roundWinner)
        : tpl.winner(roundWinner, roundName),
    );
  }

  if (bottler) {
    parts.push(tpl.bottler(bottler.player));
  } else if (lastPlace && lastPlace !== roundWinner) {
    parts.push(tpl.lastPlace(lastPlace));
  }

  if (leader && remaining > 0) {
    parts.push(tpl.leaderRemaining(leader, remaining));
  } else if (leader && remaining === 0) {
    parts.push(tpl.leaderDone(leader));
  }

  if (ghost) {
    parts.push(tpl.ghost(ghost.player));
  }

  return parts.slice(0, 3).join(" ") || tpl.fallback(roundName);
}

async function callGemini(prompt: string): Promise<{ en: string; pt: string } | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[banter] GOOGLE_AI_API_KEY not set — using templated fallback");
    return null;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: [
              "You are a ruthless fantasy football pundit — sharp, funny, no mercy.",
              "You write a short post-round summary for a private league of friends.",
              "Rules:",
              "- Name the round winner and their score. If a round prize is listed, mention it once as a reward they earned — it is a positive thing, not a penalty.",
              "- Contrast the overall league leader's win probability against the closest challenger — use the point margin and the % to win.",
              "- Name and roast the last-place player.",
              "- If the league leader changed this round, call it out as a notable moment.",
              "- If upcoming rounds are listed, reference the next one to frame what's at stake.",
              "- If badges are listed (onFire, onRise, bottler, ghost), weave them in naturally.",
              "- Maximum 3 sentences. No hashtags, no emojis, no filler like 'Alright folks' or 'Well well well'. Just the pundit take.",
              "Output JSON with two fields: 'en' (British English) and 'pt' (European Portuguese, pt-PT — informal, expressive, idiomatically natural; not Brazilian Portuguese, not a literal translation of the English).",
            ].join(" "),
          },
        ],
      },
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { en: { type: "STRING" }, pt: { type: "STRING" } },
          required: ["en", "pt"],
        },
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[banter] Gemini request failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) {
      console.warn("[banter] Gemini returned no text — using templated fallback");
      return null;
    }
    const parsed = JSON.parse(raw) as { en?: string; pt?: string };
    const en = parsed.en?.trim();
    const pt = parsed.pt?.trim();
    if (!en || !pt) {
      console.warn("[banter] Gemini response missing en/pt — using templated fallback");
      return null;
    }
    return { en, pt };
  } catch (err) {
    console.error("[banter] Gemini call threw:", err);
    return null;
  }
}

export function buildPrompt(input: BanterInput): string {
  const {
    leagueName,
    roundName,
    roundWinner,
    roundPrize,
    standings,
    recentRounds,
    upcomingRounds,
    badges,
    roundsPlayed,
    totalRounds,
    leaderChanged,
  } = input;
  const remaining = totalRounds - roundsPlayed;

  const leader = standings[0];
  const runnerUp = standings[1];
  const leaderMargin = leader && runnerUp ? leader.total - runnerUp.total : null;

  const standingLines = standings
    .map((s) => {
      const scoreNote = s.roundScore !== null ? `, scored ${s.roundScore} this round` : "";
      return `#${s.rank} ${s.name} — ${s.total} pts (${Math.round(s.prob * 100)}% to win, ${s.wins} round win${s.wins === 1 ? "" : "s"}${scoreNote})`;
    })
    .join("; ");

  const marginNote =
    leaderMargin !== null && runnerUp
      ? `${leader.name} leads ${runnerUp.name} by ${leaderMargin} point${leaderMargin === 1 ? "" : "s"}.`
      : null;

  const winnerNote = roundWinner
    ? `Winner: ${roundWinner}${roundPrize ? ` (round prize: ${roundPrize})` : ""}.`
    : "Winner: none.";

  const historyLines =
    recentRounds.length > 1
      ? recentRounds
          .slice(0, -1)
          .map((r) => `${r.roundName}: ${r.winner ?? "no winner"}`)
          .join(", ")
      : null;

  const upcomingNote =
    upcomingRounds.length > 0
      ? `Next rounds: ${upcomingRounds.join(", ")}.`
      : "This is the final round.";

  const badgeLines = badges
    .filter((b) => b.badges.length > 0)
    .map((b) => `${b.player}: ${b.badges.join(", ")}`)
    .join("; ");

  return [
    `League: ${leagueName}. ${roundsPlayed} of ${totalRounds} rounds played, ${remaining} remaining.`,
    `Round just finished: ${roundName}. ${winnerNote}`,
    leaderChanged && leader
      ? `League leader changed this round — ${leader.name} is the new leader.`
      : null,
    `Current standings (after this round): ${standingLines}.`,
    marginNote,
    upcomingNote,
    historyLines ? `Previous round winners: ${historyLines}.` : null,
    badgeLines ? `Badges earned: ${badgeLines}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Generate banter for a round in both locales. AI when available, templated otherwise. */
export async function getBanter(
  input: BanterInput,
): Promise<{ en: string; pt: string; ai: boolean }> {
  const ai = await callGemini(buildPrompt(input));
  if (ai) return { en: ai.en, pt: ai.pt, ai: true };
  return {
    en: templatedBanter(input, "en"),
    pt: templatedBanter(input, "pt"),
    ai: false,
  };
}
