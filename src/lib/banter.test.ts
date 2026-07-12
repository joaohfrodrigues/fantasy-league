import { describe, it, expect, vi, afterEach } from "vitest";
import {
  templatedBanter,
  getBanter,
  buildPrompt,
  pickPersona,
  pickLengthHint,
  PERSONAS,
} from "./banter.server";
import type { BanterInput } from "./banter.server";

const base: BanterInput = {
  leagueId: "l1",
  roundId: "r3",
  leagueName: "The Gaffer's Cup",
  roundName: "Round 3",
  roundWinner: "Alice",
  roundPrize: "🍺",
  standings: [
    { name: "Alice", total: 150, rank: 1, prob: 0.55, wins: 2, roundScore: 60 },
    { name: "Bob", total: 130, rank: 2, prob: 0.3, wins: 1, roundScore: 40 },
    { name: "Carlos", total: 80, rank: 3, prob: 0.15, wins: 0, roundScore: 20 },
  ],
  recentRounds: [
    { roundName: "Round 1", winner: "Bob" },
    { roundName: "Round 2", winner: "Alice" },
    { roundName: "Round 3", winner: "Alice" },
  ],
  upcomingRounds: ["Quarter Final", "Semi Final", "Final"],
  badges: [{ player: "Alice", badges: ["onFire"] }],
  roundsPlayed: 3,
  totalRounds: 6,
  leaderChanged: false,
  priorSummaries: [],
  priorDevices: [],
  lastPersona: null,
  positionChanges: [],
  pathToVictory: null,
  scoreRecords: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("templatedBanter", () => {
  it("returns English banter referencing the round winner", () => {
    const text = templatedBanter(base, "en");
    expect(text).toContain("Alice");
  });

  it("returns Portuguese banter with the winner name", () => {
    const text = templatedBanter(base, "pt");
    expect(text).toContain("Alice");
  });

  it("includes leader when rounds remain", () => {
    const text = templatedBanter(base, "en");
    expect(text).toContain("Alice");
  });

  it("falls back gracefully when no winner and no badges", () => {
    const input: BanterInput = {
      ...base,
      roundWinner: null,
      badges: [],
      standings: [{ name: "Alice", total: 100, rank: 1, prob: 0.8, wins: 1, roundScore: null }],
    };
    const text = templatedBanter(input, "en");
    expect(text.length).toBeGreaterThan(0);
  });

  it("picks different phrasing variants depending on the injected random source", () => {
    const low = templatedBanter(base, "en", () => 0);
    const high = templatedBanter(base, "en", () => 0.99);
    expect(low).not.toBe(high);
    expect(low).toContain("Alice");
    expect(high).toContain("Alice");
  });
});

describe("pickPersona", () => {
  it("excludes the last-used persona from the pool", () => {
    for (const persona of PERSONAS) {
      const picked = pickPersona(persona.id, () => 0.99);
      expect(picked).not.toBe(persona.id);
    }
  });

  it("picks from the full pool when there is no last persona", () => {
    const picked = pickPersona(null, () => 0);
    expect(picked).toBe(PERSONAS[0].id);
  });
});

describe("pickLengthHint", () => {
  it("returns one of the defined length hints", () => {
    const hint = pickLengthHint(() => 0.5);
    expect(typeof hint).toBe("string");
    expect(hint.length).toBeGreaterThan(0);
  });
});

describe("buildPrompt", () => {
  it("includes the round winner", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Round 3");
  });

  it("includes round win counts in standings", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("2 round wins");
    expect(prompt).toContain("0 round wins");
  });

  it("includes per-player round scores", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("scored 60 this round");
    expect(prompt).toContain("scored 20 this round");
  });

  it("includes the leader margin", () => {
    const prompt = buildPrompt(base);
    // Alice 150 - Bob 130 = 20 points ahead
    expect(prompt).toContain("Alice leads Bob by 20 points");
  });

  it("includes win probability percentages", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("55% to win");
    expect(prompt).toContain("30% to win");
  });

  it("includes previous round history (excluding the current round)", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("Round 1: Bob");
    expect(prompt).toContain("Round 2: Alice");
    // current round should not appear in history
    expect(prompt).not.toMatch(/Previous round winners:.*Round 3/);
  });

  it("includes badges when present", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("Alice: onFire");
  });

  it("omits history section when only one round played", () => {
    const input: BanterInput = {
      ...base,
      recentRounds: [{ roundName: "Round 1", winner: "Alice" }],
      roundsPlayed: 1,
    };
    const prompt = buildPrompt(input);
    expect(prompt).not.toContain("Previous round winners");
  });

  it("omits badges section when no badges earned", () => {
    const input: BanterInput = { ...base, badges: [] };
    const prompt = buildPrompt(input);
    expect(prompt).not.toContain("Badges earned");
  });

  it("includes the round prize in the winner line", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("round prize: 🍺");
  });

  it("omits prize mention when roundPrize is null", () => {
    const prompt = buildPrompt({ ...base, roundPrize: null });
    expect(prompt).not.toContain("round prize");
  });

  it("includes upcoming round names", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("Next rounds: Quarter Final, Semi Final, Final");
  });

  it("shows final-round note when no upcoming rounds remain", () => {
    const prompt = buildPrompt({ ...base, upcomingRounds: [] });
    expect(prompt).toContain("This is the final round");
  });

  it("calls out leader change when leaderChanged is true", () => {
    const prompt = buildPrompt({ ...base, leaderChanged: true });
    expect(prompt).toContain("League leader changed this round");
    expect(prompt).toContain("Alice is the new leader");
  });

  it("omits leader-change note when leaderChanged is false", () => {
    const prompt = buildPrompt(base);
    expect(prompt).not.toContain("League leader changed");
  });

  it("includes prior round summaries when present", () => {
    const prompt = buildPrompt({
      ...base,
      priorSummaries: ["Alice cruises to victory again.", "Bob's collapse continues."],
    });
    expect(prompt).toContain("Alice cruises to victory again.");
    expect(prompt).toContain("Bob's collapse continues.");
    expect(prompt).toContain("Previous banter");
  });

  it("omits prior summaries section when none are given", () => {
    const prompt = buildPrompt(base);
    expect(prompt).not.toContain("Previous banter");
  });

  it("includes prior narrative devices when present", () => {
    const prompt = buildPrompt({
      ...base,
      priorDevices: ["leader-change-callout", "last-place-roast"],
    });
    expect(prompt).toContain("leader-change-callout");
    expect(prompt).toContain("last-place-roast");
    expect(prompt).toContain("already used");
  });

  it("omits devices section when none are given", () => {
    const prompt = buildPrompt(base);
    expect(prompt).not.toContain("already used");
  });

  it("includes position changes when present", () => {
    const prompt = buildPrompt({
      ...base,
      positionChanges: [{ name: "Carlos", from: 3, to: 1 }],
    });
    expect(prompt).toContain("Carlos climbed from #3 to #1");
  });

  it("omits position changes section when none are given", () => {
    const prompt = buildPrompt(base);
    expect(prompt).not.toContain("position changes");
  });

  it("includes the path-to-victory target when present", () => {
    const prompt = buildPrompt({
      ...base,
      pathToVictory: { requiredAverage: 42.4, chaserName: "Bob" },
    });
    expect(prompt).toContain("Alice needs to average at least 42 points per remaining round");
    expect(prompt).toContain("Bob's pace");
  });

  it("omits the path-to-victory note when null", () => {
    const prompt = buildPrompt(base);
    expect(prompt).not.toContain("needs to average");
  });

  it("includes a new all-time high/low score note when flagged", () => {
    const prompt = buildPrompt({
      ...base,
      scoreRecords: {
        highest: { name: "Alice", points: 99, roundName: "Round 3" },
        lowest: { name: "Carlos", points: 5, roundName: "Round 1" },
        newHigh: true,
        newLow: false,
      },
    });
    expect(prompt).toContain("Alice's 99 this round is a new all-time high score");
    expect(prompt).not.toContain("new all-time low score");
  });

  it("omits the record note when neither record was broken this round", () => {
    const prompt = buildPrompt({
      ...base,
      scoreRecords: {
        highest: { name: "Alice", points: 99, roundName: "Round 1" },
        lowest: { name: "Carlos", points: 5, roundName: "Round 1" },
        newHigh: false,
        newLow: false,
      },
    });
    expect(prompt).not.toContain("all-time high");
    expect(prompt).not.toContain("all-time low");
  });
});

