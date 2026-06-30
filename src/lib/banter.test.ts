import { describe, it, expect, vi, afterEach } from "vitest";
import { templatedBanter, getBanter, buildPrompt } from "./banter.server";
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
});
