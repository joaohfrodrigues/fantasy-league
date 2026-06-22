// Server-only: AI banter generation for round summaries.
// Called once when a round is locked; result is stored in rounds.summary.
// Primary: Gemini 2.0 Flash Lite (GOOGLE_AI_API_KEY). Fallback: templated text.
import type { BadgeId } from "./badges";

export type BanterInput = {
  leagueId: string;
  roundId: string;
  leagueName: string;
  roundName: string;
  roundWinner: string | null;
  /** Full current standings after this round, sorted by rank. */
  standings: { name: string; total: number; rank: number; prob: number }[];
  /** All rounds played so far, newest last. */
  recentRounds: { roundName: string; winner: string | null }[];
  badges: { player: string; badges: BadgeId[] }[];
  roundsPlayed: number;
  totalRounds: number;
};

export function templatedBanter(input: BanterInput): string {
  const { roundWinner, standings, badges, roundName, roundsPlayed, totalRounds } = input;
  const leader = standings[0]?.name ?? null;
  const lastPlace = standings[standings.length - 1]?.name ?? null;
  const remaining = totalRounds - roundsPlayed;

  const onFire = badges.find((b) => b.badges.includes("onFire"));
  const bottler = badges.find((b) => b.badges.includes("bottler"));
  const ghost = badges.find((b) => b.badges.includes("ghost"));

  const parts: string[] = [];

  if (roundWinner) {
    if (onFire && onFire.player === roundWinner) {
      parts.push(`${roundWinner} is absolutely on fire — back-to-back rounds dominated.`);
    } else {
      parts.push(`${roundWinner} takes ${roundName} — clean result, no arguments.`);
    }
  }

  if (bottler) {
    parts.push(`${bottler.player} is in freefall — someone call a rescue team.`);
  } else if (lastPlace && lastPlace !== roundWinner) {
    parts.push(`${lastPlace} at the bottom — dinner's looking expensive from here.`);
  }

  if (leader && remaining > 0) {
    parts.push(
      `${leader} leads with ${remaining} round${remaining === 1 ? "" : "s"} left — not safe yet.`,
    );
  } else if (leader && remaining === 0) {
    parts.push(`${leader} wins the prize — well played.`);
  }

  if (ghost) {
    parts.push(`${ghost.player} hasn't scored a point yet. Remarkable commitment to losing.`);
  }

  return parts.slice(0, 3).join(" ") || `${roundName} done. The standings don't lie.`;
}

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[banter] GOOGLE_AI_API_KEY not set — using templated fallback");
    return null;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: "You are a ruthless fantasy football pundit — sharp, funny, no mercy. You write a short post-round summary for a league of friends. Praise whoever is winning, roast whoever is losing. Be specific about players by name. Keep it to 3 sentences max. No hashtags, no emojis, no filler like 'Alright folks'. Just the pundit take.",
          },
        ],
      },
      generationConfig: { maxOutputTokens: 150, temperature: 0.9 },
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
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) console.warn("[banter] Gemini returned no text — using templated fallback");
    return text || null;
  } catch (err) {
    console.error("[banter] Gemini call threw:", err);
    return null;
  }
}

function buildPrompt(input: BanterInput): string {
  const {
    leagueName,
    roundName,
    roundWinner,
    standings,
    recentRounds,
    badges,
    roundsPlayed,
    totalRounds,
  } = input;
  const remaining = totalRounds - roundsPlayed;

  const standingLines = standings
    .map((s) => `#${s.rank} ${s.name} — ${s.total} pts (${Math.round(s.prob * 100)}% to win)`)
    .join("; ");

  const historyLines =
    recentRounds.length > 1
      ? recentRounds
          .slice(0, -1)
          .map((r) => `${r.roundName}: ${r.winner ?? "no winner"}`)
          .join(", ")
      : null;

  const badgeLines = badges
    .filter((b) => b.badges.length > 0)
    .map((b) => `${b.player}: ${b.badges.join(", ")}`)
    .join("; ");

  return [
    `League: ${leagueName}. ${roundsPlayed} of ${totalRounds} rounds played, ${remaining} remaining.`,
    `Round just finished: ${roundName}. Winner: ${roundWinner ?? "none"}.`,
    `Current standings: ${standingLines}.`,
    historyLines ? `Previous rounds: ${historyLines}.` : null,
    badgeLines ? `Badges this round: ${badgeLines}.` : null,
    "Write the post-round pundit take, focusing on this round's result and overall standings.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Generate banter for a round. Returns AI text when available, templated fallback otherwise. */
export async function getBanter(input: BanterInput): Promise<{ text: string; ai: boolean }> {
  const aiText = await callGemini(buildPrompt(input));
  if (aiText) return { text: aiText, ai: true };
  return { text: templatedBanter(input), ai: false };
}