describe("getBanter", () => {
  it("falls back to templated when GOOGLE_AI_API_KEY is not set", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    const result = await getBanter(base);
    expect(result.ai).toBe(false);
    expect(result.en.length).toBeGreaterThan(0);
    expect(result.pt.length).toBeGreaterThan(0);
  });

  it("returns ai:true and { en, pt } when Gemini succeeds", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ en: "Great round!", pt: "Que ronda!" }) }],
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );
    const result = await getBanter(base);
    expect(result.ai).toBe(true);
    expect(result.en).toBe("Great round!");
    expect(result.pt).toBe("Que ronda!");
  });

  it("returns devices reported by Gemini, defaulting to [] when absent", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  en: "Great round!",
                  pt: "Que ronda!",
                  devices: ["leader-change-callout", "last-place-roast"],
                }),
              },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => mockResponse }));
    const result = await getBanter(base);
    expect(result.devices).toEqual(["leader-change-callout", "last-place-roast"]);
  });

  it("returns devices: [] for the templated fallback", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    const result = await getBanter(base);
    expect(result.devices).toEqual([]);
  });

  it("falls back to templated when Gemini returns a non-ok response", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      }),
    );
    const result = await getBanter(base);
    expect(result.ai).toBe(false);
    expect(result.en.length).toBeGreaterThan(0);
  });

  it("falls back to templated when Gemini returns malformed JSON", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: "not json" }] } }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );
    const result = await getBanter(base);
    expect(result.ai).toBe(false);
  });

  it("falls back to templated when Gemini JSON is missing pt field", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ en: "Only English" }) }] } }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );
    const result = await getBanter(base);
    expect(result.ai).toBe(false);
  });

  it("sends standings, winner, and badges in the Gemini request body", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ en: "Sharp take.", pt: "Análise afiada." }) }],
          },
        },
      ],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", mockFetch);

    await getBanter(base);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("2 round wins");
    expect(prompt).toContain("scored 60 this round");
    expect(prompt).toContain("Alice leads Bob by 20 points");
    expect(prompt).toContain("round prize: 🍺");
    expect(prompt).toContain("Next rounds: Quarter Final, Semi Final, Final");
    expect(prompt).toContain("Alice: onFire");
  });

  it("requests a devices field in the response schema", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ en: "x", pt: "y" }) }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getBanter(base);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      generationConfig: { responseSchema: { properties: Record<string, unknown> } };
    };
    expect(body.generationConfig.responseSchema.properties).toHaveProperty("devices");
  });

  it("propagates an injected Gemini caller's rejection (getBanter itself never swallows errors)", async () => {
    const failingCaller = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(getBanter(base, failingCaller)).rejects.toThrow("network down");
  });

  it("returns ai:true using an injected Gemini caller, bypassing fetch entirely", async () => {
    const fakeCaller = vi.fn().mockResolvedValue({
      en: "Injected take.",
      pt: "Análise injetada.",
      devices: ["prize-mention"],
    });
    const result = await getBanter(base, fakeCaller, () => 0);
    expect(fakeCaller).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      en: "Injected take.",
      pt: "Análise injetada.",
      ai: true,
      devices: ["prize-mention"],
      persona: "ruthless-pundit",
    });
  });

  it("falls back to templated using an injected Gemini caller that resolves null", async () => {
    const fakeCaller = vi.fn().mockResolvedValue(null);
    const result = await getBanter(base, fakeCaller);
    expect(result.ai).toBe(false);
    expect(result.en.length).toBeGreaterThan(0);
    expect(result.persona).toBeNull();
  });

  it("passes a persona voice and length hint to the Gemini caller, excluding lastPersona", async () => {
    const fakeCaller = vi.fn().mockResolvedValue({ en: "x", pt: "y", devices: [] });
    await getBanter({ ...base, lastPersona: "ruthless-pundit" }, fakeCaller, () => 0);

    const [, voice] = fakeCaller.mock.calls[0];
    expect(voice.personaVoice).not.toContain("ruthless fantasy football pundit");
    expect(typeof voice.lengthHint).toBe("string");
    expect(voice.lengthHint.length).toBeGreaterThan(0);
  });

  it("includes prior summaries and devices in the Gemini prompt when present", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ en: "x", pt: "y" }) }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getBanter({
      ...base,
      priorSummaries: ["Alice cruises to victory again."],
      priorDevices: ["leader-change-callout"],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      contents: { parts: { text: string }[] }[];
    };
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("Alice cruises to victory again.");
    expect(prompt).toContain("leader-change-callout");
  });
});
