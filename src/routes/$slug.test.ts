import { describe, it, expect, vi } from "vitest";
import { Route } from "./$slug";
import type { LeagueMeta } from "@/lib/leagues.functions";

vi.mock("@/lib/leagues.functions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/leagues.functions")>()),
  getLeagueMeta: vi.fn(),
}));
vi.mock("@/lib/locale.functions", () => ({ resolveLocale: vi.fn().mockResolvedValue("en") }));

type MetaTag = { name?: string; property?: string; content?: string };

function metaEntry(meta: (MetaTag | undefined)[], key: string) {
  return meta.find((m) => m?.name === key || m?.property === key)?.content;
}

type LoaderResult = { locale: string; leagueMeta: LeagueMeta | null };
const callLoader = Route.options.loader as unknown as (ctx: {
  params: { slug: string };
}) => Promise<LoaderResult>;

describe("$slug route head()", () => {
  it("uses the league name and a players/round tagline when loader data is present", async () => {
    const leagueMeta: LeagueMeta = {
      name: "The Gaffer's Cup",
      playerCount: 5,
      roundsPlayed: 3,
      totalRounds: 10,
    };
    const result = await Route.options.head!({
      params: { slug: "gaffers-cup" },
      loaderData: { locale: "en", leagueMeta },
    } as never);

    expect(metaEntry(result.meta!, "og:title")).toBe("The Gaffer's Cup");
    expect(metaEntry(result.meta!, "og:description")).toBe("5 players · Round 3 / 10");
    expect(metaEntry(result.meta!, "og:image")).toBe("/api/og/gaffers-cup");
  });

  it("falls back to the generic title/description when the league isn't found", async () => {
    const result = await Route.options.head!({
      params: { slug: "missing" },
      loaderData: { locale: "en", leagueMeta: null },
    } as never);

    expect(metaEntry(result.meta!, "og:title")).toBe("Fantasy Tracker");
    expect(metaEntry(result.meta!, "og:description")).toMatch(/fantasy leagues/i);
  });

  it("falls back gracefully when loaderData itself is absent (e.g. loader threw)", async () => {
    const result = await Route.options.head!({
      params: { slug: "missing" },
      loaderData: undefined,
    } as never);

    expect(metaEntry(result.meta!, "og:title")).toBe("Fantasy Tracker");
  });

  it("omits og:url when VITE_SITE_URL isn't configured", async () => {
    const result = await Route.options.head!({
      params: { slug: "gaffers-cup" },
      loaderData: { locale: "en", leagueMeta: null },
    } as never);

    expect(metaEntry(result.meta!, "og:url")).toBeUndefined();
  });
});

describe("$slug route loader()", () => {
  it("degrades to leagueMeta: null instead of failing the whole page when getLeagueMeta throws", async () => {
    const { getLeagueMeta } = await import("@/lib/leagues.functions");
    vi.mocked(getLeagueMeta).mockRejectedValueOnce(new Error("DB_ERROR"));

    const result = await callLoader({ params: { slug: "gaffers-cup" } });

    expect(result).toEqual({ locale: "en", leagueMeta: null });
  });

  it("passes through leagueMeta when getLeagueMeta succeeds", async () => {
    const { getLeagueMeta } = await import("@/lib/leagues.functions");
    const leagueMeta: LeagueMeta = {
      name: "The Gaffer's Cup",
      playerCount: 5,
      roundsPlayed: 3,
      totalRounds: 10,
    };
    vi.mocked(getLeagueMeta).mockResolvedValueOnce(leagueMeta);

    const result = await callLoader({ params: { slug: "gaffers-cup" } });

    expect(result).toEqual({ locale: "en", leagueMeta });
  });
});
