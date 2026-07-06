import { describe, it, expect, vi, afterEach } from "vitest";
import type { AdminClient } from "./leagues.functions";

type Fixtures = {
  league?: { id: string; name: string; tiebreak: string } | null;
  rounds?: { id: string; short: string; locked_at: string | null; display_order: number }[];
  players?: { id: string; name: string; display_order: number }[];
  scores?: { player_id: string; round_id: string; points: number }[];
};

function makeAdmin(fixtures: Fixtures): AdminClient {
  const admin = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => {
          if (table === "rounds") return Promise.resolve({ data: fixtures.rounds ?? [] });
          if (table === "players") return Promise.resolve({ data: fixtures.players ?? [] });
          return Promise.resolve({ data: [] });
        },
        in: () => Promise.resolve({ data: fixtures.scores ?? [] }),
        maybeSingle: () => Promise.resolve({ data: fixtures.league ?? null }),
      };
      return builder;
    },
  };
  return admin as unknown as AdminClient;
}

const baseFixtures: Fixtures = {
  league: { id: "l1", name: "The Gaffer's Cup", tiebreak: "total" },
  rounds: [
    { id: "r1", short: "1", locked_at: "2026-01-01T00:00:00.000Z", display_order: 0 },
    { id: "r2", short: "2", locked_at: null, display_order: 1 },
  ],
  players: [
    { id: "p1", name: "Alice", display_order: 0 },
    { id: "p2", name: "Bob", display_order: 1 },
  ],
  scores: [
    { player_id: "p1", round_id: "r1", points: 50 },
    { player_id: "p2", round_id: "r1", points: 30 },
  ],
};

async function loadHandler(fixtures: Fixtures) {
  vi.resetModules();
  vi.doMock("@/integrations/supabase/client.server", () => ({
    supabaseAdmin: makeAdmin(fixtures),
  }));
  const { handleOgRequest } = await import("./og-middleware.server");
  return handleOgRequest;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/integrations/supabase/client.server");
});

describe("handleOgRequest — /api/og/:slug", () => {
  it("returns a 200 PNG with a non-empty body for a league with real data", async () => {
    const handleOgRequest = await loadHandler(baseFixtures);
    const res = await handleOgRequest("/api/og/gaffers-cup");

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/png");
    const bytes = new Uint8Array(await res!.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("still returns a 200 PNG for a league with no rounds/players yet", async () => {
    const handleOgRequest = await loadHandler({
      league: { id: "l2", name: "Brand New League", tiebreak: "total" },
      rounds: [],
      players: [],
      scores: [],
    });
    const res = await handleOgRequest("/api/og/brand-new");

    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/png");
  });

  it("still returns a 200 PNG placeholder when the league doesn't exist", async () => {
    const handleOgRequest = await loadHandler({ league: null });
    const res = await handleOgRequest("/api/og/does-not-exist");

    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns null for unrelated paths", async () => {
    const handleOgRequest = await loadHandler(baseFixtures);
    const res = await handleOgRequest("/some/other/path");
    expect(res).toBeNull();
  });
});
