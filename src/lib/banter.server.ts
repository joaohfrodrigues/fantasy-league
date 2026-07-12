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
  /** English text of recent prior generated summaries, oldest first — steers phrasing/tone variety. */
  priorSummaries: string[];
  /** Narrative devices (short tags) self-reported by prior AI generations — steers structural variety. */
  priorDevices: string[];
  /** Persona used for the most recently played round's AI banter, if any — excluded from this round's persona pick. */
  lastPersona: PersonaId | null;
  /** Players whose league rank changed between their previous counted round and this one. */
  positionChanges: { name: string; from: number; to: number }[];
  /** What the league leader needs to average per remaining round to keep a 90% chance of winning outright; null once every round is locked or the league has only one player. */
  pathToVictory: { requiredAverage: number; chaserName: string | null } | null;
  /** All-time high/low single-round scores across every played round so far (including this one), and whether this round set either record. */
  scoreRecords: {
    highest: { name: string; points: number; roundName: string };
    lowest: { name: string; points: number; roundName: string };
    newHigh: boolean;
    newLow: boolean;
  } | null;
};

export type BanterLocale = "en" | "pt";

const FALLBACK_TEMPLATES: Record<
  BanterLocale,
  {
    onFireWinner: ((p: string) => string)[];
    winner: ((p: string, r: string) => string)[];
    bottler: ((p: string) => string)[];
    lastPlace: ((p: string) => string)[];
    leaderRemaining: ((p: string, n: number) => string)[];
    leaderDone: ((p: string) => string)[];
    ghost: ((p: string) => string)[];
    fallback: ((r: string) => string)[];
  }
> = {
  en: {
    onFireWinner: [
      (p) => `${p} is absolutely on fire — back-to-back rounds dominated.`,
      (p) => `${p} is unstoppable right now — another round, another statement.`,
      (p) => `${p} just won't stop winning — this is starting to look inevitable.`,
    ],
    winner: [
      (p, r) => `${p} takes ${r} — clean result, no arguments.`,
      (p, r) => `${p} claims ${r} — straightforward, no drama.`,
      (p, r) => `${p} walks away with ${r} — job done.`,
    ],
    bottler: [
      (p) => `${p} is in freefall — someone call a rescue team.`,
      (p) => `${p} is cratering fast — this is turning into a horror show.`,
      (p) => `${p} can't buy a good round right now — the wheels are off.`,
    ],
    lastPlace: [
      (p) => `${p} at the bottom — dinner's looking expensive from here.`,
      (p) => `${p} props up the table — someone's paying for drinks.`,
      (p) => `${p} is rock bottom — the view from last place isn't pretty.`,
    ],
    leaderRemaining: [
      (p, n) => `${p} leads with ${n} round${n === 1 ? "" : "s"} left — not safe yet.`,
      (p, n) => `${p} is out front with ${n} round${n === 1 ? "" : "s"} to go — nothing's decided.`,
      (p, n) =>
        `${p} holds top spot with ${n} round${n === 1 ? "" : "s"} remaining — still all to play for.`,
    ],
    leaderDone: [
      (p) => `${p} wins the prize — well played.`,
      (p) => `${p} takes the title — fully deserved.`,
      (p) => `${p} seals it — game over, well earned.`,
    ],
    ghost: [
      (p) => `${p} hasn't scored a point yet. Remarkable commitment to losing.`,
      (p) => `${p} is still stuck on zero. Impressive dedication to the cause.`,
      (p) => `${p} has yet to trouble the scoreboard. A statement of sorts.`,
    ],
    fallback: [
      (r) => `${r} done. The standings don't lie.`,
      (r) => `${r} is in the books. The table has spoken.`,
      (r) => `${r} wraps up. Numbers don't care about feelings.`,
    ],
  },
  pt: {
    onFireWinner: [
      (p) => `${p} está a arrasar — rondas seguidas dominadas.`,
      (p) => `${p} está imparável — mais uma ronda, mais uma afirmação.`,
      (p) => `${p} não pára de ganhar — isto já parece inevitável.`,
    ],
    winner: [
      (p, r) => `${p} arrecada ${r} — resultado limpo, sem discussão.`,
      (p, r) => `${p} fica com ${r} — direto, sem drama.`,
      (p, r) => `${p} leva ${r} — trabalho feito.`,
    ],
    bottler: [
      (p) => `${p} está em queda livre — chamem uma equipa de resgate.`,
      (p) => `${p} está a afundar-se depressa — isto já é um filme de terror.`,
      (p) => `${p} não consegue comprar uma boa ronda — as rodas soltaram-se.`,
    ],
    lastPlace: [
      (p) => `${p} na cauda — o jantar está a ficar caro a partir daqui.`,
      (p) => `${p} sustenta a tabela — alguém vai pagar as bebidas.`,
      (p) => `${p} está no fundo do poço — a vista lá de baixo não é famosa.`,
    ],
    leaderRemaining: [
      (p, n) =>
        `${p} lidera com ${n} ronda${n === 1 ? "" : "s"} por jogar — ainda não está seguro.`,
      (p, n) =>
        `${p} vai à frente com ${n} ronda${n === 1 ? "" : "s"} por disputar — nada está decidido.`,
      (p, n) =>
        `${p} segura o topo com ${n} ronda${n === 1 ? "" : "s"} restante${n === 1 ? "" : "s"} — tudo em aberto.`,
    ],
    leaderDone: [
      (p) => `${p} ganha o prémio — bem jogado.`,
      (p) => `${p} conquista o título — bem merecido.`,
      (p) => `${p} sela o campeonato — fim de jogo, bem merecido.`,
    ],
    ghost: [
      (p) => `${p} ainda não marcou um único ponto. Notável dedicação a perder.`,
      (p) => `${p} continua a zero. Impressionante dedicação à causa.`,
      (p) => `${p} ainda não incomodou a tabela. Uma declaração e tanto.`,
    ],
    fallback: [
      (r) => `${r} terminada. A classificação não mente.`,
      (r) => `${r} fica arrumada. A tabela falou.`,
      (r) => `${r} fecha o capítulo. Números não têm sentimentos.`,
    ],
  },
};

