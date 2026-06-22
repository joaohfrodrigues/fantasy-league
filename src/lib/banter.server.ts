// Server-only: AI banter generation with rate limiting and per-round caching.
// Primary: Gemini Flash (free tier, configured via GOOGLE_AI_API_KEY).
// Fallback: templated banter derived from standings/badges.
import { consumeWindowLimit } from "./rate-limit.server";
import type { BadgeId } from "./badges";

const BANTER_PER_LEAGUE_MAX = 3;
const BANTER_PER_LEAGUE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const BANTER_GLOBAL_MAX = 100;
const BANTER_GLOBAL_WINDOW_MS = 60 * 60 * 1000;

// In-memory cache: banter per (leagueId, roundId) pair. Process-local, good enough.
const banterCache = new Map<string, string>();

export type BanterInput = {
  leagueId: string;
  roundId: string;
  leagueName: string;
  roundName: string;
  roundWinner: string | null;
  leader: string | null;
  lastPlace: string | null;
  badges: { player: string; badges: BadgeId[] }[];
  playerCount: number;
  roundsPlayed: number;
  totalRounds: number;
};

function templatedBanter(input: BanterInput): string {
  const { roundWinner, leader, lastPlace, badges, roundName, roundsPlayed, totalRounds } = input;
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
  if (!apiKey) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: "You are a ruthless fantasy football pundit — sharp, funny, no mercy. Praise whoever is winning, roast whoever is losing. Be specific about players by name. Keep it to 3 sentences max. No hashtags, no emojis, no filler like 'Alright folks'. Just the take.",
          },
        ],
      },
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.9,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function getBanter(input: BanterInput): Promise<{ text: string; ai: boolean }> {
  const cacheKey = `${input.leagueId}:${input.roundId}`;
  const cached = banterCache.get(cacheKey);
  if (cached) return { text: cached, ai: true };

  // Rate limit: per-league and global
  const leagueWait = consumeWindowLimit(
    `banter:league:${input.leagueId}`,
    BANTER_PER_LEAGUE_MAX,
    BANTER_PER_LEAGUE_WINDOW_MS,
  );
  const globalWait = consumeWindowLimit(
    "banter:global",
    BANTER_GLOBAL_MAX,
    BANTER_GLOBAL_WINDOW_MS,
  );
  const limited = leagueWait > 0 || globalWait > 0;

  if (!limited) {
    const prompt = buildPrompt(input);
    const aiText = await callGemini(prompt);
    if (aiText) {
      banterCache.set(cacheKey, aiText);
      return { text: aiText, ai: true };
    }
  }

  return { text: templatedBanter(input), ai: false };
}

function buildPrompt(input: BanterInput): string {
  const {
    leagueName,
    roundName,
    roundWinner,
    leader,
    lastPlace,
    badges,
    roundsPlayed,
    totalRounds,
  } = input;
  const remaining = totalRounds - roundsPlayed;
  const badgeLines = badges
    .filter((b) => b.badges.length > 0)
    .map((b) => `${b.player}: ${b.badges.join(", ")}`)
    .join("; ");

  return [
    `League: ${leagueName}. Round just finished: ${roundName}.`,
    roundWinner ? `Round winner: ${roundWinner}.` : "No clear round winner.",
    leader ? `Current overall leader: ${leader}.` : "",
    lastPlace ? `Last place: ${lastPlace}.` : "",
    badgeLines ? `Badges: ${badgeLines}.` : "",
    `${remaining} round${remaining === 1 ? "" : "s"} remaining.`,
    "Give me the pundit take.",
  ]
    .filter(Boolean)
    .join(" ");
}
