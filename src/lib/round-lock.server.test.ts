import { describe, it, expect, vi, afterEach } from "vitest";
import { onRoundLocked } from "./round-lock.server";
import type { AdminClient } from "./leagues.functions";

type Fixtures = {
  league?: { id: string; name: string; tiebreak: string } | null;
  rounds?: {
    id: string;
    name: string;
    short: string;
    locked_at: string | null;
    display_order: number;
    summary_en: string | null;
    banter_devices: string[] | null;
    banter_persona: string | null;
  }[];
  players?: { id: string; name: string; display_order: number; round_prize: string }[];
  scores?: { player_id: string; round_id: string; points: number }[];
  onUpdate?: (payload: unknown) => void;
};

function makeAdmin(fixtures: Fixtures): AdminClient {
  const admin = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => Promise.resolve({ data: fixtures.scores ?? [] }),
        order: () => {
          if (table === "rounds") return Promise.resolve({ data: fixtures.rounds ?? [] });
          if (table === "players") return Promise.resolve({ data: fixtures.players ?? [] });
          return Promise.resolve({ data: [] });
        },
        maybeSingle: () => Promise.resolve({ data: fixtures.league ?? null }),
        update: (payload: unknown) => {
          fixtures.onUpdate?.(payload);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
      return builder;
    },
  };
  return admin as unknown as AdminClient;
}

const baseFixtures: Fixtures = {
  league: { id: "l1", name: "The Gaffer's Cup", tiebreak: "total" },
  rounds: [
    {
      id: "r1",
      name: "Round 1",
      short: "1",
      locked_at: "2026-01-01T00:00:00.000Z",
      display_order: 0,
      summary_en: null,
      banter_devices: null,
      banter_persona: null,
    },
    {
      id: "r2",
      name: "Round 2",
      short: "2",
      locked_at: "2026-01-08T00:00:00.000Z",
      display_order: 1,
      summary_en: null,
      banter_devices: null,
      banter_persona: null,
    },
  ],
  players: [
    { id: "p1", name: "Alice", display_order: 0, round_prize: "🍺" },
    { id: "p2", name: "Bob", display_order: 1, round_prize: "🍺" },
  ],
  scores: [
    { player_id: "p1", round_id: "r1", points: 50 },
    { player_id: "p2", round_id: "r1", points: 30 },
    { player_id: "p1", round_id: "r2", points: 40 },
    { player_id: "p2", round_id: "r2", points: 60 },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("onRoundLocked", () => {
  it("persists banter for the locked round and reports the templated fallback path", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    type Persisted = { summary_en: string | null; summary_pt: string | null };
    const persisted: { current: Persisted | null } = { current: null };
    const admin = makeAdmin({
      ...baseFixtures,
      onUpdate: (payload) => {
        persisted.current = payload as Persisted;
      },
    });

    const result = await onRoundLocked(admin, "l1", "r2");

    expect(result).toEqual({ usedAi: false });
    expect(persisted.current?.summary_en).toContain("Bob");
  });

  it("returns null when the league has no rounds or players yet", async () => {
    const admin = makeAdmin({ league: { id: "l1", name: "Empty League", tiebreak: "total" } });
    const result = await onRoundLocked(admin, "l1", "r1");
    expect(result).toBeNull();
  });

  it("returns null when the round id doesn't match any fetched round", async () => {
    const admin = makeAdmin(baseFixtures);
    const result = await onRoundLocked(admin, "l1", "not-a-real-round");
    expect(result).toBeNull();
  });

  it("propagates a persistence failure rather than swallowing it", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    const admin = makeAdmin({
      ...baseFixtures,
      onUpdate: () => {
        throw new Error("DB_ERROR");
      },
    });
    await expect(onRoundLocked(admin, "l1", "r2")).rejects.toThrow("DB_ERROR");
  });

  it("computes position evolution, path-to-victory, and score records without throwing across a rank swap", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    type Persisted = { summary_en: string | null; summary_pt: string | null };
    const persisted: { current: Persisted | null } = { current: null };
    const admin = makeAdmin({
      league: { id: "l1", name: "The Gaffer's Cup", tiebreak: "total" },
      rounds: [
        {
          id: "r1",
          name: "Round 1",
          short: "1",
          locked_at: "2026-01-01T00:00:00.000Z",
          display_order: 0,
          summary_en: null,
          banter_devices: null,
          banter_persona: null,
        },
        {
          id: "r2",
          name: "Round 2",
          short: "2",
          locked_at: "2026-01-08T00:00:00.000Z",
          display_order: 1,
          summary_en: null,
          banter_devices: null,
          banter_persona: null,
        },
        {
          id: "r3",
          name: "Round 3",
          short: "3",
          locked_at: "2026-01-15T00:00:00.000Z",
          display_order: 2,
          summary_en: null,
          banter_devices: null,
          banter_persona: null,
        },
      ],
      players: [
        { id: "p1", name: "Alice", display_order: 0, round_prize: "🍺" },
        { id: "p2", name: "Bob", display_order: 1, round_prize: "🍺" },
      ],
      // Bob leads after Round 1, Alice overtakes in Round 3 — a rank swap for
      // position evolution to pick up. Alice's Round 3 score is also a new
      // league-high for score records to flag.
      scores: [
        { player_id: "p1", round_id: "r1", points: 30 },
        { player_id: "p2", round_id: "r1", points: 50 },
        { player_id: "p1", round_id: "r2", points: 20 },
        { player_id: "p2", round_id: "r2", points: 20 },
        { player_id: "p1", round_id: "r3", points: 99 },
        { player_id: "p2", round_id: "r3", points: 10 },
      ],
      onUpdate: (payload) => {
        persisted.current = payload as Persisted;
      },
    });

    const result = await onRoundLocked(admin, "l1", "r3");

    expect(result).toEqual({ usedAi: false });
    expect(persisted.current?.summary_en).toContain("Alice");
  });
});