function pick<T>(variants: T[], rand: () => number): T {
  return variants[Math.floor(rand() * variants.length)];
}

export function templatedBanter(
  input: BanterInput,
  locale: BanterLocale,
  rand: () => number = Math.random,
): string {
  const { roundWinner, standings, badges, roundName, roundsPlayed, totalRounds } = input;
  const leader = standings[0]?.name ?? null;
  const lastPlace = standings[standings.length - 1]?.name ?? null;
  const remaining = totalRounds - roundsPlayed;

  const onFire = badges.find((b) => b.badges.includes("onFire"));
  const bottler = badges.find((b) => b.badges.includes("bottler"));
  const ghost = badges.find((b) => b.badges.includes("ghost"));

  const tpl = FALLBACK_TEMPLATES[locale];
  const parts: string[] = [];

  if (roundWinner) {
    parts.push(
      onFire && onFire.player === roundWinner
        ? pick(tpl.onFireWinner, rand)(roundWinner)
        : pick(tpl.winner, rand)(roundWinner, roundName),
    );
  }

  if (bottler) {
    parts.push(pick(tpl.bottler, rand)(bottler.player));
  } else if (lastPlace && lastPlace !== roundWinner) {
    parts.push(pick(tpl.lastPlace, rand)(lastPlace));
  }

  if (leader && remaining > 0) {
    parts.push(pick(tpl.leaderRemaining, rand)(leader, remaining));
  } else if (leader && remaining === 0) {
    parts.push(pick(tpl.leaderDone, rand)(leader));
  }

  if (ghost) {
    parts.push(pick(tpl.ghost, rand)(ghost.player));
  }

  return parts.slice(0, 3).join(" ") || pick(tpl.fallback, rand)(roundName);
}

export type PersonaId = "ruthless-pundit" | "hype-mc" | "deadpan-stats-nerd" | "tabloid-dramatist";

export const PERSONAS: { id: PersonaId; voice: string }[] = [
  {
    id: "ruthless-pundit",
    voice: "You are a ruthless fantasy football pundit — sharp, funny, no mercy.",
  },
  {
    id: "hype-mc",
    voice:
      "You are a boxing-ring hype MC — over-the-top, breathless, treating every round result like a title fight.",
  },
  {
    id: "deadpan-stats-nerd",
    voice:
      "You are a deadpan stats analyst — dry, clinical, minimal adjectives, letting the brutal numbers do the talking.",
  },
  {
    id: "tabloid-dramatist",
    voice:
      "You are a tabloid gossip columnist — soap-opera framing, treating table positions like scandal and betrayal.",
  },
];

/** Randomly picks a persona, excluding the immediately previous round's persona (if any) so the voice doesn't repeat back-to-back. */
export function pickPersona(
  lastPersona: PersonaId | null,
  rand: () => number = Math.random,
): PersonaId {
  const candidates = PERSONAS.filter((p) => p.id !== lastPersona);
  const pool = candidates.length > 0 ? candidates : PERSONAS;
  return pick(pool, rand).id;
}

const LENGTH_HINTS = [
  "Keep it to exactly 2 sentences — tight and punchy.",
  "Write exactly 3 sentences — the default pace.",
  "Write up to 4 sentences — a bit more colour and detail than usual.",
];

/** Randomly picks a length/shape instruction for this round's AI generation. No repeat-avoidance — low stakes if it repeats. */
export function pickLengthHint(rand: () => number = Math.random): string {
  return pick(LENGTH_HINTS, rand);
}

export type GeminiVoice = { personaVoice: string; lengthHint: string };

export type GeminiCaller = (
  prompt: string,
  voice: GeminiVoice,
) => Promise<{ en: string; pt: string; devices: string[] } | null>;

async function defaultCallGemini(
  prompt: string,
  voice: GeminiVoice,
): Promise<{ en: string; pt: string; devices: string[] } | null> {
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
              voice.personaVoice,
              "You write a short post-round summary for a private league of friends.",
              "Rules:",
              "- Name the round winner and their score. If a round prize is listed, mention it once as a reward they earned — it is a positive thing, not a penalty.",
              "- Contrast the overall league leader's win probability against the closest challenger — use the point margin and the % to win.",
              "- Name and roast the last-place player.",
              "- If the league leader changed this round, call it out as a notable moment.",
              "- If upcoming rounds are listed, reference the next one to frame what's at stake.",
              "- If badges are listed (onFire, onRise, bottler, ghost), weave them in naturally.",
              "- If position changes are listed, call out the biggest riser or faller by name.",
              "- If a 'needs to average' figure is given, state it as a concrete target the leader must hit.",
              "- If a new all-time high or low score is mentioned, treat it as the headline moment of the round.",
              `- ${voice.lengthHint} No hashtags, no emojis, no filler like 'Alright folks' or 'Well well well'. Just the take, in character.`,
              "- You may be shown up to 3 previous round summaries and a list of narrative devices already used recently.",
              "  Pick a different angle, joke, and phrasing this round — do not reuse them. Never mention that you're avoiding repetition or refer to previous rounds' commentary.",
              "Output JSON with three fields: 'en' (British English), 'pt' (European Portuguese, pt-PT — informal, expressive, idiomatically natural; not Brazilian Portuguese, not a literal translation of the English), and 'devices' — a short array (1-4 items) of kebab-case tags naming the narrative angles you used this round (e.g. 'leader-change-callout', 'last-place-roast', 'prize-mention', 'win-probability-comparison', 'badge-callout', 'next-round-teaser', 'position-change-callout', 'path-to-victory-target', 'record-score-callout').",
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
          properties: {
            en: { type: "STRING" },
            pt: { type: "STRING" },
            devices: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["en", "pt", "devices"],
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
    const parsed = JSON.parse(raw) as { en?: string; pt?: string; devices?: string[] };
    const en = parsed.en?.trim();
    const pt = parsed.pt?.trim();
    if (!en || !pt) {
      console.warn("[banter] Gemini response missing en/pt — using templated fallback");
      return null;
    }
    const devices = Array.isArray(parsed.devices)
      ? parsed.devices.filter((d): d is string => typeof d === "string" && d.length > 0)
      : [];
    return { en, pt, devices };
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
    priorSummaries,
    priorDevices,
    positionChanges,
    pathToVictory,
    scoreRecords,
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

  const positionChangeLines = positionChanges
    .map((c) => `${c.name} ${c.from > c.to ? "climbed" : "dropped"} from #${c.from} to #${c.to}`)
    .join("; ");

  const pathToVictoryNote =
    pathToVictory && leader
      ? `To keep a 90% chance of winning outright, ${leader.name} needs to average at least ${Math.round(pathToVictory.requiredAverage)} points per remaining round${pathToVictory.chaserName ? ` (benchmarked against ${pathToVictory.chaserName}'s pace)` : ""}.`
      : null;

  const recordNote =
    scoreRecords && (scoreRecords.newHigh || scoreRecords.newLow)
      ? [
          scoreRecords.newHigh
            ? `${scoreRecords.highest.name}'s ${scoreRecords.highest.points} this round is a new all-time high score for this league.`
            : null,
          scoreRecords.newLow
            ? `${scoreRecords.lowest.name}'s ${scoreRecords.lowest.points} this round is a new all-time low score for this league.`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;

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
    positionChangeLines ? `League position changes this round: ${positionChangeLines}.` : null,
    pathToVictoryNote,
    recordNote,
    priorSummaries.length > 0
      ? `Previous banter (avoid repeating these jokes/phrasing): ${priorSummaries.map((s, i) => `${i + 1}) ${s}`).join(" ")}`
      : null,
    priorDevices.length > 0
      ? `Narrative angles already used recently — pick a different one this round: ${priorDevices.join(", ")}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generate banter for a round in both locales. AI when available, templated
 * otherwise. `callGemini` is accepted rather than hardcoded so the AI-fails ->
 * templated-fallback path is directly testable with a fake caller, not only
 * via `fetch` mocking. `rand` is accepted for the same reason: it drives
 * persona pick, length hint, and fallback phrasing selection.
 */
export async function getBanter(
  input: BanterInput,
  callGemini: GeminiCaller = defaultCallGemini,
  rand: () => number = Math.random,
): Promise<{ en: string; pt: string; ai: boolean; devices: string[]; persona: PersonaId | null }> {
  const persona = pickPersona(input.lastPersona, rand);
  const personaVoice = PERSONAS.find((p) => p.id === persona)!.voice;
  const lengthHint = pickLengthHint(rand);
  const ai = await callGemini(buildPrompt(input), { personaVoice, lengthHint });
  if (ai) return { en: ai.en, pt: ai.pt, ai: true, devices: ai.devices, persona };
  return {
    en: templatedBanter(input, "en", rand),
    pt: templatedBanter(input, "pt", rand),
    ai: false,
    devices: [],
    persona: null,
  };
}
